/**
 * Pushes a published Typewriter article to the terminal display
 * (CIU265_IXDProject_Web) via Supabase frontpage_articles + Realtime.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'terminalConfig.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedConfig = null;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** @returns {'service_role' | 'anon' | 'authenticated' | string | null} */
function getJwtRole(key) {
  if (!key.startsWith('eyJ')) return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch {
    return null;
  }
}

function loadTerminalConfig(force = false) {
  if (!force && cachedConfig) return cachedConfig;
  cachedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return cachedConfig;
}

function getPublicTerminalInfo() {
  const config = loadTerminalConfig();
  return {
    enabled: Boolean(config.enabled),
    terminalName: config.terminal?.name || 'CIU265_IXDProject_Web',
    terminalDescription: config.terminal?.description || '',
    terminalLocalUrl: config.terminal?.localUrl || '',
    terminalDeployedUrl: config.terminal?.deployedUrl || '',
    useActiveSession: Boolean(config.useActiveSession),
    hasSessionOverride: Boolean(config.sessionId || process.env.TERMINAL_SESSION_ID),
  };
}

function buildSubtitle(article) {
  const m = article.metadata || {};
  const parts = [
    m.subject && `Subject: ${m.subject}`,
    m.storyFragment && `Story: ${m.storyFragment}`,
    m.where && `Where: ${m.where}`,
    m.time && `Time: ${m.time}`,
    m.tone && `Tone: ${m.tone}`,
  ].filter(Boolean);
  return parts.join(' · ') || article.generatedDraft?.summary || '';
}

function buildBody(article) {
  const main = article.body || article.generatedDraft?.body || '';
  const label =
    article.tag ||
    article.generatedDraft?.label ||
    'Archive-inspired generated article. This is not an original historical news article.';
  return `${main}\n\n— ${label}`;
}

function articleToRow(article, sessionId) {
  return {
    session_id: sessionId,
    title: article.title || article.generatedDraft?.headline || 'Untitled dispatch',
    subtitle: buildSubtitle(article),
    body: buildBody(article),
    image_url: null,
  };
}

async function resolveSessionId(supabase, config) {
  let override = (process.env.TERMINAL_SESSION_ID || config.sessionId || '').trim();
  if (override && !isValidUuid(override)) {
    console.warn(
      `[terminal] Ignoring invalid session id "${override}" (use a real UUID or set useActiveSession: true)`
    );
    override = '';
  }
  if (override) return override;

  if (config.useActiveSession === false) {
    return null;
  }

  const table = config.sessionsTable || 'sessions';
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load active session: ${error.message}`);
  }
  return data?.id || null;
}

/**
 * @param {object} article Published article from Typewriter room state
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, articleId?: string, sessionId?: string }>}
 */
async function publishToTerminal(article) {
  const config = loadTerminalConfig();

  if (!config.enabled) {
    return { ok: false, skipped: true, reason: 'terminal_disabled' };
  }

  const supabaseUrl = (process.env.SUPABASE_URL || config.supabaseUrl || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl) {
    return { ok: false, skipped: true, reason: 'no_supabase_url' };
  }

  if (!serviceKey) {
    console.warn(
      '[terminal] SUPABASE_SERVICE_ROLE_KEY not set — local display updated, terminal wall unchanged'
    );
    return { ok: false, skipped: true, reason: 'no_service_role_key' };
  }

  if (serviceKey.includes('publishable')) {
    return {
      ok: false,
      skipped: true,
      reason: 'wrong_key_type',
      hint: 'Use service_role or sb_secret from Supabase Dashboard, not publishable.',
    };
  }

  const jwtRole = getJwtRole(serviceKey);
  if (jwtRole === 'anon') {
    console.warn('[terminal] SUPABASE_SERVICE_ROLE_KEY is an anon JWT — inserts will fail RLS');
    return {
      ok: false,
      skipped: true,
      reason: 'anon_key_not_service_role',
      hint:
        'You pasted the anon key. In Dashboard → API Keys → Legacy, copy service_role (JWT with role service_role), not anon.',
    };
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (err) {
    return { ok: false, skipped: true, reason: 'supabase_sdk_missing' };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sessionId = await resolveSessionId(supabase, config);
  if (!sessionId) {
    return {
      ok: false,
      reason: 'no_active_session',
      hint: 'Create an active session in Supabase or set TERMINAL_SESSION_ID / terminalConfig.sessionId',
    };
  }

  const row = articleToRow(article, sessionId);
  const table = config.table || 'frontpage_articles';

  const { data, error } = await supabase.from(table).insert(row).select('id, session_id, created_at').single();

  if (error) {
    console.error('[terminal] Supabase insert failed:', error.message);
    let hint;
    if (error.message.includes('Invalid API key')) {
      hint = 'Re-copy service_role or sb_secret from Supabase → API Keys, then restart npm start.';
    } else if (error.message.includes('row-level security')) {
      hint = 'Use service_role (not anon) in .env, or add an INSERT policy for frontpage_articles in Supabase.';
    } else if (error.message.includes('invalid input syntax for type uuid')) {
      hint = 'Set terminalConfig.sessionId to null and useActiveSession true, or paste a real session UUID.';
    }
    return { ok: false, reason: error.message, sessionId, hint };
  }

  console.log(`[terminal] pushed to ${config.terminal?.name || 'terminal'} (article ${data.id})`);
  return {
    ok: true,
    articleId: data.id,
    sessionId: data.session_id,
    createdAt: data.created_at,
    terminalName: config.terminal?.name,
  };
}

module.exports = {
  loadTerminalConfig,
  getPublicTerminalInfo,
  publishToTerminal,
  resolveSessionId,
  isValidUuid,
  getJwtRole,
};
