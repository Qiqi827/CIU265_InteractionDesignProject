const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'newsConfig.json');

let cached = null;
let cachedMtime = 0;

function loadNewsConfig(force = false) {
  const stat = fs.statSync(CONFIG_PATH);
  if (!force && cached && stat.mtimeMs === cachedMtime) {
    return cached;
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  cached = JSON.parse(raw);
  cachedMtime = stat.mtimeMs;
  return cached;
}

function findOption(list, id) {
  if (!list?.length || !id) return null;
  return list.find((item) => item.id === id) || null;
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

function resolveSelection(config, { storyFragmentId, subjectId, locationId, timeId, toneId }) {
  const storyFragment = findOption(config.storyFragments, storyFragmentId);
  const subject = findOption(config.subjects, subjectId);
  const location = findOption(config.locations, locationId);
  const time = findOption(config.times, timeId);
  const tone = findOption(config.tones, toneId);

  if (!storyFragment || !subject || !location || !time || !tone) {
    return null;
  }

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

module.exports = {
  CONFIG_PATH,
  loadNewsConfig,
  findOption,
  isAllowedForFragment,
  resolveSelection,
};
