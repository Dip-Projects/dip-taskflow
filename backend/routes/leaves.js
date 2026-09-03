const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendWhatsAppTemplate } = require('../lib/whatsapp');
const { elapsedWorkingHours } = require('../lib/workingHours');
const { workTimerAnchor, workTimerBudgetHours } = require('../lib/taskOverdue');

const router = express.Router();
router.use(requireAuth);

const LEAVE_SELECT_BASIC = `
  id, from_date, to_date, is_half_day, reason, status,
  decision_note, created_at, decided_at,
  user:users!leaves_user_id_fkey ( id, full_name ),
  decided_by_user:users!leaves_decided_by_fkey ( id, full_name )
`;

const LEAVE_SELECT = `
  ${LEAVE_SELECT_BASIC.trim()},
  buddy_id, buddy_status, buddy_responded_at, buddy_note,
  cover_needed, cover_resolved_at,
  buddy:users!leaves_buddy_id_fkey ( id, full_name )
`;

function isBuddySchemaError(err) {
  const m = String(err?.message || err?.details || err?.hint || '').toLowerCase();
  return (
    m.includes('buddy_id') ||
    m.includes('buddy_status') ||
    m.includes('buddy_note') ||
    m.includes('buddy_responded') ||
    m.includes('leaves_buddy_id_fkey') ||
    m.includes('leave_cover') ||
    m.includes('cover_needed') ||
    m.includes('cover_resolved') ||
    m.includes('whatsapp_number') ||
    (m.includes('column') && m.includes('buddy')) ||
    (m.includes('column') && m.includes('cover_'))
  );
}

function withBuddyDefaults(rows) {
  return (rows || []).map((row) => ({
    ...row,
    buddy_id: row.buddy_id ?? null,
    buddy_status: row.buddy_status ?? 'None',
    buddy_responded_at: row.buddy_responded_at ?? null,
    buddy_note: row.buddy_note ?? null,
    cover_needed: row.cover_needed ?? false,
    cover_resolved_at: row.cover_resolved_at ?? null,
    buddy: row.buddy ?? null,
  }));
}

async function chiragWhatsAppNumber() {
  const { data: byUser } = await supabase
    .from('users')
    .select('whatsapp_number')
    .eq('username', 'chirag.s')
    .maybeSingle();
  if (byUser?.whatsapp_number) return byUser.whatsapp_number;
  const { data: named } = await supabase
    .from('users')
    .select('whatsapp_number, full_name')
    .eq('is_active', true)
    .ilike('full_name', '%chirag%');
  const hit = (named || []).find((u) => u.whatsapp_number);
  return hit?.whatsapp_number || null;
}

/** Run a leaves select with buddy columns; fall back if SQL not migrated yet. */
async function selectLeaves(applyFilters) {
  const full = await applyFilters(supabase.from('leaves').select(LEAVE_SELECT));
  if (!full.error) return withBuddyDefaults(full.data);

  if (!isBuddySchemaError(full.error)) throw full.error;

  console.warn('Leave buddy columns missing — using basic select. Run backend/sql/add_leave_buddy.sql');
  const basic = await applyFilters(supabase.from('leaves').select(LEAVE_SELECT_BASIC));
  if (basic.error) throw basic.error;
  return withBuddyDefaults(basic.data);
}

async function notifyLeaveStakeholders({ applicantName, from_date, to_date, reason, applicantId }) {
  const numbers = new Set();

  const chiragWa = await chiragWhatsAppNumber();
  if (chiragWa) numbers.add(chiragWa);
  else console.warn('Leave WA: Chirag has no whatsapp_number');

  const { data: applicant } = await supabase
    .from('users')
    .select('reporting_head_id, full_name')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicant?.reporting_head_id) {
    const { data: head } = await supabase
      .from('users')
      .select('whatsapp_number, full_name')
      .eq('id', applicant.reporting_head_id)
      .maybeSingle();
    if (head?.whatsapp_number) numbers.add(head.whatsapp_number);
    else console.warn('Leave WA: reporting head has no whatsapp_number', applicant.reporting_head_id);
  } else {
    console.warn('Leave WA: applicant has no reporting_head_id', applicantId);
  }

  if (!numbers.size) {
    console.warn('Leave WA: nobody to notify (no numbers)');
    return;
  }

  await Promise.all(
    [...numbers].map((num) =>
      sendWhatsAppTemplate(num, 'leave_application_notification', [
        applicantName,
        String(from_date || '—').slice(0, 10),
        String(to_date || '—').slice(0, 10),
        String(reason || '—').slice(0, 500),
      ])
    )
  );
}

/** WhatsApp Chirag + reporting head (deduped). Reuses leave_application_notification. */
async function notifyHeadAndChirag(applicantId, reasonText, from_date, to_date) {
  const { data: applicant } = await supabase
    .from('users')
    .select('full_name, reporting_head_id')
    .eq('id', applicantId)
    .maybeSingle();
  if (!applicant) return;

  const numbers = new Set();
  const chiragWa = await chiragWhatsAppNumber();
  if (chiragWa) numbers.add(chiragWa);

  if (applicant.reporting_head_id) {
    const { data: head } = await supabase
      .from('users')
      .select('whatsapp_number')
      .eq('id', applicant.reporting_head_id)
      .maybeSingle();
    if (head?.whatsapp_number) numbers.add(head.whatsapp_number);
  }

  await Promise.all(
    [...numbers].map((num) =>
      sendWhatsAppTemplate(num, 'leave_application_notification', [
        applicant.full_name || 'Employee',
        String(from_date || '—').slice(0, 10),
        String(to_date || '—').slice(0, 10),
        String(reasonText || '—').slice(0, 500),
      ])
    )
  );
}

function todayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function taskDay(iso) {
  return String(iso || '').slice(0, 10);
}

async function fetchLeaveWindowTasks(leave) {
  const fromDay = String(leave.from_date).slice(0, 10);
  const toDay = String(leave.to_date).slice(0, 10);
  let tasks = [];
  {
    const withCover = await supabase
      .from('tasks')
      .select('id, description, assigned_to, target_date, status, priority, leave_cover_id')
      .eq('assigned_to', leave.user_id)
      .in('status', ['Pending', 'In Progress']);
    if (withCover.error && isBuddySchemaError(withCover.error)) {
      const retry = await supabase
        .from('tasks')
        .select('id, description, assigned_to, target_date, status, priority')
        .eq('assigned_to', leave.user_id)
        .in('status', ['Pending', 'In Progress']);
      if (retry.error) throw retry.error;
      tasks = retry.data || [];
    } else if (withCover.error) {
      throw withCover.error;
    } else {
      tasks = withCover.data || [];
    }
  }
  return (tasks || []).filter((t) => {
    // Already handled at leave apply (buddy / hold / reschedule) — don't auto-move again
    if (t.leave_cover_id) return false;
    const day = taskDay(t.target_date);
    return day && day >= fromDay && day <= toDay;
  });
}

async function setCoverNeeded(leaveId, needed) {
  const patch = needed
    ? { cover_needed: true, cover_resolved_at: null }
    : { cover_needed: false, cover_resolved_at: new Date().toISOString() };
  const { error } = await supabase.from('leaves').update(patch).eq('id', leaveId);
  if (error && !isBuddySchemaError(error)) throw error;
  return !error;
}

async function transferTasksToBuddy(leave) {
  if (!leave?.buddy_id || leave.buddy_status !== 'Accepted') {
    return { transferred: 0 };
  }
  // Only move tasks after leave is Approved — never on buddy Yes alone,
  // and never if leave was Rejected / Cancelled.
  if (String(leave.status || '') !== 'Approved') {
    return { transferred: 0 };
  }
  const tasks = await fetchLeaveWindowTasks(leave);
  if (!tasks.length) return { transferred: 0 };

  // Keep each task's original target_date. Accept day must not pull a
  // 20 Aug task forward to 15 Aug just because the buddy said Yes today.
  let transferred = 0;
  for (const t of tasks) {
    const fullPatch = {
      assigned_to: leave.buddy_id,
      leave_cover_id: leave.id,
      leave_cover_from: leave.user_id,
    };
    const { error: upErr } = await supabase
      .from('tasks')
      .update(fullPatch)
      .eq('id', t.id)
      .eq('assigned_to', leave.user_id);
    if (!upErr) {
      transferred += 1;
      continue;
    }
    const { error: up2 } = await supabase
      .from('tasks')
      .update({ assigned_to: leave.buddy_id })
      .eq('id', t.id)
      .eq('assigned_to', leave.user_id);
    if (!up2) transferred += 1;
  }
  if (transferred > 0) await setCoverNeeded(leave.id, false);
  return { transferred };
}

/** If tasks were moved for this leave, put them back on the original assignee. */
async function revertTasksFromBuddy(leave) {
  if (!leave?.id) return { reverted: 0 };
  let rows = [];
  const withCover = await supabase
    .from('tasks')
    .select('id, leave_cover_from, assigned_to')
    .eq('leave_cover_id', leave.id);
  if (!withCover.error) {
    rows = withCover.data || [];
  } else if (!isBuddySchemaError(withCover.error)) {
    throw withCover.error;
  }

  let reverted = 0;
  for (const t of rows) {
    const backTo = t.leave_cover_from || leave.user_id;
    if (!backTo) continue;
    const patch = {
      assigned_to: backTo,
      leave_cover_id: null,
      leave_cover_from: null,
    };
    const { error } = await supabase.from('tasks').update(patch).eq('id', t.id);
    if (error && isBuddySchemaError(error)) {
      const { error: e2 } = await supabase
        .from('tasks')
        .update({ assigned_to: backTo })
        .eq('id', t.id);
      if (!e2) reverted += 1;
    } else if (!error) {
      reverted += 1;
    }
  }
  await setCoverNeeded(leave.id, false);
  return { reverted };
}

function normDept(d) {
  return String(d || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// ----------------------------- buddy picker (any logged-in user) -----------------------------
router.get('/buddies', async (req, res) => {
  try {
    // Fresh department from DB (JWT may be stale)
    const { data: me, error: meErr } = await supabase
      .from('users')
      .select('id, department, department_id')
      .eq('id', req.user.id)
      .maybeSingle();
    if (meErr) throw meErr;

    const myDept = normDept(me?.department || req.user.department);
    const myDeptId = me?.department_id || req.user.department_id || null;

    if (!myDept && !myDeptId) {
      return res.json([]);
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, department, department_id, designation, role, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true });
    if (error) throw error;

    // Strict same-department only (MDO OFFICE → MDO OFFICE only, Engg → Engg only)
    const rows = (data || []).filter((u) => {
      if (String(u.id) === String(req.user.id)) return false;
      if (String(u.role || '').toLowerCase() === 'client') return false;
      if (myDeptId && u.department_id && String(u.department_id) === String(myDeptId)) {
        return true;
      }
      return myDept && normDept(u.department) === myDept;
    });

    res.json(rows);
  } catch (err) {
    console.error('Buddy list error:', err.message);
    res.status(500).json({ error: 'Could not load buddy list' });
  }
});

// ----------------------------- apply for leave -----------------------------
router.post('/', async (req, res) => {
  try {
    const { from_date, to_date, is_half_day, reason, buddy_id } = req.body || {};

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'Please select both from and to dates' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Please give a reason for the leave' });
    }
    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ error: 'To date cannot be before from date' });
    }
    if (!buddy_id) {
      return res.status(400).json({ error: 'Please choose a buddy to cover your tasks' });
    }
    if (String(buddy_id) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot select yourself as buddy' });
    }

    let buddy = null;
    {
      const { data: buddyUser, error: buddyErr } = await supabase
        .from('users')
        .select('id, full_name, whatsapp_number, is_active, role, department, department_id')
        .eq('id', buddy_id)
        .maybeSingle();
      if (buddyErr && isBuddySchemaError(buddyErr)) {
        const retry = await supabase
          .from('users')
          .select('id, full_name, is_active, role, department, department_id')
          .eq('id', buddy_id)
          .maybeSingle();
        if (retry.error) throw retry.error;
        buddy = retry.data ? { ...retry.data, whatsapp_number: null } : null;
      } else if (buddyErr) {
        throw buddyErr;
      } else {
        buddy = buddyUser;
      }
    }
    if (!buddy || buddy.is_active === false) {
      return res.status(400).json({ error: 'Selected buddy is not available' });
    }
    if ((buddy.role || '').toLowerCase() === 'client') {
      return res.status(400).json({ error: 'Client users cannot be leave buddies' });
    }

    // Buddy must be same department (MDO with MDO, Engg with Engg, …)
    {
      const { data: me } = await supabase
        .from('users')
        .select('department, department_id')
        .eq('id', req.user.id)
        .maybeSingle();
      const myDept = normDept(me?.department || req.user.department);
      const myDeptId = me?.department_id || req.user.department_id || null;
      const buddyDept = normDept(buddy.department);
      const sameById = myDeptId && buddy.department_id && String(myDeptId) === String(buddy.department_id);
      const sameByName = myDept && buddyDept && myDept === buddyDept;
      if (!sameById && !sameByName) {
        return res.status(400).json({
          error: 'Buddy must be from your own department (e.g. MDO OFFICE → MDO OFFICE only)',
        });
      }
    }

    const insertPayload = {
        user_id: req.user.id,
        from_date,
        to_date,
        is_half_day: !!is_half_day,
        reason: reason.trim(),
      status: 'Pending',
      buddy_id,
      buddy_status: 'Pending',
    };

    let { data, error } = await supabase
      .from('leaves')
      .insert(insertPayload)
      .select(LEAVE_SELECT)
      .single();

    if (error && isBuddySchemaError(error)) {
      return res.status(503).json({
        error:
          'Leave buddy setup is not ready in the database yet. Ask admin to run add_leave_buddy.sql in Supabase, then try again.',
      });
    }
if (error) throw error;

    try {
      await notifyLeaveStakeholders({
        applicantName: req.user.full_name,
        from_date,
        to_date,
        reason: reason.trim(),
        applicantId: req.user.id,
      });
    } catch (waErr) {
      console.warn('Leave WA (head/Chirag) skip:', waErr.message);
    }

    try {
      if (buddy.whatsapp_number) {
        await sendWhatsAppTemplate(buddy.whatsapp_number, 'leave_buddy_request', [
          buddy.full_name,
        req.user.full_name,
        from_date,
        to_date,
          reason.trim(),
        ]);
      }
    } catch (buddyWaErr) {
      console.warn('Leave WA (buddy) skip:', buddyWaErr.message);
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Apply leave error:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit leave request' });
  }
});

// ----------------------------- open tasks for leave planning popup -----------------------------
router.get('/:id/open-tasks', async (req, res) => {
  try {
    const { data: leave, error } = await supabase
      .from('leaves')
      .select('id, user_id, from_date, to_date, buddy_id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (String(leave.user_id) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your leave request' });
    }

    const fromDay = String(leave.from_date).slice(0, 10);
    const toDay = String(leave.to_date).slice(0, 10);
    const { data: tasks, error: tErr } = await supabase
      .from('tasks')
      .select(
        'id, description, status, priority, target_date, hours_to_complete, accepted_at, is_on_hold, rescheduling_possible, reschedule_status, verification_status, project:projects(id, name)'
      )
      .eq('assigned_to', leave.user_id)
      .in('status', ['Pending', 'In Progress', 'Ticket Raised'])
      .order('target_date', { ascending: true });
    if (tErr) throw tErr;

    const rows = (tasks || []).map((t) => {
      const day = taskDay(t.target_date);
      const inWindow = !!(day && day >= fromDay && day <= toDay);
      return { ...t, in_leave_window: inWindow };
    });
    // Prefer window tasks first, then other open work
    rows.sort((a, b) => Number(b.in_leave_window) - Number(a.in_leave_window));
    res.json({ leave, tasks: rows });
  } catch (err) {
    console.error('Leave open-tasks error:', err.message);
    res.status(500).json({ error: err.message || 'Could not load tasks' });
  }
});

// ----------------------------- plan task actions right after leave apply -----------------------------
router.post('/:id/task-actions', async (req, res) => {
  try {
    const { data: leave, error } = await supabase
      .from('leaves')
      .select('id, user_id, from_date, to_date, buddy_id, buddy_status, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (String(leave.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the applicant can plan leave task actions' });
    }
    if (String(leave.status) !== 'Pending' && String(leave.status) !== 'Approved') {
      return res.status(400).json({ error: 'Leave is no longer open for task planning' });
    }

    const actions = Array.isArray(req.body?.actions) ? req.body.actions : [];
    if (!actions.length) {
      return res.json({ ok: true, results: [] });
    }

    const results = [];
    for (const raw of actions) {
      const taskId = raw?.task_id;
      const action = String(raw?.action || '').toLowerCase();
      if (!taskId || !['buddy', 'hold', 'reschedule'].includes(action)) {
        results.push({ task_id: taskId || null, action, ok: false, error: 'Invalid action' });
        continue;
      }
      try {
        const { data: task, error: tErr } = await supabase
          .from('tasks')
          .select(
            'id, assigned_to, status, description, target_date, accepted_at, hours_to_complete, original_hours_to_complete, is_on_hold, hold_remaining_hours, held_at, hold_count, verification_status, reschedule_status, rescheduling_possible, task_events, leave_cover_id'
          )
          .eq('id', taskId)
          .maybeSingle();
        if (tErr) throw tErr;
        if (!task) {
          results.push({ task_id: taskId, action, ok: false, error: 'Task not found' });
          continue;
        }
        if (String(task.assigned_to) !== String(req.user.id)) {
          results.push({ task_id: taskId, action, ok: false, error: 'Not your task' });
          continue;
        }
        if (task.status === 'Completed' || String(task.status).toLowerCase() === 'rejected') {
          results.push({ task_id: taskId, action, ok: false, error: 'Task already closed' });
          continue;
        }

        if (action === 'buddy') {
          if (!leave.buddy_id) {
            results.push({ task_id: taskId, action, ok: false, error: 'No buddy on this leave' });
            continue;
          }
          const patch = {
            assigned_to: leave.buddy_id,
            leave_cover_id: leave.id,
            leave_cover_from: leave.user_id,
            is_on_hold: false,
            hold_remaining_hours: null,
            held_at: null,
          };
          let { error: upErr } = await supabase.from('tasks').update(patch).eq('id', taskId);
          if (upErr && isBuddySchemaError(upErr)) {
            const retry = await supabase
              .from('tasks')
              .update({ assigned_to: leave.buddy_id })
              .eq('id', taskId);
            upErr = retry.error;
          }
          if (upErr) throw upErr;
          results.push({ task_id: taskId, action, ok: true });
          continue;
        }

        if (action === 'hold') {
          if (task.verification_status === 'Pending Verification') {
            results.push({ task_id: taskId, action, ok: false, error: 'Cannot hold while verifying' });
            continue;
          }
          const at = new Date().toISOString();
          const markCover = {
            leave_cover_id: leave.id,
            leave_cover_from: leave.user_id,
          };
          if (task.status === 'In Progress' && task.accepted_at && !task.is_on_hold) {
            const totalHours = Number(task.hours_to_complete);
            let remaining = totalHours > 0 ? totalHours : 0;
            try {
              const anchor = workTimerAnchor(task) || task.accepted_at;
              const budget = workTimerBudgetHours(task);
              const elapsed = elapsedWorkingHours(anchor, at);
              remaining = Math.max(0, Math.round((budget - elapsed) * 100) / 100);
            } catch (_) {
              /* keep remaining as hours_to_complete */
            }
            const events = Array.isArray(task.task_events) ? [...task.task_events] : [];
            events.push({
              at,
              action: 'hold',
              by: req.user.id,
              remaining_hours: remaining,
              timer: 'stopped',
              reason: 'leave',
              leave_id: leave.id,
            });
            const holdPatch = {
              ...markCover,
              is_on_hold: true,
              held_at: at,
              hold_remaining_hours: remaining,
              hold_count: (Number(task.hold_count) || 0) + 1,
              original_hours_to_complete:
                task.original_hours_to_complete != null
                  ? task.original_hours_to_complete
                  : task.hours_to_complete,
              task_events: events.slice(-80),
            };
            let { error: upErr } = await supabase.from('tasks').update(holdPatch).eq('id', taskId);
            if (upErr) {
              // Fallback without optional columns
              const { error: up2 } = await supabase
                .from('tasks')
                .update({
                  is_on_hold: true,
                  held_at: at,
                  hold_remaining_hours: remaining,
                  ...markCover,
                })
                .eq('id', taskId);
              if (up2 && isBuddySchemaError(up2)) {
                const { error: up3 } = await supabase
                  .from('tasks')
                  .update({ is_on_hold: true, held_at: at, hold_remaining_hours: remaining })
                  .eq('id', taskId);
                if (up3) throw up3;
              } else if (up2) throw up2;
            }
            results.push({ task_id: taskId, action, ok: true });
            continue;
          }
          // Pending / already held: keep with employee, mark handled so buddy auto-transfer skips
          let { error: upErr } = await supabase.from('tasks').update(markCover).eq('id', taskId);
          if (upErr && isBuddySchemaError(upErr)) {
            results.push({
              task_id: taskId,
              action,
              ok: true,
              note: 'Kept with you (cover columns not available)',
            });
          } else if (upErr) throw upErr;
          else results.push({ task_id: taskId, action, ok: true });
          continue;
        }

        if (action === 'reschedule') {
          const requested_date = String(raw?.requested_date || '').slice(0, 10);
          if (!requested_date) {
            results.push({ task_id: taskId, action, ok: false, error: 'Pick a new date' });
            continue;
          }
          if (!task.rescheduling_possible) {
            results.push({ task_id: taskId, action, ok: false, error: 'Reschedule not allowed on this task' });
            continue;
          }
          if (task.status === 'Ticket Raised') {
            results.push({ task_id: taskId, action, ok: false, error: 'Ticket raised — cannot reschedule' });
            continue;
          }
          if (task.verification_status === 'Pending Verification') {
            results.push({ task_id: taskId, action, ok: false, error: 'Pending verification' });
            continue;
          }
          if (task.reschedule_status === 'Pending') {
            results.push({ task_id: taskId, action, ok: false, error: 'Reschedule already pending' });
            continue;
          }
          const reason =
            (raw?.reason && String(raw.reason).trim()) ||
            `Leave ${String(leave.from_date).slice(0, 10)} → ${String(leave.to_date).slice(0, 10)}`;
          const patch = {
            reschedule_status: 'Pending',
            reschedule_requested_date: requested_date,
            reschedule_reason: reason,
            reschedule_requested_at: new Date().toISOString(),
            reschedule_decided_by: null,
            reschedule_decided_at: null,
            leave_cover_id: leave.id,
            leave_cover_from: leave.user_id,
          };
          let { error: upErr } = await supabase.from('tasks').update(patch).eq('id', taskId);
          if (upErr && isBuddySchemaError(upErr)) {
            delete patch.leave_cover_id;
            delete patch.leave_cover_from;
            const retry = await supabase.from('tasks').update(patch).eq('id', taskId);
            upErr = retry.error;
          }
          if (upErr) throw upErr;
          results.push({ task_id: taskId, action, ok: true });
        }
      } catch (inner) {
        results.push({ task_id: taskId, action, ok: false, error: inner.message || 'Failed' });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    res.json({ ok: true, applied: okCount, results });
  } catch (err) {
    console.error('Leave task-actions error:', err.message);
    res.status(500).json({ error: err.message || 'Could not apply task actions' });
  }
});

// ----------------------------- my leave requests -----------------------------
router.get('/my', async (req, res) => {
  try {
    const data = await selectLeaves((q) =>
      q.eq('user_id', req.user.id).order('created_at', { ascending: false })
    );
    res.json(data);
  } catch (err) {
    console.error('List my leaves error:', err.message);
    res.status(500).json({ error: err.message || 'Could not load your leave requests' });
  }
});

// ----------------------------- buddy requests for me -----------------------------
router.get('/buddy-requests', async (req, res) => {
  try {
    // If buddy columns are missing, there are no buddy requests yet
    const probe = await supabase.from('leaves').select('buddy_id').limit(1);
    if (probe.error && isBuddySchemaError(probe.error)) {
      return res.json([]);
    }

    const data = await selectLeaves((q) =>
      q
        .eq('buddy_id', req.user.id)
        .in('buddy_status', ['Pending', 'pending'])
        .order('created_at', { ascending: false })
    );
    res.json(data);
  } catch (err) {
    console.error('Buddy requests error:', err.message);
    if (isBuddySchemaError(err)) return res.json([]);
    res.status(500).json({ error: 'Could not load buddy requests' });
  }
});

router.patch('/:id/buddy-respond', async (req, res) => {
  try {
    const { id } = req.params;
    const accept = !!(req.body || {}).accept;
    const note = ((req.body || {}).note || '').trim() || null;

    const { data: existing, error: fetchErr } = await supabase
      .from('leaves')
      .select('id, buddy_id, buddy_status, status, user_id, from_date, to_date, reason')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      if (isBuddySchemaError(fetchErr)) {
        return res.status(503).json({
          error: 'Leave buddy setup is not ready. Run add_leave_buddy.sql in Supabase.',
        });
      }
      throw fetchErr;
    }
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (String(existing.buddy_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the selected buddy can respond' });
    }
    if (existing.buddy_status !== 'Pending') {
      return res.status(400).json({ error: 'This buddy request was already decided' });
    }
    if (existing.status === 'Rejected' || existing.status === 'Cancelled') {
      return res.status(400).json({ error: 'This leave is no longer active' });
    }

    const buddy_status = accept ? 'Accepted' : 'Declined';
    const { data, error } = await supabase
      .from('leaves')
      .update({
        buddy_status,
        buddy_responded_at: new Date().toISOString(),
        buddy_note: note,
      })
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single();
    if (error) throw error;

    let tasksMoved = 0;
    const acceptDay = todayYmd();
    if (accept) {
      // Only transfer if leave is already Approved. If leave is still Pending,
      // buddy Yes is recorded and tasks move later on admin leave approve.
      if (String(existing.status || '') === 'Approved') {
        const transfer = await transferTasksToBuddy({
          ...existing,
          buddy_id: req.user.id,
          buddy_status: 'Accepted',
          status: 'Approved',
        });
        tasksMoved = transfer.transferred || 0;
        if (tasksMoved > 0) {
          try {
            await notifyHeadAndChirag(
              existing.user_id,
              `${tasksMoved} task(s) moved to buddy ${req.user.full_name}. Target dates stay as they were.`,
              existing.from_date,
              existing.to_date
            );
          } catch (waErr) {
            console.warn('Leave WA (accept) skip:', waErr.message);
          }
        }
      }
    } else {
      // Cover needed only after leave is Approved + buddy Declined (not while Pending)
      if (String(existing.status || '') === 'Approved') {
        await setCoverNeeded(id, true);
        try {
          await notifyHeadAndChirag(
            existing.user_id,
            `Buddy ${req.user.full_name} declined cover. Admin: reassign the leave-window tasks or change their target date in TaskFlow.`,
            existing.from_date,
            existing.to_date
          );
        } catch (waErr) {
          console.warn('Leave WA (decline) skip:', waErr.message);
        }
      }
    }

    try {
      const { data: applicant } = await supabase
        .from('users')
        .select('whatsapp_number, full_name')
        .eq('id', existing.user_id)
        .maybeSingle();
      if (applicant?.whatsapp_number) {
        await sendWhatsAppTemplate(applicant.whatsapp_number, 'leave_buddy_response', [
          applicant.full_name,
          req.user.full_name,
          accept ? 'accepted' : 'declined',
          existing.from_date,
          existing.to_date,
        ]);
      }
    } catch (buddyWaErr) {
      console.warn('Leave WA (applicant buddy response) skip:', buddyWaErr.message);
    }

    res.json({
      ...data,
      tasks_moved: tasksMoved,
      cover_needed: !accept && String(existing.status || '') === 'Approved',
      accept_date: accept ? acceptDay : null,
      transfer_pending_leave_approval:
        accept && String(existing.status || '') !== 'Approved',
    });
  } catch (err) {
    console.error('Buddy respond error:', err.message);
    res.status(500).json({ error: err.message || 'Could not save buddy response' });
  }
});

// ----------------------------- unresolved leave covers (head / admin) -----------------------------
router.get('/unresolved-covers', async (req, res) => {
  try {
    const probe = await supabase.from('leaves').select('cover_needed').eq('cover_needed', true).limit(1);
    if (probe.error && isBuddySchemaError(probe.error)) {
      return res.json([]);
    }

    let query = supabase
      .from('leaves')
      .select(
        `id, from_date, to_date, reason, status, buddy_status, cover_needed, user_id,
         user:users!leaves_user_id_fkey ( id, full_name, reporting_head_id ),
         buddy:users!leaves_buddy_id_fkey ( id, full_name )`
      )
      .eq('cover_needed', true)
      .in('status', ['Approved', 'Pending'])
      .order('from_date', { ascending: true });

    const { data: leaves, error } = await query;
    if (error) {
      if (isBuddySchemaError(error)) return res.json([]);
      throw error;
    }

    const isAdmin = req.user.role === 'admin';
    const filtered = (leaves || []).filter((lv) => {
      if (isAdmin) return true;
      return String(lv.user?.reporting_head_id || '') === String(req.user.id);
    });

    const { data: assignees } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    const out = [];
    for (const lv of filtered) {
      const tasks = await fetchLeaveWindowTasks({
        user_id: lv.user_id,
        from_date: lv.from_date,
        to_date: lv.to_date,
      });
      out.push({
        leave: withBuddyDefaults([lv])[0],
        applicant: lv.user,
        buddy: lv.buddy,
        tasks,
        assignees: assignees || [],
      });
    }
    res.json(out);
  } catch (err) {
    console.error('Unresolved covers error:', err.message);
    res.status(500).json({ error: 'Could not load unresolved leave covers' });
  }
});

router.post('/:id/resolve-cover', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, assignee_id, target_date, task_ids } = req.body || {};
    if (!['reassign', 'reschedule'].includes(action)) {
      return res.status(400).json({ error: 'Choose reassign or reschedule' });
    }
    if (action === 'reassign' && !assignee_id) {
      return res.status(400).json({ error: 'Pick who should take the tasks' });
    }
    if (action === 'reschedule' && !target_date) {
      return res.status(400).json({ error: 'Pick the new target date' });
    }

    const { data: leave, error: fetchErr } = await supabase
      .from('leaves')
      .select('id, user_id, from_date, to_date, status, cover_needed')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      if (isBuddySchemaError(fetchErr)) {
        return res.status(503).json({ error: 'Run add_leave_cover_needed.sql in Supabase first' });
      }
      throw fetchErr;
    }
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status === 'Rejected' || leave.status === 'Cancelled') {
      return res.status(400).json({ error: 'This leave is no longer active' });
    }

    const { data: applicant } = await supabase
      .from('users')
      .select('id, full_name, reporting_head_id')
      .eq('id', leave.user_id)
      .maybeSingle();

    const isAdmin = req.user.role === 'admin';
    const isHead = applicant && String(applicant.reporting_head_id) === String(req.user.id);
    if (!isAdmin && !isHead) {
      return res.status(403).json({ error: 'Only the reporting head or admin can resolve cover' });
    }

    let tasks = await fetchLeaveWindowTasks(leave);
    if (Array.isArray(task_ids) && task_ids.length) {
      const want = new Set(task_ids.map(String));
      tasks = tasks.filter((t) => want.has(String(t.id)));
    }
    if (!tasks.length) {
      await setCoverNeeded(id, false);
      return res.json({ ok: true, updated: 0, message: 'No open tasks left — cover cleared' });
    }

    let updated = 0;
    for (const t of tasks) {
      const patch =
        action === 'reassign'
          ? {
              assigned_to: assignee_id,
              leave_cover_id: leave.id,
              leave_cover_from: leave.user_id,
            }
          : { target_date };
      let { error: upErr } = await supabase.from('tasks').update(patch).eq('id', t.id);
      if (upErr && isBuddySchemaError(upErr) && action === 'reassign') {
        ({ error: upErr } = await supabase
          .from('tasks')
          .update({ assigned_to: assignee_id })
          .eq('id', t.id));
      }
      if (!upErr) updated += 1;
    }

    await setCoverNeeded(id, false);
    const note =
      action === 'reassign'
        ? `${updated} leave-window task(s) reassigned by ${req.user.full_name}`
        : `${updated} leave-window task(s) rescheduled to ${String(target_date).slice(0, 10)} by ${req.user.full_name}`;
    await notifyHeadAndChirag(leave.user_id, note, leave.from_date, leave.to_date);

    res.json({ ok: true, updated, action });
  } catch (err) {
    console.error('Resolve cover error:', err.message);
    res.status(500).json({ error: err.message || 'Could not resolve leave cover' });
  }
});

// ----------------------------- all leave requests (admin) -----------------------------
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const data = await selectLeaves((q) => {
      let filtered = q;
      if (req.query.status) filtered = filtered.eq('status', req.query.status);
      return filtered.order('created_at', { ascending: false });
    });
    res.json(data);
  } catch (err) {
    console.error('List all leaves error:', err.message);
    res.status(500).json({ error: 'Could not load leave requests' });
  }
});

// ----------------------------- approve (admin) -----------------------------
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchErr } = await supabase
      .from('leaves')
      .select('id, status, user_id, buddy_id, buddy_status, from_date, to_date')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) {
      if (isBuddySchemaError(fetchErr)) {
        // Approve without buddy checks if schema not ready
        const { data: basic, error: bErr } = await supabase
          .from('leaves')
          .select('id, status, user_id, from_date, to_date')
          .eq('id', id)
          .maybeSingle();
        if (bErr) throw bErr;
        if (!basic) return res.status(404).json({ error: 'Leave request not found' });
        if (basic.status !== 'Pending') {
          return res.status(400).json({ error: 'This request has already been decided' });
        }
        const { data, error } = await supabase
          .from('leaves')
          .update({
            status: 'Approved',
            decided_by: req.user.id,
            decided_at: new Date().toISOString(),
            decision_note: null,
          })
          .eq('id', id)
          .select(LEAVE_SELECT_BASIC)
          .single();
        if (error) throw error;
        return res.json({ ...withBuddyDefaults([data])[0], tasks_transferred: 0 });
      }
      throw fetchErr;
    }
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been decided' });
    }
    if (existing.buddy_id && existing.buddy_status === 'Pending') {
      return res.status(400).json({
        error: 'Buddy has not responded yet. Wait for Yes/No before approving.',
      });
    }

    const coverNeeded = !!(existing.buddy_id && existing.buddy_status === 'Declined');
    const updatePayload = {
        status: 'Approved',
        decided_by: req.user.id,
        decided_at: new Date().toISOString(),
      decision_note: null,
    };
    // Prefer writing cover flags when column exists
    if (coverNeeded) {
      updatePayload.cover_needed = true;
      updatePayload.cover_resolved_at = null;
    } else if (existing.buddy_status === 'Accepted') {
      updatePayload.cover_needed = false;
    }

    let { data, error } = await supabase
      .from('leaves')
      .update(updatePayload)
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single();

    if (error && isBuddySchemaError(error) && (coverNeeded || existing.buddy_status === 'Accepted')) {
      // cover_* columns may be missing — approve without them
      ({ data, error } = await supabase
        .from('leaves')
        .update({
          status: 'Approved',
          decided_by: req.user.id,
          decided_at: new Date().toISOString(),
          decision_note: null,
        })
        .eq('id', id)
        .select(LEAVE_SELECT_BASIC)
        .single());
      if (!error) data = withBuddyDefaults([data])[0];
    }

    if (error) throw error;

    let transferred = 0;
    if (existing.buddy_status === 'Accepted') {
      const transfer = await transferTasksToBuddy({
        ...existing,
        buddy_status: 'Accepted',
        status: 'Approved',
      });
      transferred = transfer.transferred;
      if (transferred > 0) {
        const { data: buddy } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', existing.buddy_id)
          .maybeSingle();
        await notifyHeadAndChirag(
          existing.user_id,
          `${transferred} task(s) transferred to buddy ${buddy?.full_name || 'cover'} for leave dates`,
          existing.from_date,
          existing.to_date
        );
      }
    } else if (coverNeeded) {
      await setCoverNeeded(id, true);
      const openTasks = await fetchLeaveWindowTasks(existing);
      await notifyHeadAndChirag(
        existing.user_id,
        `Leave approved but buddy declined. ${openTasks.length} open task(s) need reschedule or reassign in TaskFlow.`,
        existing.from_date,
        existing.to_date
      );
    }

    res.json({ ...data, tasks_transferred: transferred, cover_needed: coverNeeded });
  } catch (err) {
    console.error('Approve leave error:', err.message);
    res.status(500).json({ error: err.message || 'Could not approve leave request' });
  }
});

// ----------------------------- reject (admin) -----------------------------
router.patch('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: fetchErr } = await supabase
      .from('leaves')
      .select('id, status, user_id, buddy_id, buddy_status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been decided' });
    }

    let { data, error } = await supabase
      .from('leaves')
      .update({
        status: 'Rejected',
        decided_by: req.user.id,
        decided_at: new Date().toISOString(),
        decision_note: reason && reason.trim() ? reason.trim() : null,
        cover_needed: false,
        cover_resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single();

    if (error && isBuddySchemaError(error)) {
      const retry = await supabase
        .from('leaves')
        .update({
          status: 'Rejected',
          decided_by: req.user.id,
          decided_at: new Date().toISOString(),
          decision_note: reason && reason.trim() ? reason.trim() : null,
        })
        .eq('id', id)
        .select(LEAVE_SELECT_BASIC)
        .single();
      if (retry.error) throw retry.error;
      data = withBuddyDefaults([retry.data])[0];
      error = null;
    }
    if (error) throw error;

    // Rejected leave: never keep tasks on buddy — revert any earlier transfer
    let reverted = 0;
    try {
      const rev = await revertTasksFromBuddy(existing);
      reverted = rev.reverted || 0;
    } catch (revErr) {
      console.warn('Leave reject revert tasks skip:', revErr.message);
    }

    res.json({ ...data, tasks_reverted: reverted });
  } catch (err) {
    console.error('Reject leave error:', err.message);
    res.status(500).json({ error: err.message || 'Could not reject leave request' });
  }
});

// ----------------------------- cancel own pending request -----------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchErr } = await supabase
      .from('leaves')
      .select('id, user_id, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });

    const isOwn = existing.user_id === req.user.id;
    if (!isOwn && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only cancel your own leave requests' });
    }
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending requests can be cancelled' });
    }

    const { error } = await supabase.from('leaves').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Cancel leave error:', err.message);
    res.status(500).json({ error: err.message || 'Could not cancel leave request' });
  }
});

module.exports = router;
