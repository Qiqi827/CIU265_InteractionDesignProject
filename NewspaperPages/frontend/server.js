const express = require('express');
const http = require('http');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ---------- Config ----------

const PORT = Number(process.env.PORT) || 3100;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uhcgprnorihyvhrkxmpm.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_9ht5mlr0XOi3UefgMdbU4Q_-d5xzRcZ';

function createSupabaseAdmin() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

// ---------- Express ----------

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/script.js', (req, res) =>
    res.sendFile(path.join(__dirname, 'script.js')));

app.get('/', (req, res) => res.redirect('/display'));
app.get('/capture', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/capture.html')));
app.get('/display', (req, res) =>
    res.sendFile(path.join(__dirname, 'public/index.html')));

app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
        photoTable: 'citizen_photos',
    });
});

app.get('/api/state', async (req, res) => {
    const supabase = createSupabaseAdmin();
    if (!supabase) {
        res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing' });
        return;
    }

    try {
        const { data: photos, error: photosError } = await supabase
            .from('citizen_photos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (photosError) {
            res.status(500).json({
                error: 'Failed to load state',
                details: {
                    photos: photosError?.message || null,
                },
            });
            return;
        }

        res.json({ photos: photos || [] });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

app.post('/api/photos', async (req, res) => {
    const supabase = createSupabaseAdmin();
    if (!supabase) {
        res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing' });
        return;
    }

    try {
        const {
            id,
            session_id = null,
            image_data,
            created_at = null,
            source = 'local-capture',
        } = req.body || {};

        if (!id || !image_data) {
            res.status(400).json({ error: 'id and image_data are required' });
            return;
        }

        const { data, error } = await supabase
            .from('citizen_photos')
            .insert({
                id,
                session_id,
                image_data,
                votes: 0,
                source,
                created_at,
            })
            .select('*')
            .single();

        if (error) {
            res.status(500).json({ error: error.message, details: error });
            return;
        }

        res.status(201).json({ ok: true, photo: data });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

app.post('/api/photos/:id/vote', async (req, res) => {
    const supabase = createSupabaseAdmin();
    if (!supabase) {
        res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing' });
        return;
    }

    try {
        const { id } = req.params;
        const { data: current, error: currentError } = await supabase
            .from('citizen_photos')
            .select('id, votes')
            .eq('id', id)
            .single();

        if (currentError || !current) {
            res.status(404).json({ error: 'unknown id', details: currentError });
            return;
        }

        const nextVotes = Number(current.votes || 0) + 1;
        const { data, error } = await supabase
            .from('citizen_photos')
            .update({ votes: nextVotes })
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            res.status(500).json({ error: error.message, details: error });
            return;
        }

        res.json({ ok: true, photo: data });
    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

// ---------- Boot ----------

server.listen(PORT, () => {
    console.log('');
    console.log('Photo Wall server running');
    console.log('');
    console.log(`   Capture:  http://localhost:${PORT}/capture`);
    console.log(`   Display:  http://localhost:${PORT}/display`);
    console.log('');
    console.log(`   Supabase URL: ${SUPABASE_URL}`);
    console.log(`   Service role key set: ${SUPABASE_SERVICE_ROLE_KEY ? 'yes' : 'no'}`);
    console.log('');
});
