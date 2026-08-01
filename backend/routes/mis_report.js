const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

function ymd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday-start week containing date */
function startOfWeekMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Weeks for a calendar month. Week 1 may start in the previous month
 * (e.g. Aug 2026 starts Sat → Week 1 = Mon 27 Jul – Sun 2 Aug).
 */
function weeksForMonth(year, month /* 1-12 */) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  let cursor = startOfWeekMonday(first);
  const weeks = [];
  let n = 1;
  while (cursor <= last) {
    const from = new Date(cursor);
    const to = new Date(cursor);
    to.setDate(to.getDate() + 6);
    if (to >= first && from <= last) {
      weeks.push({
        week: n++,
        from: ymd(from),
        to: ymd(to),
        label: `Week ${n - 1} (${fmtShort(from)} – ${fmtShort(to)})`,
      });
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  // Fix labels (n already incremented)
  weeks.forEach((w, i) => {
    const from = parseYmd(w.from);
    const to = parseYmd(w.to);
    w.week = i + 1;
    w.label = `Week ${i + 1} (${fmtShort(from)} – ${fmtShort(to)})`;
  });
  return weeks;
}

function fmtShort(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function emptyStats() {
  return {
    total: 0,
    done: 0,
    on_time: 0,
    delayed_done: 0,
    delayed_not_done: 0,
    pending: 0,
    na: 0,
  };
}

function addStats(target, row) {
  Object.keys(row).forEach((k) => {
    target[k] = (target[k] || 0) + (row[k] || 0);
  });
}

function completionPct(s) {
  const denom = Math.max(0, (s.total || 0) - (s.na || 0));
  if (!denom) return 0;
  return Math.round(((s.done || 0) / denom) * 1000) / 10;
}

function classifyRegular(task, asOfYmd) {
  const due = task.target_date ? String(task.target_date).slice(0, 10) : null;
  const doneAt = task.verified_at || task.sent_for_verification_at || null;
  const doneDay = doneAt ? String(doneAt).slice(0, 10) : null;
  const isDone =
    task.status === 'Completed' ||
    task.verification_status === 'Verified' ||
    !!task.verified_at;

  const s = emptyStats();
  s.total = 1;

  if (isDone) {
    s.done = 1;
    if (due && doneDay && doneDay <= due) s.on_time = 1;
    else if (due && doneDay && doneDay > due) s.delayed_done = 1;
    else s.on_time = 1; // no due → count as on-time done
    return s;
  }

  if (due && due < asOfYmd) {
    s.delayed_not_done = 1;
  } else {
    s.pending = 1;
  }
  return s;
}

function classifyRecurring(inst, asOfYmd) {
  const due = String(inst.due_date).slice(0, 10);
  const doneDay = inst.completed_at ? String(inst.completed_at).slice(0, 10) : null;
  const s = emptyStats();
  s.total = 1;

  if (inst.status === 'NotApplicable') {
    s.na = 1;
    return s;
  }
  if (inst.status === 'Completed') {
    s.done = 1;
    if (doneDay && doneDay <= due) s.on_time = 1;
    else if (doneDay && doneDay > due) s.delayed_done = 1;
    else s.on_time = 1;
    return s;
  }
  // Pending
  if (due < asOfYmd) s.delayed_not_done = 1;
  else s.pending = 1;
  return s;
}

function shouldFireOn(task, date) {
  const start = new Date(task.start_date);
  const end = task.end_date ? new Date(task.end_date) : null;
  const d = new Date(ymd(date));
  if (d < new Date(ymd(start))) return false;
  if (end && d > new Date(ymd(end))) return false;
  const freq = task.frequency;
  if (freq === 'Daily') return true;
  if (freq === 'Weekly') {
    const days = (task.frequency_days || '').split(',').map(Number);
    return days.includes(date.getDay());
  }
  if (freq === 'Monthly') return date.getDate() === start.getDate();
  if (freq === 'Yearly') {
    return date.getDate() === start.getDate() && date.getMonth() === start.getMonth();
  }
  return false;
}

function fireDatesInRange(task, fromYmd, toYmd) {
  const dates = [];
  let cursor = parseYmd(fromYmd);
  const end = parseYmd(toYmd);
  const start = new Date(task.start_date);
  if (cursor < start) cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    if (shouldFireOn(task, cursor)) dates.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function ensureInstances(recurringTaskId, dueDateStrs) {
  if (!dueDateStrs.length) return [];
  const { data: existing, error } = await supabase
    .from('recurring_task_instances')
    .select('id, due_date, status, completed_at, recurring_task_id')
    .eq('recurring_task_id', recurringTaskId)
    .in('due_date', dueDateStrs);
  if (error) throw error;
  const byDate = {};
  (existing || []).forEach((i) => {
    byDate[i.due_date] = i;
  });
  const missing = dueDateStrs.filter((d) => !byDate[d]);
  if (missing.length) {
    const rows = missing.map((due_date) => ({
      recurring_task_id: recurringTaskId,
      due_date,
      status: 'Pending',
    }));
    const { data: created, error: createErr } = await supabase
      .from('recurring_task_instances')
      .insert(rows)
      .select('id, due_date, status, completed_at, recurring_task_id');
    if (createErr) throw createErr;
    (created || []).forEach((i) => {
      byDate[i.due_date] = i;
    });
  }
  return dueDateStrs.map((d) => byDate[d]).filter(Boolean);
}

// GET /mis-report?year=2026&month=8&week=1
// week optional — omit for all weeks of the month
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const weekFilter = req.query.week ? Number(req.query.week) : null;

    const weeks = weeksForMonth(year, month).filter((w) =>
      weekFilter ? w.week === weekFilter : true
    );
    if (!weeks.length) {
      return res.json({ year, month, weeks: [], as_of: ymd(now) });
    }

    const rangeFrom = weeks[0].from;
    const rangeTo = weeks[weeks.length - 1].to;
    const asOf = ymd(now);

    // Active non-client employees
    const { data: employees, error: empErr } = await supabase
      .from('users')
      .select('id, full_name, username, department, role, is_active')
      .eq('is_active', true)
      .neq('role', 'client')
      .order('full_name');
    if (empErr) throw empErr;

    // Regular tasks due in overall range
    const { data: tasks, error: taskErr } = await supabase
      .from('tasks')
      .select(
        'id, assigned_to, status, target_date, verified_at, sent_for_verification_at, verification_status'
      )
      .gte('target_date', `${rangeFrom}T00:00:00.000Z`)
      .lte('target_date', `${rangeTo}T23:59:59.999Z`);
    if (taskErr) throw taskErr;

    // Recurring templates + instances in range
    const { data: recurring, error: rtErr } = await supabase
      .from('recurring_tasks')
      .select('id, assigned_to, frequency, frequency_days, start_date, end_date, is_active')
      .eq('is_active', true);
    if (rtErr) throw rtErr;

    const recurringInstances = [];
    for (const rt of recurring || []) {
      const dates = fireDatesInRange(rt, rangeFrom, rangeTo);
      const insts = await ensureInstances(rt.id, dates);
      insts.forEach((inst) => {
        recurringInstances.push({ ...inst, assigned_to: rt.assigned_to });
      });
    }

    const weekPayload = weeks.map((w) => {
      const byEmp = {};
      (employees || []).forEach((e) => {
        byEmp[e.id] = {
          id: e.id,
          name: e.full_name,
          username: e.username,
          department: e.department,
          ...emptyStats(),
        };
      });

      const inWeek = (day) => day >= w.from && day <= w.to;

      for (const t of tasks || []) {
        const due = t.target_date ? String(t.target_date).slice(0, 10) : null;
        if (!due || !inWeek(due)) continue;
        const emp = byEmp[t.assigned_to];
        if (!emp) continue;
        addStats(emp, classifyRegular(t, asOf));
      }

      for (const inst of recurringInstances) {
        const due = String(inst.due_date).slice(0, 10);
        if (!inWeek(due)) continue;
        const emp = byEmp[inst.assigned_to];
        if (!emp) continue;
        addStats(emp, classifyRecurring(inst, asOf));
      }

      const rows = Object.values(byEmp)
        .filter((e) => e.total > 0)
        .map((e) => ({
          ...e,
          delayed: e.delayed_not_done, // column matching screenshot "Delayed"
          on_time_pct: e.done ? Math.round((e.on_time / e.done) * 100) : 0,
          completion_pct: completionPct(e),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const totals = emptyStats();
      rows.forEach((r) => addStats(totals, r));
      totals.delayed = totals.delayed_not_done;
      totals.on_time_pct = totals.done ? Math.round((totals.on_time / totals.done) * 100) : 0;
      totals.completion_pct = completionPct(totals);

      return {
        ...w,
        employees: rows,
        totals,
        employee_count: rows.length,
      };
    });

    res.json({ year, month, as_of: asOf, weeks: weekPayload });
  } catch (err) {
    console.error('MIS report error:', err.message);
    res.status(500).json({ error: err.message || 'Could not build MIS report' });
  }
});

module.exports = router;
