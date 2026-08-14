const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { MODULES, ROLES, mergeMap, canSee } = require('../lib/navVisibility');

const router = express.Router();

// Every master-data endpoint just needs the user to be logged in.
router.use(requireAuth);

router.get('/departments', async (req, res) => {
  const { data, error } = await supabase.from('departments').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/departments', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Department name is required' });
  const { data, error } = await supabase.from('departments').insert({ name }).select('id, name').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.get('/projects', async (req, res) => {
  const { data, error } = await supabase.from('projects').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/task-types', async (req, res) => {
  const { data, error } = await supabase.from('task_types').select('id, name').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/task-types', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Task type name is required' });
  const { data, error } = await supabase.from('task_types').insert({ name }).select('id, name').single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Used to populate the "Assign to" dropdown and the employee filter.
// Only active users — matches what the frontend should offer.
router.get('/employees', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, department, designation')
    .eq('is_active', true)
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Who can verify a completed task: admins always can, plus anyone the
// admin has explicitly flagged with can_verify (e.g. a Senior Estimator).
router.get('/verifiers', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role, designation')
    .eq('is_active', true)
    .or('can_verify.eq.true,role.eq.admin')
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/nav-visibility', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nav_visibility')
      .maybeSingle();
    const map = mergeMap(!error && data?.value ? data.value : null);
    res.json({ modules: MODULES, roles: ROLES, map });
  } catch (err) {
    res.json({ modules: MODULES, roles: ROLES, map: mergeMap(null) });
  }
});

router.put('/nav-visibility', async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    let isMis = !!req.user?.is_mis_executive;
    if (!isMis && !isAdmin) {
      const { data: me } = await supabase
        .from('users')
        .select('is_mis_executive')
        .eq('id', req.user.id)
        .maybeSingle();
      isMis = !!me?.is_mis_executive;
    }
    if (!isAdmin && !isMis) {
      return res.status(403).json({ error: 'Only admin or MIS executive can change who sees what' });
    }
    const map = mergeMap(req.body?.map);
    const { error } = await supabase.from('app_settings').upsert({
      key: 'nav_visibility',
      value: map,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
    });
    if (error) {
      return res.status(503).json({
        error: 'Run backend/sql/add_nav_visibility.sql in Supabase, then save again.',
        map,
        modules: MODULES,
        roles: ROLES,
      });
    }
    res.json({ ok: true, map, modules: MODULES, roles: ROLES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.canSeeNav = canSee;
