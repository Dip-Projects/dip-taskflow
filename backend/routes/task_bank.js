const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireCanAddTask } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireCanAddTask);

const SELECT = `
  id, title, details, project_id, task_type_id, department_id, assigned_to,
  priority, rescheduling_possible, times_delegated, last_delegated_at, created_at,
  project:projects ( id, name )
`;

function cleanRow(b, userId) {
  return {
    created_by: userId,
    title: String(b.title || '').trim(),
    details: String(b.details || '').trim() || null,
    project_id: b.project_id || null,
    task_type_id: b.task_type_id || null,
    department_id: b.department_id || null,
    assigned_to: b.assigned_to || null,
    priority: ['Low', 'Medium', 'High'].includes(b.priority) ? b.priority : 'Medium',
    rescheduling_possible: b.rescheduling_possible === true || b.rescheduling_possible === 'true',
  };
}

// My saved tasks
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('task_bank')
    .select(SELECT)
    .eq('created_by', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Save one task
router.post('/', async (req, res) => {
  const row = cleanRow(req.body || {}, req.user.id);
  if (!row.title) return res.status(400).json({ error: 'Task name is required' });
  const { data, error } = await supabase.from('task_bank').insert(row).select(SELECT).single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// Save many (Excel upload)
router.post('/bulk', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const rows = items.map((b) => cleanRow(b, req.user.id)).filter((r) => r.title);
  if (!rows.length) return res.status(400).json({ error: 'No valid tasks found' });
  if (rows.length > 300) return res.status(400).json({ error: 'Max 300 tasks per upload' });
  const { error } = await supabase.from('task_bank').insert(rows);
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ imported: rows.length });
});

// Mark as delegated (task stays in the list for next time)
router.patch('/:id/delegated', async (req, res) => {
  const { data: row, error: e1 } = await supabase
    .from('task_bank')
    .select('times_delegated')
    .eq('id', req.params.id)
    .eq('created_by', req.user.id)
    .maybeSingle();
  if (e1) return res.status(500).json({ error: e1.message });
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { error } = await supabase
    .from('task_bank')
    .update({
      times_delegated: (row.times_delegated || 0) + 1,
      last_delegated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('created_by', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Delete
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('task_bank')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
