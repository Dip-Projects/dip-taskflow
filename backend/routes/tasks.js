const express = require('express');
const multer = require('multer');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin, requireAdminOrMis } = require('../middleware/auth');
const { addWorkingHours, addCalendarDays } = require('../lib/workingHours');
const { sendWhatsAppTemplate } = require('../lib/whatsapp');
const router = express.Router();
router.use(requireAuth);

async function notifyWa(toNumber, templateName, bodyParams) {
  try {
    await sendWhatsAppTemplate(toNumber, templateName, bodyParams);
  } catch (err) {
    console.warn('WhatsApp skip:', templateName, err.message);
  }
}

function applyDeadlineChange(existing, body, note) {
  let target_date = existing.target_date;
  let hours_to_complete = existing.hours_to_complete != null ? Number(existing.hours_to_complete) : null;
  let extra_hours = Number(existing.extra_hours || 0);
  let extra_days = Number(existing.extra_days || 0);
  const extensions = Array.isArray(existing.correction_extensions) ? [...existing.correction_extensions] : [];
  const extraUnit = String(body.extra_unit || '').toLowerCase();
  const extraAmount = Number(body.extra_amount || 0);
  const newDueRaw = String(body.new_target_date || '').trim();
  let usedExplicitDue = false;
  if (newDueRaw) {
    const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(newDueRaw) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(newDueRaw)
      ? (() => {
          const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(newDueRaw);
          return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(newDueRaw);
        })()
      : new Date(newDueRaw);
    if (!Number.isNaN(d.getTime())) {
      target_date = d.toISOString();
      usedExplicitDue = true;
      extensions.push({
        at: new Date().toISOString(),
        by: body._by || null,
        unit: 'new_due',
        amount: 0,
        note: String(note || '').slice(0, 200),
        new_target_date: target_date,
      });
    }
  }
  if (extraAmount > 0 && (extraUnit === 'hours' || extraUnit === 'days')) {
    if (extraUnit === 'hours') {
      extra_hours += extraAmount;
      hours_to_complete = (hours_to_complete || 0) + extraAmount;
      if (!usedExplicitDue && target_date) {
        target_date = addWorkingHours(target_date, extraAmount).toISOString();
      }
    } else {
      extra_days += extraAmount;
      if (!usedExplicitDue && target_date) {
        target_date = addCalendarDays(target_date, extraAmount).toISOString();
      }
    }
    extensions.push({
      at: new Date().toISOString(),
      by: body._by || null,
      unit: extraUnit,
      amount: extraAmount,
      note: String(note || '').slice(0, 200),
    });
  }
  return { target_date, hours_to_complete, extra_hours, extra_days, extensions };
}

// Older deployments may not have run every SQL migration yet. Retry the update
// after dropping whichever column Postgres says it doesn't know about, so a
// missing migration degrades one field instead of breaking the whole action.
async function updateTaskTolerant(id, updates, select) {
  const attempt = { ...updates };
  for (let i = 0; i < 6; i += 1) {
    const { data, error } = await supabase
      .from('tasks')
      .update(attempt)
      .eq('id', id)
      .select(select)
      .single();
    if (!error) return data;
    const msg = String(error.message || '');
    const hit = /'([a-z_]+)' column/i.exec(msg) || /column "?([a-z_]+)"?/i.exec(msg);
    const col = hit && hit[1];
    if (col && Object.prototype.hasOwnProperty.call(attempt, col)) {
      delete attempt[col];
      continue;
    }
    throw error;
  }
  throw new Error('Could not update task');
}

function nowIso() {
  return new Date().toISOString();
}

function taskEventsOf(existing) {
  return Array.isArray(existing?.task_events) ? [...existing.task_events] : [];
}

function withTaskEvent(existing, action, by, extra = {}) {
  const events = taskEventsOf(existing);
  events.push({ at: nowIso(), action, by: by || null, ...extra });
  return events.slice(-80);
}

function firstStamp(existing, field, value) {
  return existing?.[field] || value;
}

const TASK_TIME_SELECT =
  'id, assigned_to, status, verifier_id, verification_status, assigned_at, accepted_at, sent_for_verification_at, verification_started_at, verification_started_by, verified_at, rejected_at, verification_decided_at, first_verified_at, first_sent_for_verification_at, first_verification_started_at, task_events, extra_hours, extra_days, correction_extensions, hours_to_complete, target_date, reschedule_status';

async function loadTaskForStamp(id) {
  let { data, error } = await supabase.from('tasks').select(TASK_TIME_SELECT).eq('id', id).maybeSingle();
  if (error && /column|schema cache/i.test(error.message || '')) {
    const retry = await supabase
      .from('tasks')
      .select('id, assigned_to, status, verifier_id, verification_status, accepted_at, sent_for_verification_at, verification_started_at, verification_started_by, verified_at, rejected_at, extra_hours, extra_days, correction_extensions, hours_to_complete, target_date, reschedule_status')
      .eq('id', id)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return data;
}

// Both "toast says success but the date shown afterwards is still the old
// one" reports (direct admin reschedule AND reschedule-request approval)
// share one thing in common: they both PATCH successfully, then immediately
// re-fetch via a GET to redraw the list. If that GET gets served from a
// cache (browser heuristic cache, or an intermediary/mobile-network proxy)
// instead of hitting this server, the redraw shows the pre-update snapshot
// even though the database was updated correctly. None of the GET routes
// below were sending explicit cache headers, so this was left to browser/
// proxy defaults. Forcing no-store removes that possibility entirely.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// 5 MB per file by default — change MAX_FILE_SIZE_MB below if you actually need a larger limit.
const MAX_FILE_SIZE_MB = 5;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
});

const BUCKET = 'task-files';

// Nested select used everywhere we return a task, so every task always
// looks the same on the wire (matches what frontend/app.js expects).
const TASK_SELECT = `
  id, description, hours_to_complete, target_date, priority,
  rescheduling_possible, status, status_note, attachment_url, voice_note_url, created_at,
  assigned_at, extra_hours, extra_days, correction_extensions,
  accepted_at, rejected_at, sent_for_verification_at, verified_at,
  verification_status, verification_note, verification_attachment_urls,
  verification_started_by, verification_started_at,
  correction_voice_url, updation_note,
  reschedule_status, reschedule_requested_date, reschedule_reason,
  reschedule_requested_at, reschedule_decided_at,
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  department:departments ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name ),
  assigned_by_user:users!tasks_assigned_by_fkey ( id, full_name ),
  verifier:users!tasks_verifier_id_fkey ( id, full_name ),
  reschedule_decided_by_user:users!tasks_reschedule_decided_by_fkey ( id, full_name )
`;

async function uploadFile(file, folder) {
  if (!file) return null;
  const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ----------------------------- create task (admin only) -----------------------------
router.post(
  '/',
  requireAdmin,
  upload.fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'voice_note', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        department_id,
        assigned_to,
        project_id,
        task_type_id,
        description,
        hours_to_complete,
        target_date,
        priority,
        rescheduling_possible
      } = req.body;

      // if (!department_id || !assigned_to || !project_id || !task_type_id || !description || !target_date) {
      //   return res.status(400).json({ error: 'Please fill in all required fields' });
      // }
if (!department_id || !assigned_to || !task_type_id || !description || !target_date) {
  return res.status(400).json({ error: 'Please fill in all required fields' });
}

// Project sirf non-MDO-OFFICE tasks ke liye compulsory hai
const { data: dept } = await supabase.from('departments').select('name').eq('id', department_id).maybeSingle();
const isMdoOffice = dept?.name === 'MDO OFFICE';
if (!isMdoOffice && !project_id) {
  return res.status(400).json({ error: 'Please select a project' });
}
      //above chg are 17th july
      
      const attachmentFile = req.files?.attachment?.[0];
      const voiceNoteFile = req.files?.voice_note?.[0];

      const [attachment_url, voice_note_url] = await Promise.all([
        uploadFile(attachmentFile, 'attachments'),
        uploadFile(voiceNoteFile, 'voice-notes')
      ]);

      const payload = {
          department_id,
          assigned_to,
          assigned_by: req.user.id,
          project_id: project_id || null,
          task_type_id,
          description,
          hours_to_complete: hours_to_complete ? Number(hours_to_complete) : null,
          target_date,
          priority: priority || 'Medium',
          rescheduling_possible: rescheduling_possible === 'true',
          attachment_url,
          voice_note_url,
          status: 'Pending',
          assigned_at: new Date().toISOString(),
          task_events: [{ at: new Date().toISOString(), action: 'assigned', by: req.user.id }],
      };
      let { data, error } = await supabase.from('tasks').insert(payload).select(TASK_SELECT).single();
      if (error && /task_events|assigned_at/i.test(error.message || '')) {
        delete payload.task_events;
        if (/assigned_at/i.test(error.message || '')) delete payload.assigned_at;
        const retry = await supabase.from('tasks').insert(payload).select(TASK_SELECT).single();
        data = retry.data;
        error = retry.error;
      }

    //   if (error) throw error;
    //   res.status(201).json(data);
    // } catch (err) {
    //   console.error('Create task error:', err.message);
      if (error) throw error;

      // Assignee WhatsApp (best-effort)
      const { data: assigneeUser } = await supabase
        .from('users')
        .select('whatsapp_number, full_name')
        .eq('id', assigned_to)
        .maybeSingle();

      if (assigneeUser?.whatsapp_number) {
        await notifyWa(assigneeUser.whatsapp_number, 'task_notification_v2', [
          assigneeUser.full_name || 'Team member',
          (description || 'New task').slice(0, 200),
          data.project?.name || '—',
          String(target_date || '—').slice(0, 10),
          priority || 'Medium',
        ]);
      } else {
        console.warn('Task created but assignee has no whatsapp_number:', assigned_to);
      }
      res.status(201).json(data);
    } catch (err) {
      console.error('Create task error:', err.message);
      res.status(500).json({ error: err.message || 'Could not create task' });
    }
  }
);

// ----------------------------- all delegated tasks (admin only, reference view) -----------------------------
// router.get('/all', requireAdmin, async (req, res) => {
//   try {
//     let query = supabase.from('tasks').select(TASK_SELECT).order('target_date', { ascending: true });

//     if (req.query.department_id) query = query.eq('department_id', req.query.department_id);
//     if (req.query.employee_id) query = query.eq('assigned_to', req.query.employee_id);
//     if (req.query.status) query = query.eq('status', req.query.status);
// ----------------------------- all delegated tasks (admin only) -----------------------------
router.get('/all', requireAdmin, async (req, res) => {
  try {
    let query = supabase.from('tasks').select(TASK_SELECT).order('target_date', { ascending: true });

    // Sirf MDO OFFICE ke admin (top-level) ko sab departments ka data dikhta
    // hai. Baaki har department ka admin (jaise Engg. Division ka head)
    // sirf apne hi department ke tasks dekh sakta hai.
    if (req.user.department !== 'MDO OFFICE') {
      if (!req.user.department_id) {
        return res.json([]);
      }
      query = query.eq('department_id', req.user.department_id);
    } else if (req.query.department_id) {
      query = query.eq('department_id', req.query.department_id);
    }

    if (req.query.employee_id) query = query.eq('assigned_to', req.query.employee_id);
    if (req.query.status) query = query.eq('status', req.query.status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List all tasks error:', err.message);
    res.status(500).json({ error: 'Could not load tasks' });
  }
});
// ----------------------------- my tasks (everyone — only their own) -----------------------------
router.get('/my', async (req, res) => {
  try {
    let query = supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('assigned_to', req.user.id)
      .order('target_date', { ascending: true });

    if (req.query.status) query = query.eq('status', req.query.status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List my tasks error:', err.message);
    res.status(500).json({ error: 'Could not load your tasks' });
  }
});

// ----------------------------- verification queue (for verifiers/admin) -----------------------------
// router.get('/verifications', async (req, res) => {
//   try {
//     let query = supabase
//       .from('tasks')
//       .select(TASK_SELECT)
//       .eq('verification_status', 'Pending Verification')
//       .order('target_date', { ascending: true });

//     // Admins have global oversight — they can verify any task, so they see
//     // every pending verification request, not just ones where they were
//     // specifically picked as the verifier. Everyone else only sees the ones
//     // routed to them.
//     if (req.user.role !== 'admin') {
//       query = query.eq('verifier_id', req.user.id);
//     }
router.get('/verifications', async (req, res) => {
  try {
    let query = supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('verification_status', 'Pending Verification')
      .order('target_date', { ascending: true });

    // MDO OFFICE admins have global oversight — they see every pending
    // verification request, not just ones where they were specifically
    // picked as the verifier. A department-level admin (e.g. Engg. Division
    // head) only sees requests from within their own department. Everyone
    // else (non-admin) only sees the ones routed to them personally.
    if (req.user.role === 'admin' && req.user.department === 'MDO OFFICE') {
      // no filter — sees everything
    } else if (req.user.role === 'admin') {
      query = query.eq('department_id', req.user.department_id);
    } else {
      query = query.eq('verifier_id', req.user.id);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List verifications error:', err.message);
    res.status(500).json({ error: 'Could not load verification requests' });
  }
});

// ----------------------------- start verification (the chosen verifier, or admin) -----------------------------
// Records who clicked "Start Verification" and when, directly on the task
// row. This used to be tracked only in the browser's sessionStorage, which
// meant the "started" state could vanish (tab closed, different device,
// storage cleared) and the button would appear to reset even though nothing
// had actually changed. Storing it server-side makes it permanent — once
// started, it stays started for that task, everywhere, for everyone.
// Idempotent: calling it again just returns the task as-is (first click wins).
router.patch('/:id/start-verification', async (req, res) => {
  try {
    const { id } = req.params;

    // const { data: existing, error: fetchErr } = await supabase
    //   .from('tasks')
    //   .select('id, verifier_id, verification_status, verification_started_by, verification_started_at')
    //   .eq('id', id)
    //   .maybeSingle();
    const existing = await loadTaskForStamp(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isChosenVerifier = existing.verifier_id === req.user.id;
    if (!isChosenVerifier && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not the verifier for this task' });
    }
    if (existing.verification_status !== 'Pending Verification') {
      return res.status(400).json({ error: 'This task is not awaiting verification' });
    }

    // Already started this cycle — keep the original start time.
    if (existing.verification_started_at || existing.verification_started_by) {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).single();
      if (error) throw error;
      return res.json(data);
    }

    const at = nowIso();
    // Stamp these two fields on their own so a missing task_events column
    // cannot swallow the start time (that is what made the button return after refresh).
    const { error: stampErr } = await supabase
      .from('tasks')
      .update({
        verification_started_by: req.user.id,
        verification_started_at: at,
      })
      .eq('id', id);
    if (stampErr) throw stampErr;

    try {
    try {
      await updateTaskTolerant(id, {
        first_verification_started_at: firstStamp(existing, 'first_verification_started_at', at),
        task_events: withTaskEvent(existing, 'start_verification', req.user.id),
      }, 'id');
    } catch (extraErr) {
      console.warn('Start verification extra fields skip:', extraErr.message);
    }
    } catch (extraErr) {
      console.warn('Start verification extra fields skip:', extraErr.message);
    }

    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).single();
    if (error) throw error;
    if (!data?.verification_started_at) {
      return res.status(503).json({
        error: 'Start verification time did not save. Run backend/sql/RUN_DIP_BOT_CHAT.sql in Supabase, then try again.',
      });
    }
    res.json(data);
  } catch (err) {
    console.error('Start verification error:', err.message);
    res.status(500).json({ error: err.message || 'Could not start verification' });
  }
});

// ----------------------------- accept task -----------------------------
router.patch('/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await loadTaskForStamp(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isOwnTask = existing.assigned_to === req.user.id;
    if (!isOwnTask && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only accept your own tasks' });
    }

    const at = nowIso();
    const data = await updateTaskTolerant(id, {
      status: 'In Progress',
      accepted_at: firstStamp(existing, 'accepted_at', at),
      task_events: withTaskEvent(existing, 'start_task', req.user.id),
    }, TASK_SELECT);
    res.json(data);
  } catch (err) {
    console.error('Accept task error:', err.message);
    res.status(500).json({ error: err.message || 'Could not accept task' });
  }
});

// ----------------------------- reject task (assignee declines — reason required) -----------------------------
router.patch('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Please give a reason for rejecting this task' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks').select('id, assigned_to').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isOwnTask = existing.assigned_to === req.user.id;
    if (!isOwnTask && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only reject your own tasks' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        status: 'Rejected',
        rejected_at: new Date().toISOString(),
        status_note: `Rejected by ${req.user.full_name}: ${reason.trim()}`
      })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Reject task error:', err.message);
    res.status(500).json({ error: err.message || 'Could not reject task' });
  }
});

// ----------------------------- update status (assignee or admin) -----------------------------
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, status_note } = req.body || {};
    const allowedStatuses = ['Pending', 'In Progress', 'Completed', 'Rejected'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await loadTaskForStamp(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isOwnTask = existing.assigned_to === req.user.id;
    if (!isOwnTask && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only update your own tasks' });
    }

    const at = nowIso();
    const updates = { status };
    if (status === 'Rejected') {
      updates.status_note = `Rejected by ${req.user.full_name}${status_note ? `: ${status_note}` : ''}`;
      updates.rejected_at = at;
      updates.task_events = withTaskEvent(existing, 'rejected', req.user.id);
    } else if (status === 'Pending') {
      updates.status_note = null;
    } else if (status === 'In Progress') {
      updates.accepted_at = firstStamp(existing, 'accepted_at', at);
      updates.task_events = withTaskEvent(existing, 'start_task', req.user.id);
    }

    const data = await updateTaskTolerant(id, updates, TASK_SELECT);
    res.json(data);
  } catch (err) {
    console.error('Update status error:', err.message);
    res.status(500).json({ error: 'Could not update task' });
  }
});

// ----------------------------- send for verification -----------------------------
// multipart/form-data: text field "verifier_id" + up to 3 files "verification_files"
router.patch(
  '/:id/send-for-verification',
  upload.array('verification_files', 3),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { verifier_id } = req.body || {};
      if (!verifier_id) {
        return res.status(400).json({ error: 'Please choose who should verify this task' });
      }

      const existing = await loadTaskForStamp(id);
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      const isOwnTask = existing.assigned_to === req.user.id;
      if (!isOwnTask && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only send your own tasks for verification' });
      }
      if (existing.status === 'Ticket Raised') {
        return res.status(400).json({ error: 'Cannot send for verification while a ticket is raised on this task' });
      }
      if (existing.reschedule_status === 'Pending') {
        return res.status(400).json({ error: 'Cannot send for verification while a reschedule request is pending approval' });
      }

      const files = req.files || [];
      const verification_attachment_urls = await Promise.all(
        files.map((file) => uploadFile(file, 'verification-attachments'))
      );

      const at = nowIso();
      const data = await updateTaskTolerant(id, {
        verifier_id,
        verification_status: 'Pending Verification',
        verification_note: null,
        correction_voice_url: null,
        sent_for_verification_at: at,
        first_sent_for_verification_at: firstStamp(existing, 'first_sent_for_verification_at', at),
        accepted_at: firstStamp(existing, 'accepted_at', at),
        verification_attachment_urls: verification_attachment_urls.length ? verification_attachment_urls : null,
        // current cycle restarts; first start-verification time is kept
        verification_started_by: null,
        verification_started_at: null,
        task_events: withTaskEvent(existing, 'send_for_verification', req.user.id),
      }, TASK_SELECT);

      const { data: verifierUser } = await supabase
        .from('users')
        .select('whatsapp_number, full_name')
        .eq('id', verifier_id)
        .maybeSingle();

      if (verifierUser?.whatsapp_number) {
        await notifyWa(verifierUser.whatsapp_number, 'task_verification_request', [
          verifierUser.full_name || 'Verifier',
          (data.description || 'Task').slice(0, 200),
          data.project?.name || '—',
        ]);
      } else {
        console.warn('Verification sent but verifier has no whatsapp_number:', verifier_id);
      }

      try {
        const bot = require('./bot');
        if (typeof bot.notifyVerifierBot === 'function') {
          await bot.notifyVerifierBot(
            verifier_id,
            data.description || 'Task',
            data.project?.name || '—'
          );
        }
      } catch (botErr) {
        console.warn('Verifier bot notify skip:', botErr.message);
      }

      res.json(data);
    } catch (err) {
      console.error('Send for verification error:', err.message);
      res.status(500).json({ error: err.message || 'Could not send for verification' });
    }
  }
);

// ----------------------------- approve verification (the chosen verifier, or admin) -----------------------------
router.patch('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, note } = req.body || {};

    const existing = await loadTaskForStamp(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isChosenVerifier = existing.verifier_id === req.user.id;
    if (!isChosenVerifier && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not the verifier for this task' });
    }

    const at = nowIso();
    const updates = approved
      ? {
          verification_status: 'Verified',
          verification_note: note || null,
          status: 'Completed',
          verified_at: at,
          first_verified_at: firstStamp(existing, 'first_verified_at', at),
          verification_decided_at: at,
          task_events: withTaskEvent(existing, 'verified', req.user.id),
        }
      : {
          verification_status: 'Verification Rejected',
          verification_note: note || null,
          status: 'In Progress',
          verification_decided_at: at,
          task_events: withTaskEvent(existing, 'verification_rejected', req.user.id),
        };

    const data = await updateTaskTolerant(id, updates, TASK_SELECT);
    res.json(data);
  } catch (err) {
    console.error('Verify task error:', err.message);
    res.status(500).json({ error: err.message || 'Could not update verification' });
  }
});

// ----------------------------- send correction (verifier/admin: reject with optional voice note) -----------------------------
// multipart/form-data: "note" text field + optional "correction_voice" audio file
router.patch(
  '/:id/send-correction',
  upload.single('correction_voice'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { note } = req.body || {};

      if (!note || !note.trim()) {
        return res.status(400).json({ error: 'Please write a correction note before sending' });
      }

      const existing = await loadTaskForStamp(id);
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      const isChosenVerifier = existing.verifier_id === req.user.id;
      if (!isChosenVerifier && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You are not the verifier for this task' });
      }

      let correction_voice_url = null;
      if (req.file) {
        try {
          correction_voice_url = await uploadFile(req.file, 'correction-voices');
        } catch (upErr) {
          console.warn('Correction voice upload skipped:', upErr.message);
        }
      }

      const extra = applyDeadlineChange(existing, { ...req.body, _by: req.user.id }, note);
      let target_date = extra.target_date;
      let hours_to_complete = extra.hours_to_complete;
      let extra_hours = extra.extra_hours;
      let extra_days = extra.extra_days;
      const extensions = extra.extensions;

      const updates = {
          verification_status: 'Verification Rejected',
          verification_note: note.trim(),
          status: 'In Progress',
          correction_voice_url,
          target_date,
          hours_to_complete,
          extra_hours,
          extra_days,
          correction_extensions: extensions,
          verification_decided_at: nowIso(),
          task_events: withTaskEvent(existing, 'correction', req.user.id),
        };

      const data = await updateTaskTolerant(id, updates, TASK_SELECT);
      res.json(data);
    } catch (err) {
      console.error('Send correction error:', err.message);
      res.status(500).json({ error: err.message || 'Could not send correction' });
    }
  }
);

// ----------------------------- send updation (verifier/admin: request changes with a note) -----------------------------
router.patch('/:id/send-updation', async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Please write an updation note before sending' });
    }

    const existing = await loadTaskForStamp(id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isChosenVerifier = existing.verifier_id === req.user.id;
    if (!isChosenVerifier && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not the verifier for this task' });
    }

    const extra = applyDeadlineChange(existing, { ...req.body, _by: req.user.id }, note);
    const updates = {
      verification_status: 'Updation Required',
      updation_note: note.trim(),
      status: 'In Progress',
      target_date: extra.target_date,
      hours_to_complete: extra.hours_to_complete,
      extra_hours: extra.extra_hours,
      extra_days: extra.extra_days,
      correction_extensions: extra.extensions,
      verification_decided_at: nowIso(),
      task_events: withTaskEvent(existing, 'updation', req.user.id),
    };

    const data = await updateTaskTolerant(id, updates, TASK_SELECT);
    res.json(data);
  } catch (err) {
    console.error('Send updation error:', err.message);
    res.status(500).json({ error: err.message || 'Could not send updation request' });
  }
});

// ----------------------------- reschedule (admin only — instant, no approval needed) -----------------------------
router.patch('/:id/reschedule', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
   // const { target_date } = req.body || {}; 17th july
    const { target_date, reason } = req.body || {};
    if (!target_date) {
      return res.status(400).json({ error: 'Please pick a new target date' });
    }
//17t july 
    // const { data: existing, error: fetchErr } = await supabase
    //   .from('tasks').select('id, reschedule_status').eq('id', id).maybeSingle();
    const { data: existing, error: fetchErr } = await supabase
      .from('tasks').select('id, reschedule_status, target_date').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const updates = { target_date };
    // If an employee's reschedule request was still pending, this direct
    // admin reschedule supersedes it — clear it out so it can't later be
    // approved and silently overwrite the date the admin just set here.
    if (existing.reschedule_status === 'Pending') {
      updates.reschedule_status = 'Rejected';
      updates.reschedule_reason = 'Superseded — admin rescheduled this task directly';
      updates.reschedule_decided_by = req.user.id;
      updates.reschedule_decided_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

  //   if (error) throw error;
  //   res.json(data);
  // } catch (err) {
  //   console.error('Reschedule error:', err.message); 17th july
    if (error) throw error;

    const { data: chirag } = await supabase
      .from('users').select('whatsapp_number').eq('username', 'chirag.s').maybeSingle();

    if (chirag?.whatsapp_number) {
      // sendWhatsAppTemplate(chirag.whatsapp_number, 'task_reschedule', [
      //   data.id,
      //   data.project?.name || '—',
      //   req.user.full_name,
      //   reason && reason.trim() ? reason.trim() : 'No reason given',
      //   existing.target_date || '—',
      //   target_date
      // ]).catch(() => {}); 17th july  chg
      await notifyWa(chirag.whatsapp_number, 'task_reschedule', [
        data.description,
        data.project?.name || '—',
        req.user.full_name,
        reason && reason.trim() ? reason.trim() : 'No reason given',
        existing.target_date || '—',
        target_date
      ]);
    }

    res.json(data);
  } catch (err) {
    console.error('Reschedule error:', err.message);
    res.status(500).json({ error: err.message || 'Could not reschedule task' });
  }
});

// ----------------------------- reschedule requests (employee asks, admin approves/rejects) -----------------------------
// An employee on a task with rescheduling_possible=true can no longer move
// the date themselves — they file a request here, which shows up for the
// admin to approve (applies the new date) or reject. The employee can see
// their own request's status the same way (read-only, no action buttons).

// Employee: request a new date for their own task
router.post('/:id/reschedule-request', async (req, res) => {
  try {
    const { id } = req.params;
    const { requested_date, reason } = req.body || {};
    if (!requested_date) {
      return res.status(400).json({ error: 'Please pick the date you want to move this task to' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks')
      .select('id, assigned_to, rescheduling_possible, reschedule_status, status, verification_status')
      .eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isOwnTask = existing.assigned_to === req.user.id;
    if (!isOwnTask && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only request a reschedule on your own tasks' });
    }
    if (!existing.rescheduling_possible) {
      return res.status(403).json({ error: 'Rescheduling was not allowed for this task' });
    }
    if (existing.status === 'Completed') {
      return res.status(400).json({ error: 'This task is already completed' });
    }
    if (existing.status === 'Ticket Raised') {
      return res.status(400).json({ error: 'Cannot request a reschedule while a ticket is raised on this task' });
    }
    if (existing.verification_status === 'Pending Verification') {
      return res.status(400).json({ error: 'Cannot request a reschedule while this task is pending verification' });
    }
    if (existing.reschedule_status === 'Pending') {
      return res.status(400).json({ error: 'A reschedule request is already pending for this task' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        reschedule_status: 'Pending',
        reschedule_requested_date: requested_date,
        reschedule_reason: reason && reason.trim() ? reason.trim() : null,
        reschedule_requested_at: new Date().toISOString(),
        reschedule_decided_by: null,
        reschedule_decided_at: null
      })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;

    // Notify Chirag Sir on every reschedule request
    try {
      const { data: chirag } = await supabase
        .from('users')
        .select('whatsapp_number')
        .eq('username', 'chirag.s')
        .maybeSingle();
      if (chirag?.whatsapp_number) {
        await notifyWa(chirag.whatsapp_number, 'task_reschedule', [
          data.description || 'Task',
          data.project?.name || '—',
          req.user.full_name,
          reason && reason.trim() ? reason.trim() : 'Reschedule requested',
          data.target_date || '—',
          requested_date,
        ]);
      }
    } catch (waErr) {
      console.warn('Reschedule WhatsApp skip:', waErr.message);
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Reschedule request error:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit reschedule request' });
  }
});

// List reschedule requests — admin sees every pending one (to action);
// everyone else sees only their own (whatever the current status is), read-only.
router.get('/reschedule-requests', async (req, res) => {
  try {
    let query = supabase
      .from('tasks')
      .select(TASK_SELECT)
      .neq('reschedule_status', 'None')
      .order('reschedule_requested_at', { ascending: false });

    if (req.user.role === 'admin') {
      query = query.eq('reschedule_status', 'Pending');
    } else {
      query = query.eq('assigned_to', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List reschedule requests error:', err.message);
    res.status(500).json({ error: 'Could not load reschedule requests' });
  }
});

// Admin: approve — applies the requested date as the new target date
router.patch('/:id/reschedule-request/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from('tasks').select('id, reschedule_status, reschedule_requested_date').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.reschedule_status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been decided' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        target_date: existing.reschedule_requested_date,
        reschedule_status: 'Approved',
        reschedule_decided_by: req.user.id,
        reschedule_decided_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Approve reschedule error:', err.message);
    res.status(500).json({ error: err.message || 'Could not approve reschedule request' });
  }
});

// Admin: reject — leaves the original target date untouched
router.patch('/:id/reschedule-request/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks').select('id, reschedule_status').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.reschedule_status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been decided' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        reschedule_status: 'Rejected',
        reschedule_reason: reason && reason.trim() ? reason.trim() : null,
        reschedule_decided_by: req.user.id,
        reschedule_decided_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Reject reschedule error:', err.message);
    res.status(500).json({ error: err.message || 'Could not reject reschedule request' });
  }
});

// ----------------------------- reassign (admin only) -----------------------------
router.patch('/:id/reassign', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body || {};
    if (!assigned_to) {
      return res.status(400).json({ error: 'Please choose who to reassign this task to' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        assigned_to,
        status: 'Pending',
        assigned_at: new Date().toISOString(),
        status_note: null,
        verifier_id: null,
        verification_status: null,
        verification_note: null,
        correction_voice_url: null
      })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Reassign task error:', err.message);
    res.status(500).json({ error: err.message || 'Could not reassign task' });
  }
});

// ----------------------------- admin report -----------------------------
// GET /tasks/report?range=day|week|month|custom&from=DATE&to=DATE
router.get('/report', requireAdminOrMis, async (req, res) => {
  try {
    const { range, from, to } = req.query;

    let startDate, endDate;
    const now = new Date();

    if (range === 'day') {
      startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
      endDate   = new Date(now); endDate.setHours(23, 59, 59, 999);
    } else if (range === 'week') {
      const day = now.getDay();
      startDate = new Date(now); startDate.setDate(now.getDate() - day); startDate.setHours(0, 0, 0, 0);
      endDate   = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59, 999);
    } else if (range === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (range === 'custom' && from && to) {
      startDate = new Date(from); startDate.setHours(0, 0, 0, 0);
      endDate   = new Date(to);   endDate.setHours(23, 59, 59, 999);
    } else {
      // default: current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        id, description, status, priority,
        created_at, assigned_at, accepted_at, sent_for_verification_at,
        verification_started_at, verified_at, rejected_at,
        hours_to_complete, target_date, extra_hours, extra_days,
        verification_status,
        project:projects ( id, name ),
        task_type:task_types ( id, name ),
        department:departments ( id, name ),
        assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name ),
        assigned_by_user:users!tasks_assigned_by_fkey ( id, full_name ),
        verifier:users!tasks_verifier_id_fkey ( id, full_name )
      `)
      .order('created_at', { ascending: false })
      .limit(3000);

    if (error) throw error;

    const inRange = (iso) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= startDate && d <= endDate;
    };
    const ranged = (tasks || []).filter(
      (t) =>
        inRange(t.created_at) ||
        inRange(t.assigned_at) ||
        inRange(t.accepted_at) ||
        inRange(t.sent_for_verification_at) ||
        inRange(t.verified_at) ||
        inRange(t.rejected_at)
    );

    // Helper: diff in hours between two timestamps
    function hrsBetween(a, b) {
      if (!a || !b) return null;
      return Math.round(((new Date(b) - new Date(a)) / 36e5) * 10) / 10;
    }

    // Enrich each task with computed time fields
    const enriched = ranged.map(t => {
      const assigned = t.assigned_at || t.created_at;
      return {
        ...t,
        assigned_at: assigned,
        time_to_accept_hrs: hrsBetween(assigned, t.accepted_at),
        time_to_submit_hrs: hrsBetween(t.accepted_at, t.sent_for_verification_at),
        time_to_start_verify_hrs: hrsBetween(t.sent_for_verification_at, t.verification_started_at),
        time_to_verify_hrs: hrsBetween(t.verification_started_at || t.sent_for_verification_at, t.verified_at),
        total_cycle_hrs: hrsBetween(assigned, t.verified_at || t.rejected_at),
        extra_hours: Number(t.extra_hours || 0),
        extra_days: Number(t.extra_days || 0),
      };
    });

    // Group by employee → project
    const byEmployee = {};
    for (const t of enriched) {
      const empId   = t.assigned_to_user?.id   || 'unknown';
      const empName = t.assigned_to_user?.full_name || 'Unknown';
      const projId  = t.project?.id   || 'no-project';
      const projName = t.project?.name || 'No project';

      if (!byEmployee[empId]) {
        byEmployee[empId] = { id: empId, name: empName, projects: {}, totalTasks: 0 };
      }
      const emp = byEmployee[empId];
      emp.totalTasks++;

      if (!emp.projects[projId]) {
        emp.projects[projId] = { id: projId, name: projName, tasks: [] };
      }
      emp.projects[projId].tasks.push(t);
    }

    // Convert to array form + compute project-level summaries
    const report = Object.values(byEmployee).map(emp => {
      const projects = Object.values(emp.projects).map(proj => {
        const tasks = proj.tasks;
        const completed  = tasks.filter(t => t.status === 'Completed').length;
        const pending    = tasks.filter(t => t.status === 'Pending').length;
        const inProgress = tasks.filter(t => t.status === 'In Progress').length;
        const rejected   = tasks.filter(t => t.status === 'Rejected').length;

        const avgCycle = (() => {
          const valid = tasks.map(t => t.total_cycle_hrs).filter(h => h !== null);
          return valid.length ? Math.round((valid.reduce((a,b)=>a+b,0) / valid.length) * 10) / 10 : null;
        })();

        return { ...proj, tasks, summary: { total: tasks.length, completed, pending, inProgress, rejected, avgCycleHrs: avgCycle } };
      });

      const allTasks = projects.flatMap((p) => p.tasks);
      const avg = (arr) => {
        const valid = arr.filter((h) => h != null);
        return valid.length ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : null;
      };
      const portfolio = {
        total: allTasks.length,
        completed: allTasks.filter((t) => t.status === 'Completed' || t.verification_status === 'Verified').length,
        pending: allTasks.filter((t) => t.status === 'Pending').length,
        inProgress: allTasks.filter((t) => t.status === 'In Progress').length,
        plannedHours: Math.round(allTasks.reduce((s, t) => s + Number(t.hours_to_complete || 0), 0) * 10) / 10,
        extraHours: allTasks.reduce((s, t) => s + Number(t.extra_hours || 0), 0),
        extraDays: allTasks.reduce((s, t) => s + Number(t.extra_days || 0), 0),
        avgAcceptHrs: avg(allTasks.map((t) => t.time_to_accept_hrs)),
        avgSubmitHrs: avg(allTasks.map((t) => t.time_to_submit_hrs)),
        avgVerifyHrs: avg(allTasks.map((t) => t.time_to_verify_hrs)),
        avgCycleHrs: avg(allTasks.map((t) => t.total_cycle_hrs)),
      };
      return { ...emp, projects, portfolio };
    });

    const byVerifier = {};
    for (const t of enriched) {
      const vid = t.verifier?.id || 'none';
      const vname = t.verifier?.full_name || 'No verifier';
      if (!byVerifier[vid]) {
        byVerifier[vid] = { id: vid, name: vname, projects: {}, total: 0, verifyHrs: [] };
      }
      const row = byVerifier[vid];
      row.total += 1;
      if (t.time_to_verify_hrs != null) row.verifyHrs.push(t.time_to_verify_hrs);
      const pid = t.project?.id || 'no-project';
      const pname = t.project?.name || 'No project';
      if (!row.projects[pid]) row.projects[pid] = { id: pid, name: pname, count: 0, verifyHrs: [] };
      row.projects[pid].count += 1;
      if (t.time_to_verify_hrs != null) row.projects[pid].verifyHrs.push(t.time_to_verify_hrs);
    }
    const verifiers = Object.values(byVerifier).map((v) => ({
      id: v.id,
      name: v.name,
      total: v.total,
      avgVerifyHrs: v.verifyHrs.length
        ? Math.round((v.verifyHrs.reduce((a, b) => a + b, 0) / v.verifyHrs.length) * 10) / 10
        : null,
      projects: Object.values(v.projects).map((p) => ({
        ...p,
        avgVerifyHrs: p.verifyHrs.length
          ? Math.round((p.verifyHrs.reduce((a, b) => a + b, 0) / p.verifyHrs.length) * 10) / 10
          : null,
        verifyHrs: undefined,
      })),
    }));

    res.json({
      range: range || 'month',
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      report,
      verifiers,
    });
  } catch (err) {
    console.error('Report error:', err.message);
    res.status(500).json({ error: err.message || 'Could not generate report' });
  }
});

// ----------------------------- FMS step tracker -----------------------------
// One row per task, each workflow step showing Planned vs Actual + delay,
// the same way the office FMS sheet is read.
const FMS_STEPS = [
  {
    key: 'accept',
    label: 'Start / Accept',
    what: 'Start / accept the assigned task',
    who: 'Assignee (PERSON)',
    how: 'In TaskFlow',
    why: 'Work starts only after the person accepts',
    when: '1',
  },
  {
    key: 'submit',
    label: 'Send for verification',
    what: 'Send completed work for checking',
    who: 'Assignee (PERSON)',
    how: 'In TaskFlow',
    why: 'Verifier cannot check until it is sent',
    when: '2',
  },
  {
    key: 'verify',
    label: 'Verification',
    what: 'Verify, send correction, or request update',
    who: 'Verifier',
    how: 'In TaskFlow',
    why: 'Close the task or send it back',
    when: '3',
  },
];

function fmsRangeDates(range, from, to) {
  const now = new Date();
  if (range === 'day') {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    const e = new Date(now); e.setHours(23, 59, 59, 999);
    return [s, e];
  }
  if (range === 'week') {
    const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
    return [s, e];
  }
  if (range === 'custom' && from && to) {
    const s = new Date(from); s.setHours(0, 0, 0, 0);
    const e = new Date(to); e.setHours(23, 59, 59, 999);
    return [s, e];
  }
  if (range === 'all') return [new Date('2000-01-01'), new Date('2999-12-31')];
  return [
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  ];
}

function fmsJobCode(name) {
  const words = String(name || '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'JB';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function fmsStep(planned, actual, isApplicable) {
  if (!isApplicable) return { planned: null, actual: null, status: 'NA', delayHrs: null };
  const p = planned ? new Date(planned) : null;
  const a = actual ? new Date(actual) : null;
  let status = 'Pending';
  let delayHrs = null;
  if (a && p) {
    delayHrs = Math.round(((a - p) / 36e5) * 10) / 10;
    status = delayHrs > 0 ? 'Delayed' : 'Done';
  } else if (a) {
    status = 'Done';
  } else if (p && p < new Date()) {
    status = 'Overdue';
    delayHrs = Math.round(((new Date() - p) / 36e5) * 10) / 10;
  }
  return {
    planned: p ? p.toISOString() : null,
    actual: a ? a.toISOString() : null,
    status,
    delayHrs,
  };
}

router.get('/fms', requireAdminOrMis, async (req, res) => {
  try {
    const { range, from, to, project, person } = req.query;
    const [startDate, endDate] = fmsRangeDates(range, from, to);

    const columns = `
      id, description, status, priority, created_at, assigned_at, accepted_at,
      sent_for_verification_at, verification_started_at, verified_at, rejected_at,
      verification_status, verification_decided_at, first_verified_at,
      first_sent_for_verification_at, first_verification_started_at,
      hours_to_complete, target_date,
      extra_hours, extra_days, correction_extensions,
      project:projects ( id, name ),
      task_type:task_types ( id, name ),
      department:departments ( id, name ),
      assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name ),
      assigned_by_user:users!tasks_assigned_by_fkey ( id, full_name ),
      verifier:users!tasks_verifier_id_fkey ( id, full_name )
    `;

    let selectCols = columns;
    let tasks = null;
    let error = null;
    for (let i = 0; i < 8; i += 1) {
      const result = await supabase
        .from('tasks')
        .select(selectCols)
        .order('created_at', { ascending: false })
        .limit(4000);
      tasks = result.data;
      error = result.error;
      if (!error) break;
      const hit = /column "?([a-z_]+)"?/i.exec(error.message || '') || /'([a-z_]+)' column/i.exec(error.message || '');
      const col = hit && hit[1];
      if (!col || !selectCols.includes(col)) break;
      selectCols = selectCols.replace(new RegExp(`\\s*${col},?`, 'i'), ' ');
    }
    if (error) throw error;

    const stamps = (t) => [
      t.created_at, t.assigned_at, t.accepted_at, t.sent_for_verification_at,
      t.verification_started_at, t.verified_at, t.rejected_at, t.verification_decided_at,
    ];
    const inRange = (iso) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d >= startDate && d <= endDate;
    };

    const seqByProject = {};
    const rows = (tasks || [])
      .filter((t) => stamps(t).some(inRange))
      .filter((t) => !project || String(t.project?.id) === String(project))
      .filter((t) => !person || String(t.assigned_to_user?.id) === String(person))
      .map((t) => {
        const assigned = t.assigned_at || t.created_at;
        const sentAt = t.sent_for_verification_at || t.first_sent_for_verification_at;
        const startVerifyAt = t.verification_started_at || t.first_verification_started_at;
        const verifiedAt = t.verified_at || t.first_verified_at;
        const decidedAt = t.verification_decided_at || verifiedAt || t.rejected_at;
        const pid = t.project?.id || 'none';
        seqByProject[pid] = (seqByProject[pid] || 0) + 1;

        const steps = {
          accept: fmsStep(assigned, t.accepted_at, true),
          submit: fmsStep(t.target_date, sentAt, true),
          verify: {
            // Planned = day it was sent to the verifier. Actual = verify / correction / updation.
            ...fmsStep(sentAt, decidedAt || startVerifyAt, !!sentAt),
            actor: t.verifier?.full_name || null,
          },
        };

        return {
          id: t.id,
          job_no: `${fmsJobCode(t.project?.name)}-${String(seqByProject[pid]).padStart(2, '0')}`,
          timestamp: assigned,
          project: t.project?.name || 'No project',
          project_id: t.project?.id || null,
          work_type: t.task_type?.name || '—',
          department: t.department?.name || '—',
          description: t.description || '',
          person: t.assigned_to_user?.full_name || 'Unassigned',
          person_id: t.assigned_to_user?.id || null,
          assigned_by: t.assigned_by_user?.full_name || '—',
          verifier: t.verifier?.full_name || '—',
          lead_time_hrs: Number(t.hours_to_complete || 0),
          extra_hours: Number(t.extra_hours || 0),
          extra_days: Number(t.extra_days || 0),
          target_date: t.target_date,
          status: t.status,
          verification_status: t.verification_status,
          steps,
        };
      });

    const stepSummary = {};
    for (const step of FMS_STEPS) {
      const all = rows.map((r) => r.steps[step.key]).filter((s) => s.status !== 'NA');
      stepSummary[step.key] = {
        label: step.label,
        total: all.length,
        done: all.filter((s) => s.status === 'Done').length,
        delayed: all.filter((s) => s.status === 'Delayed').length,
        overdue: all.filter((s) => s.status === 'Overdue').length,
        pending: all.filter((s) => s.status === 'Pending').length,
      };
    }

    res.json({
      range: range || 'month',
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      steps: FMS_STEPS,
      rows,
      summary: stepSummary,
    });
  } catch (err) {
    console.error('FMS error:', err.message);
    res.status(500).json({ error: err.message || 'Could not build FMS tracker' });
  }
});

// ----------------------------- mark as ticket raised (auto-called when ticket is raised) -----------------------------
router.patch('/:id/ticket-raised', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'Ticket Raised' })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Ticket raised status error:', err.message);
    res.status(500).json({ error: 'Could not update task status' });
  }
});

module.exports = router;
