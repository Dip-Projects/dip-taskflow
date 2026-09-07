const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');
const {
  sendWhatsAppText,
  sendWhatsAppInteractiveList,
  sendWhatsAppTemplate,
  normalizeWhatsAppNumber,
} = require('../lib/whatsapp');
const { loadOpenTasksForUser, sendOpenTasksListPicker, istYmd } = require('../lib/taskListDigest');

const router = express.Router();
router.use(requireAuth);

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function usernamesFor(user) {
  return [...new Set(
    [user.username, user.user_name]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  )];
}

async function loadMyEaRows(user) {
  const names = usernamesFor(user);
  const uid = user?.id != null ? String(user.id) : null;

  // 1) Match by TaskFlow user id (most reliable)
  if (uid) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .eq('employee_id', uid)
      .order('meeting_week_start', { ascending: false })
      .limit(20);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
        return [];
      }
      throw error;
    }
    if (data?.length) return data;
  }

  // 2) Match by username(s)
  if (names.length) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .in('employee_username', names)
      .order('meeting_week_start', { ascending: false })
      .limit(20);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
        return [];
      }
      throw error;
    }
    if (data?.length) return data;
  }

  // 3) Fallback by display name (old rows with mismatched username)
  const displayName = String(user.full_name || user.name || '').trim();
  if (displayName) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .ilike('employee_name', displayName)
      .order('meeting_week_start', { ascending: false })
      .limit(20);
    if (!error && data?.length) return data;
  }

  return [];
}

/** Portal My Tasks — EA meeting items + note where data lives. */
router.get('/my', async (req, res) => {
  try {
    const rows = await loadMyEaRows(req.user);
    const items = rows.map((r) => {
      const uploaded = !!r.plan_submitted_at;
      return {
        id: `ea:${r.id}`,
        source: 'ea_meeting',
        ea_id: r.id,
        description: uploaded
          ? `EA meeting plan submitted (${r.meeting_week_start})`
          : `EA meeting — upload weekly plan (${r.meeting_week_start})`,
        status: uploaded ? 'Completed' : 'Pending',
        priority: 'High',
        target_date: r.meeting_week_end || r.meeting_week_start,
        meeting_week_start: r.meeting_week_start,
        meeting_week_end: r.meeting_week_end,
        attachment_1_url: r.attachment_1_url,
        attachment_1_name: r.attachment_1_name,
        attachment_2_url: r.attachment_2_url,
        attachment_2_name: r.attachment_2_name,
        plan_submitted_at: r.plan_submitted_at,
        project: { name: 'Monday EA Meeting' },
        upload_path: '/site/qr-scan',
      };
    });
    res.json({
      items,
      table: 'ea_meeting_attendance',
      note: 'EA meeting data is stored in ea_meeting_attendance (not clock-in, not tasks table).',
    });
  } catch (err) {
    console.error('EA my list:', err.message);
    res.status(500).json({ error: err.message || 'Could not load EA attendance' });
  }
});

async function notifyUserEaAndTasks(user, opts = {}) {
  const { data: full } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number')
    .eq('id', user.id)
    .maybeSingle();

  const wa = full?.whatsapp_number;
  const fullName = full?.full_name || full?.username || user.full_name || 'Team member';
  // Merge JWT + DB user so EA rows match even if username sources differ
  const lookupUser = {
    id: user.id,
    username: full?.username || user.username,
    user_name: user.user_name || full?.username,
    full_name: full?.full_name || user.full_name,
    name: full?.full_name || user.full_name,
  };
  const eaRows = await loadMyEaRows(lookupUser);
  const pendingEa = eaRows.filter((r) => !r.plan_submitted_at);

  if (!normalizeWhatsAppNumber(wa)) {
    return {
      ok: false,
      reason: 'no_whatsapp',
      pendingEa: pendingEa.length,
      eaRows: eaRows.length,
      hint: 'Set whatsapp_number on users table for this employee',
    };
  }

  if (opts.kind === 'uploaded') {
    await sendWhatsAppText(
      wa,
      `✅ EA meeting weekly plan uploaded.\nWeek: ${opts.weekStart || '—'}\nOpen Site Portal → My Tasks (Done tab) to see files.\nTable: ea_meeting_attendance`
    );
    // Still send open TaskFlow list if any
    await sendOpenTasksListPicker(wa, full?.id || user.id, { fullName });
    return { ok: true, kind: 'uploaded', eaRows: eaRows.length };
  }

  // After present: one list with EA upload row(s) + open TaskFlow tasks
  const userId = full?.id || user.id;
  const today = istYmd();
  const openTasks = await loadOpenTasksForUser(userId, { dayYmd: today });
  const rows = [];

  pendingEa.slice(0, 3).forEach((r) => {
    rows.push({
      id: `tf_ea_${r.id}`,
      title: clip('EA: upload plan', 24),
      description: clip(`Week ${r.meeting_week_start} · open Site → QR`, 72),
    });
  });

  if (openTasks.length) {
    rows.push({
      id: 'tf_done_all',
      title: '✅ Mark ALL tasks done',
      description: clip(`${openTasks.length} TaskFlow task(s)`, 72),
    });
  }

  openTasks.slice(0, Math.max(0, 9 - rows.length)).forEach((t, i) => {
    rows.push({
      id: `tf_done_${t.id}`,
      title: clip(`${i + 1}. ${t.description || 'Task'}`, 24),
      description: clip(`${t.project?.name || '—'} · Due ${t.target_date || '—'}`, 72),
    });
  });

  if (!rows.length) {
    await sendWhatsAppText(
      wa,
      `✅ EA meeting present marked.\nNo pending uploads or tasks.\nSite Portal → My Tasks.`
    );
    return { ok: true, kind: 'present_empty' };
  }

  const body = clip(
    `Hi ${fullName},\nEA meeting present ✅\nPending: ${pendingEa.length} EA upload(s), ${openTasks.length} task(s).\nTap Select (or open Site → My Tasks / QR scan).`,
    1024
  );

  const listResult = await sendWhatsAppInteractiveList(wa, {
    header: 'EA + My Tasks',
    body,
    footer: 'Reply LIST anytime',
    button: 'Select',
    sections: [{ title: 'Pending', rows }],
  });

  if (!listResult.ok) {
    await sendWhatsAppTemplate(wa, process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2', [
      fullName,
      clip(
        `EA present. ${pendingEa.length} EA upload pending, ${openTasks.length} tasks. Open Site My Tasks.`,
        200
      ),
      'Monday EA Meeting',
      pendingEa[0]?.meeting_week_start || new Date().toISOString().slice(0, 10),
      'High',
    ]);
  }

  return { ok: true, kind: 'present', listOk: listResult.ok, pendingEa: pendingEa.length, tasks: openTasks.length };
}

router.post('/notify', async (req, res) => {
  try {
    const kind = req.body?.kind || 'present';
    const result = await notifyUserEaAndTasks(req.user, {
      kind,
      weekStart: req.body?.weekStart,
    });
    res.json(result);
  } catch (err) {
    console.error('EA notify:', err.message);
    res.status(500).json({ error: err.message || 'Notify failed' });
  }
});

module.exports = router;
