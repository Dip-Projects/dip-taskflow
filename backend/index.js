require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

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
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

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
}

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`✅ Server ready → http://localhost:${PORT}`));
}

module.exports = app;
