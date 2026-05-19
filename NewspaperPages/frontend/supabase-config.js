// Fill these two values from Supabase Dashboard -> Project Settings -> API.
// The anon public key is safe for browser use when RLS is enabled.
//
// This is only used by newspaper.js to read the `frontpage_articles` table
// (the "Everyone Edits" panel). The Citizen Lens photo wall has been moved
// off Supabase and runs through this project's own Node + Socket.IO server.
export const SUPABASE_URL = 'https://uhcgprnorihyvhrkxmpm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_9ht5mlr0XOi3UefgMdbU4Q_-d5xzRcZ';
