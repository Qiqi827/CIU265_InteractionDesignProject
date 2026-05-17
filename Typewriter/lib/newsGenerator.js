const { loadNewsConfig, resolveSelection } = require('./configLoader');
const {
  hashSeed,
  pickTemplate,
  buildTemplateVars,
  fillTemplate,
  appendArticleLabel,
  composeBody,
  getLabels,
} = require('./templateEngine');

function generateFromSelection(selectionIds) {
  const config = loadNewsConfig();
  const resolved = resolveSelection(config, selectionIds);
  if (!resolved) {
    throw new Error('invalid_selection');
  }
  return generateFromResolved(config, resolved);
}

function generateFromResolved(config, { storyFragment, subject, location, time, tone }) {
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

/** @deprecated legacy API — use generateFromSelection */
function generateArticle() {
  return generateFromSelection(arguments[0] || {});
}

module.exports = {
  generateFromSelection,
  generateFromResolved,
  generateArticle,
};
