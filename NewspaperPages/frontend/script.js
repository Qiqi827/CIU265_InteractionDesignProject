const API_BASE_URL = 'http://10.159.67.31:8000';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap-btn');
const resetBtn = document.getElementById('reset-btn');
const toast = document.getElementById('toast');
const shutter = document.getElementById('shutter-overlay');
const slots = document.querySelectorAll('.photo-slot');
const lastRenderedIds = Array(slots.length).fill(null);
let toastTimerId = null;

// Start the camera
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
    } catch (err) {
        console.error("Failed to access camera", err);
    }
}

// Capture and upload a photo
async function takePhoto() {
    // 1. Trigger shutter flash animation
    shutter.classList.remove('flash-animation');
    void shutter.offsetWidth; 
    shutter.classList.add('flash-animation');

    // 2. Capture frame from video
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/png');

    // 3. Upload to local backend
    const imageBase64 = imageData.split(',')[1];
    const response = await fetch(`${API_BASE_URL}/api/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imageBase64 }),
    });

    if (!response.ok) {
        console.error('Upload failed');
        return;
    }

    await refreshWall();
}

async function refreshWall() {
    const response = await fetch(`${API_BASE_URL}/api/photos/latest?limit=6`);
    if (!response.ok) {
        return;
    }

    const payload = await response.json();
    const items = payload.items || [];
    slots.forEach((slot, index) => {
        const item = items[index];
        const nextId = item ? item.id : null;
        if (lastRenderedIds[index] === nextId) {
            return;
        }

        if (!item) {
            slot.innerHTML = '';
            lastRenderedIds[index] = null;
            return;
        }

        slot.innerHTML = `<img src="data:image/png;base64,${item.image_base64}">`;
        lastRenderedIds[index] = item.id;
    });
}

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.background = isError ? '#b53a3a' : '#1f8f4a';
    toast.classList.add('show');
    if (toastTimerId) {
        clearTimeout(toastTimerId);
    }
    toastTimerId = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

async function resetAllPhotos() {
    const response = await fetch(`${API_BASE_URL}/api/reset`, { method: 'POST' });
    if (!response.ok) {
        showToast('Failed to reset photos', true);
        return;
    }

    await refreshWall();
    showToast('All photos were removed');
}

snapBtn.addEventListener('click', takePhoto);
resetBtn.addEventListener('click', resetAllPhotos);
setupCamera();
refreshWall();
setInterval(refreshWall, 1000);