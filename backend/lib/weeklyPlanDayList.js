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
const {
  canonicalizeEaPlanTasks,
  completeExcelCellForEa,
} = require('./weeklyPlanCellSync');

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
  const sa = Number(a.sr_no);
  const sb = Number(b.sr_no);
  if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
  const ha = Number(a.half) || 0;
  const hb = Number(b.half) || 0;
  if (ha !== hb) return ha - hb;
  return String(a.task_name || '').localeCompare(String(b.task_name || ''));
}

/** One WhatsApp / grid item per Excel cell: date + half + row (sr / category). */
function planCellKey(task) {
  const ymd = ymdOf(task?.task_date) || '';
  const half = Number(task?.half) || 0;
  const sr = Number(task?.sr_no);
  const srPart = Number.isFinite(sr) && sr > 0 ? `sr:${sr}` : '';
  const name = String(task?.task_name || '')
    .replace(/\s*[·•]\s*(1st|2nd)\s*half/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${ymd}|${half}|${srPart}|${name}`;
}

function rowDayKey(task) {
  const ymd = ymdOf(task?.task_date) || '';
  const sr = Number(task?.sr_no);
  const srPart = Number.isFinite(sr) && sr > 0 ? `sr:${sr}` : '';
  const name = String(task?.task_name || '')
    .replace(/\s*[·•]\s*(1st|2nd)\s*half/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${ymd}|${srPart}|${name}`;
}

function normSlot(task) {
  return String(task?.time_slot || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slotQuality(task) {
  const slot = String(task?.time_slot || '').trim();
  const cat = String(task?.task_name || '')
    .replace(/\s*[·•]\s*(1st|2nd)\s*half/i, '')
    .trim();
  if (!slot) return 0;
  if (/^(1st half|2nd half)$/i.test(slot)) return 1;
  if (/^(pending|completed|done)$/i.test(slot)) return 1;
  // Category leaked into time_slot — almost useless for the list.
  if (cat && slot.toLowerCase() === cat.toLowerCase()) return 1;
  return 2 + Math.min(slot.length, 40) / 100;
}

/**
 * Score a candidate for a grid cell. Penalize work text that already belongs
 * to the *other* half of the same row/day (common phantom from bad ingest).
 */
function scorePlanCandidate(task, { slotHalves } = {}) {
  let score = 0;
  if (!isOpenWeeklyStatus(task?.status)) score += 1000;
  score += slotQuality(task) * 100;

  const slot = normSlot(task);
  const half = Number(task?.half) || 0;
  if (slot && slotHalves) {
    const key = `${rowDayKey(task)}|${slot}`;
    const halves = slotHalves.get(key) || new Set();
    if (halves.size === 1 && halves.has(half)) score += 80; // unique to this half
    else if (halves.size > 1 && halves.has(half)) score -= 60; // also on other half → likely copy
  }

  const updated = Date.parse(task?.updated_at || task?.completed_at || 0) || 0;
  score += Math.min(updated / 1e12, 1); // tiny tie-break toward newer
  return score;
}

function pickBetterPlanTask(a, b, ctx) {
  const as = scorePlanCandidate(a, ctx);
  const bs = scorePlanCandidate(b, ctx);
  if (as !== bs) return as >= bs ? a : b;
  return String(a?.id || '') >= String(b?.id || '') ? a : b;
}

/** Collapse phantom/duplicate DB rows so WA matches the Excel grid (1 cell → 1 item). */
function dedupePlanTasksByCell(tasks) {
  const list = (tasks || []).filter(Boolean);

  // Which halves each work-text appears on for a given row+day.
  const slotHalves = new Map();
  for (const t of list) {
    const slot = normSlot(t);
    if (!slot || slotQuality(t) < 2) continue;
    const key = `${rowDayKey(t)}|${slot}`;
    if (!slotHalves.has(key)) slotHalves.set(key, new Set());
    slotHalves.get(key).add(Number(t.half) || 0);
  }

  const groups = new Map();
  for (const t of list) {
    const key = planCellKey(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const ctx = { slotHalves };
  const out = [];
  const usedIds = new Set();
  for (const [, cands] of groups) {
    let bestSlotTask = cands[0];
    for (const t of cands) {
      if (slotQuality(t) > slotQuality(bestSlotTask)) bestSlotTask = t;
    }
    // Prefer the real Excel work-text row as the list id (UI links to that).
    // Status comes ONLY from that same row — never copy Completed from a phantom sibling.
    let winner =
      slotQuality(bestSlotTask) >= 2
        ? { ...bestSlotTask }
        : { ...cands.reduce((a, b) => pickBetterPlanTask(a, b, ctx)) };

    // If best-slot id already used, keep label but we must not duplicate ids in the list.
    const wid = String(winner.id || '');
    if (wid && usedIds.has(wid)) {
      const alt = cands.find((t) => t?.id && !usedIds.has(String(t.id)));
      if (alt) {
        winner = {
          ...alt,
          time_slot: winner.time_slot || alt.time_slot,
        };
      } else {
        continue; // skip duplicate cell entry
      }
    }
    if (winner.id) usedIds.add(String(winner.id));
    out.push(winner);
  }

  // Second pass: empty time_slot? Copy text only — do NOT switch to another list item's id.
  for (let i = 0; i < out.length; i += 1) {
    const t = out[i];
    if (slotQuality(t) >= 2) continue;
    const ymd = ymdOf(t.task_date);
    const half = Number(t.half) || 0;
    const row = rowDayKey(t);
    let best = null;
    for (const cand of list) {
      if (ymdOf(cand.task_date) !== ymd) continue;
      if (rowDayKey(cand) !== row) continue;
      const ch = Number(cand.half) || 0;
      if (ch !== half && ch !== 0) continue;
      if (!best || slotQuality(cand) > slotQuality(best)) best = cand;
    }
    if (best && slotQuality(best) >= 2) {
      out[i] = { ...t, time_slot: best.time_slot };
    }
  }

  return out.sort(sortPlanTasks);
}

/**
 * Load week rows for one employee username.
 * Bundle: today (all non-cancelled) + prior open (pending carryover).
 */
async function resolveLatestEaAttendanceId(username) {
  const u = String(username || '').trim();
  if (!u) return null;
  try {
    const { data, error } = await supabase
      .from('ea_meeting_attendance')
      .select('id, plan_submitted_at, created_at')
      .ilike('employee_username', u)
      .order('plan_submitted_at', { ascending: false, nullsFirst: false })
      .limit(8);
    if (error) throw error;
    const withPlan = (data || []).filter((r) => r.plan_submitted_at);
    return (withPlan[0] || data?.[0] || null)?.id || null;
  } catch (err) {
    console.warn('resolveLatestEaAttendanceId:', err.message);
    return null;
  }
}

async function loadWeeklyPlanDayBundle(employeeUsername, dayYmd = istYmd()) {
  const username = String(employeeUsername || '').trim();
  if (!username) {
    return { dayYmd, weekStart: null, today: [], priorPending: [], openOrdered: [], error: 'no_username' };
  }

  const weekStart = weekStartMonday(dayYmd);
  const eaId = await resolveLatestEaAttendanceId(username);
  if (eaId) {
    try {
      await canonicalizeEaPlanTasks(eaId);
    } catch (err) {
      console.warn('canonicalize before WA list:', err.message);
    }
  }
  const selectCols =
    'id, ea_attendance_id, employee_username, employee_name, task_date, task_name, time_slot, sr_no, half, status, week_start, week_end, site_name, updated_at, completed_at';
  const selectColsBasic =
    'id, ea_attendance_id, employee_username, employee_name, task_date, task_name, time_slot, sr_no, half, status, week_start, week_end, site_name';

  let q = supabase
    .from('weekly_plan_tasks')
    .select(selectCols)
    .ilike('employee_username', username)
    .gte('task_date', weekStart)
    .lte('task_date', dayYmd)
    .order('task_date', { ascending: true })
    .order('sr_no', { ascending: true });
  if (eaId) q = q.eq('ea_attendance_id', eaId);

  let { data, error } = await q;

  if (error && /updated_at|completed_at|ea_attendance_id|column/i.test(error.message || '')) {
    let q2 = supabase
      .from('weekly_plan_tasks')
      .select(selectColsBasic)
      .ilike('employee_username', username)
      .gte('task_date', weekStart)
      .lte('task_date', dayYmd)
      .order('task_date', { ascending: true })
      .order('sr_no', { ascending: true });
    if (eaId) q2 = q2.eq('ea_attendance_id', eaId);
    const retry = await q2;
    data = retry.data;
    error = retry.error;
  }

  // If scoped EA returned nothing, fall back to all rows for the user.
  if (!error && eaId && !(data || []).length) {
    const fallback = await supabase
      .from('weekly_plan_tasks')
      .select(selectColsBasic)
      .ilike('employee_username', username)
      .gte('task_date', weekStart)
      .lte('task_date', dayYmd)
      .order('task_date', { ascending: true })
      .order('sr_no', { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (/ilike|operator/i.test(error.message || '')) {
      const retry = await supabase
        .from('weekly_plan_tasks')
        .select(selectColsBasic)
        .eq('employee_username', username)
        .gte('task_date', weekStart)
        .lte('task_date', dayYmd)
        .order('task_date', { ascending: true });
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return {
        dayYmd,
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

  const rows = dedupePlanTasksByCell(
    (data || [])
      .filter((r) => String(r.employee_username || '').trim().toLowerCase() === username.toLowerCase())
      .sort(sortPlanTasks)
  );

  const today = rows.filter((r) => ymdOf(r.task_date) === dayYmd && String(r.status || '') !== 'Cancelled');
  const priorPending = rows.filter((r) => {
    const d = ymdOf(r.task_date);
    return d && d < dayYmd && isOpenWeeklyStatus(r.status);
  });

  const openOrdered = [
    ...today.filter((t) => isOpenWeeklyStatus(t.status)),
    ...priorPending.filter((t) => isOpenWeeklyStatus(t.status)),
  ];

  return {
    dayYmd,
    weekStart,
    eaAttendanceId: eaId,
    today,
    priorPending,
    openOrdered,
    employeeName: rows[0]?.employee_name || null,
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
    Number(task.half) === 1 ? '1st half' : Number(task.half) === 2 ? '2nd half' : null;
  const meta = [half, cat && cat.toUpperCase() !== work.toUpperCase() ? clip(cat, 40) : null]
    .filter(Boolean)
    .join(' | ');
  // Two lines so WhatsApp keeps each task readable.
  if (meta) return `${index}) ${clip(work, 80)}\n   ${meta}`;
  return `${index}) ${clip(work, 80)}`;
}

/** Build full day-list text, then split into WhatsApp-safe chunks (keep numbering intact). */
function formatWeeklyPlanMessageParts(bundle, opts = {}) {
  const fullName = opts.fullName || bundle.employeeName || 'Team member';
  const dayYmd = bundle.dayYmd || istYmd();
  const label = dayLabel(dayYmd);
  const CHUNK = 3500;

  const todayOpen = (bundle.today || []).filter((t) => isOpenWeeklyStatus(t.status));
  const todayDone = (bundle.today || []).filter((t) => !isOpenWeeklyStatus(t.status));
  const prior = bundle.priorPending || [];
  const open = bundle.openOrdered || [];
  const idToNum = new Map(open.map((t, i) => [t.id, i + 1]));

  const header = [
    '📋 *Weekly Plan*',
    `📅 ${label}`,
    `Hi ${clip(fullName, 40)},`,
    '',
  ];

  if (!todayOpen.length && !todayDone.length && !prior.length) {
    return [
      [...header, '_No tasks for today, and nothing pending from earlier this week._', '', 'Reply *PLAN* anytime to refresh.'].join(
        '\n'
      ),
    ];
  }

  const bodyLines = [];
  bodyLines.push(`—— *TODAY* · ${shortDay(dayYmd)} (${todayOpen.length} open) ——`);
  if (!todayOpen.length && !todayDone.length) {
    bodyLines.push('_No tasks scheduled for today._');
  } else {
    for (const t of todayOpen) {
      const n = idToNum.get(t.id);
      if (n == null) continue;
      bodyLines.push(formatTaskLine(t, n));
      bodyLines.push('');
    }
    if (todayDone.length) {
      bodyLines.push(`_Done today: ${todayDone.length}_`);
      for (const t of todayDone.slice(0, 8)) {
        bodyLines.push(`✅ ${clip(workLabel(t), 70)}`);
      }
      if (todayDone.length > 8) bodyLines.push(`… +${todayDone.length - 8} more done`);
      bodyLines.push('');
    }
    while (bodyLines[bodyLines.length - 1] === '') bodyLines.pop();
  }

  if (prior.length) {
    bodyLines.push('');
    bodyLines.push(`—— *PENDING earlier* (${prior.length}) ——`);
    for (const t of prior) {
      const n = idToNum.get(t.id);
      if (n == null) continue;
      const when = shortDay(ymdOf(t.task_date) || '');
      const half =
        Number(t.half) === 1 ? '1H' : Number(t.half) === 2 ? '2H' : '';
      bodyLines.push(
        `${n}) [${when}${half ? ` ${half}` : ''}] ${clip(workLabel(t), 70)}`
      );
    }
  }

  const footer = [
    '',
    '————————',
    open.length
      ? `Open: *${open.length}*  ·  Reply *1* or *1,3* to mark done`
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
    const bundle = await loadWeeklyPlanDayBundle(username, dayYmd);
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
 */
async function sendWeeklyPlanDayList(employeeUsername, opts = {}) {
  const dayYmd = opts.dayYmd || istYmd();
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

  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd);
  if (bundle.error === 'missing_table') {
    return { ok: false, reason: 'missing_table', note: bundle.note, dayYmd };
  }

  const openCount = (bundle.openOrdered || []).length;
  if (!openCount && !(bundle.today || []).length && !opts.sayEmpty) {
    return { ok: true, skipped: 'empty', openCount: 0, dayYmd, via: 'none' };
  }

  const fullName = opts.fullName || user?.full_name || bundle.employeeName || employeeUsername;
  const parts = formatWeeklyPlanMessageParts(bundle, { fullName });
  let textResult = null;
  for (let i = 0; i < parts.length; i += 1) {
    textResult = await sendWhatsAppText(toNumber, parts[i]);
    if (!textResult?.ok) break;
  }
  if (textResult?.ok) {
    markSentToday(employeeUsername, dayYmd);
    rememberWhatsAppSession(toNumber, employeeUsername);
    return {
      ok: true,
      via: 'text',
      parts: parts.length,
      openCount,
      todayCount: (bundle.today || []).length,
      priorPendingCount: (bundle.priorPending || []).length,
      dayYmd,
      dayLabel: dayLabel(dayYmd),
    };
  }

  // Outside 24h session window — approved Utility template only.
  const preview = (bundle.openOrdered || [])
    .slice(0, 3)
    .map((t, i) => `${i + 1}) ${clip(workLabel(t), 40)}`)
    .join('; ');
  const label = dayLabel(dayYmd);
  const tmplResult = await sendWeeklyPlanUtilityTemplate(toNumber, {
    fullName,
    dayLabel: label,
    openCount,
    preview,
    dayYmd,
  });
  if (tmplResult?.ok) {
    markSentToday(employeeUsername, dayYmd);
    rememberWhatsAppSession(toNumber, employeeUsername);
  }
  return {
    ok: !!tmplResult?.ok,
    via: tmplResult?.ok ? tmplResult.via || 'template_fallback' : 'failed',
    openCount,
    todayCount: (bundle.today || []).length,
    priorPendingCount: (bundle.priorPending || []).length,
    dayYmd,
    dayLabel: label,
    reason: tmplResult?.ok ? undefined : textResult?.reason || tmplResult?.reason || 'send_failed',
    textError: textResult,
    templateError: tmplResult?.ok ? null : tmplResult,
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
  const id = String(taskId || '').trim();
  // Hard guard: never run a broad update if id is missing/invalid.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, reason: 'invalid_task_id' };
  }
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
    .eq('id', id)
    .select('id, task_name, time_slot, half, status')
    .maybeSingle();

  if (error && /completed_at|completed_via/i.test(error.message || '')) {
    const retry = await supabase
      .from('weekly_plan_tasks')
      .update({ status: 'Completed', updated_at: now })
      .eq('id', id)
      .select('id, task_name, time_slot, half, status')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) return { ok: false, reason: error.message };
  if (!data?.id) return { ok: false, reason: 'task_not_found' };
  return { ok: true, task: data };
}

async function completeWeeklyPlanByIndexes(employeeUsername, indexes, dayYmd = istYmd()) {
  const username = String(employeeUsername || '').trim();
  const bundle = await loadWeeklyPlanDayBundle(username, dayYmd);
  const open = bundle.openOrdered || [];
  const eaId = bundle.eaAttendanceId;
  let done = 0;
  let lastName = '';

  for (const i of indexes) {
    const t = open[i];
    if (!t?.id) continue;

    if (eaId) {
      const r = await completeExcelCellForEa(eaId, t, 'whatsapp');
      if (r.ok) {
        done += 1;
        lastName = workLabel(r.task || t) || lastName;
      }
      continue;
    }

    // No EA scope — complete this id only.
    const r = await completeWeeklyPlanTask(t.id);
    if (r.ok) {
      done += 1;
      lastName = workLabel(r.task || t) || lastName;
    }
  }

  const refreshed = await loadWeeklyPlanDayBundle(username, dayYmd);
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
  const bundle = await loadWeeklyPlanDayBundle(employeeUsername, dayYmd);
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
    const bundle = await loadWeeklyPlanDayBundle(username, dayYmd);
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
