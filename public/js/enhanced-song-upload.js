class EnhancedSongUploader {
    constructor() {
        this.wavesurfer = null;
        this.previewWavesurfer = null;
        this.currentAudioFile = null;
        this.audioBlob = null;
        this.previewRegion = null;
        
        this.initializeUploader();
        this.setupEventListeners();
    }

    initializeUploader() {
        // Initialize WaveSurfer for main audio
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4F46E5',
            progressColor: '#7C3AED',
            cursorColor: '#EF4444',
            barWidth: 3,
            barRadius: 3,
            responsive: true,
            height: 80,
            normalize: true,
            backend: 'WebAudio',
            mediaControls: false
        });

        // Initialize preview WaveSurfer
        this.previewWavesurfer = WaveSurfer.create({
            container: '#previewWaveform',
            waveColor: '#10B981',
            progressColor: '#059669',
            cursorColor: '#EF4444',
            barWidth: 2,
            barRadius: 2,
            responsive: true,
            height: 60,
            normalize: true,
            backend: 'WebAudio',
            mediaControls: false
        });

        this.setupWaveSurferEvents();
    }

    setupWaveSurferEvents() {
        // Main waveform events
        this.wavesurfer.on('ready', () => {
            this.onAudioReady();
        });

        this.wavesurfer.on('audioprocess', () => {
            this.updateTimeDisplay();
        });

        this.wavesurfer.on('seek', () => {
            this.updateTimeDisplay();
        });

        this.wavesurfer.on('finish', () => {
            this.onAudioFinish();
        });

        // Preview waveform events
        this.previewWavesurfer.on('ready', () => {
            document.getElementById('previewWaveform').style.display = 'block';
        });
    }

    setupEventListeners() {
        // Upload method selection
        const uploadMethodRadios = document.querySelectorAll('input[name="uploadMethod"]');
        uploadMethodRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleUploadMethod(e.target.value);
            });
        });

        // File input and drag & drop
        this.setupFileUpload();

        // Audio controls
        this.setupAudioControls();

        // Preview controls
        this.setupPreviewControls();

        // Form submission
        this.setupFormSubmission();
    }

    setupFileUpload() {
        const audioFileInput = document.getElementById('audioFileInput');
        const dropZone = document.getElementById('dropZone');

        // File input change
        audioFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFileUpload(file);
            }
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (this.isValidAudioFile(file)) {
                    this.handleFileUpload(file);
                } else {
                    alert('Please upload a valid audio file (MP3, WAV, AAC, M4A, OGG)');
                }
            }
        });

        // Click to browse
        dropZone.addEventListener('click', (e) => {
            if (e.target === dropZone || e.target.closest('#dropZoneContent')) {
                audioFileInput.click();
            }
        });
    }

    setupAudioControls() {
        // Play/Pause button
        const playPauseBtn = document.getElementById('playPauseBtn');
        playPauseBtn.addEventListener('click', () => {
            this.togglePlayPause();
        });

        // Stop button
        const stopBtn = document.getElementById('stopBtn');
        stopBtn.addEventListener('click', () => {
            this.stopAudio();
        });

        // Volume slider
        const volumeSlider = document.getElementById('volumeSlider');
        volumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.wavesurfer.setVolume(volume);
        });
    }

    setupPreviewControls() {
        // Set current time buttons
        document.getElementById('setStartBtn').addEventListener('click', () => {
            const currentTime = this.wavesurfer.getCurrentTime();
            document.getElementById('previewStart').value = currentTime.toFixed(1);
        });

        document.getElementById('setEndBtn').addEventListener('click', () => {
            const currentTime = this.wavesurfer.getCurrentTime();
            document.getElementById('previewEnd').value = currentTime.toFixed(1);
        });

        // Preview button
        document.getElementById('previewBtn').addEventListener('click', () => {
            this.previewSelection();
        });

        // Generate preview button
        document.getElementById('generatePreviewBtn').addEventListener('click', () => {
            this.generatePreview();
        });

        // Preview time inputs
        document.getElementById('previewStart').addEventListener('input', () => {
            this.validatePreviewTimes();
        });

        document.getElementById('previewEnd').addEventListener('input', () => {
            this.validatePreviewTimes();
        });
    }

    setupFormSubmission() {
        const form = document.getElementById('uploadForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitForm();
        });
    }

    toggleUploadMethod(method) {
        const fileUploadSection = document.getElementById('fileUploadSection');
        const recordingSection = document.getElementById('recordingSection');

        if (method === 'file') {
            fileUploadSection.style.display = 'block';
            recordingSection.style.display = 'none';
        } else {
            fileUploadSection.style.display = 'none';
            recordingSection.style.display = 'block';
        }
    }

    isValidAudioFile(file) {
        const validTypes = [
            'audio/mp3', 
            'audio/mpeg', 
            'audio/wav', 
            'audio/aac', 
            'audio/m4a',
            'audio/mp4',     // M4A
            'audio/x-m4a',   // M4A alternative
            'audio/ogg',
            'audio/vorbis'   // OGG Vorbis
        ];
        const validExtensions = ['.mp3', '.wav', '.aac', '.m4a', '.ogg'];
        
        console.log('File validation:', {
            name: file.name,
            type: file.type,
            size: file.size
        });
        
        const isValid = validTypes.includes(file.type) || 
               validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
               
        console.log('File validation result:', isValid);
        return isValid;
    }

    async handleFileUpload(file) {
        if (!this.isValidAudioFile(file)) {
            alert('Invalid file type. Please upload MP3, WAV, AAC, M4A, or OGG files only.');
            return;
        }

        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            alert('File size must be less than 50MB');
            return;
        }

        this.currentAudioFile = file;
        this.updateDropZoneContent(file.name);
        
        try {
            // Load the audio file into WaveSurfer
            const arrayBuffer = await file.arrayBuffer();
            await this.wavesurfer.loadBlob(file);
            
            // Show audio player section
            document.getElementById('audioPlayerSection').style.display = 'block';
            
        } catch (error) {
            console.error('Error loading audio file:', error);
            alert('Error loading audio file. Please try again.');
        }
    }

    async loadAudioFromBlob(blob) {
        this.audioBlob = blob;
        
        try {
            await this.wavesurfer.loadBlob(blob);
            document.getElementById('audioPlayerSection').style.display = 'block';
            
        } catch (error) {
            console.error('Error loading recorded audio:', error);
        }
    }

    updateDropZoneContent(filename) {
        const dropZoneContent = document.getElementById('dropZoneContent');
        dropZoneContent.innerHTML = `
            <i class="bi bi-check-circle-fill display-1 text-success mb-3"></i>
            <h5>File Selected</h5>
            <p class="text-muted">${filename}</p>
            <button type="button" class="btn btn-outline-primary" onclick="document.getElementById('audioFileInput').click()">
                <i class="bi bi-arrow-repeat"></i> Choose Different File
            </button>
        `;
    }

    onAudioReady() {
        const duration = this.wavesurfer.getDuration();
        this.updateTotalTime(duration);
        
        // Set default preview end time
        const previewEndInput = document.getElementById('previewEnd');
        if (previewEndInput.value == 45 || previewEndInput.value == '') {
            previewEndInput.value = Math.min(45, duration).toFixed(1);
        }
        
        // Show preview section
        document.getElementById('previewSection').style.display = 'block';
        
        this.validatePreviewTimes();
    }

    togglePlayPause() {
        if (this.wavesurfer.isPlaying()) {
            this.wavesurfer.pause();
            this.updatePlayButton(false);
        } else {
            this.wavesurfer.play();
            this.updatePlayButton(true);
        }
    }

    stopAudio() {
        this.wavesurfer.stop();
        this.updatePlayButton(false);
    }

    onAudioFinish() {
        this.updatePlayButton(false);
    }

    updatePlayButton(playing) {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const icon = playPauseBtn.querySelector('i');
        
        if (playing) {
            icon.className = 'bi bi-pause-fill';
        } else {
            icon.className = 'bi bi-play-fill';
        }
    }

    updateTimeDisplay() {
        const currentTime = this.wavesurfer.getCurrentTime();
        document.getElementById('currentTime').textContent = this.formatTime(currentTime);
    }

    updateTotalTime(duration) {
        document.getElementById('totalTime').textContent = this.formatTime(duration);
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    validatePreviewTimes() {
        const startTime = parseFloat(document.getElementById('previewStart').value);
        const endTime = parseFloat(document.getElementById('previewEnd').value);
        const duration = this.wavesurfer.getDuration();
        
        let valid = true;
        
        if (startTime < 0 || startTime >= duration) {
            valid = false;
        }
        
        if (endTime <= startTime || endTime > duration) {
            valid = false;
        }
        
        if (endTime - startTime < 30 || endTime - startTime > 60) {
            valid = false;
        }
        
        // Enable/disable preview buttons
        document.getElementById('previewBtn').disabled = !valid;
        document.getElementById('generatePreviewBtn').disabled = !valid;
        
        return valid;
    }

    previewSelection() {
        if (!this.validatePreviewTimes()) return;
        
        const startTime = parseFloat(document.getElementById('previewStart').value);
        const endTime = parseFloat(document.getElementById('previewEnd').value);
        
        this.wavesurfer.seekTo(startTime / this.wavesurfer.getDuration());
        this.wavesurfer.play();
        
        // Stop at end time
        const checkTime = () => {
            if (this.wavesurfer.getCurrentTime() >= endTime) {
                this.wavesurfer.pause();
            } else if (this.wavesurfer.isPlaying()) {
                requestAnimationFrame(checkTime);
            }
        };
        checkTime();
    }

    async generatePreview() {
        if (!this.validatePreviewTimes()) return;
        
        const startTime = parseFloat(document.getElementById('previewStart').value);
        const endTime = parseFloat(document.getElementById('previewEnd').value);
        
        try {
            // Get the audio source (file or blob)
            const audioSource = this.currentAudioFile || this.audioBlob;
            if (!audioSource) {
                alert('No audio source available');
                return;
            }
            
            // Load preview into preview waveform
            const arrayBuffer = await audioSource.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Create preview buffer
            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(startTime * sampleRate);
            const endSample = Math.floor(endTime * sampleRate);
            const previewLength = endSample - startSample;
            
            const previewBuffer = audioContext.createBuffer(
                audioBuffer.numberOfChannels,
                previewLength,
                sampleRate
            );
            
            // Copy audio data
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const originalData = audioBuffer.getChannelData(channel);
                const previewData = previewBuffer.getChannelData(channel);
                
                for (let i = 0; i < previewLength; i++) {
                    previewData[i] = originalData[startSample + i] || 0;
                }
            }
            
            // Convert to blob and load into preview waveform
            const previewBlob = await this.audioBufferToBlob(previewBuffer);
            await this.previewWavesurfer.loadBlob(previewBlob);
            
            // Store preview data for upload
            document.getElementById('previewStartData').value = startTime;
            document.getElementById('previewEndData').value = endTime;
            
            // Enable submit button
            document.getElementById('submitBtn').disabled = false;
            
            alert('Preview generated successfully! You can now submit your song.');
            
        } catch (error) {
            console.error('Error generating preview:', error);
            alert('Error generating preview. Please try again.');
        }
    }

    async audioBufferToBlob(audioBuffer) {
        // Simple WAV encoding
        const length = audioBuffer.length;
        const numberOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * numberOfChannels * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * numberOfChannels * 2, true);
        
        // Audio data
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample * 0x7FFF, true);
                offset += 2;
            }
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    async submitForm() {
        const form = document.getElementById('uploadForm');
        const formData = new FormData(form);
        
        // Add the audio file
        if (this.currentAudioFile) {
            formData.set('audio', this.currentAudioFile);
        } else if (this.audioBlob) {
            formData.set('audio', this.audioBlob, 'recorded-audio.webm');
        }
        
        // Add recording data if from recording
        if (window.enhancedRecorder && window.enhancedRecorder.getRecordedBlob()) {
            formData.set('tempo', document.getElementById('tempoRange').value);
            formData.set('time_signature', document.getElementById('timeSignature').value);
        }
        
        try {
            // Disable submit button
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="bi bi-upload"></i> Uploading...';
            
            const response = await fetch('/songs', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                alert('Song uploaded successfully!');
                window.location.href = '/songs';
            } else {
                const errorData = await response.text();
                alert('Upload failed: ' + errorData);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            alert('Upload failed. Please try again.');
        } finally {
            // Re-enable submit button
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-upload"></i> Upload Song';
        }
    }
}

// Initialize the enhanced uploader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.enhancedUploader = new EnhancedSongUploader();
});
