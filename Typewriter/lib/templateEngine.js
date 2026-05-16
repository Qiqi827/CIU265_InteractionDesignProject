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

module.exports = {
  hashSeed,
  pickTemplate,
  buildTemplateVars,
  fillTemplate,
};
