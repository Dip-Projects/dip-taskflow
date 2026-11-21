const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { mergeMap, canSee } = require('../lib/navVisibility');

const router = express.Router();
router.use(requireAuth);

// Access follows "Who sees what" (MIS controls it). Default: admin only.
async function requireRatingReportAccess(req, res, next) {
  try {
    const [settings, me] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'nav_visibility').maybeSingle(),
      supabase.from('users').select('*').eq('id', req.user.id).maybeSingle(),
    ]);
    const map = mergeMap(settings?.data?.value || null);
    if (canSee('rating-report', { ...req.user, ...(me?.data || {}) }, map)) return next();
  } catch (err) {
    console.error('Rating report access check failed:', err.message);
    if (req.user?.role === 'admin') return next(); // settings unreadable → don't lock admin out
  }
  return res.status(403).json({
    error: 'You do not have access to the Rating Report. Ask MIS to enable it in "Who sees what".',
  });
}

// Employee dropdown for the report filter
router.get('/employees', requireRatingReportAccess, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, department, role, is_active')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    res.json((data || []).filter((u) => {
      const role = String(u.role || '').toLowerCase();
      const dept = String(u.department || '').toLowerCase();
      return role !== 'client' && dept !== 'client';
    }));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load employees' });
  }
});

const QUESTIONS = [
  { key: 'quality', label: 'Quality' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'corrections', label: 'Right first time' },
  { key: 'communication', label: 'Communication' },
  { key: 'ownership', label: 'Ownership' },
];

const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null);

// GET /api/rating-report?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=
router.get('/', requireRatingReportAccess, async (req, res) => {
  try {
    const { from, to, employee_id } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    let q = supabase
      .from('tasks')
      .select(`
        id, description, rating, rating_answers, rating_feedback, rated_at, verified_at, assigned_to,
        project:projects ( id, name ),
        assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name ),
        verifier:users!tasks_verifier_id_fkey ( id, full_name )
      `)
      .not('rating', 'is', null)
      .gte('rated_at', new Date(`${from}T00:00:00+05:30`).toISOString())
      .lte('rated_at', new Date(`${to}T23:59:59+05:30`).toISOString())
      .order('rated_at', { ascending: false });
    if (employee_id) q = q.eq('assigned_to', employee_id);

    const { data, error } = await q;
    if (error) {
      if (/rating|column|schema cache/i.test(error.message || '')) {
        return res.status(400).json({ error: 'Rating columns missing — run backend/sql/add_task_rating.sql in Supabase' });
      }
      throw error;
    }

    const byEmp = new Map();
    for (const t of data || []) {
      const id = t.assigned_to;
      if (!byEmp.has(id)) {
        byEmp.set(id, { employee_id: id, employee: t.assigned_to_user?.full_name || '—', ratings: [], q: {}, low: 0 });
        QUESTIONS.forEach(({ key }) => { byEmp.get(id).q[key] = []; });
      }
      const e = byEmp.get(id);
      e.ratings.push(t.rating);
      if (t.rating <= 2) e.low += 1;
      QUESTIONS.forEach(({ key }) => {
        const v = Number(t.rating_answers?.[key]);
        if (v) e.q[key].push(v);
      });
    }

    const employees = [...byEmp.values()]
      .map((e) => ({
        employee_id: e.employee_id,
        employee: e.employee,
        tasks_rated: e.ratings.length,
        avg_rating: avg(e.ratings),
        low_ratings: e.low,
        answers_avg: Object.fromEntries(QUESTIONS.map(({ key }) => [key, avg(e.q[key])])),
      }))
      .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));

    const all = (data || []).map((t) => t.rating);
    res.json({
      from, to,
      questions: QUESTIONS,
      summary: { total: all.length, avg_rating: avg(all), low_ratings: all.filter((r) => r <= 2).length },
      employees,
      rows: (data || []).map((t, i) => ({
        sr: i + 1,
        employee: t.assigned_to_user?.full_name || '—',
        project: t.project?.name || '—',
        description: t.description || '',
        rating: t.rating,
        answers: t.rating_answers || {},
        feedback: t.rating_feedback || '',
        verifier: t.verifier?.full_name || '—',
        rated_at: t.rated_at,
      })),
    });
  } catch (err) {
    console.error('Rating report error:', err.message);
    res.status(500).json({ error: err.message || 'Could not load rating report' });
  }
});

module.exports = router;
