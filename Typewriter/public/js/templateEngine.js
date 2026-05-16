/** Browser mirror of lib/templateEngine.js — keep in sync when changing generation logic. */
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

  function buildTemplateVars(subject, action, location, time, tone) {
    return {
      subjectTitle: subject.title,
      actionTitle: action.title,
      locationTitle: location.title,
      timeTitle: time.title,
      toneTitle: tone.title,
      subjectDescription: subject.description || '',
      actionDescription: action.description || '',
      locationDescription: location.description || '',
      timeDescription: time.description || '',
      toneDescription: tone.description || '',
      timeStyleHint: time.styleHint || '',
      toneStyleHint: tone.styleHint || '',
      subject: subject.title,
      action: action.title,
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

  function findOption(list, id) {
    return list?.find((item) => item.id === id) || null;
  }

  function resolveSelection(config, ids) {
    const subject = findOption(config.subjects, ids.subjectId);
    const action = findOption(config.actions, ids.actionId);
    const location = findOption(config.locations, ids.locationId);
    const time = findOption(config.times, ids.timeId);
    const tone = findOption(config.tones, ids.toneId);
    if (!subject || !action || !location || !time || !tone) return null;
    return { subject, action, location, time, tone };
  }

  function generateFromConfig(config, ids) {
    const resolved = resolveSelection(config, ids);
    if (!resolved) return null;
    const { subject, action, location, time, tone } = resolved;
    const vars = buildTemplateVars(subject, action, location, time, tone);
    const seed = hashSeed([subject.id, action.id, location.id, time.id, tone.id]);
    const templates = config.generationTemplates || {};

    return {
      subject,
      action,
      location,
      time,
      tone,
      headline: fillTemplate(pickTemplate(templates.headlineTemplates, seed), vars),
      body: fillTemplate(pickTemplate(templates.bodyTemplates, seed + 1), vars),
      summary: fillTemplate(pickTemplate(templates.editorSummaryTemplates, seed + 2), vars),
      label: config.articleLabel || '',
      editorDraftLabel: config.editorDraftLabel || '',
      metadata: {
        subject: subject.title,
        action: action.title,
        where: location.title,
        time: time.title,
        tone: tone.title,
      },
    };
  }

  global.TemplateEngine = {
    hashSeed,
    pickTemplate,
    buildTemplateVars,
    fillTemplate,
    findOption,
    resolveSelection,
    generateFromConfig,
  };
})(typeof window !== 'undefined' ? window : globalThis);
