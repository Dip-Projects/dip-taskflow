const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendWhatsAppTemplate } = require('../lib/whatsapp');

const router = express.Router();
router.use(requireAuth);

const LEAVE_SELECT = `
  id, from_date, to_date, is_half_day, reason, status,
  decision_note, created_at, decided_at,
  buddy_id, buddy_status, buddy_responded_at, buddy_note,
  user:users!leaves_user_id_fkey ( id, full_name ),
  decided_by_user:users!leaves_decided_by_fkey ( id, full_name ),
  buddy:users!leaves_buddy_id_fkey ( id, full_name )
`;

async function notifyLeaveStakeholders({ applicantName, from_date, to_date, reason, applicantId }) {
  const numbers = new Set();

  const { data: chirag } = await supabase
    .from('users')
    .select('whatsapp_number')
    .eq('username', 'chirag.s')
    .maybeSingle();
  if (chirag?.whatsapp_number) numbers.add(chirag.whatsapp_number);

  const { data: applicant } = await supabase
    .from('users')
    .select('reporting_head_id')
    .eq('id', applicantId)
    .maybeSingle();

  if (applicant?.reporting_head_id) {
    const { data: head } = await supabase
      .from('users')
      .select('whatsapp_number')
      .eq('id', applicant.reporting_head_id)
      .maybeSingle();
    if (head?.whatsapp_number) numbers.add(head.whatsapp_number);
  }

  for (const num of numbers) {
    sendWhatsAppTemplate(num, 'leave_application_notification', [
      applicantName,
      from_date,
      to_date,
      reason,
    ]).catch(() => {});
  }
}

async function transferTasksToBuddy(leave) {
  if (!leave?.buddy_id || leave.buddy_status !== 'Accepted') {
    return { transferred: 0 };
  }
  const fromDay = String(leave.from_date).slice(0, 10);
  const toDay = String(leave.to_date).slice(0, 10);
  // Open tasks due in the leave window → reassign to buddy
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, assigned_to, target_date, status')
    .eq('assigned_to', leave.user_id)
    .in('status', ['Pending', 'In Progress'])
    .gte('target_date', `${fromDay}T00:00:00.000Z`)
    .lte('target_date', `${toDay}T23:59:59.999Z`);

  if (error) throw error;
  if (!tasks?.length) return { transferred: 0 };

  let transferred = 0;
  for (const t of tasks) {
    const { error: upErr } = await supabase
      .from('tasks')
      .update({
        assigned_to: leave.buddy_id,
        leave_cover_id: leave.id,
        leave_cover_from: leave.user_id,
      })
      .eq('id', t.id)
      .eq('assigned_to', leave.user_id);
    if (!upErr) transferred += 1;
  }
  return { transferred };
}

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

    const { data: buddyUser, error: buddyErr } = await supabase
      .from('users')
      .select('id, full_name, whatsapp_number, is_active, role')
      .eq('id', buddy_id)
      .maybeSingle();
    if (buddyErr) throw buddyErr;
    if (!buddyUser || buddyUser.is_active === false) {
      return res.status(400).json({ error: 'Selected buddy is not available' });
    }
    if ((buddyUser.role || '').toLowerCase() === 'client') {
      return res.status(400).json({ error: 'Client users cannot be leave buddies' });
    }

    const { data, error } = await supabase
      .from('leaves')
      .insert({
        user_id: req.user.id,
        from_date,
        to_date,
        is_half_day: !!is_half_day,
        reason: reason.trim(),
        status: 'Pending',
        buddy_id,
        buddy_status: 'Pending',
      })
      .select(LEAVE_SELECT)
      .single();

    if (error) throw error;

    await notifyLeaveStakeholders({
      applicantName: req.user.full_name,
      from_date,
      to_date,
      reason: reason.trim(),
      applicantId: req.user.id,
    });

    if (buddyUser.whatsapp_number) {
      sendWhatsAppTemplate(buddyUser.whatsapp_number, 'leave_buddy_request', [
        buddyUser.full_name,
        req.user.full_name,
        from_date,
        to_date,
        reason.trim(),
      ]).catch(() => {});
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Apply leave error:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit leave request' });
  }
});

// ----------------------------- my leave requests -----------------------------
router.get('/my', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leaves')
      .select(LEAVE_SELECT)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List my leaves error:', err.message);
    res.status(500).json({ error: 'Could not load your leave requests' });
  }
});

// ----------------------------- buddy requests for me -----------------------------
router.get('/buddy-requests', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leaves')
      .select(LEAVE_SELECT)
      .eq('buddy_id', req.user.id)
      .eq('buddy_status', 'Pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Buddy requests error:', err.message);
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
    if (fetchErr) throw fetchErr;
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

    // If leave already approved and buddy just accepted → transfer now
    if (accept && existing.status === 'Approved') {
      await transferTasksToBuddy({ ...existing, buddy_id: req.user.id, buddy_status: 'Accepted' });
    }

    const { data: applicant } = await supabase
      .from('users')
      .select('whatsapp_number, full_name')
      .eq('id', existing.user_id)
      .maybeSingle();
    if (applicant?.whatsapp_number) {
      sendWhatsAppTemplate(applicant.whatsapp_number, 'leave_buddy_response', [
        applicant.full_name,
        req.user.full_name,
        accept ? 'accepted' : 'declined',
        existing.from_date,
        existing.to_date,
      ]).catch(() => {});
    }

    res.json(data);
  } catch (err) {
    console.error('Buddy respond error:', err.message);
    res.status(500).json({ error: err.message || 'Could not save buddy response' });
  }
});

// ----------------------------- all leave requests (admin) -----------------------------
router.get('/all', requireAdmin, async (req, res) => {
  try {
    let query = supabase.from('leaves').select(LEAVE_SELECT).order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);

    const { data, error } = await query;
    if (error) throw error;
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
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been decided' });
    }
    if (existing.buddy_id && existing.buddy_status === 'Pending') {
      return res.status(400).json({
        error: 'Buddy has not responded yet. Wait for Yes/No before approving.',
      });
    }
    if (existing.buddy_id && existing.buddy_status === 'Declined') {
      return res.status(400).json({
        error: 'Buddy declined. Ask the employee to pick another buddy first.',
      });
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
      .select(LEAVE_SELECT)
      .single();

    if (error) throw error;

    const transfer = await transferTasksToBuddy(existing);
    res.json({ ...data, tasks_transferred: transfer.transferred });
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
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Leave request not found' });
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been decided' });
    }

    const { data, error } = await supabase
      .from('leaves')
      .update({
        status: 'Rejected',
        decided_by: req.user.id,
        decided_at: new Date().toISOString(),
        decision_note: reason && reason.trim() ? reason.trim() : null,
      })
      .eq('id', id)
      .select(LEAVE_SELECT)
      .single();

    if (error) throw error;
    res.json(data);
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
