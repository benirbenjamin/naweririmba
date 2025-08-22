// Advanced Audio Recorder with Metronome and Preview Selector
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
    
    async initializeAudio() {
        try {
            // Initialize audio context for metronome
            this.metronome.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.metronome.gainNode = this.metronome.audioContext.createGain();
            this.metronome.gainNode.connect(this.metronome.audioContext.destination);
            this.metronome.gainNode.gain.value = 0.1; // Low volume for metronome
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
        }
    }
    
    // Set callbacks
    on(event, callback) {
        if (this.callbacks.hasOwnProperty(`on${event.charAt(0).toUpperCase() + event.slice(1)}`)) {
            this.callbacks[`on${event.charAt(0).toUpperCase() + event.slice(1)}`] = callback;
        }
    }
    
    // Configure metronome
    setMetronome(tempo, timeSignature = '4/4') {
        this.metronome.tempo = parseInt(tempo);
        this.metronome.timeSignature = timeSignature;
        this.metronome.currentBeat = 0;
    }
    
    // Start metronome
    startMetronome() {
        if (!this.metronome.audioContext) {
            console.error('Audio context not initialized');
            return;
        }
        
        if (this.metronome.audioContext.state === 'suspended') {
            this.metronome.audioContext.resume();
        }
        
        this.metronome.isPlaying = true;
        this.metronome.currentBeat = 0;
        this.metronome.nextNoteTime = this.metronome.audioContext.currentTime;
        this.scheduleMetronome();
    }
    
    // Stop metronome
    stopMetronome() {
        this.metronome.isPlaying = false;
        if (this.metronome.timerID) {
            clearTimeout(this.metronome.timerID);
            this.metronome.timerID = null;
        }
        this.metronome.currentBeat = 0;
    }
    
    // Schedule metronome beats
    scheduleMetronome() {
        while (this.metronome.nextNoteTime < this.metronome.audioContext.currentTime + this.metronome.scheduleAheadTime) {
            this.playMetronomeClick(this.metronome.nextNoteTime);
            this.nextNote();
        }
        
        if (this.metronome.isPlaying) {
            this.metronome.timerID = setTimeout(() => this.scheduleMetronome(), this.metronome.lookahead);
        }
    }
    
    // Play metronome click sound
    playMetronomeClick(time) {
        const oscillator = this.metronome.audioContext.createOscillator();
        const envelope = this.metronome.audioContext.createGain();
        
        oscillator.connect(envelope);
        envelope.connect(this.metronome.gainNode);
        
        // Different frequencies for different beats
        const [beatsPerMeasure] = this.metronome.timeSignature.split('/').map(Number);
        const isDownbeat = this.metronome.currentBeat === 0;
        
        oscillator.frequency.value = isDownbeat ? 800 : 400; // Higher pitch for downbeat
        oscillator.type = 'square';
        
        envelope.gain.setValueAtTime(0.1, time);
        envelope.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        
        oscillator.start(time);
        oscillator.stop(time + 0.1);
        
        // Trigger callback for visual metronome
        if (this.callbacks.onMetronomeTick) {
            setTimeout(() => {
                this.callbacks.onMetronomeTick(this.metronome.currentBeat, isDownbeat);
            }, (time - this.metronome.audioContext.currentTime) * 1000);
        }
    }
    
    // Calculate next note timing
    nextNote() {
        const secondsPerBeat = 60.0 / this.metronome.tempo;
        this.metronome.nextNoteTime += secondsPerBeat;
        
        const [beatsPerMeasure] = this.metronome.timeSignature.split('/').map(Number);
        this.metronome.currentBeat = (this.metronome.currentBeat + 1) % beatsPerMeasure;
    }
    
    // Request microphone access
    async requestMicrophoneAccess() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }
            });
            return true;
        } catch (error) {
            console.error('Microphone access denied:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Microphone access denied. Please allow microphone access to record.');
            }
            return false;
        }
    }
    
    // Start recording
    async startRecording(withMetronome = false) {
        if (this.isRecording) {
            console.warn('Already recording');
            return false;
        }
        
        if (!this.stream) {
            const hasAccess = await this.requestMicrophoneAccess();
            if (!hasAccess) return false;
        }
        
        try {
            // Reset chunks
            this.audioChunks = [];
            
            // Create MediaRecorder
            const options = {
                mimeType: this.getSupportedMimeType(),
                audioBitsPerSecond: 128000
            };
            
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.recordedBlob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() });
                if (this.callbacks.onRecordingStop) {
                    this.callbacks.onRecordingStop(this.recordedBlob);
                }
            };
            
            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                if (this.callbacks.onError) {
                    this.callbacks.onError('Recording error: ' + event.error.message);
                }
            };
            
            // Start metronome if requested
            if (withMetronome) {
                this.startMetronome();
            }
            
            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;
            this.isPaused = false;
            
            if (this.callbacks.onRecordingStart) {
                this.callbacks.onRecordingStart();
            }
            
            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            if (this.callbacks.onError) {
                this.callbacks.onError('Failed to start recording: ' + error.message);
            }
            return false;
        }
    }
    
    // Stop recording
    stopRecording() {
        if (!this.isRecording) {
            console.warn('Not currently recording');
            return false;
        }
        
        // Stop metronome
        this.stopMetronome();
        
        // Stop recording
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        this.isRecording = false;
        this.isPaused = false;
        
        return true;
    }
    
    // Pause recording
    pauseRecording() {
        if (!this.isRecording || this.isPaused) {
            console.warn('Cannot pause recording');
            return false;
        }
        
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            
            // Pause metronome
            this.stopMetronome();
            
            if (this.callbacks.onRecordingPause) {
                this.callbacks.onRecordingPause();
            }
        }
        
        return true;
    }
    
    // Resume recording
    resumeRecording() {
        if (!this.isRecording || !this.isPaused) {
            console.warn('Cannot resume recording');
            return false;
        }
        
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
            
            // Resume metronome if it was playing
            this.startMetronome();
            
            if (this.callbacks.onRecordingResume) {
                this.callbacks.onRecordingResume();
            }
        }
        
        return true;
    }
    
    // Get supported MIME type
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/wav'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        
        return 'audio/webm'; // fallback
    }
    
    // Get recorded audio blob
    getRecordedBlob() {
        return this.recordedBlob;
    }
    
    // Create download URL
    createDownloadURL() {
        if (this.recordedBlob) {
            return URL.createObjectURL(this.recordedBlob);
        }
        return null;
    }
    
    // Clean up resources
    cleanup() {
        this.stopRecording();
        this.stopMetronome();
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.metronome.audioContext) {
            this.metronome.audioContext.close();
            this.metronome.audioContext = null;
        }
        
        this.audioChunks = [];
        this.recordedBlob = null;
    }
    
    // Get recording state
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            isMetronomeActive: this.metronome.isPlaying,
            tempo: this.metronome.tempo,
            timeSignature: this.metronome.timeSignature,
            currentBeat: this.metronome.currentBeat
        };
    }
}

// Audio Preview Selector for cutting preview segments
class AudioPreviewSelector {
    constructor(audioElement, canvasElement) {
        this.audio = audioElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.isSelecting = false;
        this.selectionStart = 0;
        this.selectionEnd = 45; // Default 45 seconds
        this.duration = 0;
        this.waveformData = [];
        
        this.callbacks = {
            onSelectionChange: null
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Audio events
        this.audio.addEventListener('loadedmetadata', () => {
            this.duration = this.audio.duration;
            this.drawWaveform();
        });
        
        this.audio.addEventListener('timeupdate', () => {
            this.drawWaveform();
        });
        
        // Canvas events for selection
        this.canvas.addEventListener('mousedown', (e) => this.startSelection(e));
        this.canvas.addEventListener('mousemove', (e) => this.updateSelection(e));
        this.canvas.addEventListener('mouseup', () => this.endSelection());
        this.canvas.addEventListener('mouseleave', () => this.endSelection());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.startSelection(e.touches[0]));
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.updateSelection(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.endSelection());
    }
    
    startSelection(e) {
        this.isSelecting = true;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / this.canvas.width) * this.duration;
        this.selectionStart = Math.max(0, Math.min(time, this.duration));
        this.selectionEnd = this.selectionStart;
    }
    
    updateSelection(e) {
        if (!this.isSelecting) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / this.canvas.width) * this.duration;
        this.selectionEnd = Math.max(0, Math.min(time, this.duration));
        
        // Ensure selection is within 60 seconds
        const selectionDuration = Math.abs(this.selectionEnd - this.selectionStart);
        if (selectionDuration > 60) {
            if (this.selectionEnd > this.selectionStart) {
                this.selectionEnd = this.selectionStart + 60;
            } else {
                this.selectionEnd = this.selectionStart - 60;
            }
        }
        
        this.drawWaveform();
    }
    
    endSelection() {
        if (!this.isSelecting) return;
        
        this.isSelecting = false;
        
        // Ensure proper order
        if (this.selectionStart > this.selectionEnd) {
            [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
        }
        
        // Minimum 10 seconds selection
        if (this.selectionEnd - this.selectionStart < 10) {
            this.selectionEnd = Math.min(this.selectionStart + 10, this.duration);
        }
        
        if (this.callbacks.onSelectionChange) {
            this.callbacks.onSelectionChange(this.selectionStart, this.selectionEnd);
        }
        
        this.drawWaveform();
    }
    
    drawWaveform() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);
        
        // Draw background
        this.ctx.fillStyle = '#f8f9fa';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw waveform (simplified representation)
        this.ctx.strokeStyle = '#6c757d';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        const segments = width;
        for (let i = 0; i < segments; i++) {
            const x = (i / segments) * width;
            const amplitude = Math.random() * 0.5 + 0.1; // Simplified waveform
            const y1 = height * 0.5 - (amplitude * height * 0.4);
            const y2 = height * 0.5 + (amplitude * height * 0.4);
            
            this.ctx.moveTo(x, y1);
            this.ctx.lineTo(x, y2);
        }
        this.ctx.stroke();
        
        // Draw selection
        if (this.duration > 0) {
            const startX = (this.selectionStart / this.duration) * width;
            const endX = (this.selectionEnd / this.duration) * width;
            
            this.ctx.fillStyle = 'rgba(0, 123, 255, 0.3)';
            this.ctx.fillRect(startX, 0, endX - startX, height);
            
            // Draw selection borders
            this.ctx.strokeStyle = '#007bff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(startX, 0);
            this.ctx.lineTo(startX, height);
            this.ctx.moveTo(endX, 0);
            this.ctx.lineTo(endX, height);
            this.ctx.stroke();
        }
        
        // Draw current time indicator
        if (this.audio.currentTime > 0 && this.duration > 0) {
            const currentX = (this.audio.currentTime / this.duration) * width;
            this.ctx.strokeStyle = '#dc3545';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(currentX, 0);
            this.ctx.lineTo(currentX, height);
            this.ctx.stroke();
        }
    }
    
    setSelection(start, end) {
        this.selectionStart = Math.max(0, Math.min(start, this.duration));
        this.selectionEnd = Math.max(0, Math.min(end, this.duration));
        this.drawWaveform();
    }
    
    getSelection() {
        return {
            start: this.selectionStart,
            end: this.selectionEnd,
            duration: this.selectionEnd - this.selectionStart
        };
    }
    
    on(event, callback) {
        if (event === 'selectionChange') {
            this.callbacks.onSelectionChange = callback;
        }
    }
}

// Make classes available globally
window.AudioRecorder = AudioRecorder;
window.AudioPreviewSelector = AudioPreviewSelector;
