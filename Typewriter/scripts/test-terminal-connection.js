/**
 * Run from Typewriter folder: node scripts/test-terminal-connection.js
 * Checks .env + Supabase session + insert permission without publishing a real draft.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  loadTerminalConfig,
  resolveSessionId,
  getJwtRole,
} = require('../lib/terminalPublisher');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const config = loadTerminalConfig(true);
  const url = (process.env.SUPABASE_URL || config.supabaseUrl || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  console.log('--- Typewriter terminal connection test ---\n');
  console.log('Supabase URL:', url || '(missing)');
  console.log('Key prefix:', key ? key.slice(0, 12) + '...' : '(missing)');
  const jwtRole = getJwtRole(key);
  console.log(
    'Key type:',
    key.startsWith('sb_secret_')
      ? 'sb_secret (new)'
      : jwtRole
        ? `JWT role="${jwtRole}"${jwtRole === 'service_role' ? ' (OK)' : ' (WRONG for server insert)'}`
        : key.includes('publishable')
          ? 'publishable (WRONG)'
          : 'unknown'
  );

  if (jwtRole === 'anon') {
    console.error('\nFAIL: .env has the anon key. Copy service_role from Legacy API keys, not anon.');
    process.exit(1);
  }

  if (!url || !key) {
    console.error('\nFAIL: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let sessionId;
  try {
    sessionId = await resolveSessionId(supabase, config);
  } catch (err) {
    console.error('\nFAIL: Cannot resolve session:', err.message);
    process.exit(1);
  }

  if (!sessionId) {
    console.error('\nFAIL: No session id. Set useActiveSession:true in terminalConfig.json or TERMINAL_SESSION_ID in .env');
    process.exit(1);
  }

  console.log('\nResolved session_id:', sessionId);

  const probe = {
    session_id: sessionId,
    title: '[connection test — safe to delete]',
    subtitle: 'Typewriter diagnostic',
    body: 'If you see this on the terminal wall, the API key works.',
    image_url: null,
  };

  const { data, error } = await supabase
    .from(config.table || 'frontpage_articles')
    .insert(probe)
    .select('id')
    .single();

  if (error) {
    console.error('\nFAIL: Cannot insert into frontpage_articles:', error.message);
    if (error.message.includes('Invalid API key')) {
      console.error('\nMost common fixes:');
      console.error('  1. Re-copy the entire key (no spaces or quotes)');
      console.error('  2. Use Legacy service_role JWT (eyJ...) instead of sb_secret');
      console.error('  3. Confirm the key belongs to project uhcgprnorihyvhrkxmpm');
    }
    process.exit(1);
  }

  console.log('\nOK: Insert succeeded. Article id:', data.id);
  console.log('Terminal wall (CIU265_IXDProject_Web) should show the test headline briefly.');
  console.log('You can delete this row in Supabase Table Editor if needed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
