document.addEventListener('DOMContentLoaded', function() {
    // Audio preview functionality
    const audioInput = document.querySelector('input[name="audio"]');
    const audioPreview = document.getElementById('audioPreview');
    const generatePreviewBtn = document.getElementById('generatePreview');
    const previewStartInput = document.querySelector('input[name="preview_start"]');
    const previewEndInput = document.querySelector('input[name="preview_end"]');
    
    let currentAudioFile = null;
    let generatedPreviewBlob = null;

    // Audio preview generator using Web Audio API
    class AudioPreviewGenerator {
        constructor() {
            this.audioContext = null;
        }

        async init() {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        async generatePreview(audioFile, startTime, endTime) {
            if (!this.audioContext) {
                await this.init();
            }

            const arrayBuffer = await audioFile.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(startTime * sampleRate);
            const endSample = Math.floor(endTime * sampleRate);
            const previewLength = endSample - startSample;
            
            // Create new buffer for preview
            const previewBuffer = this.audioContext.createBuffer(
                audioBuffer.numberOfChannels,
                previewLength,
                sampleRate
            );
            
            // Copy audio data for the preview segment
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const originalData = audioBuffer.getChannelData(channel);
                const previewData = previewBuffer.getChannelData(channel);
                
                for (let i = 0; i < previewLength; i++) {
                    previewData[i] = originalData[startSample + i] || 0;
                }
            }
            
            // Convert buffer to blob
            return this.bufferToBlob(previewBuffer);
        }

        async bufferToBlob(audioBuffer) {
            const numberOfChannels = audioBuffer.numberOfChannels;
            const length = audioBuffer.length;
            const sampleRate = audioBuffer.sampleRate;
            
            // Create WAV file
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
            
            // Convert float audio data to 16-bit PCM
            let offset = 44;
            for (let i = 0; i < length; i++) {
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
                    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                    offset += 2;
                }
            }
            
            return new Blob([arrayBuffer], { type: 'audio/wav' });
        }
    }

    const previewGenerator = new AudioPreviewGenerator();

    // Handle audio file upload
    if (audioInput) {
        audioInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                currentAudioFile = file;
                const url = URL.createObjectURL(file);
                audioPreview.src = url;
                audioPreview.style.display = 'block';
                audioPreview.load();
                
                // Update preview end time based on file duration
                audioPreview.addEventListener('loadedmetadata', function() {
                    const duration = audioPreview.duration;
                    if (duration > 0) {
                        // Set default preview end to 45 seconds or file duration, whichever is smaller
                        const defaultEnd = Math.min(45, duration);
                        previewEndInput.value = defaultEnd;
                        previewEndInput.max = Math.floor(duration);
                        previewStartInput.max = Math.floor(duration - 30); // At least 30 seconds preview
                    }
                });
            }
        });
    }

    // Generate preview functionality
    if (generatePreviewBtn) {
        generatePreviewBtn.addEventListener('click', async function() {
            if (!currentAudioFile) {
                alert('Please upload an audio file first');
                return;
            }

            const startTime = parseFloat(previewStartInput.value) || 0;
            const endTime = parseFloat(previewEndInput.value) || 45;
            
            if (endTime <= startTime) {
                alert('Preview end time must be greater than start time');
                return;
            }
            
            if (endTime - startTime < 30) {
                alert('Preview must be at least 30 seconds long');
                return;
            }
            
            if (endTime - startTime > 60) {
                alert('Preview cannot be longer than 60 seconds');
                return;
            }
            
            // Show loading state
            this.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating Preview...';
            this.disabled = true;
            
            try {
                // Generate preview using Web Audio API
                generatedPreviewBlob = await previewGenerator.generatePreview(
                    currentAudioFile, 
                    startTime, 
                    endTime
                );
                
                // Create preview audio element
                const previewUrl = URL.createObjectURL(generatedPreviewBlob);
                const previewElement = document.getElementById('generatedPreview') || document.createElement('audio');
                previewElement.id = 'generatedPreview';
                previewElement.src = previewUrl;
                previewElement.controls = true;
                previewElement.style.display = 'block';
                previewElement.style.marginTop = '10px';
                
                // Add to DOM if not exists
                if (!document.getElementById('generatedPreview')) {
                    this.parentNode.appendChild(previewElement);
                }
                
                // Success feedback
                this.innerHTML = '<i class="bi bi-check"></i> Preview Generated';
                this.classList.add('btn-success');
                this.classList.remove('btn-outline-primary');
                
                // Show toast notification
                if (typeof showToast === 'function') {
                    showToast('Success', 'Preview generated successfully! You can now listen to your preview below.', 'success');
                }
                
            } catch (error) {
                console.error('Error generating preview:', error);
                this.innerHTML = '<i class="bi bi-play"></i> Generate Preview';
                
                // Show error toast
                if (typeof showToast === 'function') {
                    showToast('Error', 'Failed to generate preview. Please try again.', 'error');
                } else {
                    alert('Error generating preview. Please try again.');
                }
            } finally {
                this.disabled = false;
                
                // Reset button after 3 seconds
                setTimeout(() => {
                    this.innerHTML = '<i class="bi bi-play"></i> Generate Preview';
                    this.classList.remove('btn-success');
                    this.classList.add('btn-outline-primary');
                }, 3000);
            }
        });
    // Form submission with preview
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            if (!currentAudioFile && !generatedPreviewBlob) {
                e.preventDefault();
                alert('Please upload an audio file and generate a preview');
                return;
            }

            // If we have a generated preview, we need to handle it specially
            if (generatedPreviewBlob) {
                e.preventDefault();
                
                const formData = new FormData(uploadForm);
                
                // Replace the audio file with our current file
                formData.delete('audio');
                formData.append('audio', currentAudioFile);
                
                // Add the generated preview
                formData.append('previewFile', generatedPreviewBlob, 'preview.wav');

                try {
                    const response = await fetch('/songs/upload', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        window.location.href = '/songs';
                    } else {
                        const errorText = await response.text();
                        alert('Error uploading song: ' + errorText);
                    }
                } catch (error) {
                    console.error('Upload error:', error);
                    alert('Error uploading song');
                }
            }
        });
    }
});
