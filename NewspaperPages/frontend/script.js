// Capture client: webcam → 9-slot voting wall, synced through Socket.IO.
//
// Slot 0 is BEST (fixed) - the photo with the most votes (>=1) takes it,
// ties broken by most-recent createdAt. Slots 1-8 hold the most recent
// non-BEST photos in FIFO order.
//
// The Node + Express + Socket.IO server (server.js at repo root) owns the
// canonical photo library and vote counts; we mirror its state locally and
// emit `photo:add` / `photo:vote` for changes. Reload-safe: on reconnect
// the server sends `photo:state` with the current snapshot.

import { io } from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';

// ---------- Config ----------

const BROADCAST_MAX_DIM = 600;
const BROADCAST_QUALITY = 0.7;

const VOTE_COOLDOWN_MS = 5000;
const MAX_LIBRARY = 100;
const FIFO_SLOTS = 8;

// ---------- DOM ----------

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap-btn');
const toast = document.getElementById('toast');
const shutter = document.getElementById('shutter-overlay');
const photoWall = document.getElementById('photo-wall');
const cells = Array.from(photoWall.querySelectorAll('.photo-cell'));

// ---------- State ----------

const photoLibrary = [];                  // [{id, dataUrl, votes, createdAt}]
const voteCooldownUntil = new Map();      // photoId -> timestamp
let toastTimerId = null;

// ---------- Socket.IO ----------

// Connect to the same origin that served this page.
const socket = io();

socket.on('connect', () => {
    console.log('[citizen-lens] socket connected:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('[citizen-lens] socket disconnected:', reason);
});

socket.on('connect_error', (err) => {
    console.error('[citizen-lens] socket connect_error:', err.message);
    showToast('Server unreachable', true);
});

// Server sends the full snapshot on connect (and on reset).
socket.on('photo:state', ({ library }) => {
    photoLibrary.length = 0;
    if (Array.isArray(library)) library.forEach((p) => photoLibrary.push(p));
    // Clear any cooldowns whose photos no longer exist.
    for (const id of [...voteCooldownUntil.keys()]) {
        if (!photoLibrary.some((p) => p.id === id)) voteCooldownUntil.delete(id);
    }
    renderWall();
});

// Another client added a photo.
socket.on('photo:added', (photo) => {
    if (!photo || !photo.id) return;
    if (photoLibrary.some((p) => p.id === photo.id)) return;
    photoLibrary.push(photo);
    while (photoLibrary.length > MAX_LIBRARY) photoLibrary.shift();
    renderWall();
});

// Another client voted.
socket.on('photo:voted', ({ id, votes }) => {
    const photo = photoLibrary.find((p) => p.id === id);
    if (!photo) return;
    photo.votes = votes; // trust the server's count
    renderWall();
});

// ---------- Camera ----------

async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
        });
        video.srcObject = stream;
    } catch (err) {
        console.error('Failed to access camera', err);
        showToast('Camera unavailable', true);
    }
}

// ---------- UI helpers ----------

function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = isError ? '#b53a3a' : '#1f8f4a';
    toast.classList.add('show');
    if (toastTimerId) clearTimeout(toastTimerId);
    toastTimerId = setTimeout(() => toast.classList.remove('show'), 2200);
}

function flashShutter() {
    if (!shutter) return;
    shutter.classList.remove('flash-animation');
    void shutter.offsetWidth;
    shutter.classList.add('flash-animation');
}

function makeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Image processing ----------

function captureFrameDataUrl(quality) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    canvas.width = vw;
    canvas.height = vh;
    canvas.getContext('2d').drawImage(video, 0, 0, vw, vh);
    return canvas.toDataURL('image/jpeg', quality);
}

function downscaleDataUrl(srcDataUrl, maxDim, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > h && w > maxDim) {
                h = Math.round(h * maxDim / w);
                w = maxDim;
            } else if (h >= w && h > maxDim) {
                w = Math.round(w * maxDim / h);
                h = maxDim;
            }
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = srcDataUrl;
    });
}

// ---------- Library logic ----------

function getBestPhoto() {
    if (photoLibrary.length === 0) return null;
    const sorted = [...photoLibrary].sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (sorted[0].votes === 0) return null;
    return sorted[0];
}

function getFifoPhotos() {
    const best = getBestPhoto();
    return photoLibrary
        .filter((p) => !best || p.id !== best.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, FIFO_SLOTS);
}

// ---------- Rendering ----------

function renderCell(cell, photo) {
    const slot = cell.querySelector('.photo-slot');
    const btn = cell.querySelector('.vote-btn');
    const countEl = cell.querySelector('.vote-count');

    if (photo) {
        cell.dataset.photoId = photo.id;
        const existing = slot.querySelector('img');
        if (!existing || existing.dataset.photoId !== photo.id) {
            slot.innerHTML = `<img src="${photo.dataUrl}" data-photo-id="${photo.id}">`;
        }
        countEl.textContent = String(photo.votes);

        const cooldownEnd = voteCooldownUntil.get(photo.id);
        const onCooldown = cooldownEnd && cooldownEnd > Date.now();
        btn.disabled = !!onCooldown;
        btn.textContent = onCooldown
            ? `${Math.ceil((cooldownEnd - Date.now()) / 1000)}s`
            : 'VOTE';
    } else {
        delete cell.dataset.photoId;
        slot.innerHTML = '';
        countEl.textContent = '0';
        btn.disabled = true;
        btn.textContent = 'VOTE';
    }
}

function renderWall() {
    const best = getBestPhoto();
    const fifo = getFifoPhotos();
    renderCell(cells[0], best);
    for (let i = 0; i < FIFO_SLOTS; i++) {
        renderCell(cells[i + 1], fifo[i]);
    }
}

let cooldownTickTimerId = null;
function ensureCooldownTicker() {
    if (cooldownTickTimerId) return;
    cooldownTickTimerId = setInterval(() => {
        const now = Date.now();
        let stillActive = false;
        for (const [id, end] of voteCooldownUntil) {
            if (end > now) {
                stillActive = true;
            } else {
                voteCooldownUntil.delete(id);
            }
        }
        renderWall();
        if (!stillActive) {
            clearInterval(cooldownTickTimerId);
            cooldownTickTimerId = null;
        }
    }, 250);
}

// ---------- Vote handling ----------

function handleWallClick(event) {
    const btn = event.target.closest('.vote-btn');
    if (!btn || btn.disabled) return;
    const cell = btn.closest('.photo-cell');
    const photoId = cell?.dataset.photoId;
    if (!photoId) return;

    const end = voteCooldownUntil.get(photoId);
    if (end && end > Date.now()) return;

    // Optimistic local update so the UI feels instant.
    const photo = photoLibrary.find((p) => p.id === photoId);
    if (photo) photo.votes += 1;
    voteCooldownUntil.set(photoId, Date.now() + VOTE_COOLDOWN_MS);
    renderWall();
    ensureCooldownTicker();

    // Tell the server. Server will fan out `photo:voted` to other clients.
    socket.emit('photo:vote', photoId, (response) => {
        if (response && response.ok === false) {
            console.warn('[citizen-lens] vote rejected:', response.error);
        } else if (response && typeof response.votes === 'number') {
            // Reconcile with the server's authoritative count.
            const p = photoLibrary.find((x) => x.id === photoId);
            if (p) p.votes = response.votes;
            renderWall();
        }
    });
}

photoWall.addEventListener('click', handleWallClick);

// ---------- Capture handler ----------

async function takePhoto() {
    flashShutter();
    const rawDataUrl = captureFrameDataUrl(0.92);
    if (!rawDataUrl) {
        showToast('Camera not ready', true);
        return;
    }

    const dataUrl = await downscaleDataUrl(rawDataUrl, BROADCAST_MAX_DIM, BROADCAST_QUALITY);
    const photo = {
        id: makeId(),
        dataUrl,
        votes: 0,
        createdAt: new Date().toISOString(),
    };

    // Optimistic local add.
    photoLibrary.push(photo);
    while (photoLibrary.length > MAX_LIBRARY) photoLibrary.shift();
    renderWall();

    if (socket.connected) {
        socket.emit('photo:add', photo, (response) => {
            if (response && response.ok === false) {
                console.warn('[citizen-lens] photo rejected:', response.error);
                showToast('Sync failed', true);
            } else {
                showToast('Sent to newspaper');
            }
        });
    } else {
        showToast('Saved locally (server offline)', true);
    }
}

snapBtn.addEventListener('click', takePhoto);

// ---------- Init ----------

setupCamera();
renderWall();