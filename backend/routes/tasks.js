const express = require('express');
const multer = require('multer');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin, requireAdminOrMis } = require('../middleware/auth');
const { addWorkingHours, addCalendarDays } = require('../lib/workingHours');
const router = express.Router();
router.use(requireAuth);

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
    const d = new Date(newDueRaw);
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

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          department_id,
          assigned_to,
          assigned_by: req.user.id,
         // project_id,
          //these r 17th july
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
          assigned_at: new Date().toISOString()
        })
        .select(TASK_SELECT)
        .single();

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
        // Must await on Vercel — fire-and-forget is killed after the response.
        await sendWhatsAppTemplate(assigneeUser.whatsapp_number, 'task_notification_v2', [
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
   const { data: existing, error: fetchErr } = await supabase
      .from('tasks')
      .select('id, verifier_id, verification_status, verification_started_by, verification_started_at')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isChosenVerifier = existing.verifier_id === req.user.id;
    if (!isChosenVerifier && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not the verifier for this task' });
    }
    if (existing.verification_status !== 'Pending Verification') {
      return res.status(400).json({ error: 'This task is not awaiting verification' });
    }

    // Already started (by this verifier or another admin) — don't overwrite
    // who/when, just hand back the current state.
    if (existing.verification_started_at) {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).single();
      if (error) throw error;
      return res.json(data);
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        verification_started_by: req.user.id,
        verification_started_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
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

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks').select('id, assigned_to, status').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isOwnTask = existing.assigned_to === req.user.id;
    if (!isOwnTask && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only accept your own tasks' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'In Progress', accepted_at: new Date().toISOString() })
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
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

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks')
      .select('id, assigned_to')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isOwnTask = existing.assigned_to === req.user.id;
    if (!isOwnTask && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only update your own tasks' });
    }

    // const updates = { status };
    // if (status === 'Rejected') {
    //   updates.status_note = `Rejected by ${req.user.full_name}${status_note ? `: ${status_note}` : ''}`;
    //   updates.rejected_at = new Date().toISOString();
    // } else if (status === 'Pending') {
    //   updates.status_note = null;
    // }
const updates = { status };
    if (status === 'Rejected') {
      updates.status_note = `Rejected by ${req.user.full_name}${status_note ? `: ${status_note}` : ''}`;
      updates.rejected_at = new Date().toISOString();
    } else if (status === 'Pending') {
      updates.status_note = null;
    } else if (status === 'In Progress') {
      // Employee ne "Accept" dabaya. Pehli baar accept hone ka time record
      // karo — agar pehle se accepted_at set hai (dobara accept, e.g.
      // reopen -> accept cycle), usse overwrite mat karo.
      updates.accepted_at = existing.accepted_at || new Date().toISOString();
    }
    
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
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

      const { data: existing, error: fetchErr } = await supabase
        .from('tasks').select('id, assigned_to, status, reschedule_status').eq('id', id).maybeSingle();
      if (fetchErr) throw fetchErr;
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

      const { data, error } = await supabase
        .from('tasks')
        .update({
          verifier_id,
          verification_status: 'Pending Verification',
          verification_note: null,
          correction_voice_url: null,
          sent_for_verification_at: new Date().toISOString(),
          verification_attachment_urls: verification_attachment_urls.length ? verification_attachment_urls : null,
          // fresh submission into the queue — clear any previous start-verification lock
          verification_started_by: null,
          verification_started_at: null
        })
        .eq('id', id)
        .select(TASK_SELECT)
        .single();
//17th july 
      
    //   if (error) throw error;
    //   res.json(data);
    // } catch (err) {
    //   console.error('Send for verification error:', err.message);
      if (error) throw error;

      const { data: verifierUser } = await supabase
        .from('users')
        .select('whatsapp_number, full_name')
        .eq('id', verifier_id)
        .maybeSingle();

      if (verifierUser?.whatsapp_number) {
        await sendWhatsAppTemplate(verifierUser.whatsapp_number, 'task_verification_request', [
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

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks').select('id, verifier_id').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const isChosenVerifier = existing.verifier_id === req.user.id;
    if (!isChosenVerifier && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not the verifier for this task' });
    }

    const updates = approved
      ? { verification_status: 'Verified', verification_note: note || null, status: 'Completed', verified_at: new Date().toISOString() }
      : { verification_status: 'Verification Rejected', verification_note: note || null, status: 'In Progress' };

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();

    if (error) throw error;
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

      const { data: existing, error: fetchErr } = await supabase
        .from('tasks')
        .select('id, verifier_id, target_date, hours_to_complete, extra_hours, extra_days, correction_extensions')
        .eq('id', id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      const isChosenVerifier = existing.verifier_id === req.user.id;
      if (!isChosenVerifier && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You are not the verifier for this task' });
      }

      let correction_voice_url = null;
      if (req.file) {
        correction_voice_url = await uploadFile(req.file, 'correction-voices');
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
        };

      let { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select(TASK_SELECT)
        .single();
      if (error && /extra_hours|extra_days|correction_extensions|assigned_at/i.test(error.message || '')) {
        delete updates.extra_hours;
        delete updates.extra_days;
        delete updates.correction_extensions;
        const retry = await supabase.from('tasks').update(updates).eq('id', id).select(TASK_SELECT.replace(/assigned_at, extra_hours, extra_days, correction_extensions,\s*/, '')).single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
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

    const { data: existing, error: fetchErr } = await supabase
      .from('tasks')
      .select('id, verifier_id, target_date, hours_to_complete, extra_hours, extra_days, correction_extensions')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
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
    };

    let { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select(TASK_SELECT)
      .single();
    if (error && /extra_hours|extra_days|correction_extensions/i.test(error.message || '')) {
      delete updates.extra_hours;
      delete updates.extra_days;
      delete updates.correction_extensions;
      const retry = await supabase.from('tasks').update(updates).eq('id', id).select(TASK_SELECT).single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
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
      await sendWhatsAppTemplate(chirag.whatsapp_number, 'task_reschedule', [
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
        await sendWhatsAppTemplate(chirag.whatsapp_number, 'task_reschedule', [
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
