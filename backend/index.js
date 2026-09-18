// Every date calculation in this codebase — office hours, "today", week
// ranges, recurring schedules — reads the local clock and assumes it is IST.
// Vercel runs its functions in UTC, so pin the zone before anything builds a
// Date. India has no DST, so a fixed zone is safe year round.
process.env.TZ = 'Asia/Kolkata';

require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const app     = express();
const { supabaseConfigured } = require('./lib/supabaseClient');

app.use(cors({ origin: '*' }));
// Large enough for multipart fields; prefer FormData uploads (not giant JSON).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Body-parser JSON failures otherwise return an HTML stack page → frontend
// only shows the generic "Request failed".
app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return next(err);
});

// Fail closed with a clear JSON error when Vercel env vars were never set.
app.use((req, res, next) => {
  if (supabaseConfigured) return next();
  if (req.path === '/api/health' || req.path === '/config.js') return next();
  return res.status(503).json({
    error:
      'Server misconfigured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables, then Redeploy.',
  });
});

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

// The accept nudge needs ~15-minute granularity, but the Vercel plan only
// allows one cron a day. Piggyback a throttled sweep on normal API traffic so
// it fires during office hours; the daily cron stays as the backstop.
app.use(require('./middleware/reminderSweep'));

app.use('/api/auth',            require('./routes/auth'));
app.use('/api/tasks',           require('./routes/tasks'));
app.use('/api/master',          require('./routes/master'));
app.use('/api/employees',       require('./routes/employees'));
app.use('/api/clients',         require('./routes/clients_admin'));
app.use('/api/sites',           require('./routes/sites'));
app.use('/api/recurring-tasks', require('./routes/recurring_tasks'));
app.use('/api/leaves',          require('./routes/leaves'));
app.use('/api/hr',              require('./routes/hr'));
app.use('/api/tickets',         require('./routes/tickets'));
app.use('/api/drawings',        require('./routes/drawings'));
app.use('/api/storage',         require('./routes/storage'));
app.use('/api/mis-report',      require('./routes/mis_report'));
app.use('/api/delay-report',    require('./routes/delay_report'));
app.use('/api/mdo',             require('./routes/mdo'));
app.use('/api/bot',             require('./routes/bot'));
app.use('/api/client',          require('./routes/client'));
app.use('/api/whatsapp',        require('./routes/whatsapp'));
app.use('/api/ea-meeting',      require('./routes/ea_meeting'));
app.use('/api/geocode',         require('./routes/geocode'));
app.get('/api/health', async (_, res) => {
  const phoneIdRaw = String(process.env.META_PHONE_NUMBER_ID || '').trim();
  const accessTokenRaw = String(process.env.META_ACCESS_TOKEN || '').trim();
  const phoneId = !!phoneIdRaw;
  const accessToken = !!accessTokenRaw;
  let metaPing = { ok: false, reason: 'not_configured' };
  if (phoneId && accessToken) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v20.0/${phoneIdRaw}?fields=display_phone_number,quality_rating`,
        { headers: { Authorization: `Bearer ${accessTokenRaw}` } }
      );
      const d = await r.json().catch(() => ({}));
      if (r.ok && !d.error) {
        metaPing = {
          ok: true,
          phone: d.display_phone_number || null,
          quality: d.quality_rating || null,
        };
      } else {
        metaPing = {
          ok: false,
          reason: 'api_error',
          code: d.error?.code || r.status,
          message: String(d.error?.message || 'Meta Graph rejected token').slice(0, 160),
        };
      }
    } catch (err) {
      metaPing = { ok: false, reason: 'exception', message: String(err.message || err).slice(0, 160) };
    }
  }
  res.json({
    status: supabaseConfigured ? 'ok' : 'misconfigured',
    supabaseConfigured,
    whatsappConfigured: phoneId && accessToken,
    metaPing,
    botConfigured: true,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    jwtConfigured: !!String(process.env.JWT_SECRET || '').trim(),
    whatsappEnv: {
      META_PHONE_NUMBER_ID: phoneId,
      META_ACCESS_TOKEN: accessToken,
      META_WEBHOOK_VERIFY_TOKEN: !!(
        process.env.META_WEBHOOK_VERIFY_TOKEN ||
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
      ),
      WHATSAPP_TASK_DONE_TEMPLATE: !!process.env.WHATSAPP_TASK_DONE_TEMPLATE,
    },
    hint: supabaseConfigured
      ? undefined
      : 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (and JWT_SECRET) in Vercel → Settings → Environment Variables, then Redeploy.',
  });
});

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
