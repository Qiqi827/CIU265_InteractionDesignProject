/**
 * Pure template substitution for archive-inspired news generation.
 */

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

module.exports = {
  hashSeed,
  pickTemplate,
  getLabels,
  buildTemplateVars,
  fillTemplate,
  appendArticleLabel,
  composeBody,
};
