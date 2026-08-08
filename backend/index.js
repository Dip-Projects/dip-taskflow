require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors({ origin: '*' }));
// Large enough for multipart fields; prefer FormData uploads (not giant JSON).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Runtime config for React build on :4000 (anon key not baked / stale in old builds)
app.get('/config.js', (_req, res) => {
  const payload = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    apiBase: '/api',
  };
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__TF_CONFIG__=${JSON.stringify(payload)};`);
});

app.use('/api/auth',            require('./routes/auth'));
app.use('/api/tasks',           require('./routes/tasks'));
app.use('/api/master',          require('./routes/master'));
app.use('/api/employees',       require('./routes/employees'));
app.use('/api/sites',           require('./routes/sites'));
app.use('/api/recurring-tasks', require('./routes/recurring_tasks'));
app.use('/api/leaves',          require('./routes/leaves'));
app.use('/api/tickets',         require('./routes/tickets'));
app.use('/api/drawings',        require('./routes/drawings'));
app.use('/api/storage',         require('./routes/storage'));
app.use('/api/mis-report',      require('./routes/mis_report'));
app.get('/api/health', (_, res) =>
  res.json({
    status: 'ok',
    // true only if Vercel/server env has Meta creds (backend/.env is local-only)
    whatsappConfigured: !!(process.env.META_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN),
  })
);

// Legacy vanilla TaskFlow UI
app.use('/legacy', express.static(path.join(__dirname, 'legacy'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// React static files — local :4000 only.
// On Vercel, frontend/dist is served by the CDN (outputDirectory). Do NOT
// serve public/*.js from this Node function or Vercel rewrites them to CJS
// ("exports is not defined" blank page).
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/legacy')) return next();
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('SPA index missing:', indexPath, err.message);
        res
          .status(500)
          .type('text')
          .send('Frontend build missing (public/index.html). Run: cd frontend && npm run build');
      }
    });
  });
} else {
  // If Root Directory is wrongly set to "backend", static CDN is skipped and
  // Express receives "/". Point operators at the correct Vercel setting.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/legacy')) return next();
    res
      .status(503)
      .type('html')
      .send(
        '<!doctype html><meta charset=utf-8><title>DIP TaskFlow</title>' +
          '<body style="font-family:sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem">' +
          '<h1>Deploy config</h1>' +
          '<p>UI is not being served. In Vercel → Settings → General → <b>Root Directory</b>, clear it (use repo root), then Redeploy.</p>' +
          '<p>API is up: <a href="/api/health">/api/health</a></p>' +
          '</body>'
      );
  });
}

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`✅ Server ready → http://localhost:${PORT}`));
}

module.exports = app;
