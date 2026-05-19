// Capture page: webcam + 9-slot voting wall + Supabase Realtime broadcast.
//
// Slot 0 is BEST (fixed). It always shows the photo with the highest vote
// count (ties broken by most-recent createdAt, and only if at least one
// vote exists). Slots 1-8 are FIFO showing the most recent non-BEST photos.
// The wider photoLibrary (capped at 100) backs vote bookkeeping and is
// kept in sync with index.html via broadcast events.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

// ---------- Config ----------

const CHANNEL_NAME = 'citizen-lens-photos';
const EVENT_NEW = 'new-photo';
const EVENT_VOTE = 'vote';

const BROADCAST_MAX_DIM = 600;
const BROADCAST_QUALITY = 0.7;
const LOCAL_QUALITY = 0.92;

const VOTE_COOLDOWN_MS = 5000;
const MAX_LIBRARY = 100;
const FIFO_SLOTS = 8;     // positions 1..8

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

let supabase = null;
let channel = null;
let channelReady = false;

// ---------- Supabase ----------

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
        config: { broadcast: { self: false, ack: false } },
    });
    channel.subscribe((status) => {
        channelReady = (status === 'SUBSCRIBED');
        if (channelReady) console.log('[citizen-lens] connected.');
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

function addPhotoLocal(photo) {
    if (photoLibrary.some((p) => p.id === photo.id)) return;
    photoLibrary.push(photo);
    while (photoLibrary.length > MAX_LIBRARY) photoLibrary.shift();
}

function applyVoteLocal(photoId) {
    const photo = photoLibrary.find((p) => p.id === photoId);
    if (photo) photo.votes += 1;
}

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

// Tick button countdown labels while any cooldown is active.
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

    applyVoteLocal(photoId);
    voteCooldownUntil.set(photoId, Date.now() + VOTE_COOLDOWN_MS);
    broadcastVote(photoId);
    renderWall();
    ensureCooldownTicker();
}

photoWall.addEventListener('click', handleWallClick);

// ---------- Broadcasts ----------

async function broadcastPhoto(photo) {
    if (!channelReady) {
        showToast('Saved locally (newspaper offline)', true);
        return;
    }
    try {
        const compressed = await downscaleDataUrl(
            photo.dataUrl, BROADCAST_MAX_DIM, BROADCAST_QUALITY,
        );
        await channel.send({
            type: 'broadcast',
            event: EVENT_NEW,
            payload: {
                id: photo.id,
                dataUrl: compressed,
                votes: photo.votes,
                createdAt: photo.createdAt,
            },
        });
        console.log('[citizen-lens] photo sent', photo.id);
        showToast('Sent to newspaper');
    } catch (err) {
        console.error('[citizen-lens] photo broadcast failed', err);
        showToast('Sync failed', true);
    }
}

async function broadcastVote(photoId) {
    if (!channelReady) return;
    try {
        await channel.send({
            type: 'broadcast',
            event: EVENT_VOTE,
            payload: { id: photoId, at: new Date().toISOString() },
        });
    } catch (err) {
        console.error('[citizen-lens] vote broadcast failed', err);
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
    const photo = {
        id: makeId(),
        dataUrl,
        votes: 0,
        createdAt: new Date().toISOString(),
    };
    addPhotoLocal(photo);
    renderWall();
    broadcastPhoto(photo);
}

// ---------- Init ----------

snapBtn.addEventListener('click', takePhoto);

setupRealtime();
setupCamera();
renderWall();