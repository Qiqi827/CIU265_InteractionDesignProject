/** Browser mirror of lib/templateEngine.js + lib/newsGenerator.js — keep in sync. */
(function (global) {
  function hashSeed(parts) {
    const str = parts.filter(Boolean).join('|');
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function pickTemplate(templates, seed) {
    if (!templates?.length) return '';
    return templates[seed % templates.length];
  }

  function getLabels(config) {
    const labels = config?.labels || {};
    return {
      draftLabel:
        labels.draftLabel ||
        config.editorDraftLabel ||
        'Archive-inspired generated draft, not a historical article.',
      articleLabel:
        labels.articleLabel ||
        config.articleLabel ||
        'Archive-inspired generated article. This is not an original historical news article.',
      factNotice:
        labels.factNotice ||
        'Facts come from the selected story fragment. Time and tone only change the editorial voice.',
      waitingNotice:
        labels.waitingNotice ||
        'Awaiting send to newsroom — not published until typewriter key is pressed.',
    };
  }

  function buildTemplateVars(storyFragment, subject, location, time, tone) {
    const timeSubtitle = time.subtitle || '';
    return {
      storyFragmentTitle: storyFragment.title,
      fragmentTitle: storyFragment.title,
      fragmentShortLabel: storyFragment.shortLabel || '',
      storyAngle: storyFragment.storyAngle || '',
      editorNote: storyFragment.editorNote || '',
      baseFact: storyFragment.baseFact || '',
      subjectTitle: subject.title,
      subjectGenerationHint: subject.generationHint || '',
      subjectRoleType: subject.roleType || '',
      locationTitle: location.title,
      locationGenerationHint: location.generationHint || '',
      locationType: location.locationType || '',
      timeTitle: time.title,
      timeSubtitle,
      timeShortLabel: time.shortLabel || '',
      timeStyleHint: time.styleHint || '',
      toneTitle: tone.title,
      toneStyleHint: tone.styleHint || '',
      toneDoNot: tone.doNot || '',
      subject: subject.title,
      location: location.title,
      time: time.title,
      tone: tone.title,
    };
  }

  function fillTemplate(template, vars) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const val = vars[key];
      return val !== undefined && val !== null ? String(val) : `{${key}}`;
    });
  }

  function appendArticleLabel(body, label) {
    const trimmed = (body || '').trim();
    const tag =
      label ||
      'Archive-inspired generated article. This is not an original historical news article.';
    if (!trimmed) return tag;
    if (trimmed.includes(tag)) return trimmed;
    return `${trimmed}\n\n${tag}`;
  }

  function composeBody(bodyRaw, vars) {
    const parts = [bodyRaw];
    if (vars.timeStyleHint) parts.push(vars.timeStyleHint);
    if (vars.toneStyleHint) parts.push(vars.toneStyleHint);
    if (vars.toneDoNot) parts.push(vars.toneDoNot);
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function findOption(list, id) {
    return list?.find((item) => item.id === id) || null;
  }

  function isAllowedForFragment(storyFragment, kind, id) {
    if (!storyFragment || !id) return false;
    const map = {
      subject: 'allowedSubjects',
      location: 'allowedLocations',
      time: 'allowedTimes',
      tone: 'allowedTones',
    };
    const key = map[kind];
    const allowed = storyFragment[key];
    return Array.isArray(allowed) && allowed.includes(id);
  }

  function resolveSelection(config, ids) {
    const storyFragment = findOption(config.storyFragments, ids.storyFragmentId);
    const subject = findOption(config.subjects, ids.subjectId);
    const location = findOption(config.locations, ids.locationId);
    const time = findOption(config.times, ids.timeId);
    const tone = findOption(config.tones, ids.toneId);

    if (!storyFragment || !subject || !location || !time || !tone) return null;

    if (
      !isAllowedForFragment(storyFragment, 'subject', subject.id) ||
      !isAllowedForFragment(storyFragment, 'location', location.id) ||
      !isAllowedForFragment(storyFragment, 'time', time.id) ||
      !isAllowedForFragment(storyFragment, 'tone', tone.id)
    ) {
      return null;
    }

    return { storyFragment, subject, location, time, tone };
  }

  function generateFromConfig(config, ids) {
    const resolved = resolveSelection(config, ids);
    if (!resolved) return null;
    const { storyFragment, subject, location, time, tone } = resolved;
    const vars = buildTemplateVars(storyFragment, subject, location, time, tone);
    const seed = hashSeed([storyFragment.id, subject.id, location.id, time.id, tone.id]);
    const globalTemplates = config.generationTemplates || {};
    const labels = getLabels(config);

    const headlinePool =
      storyFragment.headlineSeeds?.length > 0
        ? storyFragment.headlineSeeds
        : globalTemplates.headlineTemplates;

    const headline = fillTemplate(pickTemplate(headlinePool, seed), vars);
    const bodyCore = fillTemplate(
      pickTemplate(globalTemplates.bodyTemplates, seed + 1),
      vars
    );
    const bodyRaw = composeBody(bodyCore, vars);
    const summary = fillTemplate(
      pickTemplate(globalTemplates.editorSummaryTemplates, seed + 2),
      vars
    );

    return {
      storyFragment,
      subject,
      location,
      time,
      tone,
      headline,
      body: appendArticleLabel(bodyRaw, labels.articleLabel),
      summary,
      label: labels.articleLabel,
      editorDraftLabel: labels.draftLabel,
      factNotice: labels.factNotice,
      waitingNotice: labels.waitingNotice,
      baseFact: storyFragment.baseFact || '',
      storyAngle: storyFragment.storyAngle || '',
      editorNote: storyFragment.editorNote || '',
      metadata: {
        storyFragment: storyFragment.title,
        subject: subject.title,
        where: location.title,
        time: time.title,
        tone: tone.title,
      },
    };
  }

  global.TemplateEngine = {
    hashSeed,
    pickTemplate,
    getLabels,
    buildTemplateVars,
    fillTemplate,
    appendArticleLabel,
    composeBody,
    findOption,
    isAllowedForFragment,
    resolveSelection,
    generateFromConfig,
  };
})(typeof window !== 'undefined' ? window : globalThis);
