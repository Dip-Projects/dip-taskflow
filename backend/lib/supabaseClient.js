const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabaseConfigured = Boolean(
  String(SUPABASE_URL || '').trim() && String(SUPABASE_SERVICE_ROLE_KEY || '').trim()
);

if (!supabaseConfigured) {
  // Do NOT throw here — on Vercel that kills the whole serverless function
  // (FUNCTION_INVOCATION_FAILED) before /api/health can report what is missing.
  console.error(
    '⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. Set them in Vercel → Settings → Environment Variables, then Redeploy.'
  );
}

// We use the service_role key on the server only. It bypasses Row Level
// Security, which is fine here because every route is already protected by
// our own JWT auth middleware (see middleware/auth.js). This key must never
// be sent to the frontend.
//
// Placeholders keep createClient() from throwing when env is unset so the
// process can boot and return a clear 503 instead of crashing.
const supabase = createClient(
  supabaseConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  supabaseConfigured ? SUPABASE_SERVICE_ROLE_KEY : 'placeholder-service-role-key',
  {
    auth: { persistSession: false },
  }
);

supabase.__tfConfigured = supabaseConfigured;

module.exports = supabase;
module.exports.supabaseConfigured = supabaseConfigured;
