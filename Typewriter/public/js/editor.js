(function () {
  const socket = io();
  const workspace = document.getElementById('workspace');
  const editorLoading = document.getElementById('editor-loading');
  const form = document.getElementById('editor-form');
  const draftBoard = document.getElementById('draft-board');
  const draftStatus = document.getElementById('draft-status');
  const draftHint = document.getElementById('draft-hint');
  const statusBanner = document.getElementById('status-banner');
  const fragmentNotice = document.getElementById('fragment-notice');
  const sendBtn = document.getElementById('send-btn');

  const grids = {
    fragment: document.getElementById('fragment-grid'),
    subject: document.getElementById('subject-grid'),
    where: document.getElementById('where-grid'),
    time: document.getElementById('time-bar'),
    tone: document.getElementById('tone-grid'),
  };

  let config = null;
  const selection = {
    storyFragmentId: null,
    subjectId: null,
    locationId: null,
    timeId: null,
    toneId: null,
  };

  function escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
  }

  function cardDisplayLine(item) {
    return item.shortLabel || '';
  }

  function draftTextFor(item) {
    return item?.draftText || item?.shortLabel || '';
  }

  function getLabels() {
    return TemplateEngine.getLabels(config || {});
  }

  function findItem(list, id) {
    return list?.find((item) => item.id === id) ?? null;
  }

  function getActiveFragment() {
    return findItem(config?.storyFragments, selection.storyFragmentId);
  }

  function isAllowed(kind, id) {
    const fragment = getActiveFragment();
    if (!fragment || !id) return false;
    return TemplateEngine.isAllowedForFragment(fragment, kind, id);
  }

  function clearInvalidSelections() {
    const cleared = [];
    if (selection.subjectId && !isAllowed('subject', selection.subjectId)) {
      selection.subjectId = null;
      cleared.push('Subject / focus');
    }
    if (selection.locationId && !isAllowed('location', selection.locationId)) {
      selection.locationId = null;
      cleared.push('Where / scene');
    }
    if (selection.timeId && !isAllowed('time', selection.timeId)) {
      selection.timeId = null;
      cleared.push('Time filter');
    }
    if (selection.toneId && !isAllowed('tone', selection.toneId)) {
      selection.toneId = null;
      cleared.push('Tone / stance');
    }
    return cleared;
  }

  function showFragmentNotice(message) {
    if (!fragmentNotice) return;
    if (!message) {
      fragmentNotice.hidden = true;
      fragmentNotice.textContent = '';
      return;
    }
    fragmentNotice.hidden = false;
    fragmentNotice.textContent = message;
  }

  function renderVarCards(
    container,
    items,
    selectedId,
    allowedIds,
    onSelect,
    { requireFragment = true, showTags = true } = {}
  ) {
    const fragment = getActiveFragment();
    const hasFragment = Boolean(fragment);

    container.innerHTML = items
      .map((item) => {
        const allowed =
          !requireFragment || (hasFragment && (!allowedIds || allowedIds.includes(item.id)));
        const line = cardDisplayLine(item);
        const blurb = line
          ? `<span class="story-card__blurb">${escapeHtml(line)}</span>`
          : '';
        const tags =
          showTags && item.tags?.length
            ? `<span class="story-card__tags">${renderTags(item.tags)}</span>`
            : '';
        const unavailable = !allowed
          ? '<span class="story-card__unavailable">Unavailable</span>'
          : '';
        const selected = item.id === selectedId;
        const classes = [
          'story-card',
          selected && allowed ? 'is-selected' : '',
          !allowed ? 'is-unavailable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return `
      <button type="button" class="${classes}"
        data-id="${item.id}" role="option"
        aria-selected="${selected && allowed}"
        aria-disabled="${!allowed}"
        ${!allowed ? 'disabled' : ''}>
        <span class="story-card__title">${escapeHtml(item.title)}</span>
        ${blurb}
        ${tags}
        ${unavailable}
      </button>`;
      })
      .join('');

    container.querySelectorAll('.story-card:not(.is-unavailable)').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  }

  function renderTags(tags) {
    if (!tags?.length) return '';
    return tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  }

  function renderTimeBar(items, selectedId, allowedIds, onSelect) {
    const fragment = getActiveFragment();
    const hasFragment = Boolean(fragment);

    grids.time.innerHTML = items
      .map((item) => {
        const allowed = hasFragment && allowedIds.includes(item.id);
        const style = item.subtitle
          ? `<span class="period-btn__style">${escapeHtml(item.subtitle)}</span>`
          : '';
        const keywords = item.shortLabel
          ? `<span class="period-btn__keywords">${escapeHtml(item.shortLabel)}</span>`
          : '';
        const active = item.id === selectedId && allowed;
        const classes = ['period-btn', active ? 'is-active' : '', !allowed ? 'is-unavailable' : '']
          .filter(Boolean)
          .join(' ');

        return `
      <button type="button" class="${classes}"
        data-id="${item.id}" aria-pressed="${active}"
        aria-disabled="${!allowed}" ${!allowed ? 'disabled' : ''}>
        <span class="period-btn__era">${escapeHtml(item.title)}</span>
        ${style}
        ${keywords}
        ${!allowed ? '<span class="period-btn__unavailable">Unavailable</span>' : ''}
      </button>`;
      })
      .join('');

    grids.time.querySelectorAll('.period-btn:not(.is-unavailable)').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  }

  function renderToneButtons(items, selectedId, allowedIds, onSelect) {
    const fragment = getActiveFragment();
    const hasFragment = Boolean(fragment);

    grids.tone.innerHTML = items
      .map((item) => {
        const allowed = hasFragment && allowedIds.includes(item.id);
        const hint = cardDisplayLine(item);
        const hintHtml = hint
          ? `<span class="framing-btn__hint">${escapeHtml(hint)}</span>`
          : '';
        const active = item.id === selectedId && allowed;
        const classes = ['framing-btn', active ? 'is-active' : '', !allowed ? 'is-unavailable' : '']
          .filter(Boolean)
          .join(' ');

        return `
      <button type="button" class="${classes}"
        data-id="${item.id}" aria-pressed="${active}"
        aria-disabled="${!allowed}" ${!allowed ? 'disabled' : ''}>
        <span class="framing-btn__label">${escapeHtml(item.title)}</span>
        ${hintHtml}
        ${!allowed ? '<span class="framing-btn__unavailable">Unavailable</span>' : ''}
      </button>`;
      })
      .join('');

    grids.tone.querySelectorAll('.framing-btn:not(.is-unavailable)').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.id));
    });
  }

  function isComplete() {
    return Boolean(
      selection.storyFragmentId &&
        selection.subjectId &&
        selection.locationId &&
        selection.timeId &&
        selection.toneId
    );
  }

  function getGenerated() {
    if (!config || !isComplete()) return null;
    return TemplateEngine.generateFromConfig(config, {
      storyFragmentId: selection.storyFragmentId,
      subjectId: selection.subjectId,
      locationId: selection.locationId,
      timeId: selection.timeId,
      toneId: selection.toneId,
    });
  }

  function getResolvedSelection() {
    if (!config) return null;
    return {
      storyFragment: findItem(config.storyFragments, selection.storyFragmentId),
      subject: findItem(config.subjects, selection.subjectId),
      location: findItem(config.locations, selection.locationId),
      time: findItem(config.times, selection.timeId),
      tone: findItem(config.tones, selection.toneId),
    };
  }

  function hasAnySelection() {
    return Boolean(
      selection.storyFragmentId ||
        selection.subjectId ||
        selection.locationId ||
        selection.timeId ||
        selection.toneId
    );
  }

  function shortBodyPreview(body, articleLabel) {
    let text = (body || '').trim();
    if (articleLabel && text.includes(articleLabel)) {
      text = text.replace(articleLabel, '').trim();
    }
    const maxLen = 280;
    if (text.length <= maxLen) return text;
    const cut = text.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return `${lastSpace > 120 ? cut.slice(0, lastSpace) : cut}…`;
  }

  function checklistValue(item, { timeStyle = false } = {}) {
    if (!item) {
      return '<span class="draft-checklist__placeholder">Not selected yet</span>';
    }
    let title = escapeHtml(item.title);
    if (timeStyle && item.subtitle) {
      title += `<span class="draft-checklist__sub"> — ${escapeHtml(item.subtitle)}</span>`;
    }
    const text = draftTextFor(item);
    const detail = text
      ? `<span class="draft-checklist__detail">${escapeHtml(text)}</span>`
      : '';
    return `<span class="draft-checklist__value">${title}</span>${detail}`;
  }

  function renderBuildingDraft(resolved) {
    const { storyFragment, subject, location, time, tone } = resolved;
    const fragmentFact =
      storyFragment?.baseFact
        ? `<p class="draft-checklist__fact">Base fact: ${escapeHtml(storyFragment.baseFact)}</p>`
        : '';

    const rows = [
      ['Story fragment', storyFragment, { extra: fragmentFact }],
      ['Subject / focus', subject],
      ['Where / scene', location],
      ['Time filter', time, { timeStyle: true }],
      ['Tone / editorial stance', tone],
    ];

    const list = rows
      .map(([label, item, opts = {}]) => {
        const { timeStyle = false, extra = '' } = opts;
        const selected = Boolean(item);
        return `
      <li class="draft-checklist__row${selected ? ' is-filled' : ''}">
        <span class="draft-checklist__label">${label}</span>
        <div class="draft-checklist__content">
          ${checklistValue(item, { timeStyle })}
          ${extra}
        </div>
      </li>`;
      })
      .join('');

    draftBoard.className = 'draft-board draft-board--building';
    draftBoard.innerHTML = `
      <p class="draft-building-title">Draft building</p>
      <ul class="draft-checklist">${list}</ul>
      <p class="draft-building-hint">Complete all editorial variables to generate a headline and article preview.</p>`;
  }

  function renderArticlePreview(draft) {
    const labels = getLabels();
    const factNotice = escapeHtml(draft.factNotice || labels.factNotice);
    const previewBody = escapeHtml(shortBodyPreview(draft.body, draft.label));
    const meta = draft.metadata || {};

    draftBoard.className = 'draft-board draft-board--preview';
    draftBoard.innerHTML = `
      <h3 class="draft-preview__headline">${escapeHtml(draft.headline)}</h3>
      <p class="draft-preview__body">${previewBody}</p>
      <p class="draft-preview__label">${escapeHtml(draft.editorDraftLabel)}</p>
      <dl class="draft-meta-tags">
        <div><dt>Story</dt><dd>${escapeHtml(meta.storyFragment || draft.storyFragment.title)}</dd></div>
        <div><dt>Focus</dt><dd>${escapeHtml(meta.subject || draft.subject.title)}</dd></div>
        <div><dt>Scene</dt><dd>${escapeHtml(meta.where || draft.location.title)}</dd></div>
        <div><dt>Time</dt><dd>${escapeHtml(meta.time || draft.time.title)}</dd></div>
        <div><dt>Tone</dt><dd>${escapeHtml(meta.tone || draft.tone.title)}</dd></div>
      </dl>
      <details class="draft-source">
        <summary>Source fragment</summary>
        ${
          draft.baseFact
            ? `<p class="draft-source__fact">Base fact: ${escapeHtml(draft.baseFact)}</p>`
            : ''
        }
        <p class="draft-source__notice">${factNotice}</p>
      </details>`;
  }

  function updateDraftStatus(complete) {
    if (!draftStatus) return;
    if (statusBanner.classList.contains('is-visible') && !statusBanner.hidden) {
      draftStatus.textContent = 'Sent to newsroom';
      draftStatus.className = 'draft-status draft-status--sent';
      return;
    }
    if (complete) {
      draftStatus.textContent = 'Ready to send';
      draftStatus.className = 'draft-status draft-status--ready';
    } else if (hasAnySelection()) {
      draftStatus.textContent = 'Building draft';
      draftStatus.className = 'draft-status draft-status--building';
    } else {
      draftStatus.textContent = 'Select variables';
      draftStatus.className = 'draft-status';
    }
  }

  function updateDraftBoard() {
    const complete = isComplete();
    sendBtn.disabled = !complete;
    draftHint.hidden = complete;
    updateDraftStatus(complete);

    if (!hasAnySelection()) {
      draftBoard.className = 'draft-board';
      draftBoard.innerHTML =
        '<p class="draft-empty">Select a story fragment to begin your draft.</p>';
      return null;
    }

    if (!complete) {
      renderBuildingDraft(getResolvedSelection());
      return null;
    }

    const draft = getGenerated();
    if (!draft) {
      draftBoard.className = 'draft-board';
      draftBoard.innerHTML =
        '<p class="draft-empty">Could not generate draft from current selection.</p>';
      sendBtn.disabled = true;
      return null;
    }

    renderArticlePreview(draft);
    return draft;
  }

  function onFragmentChange(id) {
    const prev = selection.storyFragmentId;
    selection.storyFragmentId = id;

    const cleared = clearInvalidSelections();
    if (prev && prev !== id && cleared.length) {
      showFragmentNotice(
        `Story fragment changed — please re-select: ${cleared.join(', ')}.`
      );
    } else if (prev !== id) {
      showFragmentNotice(null);
    }

    rerenderAll();
  }

  function rerenderAll() {
    const fragment = getActiveFragment();

    renderVarCards(
      grids.fragment,
      config.storyFragments,
      selection.storyFragmentId,
      null,
      onFragmentChange,
      { requireFragment: false, showTags: false }
    );

    const allowedSubjects = fragment?.allowedSubjects || [];
    const allowedLocations = fragment?.allowedLocations || [];
    const allowedTimes = fragment?.allowedTimes || [];
    const allowedTones = fragment?.allowedTones || [];

    renderVarCards(
      grids.subject,
      config.subjects,
      selection.subjectId,
      allowedSubjects,
      (id) => {
        selection.subjectId = id;
        rerenderAll();
      }
    );

    renderVarCards(
      grids.where,
      config.locations,
      selection.locationId,
      allowedLocations,
      (id) => {
        selection.locationId = id;
        rerenderAll();
      }
    );

    renderTimeBar(config.times, selection.timeId, allowedTimes, (id) => {
      selection.timeId = id;
      rerenderAll();
    });

    renderToneButtons(config.tones, selection.toneId, allowedTones, (id) => {
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
    updateDraftStatus(isComplete());
  }

  function initDefaults() {
    selection.storyFragmentId = config.storyFragments[0]?.id ?? null;
    selection.subjectId = null;
    selection.locationId = null;
    selection.timeId = null;
    selection.toneId = null;
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
      storyFragment: draft.storyFragment,
      location: draft.location,
      time: draft.time,
      tone: draft.tone,
      generatedDraft: {
        headline: draft.headline,
        body: draft.body,
        summary: draft.summary,
        label: draft.label,
        baseFact: draft.baseFact,
      },
    };

    socket.emit('draft:send', payload, (res) => {
      sendBtn.disabled = !isComplete();
      if (res?.ok) {
        showStatus(
          'Draft sent. Press the typewriter key to publish. This iPad only submits the draft — the wall updates after the physical key.'
        );
      } else {
        showStatus(
          'Could not reach the newsroom computer. Check Wi-Fi and that the server is running.',
          true
        );
      }
    });
  });

  boot();
})();
