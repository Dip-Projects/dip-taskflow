/**
 * Vercel serverless entry (repo root).
 * Handles /api/*, /config.js, /legacy/* only.
 * React UI is served from /public (CDN) — not from this function.
 */
// Set before the app (and therefore any Date) is loaded — see backend/index.js.
process.env.TZ = 'Asia/Kolkata';

try {
  module.exports = require('../backend/index.js');
} catch (err) {
  console.error('API boot failed:', err);
  module.exports = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'FUNCTION_INVOCATION_FAILED',
        message: String(err && err.message ? err.message : err),
        hint:
          'Check Vercel Function logs. Common causes: missing node_modules (redeploy), or missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / JWT_SECRET env vars.',
      })
    );
  };
}
