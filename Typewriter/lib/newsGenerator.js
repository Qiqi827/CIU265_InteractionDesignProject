const { loadNewsConfig, resolveSelection } = require('./configLoader');
const { hashSeed, pickTemplate, buildTemplateVars, fillTemplate } = require('./templateEngine');

function generateFromSelection(selectionIds) {
  const config = loadNewsConfig();
  const resolved = resolveSelection(config, selectionIds);
  if (!resolved) {
    throw new Error('invalid_selection');
  }
  return generateFromResolved(config, resolved);
}

function generateFromResolved(config, { subject, action, location, time, tone }) {
  const vars = buildTemplateVars(subject, action, location, time, tone);
  const seed = hashSeed([subject.id, action.id, location.id, time.id, tone.id]);
  const templates = config.generationTemplates || {};

  const headline = fillTemplate(
    pickTemplate(templates.headlineTemplates, seed),
    vars
  );
  const body = fillTemplate(
    pickTemplate(templates.bodyTemplates, seed + 1),
    vars
  );
  const summary = fillTemplate(
    pickTemplate(templates.editorSummaryTemplates, seed + 2),
    vars
  );

  const label = config.articleLabel || 'Archive-inspired generated article.';
  const editorDraftLabel =
    config.editorDraftLabel || 'Archive-inspired generated draft, not a historical article.';

  return {
    headline,
    body,
    summary,
    label,
    editorDraftLabel,
    metadata: {
      subject: subject.title,
      action: action.title,
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
