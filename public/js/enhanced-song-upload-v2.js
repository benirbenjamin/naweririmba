// Code to add in your enhanced-song-upload-v2.js file for the improved preview selector

// Initialize the preview section with a proper region selector
function initializePreviewSelector(waveform) {
    const wsRegions = waveform.registerPlugin(WaveSurfer.regions.create());
    
    // Create initial region (45 seconds)
    let totalDuration = waveform.getDuration();
    let initialEnd = Math.min(totalDuration, 45); // Default 45 seconds or total duration if shorter
    
    // Create the initial region
    const region = wsRegions.addRegion({
        start: 0,
        end: initialEnd,
        color: 'rgba(40, 167, 69, 0.2)',
        drag: true,
        resize: true,
    });
    
    // Add custom handles to the region
    addCustomHandlesToRegion(region);
    
    // Update the input fields and duration display
    updatePreviewTimeInputs(region.start, region.end);
    
    // Event listeners for region interactions
    region.on('update-end', () => {
        const duration = region.end - region.start;
        
        // Apply constraints
        if (duration < 45) {
            // Too short - extend the end if possible
            if (region.end + (45 - duration) <= totalDuration) {
                region.end = region.start + 45;
            } else {
                // Move the start earlier instead
                region.start = Math.max(0, region.end - 45);
            }
            region.element.classList.add('region-too-short');
            setTimeout(() => region.element.classList.remove('region-too-short'), 1000);
        } else if (duration > 60) {
            // Too long - shorten from the end
            region.end = region.start + 60;
            region.element.classList.add('region-too-long');
            setTimeout(() => region.element.classList.remove('region-too-long'), 1000);
        }
        
        // Update UI after constraints applied
        updatePreviewTimeInputs(region.start, region.end);
        
        // Enable preview and generation buttons
        document.getElementById('previewBtn').disabled = false;
        document.getElementById('generatePreviewBtn').disabled = false;
    });
    
    // Handle manual input changes
    document.getElementById('previewStart').addEventListener('change', function() {
        let start = parseFloat(this.value);
        let end = parseFloat(document.getElementById('previewEnd').value);
        
        // Apply constraints
        if (end - start < 45) {
            end = Math.min(totalDuration, start + 45);
        } else if (end - start > 60) {
            end = start + 60;
        }
        
        region.update({
            start: start,
            end: end
        });
        
        updatePreviewTimeInputs(start, end);
    });
    
    document.getElementById('previewEnd').addEventListener('change', function() {
        let start = parseFloat(document.getElementById('previewStart').value);
        let end = parseFloat(this.value);
        
        // Apply constraints
        if (end - start < 45) {
            start = Math.max(0, end - 45);
        } else if (end - start > 60) {
            start = end - 60;
        }
        
        region.update({
            start: start,
            end: end
        });
        
        updatePreviewTimeInputs(start, end);
    });
    
    // Reset selection button
    document.getElementById('resetSelectionBtn').addEventListener('click', function() {
        const bestStart = findBestPreviewStart(waveform, 45);
        region.update({
            start: bestStart,
            end: bestStart + 45
        });
        updatePreviewTimeInputs(bestStart, bestStart + 45);
    });
    
    // Preview button
    document.getElementById('previewBtn').addEventListener('click', function() {
        // Stop playback if already playing
        if (waveform.isPlaying()) {
            waveform.pause();
            this.innerHTML = '<i class="bi bi-play"></i> Preview Selection';
            return;
        }
        
        // Play the selected region
        waveform.play(region.start, region.end);
        this.innerHTML = '<i class="bi bi-pause"></i> Pause Preview';
        
        // Add playback tracking
        const playbackTracker = setInterval(() => {
            const currentTime = waveform.getCurrentTime();
            if (currentTime >= region.end || !waveform.isPlaying()) {
                clearInterval(playbackTracker);
                this.innerHTML = '<i class="bi bi-play"></i> Preview Selection';
            }
            
            // Update position marker
            updatePositionMarker(currentTime);
        }, 100);
    });
    
    // Return the region for external use
    return {
        region: region,
        wsRegions: wsRegions
    };
}

// Add custom resize handles to the region for better usability
function addCustomHandlesToRegion(region) {
    // Get the region element after a short delay to ensure it's in the DOM
    setTimeout(() => {
        const regionElement = region.element;
        if (!regionElement) return;
        
        // Create and add left handle
        const leftHandle = document.createElement('div');
        leftHandle.className = 'region-handle left';
        regionElement.appendChild(leftHandle);
        
        // Create and add right handle
        const rightHandle = document.createElement('div');
        rightHandle.className = 'region-handle right';
        regionElement.appendChild(rightHandle);
        
        // Add tooltip to region element
        regionElement.setAttribute('title', 'Drag to move, drag edges to resize (45-60 sec)');
    }, 100);
}

// Update the time input fields and duration display
function updatePreviewTimeInputs(start, end) {
    const startInput = document.getElementById('previewStart');
    const endInput = document.getElementById('previewEnd');
    const durationDisplay = document.getElementById('previewDuration');
    const startLabel = document.getElementById('previewStartLabel');
    const endLabel = document.getElementById('previewEndLabel');
    const statusElement = document.getElementById('previewStatus');
    
    // Update input values
    startInput.value = start.toFixed(1);
    endInput.value = end.toFixed(1);
    
    // Update duration display
    const duration = end - start;
    durationDisplay.textContent = duration.toFixed(1) + 's';
    
    // Update time labels with formatted time
    startLabel.textContent = formatTime(start);
    endLabel.textContent = formatTime(end);
    
    // Update status message
    if (duration < 45) {
        statusElement.textContent = 'Selection too short (min 45s)';
        statusElement.className = 'text-danger';
    } else if (duration > 60) {
        statusElement.textContent = 'Selection too long (max 60s)';
        statusElement.className = 'text-warning';
    } else {
        statusElement.textContent = `${Math.round(duration)}s preview selected`;
        statusElement.className = 'text-success';
    }
    
    // Update hidden form fields
    document.getElementById('previewStartData').value = start;
    document.getElementById('previewEndData').value = end;
}

// Format time in mm:ss format
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Update the position marker during playback
function updatePositionMarker(currentTime) {
    const marker = document.getElementById('currentPositionMarker');
    if (!marker) return;
    
    const totalDuration = window.mainWaveform ? window.mainWaveform.getDuration() : 100;
    const position = (currentTime / totalDuration) * 100;
    
    marker.style.display = 'block';
    marker.style.left = `${position}%`;
}

// Find the best starting point for preview (e.g., detect where music starts)
function findBestPreviewStart(waveform, duration) {
    // In a real implementation, this could analyze the audio to find a good starting point
    // For now, we'll use a simple approach - find a point with reasonable amplitude
    const totalDuration = waveform.getDuration();
    
    // Default to the beginning if the track is short
    if (totalDuration <= duration) {
        return 0;
    }
    
    // For simplicity, start at 1/4 of the song or at 0 if the song is short
    return Math.min(totalDuration / 4, totalDuration - duration);
}
