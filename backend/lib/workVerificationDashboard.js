/**
 * Build Work & Verification Dashboard payload
 * (matches Work-Verification-Dashboard-with-Time-Analysis.pdf sections).
 */

const { elapsedWorkingHours } = require('./workingHours');

function hrsBetween(a, b) {
  if (!a || !b) return null;
  const h = (new Date(b) - new Date(a)) / 36e5;
  if (Number.isNaN(h) || h < 0) return null;
  return Math.round(h * 10) / 10;
}

/** Office working hours between two stamps (9:30–18:30, lunch, Sun off). */
function officeHrsBetween(a, b) {
  if (!a || !b) return null;
  const start = new Date(a);
  const end = new Date(b);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const h = elapsedWorkingHours(start, end);
  return Math.round(h * 10) / 10;
}

function daysBetweenDates(a, b) {
  if (!a || !b) return null;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.max(0, Math.round((utcB - utcA) / 86400000));
}

/**
 * Office hours the employee actually worked on a task: from accept until the
 * task was sent for verification (or now, if still open / on hold since held_at),
 * minus the hold time already recorded.
 */
function taskHoursTaken(t, now = new Date()) {
  if (!t.accepted_at) return 0;
  const start = new Date(t.accepted_at);
  const end = t.is_on_hold && t.held_at
    ? new Date(t.held_at)
    : new Date(t.sent_for_verification_at || t.verified_at || t.rejected_at || now);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const worked = elapsedWorkingHours(start, end) - (Number(t.total_hold_seconds) || 0) / 3600;
  return Math.max(0, Math.round(worked * 10) / 10);
}

function avg(nums) {
  const v = nums.filter((n) => n != null && !Number.isNaN(n));
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

function isVerified(t) {
  return !isPendingTask(t) &&
    !isPendingVerify(t) &&
    (t.verification_status === 'Verified' || t.status === 'Verified' || t.status === 'Completed');
}

function isPendingTask(t) {
  return t.status === 'Pending';
}

function isPendingVerify(t) {
  return t.verification_status === 'Pending Verification';
}

function isCorrectionSent(t) {
  return t.verification_status === 'Verification Rejected';
}

function isCorrectionAck(t) {
  return t.verification_status === 'Updation Required';
}

function isCorrection(t) {
  return isCorrectionSent(t) || isCorrectionAck(t);
}

function correctionLabel(t) {
  if (isCorrectionSent(t)) return 'CORRECTION SENT';
  if (isCorrectionAck(t)) return 'CORRECTION ACKNOWLEDGED';
  return '';
}

function empName(t) {
  return (t.assigned_to_user?.full_name || 'Unknown').trim();
}

function verName(t) {
  return (t.verifier?.full_name || '').trim();
}

function projName(t) {
  return (t.project?.name || 'No project').trim();
}

function typeName(t) {
  return (t.task_type?.name || '—').trim();
}

function buildSrMap(allTasks) {
  const sorted = [...(allTasks || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const map = {};
  sorted.forEach((t, i) => {
    map[t.id] = i + 1;
  });
  return map;
}

function countVerificationSubmissions(tasks) {
  let n = 0;
  for (const t of tasks) {
    if (t.sent_for_verification_at || t.first_sent_for_verification_at) n += 1;
    const ext = Array.isArray(t.correction_extensions) ? t.correction_extensions.length : 0;
    n += ext;
    const events = Array.isArray(t.task_events) ? t.task_events : [];
    const corrections = events.filter((e) => e && (e.type === 'correction' || e.event === 'correction'));
    // Prefer extension count; if no extensions, count correction events beyond first submit
    if (!ext && corrections.length) n += Math.max(0, corrections.length - (t.sent_for_verification_at ? 0 : 0));
  }
  return n;
}

/**
 * 4b · Updation Log — one row per updation request (task_events action 'updation'),
 * grouped employee-wise. Resubmission = next 'send_for_verification' after the request.
 * Extra work hours / new due date are matched from correction_extensions by time.
 */
function buildUpdationLog(tasks, { sr = {}, from, to, users = [] } = {}) {
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;

  const nameById = {};
  (users || []).forEach((u) => {
    if (u?.id != null && u.full_name) nameById[String(u.id)] = String(u.full_name).trim();
  });
  (tasks || []).forEach((t) => {
    if (t.verifier?.id != null && t.verifier.full_name) {
      nameById[String(t.verifier.id)] = String(t.verifier.full_name).trim();
    }
  });

  const items = [];
  for (const t of tasks || []) {
    const events = (Array.isArray(t.task_events) ? t.task_events : [])
      .filter((e) => e && e.at && !Number.isNaN(new Date(e.at).getTime()))
      .slice()
      .sort((a, b) => new Date(a.at) - new Date(b.at));
    const updations = events.filter((e) => e.action === 'updation');
    if (!updations.length) continue;

    const exts = Array.isArray(t.correction_extensions) ? t.correction_extensions : [];

    updations.forEach((ev, idx) => {
      const atMs = new Date(ev.at).getTime();
      if (atMs < fromMs || atMs > toMs) return;

      const isLatest = idx === updations.length - 1;
      const resubmit = events.find(
        (e) => e.action === 'send_for_verification' && new Date(e.at).getTime() > atMs
      );
      const nearby = exts.filter(
        (x) => x && x.at && Math.abs(new Date(x.at).getTime() - atMs) <= 60000
      );
      const workHours = nearby
        .filter((x) => x.unit === 'work_hours')
        .reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const newDue = nearby.find((x) => x.unit === 'new_due');

      let status;
      if (isLatest && isCorrectionAck(t)) status = 'Awaiting update';
      else if (resubmit) status = 'Resubmitted';
      else status = 'No resubmission logged';

      items.push({
        round: idx + 1,
        sr: sr[t.id] || null,
        employee: empName(t),
        project: projName(t),
        description: String(t.description || '').trim() || '—',
        task_type: typeName(t),
        requested_at: ev.at,
        requested_by: nameById[String(ev.by)] || verName(t) || '—',
        // Only the latest updation note is stored on the task itself.
        note: isLatest ? String(t.updation_note || '').trim() : '',
        extra_work_hours: Math.round(workHours * 10) / 10,
        new_due_at: newDue?.new_target_date || null,
        resubmitted_at: resubmit ? resubmit.at : null,
        resubmit_hours: resubmit ? officeHrsBetween(ev.at, resubmit.at) : null,
        status,
      });
    });
  }

  items.sort((a, b) =>
    a.employee.localeCompare(b.employee) || new Date(a.requested_at) - new Date(b.requested_at)
  );

  const byEmp = new Map();
  items.forEach((i) => {
    if (!byEmp.has(i.employee)) {
      byEmp.set(i.employee, { name: i.employee, requests: 0, open: 0, resubmitted: 0, tasks: new Set() });
    }
    const row = byEmp.get(i.employee);
    row.requests += 1;
    if (i.status === 'Awaiting update') row.open += 1;
    if (i.status === 'Resubmitted') row.resubmitted += 1;
    row.tasks.add(i.sr ?? i.description);
  });

  return {
    total_requests: items.length,
    open: items.filter((i) => i.status === 'Awaiting update').length,
    resubmitted: items.filter((i) => i.status === 'Resubmitted').length,
    by_employee: [...byEmp.values()]
      .map((r) => ({ name: r.name, requests: r.requests, open: r.open, resubmitted: r.resubmitted, tasks: r.tasks.size }))
      .sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name)),
    items,
  };
}

function buildWorkVerificationDashboard(tasks, { srMap, verifierIds = [], updationSource, users = [], from, to } = {}) {
  const list = tasks || [];
  const verifierSet = new Set((verifierIds || []).map(String));
  const sr = srMap || buildSrMap(list);
  const withSr = list.map((t) => ({ ...t, sr: sr[t.id] || null }));

  const employees = [...new Set(withSr.map(empName).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const projects = [...new Set(withSr.map(projName))].sort((a, b) => a.localeCompare(b));

  // —— Summary ——
  const verified = withSr.filter(isVerified).length;
  const pendingVerify = withSr.filter(isPendingVerify).length;
  const correctionsSent = withSr.filter(isCorrection).length;
  const srs = withSr.map((t) => t.sr).filter((n) => n != null);
  const summary = {
    total_tasks: withSr.length,
    employees: employees.length,
    verified,
    pending_verify: pendingVerify,
    corrections_sent: correctionsSent,
    verification_submissions: countVerificationSubmissions(withSr),
    sr_from: srs.length ? Math.min(...srs) : null,
    sr_to: srs.length ? Math.max(...srs) : null,
  };

  // —— 1 · Work By Employee ——
  const now = new Date();
  const people = new Map();
  const addPerson = (user, fallbackName) => {
    const name = (user?.full_name || fallbackName || '').trim();
    if (!name) return;
    const id = user?.id == null ? null : String(user.id);
    const key = id || `name:${name}`;
    if (!people.has(key)) people.set(key, { id, name });
  };
  const completedVerifications = withSr.filter((t) =>
    t.verifier &&
    isVerified(t) &&
    (t.verified_at || t.first_verified_at ||
      t.status === 'Verified' || t.verification_status === 'Verified')
  );
  withSr.forEach((t) => {
    addPerson(t.assigned_to_user, empName(t));
  });
  completedVerifications.forEach((t) => {
    addPerson(t.verifier, verName(t));
  });

  const by_employee = [...people.values()].map((person) => {
    const mine = withSr.filter((t) => person.id
      ? String(t.assigned_to_user?.id) === person.id
      : empName(t) === person.name);
    const isVerifier = person.id != null && verifierSet.has(person.id);
    // Per site, count completed personal tasks and completed tasks this person verified.
    const projCounts = {};
    const ensure = (p) => {
      if (!projCounts[p]) {
        projCounts[p] = {
          count: 0,
          hours: 0,
          completedTasks: [],
          verified: 0,
          verifyHours: 0,
          verifiedTasks: [],
        };
      }
      return projCounts[p];
    };
    const personal = mine.filter(isVerified);
    personal.forEach((t) => {
      const row = ensure(projName(t));
      row.count += 1;
      row.hours += taskHoursTaken(t, now);
      row.completedTasks.push({
        sr: t.sr,
        description: String(t.description || '').trim() || '—',
        task_type: typeName(t),
        assigned_at: t.assigned_at || t.created_at || null,
        accepted_at: t.accepted_at || null,
        submitted_at: t.sent_for_verification_at || null,
        hours: Math.round(taskHoursTaken(t, now) * 10) / 10,
      });
    });
    completedVerifications
      .filter((t) => person.id != null
        ? String(t.verifier?.id) === person.id
        : verName(t) === person.name)
      .forEach((t) => {
        const isOwnTask = person.id != null && t.assigned_to_user?.id != null
          ? String(t.assigned_to_user.id) === person.id
          : empName(t) === person.name;
        if (isOwnTask) return;
        const row = ensure(projName(t));
        row.verified += 1;
        row.verifyHours += officeHrsBetween(
          t.verification_started_at,
          t.verified_at || t.first_verified_at
        ) || 0;
        row.verifiedTasks.push({
          sr: t.sr,
          description: String(t.description || '').trim() || '—',
          employee: empName(t),
          task_type: typeName(t),
          verify_started_at: t.verification_started_at || null,
          verified_at: t.verified_at || t.first_verified_at || null,
          verify_hours: officeHrsBetween(
            t.verification_started_at,
            t.verified_at || t.first_verified_at
          ),
        });
      });
    return {
      name: person.name,
      total: mine.length,
      is_verifier: isVerifier,
      verified: mine.filter(isVerified).length,
      pending: mine.filter(isPendingVerify).length,
      projects: Object.entries(projCounts)
        .map(([n, v]) => ({
          name: n,
          count: v.count,
          hours: Math.round(v.hours * 10) / 10,
          completed_tasks: v.completedTasks,
          verified: v.verified,
          verify_hours: Math.round(v.verifyHours * 10) / 10,
          verified_tasks: v.verifiedTasks,
        }))
        .sort((a, b) =>
          (b.count + b.verified) - (a.count + a.verified) ||
          a.name.localeCompare(b.name)
        ),
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // —— 2 · Project × Employee Matrix ——
  const project_employee_matrix = {
    employees,
    projects: projects.map((p) => {
      const counts = {};
      let total = 0;
      employees.forEach((e) => {
        const c = withSr.filter((t) => projName(t) === p && empName(t) === e).length;
        counts[e] = c;
        total += c;
      });
      return { name: p, counts, total };
    }),
    employee_totals: Object.fromEntries(
      employees.map((e) => [e, withSr.filter((t) => empName(t) === e).length])
    ),
    grand_total: withSr.length,
  };

  // —— 3 · Project × Verifier Matrix ——
  // Count verification activity: tasks that have a verifier and were submitted / verified / corrected
  const verifyTasks = withSr.filter(
    (t) =>
      verName(t) &&
      (t.sent_for_verification_at ||
        t.verified_at ||
        isPendingVerify(t) ||
        isCorrection(t) ||
        isVerified(t))
  );
  // Each verification "submission" row: prefer one row per task for matrix;
  // PDF matrix totals 37 = submissions. Expand by correction_extensions when present.
  const verifyRows = [];
  for (const t of withSr) {
    const v = verName(t);
    if (!v) continue;
    const base = {
      sr: t.sr,
      employee: empName(t),
      verifier: v,
      project: projName(t),
      task_type: typeName(t),
      note: t.verification_note || '',
      status: t.verification_status || '',
      verification_started_at: t.verification_started_at,
      verified_at: t.verified_at,
      sent_for_verification_at: t.sent_for_verification_at,
    };
    const ext = Array.isArray(t.correction_extensions) ? t.correction_extensions.length : 0;
    const times = Math.max(1, 1 + ext);
    for (let i = 0; i < times; i++) verifyRows.push(base);
  }
  // If no extensions anywhere, fall back to one row per verify-touched task
  const matrixRows = verifyRows.length ? verifyRows : verifyTasks.map((t) => ({
    sr: t.sr,
    employee: empName(t),
    verifier: verName(t),
    project: projName(t),
    task_type: typeName(t),
    note: t.verification_note || '',
    status: t.verification_status || '',
  }));

  const verifiers = [...new Set(matrixRows.map((r) => r.verifier).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const verifyProjects = [...new Set(matrixRows.map((r) => r.project))].sort((a, b) =>
    a.localeCompare(b)
  );

  const project_verifier_matrix = {
    verifiers,
    projects: verifyProjects.map((p) => {
      const counts = {};
      let total = 0;
      verifiers.forEach((v) => {
        const c = matrixRows.filter((r) => r.project === p && r.verifier === v).length;
        counts[v] = c;
        total += c;
      });
      return { name: p, counts, total };
    }),
    verifier_totals: Object.fromEntries(
      verifiers.map((v) => [v, matrixRows.filter((r) => r.verifier === v).length])
    ),
    grand_total: matrixRows.length,
  };

  // —— 3b · Verifier Summary ——
  const verifier_summary = verifiers.map((name) => {
    const mine = withSr.filter((t) => verName(t) === name);
    const corrections = mine.filter(isCorrection).map((t) => ({
      employee: empName(t),
      project: projName(t),
      sr: t.sr,
      task_type: typeName(t),
      note: t.verification_note || '',
      status: isCorrectionAck(t) ? 'Correction Acknowledged' : 'Correction Sent',
    }));
    return {
      name,
      total: mine.length,
      verified: mine.filter(isVerified).length,
      correction_sent: mine.filter(isCorrectionSent).length,
      correction_ack: mine.filter(isCorrectionAck).length,
      pending: mine.filter(isPendingVerify).length,
      corrections,
    };
  }).sort((a, b) => b.total - a.total);

  // —— 4 · Correction Log ——
  const correctionItems = withSr.filter(isCorrection).map((t) => ({
    employee: empName(t),
    project: projName(t),
    sr: t.sr,
    status: correctionLabel(t),
  }));
  const corrByEmp = {};
  correctionItems.forEach((c) => {
    corrByEmp[c.employee] = (corrByEmp[c.employee] || 0) + 1;
  });
  const correction_log = {
    by_employee: employees.map((e) => ({ name: e, count: corrByEmp[e] || 0 })),
    items: correctionItems,
  };

  // —— 4b · Updation Log ——
  // Uses the unfiltered task list (updation events are not tied to the report's
  // created/assigned/submitted range), filtered by the updation time itself.
  const updation_log = buildUpdationLog(updationSource || list, { sr, from, to, users });

  // —— 5a · Task Completion Time (assigned → submitted) — office working hours ——
  const completionRows = withSr
    .filter((t) => (t.assigned_at || t.created_at) && t.sent_for_verification_at)
    .map((t) => {
      const assigned = t.assigned_at || t.created_at;
      const submitted = t.sent_for_verification_at;
      return {
        sr: t.sr,
        employee: empName(t),
        project: projName(t),
        description: String(t.description || '').trim() || '—',
        task_type: typeName(t),
        assigned_at: assigned,
        accepted_at: t.accepted_at || null,
        submitted_at: submitted,
        hours: officeHrsBetween(assigned, submitted),
        calendar_hours: hrsBetween(assigned, submitted),
      };
    })
    .filter((r) => r.hours != null)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  const completionHrs = completionRows.map((r) => r.hours);
  const byEmpComp = {};
  completionRows.forEach((r) => {
    if (!byEmpComp[r.employee]) byEmpComp[r.employee] = [];
    byEmpComp[r.employee].push(r.hours);
  });
  const completion_time = {
    matched: completionRows.length,
    avg_hrs: avg(completionHrs),
    fastest_hrs: completionHrs.length ? Math.min(...completionHrs) : null,
    slowest_hrs: completionHrs.length ? Math.max(...completionHrs) : null,
    by_employee: Object.entries(byEmpComp)
      .map(([name, hrs]) => ({ name, avg_hrs: avg(hrs), n: hrs.length }))
      .sort((a, b) => (b.avg_hrs || 0) - (a.avg_hrs || 0)),
    rows: completionRows,
  };

  // —— 5b · Verification Turnaround (Start Verification → Verified) — office hours ——
  const turnRows = withSr
    .filter((t) => t.verification_started_at && t.verified_at && isVerified(t))
    .map((t) => {
      const started = t.verification_started_at;
      const verified = t.verified_at;
      const hours = officeHrsBetween(started, verified);
      const days = daysBetweenDates(started, verified);
      return {
        sr: t.sr,
        employee: empName(t),
        verifier: verName(t) || '—',
        project: projName(t),
        description: String(t.description || '').trim() || '—',
        started_at: started,
        accepted_at: started, // legacy key used by older UI
        verified_at: verified,
        sent_for_verification_at: t.sent_for_verification_at || null,
        hours,
        days,
      };
    })
    .filter((r) => r.hours != null)
    .sort((a, b) => new Date(a.verified_at) - new Date(b.verified_at));

  const turnHrs = turnRows.map((r) => r.hours);
  const sameDay = turnRows.filter((r) => r.days === 0).length;
  const byVerTurn = {};
  turnRows.forEach((r) => {
    if (!byVerTurn[r.verifier]) byVerTurn[r.verifier] = [];
    byVerTurn[r.verifier].push({ hours: r.hours, days: r.days });
  });
  const verify_turnaround = {
    measured: turnRows.length,
    same_day: sameDay,
    avg_hrs: avg(turnHrs),
    avg_days: avg(turnRows.map((r) => r.days)),
    fastest_hrs: turnHrs.length ? Math.min(...turnHrs) : null,
    slowest_hrs: turnHrs.length ? Math.max(...turnHrs) : null,
    slowest_days: turnRows.length ? Math.max(...turnRows.map((r) => r.days)) : null,
    by_verifier: Object.entries(byVerTurn)
      .map(([name, rows]) => {
        const hours = rows.map((r) => r.hours);
        const days = rows.map((r) => r.days);
        return {
          name,
          tasks: rows.length,
          same_day: days.filter((d) => d === 0).length,
          avg_hrs: avg(hours),
          avg_days: avg(days),
          slowest_hrs: hours.length ? Math.max(...hours) : null,
          slowest_days: days.length ? Math.max(...days) : null,
        };
      })
      .sort((a, b) => b.tasks - a.tasks),
    rows: turnRows,
  };

  return {
    summary,
    by_employee,
    project_employee_matrix,
    project_verifier_matrix,
    verifier_summary,
    correction_log,
    updation_log,
    completion_time,
    verify_turnaround,
  };
}

module.exports = {
  buildWorkVerificationDashboard,
  buildSrMap,
  hrsBetween,
};
