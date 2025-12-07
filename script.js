class GuitarTuner {
    constructor() {
        // 1. Define State and Configuration
        this.isPlaying = false;
        this.audioContext = null;
        this.analyser = null;
        this.buffer = new Float32Array(2048);

        // Stability Logic (Speed & Low End Fixes)
        this.lastFreq = 0;
        this.stabilityCount = 0;
        this.STABILITY_THRESHOLD = 3; // Low number = Faster detection

        // 2. Define Notes Reference
        this.notes = [
            { note: 'E', freq: 82.41 }, { note: 'A', freq: 110.00 }, { note: 'D', freq: 146.83 },
            { note: 'G', freq: 196.00 }, { note: 'B', freq: 246.94 }, { note: 'E', freq: 329.63 }
        ];

        // 3. Grab UI Elements
        this.elNote = document.getElementById('note');
        this.elFreq = document.getElementById('freq');
        this.elNeedle = document.getElementById('needle');
        this.elStatus = document.getElementById('status');
        this.btnStart = document.getElementById('startBtn');

        // 4. Bind Button Event
        this.btnStart.addEventListener('click', () => this.start());
    }

    async start() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Setup Mic (Noise Suppression OFF for better raw bass signal)
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
            });

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;

            const microphone = this.audioContext.createMediaStreamSource(stream);
            microphone.connect(this.analyser);

            this.isPlaying = true;
            this.btnStart.disabled = true;
            this.btnStart.innerText = "TUNER RUNNING";
            this.elStatus.innerText = "Active. Pluck a string!";

            // Start the Loop
            this.update();

        } catch (err) {
            alert("Microphone Error: " + err.message);
        }
    }

    update() {
        if (!this.isPlaying) return;

        this.analyser.getFloatTimeDomainData(this.buffer);

        // RMS Calculation (Volume Gate)
        let rms = 0;
        for (let i = 0; i < this.buffer.length; i++) rms += this.buffer[i] * this.buffer[i];
        rms = Math.sqrt(rms / this.buffer.length);

        // Threshold Check (0.008 catches decaying strings)
        if (rms > 0.008) {
            const pitch = this.autoCorrelate(this.buffer, this.audioContext.sampleRate);

            // Frequency Range Check (60Hz - 400Hz covers Low E to High E)
            if (pitch !== -1 && pitch > 60 && pitch < 400) {

                // Stability Check (Allows 3Hz wobble for thick strings)
                if (Math.abs(pitch - this.lastFreq) < 3) {
                    this.stabilityCount++;
                } else {
                    this.stabilityCount = 0;
                }

                this.lastFreq = pitch;

                if (this.stabilityCount >= this.STABILITY_THRESHOLD) {
                    this.displayNote(pitch);
                    this.elStatus.innerText = "Signal Locked";
                    this.elStatus.style.color = "#66bb6a";
                }
            }
        } else {
            // Decay stability slowly on silence
            if (this.stabilityCount > 0) this.stabilityCount--;
        }

        requestAnimationFrame(() => this.update());
    }

    displayNote(freq) {
        let closest = this.notes[0];
        let minDiff = Infinity;

        this.notes.forEach(n => {
            let diff = Math.abs(n.freq - freq);
            if (diff < minDiff) { minDiff = diff; closest = n; }
        });

        this.elNote.innerText = closest.note;
        this.elFreq.innerText = freq.toFixed(1) + " Hz";

        let cents = 1200 * Math.log2(freq / closest.freq);
        if (cents > 50) cents = 50;
        if (cents < -50) cents = -50;

        this.elNeedle.style.left = (50 + cents) + "%";
        this.elNeedle.style.background = Math.abs(cents) < 5 ? "#66bb6a" : "#FFD54F";
    }

    autoCorrelate(buf, sampleRate) {
        let SIZE = buf.length;
        let r1 = 0, r2 = SIZE - 1, thres = 0.1;

        // Find signal start
        for (let i = 0; i < SIZE / 2; i++) {
            if (Math.abs(buf[i]) < thres) { r1 = i; break; }
        }
        // Find signal end
        for (let i = 1; i < SIZE / 2; i++) {
            if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
        }

        buf = buf.slice(r1, r2);
        SIZE = buf.length;

        let c = new Array(SIZE).fill(0);
        for (let i = 0; i < SIZE; i++) {
            for (let j = 0; j < SIZE - i; j++) { c[i] = c[i] + buf[j] * buf[j + i]; }
        }

        let d = 0; while (c[d] > c[d + 1]) d++;
        let maxval = -1, maxpos = -1;

        for (let i = d; i < SIZE; i++) {
            if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
        }

        let T0 = maxpos;
        let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
        let a = (x1 + x3 - 2 * x2) / 2;
        let b = (x3 - x1) / 2;

        if (a) T0 = T0 - b / (2 * a);

        return sampleRate / T0;
    }
}

// Initialize the App
const app = new GuitarTuner();