// Advanced Audio Recorder with Metronome
class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.stream = null;
        this.recordedBlob = null;
        
        // Metronome properties
        this.metronome = {
            isPlaying: false,
            tempo: 120, // BPM
            timeSignature: '4/4',
            currentBeat: 0,
            audioContext: null,
            gainNode: null,
            nextNoteTime: 0,
            lookahead: 25.0, // ms
            scheduleAheadTime: 0.1, // seconds
            timerID: null
        };
        
        this.callbacks = {
            onRecordingStart: null,
            onRecordingStop: null,
            onRecordingPause: null,
            onRecordingResume: null,
            onMetronomeTick: null,
            onError: null
        };
        
        this.initializeAudio();
    }

    async initializeRecorder() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(this.recordedBlob);
                const audioElement = document.getElementById('recordedAudio');
                if (audioElement) {
                    audioElement.src = audioUrl;
                    audioElement.style.display = 'block';
                }
                
                // Enable play button
                const playButton = document.getElementById('playRecording');
                if (playButton) playButton.disabled = false;
                
                // Update status
                const status = document.getElementById('recordingStatus');
                if (status) {
                    status.innerHTML = '<span class="text-success">Recording completed successfully!</span>';
                }
            };

            this.setupMetronome();
            this.setupEventListeners();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            const status = document.getElementById('recordingStatus');
            if (status) {
                status.innerHTML = '<span class="text-danger">Error: Could not access microphone</span>';
            }
        }
    }

    setupMetronome(tempo, timeSignature) {
        const [beatsPerBar] = timeSignature.split('/').map(Number);
        const secondsPerBeat = 60.0 / tempo;

        this.metronome = {
            tempo,
            beatsPerBar,
            secondsPerBeat,
            isPlaying: false,
            currentBeat: 0
        };
    }

    startMetronome() {
        if (!this.audioContext) return;

        this.metronome.isPlaying = true;
        const playClick = (time) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = this.metronome.currentBeat === 0 ? 1000 : 800;
            gainNode.gain.value = 0.1;

            oscillator.start(time);
            oscillator.stop(time + 0.1);

            this.metronome.currentBeat = (this.metronome.currentBeat + 1) % this.metronome.beatsPerBar;
        };

        const schedule = () => {
            const currentTime = this.audioContext.currentTime;
            playClick(currentTime);

            if (this.metronome.isPlaying) {
                setTimeout(schedule, this.metronome.secondsPerBeat * 1000);
            }
        };

        schedule();
    }

    stopMetronome() {
        this.metronome.isPlaying = false;
        this.metronome.currentBeat = 0;
    }

    startRecording() {
        if (!this.mediaRecorder) return false;
        
        this.audioChunks = [];
        this.mediaRecorder.start();
        this.isRecording = true;
        this.startMetronome();
        return true;
    }

    async stopRecording() {
        if (!this.mediaRecorder || !this.isRecording) return null;

        return new Promise(resolve => {
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.audioChunks = [];
                this.isRecording = false;
                this.stopMetronome();
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    async createPreview(audioBlob, startTime, endTime) {
        const audioBuffer = await audioBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const originalBuffer = await audioContext.decodeAudioData(audioBuffer);

        const sampleRate = originalBuffer.sampleRate;
        const channels = originalBuffer.numberOfChannels;
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);
        const previewLength = endSample - startSample;

        const previewBuffer = audioContext.createBuffer(channels, previewLength, sampleRate);

        for (let channel = 0; channel < channels; channel++) {
            const originalData = originalBuffer.getChannelData(channel);
            const previewData = previewBuffer.getChannelData(channel);
            
            for (let i = 0; i < previewLength; i++) {
                previewData[i] = originalData[startSample + i];
            }
        }

        return await this.bufferToBlob(previewBuffer);
    }

    async bufferToBlob(audioBuffer) {
        const wavData = this.audioBufferToWav(audioBuffer);
        return new Blob([wavData], { type: 'audio/wav' });
    }

    audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;

        const dataLength = buffer.length * blockAlign;
        const bufferLength = 44 + dataLength;

        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);

        // RIFF identifier
        this.writeString(view, 0, 'RIFF');
        // RIFF chunk length
        view.setUint32(4, 36 + dataLength, true);
        // RIFF type
        this.writeString(view, 8, 'WAVE');
        // format chunk identifier
        this.writeString(view, 12, 'fmt ');
        // format chunk length
        view.setUint32(16, 16, true);
        // sample format (raw)
        view.setUint16(20, format, true);
        // channel count
        view.setUint16(22, numChannels, true);
        // sample rate
        view.setUint32(24, sampleRate, true);
        // byte rate (sample rate * block align)
        view.setUint32(28, sampleRate * blockAlign, true);
        // block align (channel count * bytes per sample)
        view.setUint16(32, blockAlign, true);
        // bits per sample
        view.setUint16(34, bitDepth, true);
        // data chunk identifier
        this.writeString(view, 36, 'data');
        // data chunk length
        view.setUint32(40, dataLength, true);

        const offset = 44;
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = channels[channel][i];
                const value = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset + (i * blockAlign) + (channel * bytesPerSample), value * 0x7FFF, true);
            }
        }

        return arrayBuffer;
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}

// Export for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioRecorder;
} else {
    window.AudioRecorder = AudioRecorder;
}
