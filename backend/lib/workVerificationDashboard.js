/**
 * Build Work & Verification Dashboard payload
 * (matches Work-Verification-Dashboard-with-Time-Analysis.pdf sections).
 */

function hrsBetween(a, b) {
  if (!a || !b) return null;
  const h = (new Date(b) - new Date(a)) / 36e5;
  if (Number.isNaN(h) || h < 0) return null;
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

function avg(nums) {
  const v = nums.filter((n) => n != null && !Number.isNaN(n));
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

function isVerified(t) {
  return t.verification_status === 'Verified' || t.status === 'Completed';
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

function buildWorkVerificationDashboard(tasks, { srMap } = {}) {
  const list = tasks || [];
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
  const by_employee = employees.map((name) => {
    const mine = withSr.filter((t) => empName(t) === name);
    const projCounts = {};
    mine.forEach((t) => {
      const p = projName(t);
      projCounts[p] = (projCounts[p] || 0) + 1;
    });
    return {
      name,
      total: mine.length,
      verified: mine.filter(isVerified).length,
      pending: mine.filter(isPendingVerify).length,
      projects: Object.entries(projCounts)
        .map(([n, count]) => ({ name: n, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
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

  // —— 5a · Task Completion Time (assigned → submitted) ——
  const completionRows = withSr
    .filter((t) => (t.assigned_at || t.created_at) && t.sent_for_verification_at)
    .map((t) => {
      const assigned = t.assigned_at || t.created_at;
      const submitted = t.sent_for_verification_at;
      return {
        sr: t.sr,
        employee: empName(t),
        project: projName(t),
        task_type: typeName(t),
        assigned_at: assigned,
        submitted_at: submitted,
        hours: hrsBetween(assigned, submitted),
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

  // —— 5b · Verification Turnaround (accept → verified), whole days ——
  const turnRows = withSr
    .filter((t) => t.verification_started_at && t.verified_at && isVerified(t))
    .map((t) => {
      const days = daysBetweenDates(t.verification_started_at, t.verified_at);
      return {
        sr: t.sr,
        employee: empName(t),
        verifier: verName(t) || '—',
        project: projName(t),
        accepted_at: t.verification_started_at,
        verified_at: t.verified_at,
        days,
      };
    })
    .filter((r) => r.days != null)
    .sort((a, b) => new Date(a.verified_at) - new Date(b.verified_at));

  const turnDays = turnRows.map((r) => r.days);
  const sameDay = turnRows.filter((r) => r.days === 0).length;
  const byVerTurn = {};
  turnRows.forEach((r) => {
    if (!byVerTurn[r.verifier]) byVerTurn[r.verifier] = [];
    byVerTurn[r.verifier].push(r.days);
  });
  const verify_turnaround = {
    measured: turnRows.length,
    same_day: sameDay,
    avg_days: avg(turnDays),
    slowest_days: turnDays.length ? Math.max(...turnDays) : null,
    by_verifier: Object.entries(byVerTurn)
      .map(([name, days]) => ({
        name,
        tasks: days.length,
        same_day: days.filter((d) => d === 0).length,
        avg_days: avg(days),
        slowest_days: days.length ? Math.max(...days) : null,
      }))
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
    completion_time,
    verify_turnaround,
  };
}

module.exports = {
  buildWorkVerificationDashboard,
  buildSrMap,
  hrsBetween,
};
