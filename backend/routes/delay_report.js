const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdminOrMis } = require('../middleware/auth');
const { sendWhatsAppTemplate } = require('../lib/whatsapp');
const { buildSrMap } = require('../lib/workVerificationDashboard');
const {
  buildDelayReportRows,
  delayReportHtml,
  delayReportTextSummary,
} = require('../lib/delayReport');

const router = express.Router();

function parseRange(range, from, to) {
  const now = new Date();
  let startDate;
  let endDate;
  if (range === 'day') {
    startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
  } else if (range === 'week') {
    const day = now.getDay();
    startDate = new Date(now); startDate.setDate(now.getDate() - day); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59, 999);
  } else if (range === 'last-week') {
    const day = now.getDay();
    endDate = new Date(now); endDate.setDate(now.getDate() - day - 1); endDate.setHours(23, 59, 59, 999);
    startDate = new Date(endDate); startDate.setDate(endDate.getDate() - 6); startDate.setHours(0, 0, 0, 0);
  } else if (range === 'last-month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (range === 'all') {
    startDate = new Date(2000, 0, 1);
    endDate = new Date(now.getFullYear() + 1, 0, 1);
  } else if (range === 'custom' && from && to) {
    startDate = new Date(from); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(to); endDate.setHours(23, 59, 59, 999);
  } else {
    // default month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { startDate, endDate };
}

const DELAY_TASK_SELECT = `
  id, description, status, hours_to_complete, original_hours_to_complete,
  created_at, assigned_at, accepted_at, first_accepted_at, sent_for_verification_at,
  verification_status, assigned_to,
  is_on_hold, hold_remaining_hours, held_at, task_events,
  project:projects ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name, whatsapp_number, reporting_head_id, department, role, is_active )
`;

const DELAY_TASK_SELECT_FALLBACK = `
  id, description, status, hours_to_complete,
  created_at, assigned_at, accepted_at, sent_for_verification_at,
  verification_status, assigned_to,
  project:projects ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name, whatsapp_number, reporting_head_id, department, role, is_active )
`;

async function loadTasksForDelayReport({ startDate, endDate, employeeId }) {
  let q = supabase
    .from('tasks')
    .select(DELAY_TASK_SELECT)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (employeeId) q = q.eq('assigned_to', employeeId);

  let { data, error } = await q;
  if (error && /column|schema cache|original_hours|task_events|is_on_hold|first_accepted/i.test(error.message || '')) {
    let q2 = supabase
      .from('tasks')
      .select(DELAY_TASK_SELECT_FALLBACK)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (employeeId) q2 = q2.eq('assigned_to', employeeId);
    const retry = await q2;
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;

  const inRange = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= startDate && d <= endDate;
  };

  return (data || []).filter((t) => {
    const role = String(t.assigned_to_user?.role || '').toLowerCase();
    const dept = String(t.assigned_to_user?.department || '').toLowerCase();
    if (role === 'client' || dept === 'client') return false;
    return (
      inRange(t.created_at) ||
      inRange(t.assigned_at) ||
      inRange(t.accepted_at) ||
      inRange(t.sent_for_verification_at)
    );
  });
}

router.get('/', requireAuth, requireAdminOrMis, async (req, res) => {
  try {
    const { range, from, to, employee_id: employeeId } = req.query;
    const { startDate, endDate } = parseRange(range, from, to);
    const tasks = await loadTasksForDelayReport({ startDate, endDate, employeeId: employeeId || null });
    const srMap = buildSrMap(tasks);
    const rows = buildDelayReportRows(tasks, { srMap });

    const employeesMap = {};
    tasks.forEach((t) => {
      const u = t.assigned_to_user;
      if (!u?.id) return;
      employeesMap[u.id] = { id: u.id, name: u.full_name, whatsapp_number: u.whatsapp_number };
    });

    res.json({
      range: range || 'month',
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      employee_id: employeeId || null,
      rows,
      employees: Object.values(employeesMap).sort((a, b) => String(a.name).localeCompare(String(b.name))),
      summary: {
        total: rows.length,
        delayed: rows.filter((r) => r.status === 'Delayed').length,
        on_time: rows.filter((r) => r.status === 'On Time').length,
        na: rows.filter((r) => r.status === 'N/A').length,
      },
    });
  } catch (err) {
    console.error('Delay report error:', err.message);
    res.status(500).json({ error: err.message || 'Could not build delay report' });
  }
});

router.get('/employees', requireAuth, requireAdminOrMis, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, department, role, is_active, whatsapp_number, reporting_head_id')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    const list = (data || []).filter((u) => {
      const role = String(u.role || '').toLowerCase();
      const dept = String(u.department || '').toLowerCase();
      return role !== 'client' && dept !== 'client';
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load employees' });
  }
});

async function uploadDelayHtml(path, html) {
  const bucket = 'site-files';
  const bytes = Buffer.from(html, 'utf8');
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'text/html; charset=utf-8',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function notifyDelayWa(toNumber, name, summaryLine, link) {
  const preferred = process.env.WA_DELAY_REPORT_TEMPLATE || 'task_delay_report';
  const linkText = link || 'Open TaskFlow Emp Delay Report';
  let result = await sendWhatsAppTemplate(toNumber, preferred, [
    name || 'Team member',
    summaryLine,
    linkText,
  ]);
  if (!result.ok) {
    // Fallback to existing assign template (5 body params)
    result = await sendWhatsAppTemplate(toNumber, 'task_notification_v2', [
      name || 'Team member',
      `DELAY REPORT: ${summaryLine}`.slice(0, 180),
      'Task Delay Report',
      new Date().toISOString().slice(0, 10),
      linkText.slice(0, 60),
    ]);
  }
  return result;
}

/**
 * Monday morning: each employee gets own report; each head gets combined team report.
 */
async function runMondayDelayWhatsApp() {
  const { startDate, endDate } = parseRange('last-week');
  const day = new Date().toISOString().slice(0, 10);
  const tasks = await loadTasksForDelayReport({ startDate, endDate, employeeId: null });
  const srMap = buildSrMap(tasks);
  const allRows = buildDelayReportRows(tasks, { srMap });

  const byEmp = {};
  allRows.forEach((r) => {
    if (!r.employee_id) return;
    if (!byEmp[r.employee_id]) byEmp[r.employee_id] = [];
    byEmp[r.employee_id].push(r);
  });

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, reporting_head_id, is_active, role, department')
    .eq('is_active', true);

  const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
  let empSent = 0;
  let headSent = 0;
  const links = [];

  for (const [empId, rows] of Object.entries(byEmp)) {
    const u = userMap[empId];
    if (!u?.whatsapp_number) continue;
    const html = delayReportHtml(rows, {
      title: 'Task Delay Report',
      subtitle: `${u.full_name} · ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`,
      showEmployee: false,
    });
    const path = `delay-reports/${day}/emp-${empId}.html`;
    let url = null;
    try {
      url = await uploadDelayHtml(path, html);
    } catch (err) {
      console.warn('Delay report upload failed:', err.message);
    }
    const delayed = rows.filter((r) => r.status === 'Delayed').length;
    const summary = `${rows.length} tasks · ${delayed} delayed (last week)`;
    const result = await notifyDelayWa(u.whatsapp_number, u.full_name, summary, url || '');
    if (result.ok) empSent += 1;
    links.push({ type: 'employee', id: empId, name: u.full_name, url, ok: result.ok });
  }

  // Heads: combine all direct reports' rows
  const headIds = [...new Set(
    (users || []).map((u) => u.reporting_head_id).filter(Boolean)
  )];
  for (const headId of headIds) {
    const head = userMap[headId];
    if (!head?.whatsapp_number) continue;
    const teamIds = (users || [])
      .filter((u) => String(u.reporting_head_id) === String(headId))
      .map((u) => u.id);
    const teamRows = allRows.filter((r) => teamIds.includes(r.employee_id));
    if (!teamRows.length) continue;

    const html = delayReportHtml(teamRows, {
      title: 'Task Delay Report',
      subtitle: `Team of ${head.full_name} · ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`,
      showEmployee: true,
    });
    const path = `delay-reports/${day}/head-${headId}.html`;
    let url = null;
    try {
      url = await uploadDelayHtml(path, html);
    } catch (err) {
      console.warn('Head delay report upload failed:', err.message);
    }
    const delayed = teamRows.filter((r) => r.status === 'Delayed').length;
    const summary = `Team report · ${teamRows.length} tasks · ${delayed} delayed`;
    const result = await notifyDelayWa(head.whatsapp_number, head.full_name, summary, url || '');
    if (result.ok) headSent += 1;
    links.push({ type: 'head', id: headId, name: head.full_name, url, ok: result.ok });
  }

  return {
    day,
    from: startDate.toISOString(),
    to: endDate.toISOString(),
    employees_messaged: empSent,
    heads_messaged: headSent,
    rows: allRows.length,
    links,
    preview_text_sample: delayReportTextSummary(allRows.slice(0, 5), 'All'),
  };
}

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const hdr = req.headers['authorization'] || '';
  return (
    (secret && hdr === `Bearer ${secret}`) ||
    (secret && req.query.secret === secret) ||
    (!secret && process.env.VERCEL !== '1') ||
    // allow admin JWT trigger
    (req.user && (req.user.role === 'admin' || req.user.is_mis_executive))
  );
}

async function handleMondayCron(req, res) {
  try {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized cron' });
    const result = await runMondayDelayWhatsApp();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Monday delay WA cron:', err.message);
    res.status(500).json({ error: err.message });
  }
}

router.post('/cron/monday-whatsapp', handleMondayCron);
router.get('/cron/monday-whatsapp', handleMondayCron);

// Manual admin trigger (auth required)
router.post('/send-monday-now', requireAuth, requireAdminOrMis, async (req, res) => {
  try {
    const result = await runMondayDelayWhatsApp();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runMondayDelayWhatsApp = runMondayDelayWhatsApp;
