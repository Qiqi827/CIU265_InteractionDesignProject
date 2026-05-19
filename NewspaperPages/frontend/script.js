// Capture page logic
//
// This file replaces the original /api/photos-based version. Photos are now:
//   1. Captured locally from the webcam (unchanged)
//   2. Rendered into the local 6-slot photo-wall as a FIFO queue
//   3. Broadcast directly to index.html (Citizen Lens panel) through
//      Supabase Realtime, matching the architecture described in README.md
//
// There is no longer any HTTP backend involved on the capture side - no
// /api/photos POST, no /api/photos/latest polling, no /api/reset. The
// browser talks straight to Supabase over a WebSocket.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

// ---------- Config ----------

const CHANNEL_NAME = 'citizen-lens-photos';
const EVENT_NEW = 'new-photo';
const EVENT_RESET = 'reset-photos';
const BROADCAST_MAX_DIM = 600;     // Down-scale long edge before broadcast
const BROADCAST_QUALITY = 0.7;     // JPEG quality for broadcast payload
const LOCAL_QUALITY = 0.92;        // Higher quality for local wall

// ---------- DOM ----------

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap-btn');
const resetBtn = document.getElementById('reset-btn');
const toast = document.getElementById('toast');
const shutter = document.getElementById('shutter-overlay');
const slots = document.querySelectorAll('.photo-slot');

const MAX_LOCAL_PHOTOS = slots.length; // 6 polaroid slots on this page

// ---------- State ----------

const localPhotos = []; // FIFO of {id, dataUrl}
let toastTimerId = null;

let supabase = null;
let channel = null;
let channelReady = false;

// ---------- Supabase Realtime ----------

function isSupabaseConfigured() {
    return (
        SUPABASE_URL &&
        SUPABASE_ANON_KEY &&
        !SUPABASE_URL.includes('PASTE_') &&
        !SUPABASE_ANON_KEY.includes('PASTE_')
    );
}

function setupRealtime() {
    if (!isSupabaseConfigured()) {
        console.warn('[citizen-lens] supabase-config.js not filled in; broadcast disabled.');
        return;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    channel = supabase.channel(CHANNEL_NAME, {
        config: { broadcast: { self: false, ack: false } }
    });
    channel.subscribe((status) => {
        channelReady = (status === 'SUBSCRIBED');
        if (channelReady) {
            console.log('[citizen-lens] connected.');
        }
    });
}

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
    toastTimerId = setTimeout(() => {
        toast.classList.remove('show');
    }, 2200);
}

function flashShutter() {
    if (!shutter) return;
    shutter.classList.remove('flash-animation');
    // Force reflow so the animation restarts even on rapid clicks.
    void shutter.offsetWidth;
    shutter.classList.add('flash-animation');
}

function makeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
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

// ---------- Local photo wall ----------

function renderLocalWall() {
    slots.forEach((slot, i) => {
        const photo = localPhotos[i];
        if (photo) {
            // Avoid re-creating the <img> if it's the same photo, so the
            // CSS fade-in animation only fires for genuinely new captures.
            const existing = slot.querySelector('img');
            if (!existing || existing.dataset.photoId !== photo.id) {
                slot.innerHTML =
                    `<img src="${photo.dataUrl}" data-photo-id="${photo.id}">`;
            }
        } else {
            slot.innerHTML = '';
        }
    });
}

// ---------- Broadcast ----------

async function broadcastPhoto(photo) {
    if (!channelReady) {
        showToast('Saved locally (newspaper offline)', true);
        return;
    }
    try {
        const compressed = await downscaleDataUrl(
            photo.dataUrl,
            BROADCAST_MAX_DIM,
            BROADCAST_QUALITY,
        );
        await channel.send({
            type: 'broadcast',
            event: EVENT_NEW,
            payload: {
                id: photo.id,
                dataUrl: compressed,
                createdAt: new Date().toISOString(),
            },
        });
        console.log('[citizen-lens] sent', photo.id);
        showToast('Sent to newspaper');
    } catch (err) {
        console.error('[citizen-lens] broadcast failed', err);
        showToast('Sync failed', true);
    }
}

async function broadcastReset() {
    if (!channelReady) return false;
    try {
        await channel.send({
            type: 'broadcast',
            event: EVENT_RESET,
            payload: { at: new Date().toISOString() },
        });
        return true;
    } catch (err) {
        console.error('[citizen-lens] reset broadcast failed', err);
        return false;
    }
}

// ---------- Handlers ----------

async function takePhoto() {
    flashShutter();

    const dataUrl = captureFrameDataUrl(LOCAL_QUALITY);
    if (!dataUrl) {
        showToast('Camera not ready', true);
        return;
    }

    const photo = { id: makeId(), dataUrl };

    // Local wall FIFO - newest goes to the end.
    if (localPhotos.length >= MAX_LOCAL_PHOTOS) {
        localPhotos.shift();
    }
    localPhotos.push(photo);
    renderLocalWall();

    // Independently broadcast to the newspaper.
    broadcastPhoto(photo);
}

async function resetAllPhotos() {
    localPhotos.length = 0;
    renderLocalWall();

    if (channelReady) {
        const ok = await broadcastReset();
        showToast(ok ? 'All photos were removed' : 'Cleared locally (sync error)', !ok);
    } else {
        showToast('Cleared locally', true);
    }
}

// ---------- Init ----------

snapBtn.addEventListener('click', takePhoto);
resetBtn.addEventListener('click', resetAllPhotos);
setupRealtime();
setupCamera();