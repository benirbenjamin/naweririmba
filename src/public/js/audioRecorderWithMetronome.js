class AudioRecorderWithMetronome {
    constructor(options = {}) {
        this.audioContext = null;
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.analyser = null;
        this.dataArray = null;
        this.canvas = null;
        this.canvasContext = null;
        this.animationId = null;
        
        // Metronome properties
        this.metronomeContext = null;
        this.tempo = options.tempo || 120; // BPM
        this.timeSignature = options.timeSignature || '4/4';
        this.isMetronomeActive = false;
        this.metronomeInterval = null;
        this.beatCount = 0;
        this.clickBuffer = null;
        
        // Recording properties
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.maxRecordingTime = options.maxRecordingTime || 300; // 5 minutes default
        this.autoStopTimer = null;
        
        // Callbacks
        this.onRecordingStart = options.onRecordingStart || (() => {});
        this.onRecordingStop = options.onRecordingStop || (() => {});
        this.onRecordingProgress = options.onRecordingProgress || (() => {});
        this.onError = options.onError || (() => {});
        
        this.init();
    }

    async init() {
        try {
            // Initialize audio contexts
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.metronomeContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create metronome click sound
            await this.createClickSound();
            
            console.log('Audio recorder with metronome initialized');
        } catch (error) {
            console.error('Failed to initialize audio recorder:', error);
            this.onError(error);
        }
    }

    async createClickSound() {
        try {
            // Create a simple click sound using oscillator
            const sampleRate = this.metronomeContext.sampleRate;
            const clickDuration = 0.1; // 100ms click
            const bufferLength = sampleRate * clickDuration;
            
            this.clickBuffer = this.metronomeContext.createBuffer(1, bufferLength, sampleRate);
            const channelData = this.clickBuffer.getChannelData(0);
            
            // Generate a simple click sound (short beep)
            for (let i = 0; i < bufferLength; i++) {
                const t = i / sampleRate;
                // High frequency for accent beat, lower for regular beats
                const frequency = this.beatCount % this.getBeatsPerMeasure() === 0 ? 800 : 400;
                channelData[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 10);
            }
        } catch (error) {
            console.error('Failed to create click sound:', error);
        }
    }

    getBeatsPerMeasure() {
        const [numerator] = this.timeSignature.split('/');
        return parseInt(numerator);
    }

    startMetronome() {
        if (this.isMetronomeActive) return;
        
        this.isMetronomeActive = true;
        this.beatCount = 0;
        
        const intervalMs = (60 / this.tempo) * 1000;
        
        this.metronomeInterval = setInterval(() => {
            this.playClick();
            this.beatCount++;
            
            // Visual feedback for metronome
            this.updateMetronomeVisual();
        }, intervalMs);
        
        console.log(`Metronome started: ${this.tempo} BPM, ${this.timeSignature}`);
    }

    stopMetronome() {
        if (!this.isMetronomeActive) return;
        
        this.isMetronomeActive = false;
        if (this.metronomeInterval) {
            clearInterval(this.metronomeInterval);
            this.metronomeInterval = null;
        }
        
        console.log('Metronome stopped');
    }

    playClick() {
        if (!this.clickBuffer || !this.metronomeContext) return;
        
        try {
            const source = this.metronomeContext.createBufferSource();
            const gainNode = this.metronomeContext.createGain();
            
            source.buffer = this.clickBuffer;
            
            // Accent the first beat of each measure
            const isAccentBeat = this.beatCount % this.getBeatsPerMeasure() === 0;
            gainNode.gain.value = isAccentBeat ? 0.8 : 0.5;
            
            source.connect(gainNode);
            gainNode.connect(this.metronomeContext.destination);
            
            source.start();
        } catch (error) {
            console.error('Failed to play metronome click:', error);
        }
    }

    updateMetronomeVisual() {
        const beat = (this.beatCount % this.getBeatsPerMeasure()) + 1;
        const measure = Math.floor(this.beatCount / this.getBeatsPerMeasure()) + 1;
        
        // Update metronome display
        const metronomeDisplay = document.getElementById('metronomeDisplay');
        if (metronomeDisplay) {
            metronomeDisplay.innerHTML = `
                <div class="metronome-info">
                    <div class="tempo">${this.tempo} BPM</div>
                    <div class="time-signature">${this.timeSignature}</div>
                    <div class="beat-counter">Beat ${beat} | Measure ${measure}</div>
                </div>
            `;
        }
        
        // Visual beat indicator
        const beatIndicator = document.getElementById('beatIndicator');
        if (beatIndicator) {
            beatIndicator.classList.add('active');
            setTimeout(() => {
                beatIndicator.classList.remove('active');
            }, 100);
        }
    }

    async startRecording() {
        try {
            if (this.isRecording) return;
            
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            // Create analyser for waveform visualization
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            source.connect(this.analyser);
            
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Setup media recorder
            this.mediaRecorder = new MediaRecorder(this.mediaStream, {
                mimeType: 'audio/webm; codecs=opus'
            });
            
            this.recordedChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };
            
            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Start auto-stop timer
            this.autoStopTimer = setTimeout(() => {
                this.stopRecording();
            }, this.maxRecordingTime * 1000);
            
            // Start waveform visualization
            this.startVisualization();
            
            // Start progress tracking
            this.startProgressTracking();
            
            this.onRecordingStart();
            console.log('Recording started');
            
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.onError(error);
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
            this.autoStopTimer = null;
        }
        
        this.stopVisualization();
        this.stopMetronome();
        
        console.log('Recording stopped');
    }

    processRecording() {
        try {
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            const duration = (Date.now() - this.recordingStartTime) / 1000;
            
            // Create audio URL for playback
            const audioUrl = URL.createObjectURL(blob);
            
            this.onRecordingStop({
                blob: blob,
                url: audioUrl,
                duration: duration,
                mimeType: 'audio/webm'
            });
            
        } catch (error) {
            console.error('Failed to process recording:', error);
            this.onError(error);
        }
    }

    startVisualization() {
        if (!this.canvas) {
            this.canvas = document.getElementById('recordingWaveform');
            if (this.canvas) {
                this.canvasContext = this.canvas.getContext('2d');
            }
        }
        
        if (!this.canvas || !this.canvasContext) return;
        
        const draw = () => {
            if (!this.isRecording) return;
            
            this.animationId = requestAnimationFrame(draw);
            
            this.analyser.getByteTimeDomainData(this.dataArray);
            
            this.canvasContext.fillStyle = 'rgb(240, 240, 240)';
            this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.canvasContext.lineWidth = 2;
            this.canvasContext.strokeStyle = 'rgb(0, 123, 255)';
            this.canvasContext.beginPath();
            
            const sliceWidth = this.canvas.width / this.dataArray.length;
            let x = 0;
            
            for (let i = 0; i < this.dataArray.length; i++) {
                const v = this.dataArray[i] / 128.0;
                const y = v * this.canvas.height / 2;
                
                if (i === 0) {
                    this.canvasContext.moveTo(x, y);
                } else {
                    this.canvasContext.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            this.canvasContext.stroke();
        };
        
        draw();
    }

    stopVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    startProgressTracking() {
        const progressInterval = setInterval(() => {
            if (!this.isRecording) {
                clearInterval(progressInterval);
                return;
            }
            
            const elapsed = (Date.now() - this.recordingStartTime) / 1000;
            const remaining = this.maxRecordingTime - elapsed;
            
            this.onRecordingProgress({
                elapsed: elapsed,
                remaining: Math.max(0, remaining),
                percentage: (elapsed / this.maxRecordingTime) * 100
            });
            
        }, 100);
    }

    setTempo(tempo) {
        this.tempo = Math.max(60, Math.min(200, tempo));
        if (this.isMetronomeActive) {
            this.stopMetronome();
            this.startMetronome();
        }
    }

    setTimeSignature(timeSignature) {
        this.timeSignature = timeSignature;
        this.beatCount = 0;
    }

    // Convert WebM to MP3 (basic conversion, may need server-side processing for better quality)
    async convertToMp3(webmBlob) {
        // Note: This is a placeholder. For production, you might want to:
        // 1. Send the WebM to server for conversion using FFmpeg
        // 2. Use a JavaScript library like lamejs for client-side conversion
        // 3. Or keep as WebM and handle on the backend
        
        console.log('WebM to MP3 conversion would be implemented here');
        return webmBlob; // For now, return as-is
    }

    destroy() {
        this.stopRecording();
        this.stopMetronome();
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        if (this.metronomeContext) {
            this.metronomeContext.close();
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioRecorderWithMetronome;
} else {
    window.AudioRecorderWithMetronome = AudioRecorderWithMetronome;
}
