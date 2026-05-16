/** @typedef {'idle' | 'draft_waiting' | 'published'} RoomStatus */

/**
 * @typedef {object} Draft
 * @property {string} eventId
 * @property {string} eventLabel
 * @property {string} angleId
 * @property {string} angleLabel
 * @property {string} eraId
 * @property {string} eraLabel
 * @property {string} previewTitle
 * @property {string} previewBody
 * @property {number} sentAt
 */

/**
 * @typedef {Draft & {
 *   title: string
 *   body: string
 *   tag: string
 *   publishedAt: number
 * }} PublishedArticle
 */

/** @type {{ status: RoomStatus, draft: Draft | null, article: PublishedArticle | null }} */
const room = {
  status: 'idle',
  draft: null,
  article: null,
};

function getSnapshot() {
  return {
    status: room.status,
    draft: room.draft,
    article: room.article,
  };
}

/** @param {Draft} draft */
function setDraft(draft) {
  room.draft = draft;
  room.status = 'draft_waiting';
  room.article = null;
}

/** @param {PublishedArticle} article */
function publish(article) {
  room.article = article;
  room.status = 'published';
}

function reset() {
  room.status = 'idle';
  room.draft = null;
  room.article = null;
}

module.exports = { getSnapshot, setDraft, publish, reset };
