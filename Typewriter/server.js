const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const state = require('./lib/state');
const { loadNewsConfig } = require('./lib/configLoader');
const { generateFromSelection } = require('./lib/newsGenerator');

const PORT = Number(process.env.PORT) || 3000;
const SERIAL_PATH = process.env.SERIAL_PORT || '';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/editor', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

app.get('/display', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/', (_req, res) => {
  res.redirect('/editor');
});

/** Full config for editor UI — edit data/newsConfig.json to customize */
app.get('/api/config', (_req, res) => {
  try {
    res.json(loadNewsConfig(true));
  } catch (err) {
    res.status(500).json({ error: 'config_load_failed', message: err.message });
  }
});

function publishLatestDraft(source) {
  const snapshot = state.getSnapshot();
  if (!snapshot.draft) {
    console.log(`[publish] ignored (${source}): no draft waiting`);
    return { ok: false, reason: 'no_draft' };
  }

  let generated = snapshot.draft.generatedDraft;
  try {
    generated = generateFromSelection({
      subjectId: snapshot.draft.subject.id,
      actionId: snapshot.draft.action.id,
      locationId: snapshot.draft.location.id,
      timeId: snapshot.draft.time.id,
      toneId: snapshot.draft.tone.id,
    });
  } catch (err) {
    console.warn('[publish] regenerate failed, using stored draft:', err.message);
  }

  const article = {
    ...snapshot.draft,
    title: generated.headline,
    body: generated.body,
    tag: generated.label,
    metadata: generated.metadata,
    publishedAt: Date.now(),
    publishSource: source,
  };

  state.publish(article);
  io.emit('room:update', state.getSnapshot());
  console.log(`[publish] article released via ${source}`);
  return { ok: true, article };
}

app.post('/api/publish', (_req, res) => {
  const result = publishLatestDraft('http');
  res.json(result);
});

function normalizeDraftPayload(payload) {
  const { subject, action, location, time, tone, generatedDraft } = payload || {};
  if (!subject?.id || !action?.id || !location?.id || !time?.id || !tone?.id) {
    return null;
  }
  if (!generatedDraft?.headline || !generatedDraft?.body) {
    return null;
  }
  return {
    subject,
    action,
    location,
    time,
    tone,
    generatedDraft: {
      headline: generatedDraft.headline,
      body: generatedDraft.body,
      summary: generatedDraft.summary || '',
      label:
        generatedDraft.label ||
        'Archive-inspired generated article. This is not an original historical news article.',
    },
    sentAt: Date.now(),
  };
}

io.on('connection', (socket) => {
  socket.emit('room:update', state.getSnapshot());

  socket.on('draft:send', (payload, ack) => {
    const draft = normalizeDraftPayload(payload);
    if (!draft) {
      if (typeof ack === 'function') ack({ ok: false, error: 'missing_fields' });
      return;
    }

    state.setDraft(draft);
    io.emit('room:update', state.getSnapshot());
    console.log('[draft] received from editor (5 variables)');
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('publish:trigger', (_payload, ack) => {
    const result = publishLatestDraft('socket');
    if (typeof ack === 'function') ack(result);
  });

  socket.on('room:reset', () => {
    state.reset();
    io.emit('room:update', state.getSnapshot());
    console.log('[room] reset to idle');
  });
});

function startSerialListener() {
  if (!SERIAL_PATH) {
    console.log('[serial] SERIAL_PORT not set — Arduino listener disabled');
    console.log('[serial] Use display fallback button or set SERIAL_PORT=COM3 (Windows) / /dev/ttyUSB0 (Linux)');
    return;
  }

  let SerialPort;
  let ReadlineParser;
  try {
    ({ SerialPort } = require('serialport'));
    ({ ReadlineParser } = require('@serialport/parser-readline'));
  } catch (err) {
    console.warn('[serial] packages unavailable:', err.message);
    return;
  }

  const port = new SerialPort({ path: SERIAL_PATH, baudRate: 9600 });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => {
    console.log(`[serial] listening on ${SERIAL_PATH}`);
  });

  port.on('error', (err) => {
    console.error('[serial] error:', err.message);
  });

  parser.on('data', (line) => {
    const text = String(line).trim();
    if (text === 'PUBLISH') {
      console.log('[serial] PUBLISH received');
      publishLatestDraft('arduino');
    }
  });
}

server.listen(PORT, () => {
  try {
    loadNewsConfig();
    console.log('[config] loaded data/newsConfig.json');
  } catch (err) {
    console.error('[config] failed to load newsConfig.json:', err.message);
  }
  console.log(`Newsroom server running at http://localhost:${PORT}`);
  console.log(`  Editor:  http://localhost:${PORT}/editor`);
  console.log(`  Display: http://localhost:${PORT}/display`);
  startSerialListener();
});
