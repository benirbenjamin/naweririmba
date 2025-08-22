// Audio recording functionality
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let metronome;

// Handle login form submission (only for modal forms)
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: document.getElementById('loginEmail').value,
                    password: document.getElementById('loginPassword').value
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                window.location.reload();
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Error logging in. Please try again.');
        }
    });
}

// Handle registration form submission (only for modal forms)
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!document.getElementById('termsCheck').checked) {
            alert('Please agree to the Terms and Conditions');
            return;
        }

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: document.getElementById('registerName').value,
                    email: document.getElementById('registerEmail').value,
                    password: document.getElementById('registerPassword').value,
                    whatsapp: document.getElementById('registerWhatsapp').value
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                alert('Registration successful! Please log in.');
                $('#registerModal').modal('hide');
                $('#loginModal').modal('show');
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Error registering. Please try again.');
        }
    });
}

// Audio Recording Functions
function startRecording() {
    if (isRecording) return;
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                document.getElementById('recordedAudio').src = audioUrl;
                document.getElementById('recordedAudio').style.display = 'block';
                document.getElementById('uploadRecording').style.display = 'block';
            };

            // Start recording
            mediaRecorder.start();
            isRecording = true;
            startMetronome();
            
            document.getElementById('startRecording').style.display = 'none';
            document.getElementById('stopRecording').style.display = 'inline-block';
        })
        .catch(error => {
            console.error('Error accessing microphone:', error);
            alert('Error accessing microphone. Please check your permissions.');
        });
}

function stopRecording() {
    if (!isRecording) return;
    
    mediaRecorder.stop();
    isRecording = false;
    stopMetronome();
    
    document.getElementById('startRecording').style.display = 'inline-block';
    document.getElementById('stopRecording').style.display = 'none';
}

// Metronome Functions
function startMetronome() {
    const tempo = document.getElementById('tempo').value;
    const timeSignature = document.getElementById('timeSignature').value;
    const beatsPerMeasure = parseInt(timeSignature.split('/')[0]);
    
    const intervalMs = (60 / tempo) * 1000;
    let beat = 0;
    
    metronome = setInterval(() => {
        const click = new Audio(beat === 0 ? '/sounds/high.wav' : '/sounds/low.wav');
        click.play();
        
        beat = (beat + 1) % beatsPerMeasure;
    }, intervalMs);
}

function stopMetronome() {
    if (metronome) {
        clearInterval(metronome);
        metronome = null;
    }
}

// Audio Preview Functions
function createAudioPreview(audioFile) {
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(audioFile);
    
    audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        document.getElementById('previewStart').max = duration;
        document.getElementById('previewEnd').max = duration;
        document.getElementById('previewEnd').value = Math.min(60, duration);
    });
}

// Handle file input change
document.getElementById('audioFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        createAudioPreview(file);
    }
});

// Upload song with preview settings
async function uploadSong(formData) {
    try {
        const response = await fetch('/songs', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Song uploaded successfully!');
            window.location.href = `/songs/${data.songId}`;
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Error uploading song. Please try again.');
    }
}

// Purchase song
async function purchaseSong(songId) {
    try {
        const response = await fetch(`/users/purchase/${songId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // Payment details would be collected through a form
                email: document.getElementById('purchaseEmail').value,
                card_number: document.getElementById('cardNumber').value,
                cvv: document.getElementById('cvv').value,
                expiry_month: document.getElementById('expiryMonth').value,
                expiry_year: document.getElementById('expiryYear').value,
                fullname: document.getElementById('cardName').value
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert('Purchase successful! Downloading song...');
            window.location.href = data.download_url;
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Purchase error:', error);
        alert('Error processing purchase. Please try again.');
    }
}
