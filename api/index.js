/**
 * Vercel serverless entry (repo root).
 * Handles /api/*, /config.js, /legacy/* only.
 * React UI is served from /public (CDN) — not from this function.
 */
module.exports = require('../backend/index.js');
