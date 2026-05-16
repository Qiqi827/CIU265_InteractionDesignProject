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
  if (!list?.length) return null;
  return list.find((item) => item.id === id) || null;
}

function resolveSelection(config, { subjectId, actionId, locationId, timeId, toneId }) {
  const subject = findOption(config.subjects, subjectId);
  const action = findOption(config.actions, actionId);
  const location = findOption(config.locations, locationId);
  const time = findOption(config.times, timeId);
  const tone = findOption(config.tones, toneId);
  if (!subject || !action || !location || !time || !tone) {
    return null;
  }
  return { subject, action, location, time, tone };
}

module.exports = {
  CONFIG_PATH,
  loadNewsConfig,
  findOption,
  resolveSelection,
};
