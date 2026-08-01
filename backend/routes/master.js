const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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

module.exports = router;
