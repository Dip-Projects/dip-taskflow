const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');
const {
  sendWhatsAppText,
  sendWhatsAppInteractiveList,
  sendWhatsAppTemplate,
  normalizeWhatsAppNumber,
} = require('../lib/whatsapp');
const {
  loadOpenTasksForUser,
  sendOpenTasksListPicker,
  istYmd,
  isAdminUser,
  userCanViewAllEaUploads,
  findBeenaOrPcUsers,
} = require('../lib/taskListDigest');

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

/** Own EA rows only (uploader). */
async function loadOwnEaRows(user) {
  const names = usernamesFor(user);
  const uid = user?.id != null ? String(user.id) : null;

  if (uid) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .eq('employee_id', uid)
      .order('meeting_week_start', { ascending: false })
      .limit(40);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
        return [];
      }
      throw error;
    }
    if (data?.length) return data;
  }

  if (names.length) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .in('employee_username', names)
      .order('meeting_week_start', { ascending: false })
      .limit(40);
    if (error) {
      if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
        return [];
      }
      throw error;
    }
    if (data?.length) return data;
  }

  const displayName = String(user.full_name || user.name || '').trim();
  if (displayName) {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('*')
      .ilike('employee_name', displayName)
      .order('meeting_week_start', { ascending: false })
      .limit(40);
    if (!error && data?.length) return data;
  }

  return [];
}

/** Beena / PC: all recent EA uploads (not admin). */
async function loadAllEaRows() {
  const { data, error } = await supabase
    .from('ea_meeting_attendance')
    .select('*')
    .order('meeting_week_start', { ascending: false })
    .limit(80);
  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return [];
    }
    throw error;
  }
  return data || [];
}

/**
 * Visibility:
 * - Admin → nothing
 * - Beena / Process Controller → all EA uploads
 * - Everyone else → only own uploads
 */
async function loadEaRowsForViewer(user) {
  if (isAdminUser(user)) return { rows: [], viewer: 'admin_hidden' };
  if (userCanViewAllEaUploads(user)) {
    return { rows: await loadAllEaRows(), viewer: 'beena_pc' };
  }
  return { rows: await loadOwnEaRows(user), viewer: 'uploader' };
}

function mapEaItem(r, { forBeena }) {
  const uploaded = !!r.plan_submitted_at;
  const who = r.employee_name || r.employee_username || 'Employee';
  const base = uploaded
    ? `EA plan submitted (${r.meeting_week_start})`
    : `EA meeting — upload weekly plan (${r.meeting_week_start})`;
  return {
    id: `ea:${r.id}`,
    source: 'ea_meeting',
    ea_id: r.id,
    description: forBeena ? `${who}: ${base}` : base,
    employee_name: r.employee_name,
    employee_username: r.employee_username,
    employee_id: r.employee_id,
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
}

/** Portal My Tasks — uploader own rows; Beena sees all; admin none. */
router.get('/my', async (req, res) => {
  try {
    const { rows, viewer } = await loadEaRowsForViewer(req.user);
    const forBeena = viewer === 'beena_pc';
    const items = rows.map((r) => mapEaItem(r, { forBeena }));
    res.json({
      items,
      table: 'ea_meeting_attendance',
      viewer,
      note:
        viewer === 'admin_hidden'
          ? 'EA uploads are not shown to admin. Beena (PC) + uploader only.'
          : viewer === 'beena_pc'
            ? 'Process Controller view: all EA meeting uploads (uploader + Beena only).'
            : 'Your EA uploads only. Beena (PC) can also see them.',
    });
  } catch (err) {
    console.error('EA my list:', err.message);
    res.status(500).json({ error: err.message || 'Could not load EA attendance' });
  }
});

async function notifyUploaderWhatsApp(user, opts = {}) {
  const { data: full } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number')
    .eq('id', user.id)
    .maybeSingle();

  const wa = full?.whatsapp_number;
  const fullName = full?.full_name || full?.username || user.full_name || 'Team member';
  const lookupUser = {
    id: user.id,
    username: full?.username || user.username,
    user_name: user.user_name || full?.username,
    full_name: full?.full_name || user.full_name,
    name: full?.full_name || user.full_name,
  };
  const eaRows = await loadOwnEaRows(lookupUser);
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
      `✅ EA meeting weekly plan uploaded.\nWeek: ${opts.weekStart || '—'}\nSite → My Tasks (Done).\nBeena (PC) can also see this upload.`
    );
    await sendOpenTasksListPicker(wa, full?.id || user.id, { fullName });
    return { ok: true, kind: 'uploaded', eaRows: eaRows.length, who: fullName };
  }

  const userId = full?.id || user.id;
  const today = istYmd();
  const openTasks = await loadOpenTasksForUser(userId, { dayYmd: today });
  const rows = [];

  pendingEa.slice(0, 3).forEach((r) => {
    rows.push({
      id: `tf_ea_${r.id}`,
      title: clip('EA: upload plan', 24),
      description: clip(`Week ${r.meeting_week_start} · Site → QR`, 72),
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
      `✅ EA meeting present marked.\nNo pending uploads or tasks.\nSite → My Tasks.`
    );
    return { ok: true, kind: 'present_empty', who: fullName };
  }

  const body = clip(
    `Hi ${fullName},\nEA meeting present ✅\nPending: ${pendingEa.length} EA upload(s), ${openTasks.length} task(s).\nTap Select (or Site → My Tasks / QR).`,
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

  return {
    ok: true,
    kind: 'present',
    listOk: listResult.ok,
    pendingEa: pendingEa.length,
    tasks: openTasks.length,
    who: fullName,
  };
}

/** Also notify Beena (PC) — never admin. */
async function notifyBeenaAboutEa(uploaderUser, opts = {}) {
  const beenas = await findBeenaOrPcUsers();
  const uploaderName =
    uploaderUser.full_name || uploaderUser.username || 'Team member';
  const results = [];

  for (const b of beenas) {
    // Don't double-send if uploader IS Beena
    if (b.id === uploaderUser.id) {
      results.push({ username: b.username, skipped: 'self' });
      continue;
    }
    const wa = b.whatsapp_number;
    if (!normalizeWhatsAppNumber(wa)) {
      results.push({ username: b.username, ok: false, reason: 'no_whatsapp' });
      continue;
    }

    if (opts.kind === 'uploaded') {
      const fileHint = opts.fileName ? `\nFile: ${opts.fileName}` : '';
      await sendWhatsAppText(
        wa,
        `📋 EA upload by ${uploaderName}\nWeek: ${opts.weekStart || '—'}${fileHint}\nSite → My Tasks (you can see all EA uploads).\nAdmin ko nahi dikhta.`
      );
      // Beena's own day task list (assigned to her)
      await sendOpenTasksListPicker(wa, b.id, {
        fullName: b.full_name || b.username,
        dayYmd: istYmd(),
      });
      results.push({ username: b.username, ok: true, kind: 'uploaded' });
      continue;
    }

    // present
    await sendWhatsAppText(
      wa,
      `✅ EA present: ${uploaderName}\nWeek: ${opts.weekStart || '—'}\nPending weekly plan upload may follow.\nSite → My Tasks → Monday (all EA uploads).`
    );
    results.push({ username: b.username, ok: true, kind: 'present' });
  }

  return results;
}

async function notifyUserEaAndTasks(user, opts = {}) {
  const uploader = await notifyUploaderWhatsApp(user, opts);
  const beena = await notifyBeenaAboutEa(user, opts);
  return { ...uploader, beenaNotify: beena };
}

router.post('/notify', async (req, res) => {
  try {
    // Admin should not trigger EA personal notify as "viewer" — still ok if they scan by mistake
    const kind = req.body?.kind || 'present';
    const result = await notifyUserEaAndTasks(req.user, {
      kind,
      weekStart: req.body?.weekStart,
      fileName: req.body?.fileName,
    });
    res.json(result);
  } catch (err) {
    console.error('EA notify:', err.message);
    res.status(500).json({ error: err.message || 'Notify failed' });
  }
});

module.exports = router;
