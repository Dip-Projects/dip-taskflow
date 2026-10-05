/**
 * Dev helper: renders the employee "Due" cell for a few task states without a
 * browser, by lifting the pure display helpers out of mountTaskflowApp.js.
 * Run: node scripts/preview-due-cell.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'taskflow', 'mountTaskflowApp.js');

const NAMES = [
  'parseLocalDate', 'isRejectedTask', 'isClosedOrRejectedTask',
  'taskEventsOf', 'lastEventAt', 'needsReaccept',
  'originalPlanDate', 'activePlanDate', 'wasRescheduledTask', 'endOfPlanDay',
  'workTimerAnchor', 'workTimerBudgetHours', 'assignedHoursOf',
  'employeeAssignedDeadline', 'isAssignmentOverdueTask', 'employeeWorkDueDate',
  'employeeDueDate', 'overdueCalendarDays', 'fmtEmployeeTimerHtml',
  'formatHoursLabel', 'formatDurationShort', 'workingTimeLeftMs',
  'fmtDate', 'fmtDateOnly', 'escapeHtml', 'addWorkingHours',
  'elapsedWorkingHoursBetween', 'snapToWorkingMoment', 'atTime',
  'isVerificationOverdueTask', 'verificationWorkDueDate',
  'verificationOverdueWorkingHours',
];

/** Brace matcher that ignores braces inside strings, templates and comments. */
function endOfBlock(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i += 1;
      for (; i < src.length; i += 1) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === quote) break;
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          i = endOfBlock(src, i + 1);
        }
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return src.length - 1;
}

/** Skip the parameter list (which may itself contain `{}` destructuring). */
function bodyBraceIndex(src, parenIdx) {
  let depth = 0;
  let i = parenIdx;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') { depth -= 1; if (depth === 0) break; }
  }
  return src.indexOf('{', i);
}

function extract() {
  const src = fs.readFileSync(SRC, 'utf8');
  const found = [];
  // Module-level constants the lifted helpers close over.
  let out = '';
  const constStart = src.indexOf('\n  const OFFICE_HOURS = {');
  if (constStart >= 0) {
    out += `${src.slice(constStart, endOfBlock(src, src.indexOf('{', constStart + 20)) + 1)};\n`;
  }
  for (const arr of ['RESCHEDULE_ACTIONS', 'ACCEPT_ACTIONS']) {
    const at = src.indexOf(`\n  const ${arr} = [`);
    if (at >= 0) out += `${src.slice(at, src.indexOf('];', at) + 2)}\n`;
  }
  for (const name of NAMES) {
    const start = src.indexOf(`\n  function ${name}(`);
    if (start < 0) continue;
    const open = bodyBraceIndex(src, start + name.length + 12);
    out += `${src.slice(start, endOfBlock(src, open) + 1)}\n`;
    found.push(name);
  }
  const missing = NAMES.filter((n) => !found.includes(n));
  if (missing.length) console.error('note: not found —', missing.join(', '));
  const api = {};
  // eslint-disable-next-line no-new-func
  new Function('S', `${out.replace(/^ {2}/gm, '')}\n;Object.assign(S,{${found.join(',')}});`)(api);
  return api;
}

const ui = extract();
const flat = (html) => html.replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' ').replace(/^\|\s*/, '').trim();
const show = (label, task, now) => console.log(`${label}\n    ${flat(ui.fmtEmployeeTimerHtml(task, now))}\n`);

const base = {
  id: '1',
  assigned_at: '2026-09-02T09:33:00',
  hours_to_complete: 2,
  original_hours_to_complete: 2,
  target_date: '2026-09-05',
  original_target_date: '2026-09-05',
  status: 'Pending',
  priority: 'Medium',
};

console.log('=== assigned 2 Sep 09:33 | 2h | admin plan 5 Sep ===\n');
show('BEFORE ACCEPT (must NOT show 5 Sep):', base, new Date('2026-09-02T09:40:00'));

const accepted = { ...base, status: 'In Progress', accepted_at: '2026-09-02T11:00:00' };
show('AFTER ACCEPT 11:00:', accepted, new Date('2026-09-02T11:30:00'));
show('TIMER EXPIRED:', accepted, new Date('2026-09-02T14:30:00'));
show('ON HOLD:', { ...accepted, is_on_hold: true, held_at: '2026-09-02T12:00:00', hold_remaining_hours: 1 }, new Date('2026-09-02T14:00:00'));
show('RESUMED 15:00 (1h left):', { ...accepted, held_at: '2026-09-02T12:00:00', resumed_at: '2026-09-02T15:00:00', hold_remaining_hours: 1 }, new Date('2026-09-02T15:10:00'));

const rescheduled = {
  ...base,
  accepted_at: null,
  reaccept_required: true,
  reschedule_status: 'Approved',
  target_date: '2026-09-07',
  reschedule_approved_target_date: '2026-09-07',
};
show('RESCHEDULE APPROVED to 7 Sep:', rescheduled, new Date('2026-09-03T10:00:00'));
show('RESCHEDULED, never re-accepted, now 10 Sep:', rescheduled, new Date('2026-09-10T10:00:00'));
show('RE-ACCEPTED 7 Sep 10:00 (full 2h again):', { ...rescheduled, reaccept_required: false, accepted_at: '2026-09-07T10:00:00' }, new Date('2026-09-07T10:15:00'));

console.log('=== admin plan cell ===');
console.log(
  '  original:', ui.fmtDateOnly(ui.originalPlanDate(rescheduled)),
  '| active:', ui.fmtDateOnly(ui.activePlanDate(rescheduled)),
  '| moved:', ui.wasRescheduledTask(rescheduled)
);
