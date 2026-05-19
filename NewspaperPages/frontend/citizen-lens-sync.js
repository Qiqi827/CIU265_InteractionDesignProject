// citizen-lens-sync.js
//
// Non-invasive bridge between capture.html and index.html (Citizen Lens panel).
//
// Strategy:
//   1. Watch .photo-wall with a MutationObserver. Whenever script.js inserts
//      or updates an <img> inside a .photo-slot, we treat that as a new photo.
//   2. Downscale to <= 600px on the long edge, JPEG quality 0.7, so the
//      payload stays well under Supabase Realtime's broadcast limit.
//   3. Send via the 'citizen-lens-photos' broadcast channel. index.html is
//      subscribed to the same channel and renders the 8-slot grid.
//
// This script never touches the local photo-wall, the buttons, or any
// existing capture state. If something breaks here, capture still works.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const CHANNEL_NAME = 'citizen-lens-photos';
const EVENT_NEW = 'new-photo';
const EVENT_RESET = 'reset-photos';
const BROADCAST_MAX_DIM = 600;
const BROADCAST_QUALITY = 0.7;

const photoWall = document.querySelector('.photo-wall');
const resetBtn = document.getElementById('reset-btn');
const toast = document.getElementById('toast');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('PASTE_')) {
    console.warn('[citizen-lens-sync] supabase-config.js not filled in; sync disabled.');
} else if (!photoWall) {
    console.warn('[citizen-lens-sync] .photo-wall not found; sync disabled.');
} else {
    startSync();
}

function startSync() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const channel = supabase.channel(CHANNEL_NAME, {
        config: { broadcast: { self: false, ack: false } }
    });

    let channelReady = false;
    channel.subscribe((status) => {
        channelReady = (status === 'SUBSCRIBED');
        if (channelReady) {
            console.log('[citizen-lens-sync] connected.');
        }
    });

    // We mark <img> elements once broadcast so we don't re-send the same one
    // on unrelated DOM mutations.
    const SENT_ATTR = 'data-citizen-sent';

    async function broadcastImg(imgEl) {
        if (!channelReady) return;
        if (imgEl.getAttribute(SENT_ATTR) === imgEl.currentSrc + '|' + imgEl.src) return;

        try {
            const compressed = await downscale(imgEl);
            if (!compressed) return;

            const id = makeId();
            const result = await channel.send({
                type: 'broadcast',
                event: EVENT_NEW,
                payload: {
                    id,
                    dataUrl: compressed,
                    createdAt: new Date().toISOString()
                }
            });

            imgEl.setAttribute(SENT_ATTR, imgEl.currentSrc + '|' + imgEl.src);
            console.log('[citizen-lens-sync] sent', id, 'result:', result);
            flashToast('Photo sent to newspaper');
        } catch (err) {
            console.error('[citizen-lens-sync] broadcast failed:', err);
        }
    }

    function downscale(imgEl) {
        return new Promise((resolve, reject) => {
            const finish = (source) => {
                const sw = source.naturalWidth || source.width;
                const sh = source.naturalHeight || source.height;
                if (!sw || !sh) return resolve(null);

                let w = sw;
                let h = sh;
                if (w > h && w > BROADCAST_MAX_DIM) {
                    h = Math.round(h * BROADCAST_MAX_DIM / w);
                    w = BROADCAST_MAX_DIM;
                } else if (h >= w && h > BROADCAST_MAX_DIM) {
                    w = Math.round(w * BROADCAST_MAX_DIM / h);
                    h = BROADCAST_MAX_DIM;
                }

                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                try {
                    c.getContext('2d').drawImage(source, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', BROADCAST_QUALITY));
                } catch (err) {
                    // Likely a tainted canvas (cross-origin). Photos coming from
                    // a local capture (data: or blob: URLs) are not subject to
                    // CORS, so this branch should not normally fire.
                    reject(err);
                }
            };

            if (imgEl.complete && imgEl.naturalWidth) {
                finish(imgEl);
            } else {
                const tmp = new Image();
                tmp.onload = () => finish(tmp);
                tmp.onerror = reject;
                tmp.src = imgEl.src;
            }
        });
    }

    function scan(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'IMG') {
            queueImg(node);
            return;
        }
        const imgs = node.querySelectorAll && node.querySelectorAll('img');
        imgs && imgs.forEach(queueImg);
    }

    function queueImg(img) {
        if (img.complete && img.naturalWidth) {
            broadcastImg(img);
        } else {
            img.addEventListener('load', () => broadcastImg(img), { once: true });
        }
    }

    // Initial scan: any pre-existing photos in the wall get broadcast too.
    photoWall.querySelectorAll('img').forEach(queueImg);

    // Watch additions and src changes anywhere inside .photo-wall.
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach(scan);
            if (m.type === 'attributes'
                && m.target.tagName === 'IMG'
                && m.attributeName === 'src') {
                m.target.removeAttribute(SENT_ATTR);
                queueImg(m.target);
            }
        }
    });
    observer.observe(photoWall, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    });

    // Mirror "CLEAR ALL PHOTOS" to the newspaper so it can wipe its grid too.
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (!channelReady) return;
            try {
                await channel.send({
                    type: 'broadcast',
                    event: EVENT_RESET,
                    payload: { at: new Date().toISOString() }
                });
            } catch (err) {
                console.error('[citizen-lens-sync] reset broadcast failed:', err);
            }
        });
    }
}

function makeId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function flashToast(msg) {
    if (!toast) return;
    // Only set text if the existing toast is idle, so we don't fight with
    // toasts that script.js may be showing for its own events.
    const previous = toast.textContent;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(flashToast._t);
    flashToast._t = setTimeout(() => {
        toast.classList.remove('show');
        if (toast.textContent === msg) toast.textContent = previous || '';
    }, 1600);
}
