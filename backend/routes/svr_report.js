const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { userCanViewAllEaUploads } = require('../lib/taskListDigest');

const router = express.Router();
router.use(requireAuth);

async function loadUserProfile(user) {
  if (!user?.id) return user || {};
  const { data } = await supabase
    .from('users')
    .select('id, full_name, username, role, designation, department')
    .eq('id', user.id)
    .maybeSingle();
  return { ...user, ...(data || {}) };
}

/**
 * Same people the MDO portal shows the PC-only menus to: Process Controller,
 * PC, Beena, MDO Office, Engineer Office. Admin is excluded.
 */
function isPcLikeProfile(u) {
  if (!u || String(u.role || '').toLowerCase() === 'admin') return false;
  const pcLike = (value) => {
    const blob = String(value || '').toLowerCase();
    return (
      /process controller/.test(blob) ||
      /\bpc\b/.test(blob) ||
      /\bbeena\b/.test(blob) ||
      /mdo office/.test(blob) ||
      /engineer office/.test(blob)
    );
  };
  return (
    pcLike(u.role) ||
    pcLike(u.designation) ||
    pcLike(u.department) ||
    pcLike(u.site_role) ||
    /beena/i.test(`${u.full_name || ''} ${u.username || ''}`)
  );
}

/** PC-only access. Admin is hidden, same as the EA report. */
async function requirePc(req, res) {
  const profile = await loadUserProfile(req.user);
  if (userCanViewAllEaUploads(profile) || isPcLikeProfile(profile)) return true;
  res.status(403).json({ error: 'Only the Process Controller (PC) can open the SVR report.' });
  return false;
}

/** Engineer names for the filter dropdown. No report rows are returned. */
router.get('/engineers', async (req, res) => {
  try {
    if (!(await requirePc(req, res))) return;
    const { data, error } = await supabase
      .from('site_reports')
      .select('reporter_name, submitted_by_name')
      .limit(5000);
    if (error) throw error;

    const names = [
      ...new Set(
        (data || [])
          .map((r) => String(r.reporter_name || r.submitted_by_name || '').trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));
    res.json({ employees: names });
  } catch (err) {
    console.error('SVR engineers:', err.message);
    res.status(500).json({ error: err.message || 'Could not load engineers' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (!(await requirePc(req, res))) return;

    const from = String(req.query.from || '').slice(0, 10);
    const to = String(req.query.to || '').slice(0, 10);
    const employee = String(req.query.employee || '').trim().toLowerCase();

    let q = supabase
      .from('site_reports')
      .select('id, site_name, reporter_name, submitted_by_name, designation, visit_date, pdf_url, created_at')
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (from) q = q.gte('visit_date', from);
    if (to) q = q.lte('visit_date', to);

    const { data, error } = await q.limit(2000);
    if (error) throw error;

    const all = (data || []).map((r) => ({
      id: r.id,
      engineer: r.reporter_name || r.submitted_by_name || '',
      site: r.site_name || '',
      visit_date: r.visit_date,
      designation: r.designation || '',
      pdf_url: r.pdf_url || null,
      created_at: r.created_at,
    }));

    const rows = employee
      ? all.filter((r) => r.engineer.trim().toLowerCase() === employee)
      : all;

    res.json({ rows });
  } catch (err) {
    console.error('SVR report:', err.message);
    res.status(500).json({ error: err.message || 'Could not load SVR report' });
  }
});

module.exports = router;
