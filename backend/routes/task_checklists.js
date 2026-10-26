const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  httpError,
  loadActiveTemplateForTask,
  loadCommonItems,
  loadSectionsForType,
} = require('../lib/taskChecklists');

const router = express.Router();
router.use(requireAuth);

const SECTION_FIELDS = ['title', 'sort_order', 'is_active'];
const ITEM_FIELDS = ['item_text', 'sort_order', 'is_active'];

/** Admins see every checklist. Anyone else sees checklists only for tasks they assigned or verify. */
function assertCanViewTask(user, task) {
  if (user?.role === 'admin') return;
  if (task?.assigned_to === user?.id || task?.verifier_id === user?.id) return;
  throw httpError(403, 'You can only view checklists for your own tasks');
}

/** Runs a handler and turns thrown errors into JSON responses. */
function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error('Task checklist error:', err.message);
      res.status(status).json({ error: err.message || 'Something went wrong' });
    }
  };
}

function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body && body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

function cleanText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw httpError(400, `${label} is required`);
  return text;
}

function cleanOrder(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, 'Sort order must be a number');
  return Math.trunc(n);
}

/** Next position at the end of a list, so new rows append without a manual number. */
async function nextSortOrder(table, column, value) {
  const { data, error } = await supabase
    .from(table)
    .select('sort_order')
    .eq(column, value)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.length ? (data[0].sort_order || 0) + 1 : 0;
}

/** Same as nextSortOrder for a table with no parent column (common checkpoints). */
async function nextSortOrderAll(table) {
  const { data, error } = await supabase
    .from(table)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.length ? (data[0].sort_order || 0) + 1 : 0;
}

// ----------------------------------------------------------------- verifier view

// Checkpoints a verifier must fill in before approving this task (active only).
router.get('/task/:taskId/template', wrap(async (req, res) => {
  const template = await loadActiveTemplateForTask(req.params.taskId);
  res.json(template);
}));

// ----------------------------------------------------------------- admin: setup

// Every section and item for a task type, including inactive ones, for the setup screen.
router.get('/types/:taskTypeId', requireAdmin, wrap(async (req, res) => {
  const [sections, taskType] = await Promise.all([
    loadSectionsForType(req.params.taskTypeId, { includeInactive: true }),
    supabase.from('task_types')
      .select('id, include_common_checks')
      .eq('id', req.params.taskTypeId)
      .maybeSingle(),
  ]);
  if (taskType.error) throw taskType.error;
  if (!taskType.data) throw httpError(404, 'Task type not found');
  res.json({
    task_type_id: req.params.taskTypeId,
    include_common_checks: taskType.data.include_common_checks !== false,
    sections,
  });
}));

router.patch('/types/:taskTypeId/settings', requireAdmin, wrap(async (req, res) => {
  if (typeof req.body?.include_common_checks !== 'boolean') {
    throw httpError(400, 'Include common checks must be true or false');
  }
  const { data, error } = await supabase
    .from('task_types')
    .update({ include_common_checks: req.body.include_common_checks })
    .eq('id', req.params.taskTypeId)
    .select('id, include_common_checks')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Task type not found');
  res.json(data);
}));

router.post('/sections', requireAdmin, wrap(async (req, res) => {
  const taskTypeId = String(req.body?.task_type_id || '').trim();
  if (!taskTypeId) throw httpError(400, 'Task type is required');
  const title = cleanText(req.body?.title, 'Section heading');
  const sortOrder = cleanOrder(req.body?.sort_order)
    ?? await nextSortOrder('task_checklist_sections', 'task_type_id', taskTypeId);

  const { data, error } = await supabase
    .from('task_checklist_sections')
    .insert({ task_type_id: taskTypeId, title, sort_order: sortOrder })
    .select('id, task_type_id, title, sort_order, is_active')
    .single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.patch('/sections/:id', requireAdmin, wrap(async (req, res) => {
  const updates = pick(req.body, SECTION_FIELDS);
  if (updates.title !== undefined) updates.title = cleanText(updates.title, 'Section heading');
  if (updates.sort_order !== undefined) updates.sort_order = cleanOrder(updates.sort_order);
  if (!Object.keys(updates).length) throw httpError(400, 'Nothing to update');
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('task_checklist_sections')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, task_type_id, title, sort_order, is_active')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Section not found');
  res.json(data);
}));

// Deleting a section removes its checkpoints from the template only.
// Past submissions keep their own copy of the heading and text.
router.delete('/sections/:id', requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('task_checklist_sections').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

router.post('/items', requireAdmin, wrap(async (req, res) => {
  const sectionId = String(req.body?.section_id || '').trim();
  if (!sectionId) throw httpError(400, 'Section is required');
  const itemText = cleanText(req.body?.item_text, 'Checkpoint');
  const sortOrder = cleanOrder(req.body?.sort_order)
    ?? await nextSortOrder('task_checklist_items', 'section_id', sectionId);

  const { data, error } = await supabase
    .from('task_checklist_items')
    .insert({ section_id: sectionId, item_text: itemText, sort_order: sortOrder })
    .select('id, section_id, item_text, sort_order, is_active')
    .single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.patch('/items/:id', requireAdmin, wrap(async (req, res) => {
  const updates = pick(req.body, ITEM_FIELDS);
  if (updates.item_text !== undefined) updates.item_text = cleanText(updates.item_text, 'Checkpoint');
  if (updates.sort_order !== undefined) updates.sort_order = cleanOrder(updates.sort_order);
  if (!Object.keys(updates).length) throw httpError(400, 'Nothing to update');
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('task_checklist_items')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, section_id, item_text, sort_order, is_active')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Checkpoint not found');
  res.json(data);
}));

router.delete('/items/:id', requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('task_checklist_items').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ----------------------------------------------------------------- admin: common checkpoints
// Shown at the top of every task checklist, whatever the task type.

router.get('/common-items', requireAdmin, wrap(async (req, res) => {
  res.json(await loadCommonItems({ includeInactive: true }));
}));

router.post('/common-items', requireAdmin, wrap(async (req, res) => {
  const itemText = cleanText(req.body?.item_text, 'Checkpoint');
  const sortOrder = cleanOrder(req.body?.sort_order)
    ?? await nextSortOrderAll('task_checklist_common_items');

  const { data, error } = await supabase
    .from('task_checklist_common_items')
    .insert({ item_text: itemText, sort_order: sortOrder })
    .select('id, item_text, sort_order, is_active')
    .single();
  if (error) throw error;
  res.status(201).json(data);
}));

router.patch('/common-items/:id', requireAdmin, wrap(async (req, res) => {
  const updates = pick(req.body, ITEM_FIELDS);
  if (updates.item_text !== undefined) updates.item_text = cleanText(updates.item_text, 'Checkpoint');
  if (updates.sort_order !== undefined) updates.sort_order = cleanOrder(updates.sort_order);
  if (!Object.keys(updates).length) throw httpError(400, 'Nothing to update');
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('task_checklist_common_items')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, item_text, sort_order, is_active')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Checkpoint not found');
  res.json(data);
}));

router.delete('/common-items/:id', requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('task_checklist_common_items').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ----------------------------------------------------------------- company details (PDF header)

const COMPANY_FIELDS = ['company_name', 'tagline', 'address', 'phone', 'email', 'website', 'gst_no'];

router.get('/company', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('company_profile')
    .select(COMPANY_FIELDS.join(', '))
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  res.json(data || Object.fromEntries(COMPANY_FIELDS.map((f) => [f, null])));
}));

// Only for changing the details later; the UI has no form for this on purpose.
router.put('/company', requireAdmin, wrap(async (req, res) => {
  const updates = pick(req.body, COMPANY_FIELDS);
  for (const key of Object.keys(updates)) {
    updates[key] = String(updates[key] || '').trim() || null;
  }
  const { data, error } = await supabase
    .from('company_profile')
    .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
    .select(COMPANY_FIELDS.join(', '))
    .single();
  if (error) throw error;
  res.json(data);
}));

// ----------------------------------------------------------------- admin: records

// Newest submissions first. Optional ?task_type_id= narrows to one checklist.
router.get('/submissions', requireAdmin, wrap(async (req, res) => {
  let query = supabase
    .from('task_checklist_submissions')
    .select(`
      id, task_id, task_type_id, verifier_id, verifier_name, submitted_at,
      task_type:task_types ( id, name ),
      task:tasks (
        id, description, status, verification_status, target_date,
        project:projects ( id, name ),
        assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name )
      )
    `)
    .order('submitted_at', { ascending: false })
    .limit(500);
  if (req.query.task_type_id) query = query.eq('task_type_id', String(req.query.task_type_id));

  const { data, error } = await query;
  if (error) throw error;
  res.json(data || []);
}));

// One submission with its task details and every answered checkpoint in order.
router.get('/submissions/:id', wrap(async (req, res) => {
  const { data: submission, error: subErr } = await supabase
    .from('task_checklist_submissions')
    .select(`
      id, task_id, task_type_id, verifier_id, verifier_name, submitted_at,
      task_type:task_types ( id, name ),
      task:tasks (
        id, description, status, verification_status, verification_note, verified_at,
        target_date, assigned_at, assigned_to, verifier_id,
        project:projects ( id, name ),
        department:departments ( id, name ),
        assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name ),
        assigned_by_user:users!tasks_assigned_by_fkey ( id, full_name )
      )
    `)
    .eq('id', req.params.id)
    .maybeSingle();
  if (subErr) throw subErr;
  if (!submission) throw httpError(404, 'Checklist record not found');
  assertCanViewTask(req.user, submission.task);

  const { data: rows, error: rowErr } = await supabase
    .from('task_checklists')
    .select('id, section_id, item_id, common_item_id, section_title, checklist_item, comments, sort_order')
    .eq('submission_id', submission.id)
    .order('sort_order', { ascending: true });
  if (rowErr) throw rowErr;

  res.json({ ...submission, rows: rows || [] });
}));

// Submitted checklists for one task, newest first (task history → Checklist → View).
router.get('/task/:taskId/submissions', wrap(async (req, res) => {
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('id, assigned_to, verifier_id')
    .eq('id', req.params.taskId)
    .maybeSingle();
  if (taskErr) throw taskErr;
  if (!task) throw httpError(404, 'Task not found');
  assertCanViewTask(req.user, task);

  const { data, error } = await supabase
    .from('task_checklist_submissions')
    .select('id, submitted_at, verifier_name')
    .eq('task_id', task.id)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  res.json(data || []);
}));

module.exports = router;
