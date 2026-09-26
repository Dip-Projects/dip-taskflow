/**
 * Weekly-plan WhatsApp day lists (from weekly_plan_tasks).
 *
 * On Excel upload: send today's tasks (sr-numbered) immediately.
 * Each later day: today's tasks + pending tasks from earlier days in the same week.
 *
 * Reply: PLAN / WP / WLIST → resend list
 * Reply: 1 or 1,3 (or PLAN 1) → mark those open items Completed
 */

const supabase = require('./supabaseClient');
const {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  normalizeWhatsAppNumber,
} = require('./whatsapp');
const { istYmd, dayLabel, isAdminUser } = require('./taskListDigest');

/** Avoid duplicate day-list WA to same user on same IST day (upload + cron). */
const sentToday = new Map(); // key: username|ymd → ts

/** Last username we messaged on a phone (shared-number disambiguation). */
const waSessionByPhone = new Map(); // normalizedPhone → { username, ts }
const WA_SESSION_SETTINGS_KEY = 'wa_weekly_plan_sessions';

function alreadySentToday(username, dayYmd) {
  const key = `${String(username || '').toLowerCase()}|${dayYmd}`;
  return sentToday.has(key);
}

function markSentToday(username, dayYmd) {
  const key = `${String(username || '').toLowerCase()}|${dayYmd}`;
  sentToday.set(key, Date.now());
  // prune old
  if (sentToday.size > 500) {
    const cutoff = Date.now() - 36 * 60 * 60 * 1000;
    for (const [k, ts] of sentToday) {
      if (ts < cutoff) sentToday.delete(k);
    }
  }
}

function rememberWhatsAppSession(toNumber, username) {
  const phone = normalizeWhatsAppNumber(toNumber);
  const u = String(username || '').trim();
  if (!phone || !u) return;
  const entry = { username: u, ts: Date.now() };
  waSessionByPhone.set(phone, entry);
  if (waSessionByPhone.size > 2000) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [k, v] of waSessionByPhone) {
      if (!v?.ts || v.ts < cutoff) waSessionByPhone.delete(k);
    }
  }
  // Durable across Vercel cold starts (best-effort).
  Promise.resolve()
    .then(async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', WA_SESSION_SETTINGS_KEY)
        .maybeSingle();
      const map =
        data?.value && typeof data.value === 'object' && !Array.isArray(data.value)
          ? { ...data.value }
          : {};
      map[phone] = entry;
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const [k, v] of Object.entries(map)) {
        if (!v?.ts || v.ts < cutoff) delete map[k];
      }
      await supabase.from('app_settings').upsert({
        key: WA_SESSION_SETTINGS_KEY,
        value: map,
        updated_at: new Date().toISOString(),
      });
    })
    .catch((err) => console.warn('WA session persist:', err.message));
}

function peekWhatsAppSession(fromNumber) {
  const phone = normalizeWhatsAppNumber(fromNumber);
  if (!phone) return null;
  const hit = waSessionByPhone.get(phone);
  if (hit?.username && Date.now() - (hit.ts || 0) <= 7 * 24 * 60 * 60 * 1000) {
    return hit.username;
  }
  return null;
}

async function loadWhatsAppSession(fromNumber) {
  const mem = peekWhatsAppSession(fromNumber);
  if (mem) return mem;
  const phone = normalizeWhatsAppNumber(fromNumber);
  if (!phone) return null;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', WA_SESSION_SETTINGS_KEY)
      .maybeSingle();
    const entry = data?.value?.[phone];
    if (entry?.username && Date.now() - (entry.ts || 0) <= 7 * 24 * 60 * 60 * 1000) {
      waSessionByPhone.set(phone, entry);
      return entry.username;
    }
  } catch (err) {
    console.warn('WA session load:', err.message);
  }
  return null;
}

const OPEN_STATUSES = new Set(['Pending', 'In Progress', 'On Hold', '']);

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function isOpenWeeklyStatus(status) {
  const s = String(status || 'Pending').trim();
  if (s === 'Completed' || s === 'Cancelled' || s === 'Rejected') return false;
  return OPEN_STATUSES.has(s) || !s;
}

function ymdOf(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    return raw.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    // Timestamptz / ISO — take the IST calendar day, not the UTC prefix.
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }
    return s.slice(0, 10);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  return null;
}

/** Monday (IST) of the week containing ymd (YYYY-MM-DD). */
function weekStartMonday(ymd) {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function shortDay(ymd) {
  try {
    return new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return ymd;
  }
}

function sortPlanTasks(a, b) {
  const da = ymdOf(a.task_date) || '';
  const db = ymdOf(b.task_date) || '';
  if (da !== db) return da.localeCompare(db);
  // Sheet order: full 1st-half column top→bottom, then 2nd-half column.
  const ha = Number(a.half) || 0;
  const hb = Number(b.half) || 0;
  if (ha !== hb) return ha - hb;
  const sa = Number(a.sr_no);
  const sb = Number(b.sr_no);
  if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
  return String(a.task_name || '').localeCompare(String(b.task_name || ''));
}

function planRowDedupeKey(t) {
  return [
    ymdOf(t?.task_date) || '',
    t?.sr_no == null || t?.sr_no === '' ? '' : String(t.sr_no),
    String(t?.task_name || '').trim().toLowerCase(),
    String(Number.isFinite(Number(t?.half)) ? Number(t.half) : 0),
    String(t?.time_slot || '').trim().toLowerCase(),
  ].join('|');
}

/** Keep one row per sheet cell; prefer Completed when duplicates exist. */
function dedupePlanRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = planRowDedupeKey(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    const prevDone = String(prev.status || '') === 'Completed';
    const nextDone = String(row.status || '') === 'Completed';
    if (nextDone && !prevDone) map.set(key, row);
  }
  return [...map.values()];
}

/**
 * Load week rows for one employee username.
 * Bundle: today (exact task_date match) + optional prior open (earlier days).
 */
async function loadWeeklyPlanDayBundle(employeeUsername, dayYmd = istYmd(), opts = {}) {
  const username = String(employeeUsername || '').trim();
  const todayYmd = ymdOf(dayYmd) || String(dayYmd || '').slice(0, 10);
  if (!username) {
    return { dayYmd: todayYmd, weekStart: null, today: [], priorPending: [], openOrdered: [], error: 'no_username' };
  }

  const weekStart = weekStartMonday(todayYmd);
  const todayOnly = opts.todayOnly === true;

  let { data, error } = await supabase
    .from('weekly_plan_tasks')
    .select(
      'id, employee_username, employee_name, task_date, task_name, time_slot, sr_no, half, status, week_start, week_end, site_name'
    )
    .ilike('employee_username', username)
    .gte('task_date', todayOnly ? todayYmd : weekStart)
    .lte('task_date', todayYmd)
    .order('task_date', { ascending: true })
    .order('sr_no', { ascending: true })
    .order('half', { ascending: true });

  if (error) {
    // Fallback without ilike if needed
    if (/ilike|operator/i.test(error.message || '')) {
      const retry = await supabase
        .from('weekly_plan_tasks')
        .select(
          'id, employee_username, employee_name, task_date, task_name, time_slot, sr_no, half, status, week_start, week_end, site_name'
        )
        .eq('employee_username', username)
        .gte('task_date', todayOnly ? todayYmd : weekStart)
        .lte('task_date', todayYmd)
        .order('task_date', { ascending: true });
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return {
        dayYmd: todayYmd,
        weekStart,
        today: [],
        priorPending: [],
        openOrdered: [],
        error: 'missing_table',
        note: 'Run weekly_plan_tasks.sql in Supabase.',
      };
    }
    throw error;
  }

  const rows = dedupePlanRows(
    (data || [])
      .filter((r) => String(r.employee_username || '').trim().toLowerCase() === username.toLowerCase())
      .map((r) => ({ ...r, task_date: ymdOf(r.task_date) || r.task_date }))
  ).sort(sortPlanTasks);

  // Strict calendar-day match only (never put prior days into "today").
  const today = rows.filter(
    (r) => ymdOf(r.task_date) === todayYmd && String(r.status || '') !== 'Cancelled'
  );
  const priorPending = todayOnly
    ? []
    : rows.filter((r) => {
        const d = ymdOf(r.task_date);
        return d && d < todayYmd && isOpenWeeklyStatus(r.status);
      });

  // Numbered open list: today's open only when todayOnly; else today then prior.
  const openOrdered = [
    ...today.filter((t) => isOpenWeeklyStatus(t.status)),
    ...priorPending,
  ];

  return {
    dayYmd: todayYmd,
    weekStart,
    today,
    priorPending,
    openOrdered,
    todayOnly,
    employeeName: rows[0]?.employee_name || today[0]?.employee_name || null,
  };
}

function workLabel(task) {
  const slot = String(task?.time_slot || '').trim();
  const halfOnly = /^(1st half|2nd half)$/i.test(slot);
  if (slot && !halfOnly) return slot;
  return String(task?.task_name || 'Task').replace(/\s*[·•]\s*(1st|2nd)\s*half/i, '').trim() || 'Task';
}

function formatTaskLine(task, index) {
  const work = workLabel(task);
  const cat = String(task.task_name || '')
    .replace(/\s*[·•]\s*(1st|2nd)\s*half/i, '')
    .trim();
  const half =
    Number(task.half) === 1 ? '1H' : Number(task.half) === 2 ? '2H' : null;
  const bits = [
    `${index}) ${clip(work, 72)}`,
    half,
    cat && cat.toUpperCase() !== work.toUpperCase() ? clip(cat, 28) : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

/** Build full day-list text, then split into WhatsApp-safe chunks (keep numbering intact). */
function formatWeeklyPlanMessageParts(bundle, opts = {}) {
  const fullName = opts.fullName || bundle.employeeName || 'Team member';
  const dayYmd = ymdOf(bundle.dayYmd) || istYmd();
  const label = dayLabel(dayYmd);
  const CHUNK = 3500;
  const todayOnly = bundle.todayOnly === true || opts.todayOnly === true;

  // Re-filter by exact date so prior days never leak into TODAY.
  const todayRows = (bundle.today || []).filter(
    (t) => ymdOf(t.task_date) === dayYmd && String(t.status || '') !== 'Cancelled'
  );
  const todayOpen = todayRows
    .filter((t) => isOpenWeeklyStatus(t.status))
    .sort(sortPlanTasks);
  const todayDone = todayRows
    .filter((t) => !isOpenWeeklyStatus(t.status))
    .sort(sortPlanTasks);
  const prior = todayOnly
    ? []
    : (bundle.priorPending || [])
        .filter((t) => {
          const d = ymdOf(t.task_date);
          return d && d < dayYmd && isOpenWeeklyStatus(t.status);
        })
        .sort(sortPlanTasks);

  const open = [...todayOpen, ...prior];
  const idToNum = new Map(open.map((t, i) => [t.id, i + 1]));

  const header = [
    '📋 *Weekly Plan*',
    `📅 ${label}`,
    `Hi ${clip(fullName, 40)},`,
    '',
  ];

  if (!todayOpen.length && !todayDone.length && !prior.length) {
    return [
      [
        ...header,
        todayOnly
          ? '_No tasks scheduled for today._'
          : '_No tasks for today, and nothing pending from earlier this week._',
        '',
        'Reply *PLAN* anytime to refresh.',
      ].join('\n'),
    ];
  }

  const bodyLines = [];
  bodyLines.push(`—— *TODAY* · ${shortDay(dayYmd)} (${todayOpen.length} open) ——`);
  if (!todayOpen.length && !todayDone.length) {
    bodyLines.push('_No tasks scheduled for today._');
  } else {
    const half1 = todayOpen.filter((t) => Number(t.half) === 1);
    const half2 = todayOpen.filter((t) => Number(t.half) === 2);
    const other = todayOpen.filter((t) => Number(t.half) !== 1 && Number(t.half) !== 2);
    if (half1.length) {
      bodyLines.push('_1st half_');
      for (const t of half1) {
        const n = idToNum.get(t.id);
        if (n == null) continue;
        bodyLines.push(formatTaskLine(t, n));
      }
    }
    if (half2.length) {
      bodyLines.push('_2nd half_');
      for (const t of half2) {
        const n = idToNum.get(t.id);
        if (n == null) continue;
        bodyLines.push(formatTaskLine(t, n));
      }
    }
    for (const t of other) {
      const n = idToNum.get(t.id);
      if (n == null) continue;
      bodyLines.push(formatTaskLine(t, n));
    }
    if (todayDone.length) {
      bodyLines.push(`_Done today: ${todayDone.length}_`);
      for (const t of todayDone.slice(0, 8)) {
        bodyLines.push(`✅ ${clip(workLabel(t), 70)}`);
      }
      if (todayDone.length > 8) bodyLines.push(`… +${todayDone.length - 8} more done`);
    }
  }

  if (prior.length) {
    bodyLines.push('');
    bodyLines.push(`—— *PENDING earlier* (${prior.length}) ——`);
    for (const t of prior) {
      const n = idToNum.get(t.id);
      if (n == null) continue;
      const when = shortDay(ymdOf(t.task_date) || '');
      bodyLines.push(`${n}) [${when}] ${clip(workLabel(t), 60)}`);
    }
  }

  const footer = [
    '',
    '————————',
    open.length
      ? `Open: *${open.length}* (today ${todayOpen.length}${prior.length ? ` + earlier ${prior.length}` : ''})  ·  Reply *1* or *1,3*`
      : 'All caught up for this list ✅',
    'Reply *PLAN* to refresh',
  ];

  // Pack lines into chunks under WhatsApp limit (never cut a line mid-way).
  const parts = [];
  let cur = header.join('\n');
  const pushLine = (line) => {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length <= CHUNK) {
      cur = next;
      return;
    }
    if (cur) parts.push(cur);
    // Start continuation parts without repeating the long header.
    cur = parts.length ? `(cont.)\n${line}` : line;
    if (cur.length > CHUNK) {
      parts.push(cur.slice(0, CHUNK));
      cur = '';
    }
  };
  for (const line of bodyLines) pushLine(line);
  for (const line of footer) pushLine(line);
  if (cur) parts.push(cur);
  return parts.length ? parts : [header.join('\n')];
}

function formatWeeklyPlanMessage(bundle, opts = {}) {
  return formatWeeklyPlanMessageParts(bundle, opts).join('\n\n').slice(0, 3500);
}

/**
 * When many users share one WhatsApp number, pick who owns the weekly-plan reply.
 * Order: durable send-session → latest EA upload → most open weekly_plan rows this week.
 */
async function resolveWeeklyPlanUserForPhone(fromNumber, candidates = []) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const sessionUser = await loadWhatsAppSession(fromNumber);
  if (sessionUser) {
    const hit = list.find(
      (u) => String(u.username || '').trim().toLowerCase() === sessionUser.toLowerCase()
    );
    if (hit) return hit;
  }

  const dayYmd = istYmd();
  const weekStart = weekStartMonday(dayYmd);
  const usable = list.filter((u) => u?.username && !isAdminUser(u));
  const names = usable.map((u) => String(u.username).trim()).filter(Boolean);
  if (!names.length) return list[0];

  // Prefer whoever most recently uploaded a weekly plan (EA attendance).
  try {
    const { data: eaRows } = await supabase
      .from('ea_meeting_attendance')
      .select('employee_username, created_at')
      .in('employee_username', names)
      .order('created_at', { ascending: false })
      .limit(30);
    for (const row of eaRows || []) {
      const uname = String(row.employee_username || '').trim().toLowerCase();
      const hit = usable.find((u) => String(u.username).trim().toLowerCase() === uname);
      if (hit) return hit;
    }
  } catch (err) {
    console.warn('resolveWeeklyPlanUserForPhone EA:', err.message);
  }

  try {
    const { data, error } = await supabase
      .from('weekly_plan_tasks')
      .select('employee_username, status, task_date')
      .in('employee_username', names)
      .gte('task_date', weekStart)
      .lte('task_date', dayYmd);
    if (error) throw error;

    const scores = new Map();
    for (const row of data || []) {
      const key = String(row.employee_username || '').trim().toLowerCase();
      if (!key) continue;
      const open = isOpenWeeklyStatus(row.status);
      const today = ymdOf(row.task_date) === dayYmd;
      scores.set(key, (scores.get(key) || 0) + (open ? 10 : 0) + (today ? 1 : 0));
    }

    let best = null;
    let bestScore = -1;
    for (const u of usable) {
      const key = String(u.username || '').trim().toLowerCase();
      const score = scores.get(key) || 0;
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    if (best && bestScore > 0) return best;
  } catch (err) {
    console.warn('resolveWeeklyPlanUserForPhone query:', err.message);
  }

  return usable[0] || list[0];
}

/**
 * Try complete by list numbers for one user; if shared phone, try other candidates
 * that have open weekly-plan tasks until one matches.
 */
async function completeWeeklyPlanByNumbersForPhone(fromNumber, candidates, numbers, dayYmd = istYmd()) {
  const ordered = [];
  const preferred = await resolveWeeklyPlanUserForPhone(fromNumber, candidates);
  if (preferred) ordered.push(preferred);
  for (const u of candidates || []) {
    if (!u?.username) continue;
    if (ordered.some((x) => x.id === u.id || String(x.username).toLowerCase() === String(u.username).toLowerCase())) {
      continue;
    }
    ordered.push(u);
  }

  let last = { done: 0, matched: false, bundle: null, username: null };
  for (const u of ordered) {
    const username = String(u.username || '').trim();
    if (!username || isAdminUser(u)) continue;
    const bundle = await loadWeeklyPlanDayBundle(username, dayYmd, { todayOnly: false });
    if (!(bundle.openOrdered || []).length && !(bundle.today || []).length) continue;
    const result = await completeWeeklyPlanByNumbers(username, numbers, dayYmd);
    last = { ...result, username, user: u };
    if (result.matched) {
      rememberWhatsAppSession(fromNumber, username);
      return last;
    }
  }
  return last;
}

async function findUserByUsername(username) {
  const u = String(username || '').trim();
  if (!u) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number, role, is_active')
    .ilike('username', u)
    .maybeSingle();
  if (error && !/ilike/i.test(error.message || '')) {
    console.warn('weeklyPlan user lookup:', error.message);
  }
  if (data) return data;
  const { data: all } = await supabase
    .from('users')
    .select('id, full_name, username, whatsapp_number, role, is_active')
    .neq('is_active', false);
  return (
    (all || []).find((row) => String(row.username || '').trim().toLowerCase() === u.toLowerCase()) ||
    null
  );
}

/**
 * Send day list WhatsApp for one employee username.
 * TODAY = exact task_date match; also includes earlier open tasks under PENDING.
 */
async function sendWeeklyPlanDayList(employeeUsername, opts = {}) {
  const dayYmd = ymdOf(opts.dayYmd) || istYmd();
  // Default: include prior pending in a separate section (today section stays date-strict).
  const todayOnly = opts.todayOnly === true;
  const user =
    opts.user ||
    (await findUserByUsername(employeeUsername));

  if (user && isAdminUser(user)) {
    return { ok: false, reason: 'admin_skipped', dayYmd };
  }

  const toNumber = opts.toNumber || user?.whatsapp_number;
  if (!normalizeWhatsAppNumber(toNumber)) {
    return { ok: false, reason: 'no_whatsapp', dayYmd };
  }

  if (!opts.force && alreadySentToday(employeeUsername, dayYmd)) {
    return { ok: true, skipped: 'already_sent_today', dayYmd, via: 'deduped' };
  }

  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd, { todayOnly });
  if (bundle.error === 'missing_table') {
    return { ok: false, reason: 'missing_table', note: bundle.note, dayYmd };
  }

  const todayOpenPreview = (bundle.today || [])
    .filter((t) => ymdOf(t.task_date) === dayYmd && isOpenWeeklyStatus(t.status))
    .sort(sortPlanTasks);
  const priorPreview = todayOnly
    ? []
    : (bundle.priorPending || [])
        .filter((t) => {
          const d = ymdOf(t.task_date);
          return d && d < dayYmd && isOpenWeeklyStatus(t.status);
        })
        .sort(sortPlanTasks);
  const openCount = todayOpenPreview.length + priorPreview.length;

  if (!openCount && !(bundle.today || []).length && !opts.sayEmpty) {
    return { ok: true, skipped: 'empty', openCount: 0, dayYmd, via: 'none' };
  }

  const fullName = opts.fullName || user?.full_name || bundle.employeeName || employeeUsername;
  const parts = formatWeeklyPlanMessageParts(bundle, { fullName, todayOnly });
  const toNorm = normalizeWhatsAppNumber(toNumber);

  const preview = todayOpenPreview
    .slice(0, 3)
    .map((t, i) => `${i + 1}) ${clip(workLabel(t), 40)}`)
    .join('; ');
  const label = dayLabel(dayYmd);
  const tmplResult = await sendWeeklyPlanUtilityTemplate(toNumber, {
    fullName,
    dayLabel: label,
    openCount: todayOpenPreview.length,
    preview,
    dayYmd,
  });

  let textResult = null;
  let textPartsOk = 0;
  for (let i = 0; i < parts.length; i += 1) {
    textResult = await sendWhatsAppText(toNumber, parts[i]);
    if (!textResult?.ok) {
      console.warn('Weekly plan WA text failed:', textResult?.reason || textResult?.error, {
        username: employeeUsername,
        to: toNorm,
        part: i + 1,
        of: parts.length,
      });
      break;
    }
    textPartsOk += 1;
  }

  if (tmplResult?.ok || textPartsOk > 0) {
    markSentToday(employeeUsername, dayYmd);
    rememberWhatsAppSession(toNumber, employeeUsername);
    const via = tmplResult?.ok && textPartsOk > 0
      ? 'template+text'
      : tmplResult?.ok
        ? tmplResult.via || 'template'
        : 'text';
    return {
      ok: true,
      via,
      to: toNorm,
      parts: parts.length,
      textPartsOk,
      templateOk: !!tmplResult?.ok,
      openCount,
      todayCount: todayOpenPreview.length,
      priorPendingCount: priorPreview.length,
      dayYmd,
      dayLabel: label,
      todayOnly,
      wamid:
        tmplResult?.data?.messages?.[0]?.id ||
        textResult?.data?.messages?.[0]?.id ||
        null,
    };
  }

  return {
    ok: false,
    via: 'failed',
    to: toNorm,
    openCount,
    todayCount: todayOpenPreview.length,
    priorPendingCount: priorPreview.length,
    dayYmd,
    dayLabel: label,
    todayOnly,
    reason: tmplResult?.reason || textResult?.reason || 'send_failed',
    textError: textResult,
    templateError: tmplResult,
  };
}

/**
 * First-touch / next-day ping when the 24h session is closed.
 *
 * Primary Meta template (short, Utility) — matches UI:
 *   Header: Weekly Plan · {{1}}   → day label
 *   Body:   Hi {{1}}, you have *{{2}}* open…  {{3}} preview…
 * Fallback: task_notification_v2 (5 body vars, no header).
 */
async function sendWeeklyPlanUtilityTemplate(toNumber, opts = {}) {
  const fullName = opts.fullName || 'Team member';
  const label = opts.dayLabel || dayLabel(opts.dayYmd || istYmd());
  const openCount = Number(opts.openCount) || 0;
  const preview = clip(opts.preview || 'Reply PLAN to see your tasks.', 200);
  const dedicated =
    process.env.WHATSAPP_WEEKLY_PLAN_TEMPLATE || 'weekly_plan_day_list';

  // Header {{1}} = day, Body {{1}} name, {{2}} count, {{3}} preview
  const dedicatedResult = await sendWhatsAppTemplate(
    toNumber,
    dedicated,
    [fullName, String(openCount), preview],
    { headerParams: [clip(label, 40)] }
  );
  if (dedicatedResult?.ok) {
    return { ...dedicatedResult, via: 'weekly_plan_day_list' };
  }

  const fallback = process.env.WHATSAPP_TASK_LIST_TEMPLATE || 'task_notification_v2';
  const fallbackResult = await sendWhatsAppTemplate(toNumber, fallback, [
    fullName,
    clip(
      `${label}: ${openCount} open weekly-plan task(s)${preview ? `: ${preview}` : ''}. Reply PLAN.`,
      200
    ),
    'Weekly Plan',
    opts.dayYmd || istYmd(),
    'Pending',
  ]);
  if (fallbackResult?.ok) {
    return { ...fallbackResult, via: 'template_fallback', dedicatedError: dedicatedResult };
  }
  return {
    ok: false,
    reason: fallbackResult?.reason || dedicatedResult?.reason || 'send_failed',
    error:
      fallbackResult?.error ||
      dedicatedResult?.error ||
      'WhatsApp template send failed — check template Approved + param count',
    dedicatedError: dedicatedResult,
    fallbackError: fallbackResult,
  };
}

async function completeWeeklyPlanTask(taskId, via = 'whatsapp') {
  const now = new Date().toISOString();
  const patch = {
    status: 'Completed',
    completed_at: now,
    completed_via: via,
    updated_at: now,
  };
  let { data, error } = await supabase
    .from('weekly_plan_tasks')
    .update(patch)
    .eq('id', taskId)
    .select('id, task_name, time_slot, half, status')
    .maybeSingle();

  if (error && /completed_at|completed_via/i.test(error.message || '')) {
    const retry = await supabase
      .from('weekly_plan_tasks')
      .update({ status: 'Completed', updated_at: now })
      .eq('id', taskId)
      .select('id, task_name, time_slot, half, status')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) return { ok: false, reason: error.message };
  return { ok: true, task: data };
}

async function completeWeeklyPlanByIndexes(employeeUsername, indexes, dayYmd = istYmd()) {
  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd, { todayOnly: false });
  const open = bundle.openOrdered || [];
  let done = 0;
  let lastName = '';
  for (const i of indexes) {
    const t = open[i];
    if (!t) continue;
    const r = await completeWeeklyPlanTask(t.id);
    if (r.ok) {
      done += 1;
      lastName = workLabel(r.task || t) || lastName;
    }
  }
  const refreshed = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd, { todayOnly: false });
  return { done, total: indexes.length, lastName, bundle: refreshed };
}

/**
 * Map reply numbers to open-list indexes.
 * Prefers the WhatsApp serial (1, 2, 3…). If a number is out of range,
 * also try Excel sr_no from the weekly plan sheet.
 */
function resolveWeeklyPlanReplyNumbers(openTasks, numbers) {
  const open = openTasks || [];
  const indexes = [];
  for (const n of numbers || []) {
    const num = Number(n);
    if (!Number.isFinite(num) || num < 1) continue;
    if (num <= open.length) {
      indexes.push(num - 1);
      continue;
    }
    const bySr = open.findIndex((t) => Number(t.sr_no) === num);
    if (bySr >= 0) indexes.push(bySr);
  }
  return [...new Set(indexes)];
}

async function completeWeeklyPlanByNumbers(employeeUsername, numbers, dayYmd = istYmd()) {
  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd, { todayOnly: false });
  const indexes = resolveWeeklyPlanReplyNumbers(bundle.openOrdered, numbers);
  if (!indexes.length) {
    return { done: 0, total: (numbers || []).length, lastName: '', bundle, matched: false };
  }
  const result = await completeWeeklyPlanByIndexes(employeeUsername, indexes, dayYmd);
  return { ...result, matched: true };
}

function parseNumberList(raw) {
  const parts = String(raw || '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const numbers = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return [];
    const n = Number(p);
    if (n < 1) return [];
    numbers.push(n);
  }
  return [...new Set(numbers)];
}

/**
 * Parse PLAN / WP / bare serial-number replies.
 * PLAN | WP | WLIST → list
 * 1 | 1,3 | PLAN 1 | WP 1,3 | DONE 1 → serial numbers
 */
function parseWeeklyPlanReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  if (/^(PLAN|WP|WLIST|WPLAN|WEEKLY)$/i.test(upper)) {
    return { list: true };
  }

  const prefixed = upper.match(/^(?:PLAN|WP|WPLAN|P|DONE|SR|SNO)\s+(.+)$/i);
  const rest = prefixed ? prefixed[1].trim() : upper;
  if (prefixed && /^(ALL|DONE\s*ALL)$/i.test(rest)) return { all: true };

  if (prefixed || /^[\d\s,]+$/.test(raw)) {
    const numbers = parseNumberList(rest);
    if (!numbers.length) return null;
    return { numbers, prefixed: !!prefixed };
  }
  return null;
}

/**
 * After EA Excel upload: ingest already done separately — just WA the employee.
 * Also used when notify receives clientParsed (ingest first in route).
 */
async function notifyWeeklyPlanAfterUpload({ username, user, toNumber, fullName, dayYmd } = {}) {
  const who = username || user?.username;
  if (!who) return { ok: false, reason: 'no_username' };
  return sendWeeklyPlanDayList(who, {
    user,
    toNumber,
    fullName,
    dayYmd: dayYmd || istYmd(),
    sayEmpty: true,
    // Always send after upload/ingest — don't skip because attendance ping already ran today.
    force: true,
  });
}

/**
 * Daily cron: each employee with weekly_plan rows this week gets today + prior pending.
 */
async function runWeeklyPlanDayListCron(opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
  const weekStart = weekStartMonday(dayYmd);

  const { data, error } = await supabase
    .from('weekly_plan_tasks')
    .select('employee_username, employee_name, task_date, status')
    .gte('task_date', weekStart)
    .lte('task_date', dayYmd);

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return { sent: 0, skipped: 0, disabled: false, note: 'weekly_plan_tasks missing', dayYmd };
    }
    throw error;
  }

  const byUser = new Map();
  for (const row of data || []) {
    const u = String(row.employee_username || '').trim();
    if (!u) continue;
    const key = u.toLowerCase();
    if (!byUser.has(key)) byUser.set(key, { username: u, name: row.employee_name });
  }

  const results = [];
  let sent = 0;
  let skipped = 0;

  for (const { username, name } of byUser.values()) {
    const user = await findUserByUsername(username);
    if (user && isAdminUser(user)) {
      skipped += 1;
      results.push({ username, ok: false, reason: 'admin_skipped' });
      continue;
    }
    const bundle = await loadWeeklyPlanDayBundle(username, dayYmd, { todayOnly: false });
    const hasWork =
      (bundle.openOrdered || []).length > 0 || (bundle.today || []).length > 0;
    if (!hasWork) {
      skipped += 1;
      results.push({ username, ok: true, skipped: 'empty' });
      continue;
    }
    const result = await sendWeeklyPlanDayList(username, {
      user,
      fullName: user?.full_name || name || username,
      dayYmd,
      sayEmpty: false,
    });
    if (result.ok && !result.skipped) sent += 1;
    else skipped += 1;
    results.push({ username, ...result });
  }

  return { sent, skipped, dayYmd, weekStart, results };
}

module.exports = {
  istYmd,
  dayLabel,
  weekStartMonday,
  isOpenWeeklyStatus,
  loadWeeklyPlanDayBundle,
  formatWeeklyPlanMessage,
  formatWeeklyPlanMessageParts,
  sendWeeklyPlanDayList,
  sendWeeklyPlanUtilityTemplate,
  notifyWeeklyPlanAfterUpload,
  completeWeeklyPlanTask,
  completeWeeklyPlanByIndexes,
  completeWeeklyPlanByNumbers,
  completeWeeklyPlanByNumbersForPhone,
  resolveWeeklyPlanReplyNumbers,
  resolveWeeklyPlanUserForPhone,
  rememberWhatsAppSession,
  peekWhatsAppSession,
  parseWeeklyPlanReply,
  runWeeklyPlanDayListCron,
  findUserByUsername,
};
