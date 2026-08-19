const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ─── helpers ────────────────────────────────────────────────────────────────

const RT_SELECT = `
  id, description, priority, frequency, frequency_days,
  start_date, end_date, is_active, created_at,
  department:departments ( id, name ),
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  assigned_to_user:users!recurring_tasks_assigned_to_fkey ( id, full_name ),
  assigned_by_user:users!recurring_tasks_assigned_by_fkey ( id, full_name ),
  checkpoints:recurring_task_checkpoints ( id, label, sort_order )
`;

// How far back we're willing to dig up missed days. An employee who hasn't
// opened the app in ages shouldn't suddenly get a 400-row backlog — 30 days
// is plenty to catch a genuinely missed day or two without going overboard.
const BACKFILL_DAYS = 30;

function isInstanceClosed(status) {
  return status === 'Completed' || status === 'NotApplicable';
}

// Date-agnostic version of "should this task fire on this particular day" —
// lets us check any day in the backfill window, not just today.
function shouldFireOn(task, date) {
  const start = new Date(task.start_date);
  const end = task.end_date ? new Date(task.end_date) : null;
  const d = new Date(date.toISOString().slice(0, 10));

  if (d < start) return false;
  if (end && d > end) return false;

  const freq = task.frequency;
  if (freq === 'Daily') return true;
  if (freq === 'Weekly') {
    const days = (task.frequency_days || '').split(',').map(Number);
    return days.includes(date.getDay());
  }
  if (freq === 'Monthly') return date.getDate() === start.getDate();
  if (freq === 'Yearly') return date.getDate() === start.getDate() && date.getMonth() === start.getMonth();
  return false;
}

// Is today a valid fire date for this task? (kept as a thin wrapper — some
// call sites just want today's answer)
function shouldFireToday(task, today) {
  return shouldFireOn(task, today);
}

// Every date (oldest → newest), within the backfill window, up to and
// including today, on which this task was supposed to fire. This is what
// lets a missed day (e.g. task not done on the 6th) keep showing up as its
// own pending row on the 7th instead of silently disappearing — each due
// date gets its own instance/row.
function getFireDates(task, today) {
  const dates = [];
  const start = new Date(task.start_date);
  const todayOnly = new Date(today.toISOString().slice(0, 10));

  let cursor = new Date(todayOnly);
  cursor.setDate(cursor.getDate() - BACKFILL_DAYS);
  if (cursor < start) cursor = new Date(start);

  while (cursor <= todayOnly) {
    if (shouldFireOn(task, cursor)) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Fetches existing instances for a batch of due dates in one query, then
// creates whichever ones are still missing (e.g. a day the employee never
// opened the app on so no instance was ever created for it). Returns them
// all, in the same oldest→newest order as dueDates.
async function getOrCreateInstances(recurringTaskId, dueDates) {
  if (!dueDates.length) return [];
  const dueDateStrs = dueDates.map(d => d.toISOString().slice(0, 10));

  const { data: existing, error } = await supabase
    .from('recurring_task_instances')
    .select('id, due_date, status, completed_at, recurring_task_checkpoint_completions ( checkpoint_id )')
    .eq('recurring_task_id', recurringTaskId)
    .in('due_date', dueDateStrs);
  if (error) throw error;

  const byDate = {};
  (existing || []).forEach(i => { byDate[i.due_date] = i; });

  const missing = dueDateStrs.filter(d => !byDate[d]);
  if (missing.length) {
    const rows = missing.map(due_date => ({ recurring_task_id: recurringTaskId, due_date, status: 'Pending' }));
    const { data: created, error: createErr } = await supabase
      .from('recurring_task_instances')
      .insert(rows)
      .select('id, due_date, status, completed_at, recurring_task_checkpoint_completions ( checkpoint_id )');
    if (createErr) throw createErr;
    (created || []).forEach(i => { byDate[i.due_date] = i; });
  }

  return dueDateStrs.map(d => byDate[d]).filter(Boolean);
}

// ─── Admin: get saved checkpoint template for a task type ─────────────────
// GET /recurring-tasks/checkpoint-templates/:taskTypeId
// Returns the most recently saved set of checkpoint labels for that task
// type, so the create/edit modal can pre-fill them when the type is picked.
router.get('/checkpoint-templates/:taskTypeId', requireAdmin, async (req, res) => {
  try {
    const { taskTypeId } = req.params;
    const { data, error } = await supabase
      .from('task_type_checkpoint_templates')
      .select('id, label, sort_order')
      .eq('task_type_id', taskTypeId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Get checkpoint template error:', err.message);
    res.status(500).json({ error: err.message || 'Could not load checkpoint template' });
  }
});

// ─── Admin: create recurring task ──────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      department_id, project_id, task_type_id,
      assigned_to, description, priority,
      frequency, frequency_days, start_date, end_date,
      checkpoints = []
    } = req.body || {};

    if (!assigned_to || !description || !frequency || !start_date) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }
    if (frequency === 'Weekly' && (!frequency_days || frequency_days.length === 0)) {
      return res.status(400).json({ error: 'Please select at least one day for weekly tasks' });
    }

    const { data: rt, error } = await supabase
      .from('recurring_tasks')
      .insert({
        department_id: department_id || null,
        project_id: project_id || null,
        task_type_id: task_type_id || null,
        assigned_to,
        assigned_by: req.user.id,
        description,
        priority: priority || 'Medium',
        frequency,
        frequency_days: frequency === 'Weekly'
          ? (Array.isArray(frequency_days) ? frequency_days.join(',') : frequency_days)
          : null,
        start_date,
        end_date: end_date || null,
        is_active: true
      })
      .select('id')
      .single();

    if (error) throw error;

    // Insert checkpoints
    if (checkpoints.length > 0) {
      const cpRows = checkpoints
        .map((label, i) => ({
          recurring_task_id: rt.id,
          label: typeof label === 'string' ? label.trim() : '',
          sort_order: i
        }))
        .filter(r => r.label);

      if (cpRows.length) {
        const { error: cpErr } = await supabase
          .from('recurring_task_checkpoints')
          .insert(cpRows);
        if (cpErr) throw cpErr;
      }
    }

    // Return full task
    const { data: full, error: fullErr } = await supabase
      .from('recurring_tasks')
      .select(RT_SELECT)
      .eq('id', rt.id)
      .single();
    if (fullErr) throw fullErr;

    res.status(201).json(full);
  } catch (err) {
    const detail = err.message || err.details || err.hint || JSON.stringify(err);
    console.error('Create recurring task error:', detail, err);
    res.status(500).json({ error: detail || 'Could not create recurring task' });
  }
});

// ─── Admin: list all recurring tasks (with overdue status per task) ───────
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    const todayOnly = new Date(today.toISOString().slice(0, 10));

    const { data: tasks, error } = await supabase
      .from('recurring_tasks')
      .select(RT_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // For each task, figure out if the assigned employee has any pending
    // instance from before today (i.e. a missed day still not done) and,
    // if so, how many days overdue the oldest one is — so the admin can
    // see at a glance which recurring tasks have fallen behind.
    const result = [];
    for (const task of tasks) {
      let overdue_days = 0;
      let oldest_overdue_date = null;

      if (task.is_active) {
        const fireDates = getFireDates(task, today);
        const instances = await getOrCreateInstances(task.id, fireDates);
        const overdueInstances = instances.filter(
          i => !isInstanceClosed(i.status) && i.due_date < todayOnly.toISOString().slice(0, 10)
        );
        if (overdueInstances.length) {
          // instances come back oldest → newest already
          oldest_overdue_date = overdueInstances[0].due_date;
          const diffMs = todayOnly - new Date(oldest_overdue_date);
          overdue_days = Math.round(diffMs / 86400000);
        }
      }

      result.push({
        ...task,
        is_overdue: overdue_days > 0,
        overdue_days,
        oldest_overdue_date
      });
    }

    res.json(result);
  } catch (err) {
    console.error('List recurring tasks error:', err.message);
    res.status(500).json({ error: 'Could not load recurring tasks' });
  }
});

// ─── Employee: my recurring tasks (one row per pending due date — a missed
// day like the 6th keeps its own row instead of vanishing when the 7th's
// instance is created) ───────────────────────────────────────────────────
router.get('/my', async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const { data: tasks, error } = await supabase
      .from('recurring_tasks')
      .select(RT_SELECT)
      .eq('assigned_to', req.user.id)
      .eq('is_active', true);
    if (error) throw error;

    const result = [];
    for (const task of tasks) {
      const fireDates = getFireDates(task, today);
      const instances = await getOrCreateInstances(task.id, fireDates);

      for (const inst of instances) {
        // A day that's already been completed just disappears — except
        // today's, which stays visible (as "Completed") until the page
        // is next refreshed, so the checkmark doesn't vanish instantly.
        // Completed / Not Applicable past days drop off; today's stay visible.
        // N/A only clears THIS due date — next weekly fire still appears.
        if (isInstanceClosed(inst.status) && inst.due_date !== todayStr) continue;

        result.push({
          ...task,
          due_date: inst.due_date,
          is_today: inst.due_date === todayStr,
          instance: inst,
          // kept for backward compatibility with older frontend code
          fires_today: inst.due_date === todayStr,
          today_instance: inst
        });
      }
    }

    // Oldest pending day first, so the backlog clears in order.
    result.sort((a, b) => a.due_date.localeCompare(b.due_date));

    res.json(result);
  } catch (err) {
    console.error('My recurring tasks error:', err.message);
    res.status(500).json({ error: 'Could not load recurring tasks' });
  }
});

// ─── Admin/Employee: update recurring task (admin only: details; anyone: toggle checkpoint) ──

// Admin: edit recurring task
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'department_id', 'project_id', 'task_type_id', 'assigned_to',
      'description', 'priority', 'frequency', 'frequency_days',
      'start_date', 'end_date', 'is_active'
    ];
    const updates = {};
    for (const f of allowed) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (updates.frequency_days && Array.isArray(updates.frequency_days)) {
      updates.frequency_days = updates.frequency_days.join(',');
    }

    const { data, error } = await supabase
      .from('recurring_tasks')
      .update(updates)
      .eq('id', id)
      .select(RT_SELECT)
      .single();
    if (error) throw error;

    // If checkpoints are provided, replace them
    if (req.body.checkpoints !== undefined) {
      await supabase.from('recurring_task_checkpoints').delete().eq('recurring_task_id', id);
      if (req.body.checkpoints.length > 0) {
        const cpRows = req.body.checkpoints.map((label, i) => ({
          recurring_task_id: id,
          label: typeof label === 'string' ? label.trim() : label.label?.trim(),
          sort_order: i
        })).filter(r => r.label);
        if (cpRows.length) {
          await supabase.from('recurring_task_checkpoints').insert(cpRows);
        }
      }
    }

    // Return updated full
    const { data: full } = await supabase
      .from('recurring_tasks').select(RT_SELECT).eq('id', id).single();
    res.json(full);
  } catch (err) {
    const detail = err.message || err.details || err.hint || JSON.stringify(err);
    console.error('Update recurring task error:', detail, err);
    res.status(500).json({ error: detail || 'Could not update recurring task' });
  }
});

// Admin: delete recurring task
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('recurring_tasks').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete recurring task error:', err.message);
    res.status(500).json({ error: err.message || 'Could not delete recurring task' });
  }
});

// ─── Employee: mark an instance done directly (only for tasks with no checkpoints) ──
// POST /recurring-tasks/instances/:instanceId/complete
router.post('/instances/:instanceId/complete', async (req, res) => {
  try {
    const { instanceId } = req.params;

    const { data: inst, error: instErr } = await supabase
      .from('recurring_task_instances')
      .select('id, status, recurring_task_id')
      .eq('id', instanceId)
      .single();
    if (instErr) throw instErr;

    // Check ownership
    const { data: rt, error: rtErr } = await supabase
      .from('recurring_tasks')
      .select('assigned_to')
      .eq('id', inst.recurring_task_id)
      .single();
    if (rtErr) throw rtErr;
    if (rt.assigned_to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your task' });
    }

    // Only allow direct completion when the task has no checkpoints —
    // tasks with checkpoints must be completed by ticking all of them
    // (see the /checkpoints/:checkpointId/toggle route above).
    const { data: checkpoints, error: cpErr } = await supabase
      .from('recurring_task_checkpoints')
      .select('id')
      .eq('recurring_task_id', inst.recurring_task_id);
    if (cpErr) throw cpErr;
    if (checkpoints.length > 0) {
      return res.status(400).json({ error: 'This task has checkpoints — tick them to complete it' });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('recurring_task_instances')
      .update({ status: 'Completed', completed_at: new Date().toISOString() })
      .eq('id', instanceId)
      .select('id, status, completed_at, recurring_task_checkpoint_completions ( checkpoint_id )')
      .single();
    if (updateErr) throw updateErr;

    res.json(updated);
  } catch (err) {
    console.error('Complete instance error:', err.message);
    res.status(500).json({ error: err.message || 'Could not mark task as done' });
  }
});

// ─── Employee: mark this due date Not Applicable (does NOT stop next week) ──
// POST /recurring-tasks/instances/:instanceId/not-applicable
router.post('/instances/:instanceId/not-applicable', async (req, res) => {
  try {
    const { instanceId } = req.params;

    const { data: inst, error: instErr } = await supabase
      .from('recurring_task_instances')
      .select('id, status, recurring_task_id, due_date')
      .eq('id', instanceId)
      .single();
    if (instErr) throw instErr;

    if (isInstanceClosed(inst.status)) {
      return res.status(400).json({ error: 'This day is already closed' });
    }

    const { data: rt, error: rtErr } = await supabase
      .from('recurring_tasks')
      .select('assigned_to')
      .eq('id', inst.recurring_task_id)
      .single();
    if (rtErr) throw rtErr;
    if (rt.assigned_to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your task' });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('recurring_task_instances')
      .update({ status: 'NotApplicable', completed_at: new Date().toISOString() })
      .eq('id', instanceId)
      .select('id, status, completed_at, due_date')
      .single();
    if (updateErr) throw updateErr;

    res.json(updated);
  } catch (err) {
    console.error('Not applicable error:', err.message);
    res.status(500).json({ error: err.message || 'Could not mark as not applicable' });
  }
});

// ─── Employee: submit checked checkpoints for an instance, all at once ─────
// POST /recurring-tasks/instances/:instanceId/submit
// Body: { checkpoint_ids: [ ...ids that should be marked done ] }
// Replaces the full completion set for this instance with exactly the ids
// sent, then recalculates status (Completed only if every checkpoint for
// the task is included).
router.post('/instances/:instanceId/submit', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { checkpoint_ids = [] } = req.body || {};

    const { data: inst, error: instErr } = await supabase
      .from('recurring_task_instances')
      .select('id, status, recurring_task_id')
      .eq('id', instanceId)
      .single();
    if (instErr) throw instErr;

    // Ownership check
    const { data: rt, error: rtErr } = await supabase
      .from('recurring_tasks')
      .select('assigned_to')
      .eq('id', inst.recurring_task_id)
      .single();
    if (rtErr) throw rtErr;
    if (rt.assigned_to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your task' });
    }

    // All valid checkpoint ids for this task — used to ignore anything
    // bogus sent from the client and to know the full set for "all done".
    const { data: allCheckpoints, error: cpListErr } = await supabase
      .from('recurring_task_checkpoints')
      .select('id')
      .eq('recurring_task_id', inst.recurring_task_id);
    if (cpListErr) throw cpListErr;
    const validIds = new Set(allCheckpoints.map(c => c.id));
    const submittedIds = [...new Set((checkpoint_ids || []).filter(id => validIds.has(id)))];

    // Replace completion rows wholesale with whatever was submitted
    await supabase
      .from('recurring_task_checkpoint_completions')
      .delete()
      .eq('instance_id', instanceId);

    if (submittedIds.length) {
      const rows = submittedIds.map(checkpoint_id => ({ instance_id: instanceId, checkpoint_id }));
      const { error: insErr } = await supabase.from('recurring_task_checkpoint_completions').insert(rows);
      if (insErr) throw insErr;
    }

    const allDone = allCheckpoints.length > 0 && submittedIds.length === allCheckpoints.length;
    const newStatus = allDone ? 'Completed' : 'Pending';

    const { data: updated, error: updateErr } = await supabase
      .from('recurring_task_instances')
      .update({ status: newStatus, completed_at: allDone ? new Date().toISOString() : null })
      .eq('id', instanceId)
      .select('id, status, completed_at, recurring_task_checkpoint_completions ( checkpoint_id )')
      .single();
    if (updateErr) throw updateErr;

    res.json(updated);
  } catch (err) {
    console.error('Submit checkpoints error:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit checkpoints' });
  }
});

// ─── Employee: toggle a checkpoint on today's instance ─────────────────────
// POST /recurring-tasks/instances/:instanceId/checkpoints/:checkpointId/toggle
router.post('/instances/:instanceId/checkpoints/:checkpointId/toggle', async (req, res) => {
  try {
    const { instanceId, checkpointId } = req.params;

    // Verify the instance belongs to this user's task
    const { data: inst, error: instErr } = await supabase
      .from('recurring_task_instances')
      .select('id, status, recurring_task_id, recurring_task_checkpoint_completions ( checkpoint_id )')
      .eq('id', instanceId)
      .single();
    if (instErr) throw instErr;

    // Check ownership
    const { data: rt, error: rtErr } = await supabase
      .from('recurring_tasks')
      .select('assigned_to')
      .eq('id', inst.recurring_task_id)
      .single();
    if (rtErr) throw rtErr;
    if (rt.assigned_to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your task' });
    }

    const completedIds = (inst.recurring_task_checkpoint_completions || []).map(c => c.checkpoint_id);
    const alreadyDone = completedIds.includes(checkpointId);

    if (alreadyDone) {
      // Uncheck
      await supabase.from('recurring_task_checkpoint_completions')
        .delete()
        .eq('instance_id', instanceId)
        .eq('checkpoint_id', checkpointId);
    } else {
      // Check
      await supabase.from('recurring_task_checkpoint_completions')
        .insert({ instance_id: instanceId, checkpoint_id: checkpointId });
    }

    // Now check if ALL checkpoints are done — if so, mark instance complete
    const { data: allCheckpoints } = await supabase
      .from('recurring_task_checkpoints')
      .select('id')
      .eq('recurring_task_id', inst.recurring_task_id);

    const { data: doneList } = await supabase
      .from('recurring_task_checkpoint_completions')
      .select('checkpoint_id')
      .eq('instance_id', instanceId);

    const allDone = allCheckpoints.length > 0 &&
      doneList.length === allCheckpoints.length;

    const newStatus = allDone ? 'Completed' : 'Pending';
    const { data: updated, error: updateErr } = await supabase
      .from('recurring_task_instances')
      .update({
        status: newStatus,
        completed_at: allDone ? new Date().toISOString() : null
      })
      .eq('id', instanceId)
      .select('id, status, completed_at, recurring_task_checkpoint_completions ( checkpoint_id )')
      .single();
    if (updateErr) throw updateErr;

    res.json(updated);
  } catch (err) {
    console.error('Toggle checkpoint error:', err.message);
    res.status(500).json({ error: err.message || 'Could not toggle checkpoint' });
  }
});

module.exports = router;
