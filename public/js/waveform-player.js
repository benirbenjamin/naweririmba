/**
 * WaveSurfer.js Audio Player for Nawe Ririmba Space
 * Handles preview restrictions and waveform visualization
 */

class WaveformPlayer {
    constructor(containerId, options = {}) {
        console.log('WaveformPlayer constructor called with:', containerId, options);
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.wavesurfer = null;
        this.isPreviewMode = options.isPreviewMode || false;
        this.previewDuration = options.previewDuration || 40; // STRICT: 40 seconds max preview
        this.hasPurchased = options.hasPurchased || false;
        this.previewTimer = null;
        this.isPlaying = false;
        this.sessionPlayCount = 0; // Track play attempts
        this.maxSessionPlays = 1; // Allow only 1 play session
        this.previewExhausted = false; // Track if preview is exhausted
        
        this.init();
    }
    
    init() {
        if (!this.container) {
            console.error(`Container with ID ${this.containerId} not found`);
            return;
        }
        
        // Create WaveSurfer instance (v7 API)
        this.wavesurfer = WaveSurfer.create({
            container: this.container,
            waveColor: '#dee2e6',
            progressColor: '#0d6efd',
            backgroundColor: 'transparent',
            barWidth: 2,
            barGap: 1,
            height: 80,
            normalize: true,
            mediaControls: false
        });
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Handle play/pause
        this.wavesurfer.on('play', () => {
            this.isPlaying = true;
            this.updatePlayButton(true);
            
            // STRICT: Increment session play count for preview mode
            if (this.isPreviewMode && !this.hasPurchased) {
                this.sessionPlayCount++;
                this.startPreviewTimer();
            }
        });
        
        this.wavesurfer.on('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton(false);
            this.clearPreviewTimer();
        });
        
        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            this.updatePlayButton(false);
            this.clearPreviewTimer();
        });
        
        // Handle seeking - restrict if in preview mode
        this.wavesurfer.on('seek', (progress) => {
            if (this.isPreviewMode && !this.hasPurchased) {
                const currentTime = progress * this.wavesurfer.getDuration();
                if (currentTime > this.previewDuration) {
                    // Prevent seeking beyond preview duration
                    this.wavesurfer.seekTo(this.previewDuration / this.wavesurfer.getDuration());
                    this.showPreviewLimitMessage();
                }
            }
        });
        
        // Handle loading states
        this.wavesurfer.on('loading', (percent) => {
            this.updateLoadingState(percent);
        });
        
        this.wavesurfer.on('ready', () => {
            this.updateLoadingState(100);
            this.setupPreviewRestriction();
        });
        
        this.wavesurfer.on('error', (error) => {
            console.error('WaveSurfer error:', error);
            this.showError('Error loading audio file');
        });
    }
    
    setupPreviewRestriction() {
        if (this.isPreviewMode && !this.hasPurchased) {
            const duration = this.wavesurfer.getDuration();
            if (duration > this.previewDuration) {
                // Add visual indicator for preview limit
                this.addPreviewMarker();
            }
        }
    }
    
    addPreviewMarker() {
        const duration = this.wavesurfer.getDuration();
        const previewProgress = this.previewDuration / duration;
        
        // Create a visual marker at the preview limit
        const waveContainer = this.container.querySelector('wave');
        if (waveContainer) {
            const marker = document.createElement('div');
            marker.className = 'preview-marker';
            marker.style.cssText = `
                position: absolute;
                top: 0;
                bottom: 0;
                left: ${previewProgress * 100}%;
                width: 2px;
                background-color: #dc3545;
                z-index: 10;
                pointer-events: none;
            `;
            marker.title = 'Preview limit';
            
            waveContainer.style.position = 'relative';
            waveContainer.appendChild(marker);
        }
    }
    
    startPreviewTimer() {
        this.clearPreviewTimer();
        
        this.previewTimer = setTimeout(() => {
            if (this.isPlaying) {
                this.wavesurfer.pause();
                this.showPreviewLimitMessage();
            }
        }, this.previewDuration * 1000);
    }
    
    clearPreviewTimer() {
        if (this.previewTimer) {
            clearTimeout(this.previewTimer);
            this.previewTimer = null;
        }
    }
    
    showPreviewLimitMessage() {
        this.previewExhausted = true;
        const message = document.createElement('div');
        message.className = 'preview-limit-message alert alert-info mt-2';
        message.innerHTML = `
            <i class="bi bi-info-circle me-2"></i>
            <strong>40-second preview completed!</strong> 
            Purchase this song to listen to the full track and download.
        `;
        
        // Remove any existing messages
        const existingMessage = this.container.parentNode.querySelector('.preview-limit-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Add new message
        this.container.parentNode.appendChild(message);
        
        // Disable play button
        const playBtn = document.getElementById('waveform-play-btn');
        if (playBtn) {
            playBtn.disabled = true;
            playBtn.innerHTML = '<i class="bi bi-lock-fill"></i> Preview Exhausted';
            playBtn.classList.remove('btn-primary', 'btn-secondary');
            playBtn.classList.add('btn-outline-secondary');
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 5000);
    }
    
    showMaxPlaysMessage() {
        const message = document.createElement('div');
        message.className = 'max-plays-message alert alert-warning mt-2';
        message.innerHTML = `
            <i class="bi bi-exclamation-triangle me-2"></i>
            <strong>Maximum preview plays reached!</strong> 
            Purchase this song to listen unlimited times.
        `;
        
        // Remove any existing messages
        const existingMessage = this.container.parentNode.querySelector('.max-plays-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Add new message
        this.container.parentNode.appendChild(message);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (message.parentNode) {
                message.remove();
            }
        }, 5000);
    }
    
    updatePlayButton(isPlaying) {
        const playBtn = document.getElementById('waveform-play-btn');
        if (playBtn) {
            if (isPlaying) {
                playBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
                playBtn.classList.remove('btn-primary');
                playBtn.classList.add('btn-secondary');
            } else {
                playBtn.innerHTML = '<i class="bi bi-play-fill"></i> Play Preview';
                playBtn.classList.remove('btn-secondary');
                playBtn.classList.add('btn-primary');
            }
        }
    }
    
    updateLoadingState(percent) {
        const loadingIndicator = document.getElementById('waveform-loading');
        if (loadingIndicator) {
            if (percent < 100) {
                loadingIndicator.style.display = 'block';
                loadingIndicator.textContent = `Loading... ${percent}%`;
            } else {
                loadingIndicator.style.display = 'none';
            }
        }
    }
    
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger mt-2';
        errorDiv.textContent = message;
        
        this.container.parentNode.appendChild(errorDiv);
    }
    
    loadAudio(audioUrl) {
        console.log('Loading audio:', audioUrl);
        if (this.wavesurfer) {
            this.wavesurfer.load(audioUrl);
        } else {
            console.error('WaveSurfer not initialized');
        }
    }
    
    play() {
        // STRICT: Check session play limits for preview mode
        if (this.isPreviewMode && !this.hasPurchased) {
            if (this.previewExhausted) {
                this.showPreviewLimitMessage();
                return;
            }
            
            if (this.sessionPlayCount >= this.maxSessionPlays) {
                this.showMaxPlaysMessage();
                return;
            }
        }
        
        if (this.wavesurfer && !this.isPlaying) {
            this.wavesurfer.play();
        }
    }
    
    pause() {
        if (this.wavesurfer && this.isPlaying) {
            this.wavesurfer.pause();
        }
    }
    
    toggle() {
        if (this.wavesurfer) {
            this.wavesurfer.playPause();
        }
    }
    
    destroy() {
        this.clearPreviewTimer();
        if (this.wavesurfer) {
            this.wavesurfer.destroy();
        }
    }
}

// Global instance for easy access
window.WaveformPlayer = WaveformPlayer;

// Utility function to initialize player on song pages
window.initWaveformPlayer = function(audioUrl, options = {}) {
    console.log('Initializing waveform player with URL:', audioUrl);
    console.log('Options:', options);
    
    const player = new WaveformPlayer('waveform-container', options);
    player.loadAudio(audioUrl);
    
    // Set up play button
    const playBtn = document.getElementById('waveform-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            console.log('Play button clicked');
            player.toggle();
        });
    } else {
        console.error('Play button not found');
    }
    
    return player;
};
