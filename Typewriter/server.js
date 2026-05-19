require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const state = require('./lib/state');
const { loadNewsConfig } = require('./lib/configLoader');
const { generateFromSelection } = require('./lib/newsGenerator');
const { getPublicTerminalInfo, publishToTerminal } = require('./lib/terminalPublisher');

const PORT = Number(process.env.PORT) || 3000;
const SERIAL_PORT = process.env.SERIAL_PORT || 'COM8';
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE) || 9600;

/** @type {import('serialport').SerialPort | null} */
let arduinoPort = null;

function sendArduinoCommand(command) {
  if (!arduinoPort || !arduinoPort.isOpen) {
    console.log('Arduino port not open, cannot send:', command);
    return;
  }
  arduinoPort.write(`${command}\n`, (err) => {
    if (err) {
      console.error('[serial] write failed:', err.message);
      return;
    }
    console.log('[serial] sent to Arduino:', command);
  });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/editor', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

/** Local newsroom monitor (draft waiting + last published copy) */
app.get('/display', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/', (_req, res) => {
  res.redirect('/editor');
});

app.get('/api/config', (_req, res) => {
  try {
    res.json(loadNewsConfig(true));
  } catch (err) {
    res.status(500).json({ error: 'config_load_failed', message: err.message });
  }
});

/** Public info for staff — no secrets */
app.get('/api/terminal', (_req, res) => {
  try {
    res.json(getPublicTerminalInfo());
  } catch (err) {
    res.status(500).json({ error: 'terminal_config_failed', message: err.message });
  }
});

async function publishLatestDraft(source) {
  const snapshot = state.getSnapshot();
  if (!snapshot.draft) {
    console.log('No draft available to publish.');
    return { ok: false, reason: 'no_draft' };
  }

  let generated = snapshot.draft.generatedDraft;
  try {
    const fragmentRef = snapshot.draft.storyFragment || snapshot.draft.action;
    generated = generateFromSelection({
      storyFragmentId: fragmentRef.id,
      subjectId: snapshot.draft.subject.id,
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

  let terminalPublish;
  try {
    terminalPublish = await publishToTerminal(article);
  } catch (err) {
    console.error('[terminal] unexpected error:', err.message);
    terminalPublish = { ok: false, reason: err.message };
  }

  article.terminalPublish = terminalPublish;

  state.publish(article);
  io.emit('room:update', state.getSnapshot());
  console.log(
    `[publish] local display updated via ${source}` +
      (terminalPublish?.ok ? '; terminal wall notified' : `; terminal: ${terminalPublish?.reason || 'skipped'}`)
  );

  sendArduinoCommand('LIGHT_OFF');

  return { ok: true, article, terminalPublish };
}

app.post('/api/publish', async (_req, res) => {
  try {
    const result = await publishLatestDraft('http');
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function normalizeDraftPayload(payload) {
  const { subject, storyFragment, action, location, time, tone, generatedDraft } = payload || {};
  const fragment = storyFragment || action;
  if (!subject?.id || !fragment?.id || !location?.id || !time?.id || !tone?.id) {
    return null;
  }
  if (!generatedDraft?.headline || !generatedDraft?.body) {
    return null;
  }
  return {
    subject,
    storyFragment: fragment,
    location,
    time,
    tone,
    generatedDraft: {
      headline: generatedDraft.headline,
      body: generatedDraft.body,
      summary: generatedDraft.summary || '',
      label:
        generatedDraft.label ||
        loadNewsConfig().labels?.articleLabel ||
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
    console.log('[draft] received from editor → local /display waiting');
    sendArduinoCommand('LIGHT_ON');
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('publish:trigger', async (_payload, ack) => {
    try {
      const result = await publishLatestDraft('socket');
      if (typeof ack === 'function') ack(result);
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('room:reset', () => {
    state.reset();
    io.emit('room:update', state.getSnapshot());
    console.log('[room] reset to idle');
  });

  socket.on('editor:selection-feedback', (payload) => {
    io.emit('editor:selection-feedback', payload);
  });
});

function startSerialListener() {
  let SerialPort;
  let ReadlineParser;
  try {
    ({ SerialPort } = require('serialport'));
    ({ ReadlineParser } = require('@serialport/parser-readline'));
  } catch (err) {
    console.warn('[serial] serialport not available:', err.message);
    console.warn('[serial] Run: npm install serialport');
    return;
  }

  console.log(`[serial] opening ${SERIAL_PORT} @ ${BAUD_RATE} baud`);

  const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
  arduinoPort = port;
  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.on('open', () => {
    console.log(`[serial] connected on ${SERIAL_PORT}`);
    sendArduinoCommand('LIGHT_OFF');
  });

  port.on('error', (err) => {
    console.error('[serial] error:', err.message);
  });

  parser.on('data', async (line) => {
    const text = String(line).trim();
    console.log('[serial] data:', JSON.stringify(text));

    if (text !== 'PUBLISH') {
      return;
    }

    console.log('[serial] PUBLISH — calling publishLatestDraft()');
    try {
      const result = await publishLatestDraft('arduino');
      if (result.ok) {
        console.log('[serial] publish succeeded — /display updated');
      }
    } catch (err) {
      console.error('[serial] publish failed:', err.message);
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

  const terminal = getPublicTerminalInfo();
  console.log(`Newsroom server running at http://localhost:${PORT}`);
  console.log(`  Editor (iPad):     http://localhost:${PORT}/editor`);
  console.log(`  Display (local):   http://localhost:${PORT}/display`);
  if (terminal.enabled) {
    console.log(`  Terminal wall:     ${terminal.terminalName} via Supabase Realtime`);
    if (terminal.terminalLocalUrl) {
      console.log(`                     ${terminal.terminalLocalUrl}`);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('  [terminal] Set SUPABASE_SERVICE_ROLE_KEY in .env to push to the terminal screen');
    }
  }

  startSerialListener();
});
