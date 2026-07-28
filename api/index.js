/**
 * Vercel serverless entry (repo root).
 * Static React files are served from frontend/dist via vercel.json outputDirectory.
 * This function only handles /api/*, /config.js, and /legacy/*.
 */
module.exports = require('../backend/index.js');
