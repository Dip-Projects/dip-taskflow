/**
 * One Excel cell → one weekly_plan_tasks row.
 * Shared identity for UI grid + WhatsApp list/complete.
 *
 * Cell key = task_date | half | sr_no | task_name
 * (time_slot is the work text INSIDE the cell — not part of identity)
 */
const supabase = require('./supabaseClient');

function ymdOf(value) {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  return '';
}

function normName(value) {
  return String(value || '')
    .replace(/\s*[·•]\s*(1st|2nd)\s*half/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normSlot(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isOpenStatus(status) {
  const s = String(status || '').trim();
  return s !== 'Completed' && s !== 'Cancelled';
}

function isCompletedStatus(status) {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return s === 'completed' || s === 'complete' || s === 'done';
}

function slotQuality(task) {
  const slot = String(task?.time_slot || '').trim();
  const cat = String(task?.task_name || '').trim();
  if (!slot) return 0;
  if (/^(1st half|2nd half)$/i.test(slot)) return 1;
  if (/^(pending|completed|done)$/i.test(slot)) return 1;
  if (cat && slot.toLowerCase() === cat.toLowerCase()) return 1;
  return 2 + Math.min(slot.length, 40) / 100;
}

/** Canonical Excel-cell identity (UI + WhatsApp must share this). */
function excelCellKey(task) {
  const ymd = ymdOf(task?.task_date);
  const half = Number(task?.half) || 0;
  const sr = Number(task?.sr_no);
  const srPart = Number.isFinite(sr) && sr > 0 ? `sr:${sr}` : '';
  const name = normName(task?.task_name);
  return `${ymd}|${half}|${srPart}|${name}`;
}

function pickCanonical(a, b) {
  const aDone = isCompletedStatus(a?.status);
  const bDone = isCompletedStatus(b?.status);
  if (aDone !== bDone) return aDone ? a : b;
  const aq = slotQuality(a);
  const bq = slotQuality(b);
  if (aq !== bq) return aq > bq ? a : b;
  const aUp = Date.parse(a?.updated_at || a?.completed_at || 0) || 0;
  const bUp = Date.parse(b?.updated_at || b?.completed_at || 0) || 0;
  if (aUp !== bUp) return aUp >= bUp ? a : b;
  return String(a?.id || '') >= String(b?.id || '') ? a : b;
}

/**
 * Collapse duplicate rows for one EM attendance upload to 1 row per Excel cell.
 * Keeps Completed + best time_slot; deletes the rest.
 */
async function canonicalizeEaPlanTasks(eaAttendanceId) {
  const eaId = String(eaAttendanceId || '').trim();
  if (!eaId) return { ok: false, reason: 'no_ea_id', kept: 0, deleted: 0 };

  const { data, error } = await supabase
    .from('weekly_plan_tasks')
    .select(
      'id, ea_attendance_id, task_date, task_name, time_slot, sr_no, half, status, completed_at, completed_via, updated_at, source_file'
    )
    .eq('ea_attendance_id', eaId);

  if (error) {
    if (/does not exist|schema cache|PGRST205|42P01/i.test(error.message || '')) {
      return { ok: false, reason: 'missing_table', kept: 0, deleted: 0 };
    }
    throw error;
  }

  const groups = new Map();
  for (const row of data || []) {
    const key = excelCellKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let kept = 0;
  let deleted = 0;
  const toDelete = [];

  for (const [, rows] of groups) {
    if (rows.length === 1) {
      kept += 1;
      continue;
    }
    let winner = rows[0];
    for (let i = 1; i < rows.length; i += 1) {
      winner = pickCanonical(winner, rows[i]);
    }
    // Prefer best work text on the winner row.
    let bestSlot = winner;
    for (const r of rows) {
      if (slotQuality(r) > slotQuality(bestSlot)) bestSlot = r;
    }
    const anyDone = rows.find((r) => isCompletedStatus(r.status));
    const patch = {};
    if (slotQuality(bestSlot) > slotQuality(winner) && bestSlot.time_slot) {
      patch.time_slot = bestSlot.time_slot;
    }
    if (anyDone && isOpenStatus(winner.status)) {
      patch.status = 'Completed';
      patch.completed_at = anyDone.completed_at || new Date().toISOString();
      patch.completed_via = anyDone.completed_via || 'whatsapp';
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await supabase.from('weekly_plan_tasks').update(patch).eq('id', winner.id);
    }
    for (const r of rows) {
      if (String(r.id) === String(winner.id)) continue;
      toDelete.push(r.id);
    }
    kept += 1;
  }

  if (toDelete.length) {
    const chunk = 80;
    for (let i = 0; i < toDelete.length; i += chunk) {
      const ids = toDelete.slice(i, i + chunk);
      const { error: delErr } = await supabase.from('weekly_plan_tasks').delete().in('id', ids);
      if (delErr) console.warn('canonicalize delete:', delErr.message);
      else deleted += ids.length;
    }
  }

  return { ok: true, kept, deleted, groups: groups.size };
}

/**
 * Mark Completed for the Excel cell of `task` inside one EA upload.
 * Updates every remaining duplicate of that cell (should be 1 after canonicalize).
 */
async function completeExcelCellForEa(eaAttendanceId, task, via = 'whatsapp') {
  const eaId = String(eaAttendanceId || '').trim();
  const ymd = ymdOf(task?.task_date);
  const half = Number(task?.half) || 0;
  const name = String(task?.task_name || '').trim();
  const sr = Number(task?.sr_no);
  if (!eaId || !ymd) {
    return { ok: false, reason: 'missing_cell', updated: 0 };
  }

  await canonicalizeEaPlanTasks(eaId);

  let q = supabase
    .from('weekly_plan_tasks')
    .select('id, status, time_slot, task_name, half, sr_no, task_date')
    .eq('ea_attendance_id', eaId)
    .eq('task_date', ymd)
    .eq('half', half);
  if (Number.isFinite(sr) && sr > 0) q = q.eq('sr_no', sr);
  else if (name) q = q.ilike('task_name', name);

  const { data: rows, error } = await q;
  if (error) return { ok: false, reason: error.message, updated: 0 };

  const key = excelCellKey(task);
  const now = new Date().toISOString();
  const patch = {
    status: 'Completed',
    completed_at: now,
    completed_via: via,
    updated_at: now,
  };

  let updated = 0;
  let last = null;
  for (const row of rows || []) {
    if (excelCellKey(row) !== key) continue;
    let { data, error: upErr } = await supabase
      .from('weekly_plan_tasks')
      .update(patch)
      .eq('id', row.id)
      .select('id, task_name, time_slot, half, status')
      .maybeSingle();
    if (upErr && /completed_at|completed_via/i.test(upErr.message || '')) {
      const retry = await supabase
        .from('weekly_plan_tasks')
        .update({ status: 'Completed', updated_at: now })
        .eq('id', row.id)
        .select('id, task_name, time_slot, half, status')
        .maybeSingle();
      data = retry.data;
      upErr = retry.error;
    }
    if (!upErr && data) {
      updated += 1;
      last = data;
    }
  }

  // Fallback: by id if cell match failed.
  if (!updated && task?.id) {
    let { data, error: upErr } = await supabase
      .from('weekly_plan_tasks')
      .update(patch)
      .eq('id', task.id)
      .select('id, task_name, time_slot, half, status')
      .maybeSingle();
    if (upErr && /completed_at|completed_via/i.test(upErr.message || '')) {
      const retry = await supabase
        .from('weekly_plan_tasks')
        .update({ status: 'Completed', updated_at: now })
        .eq('id', task.id)
        .select('id, task_name, time_slot, half, status')
        .maybeSingle();
      data = retry.data;
    }
    if (data) {
      updated = 1;
      last = data;
    }
  }

  return { ok: updated > 0, updated, task: last };
}

module.exports = {
  ymdOf,
  normSlot,
  normName,
  excelCellKey,
  pickCanonical,
  slotQuality,
  isOpenStatus,
  isCompletedStatus,
  canonicalizeEaPlanTasks,
  completeExcelCellForEa,
};
