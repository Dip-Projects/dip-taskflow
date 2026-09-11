/**
 * Task Delay Report rows — matches "Task Delay Report" sheet format.
 * Deadline = acceptance + hours_to_complete in OFFICE working time
 * (9:30–18:30, lunch 13–14, Mon–Sat / Sunday off).
 *
 * Hrs to Complete = original assigned hours (survives Hold/Resume).
 * Deadline uses current timer hours (remaining after resume) + accepted_at.
 */

const { buildSrMap } = require('./workVerificationDashboard');
const { addWorkingHours, elapsedWorkingHours } = require('./workingHours');
const {
  employeeWorkDueDate,
  employeeDueDate,
  workTimerBudgetHours,
  holdResumeSummary,
  holdResumeLabel,
  needsReaccept,
  activePlanDate,
  originalPlanDate,
  fmtDuration,
  verificationWorkDueDate,
} = require('./taskOverdue');

function fmtDelayStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'Asia/Kolkata' });
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')} ${mon} ${get('hour')}:${get('minute')}`;
}

/** Format working-hours float as "2d 17h 16m" (8h office day). */
function formatWorkingDuration(hoursFloat) {
  const abs = Math.abs(Number(hoursFloat) || 0);
  const totalMin = Math.round(abs * 60);
  const workDayMin = 8 * 60;
  const days = Math.floor(totalMin / workDayMin);
  const rem = totalMin % workDayMin;
  const hours = Math.floor(rem / 60);
  const mins = rem % 60;
  const bits = [];
  if (days) bits.push(`${days}d`);
  if (hours) bits.push(`${hours}h`);
  if (mins || !bits.length) bits.push(`${mins}m`);
  return bits.join(' ');
}

/** @deprecated alias — kept for any old imports */
function formatDurationMs(ms) {
  return formatWorkingDuration((Number(ms) || 0) / 3600000);
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Plan dates are calendar days — keep them as YYYY-MM-DD, not shifted UTC. */
function localDayString(d) {
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Assigned hours for report display (never overwritten by resume remaining). */
function assignedHours(t) {
  const orig = numOrNull(t.original_hours_to_complete);
  if (orig != null) return orig;
  return numOrNull(t.hours_to_complete);
}

/** Hours used for live deadline after accept / resume. */
function timerHours(t) {
  return workTimerBudgetHours(t);
}

/**
 * Full hold trail for the report: every pause with how long the timer stayed
 * stopped, every resume with the restart, and the total time lost to holds.
 */
function formatHoldResumeLabel(t, now = new Date()) {
  return holdResumeLabel(t, (iso) => fmtDelayStamp(iso) || '—', now);
}

/**
 * @param {object[]} tasks — enriched with project / assignee joins
 * @param {{ srMap?: Record<string,number>, now?: Date }} opts
 */
function buildDelayReportRows(tasks, opts = {}) {
  const list = tasks || [];
  const srMap = opts.srMap || buildSrMap(list);
  const now = opts.now || new Date();

  return list
    .map((t) => {
      const assignedAt = t.assigned_at || t.created_at || null;
      const acceptedAt = t.accepted_at || null;
      const submittedAt = t.sent_for_verification_at || null;
      const verifyStartedAt = t.verification_started_at || t.first_verification_started_at || null;
      const verifiedAt = t.verified_at || t.first_verified_at || null;
      const displayHrs = assignedHours(t);
      const dueHrs = timerHours(t);

      const holds = holdResumeSummary(t, now);
      const awaitingReaccept = needsReaccept(t);

      let deadlineIso = null;
      let deadlineLabel = 'Awaiting acceptance';
      let acceptedLabel = 'Not yet accepted';
      let submittedLabel = 'Not submitted (Pending)';
      let status = 'N/A';
      let delayLabel = 'Due starts after acceptance';
      let delayMs = null;

      if (awaitingReaccept) {
        acceptedLabel = 'Rescheduled — not accepted again';
        deadlineLabel = 'Waiting for re-accept';
      } else if (acceptedAt) {
        acceptedLabel = fmtDelayStamp(acceptedAt) || '—';
        const due = employeeWorkDueDate(t);
        if (due) {
          deadlineIso = due.toISOString();
          deadlineLabel = fmtDelayStamp(due) || '—';
        } else {
          deadlineLabel = '—';
        }
      } else {
        // Before acceptance the employee still has a promise date on screen.
        const preDue = employeeDueDate(t);
        if (preDue) deadlineLabel = `${fmtDelayStamp(preDue)} (if accepted now)`;
      }

      if (submittedAt) {
        submittedLabel = fmtDelayStamp(submittedAt) || '—';
      }

      if (awaitingReaccept) {
        status = 'N/A';
        delayLabel = 'Rescheduled — accept again to restart the timer';
      } else if (!acceptedAt) {
        status = 'N/A';
        delayLabel = 'Due starts after acceptance';
      } else if (deadlineIso) {
        const compareAt = submittedAt ? new Date(submittedAt) : now;
        const due = new Date(deadlineIso);
        delayMs = compareAt - due;
        if (delayMs > 60 * 1000) {
          status = 'Delayed';
          delayLabel = formatWorkingDuration(elapsedWorkingHours(due, compareAt));
        } else {
          status = 'On Time';
          if (delayMs >= -60 * 1000) {
            delayLabel = 'on time';
          } else {
            const earlyHrs = elapsedWorkingHours(compareAt, due);
            delayLabel = earlyHrs < 1 / 60 ? 'on time' : `${formatWorkingDuration(earlyHrs)} early`;
          }
        }
        if (!submittedAt && status === 'On Time') {
          delayLabel = 'Within deadline';
        }
        if (!submittedAt && status === 'Delayed') {
          delayLabel = formatWorkingDuration(elapsedWorkingHours(due, compareAt));
        }
      } else {
        status = 'N/A';
        delayLabel = 'No hours set';
      }

      // —— Verification trail (Start Verification → Verified), 2 office-hour SLA ——
      let verifyStartedLabel = 'Not started';
      let verifiedLabel = 'Not verified';
      let verifyDueLabel = '—';
      let verifyStatus = 'N/A';
      let verifyDelayLabel = '—';

      if (!submittedAt) {
        verifyStartedLabel = '—';
        verifiedLabel = '—';
        verifyDelayLabel = 'Not sent for verification';
      } else if (!verifyStartedAt) {
        verifyStartedLabel = 'Pending Start Verification';
        verifyDelayLabel = 'Verifier has not started';
        verifyStatus = 'Pending';
      } else {
        verifyStartedLabel = fmtDelayStamp(verifyStartedAt) || '—';
        const vDue = verificationWorkDueDate({ verification_started_at: verifyStartedAt });
        if (vDue) verifyDueLabel = fmtDelayStamp(vDue) || '—';

        if (verifiedAt) {
          verifiedLabel = fmtDelayStamp(verifiedAt) || '—';
          if (vDue) {
            const doneAt = new Date(verifiedAt);
            const delayHrs = elapsedWorkingHours(vDue, doneAt);
            const earlyHrs = elapsedWorkingHours(doneAt, vDue);
            if (doneAt - vDue > 60 * 1000) {
              verifyStatus = 'Delayed';
              verifyDelayLabel = formatWorkingDuration(delayHrs);
            } else {
              verifyStatus = 'On Time';
              verifyDelayLabel = earlyHrs < 1 / 60 ? 'on time' : `${formatWorkingDuration(earlyHrs)} early`;
            }
          } else {
            verifyStatus = 'Done';
            verifyDelayLabel = 'Verified';
          }
        } else {
          verifiedLabel = 'Pending verify';
          if (vDue) {
            if (now - vDue > 60 * 1000) {
              verifyStatus = 'Overdue';
              verifyDelayLabel = formatWorkingDuration(elapsedWorkingHours(vDue, now));
            } else {
              verifyStatus = 'In progress';
              verifyDelayLabel = 'Within 2h SLA';
            }
          } else {
            verifyStatus = 'In progress';
            verifyDelayLabel = 'Started';
          }
        }
      }

      return {
        id: t.id,
        sr: srMap[t.id] || null,
        project: t.project?.name || '—',
        employee_id: t.assigned_to_user?.id || t.assigned_to || null,
        employee: t.assigned_to_user?.full_name || '—',
        assigned_at: assignedAt,
        assigned_label: fmtDelayStamp(assignedAt) || '—',
        accepted_at: acceptedAt,
        accepted_label: acceptedLabel,
        hours_to_complete: displayHrs,
        timer_hours: dueHrs,
        hours_label: displayHrs != null ? `+${displayHrs}h` : '—',
        hold_resume_label: formatHoldResumeLabel(t, now),
        is_on_hold: !!t.is_on_hold,
        hold_count: holds.hold_count,
        resume_count: holds.resume_count,
        total_hold_seconds: holds.total_hold_seconds,
        total_hold_label: holds.total_hold_seconds > 0 ? fmtDuration(holds.total_hold_seconds) : '—',
        original_target_date: localDayString(originalPlanDate(t)),
        active_target_date: localDayString(activePlanDate(t)),
        reschedule_count: numOrNull(t.reschedule_count) || 0,
        awaiting_reaccept: awaitingReaccept,
        deadline_at: deadlineIso,
        deadline_label: deadlineLabel,
        submitted_at: submittedAt,
        submitted_label: submittedLabel,
        status,
        delay_label: delayLabel,
        delay_ms: delayMs,
        verify_started_at: verifyStartedAt,
        verify_started_label: verifyStartedLabel,
        verified_at: verifiedAt,
        verified_label: verifiedLabel,
        verify_due_label: verifyDueLabel,
        verify_status: verifyStatus,
        verify_delay_label: verifyDelayLabel,
      };
    })
    .sort((a, b) => (a.sr || 0) - (b.sr || 0));
}

function delayReportHtml(rows, { title = 'Task Delay Report', subtitle = '', showEmployee = false } = {}) {
  const headExtra = showEmployee ? '<th>Employee</th>' : '';
  const body = (rows || []).map((r, i) => {
    const bg = i % 2 === 0 ? '#F7F3EC' : '#FFFFFF';
    const statusColor =
      r.status === 'Delayed' ? '#C2410C' : r.status === 'On Time' ? '#15803D' : '#6B7280';
    const vStatusColor =
      r.verify_status === 'Delayed' || r.verify_status === 'Overdue'
        ? '#C2410C'
        : r.verify_status === 'On Time'
          ? '#15803D'
          : '#6B7280';
    const empCell = showEmployee ? `<td>${esc(r.employee)}</td>` : '';
    return `<tr style="background:${bg}">
      <td style="text-align:center">${r.sr ?? '—'}</td>
      ${empCell}
      <td>${esc(r.project)}</td>
      <td>${esc(r.assigned_label)}</td>
      <td>${esc(r.accepted_label)}</td>
      <td style="text-align:center">${esc(r.hours_label)}</td>
      <td style="font-size:11px">${esc(r.hold_resume_label)}</td>
      <td style="text-align:center">${esc(r.total_hold_label ?? '—')}</td>
      <td>${esc(r.deadline_label)}</td>
      <td>${esc(r.submitted_label)}</td>
      <td style="color:${statusColor};font-weight:700">${esc(r.status)}</td>
      <td>${esc(r.delay_label)}</td>
      <td>${esc(r.verify_started_label || '—')}</td>
      <td>${esc(r.verified_label || '—')}</td>
      <td style="color:${vStatusColor};font-weight:700">${esc(r.verify_status || '—')}</td>
      <td>${esc(r.verify_delay_label || '—')}</td>
    </tr>`;
  }).join('');

  const colCount = showEmployee ? 16 : 15;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;margin:24px}
  h1{text-align:center;font-size:22px;margin:0 0 6px}
  .sub{text-align:center;color:#666;font-size:12px;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1F2937;color:#fff;padding:8px 6px;text-align:left;font-weight:700}
  td{padding:7px 6px;border-bottom:1px solid #E5E7EB;vertical-align:top}
</style></head><body>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
  <table>
    <thead><tr>
      <th>SR</th>${headExtra}<th>Project</th><th>Timestamp (Assigned)</th>
      <th>Emp Acceptance Time</th><th>Hrs to Complete</th><th>Hold / Resume</th>
      <th>Total Hold</th><th>Due</th>
      <th>Sent for verification</th><th>Work status</th><th>Work delay</th>
      <th>Start Verification</th><th>Verified</th><th>Verify status</th><th>Verify delay</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="${colCount}" style="text-align:center;padding:20px;color:#888">No tasks</td></tr>`}</tbody>
  </table>
</body></html>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function delayReportTextSummary(rows, employeeName) {
  const delayed = rows.filter((r) => r.status === 'Delayed').length;
  const onTime = rows.filter((r) => r.status === 'On Time').length;
  const na = rows.filter((r) => r.status === 'N/A').length;
  const lines = [
    `Task Delay Report${employeeName ? ` — ${employeeName}` : ''}`,
    `Total ${rows.length} · Delayed ${delayed} · On Time ${onTime} · N/A ${na}`,
    '',
  ];
  rows.slice(0, 25).forEach((r) => {
    lines.push(
      `SR ${r.sr ?? '—'} | ${r.project} | ${r.status} | ${r.delay_label}`
    );
  });
  if (rows.length > 25) lines.push(`… +${rows.length - 25} more`);
  return lines.join('\n');
}

/**
 * Emp Report — same work timeline as delay report, with explicit
 * "Delayed by / Early by Xd Xh Xm" (office hours).
 */
function buildEmpReportRows(tasks, opts = {}) {
  return buildDelayReportRows(tasks, opts).map((r) => {
    let timingLabel = '—';
    const raw = String(r.delay_label || '').trim();
    if (r.status === 'Delayed') {
      const dur = raw.replace(/\s*early$/i, '').trim();
      timingLabel = dur && dur !== 'Within deadline' ? `Delayed by ${dur}` : 'Delayed';
    } else if (r.status === 'On Time') {
      const earlyMatch = raw.match(/^(.+?)\s+early$/i);
      if (earlyMatch) timingLabel = `Early by ${earlyMatch[1]}`;
      else if (/^on time$/i.test(raw) || /^within deadline$/i.test(raw)) timingLabel = 'On time';
      else timingLabel = raw || 'On time';
    } else {
      timingLabel = raw || 'N/A';
    }
    return {
      sr: r.sr,
      employee_id: r.employee_id,
      employee: r.employee,
      project: r.project,
      assigned_label: r.assigned_label,
      accepted_label: r.accepted_label,
      hours_label: r.hours_label,
      hold_resume_label: r.hold_resume_label,
      total_hold_label: r.total_hold_label,
      deadline_label: r.deadline_label,
      submitted_label: r.submitted_label,
      status: r.status,
      timing_label: timingLabel,
      delay_label: r.delay_label,
      reschedule_count: r.reschedule_count,
    };
  });
}

function empReportHtml(rows, { title = 'Emp Report', subtitle = '', showEmployee = true } = {}) {
  const headExtra = showEmployee ? '<th>Employee</th>' : '';
  const body = (rows || []).map((r, i) => {
    const bg = i % 2 === 0 ? '#F7F3EC' : '#FFFFFF';
    const statusColor =
      r.status === 'Delayed' ? '#C2410C' : r.status === 'On Time' ? '#15803D' : '#6B7280';
    const empCell = showEmployee ? `<td>${esc(r.employee)}</td>` : '';
    return `<tr style="background:${bg}">
      <td style="text-align:center">${r.sr ?? '—'}</td>
      ${empCell}
      <td>${esc(r.project)}</td>
      <td>${esc(r.assigned_label)}</td>
      <td>${esc(r.accepted_label)}</td>
      <td style="text-align:center">${esc(r.hours_label)}</td>
      <td style="font-size:11px">${esc(r.hold_resume_label)}</td>
      <td style="text-align:center">${esc(r.total_hold_label ?? '—')}</td>
      <td>${esc(r.deadline_label)}</td>
      <td>${esc(r.submitted_label || '—')}</td>
      <td style="color:${statusColor};font-weight:700">${esc(r.status)}</td>
      <td>${esc(r.timing_label)}</td>
    </tr>`;
  }).join('');
  const colCount = showEmployee ? 12 : 11;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;margin:24px}
  h1{text-align:center;font-size:22px;margin:0 0 6px}
  .sub{text-align:center;color:#666;font-size:12px;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1F2937;color:#fff;padding:8px 6px;text-align:left;font-weight:700}
  td{padding:7px 6px;border-bottom:1px solid #E5E7EB;vertical-align:top}
</style></head><body>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
  <table>
    <thead><tr>
      <th>SR</th>${headExtra}<th>Project</th><th>Timestamp (Assigned)</th>
      <th>Emp Acceptance Time</th><th>Hrs to Complete</th><th>Hold / Resume</th>
      <th>Total Hold</th><th>Due</th><th>Submitted</th><th>Status</th>
      <th>Early / Delay (d h m)</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="${colCount}" style="text-align:center;padding:20px;color:#888">No tasks</td></tr>`}</tbody>
  </table>
</body></html>`;
}

module.exports = {
  buildDelayReportRows,
  buildEmpReportRows,
  delayReportHtml,
  empReportHtml,
  delayReportTextSummary,
  fmtDelayStamp,
  formatDurationMs,
  formatWorkingDuration,
};
