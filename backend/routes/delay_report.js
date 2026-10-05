const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdminOrMis } = require('../middleware/auth');
const { sendWhatsAppTemplate } = require('../lib/whatsapp');
const { buildReportPdf } = require('../lib/reportPdf');
const { buildSrMap } = require('../lib/workVerificationDashboard');
const {
  buildDelayReportRows,
  buildEmpReportRows,
  delayReportHtml,
  empReportHtml,
  delayReportTextSummary,
} = require('../lib/delayReport');
const { isMdoOfficeWorkTask } = require('../lib/mdoOfficeWork');

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
  verification_started_at, first_verification_started_at, verified_at, first_verified_at,
  verification_status, assigned_to,
  is_on_hold, hold_remaining_hours, held_at, resumed_at, task_events,
  total_hold_seconds, last_hold_seconds, hold_count,
  target_date, original_target_date, reschedule_approved_target_date,
  reschedule_status, reschedule_count, reaccept_required,
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  department:departments ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name, whatsapp_number, reporting_head_id, department, role, is_active )
`;

// Same minus the plan-separation columns, for databases still on the older schema.
const DELAY_TASK_SELECT_PRE_PLAN = `
  id, description, status, hours_to_complete, original_hours_to_complete,
  created_at, assigned_at, accepted_at, first_accepted_at, sent_for_verification_at,
  verification_started_at, verified_at,
  verification_status, assigned_to,
  is_on_hold, hold_remaining_hours, held_at, resumed_at, task_events,
  target_date, reschedule_status,
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  department:departments ( id, name ),
  assigned_to_user:users!tasks_assigned_to_fkey ( id, full_name, whatsapp_number, reporting_head_id, department, role, is_active )
`;

const DELAY_TASK_SELECT_FALLBACK = `
  id, description, status, hours_to_complete,
  created_at, assigned_at, accepted_at, sent_for_verification_at,
  verification_started_at, verified_at,
  verification_status, assigned_to,
  project:projects ( id, name ),
  task_type:task_types ( id, name ),
  department:departments ( id, name ),
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

  // Step down one schema tier at a time so a missing migration costs a few
  // columns rather than the whole report.
  const schemaMiss = (e) =>
    e && /column|schema cache|original_hours|task_events|is_on_hold|first_accepted/i.test(e.message || '');

  for (const fallback of [DELAY_TASK_SELECT_PRE_PLAN, DELAY_TASK_SELECT_FALLBACK]) {
    if (!schemaMiss(error)) break;
    let retryQ = supabase
      .from('tasks')
      .select(fallback)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (employeeId) retryQ = retryQ.eq('assigned_to', employeeId);
    const retry = await retryQ;
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
    if (isMdoOfficeWorkTask(t)) return false;
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

/**
 * Emp Report — same work columns as delay sheet + Status + Early/Delay (Xd Xh Xm).
 * Filters: employee_id, from + to (date range). Defaults to current month if dates missing.
 */
router.get('/emp', requireAuth, requireAdminOrMis, async (req, res) => {
  try {
    const { from, to, employee_id: employeeId } = req.query;
    const range = from && to ? 'custom' : 'month';
    const { startDate, endDate } = parseRange(range, from, to);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid from/to date' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'From date must be on or before To date' });
    }
    const tasks = await loadTasksForDelayReport({
      startDate,
      endDate,
      employeeId: employeeId || null,
    });
    const srMap = buildSrMap(tasks);
    const rows = buildEmpReportRows(tasks, { srMap });
    res.json({
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      employee_id: employeeId || null,
      rows,
      summary: {
        total: rows.length,
        delayed: rows.filter((r) => r.status === 'Delayed').length,
        on_time: rows.filter((r) => r.status === 'On Time').length,
        na: rows.filter((r) => r.status === 'N/A').length,
      },
      html: empReportHtml(rows, {
        title: 'Emp Report',
        subtitle: `${String(startDate.toISOString()).slice(0, 10)} → ${String(endDate.toISOString()).slice(0, 10)}`,
        showEmployee: !employeeId,
      }),
    });
  } catch (err) {
    console.error('Emp report error:', err.message);
    res.status(500).json({ error: err.message || 'Could not build emp report' });
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
  const linkText = link || 'Open TaskFlow Task Report';
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
      'Task Report',
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
      title: 'Task Report',
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
      title: 'Task Report',
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

const AUTO_SETTINGS_KEY = 'report_wa_auto';
const SHARED_WA = '8208026194';
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

function istDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function istWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(date);
}

function isSharedWa(raw) {
  const n = String(raw || '').replace(/\D/g, '');
  return n.endsWith(SHARED_WA);
}

function periodLabel(startDate, endDate) {
  return `${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`;
}

function reportSummary(rows) {
  const list = rows || [];
  const delayed = list.filter((r) => r.status === 'Delayed').length;
  const onTime = list.filter((r) => r.status === 'On Time').length;
  return `${list.length} tasks, ${delayed} delayed, ${onTime} on time`;
}

function last15Days() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 14);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

async function loadAutoState() {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', AUTO_SETTINGS_KEY)
      .maybeSingle();
    return data?.value && typeof data.value === 'object' ? { ...data.value } : {};
  } catch (err) {
    console.warn('Report WA state load:', err.message);
    return {};
  }
}

async function saveAutoState(value) {
  const { error } = await supabase.from('app_settings').upsert({
    key: AUTO_SETTINGS_KEY,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('Report WA state save:', error.message);
}

async function uploadReportPdf(path, bytes) {
  const bucket = 'site-files';
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function loadAish() {
  const username = process.env.WA_AISH_USERNAME || 'aishwarya.v';
  const { data } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number')
    .eq('username', username)
    .maybeSingle();
  if (process.env.WA_AISH_NUMBER) {
    return {
      id: data?.id || null,
      full_name: data?.full_name || 'Aish',
      username,
      whatsapp_number: process.env.WA_AISH_NUMBER,
    };
  }
  return data;
}

/**
 * New document template when Meta has approved it.
 * Until then, the existing delay-report template carries the PDF link.
 */
async function sendReportPdfMessage({ toNumber, name, reportTitle, period, summary, pdfUrl, filename }) {
  const docTemplate = process.env.WA_EMP_REPORT_TEMPLATE || 'emp_report_pdf';
  const language = process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  const body = [name || 'Team', reportTitle, period, summary];
  if (pdfUrl) {
    const attached = await sendWhatsAppTemplate(toNumber, docTemplate, body, {
      document: { link: pdfUrl, filename },
      language,
    });
    if (attached.ok) return attached;
    const headerRejected = /132018|no parameters allowed|title component/i.test(
      `${attached.error || ''} ${attached.reason || ''}`
    );
    if (headerRejected) {
      const withLink = await sendWhatsAppTemplate(
        toNumber,
        docTemplate,
        [name || 'Team', reportTitle, period, `Download the PDF: ${pdfUrl}`],
        { language }
      );
      if (withLink.ok) return withLink;
      console.warn('emp_report_pdf body failed:', withLink.error || withLink.reason || 'failed');
    } else {
      console.warn('emp_report_pdf not sent:', attached.error || attached.reason || 'failed');
    }
  }
  const linkTemplate = process.env.WA_DELAY_REPORT_TEMPLATE || 'task_delay_report';
  const linked = await sendWhatsAppTemplate(toNumber, linkTemplate, [
    name || 'Team',
    `${reportTitle}: ${summary}`.slice(0, 180),
    pdfUrl || 'Open TaskFlow',
  ]);
  if (linked.ok) return linked;
  return sendWhatsAppTemplate(toNumber, 'task_notification_v2', [
    name || 'Team',
    `${reportTitle}: ${summary}`.slice(0, 180),
    reportTitle.slice(0, 60),
    period.slice(0, 60),
    'Ready',
  ]);
}

function empSheet(rows, showEmployee) {
  const head = ['SR'];
  if (showEmployee) head.push('Employee');
  head.push(
    'Project', 'Task description', 'Timestamp (Assigned)', 'Emp Acceptance Time',
    'Hrs to Complete', 'Hold / Resume', 'Total Hold', 'Due', 'Submitted', 'Status', 'Early / Delay'
  );
  const body = (rows || []).map((r) => {
    const project = r.reschedule_count > 0
      ? `${r.project} (rescheduled ${r.reschedule_count}x)`
      : r.project;
    const row = [r.sr ?? ''];
    if (showEmployee) row.push(r.employee);
    row.push(
      project, r.description, r.assigned_label, r.accepted_label, r.hours_label,
      r.hold_resume_label, r.total_hold_label, r.deadline_label, r.submitted_label,
      r.status, r.timing_label
    );
    return row;
  });
  return { head, body };
}

function delaySheet(rows, showEmployee) {
  const head = ['SR'];
  if (showEmployee) head.push('Employee');
  head.push(
    'Project', 'Task description', 'Timestamp (Assigned)', 'Emp Acceptance Time',
    'Hrs to Complete', 'Hold / Resume', 'Total Hold', 'Due', 'Sent for verification',
    'Work status', 'Work delay', 'Start Verification', 'Verified', 'Verify status', 'Verify delay'
  );
  const body = (rows || []).map((r) => {
    const project = r.reschedule_count > 0
      ? `${r.project} (rescheduled ${r.reschedule_count}x)`
      : r.project;
    const row = [r.sr ?? ''];
    if (showEmployee) row.push(r.employee);
    row.push(
      project, r.description, r.assigned_label, r.accepted_label, r.hours_label,
      r.hold_resume_label, r.total_hold_label, r.deadline_label, r.submitted_label,
      r.status, r.delay_label, r.verify_started_label, r.verified_label,
      r.verify_status, r.verify_delay_label
    );
    return row;
  });
  return { head, body };
}

async function buildAndUploadPdf({ title, subtitle, headers, rows, path }) {
  const bytes = await buildReportPdf({ title, subtitle, headers, rows });
  const url = await uploadReportPdf(path, bytes);
  return url;
}

/** Monday: full Emp Report to Aish, and each employee their own rows. */
async function runMondayEmpReports(opts = {}) {
  const { startDate, endDate } = parseRange('last-week');
  const day = istDateKey();
  const period = periodLabel(startDate, endDate);
  const tasks = await loadTasksForDelayReport({ startDate, endDate, employeeId: null });
  const rows = buildEmpReportRows(tasks, { srMap: buildSrMap(tasks) });
  const aish = await loadAish();
  const sent = [];

  if (aish?.whatsapp_number) {
    const sheet = empSheet(rows, true);
    const filename = `Emp-Report-${day}.pdf`;
    let pdfUrl = null;
    try {
      pdfUrl = await buildAndUploadPdf({
        title: 'Emp Report',
        subtitle: period,
        headers: sheet.head,
        rows: sheet.body,
        path: `delay-reports/${day}/emp-report-all.pdf`,
      });
    } catch (err) {
      console.warn('Emp report PDF upload:', err.message);
    }
    const result = await sendReportPdfMessage({
      toNumber: aish.whatsapp_number,
      name: aish.full_name || 'Aish',
      reportTitle: 'Emp Report',
      period,
      summary: reportSummary(rows),
      pdfUrl,
      filename,
    });
    sent.push({ who: 'aish', name: aish.full_name, ok: !!result.ok, pdf: !!pdfUrl, template: result.templateName || '' });
  } else {
    sent.push({ who: 'aish', ok: false, reason: 'no_number' });
  }

  let personal = 0;
  let skippedShared = 0;
  if (!opts.aishOnly) {
  const byEmp = {};
  rows.forEach((r) => {
    if (!r.employee_id) return;
    if (!byEmp[r.employee_id]) byEmp[r.employee_id] = [];
    byEmp[r.employee_id].push(r);
  });
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, is_active')
    .eq('is_active', true);
  for (const [empId, empRows] of Object.entries(byEmp)) {
    const u = (users || []).find((x) => String(x.id) === String(empId));
    if (!u?.whatsapp_number) continue;
    if (isSharedWa(u.whatsapp_number)) {
      skippedShared += 1;
      continue;
    }
    const sheet = empSheet(empRows, false);
    const safeName = String(u.full_name || 'employee').replace(/[^\w.\-]+/g, '-').slice(0, 40);
    const filename = `Emp-Report-${safeName}.pdf`;
    let pdfUrl = null;
    try {
      pdfUrl = await buildAndUploadPdf({
        title: 'Emp Report',
        subtitle: `${u.full_name} · ${period}`,
        headers: sheet.head,
        rows: sheet.body,
        path: `delay-reports/${day}/emp-report-${empId}.pdf`,
      });
    } catch (err) {
      console.warn('Emp personal PDF upload:', err.message);
    }
    const result = await sendReportPdfMessage({
      toNumber: u.whatsapp_number,
      name: u.full_name,
      reportTitle: 'Emp Report',
      period,
      summary: reportSummary(empRows),
      pdfUrl,
      filename,
    });
    if (result.ok) personal += 1;
    sent.push({ who: 'employee', name: u.full_name, ok: !!result.ok });
  }
  }

  return {
    period,
    rows: rows.length,
    aish_sent: sent.some((s) => s.who === 'aish' && s.ok),
    employees_messaged: personal,
    skipped_shared_number: skippedShared,
    sent,
  };
}

/** Every 15 days: full Emp Delay Report to Aish only. */
async function runAishDelayReport() {
  const { startDate, endDate } = last15Days();
  const day = istDateKey();
  const period = periodLabel(startDate, endDate);
  const tasks = await loadTasksForDelayReport({ startDate, endDate, employeeId: null });
  const rows = buildDelayReportRows(tasks, { srMap: buildSrMap(tasks) });
  const aish = await loadAish();
  if (!aish?.whatsapp_number) return { ok: false, reason: 'no_number', period };
  const sheet = delaySheet(rows, true);
  const filename = `Emp-Delay-Report-${day}.pdf`;
  let pdfUrl = null;
  try {
    pdfUrl = await buildAndUploadPdf({
      title: 'Emp Delay Report',
      subtitle: period,
      headers: sheet.head,
      rows: sheet.body,
      path: `delay-reports/${day}/emp-delay-report-all.pdf`,
    });
  } catch (err) {
    console.warn('Delay report PDF upload:', err.message);
  }
  const result = await sendReportPdfMessage({
    toNumber: aish.whatsapp_number,
    name: aish.full_name || 'Aish',
    reportTitle: 'Emp Delay Report',
    period,
    summary: reportSummary(rows),
    pdfUrl,
    filename,
  });
  return {
    ok: !!result.ok,
    period,
    rows: rows.length,
    pdf: !!pdfUrl,
    name: aish.full_name,
  };
}

async function handleAutoReports(req, res) {
  try {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized cron' });
    const istDay = istDateKey();
    const weekday = istWeekday();
    const state = await loadAutoState();
    const out = { ist_day: istDay, weekday };

    if (weekday === 'Mon' && state.emp_report_on !== istDay) {
      out.emp_report = await runMondayEmpReports();
      if (out.emp_report.aish_sent) state.emp_report_on = istDay;
    } else {
      out.emp_report = {
        skipped: true,
        reason: weekday === 'Mon' ? 'already_sent' : 'not_monday',
      };
    }

    const lastDelay = state.delay_report_on ? new Date(state.delay_report_on) : null;
    const delayDue = !lastDelay || Number.isNaN(lastDelay.getTime())
      || (Date.now() - lastDelay.getTime()) >= FIFTEEN_DAYS_MS;
    if (delayDue) {
      out.delay_report = await runAishDelayReport();
      if (out.delay_report.ok) state.delay_report_on = new Date().toISOString();
    } else {
      out.delay_report = {
        skipped: true,
        last_sent: state.delay_report_on,
      };
    }

    await saveAutoState(state);
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('Auto report WA:', err.message);
    res.status(500).json({ error: err.message });
  }
}

router.post('/cron/auto-reports', handleAutoReports);
router.get('/cron/auto-reports', handleAutoReports);

module.exports = router;
module.exports.runMondayDelayWhatsApp = runMondayDelayWhatsApp;
module.exports.runMondayEmpReports = runMondayEmpReports;
module.exports.runAishDelayReport = runAishDelayReport;
