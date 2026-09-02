/**
 * Vercel serverless entry (repo root).
 * Handles /api/*, /config.js, /legacy/* only.
 * React UI is served from /public (CDN) — not from this function.
 */
// Set before the app (and therefore any Date) is loaded — see backend/index.js.
process.env.TZ = 'Asia/Kolkata';

module.exports = require('../backend/index.js');
