(function () {
  const socket = io();
  const root = document.getElementById('display-root');
  const clockEl = document.getElementById('display-clock');
  const waitingSummary = document.getElementById('waiting-summary');
  const connectionDot = document.getElementById('connection-dot');
  const btnPublish = document.getElementById('btn-publish');
  const btnReset = document.getElementById('btn-reset');
  const terminalStatusEl = document.getElementById('terminal-status');

  const articleTitle = document.getElementById('article-title');
  const articleByline = document.getElementById('article-byline');
  const articleBody = document.getElementById('article-body');
  const metaSubject = document.getElementById('meta-subject');
  const metaFragment = document.getElementById('meta-fragment');
  const metaWhere = document.getElementById('meta-where');
  const metaTime = document.getElementById('meta-time');
  const metaTone = document.getElementById('meta-tone');
  const articleTag = document.getElementById('article-tag');

  let terminalInfo = null;

  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  tickClock();
  setInterval(tickClock, 30_000);

  function setConnection(online) {
    connectionDot.classList.toggle('online', online);
  }

  function setMeta(metadata, draft) {
    const m = metadata || {};
    metaSubject.textContent = m.subject || draft?.subject?.title || '—';
    metaFragment.textContent =
      m.storyFragment || draft?.storyFragment?.title || draft?.action?.title || '—';
    metaWhere.textContent = m.where || draft?.location?.title || '—';
    metaTime.textContent = m.time || draft?.time?.title || '—';
    metaTone.textContent = m.tone || draft?.tone?.title || '—';
  }

  function setTerminalStatus(terminalPublish) {
    if (!terminalStatusEl) return;

    const tp = terminalPublish || {};
    terminalStatusEl.hidden = false;
    terminalStatusEl.classList.remove('is-ok', 'is-warn');

    const name = terminalInfo?.terminalName || 'CIU265_IXDProject_Web';

    if (tp.ok) {
      terminalStatusEl.classList.add('is-ok');
      terminalStatusEl.textContent = `Sent to terminal wall (${name}). The Gothenburg Posten display will update via Supabase Realtime.`;
      return;
    }

    if (tp.skipped && tp.reason === 'no_service_role_key') {
      terminalStatusEl.classList.add('is-warn');
      terminalStatusEl.textContent = `Shown on this local monitor only. Add SUPABASE_SERVICE_ROLE_KEY to Typewriter/.env and restart npm start.`;
      return;
    }

    if (tp.skipped && (tp.reason === 'wrong_key_type' || tp.reason === 'anon_key_not_service_role')) {
      terminalStatusEl.classList.add('is-warn');
      terminalStatusEl.textContent = `Local copy published. Terminal not updated: .env must use service_role, not anon/publishable.${tp.hint ? ` ${tp.hint}` : ''}`;
      return;
    }

    if (tp.skipped && tp.reason === 'terminal_disabled') {
      terminalStatusEl.hidden = true;
      return;
    }

    terminalStatusEl.classList.add('is-warn');
    const hint = tp.hint ? ` ${tp.hint}` : '';
    terminalStatusEl.textContent = `Local copy published; terminal wall not updated (${tp.reason || 'unknown'}).${hint}`;
  }

  function applyRoom(snapshot) {
    root.classList.remove('state-idle', 'state-waiting', 'state-published');

    if (snapshot.status === 'published' && snapshot.article) {
      root.classList.add('state-published');
      const a = snapshot.article;
      articleTitle.textContent = a.title || a.generatedDraft?.headline || '';
      articleByline.textContent = `${a.time?.title || a.metadata?.time || ''} period filter · ${a.tone?.title || a.metadata?.tone || ''} tone · speculative local edition`;
      articleBody.textContent = a.body || a.generatedDraft?.body || '';
      setMeta(a.metadata, a);
      articleTag.textContent =
        a.tag ||
        a.generatedDraft?.label ||
        'Archive-inspired generated article. This is not an original historical news article.';
      setTerminalStatus(a.terminalPublish);
      return;
    }

    if (terminalStatusEl) {
      terminalStatusEl.hidden = true;
      terminalStatusEl.classList.remove('is-ok', 'is-warn');
    }

    if (snapshot.status === 'draft_waiting' && snapshot.draft) {
      root.classList.add('state-waiting');
      const d = snapshot.draft;
      const headline = d.generatedDraft?.headline || '';
      const tone = d.tone?.title || '';
      const time = d.time?.title || '';
      const terminalName = terminalInfo?.terminalName || 'terminal wall';
      waitingSummary.textContent = headline
        ? `"${headline}" is on the desk (${tone}, ${time} filter). Publish to show here and push to ${terminalName}.`
        : `A speculative draft is ready. Publish to show here and push to ${terminalName}.`;
      return;
    }

    root.classList.add('state-idle');
  }

  fetch('/api/terminal')
    .then((r) => r.json())
    .then((info) => {
      terminalInfo = info;
    })
    .catch(() => {});

  socket.on('connect', () => setConnection(true));
  socket.on('disconnect', () => setConnection(false));
  socket.on('room:update', applyRoom);

  function showPublishFeedback(message, isError) {
    if (!terminalStatusEl) return;
    terminalStatusEl.hidden = false;
    terminalStatusEl.classList.remove('is-ok', 'is-warn');
    terminalStatusEl.classList.add(isError ? 'is-warn' : 'is-ok');
    terminalStatusEl.textContent = message;
  }

  btnPublish.addEventListener('click', () => {
    showPublishFeedback('Publishing…', false);
    socket.emit('publish:trigger', {}, (res) => {
      if (!res) {
        showPublishFeedback('No response from server. Is npm start running on this computer?', true);
        return;
      }
      if (!res.ok && res.reason === 'no_draft') {
        showPublishFeedback(
          'No draft waiting. On the iPad, open /editor, complete all 5 variables, and tap Send to newsroom first.',
          true
        );
        return;
      }
      if (res.ok) {
        applyRoom({ status: 'published', article: res.article, draft: null });
      }
    });
  });

  btnReset.addEventListener('click', () => {
    socket.emit('room:reset');
  });
})();
