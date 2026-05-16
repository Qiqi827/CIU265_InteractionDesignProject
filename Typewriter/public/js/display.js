(function () {
  const socket = io();
  const root = document.getElementById('display-root');
  const clockEl = document.getElementById('display-clock');
  const waitingSummary = document.getElementById('waiting-summary');
  const connectionDot = document.getElementById('connection-dot');
  const btnPublish = document.getElementById('btn-publish');
  const btnReset = document.getElementById('btn-reset');

  const articleTitle = document.getElementById('article-title');
  const articleByline = document.getElementById('article-byline');
  const articleBody = document.getElementById('article-body');
  const metaSubject = document.getElementById('meta-subject');
  const metaAction = document.getElementById('meta-action');
  const metaWhere = document.getElementById('meta-where');
  const metaTime = document.getElementById('meta-time');
  const metaTone = document.getElementById('meta-tone');
  const articleTag = document.getElementById('article-tag');

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
    metaAction.textContent = m.action || draft?.action?.title || '—';
    metaWhere.textContent = m.where || draft?.location?.title || '—';
    metaTime.textContent = m.time || draft?.time?.title || '—';
    metaTone.textContent = m.tone || draft?.tone?.title || '—';
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
      return;
    }

    if (snapshot.status === 'draft_waiting' && snapshot.draft) {
      root.classList.add('state-waiting');
      const d = snapshot.draft;
      const headline = d.generatedDraft?.headline || '';
      const tone = d.tone?.title || '';
      const time = d.time?.title || '';
      waitingSummary.textContent = headline
        ? `"${headline}" is on the editor's desk (${tone}, ${time} filter). Press the typewriter key to publish.`
        : 'A speculative draft is ready. Press the typewriter key to publish.';
      return;
    }

    root.classList.add('state-idle');
  }

  socket.on('connect', () => setConnection(true));
  socket.on('disconnect', () => setConnection(false));
  socket.on('room:update', applyRoom);

  btnPublish.addEventListener('click', () => {
    socket.emit('publish:trigger', {}, (res) => {
      if (!res?.ok && res?.reason === 'no_draft') {
        console.warn('No draft waiting to publish.');
      }
    });
  });

  btnReset.addEventListener('click', () => {
    socket.emit('room:reset');
  });
})();
