// Photo Wall server
//
// Express + Socket.IO. Serves the capture page (/capture) and the
// newspaper display (/display, also /), and keeps the canonical photo
// library + vote counts in memory. Capture clients emit `photo:add` and
// `photo:vote`; the server broadcasts to all other connected clients so
// the newspaper display stays in sync in real time.
//
// Modelled after the Typewriter subproject (CIU265_InteractionDesignProject
// /Typewriter): same Express + Socket.IO architecture, run with `npm start`,
// designed to be deployed on a single machine on the exhibition LAN.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

// ---------- Config ----------

const PORT = Number(process.env.PORT) || 3100;
const MAX_LIBRARY = 100;

// ---------- Express ----------

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/display'));
app.get('/capture', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/capture.html')));
app.get('/display', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/index.html')));

// Read-only state endpoint (handy for debugging from a phone or curl)
app.get('/api/state', (req, res) => {
    res.json({
        library: photoLibrary,
        count: photoLibrary.length,
        max: MAX_LIBRARY,
    });
});

// Admin reset (no UI button - call manually if needed):
//   curl -X POST http://localhost:3100/api/reset
app.post('/api/reset', (req, res) => {
    photoLibrary.length = 0;
    io.emit('photo:state', { library: photoLibrary });
    console.log('[admin] library reset via POST /api/reset');
    res.json({ ok: true });
});

// ---------- Socket.IO ----------

const io = new Server(server, {
    // Generous payload limit so we can carry the compressed JPEG data URLs
    maxHttpBufferSize: 5 * 1024 * 1024, // 5 MB
});

const photoLibrary = []; // [{id, dataUrl, votes, createdAt}]

io.on('connection', (socket) => {
    console.log('[socket]', socket.id, 'connected from', socket.handshake.address);

    // Catch the newcomer up with whatever we have now.
    socket.emit('photo:state', { library: photoLibrary });

    // Capture client uploads a new photo.
    socket.on('photo:add', (photo, ack) => {
        if (!photo || typeof photo !== 'object') {
            if (typeof ack === 'function') ack({ ok: false, error: 'bad payload' });
            return;
        }
        if (!photo.id || !photo.dataUrl) {
            if (typeof ack === 'function') ack({ ok: false, error: 'missing fields' });
            return;
        }
        if (photoLibrary.some((p) => p.id === photo.id)) {
            if (typeof ack === 'function') ack({ ok: true, deduped: true });
            return;
        }

        const stored = {
            id: String(photo.id),
            dataUrl: String(photo.dataUrl),
            votes: 0,
            createdAt: photo.createdAt || new Date().toISOString(),
        };
        photoLibrary.push(stored);
        while (photoLibrary.length > MAX_LIBRARY) photoLibrary.shift();

        // Fan out to every OTHER connected client (the sender already has it).
        socket.broadcast.emit('photo:added', stored);

        console.log('[photo:add]', stored.id, '(library size:', photoLibrary.length + ')');
        if (typeof ack === 'function') ack({ ok: true });
    });

    // Capture client votes for a photo.
    socket.on('photo:vote', (photoId, ack) => {
        const id = typeof photoId === 'string' ? photoId : photoId?.id;
        if (!id) {
            if (typeof ack === 'function') ack({ ok: false, error: 'missing id' });
            return;
        }
        const photo = photoLibrary.find((p) => p.id === id);
        if (!photo) {
            if (typeof ack === 'function') ack({ ok: false, error: 'unknown id' });
            return;
        }
        photo.votes += 1;
        socket.broadcast.emit('photo:voted', { id: photo.id, votes: photo.votes });
        console.log('[photo:vote]', id, '->', photo.votes);
        if (typeof ack === 'function') ack({ ok: true, votes: photo.votes });
    });

    socket.on('disconnect', (reason) => {
        console.log('[socket]', socket.id, 'disconnected:', reason);
    });
});

// ---------- Boot ----------

server.listen(PORT, () => {
    console.log('');
    console.log('🗞️  Photo Wall server running');
    console.log('');
    console.log(`   Capture:  http://localhost:${PORT}/capture`);
    console.log(`   Display:  http://localhost:${PORT}/display`);
    console.log('');
    console.log('   On the exhibition LAN, replace "localhost" with this');
    console.log('   machine\'s IP address on every other device.');
    console.log('');
});
