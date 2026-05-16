(function () {
  const socket = io();
  const workspace = document.getElementById('workspace');
  const editorLoading = document.getElementById('editor-loading');
  const form = document.getElementById('editor-form');
  const draftBoard = document.getElementById('draft-board');
  const draftHint = document.getElementById('draft-hint');
  const statusBanner = document.getElementById('status-banner');
  const sendBtn = document.getElementById('send-btn');

  const grids = {
    subject: document.getElementById('subject-grid'),
    action: document.getElementById('action-grid'),
    where: document.getElementById('where-grid'),
    time: document.getElementById('time-bar'),
    tone: document.getElementById('tone-grid'),
  };

  let config = null;
  const selection = {
    subjectId: null,
    actionId: null,
    locationId: null,
    timeId: null,
    toneId: null,
  };

  function escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
  }

  function renderTags(tags) {
    if (!tags?.length) return '';
    return tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  }

  function renderVarCards(container, items, selectedId, onSelect) {
    container.innerHTML = items
      .map(
        (item) => `
      <button type="button" class="story-card ${item.id === selectedId ? 'is-selected' : ''}"
        data-id="${item.id}" role="option" aria-selected="${item.id === selectedId}">
        <span class="story-card__title">${escapeHtml(item.title)}</span>
        <span class="story-card__blurb">${escapeHtml(item.description)}</span>
        <span class="story-card__tags">${renderTags(item.tags)}</span>
      </button>`
      )
      .join('');

    container.querySelectorAll('.story-card').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  }

  function renderTimeBar(items, selectedId, onSelect) {
    grids.time.innerHTML = items
      .map(
        (item) => `
      <button type="button" class="period-btn ${item.id === selectedId ? 'is-active' : ''}"
        data-id="${item.id}" aria-pressed="${item.id === selectedId}">
        <span class="period-btn__era">${escapeHtml(item.title)}</span>
        <span class="period-btn__hint">${escapeHtml(item.description)}</span>
      </button>`
      )
      .join('');

    grids.time.querySelectorAll('.period-btn').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  }

  function renderToneButtons(items, selectedId, onSelect) {
    grids.tone.innerHTML = items
      .map(
        (item) => `
      <button type="button" class="framing-btn ${item.id === selectedId ? 'is-active' : ''}"
        data-id="${item.id}" aria-pressed="${item.id === selectedId}">
        <span class="framing-btn__label">${escapeHtml(item.title)}</span>
        <span class="framing-btn__hint">${escapeHtml(item.description)}</span>
      </button>`
      )
      .join('');

    grids.tone.querySelectorAll('.framing-btn').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  }

  function isComplete() {
    return Boolean(
      selection.subjectId &&
        selection.actionId &&
        selection.locationId &&
        selection.timeId &&
        selection.toneId
    );
  }

  function getGenerated() {
    if (!config || !isComplete()) return null;
    return TemplateEngine.generateFromConfig(config, {
      subjectId: selection.subjectId,
      actionId: selection.actionId,
      locationId: selection.locationId,
      timeId: selection.timeId,
      toneId: selection.toneId,
    });
  }

  function updateDraftBoard() {
    const complete = isComplete();
    sendBtn.disabled = !complete;
    draftHint.hidden = complete;

    if (!complete) {
      draftBoard.innerHTML =
        '<p class="draft-empty">Choose all five variables to assemble your desk note.</p>';
      return null;
    }

    const draft = getGenerated();
    if (!draft) {
      draftBoard.innerHTML =
        '<p class="draft-empty">Could not generate draft from current selection.</p>';
      sendBtn.disabled = true;
      return null;
    }

    const m = draft.metadata;
    draftBoard.innerHTML = [
      '<dl class="draft-vars">',
      `<div><dt>Subject</dt><dd>${escapeHtml(m.subject)}</dd></div>`,
      `<div><dt>Action</dt><dd>${escapeHtml(m.action)}</dd></div>`,
      `<div><dt>Where</dt><dd>${escapeHtml(m.where)}</dd></div>`,
      `<div><dt>Time</dt><dd>${escapeHtml(m.time)}</dd></div>`,
      `<div><dt>Tone</dt><dd>${escapeHtml(m.tone)}</dd></div>`,
      '</dl>',
      '<div class="draft-field">',
      '<span class="draft-field__label">Possible headline</span>',
      `<p class="draft-headline">${escapeHtml(draft.headline)}</p>`,
      '</div>',
      '<div class="draft-field">',
      '<span class="draft-field__label">Short editorial summary</span>',
      `<p class="draft-summary">${escapeHtml(draft.summary)}</p>`,
      '</div>',
      `<p class="draft-label">${escapeHtml(draft.editorDraftLabel)}</p>`,
      '<p class="draft-pending">Awaiting send to newsroom ? not published until typewriter key is pressed.</p>',
    ].join('');

    return draft;
  }

  function rerenderAll() {
    renderVarCards(grids.subject, config.subjects, selection.subjectId, (id) => {
      selection.subjectId = id;
      rerenderAll();
    });
    renderVarCards(grids.action, config.actions, selection.actionId, (id) => {
      selection.actionId = id;
      rerenderAll();
    });
    renderVarCards(grids.where, config.locations, selection.locationId, (id) => {
      selection.locationId = id;
      rerenderAll();
    });
    renderTimeBar(config.times, selection.timeId, (id) => {
      selection.timeId = id;
      rerenderAll();
    });
    renderToneButtons(config.tones, selection.toneId, (id) => {
      selection.toneId = id;
      rerenderAll();
    });
    updateDraftBoard();
  }

  function showStatus(message, isError) {
    statusBanner.hidden = false;
    statusBanner.classList.add('is-visible');
    statusBanner.innerHTML = isError
      ? `<strong>Connection issue</strong>${escapeHtml(message)}`
      : `<strong>Draft on desk</strong>${escapeHtml(message)}`;
  }

  function initDefaults() {
    selection.subjectId = config.subjects[0]?.id ?? null;
    selection.actionId = config.actions[0]?.id ?? null;
    selection.locationId = config.locations[0]?.id ?? null;
    selection.timeId = config.times[config.times.length - 1]?.id ?? null;
    selection.toneId = config.tones[0]?.id ?? null;
  }

  async function boot() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('config fetch failed');
      config = await res.json();
      initDefaults();
      workspace.hidden = false;
      editorLoading.hidden = true;
      rerenderAll();
    } catch (err) {
      editorLoading.textContent =
        'Could not load editorial database. Is the newsroom server running?';
      console.error(err);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isComplete()) {
      draftHint.hidden = false;
      return;
    }

    const draft = getGenerated();
    if (!draft) return;

    sendBtn.disabled = true;
    const payload = {
      subject: draft.subject,
      action: draft.action,
      location: draft.location,
      time: draft.time,
      tone: draft.tone,
      generatedDraft: {
        headline: draft.headline,
        body: draft.body,
        summary: draft.summary,
        label: draft.label,
      },
    };

    socket.emit('draft:send', payload, (res) => {
      sendBtn.disabled = !isComplete();
      if (res?.ok) {
        showStatus(
          'Draft sent. Press the typewriter key to publish. This iPad only submits the draft ??the wall updates after the physical key.'
        );
      } else {
        showStatus('Could not reach the newsroom computer. Check Wi-Fi and that the server is running.', true);
      }
    });
  });

  boot();
})();
