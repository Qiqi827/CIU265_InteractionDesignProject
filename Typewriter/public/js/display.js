(function () {
  const socket = io();
  const root = document.getElementById('display-root');
  const clockEl = document.getElementById('display-clock');
  const waitingSummary = document.getElementById('waiting-summary');
  const connectionDot = document.getElementById('connection-dot');
  const btnEnableSound = document.getElementById('btn-enable-sound');
  const btnPublish = document.getElementById('btn-publish');
  const btnReset = document.getElementById('btn-reset');
  const terminalStatusEl = document.getElementById('terminal-status');
  const draftReceivedStamp = document.getElementById('draft-received-stamp');

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
  let roomHydrated = false;
  let lastDraftSentAt = null;
  let lastPublishedAt = null;
  let draftStampTimer = null;
  let publishAnimTimer = null;

  let soundEnabled = false;

  const TYPEWRITER_PATHS = [
    '/sounds/typewriter-01.mp3',
    '/sounds/typewriter-02.mp3',
    '/sounds/typewriter-03.mp3',
  ];

  const sounds = {
    draftReceived: new Audio('/sounds/draft-received.mp3'),
    publish: new Audio('/sounds/publish.mp3'),
  };

  function preloadTypewriterSounds() {
    TYPEWRITER_PATHS.forEach((src) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.load();
    });
  }

  function playRandomTypewriterSound() {
    if (!soundEnabled) {
      console.log('sound not enabled');
      return;
    }
    const src = TYPEWRITER_PATHS[Math.floor(Math.random() * TYPEWRITER_PATHS.length)];
    const audio = new Audio(src);
    audio.play().catch((err) => console.warn('typewriter sound:', err));
  }

  function playSound(sound) {
    if (!soundEnabled) {
      console.log('sound not enabled');
      return;
    }
    if (!sound) return;
    sound.currentTime = 0;
    sound.play().catch((err) => soundEnabled && console.warn(err));
  }

  function unlockSounds() {
    sounds.draftReceived.load();
    sounds.publish.load();
    preloadTypewriterSounds();

    const unlockSmall = [sounds.draftReceived, sounds.publish].map((audio) =>
      audio.play().then(
        () => {
          audio.pause();
          audio.currentTime = 0;
        },
        () => {}
      )
    );

    Promise.all(unlockSmall).finally(() => {
      soundEnabled = true;
      if (btnEnableSound) {
        btnEnableSound.textContent = 'Sound enabled';
        btnEnableSound.classList.add('is-enabled');
        btnEnableSound.disabled = true;
      }
    });
  }

  function showDraftReceivedFeedback() {
    if (draftReceivedStamp) {
      draftReceivedStamp.hidden = false;
      draftReceivedStamp.setAttribute('aria-hidden', 'false');
      draftReceivedStamp.classList.remove('is-active');
      void draftReceivedStamp.offsetWidth;
      draftReceivedStamp.classList.add('is-active');
    }
    root.classList.add('is-draft-arrival');
    clearTimeout(draftStampTimer);
    draftStampTimer = setTimeout(() => {
      root.classList.remove('is-draft-arrival');
      if (draftReceivedStamp) {
        draftReceivedStamp.classList.remove('is-active');
        draftReceivedStamp.hidden = true;
        draftReceivedStamp.setAttribute('aria-hidden', 'true');
      }
    }, 3200);
  }

  function showPublishFeedback() {
    root.classList.remove('is-publishing');
    void root.offsetWidth;
    root.classList.add('is-publishing');
    clearTimeout(publishAnimTimer);
    publishAnimTimer = setTimeout(() => {
      root.classList.remove('is-publishing');
    }, 2800);
  }

  function onDraftReceived() {
    playSound(sounds.draftReceived);
    showDraftReceivedFeedback();
  }

  function onPublished() {
    playSound(sounds.publish);
    showPublishFeedback();
  }

  function syncSoundMarkers(snapshot) {
    if (snapshot.status === 'draft_waiting' && snapshot.draft?.sentAt) {
      lastDraftSentAt = snapshot.draft.sentAt;
    } else if (snapshot.status !== 'draft_waiting') {
      lastDraftSentAt = null;
    }

    if (snapshot.status === 'published' && snapshot.article?.publishedAt) {
      lastPublishedAt = snapshot.article.publishedAt;
    } else if (snapshot.status !== 'published') {
      lastPublishedAt = null;
    }
  }

  function handleRoomSideEffects(snapshot) {
    if (!roomHydrated) {
      roomHydrated = true;
      syncSoundMarkers(snapshot);
      return;
    }

    const draft = snapshot.draft;
    if (
      snapshot.status === 'draft_waiting' &&
      draft?.sentAt &&
      draft.sentAt !== lastDraftSentAt
    ) {
      lastDraftSentAt = draft.sentAt;
      onDraftReceived();
      return;
    }

    const article = snapshot.article;
    if (
      snapshot.status === 'published' &&
      article?.publishedAt &&
      article.publishedAt !== lastPublishedAt
    ) {
      lastPublishedAt = article.publishedAt;
      onPublished();
    }
  }

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

  function onRoomUpdate(snapshot) {
    handleRoomSideEffects(snapshot);
    applyRoom(snapshot);
  }

  fetch('/api/terminal')
    .then((r) => r.json())
    .then((info) => {
      terminalInfo = info;
    })
    .catch(() => {});

  if (btnEnableSound) {
    btnEnableSound.addEventListener('click', () => {
      unlockSounds();
    });
  }

  socket.on('connect', () => setConnection(true));
  socket.on('disconnect', () => setConnection(false));
  socket.on('room:update', onRoomUpdate);
  socket.on('editor:selection-feedback', () => {
    playRandomTypewriterSound();
  });

  function showPublishFeedbackMessage(message, isError) {
    if (!terminalStatusEl) return;
    terminalStatusEl.hidden = false;
    terminalStatusEl.classList.remove('is-ok', 'is-warn');
    terminalStatusEl.classList.add(isError ? 'is-warn' : 'is-ok');
    terminalStatusEl.textContent = message;
  }

  btnPublish.addEventListener('click', () => {
    showPublishFeedbackMessage('Publishing…', false);
    socket.emit('publish:trigger', {}, (res) => {
      if (!res) {
        showPublishFeedbackMessage('No response from server. Is npm start running on this computer?', true);
        return;
      }
      if (!res.ok && res.reason === 'no_draft') {
        showPublishFeedbackMessage(
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
