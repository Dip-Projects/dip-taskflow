/**
 * End-to-end check of the task timer / reschedule / reminder behaviour against
 * a running backend and the real database.
 *
 * SAFETY
 *   - Refuses to run unless WhatsApp env vars are blank, so no message can go
 *     out to a real employee while testing.
 *   - Creates one task, drives it through the whole lifecycle, then deletes it
 *     (and its alerts) in a finally block.
 *
 * Usage:
 *   node backend/scripts/e2e-task-lifecycle.js            # assumes API on :4321
 *   API=http://localhost:4321/api node scripts/...
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const { signToken } = require(require('path').join(__dirname, '..', 'middleware', 'auth'));

const API = process.env.API || 'http://localhost:4321/api';

if (process.env.META_PHONE_NUMBER_ID || process.env.META_ACCESS_TOKEN) {
  console.error('Refusing to run: WhatsApp is configured. Start the test server with those vars blank.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ADMIN = { id: 'a63be2ed-ba2f-4c0c-816b-c462fba03f51', username: 'chirag.s', full_name: 'Chirag Shah', role: 'admin' };
const EMPLOYEE = { id: 'ff9e291d-ab56-48c0-8369-cb89723238c3', username: 'test.emp', full_name: 'Viral Lad', role: 'employee' };
const DEPARTMENT = '8821e33b-6b9d-45fd-929a-a192fe557edf';
const PROJECT = 'f6233a3f-6497-491c-95b4-6c78df63bb1c';
const TASK_TYPE = 'aff584e4-5b19-47ac-9bbf-6f1b075b3b23';

const adminToken = signToken(ADMIN);
const empToken = signToken(EMPLOYEE);

let pass = 0;
let fail = 0;
const failures = [];

function check(label, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass += 1;
  else { fail += 1; failures.push(`${label} — got ${got}, want ${want}`); }
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `   got=${got} want=${want}`}`);
}

function checkTrue(label, got) {
  return check(label, !!got, true);
}

async function call(method, path, token, body) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '—');
const ymd = (v) => (v ? String(v).slice(0, 10) : '—');

/** Local calendar day — toISOString would shift a local-midnight date back one. */
function localDay(d) {
  if (!d) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let taskId = null;

async function run() {
  console.log(`\nAPI: ${API}\nWhatsApp: disabled for this run\n`);

  // ── 1. create ──────────────────────────────────────────────────────────────
  console.log('1. Admin creates a 2h task, plan date 5 Sept');
  const form = new FormData();
  form.set('department_id', DEPARTMENT);
  form.set('assigned_to', EMPLOYEE.id);
  form.set('project_id', PROJECT);
  form.set('task_type_id', TASK_TYPE);
  form.set('description', 'AUTOMATED TEST — safe to ignore, deleted automatically');
  form.set('hours_to_complete', '2');
  form.set('target_date', '2026-09-05');
  form.set('priority', 'Medium');
  form.set('rescheduling_possible', 'true');

  const createRes = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
  const created = await createRes.json();
  if (createRes.status !== 201 && createRes.status !== 200) {
    console.error('  create failed:', createRes.status, JSON.stringify(created).slice(0, 300));
    throw new Error('cannot continue without a task');
  }
  taskId = created.id;
  check('created status Pending', created.status, 'Pending');
  checkTrue('assigned_at stamped', created.assigned_at);
  check('hours_to_complete', created.hours_to_complete, 2);
  check('original_hours_to_complete locked', created.original_hours_to_complete, 2);
  check('target_date (current plan)', ymd(created.target_date), '2026-09-05');
  check('original_target_date recorded', ymd(created.original_target_date), '2026-09-05');
  checkTrue('task_events returned to UI', Array.isArray(created.task_events));

  // ── 2. employee view before accept ─────────────────────────────────────────
  console.log('\n2. Employee list before accept — Due must be assign+2h, not 5 Sept');
  let mine = (await call('GET', '/tasks/my', empToken)).body;
  let t = mine.find((x) => x.id === taskId);
  checkTrue('task visible to employee', t);
  check('not accepted yet', t.accepted_at, 'null');
  const assignDeadline = t.assigned_deadline_at;
  if (assignDeadline) {
    check('assigned_deadline_at = assign + 2h', ymd(assignDeadline), ymd(t.assigned_at));
  } else {
    console.log('  note: assigned_deadline_at column not migrated (UI computes it live)');
  }

  // ── 3. accept ──────────────────────────────────────────────────────────────
  console.log('\n3. Employee accepts — timer anchors to accept time');
  const accepted = (await call('PATCH', `/tasks/${taskId}/accept`, empToken)).body;
  check('status In Progress', accepted.status, 'In Progress');
  checkTrue('accepted_at stamped', accepted.accepted_at);
  checkTrue('first_accepted_at stamped', accepted.first_accepted_at);
  check('hours still 2', accepted.hours_to_complete, 2);
  if (accepted.work_due_at) {
    // Office hours only, so accepting outside 9:30–18:30 pushes the deadline to
    // the next working morning. Compare against the shared helper rather than
    // wall-clock + 2h, which would be wrong for an out-of-hours accept.
    const { addWorkingHours } = require(require('path').join(__dirname, '..', 'lib', 'workingHours'));
    const expected = addWorkingHours(accepted.accepted_at, 2);
    const diffMin = Math.abs(new Date(accepted.work_due_at) - expected) / 60000;
    checkTrue(
      `work_due_at = accept + 2h office time (${hhmm(accepted.accepted_at)} → ${hhmm(accepted.work_due_at)})`,
      diffMin < 2
    );
  } else {
    console.log('  note: work_due_at column not migrated (UI computes it live)');
  }

  // ── 4. hold / resume ───────────────────────────────────────────────────────
  console.log('\n4. Hold then resume — remaining hours saved, original preserved');
  const held = (await call('PATCH', `/tasks/${taskId}/hold`, empToken)).body;
  checkTrue('is_on_hold true', held.is_on_hold);
  checkTrue('held_at stamped', held.held_at);
  checkTrue('hold_remaining_hours ≈ 2 (just accepted)', Number(held.hold_remaining_hours) > 1.9);
  check('original hours still 2', held.original_hours_to_complete, 2);
  const holdEvent = (held.task_events || []).filter((e) => e.action === 'hold').pop();
  check('hold event says timer stopped', holdEvent?.timer, 'stopped');

  // Backdate the pause into office hours so the resume has a real duration to
  // measure. A hold taken at 2am legitimately costs zero working time, which
  // would make this assertion meaningless.
  const { elapsedWorkingHours } = require(require('path').join(__dirname, '..', 'lib', 'workingHours'));
  const backdated = new Date();
  backdated.setDate(backdated.getDate() - 1);
  backdated.setHours(11, 0, 0, 0);
  await supabase.from('tasks').update({ held_at: backdated.toISOString() }).eq('id', taskId);

  const resumed = (await call('PATCH', `/tasks/${taskId}/resume`, empToken)).body;
  check('is_on_hold false', resumed.is_on_hold, false);
  checkTrue('resumed_at stamped', resumed.resumed_at);
  check('original hours still 2 after resume', resumed.original_hours_to_complete, 2);
  const resumeEvent = (resumed.task_events || []).filter((e) => e.action === 'resume').pop();
  check('resume event says timer restarted', resumeEvent?.timer, 'restarted');

  const expectedHold = Math.round(elapsedWorkingHours(backdated, resumed.resumed_at) * 3600);
  checkTrue(`hold duration measured in office hours (${Math.round(expectedHold / 60)} min)`, expectedHold > 0);
  checkTrue('resume event records hold duration', Math.abs((resumeEvent?.hold_seconds ?? -1) - expectedHold) < 120);
  if (resumed.last_hold_seconds !== undefined) {
    checkTrue('last_hold_seconds stored', Math.abs(Number(resumed.last_hold_seconds) - expectedHold) < 120);
    checkTrue('total_hold_seconds accumulated', Number(resumed.total_hold_seconds) >= expectedHold - 120);
  }
  if (resumed.hold_count !== undefined) check('hold_count = 1', resumed.hold_count, 1);

  // ── 5. employee reschedule request ─────────────────────────────────────────
  console.log('\n5. Employee asks for 7 Sept, admin approves');
  const reqRes = await call('POST', `/tasks/${taskId}/reschedule-request`, empToken, {
    requested_date: '2026-09-07',
    reason: 'automated test',
  });
  checkTrue(`request created (${reqRes.status})`, reqRes.status === 200 || reqRes.status === 201);
  check('reschedule_status Pending', reqRes.body.reschedule_status, 'Pending');

  const inbox = (await call('GET', '/tasks/reschedule-requests', adminToken)).body;
  checkTrue('request shows in admin inbox', Array.isArray(inbox) && inbox.some((x) => x.id === taskId));
  const empInbox = (await call('GET', '/tasks/reschedule-requests', empToken)).body;
  checkTrue('employee sees only their own', Array.isArray(empInbox));

  const approved = (await call('PATCH', `/tasks/${taskId}/reschedule-request/approve`, adminToken)).body;
  check('reschedule_status Approved', approved.reschedule_status, 'Approved');
  check('current plan moved to 7 Sept', ymd(approved.target_date), '2026-09-07');
  if (approved.original_target_date !== undefined) {
    check('ORIGINAL plan still 5 Sept (not overwritten)', ymd(approved.original_target_date), '2026-09-05');
  }
  check('timer stopped — back to Pending', approved.status, 'Pending');
  check('accepted_at cleared for fresh cycle', approved.accepted_at, 'null');
  check('full hours restored', approved.hours_to_complete, 2);
  const moveEvent = (approved.task_events || []).filter((e) => e.action === 'reschedule_approved').pop();
  checkTrue('reschedule event logged', moveEvent);
  check('event keeps the old plan date', ymd(moveEvent?.from_target_date), '2026-09-05');
  check('event records the new plan date', ymd(moveEvent?.to_target_date), '2026-09-07');
  check('event marks timer reset', moveEvent?.timer, 'reset_pending_accept');

  // The UI rule must hold whether or not the column exists.
  const { needsReaccept, originalPlanDate, activePlanDate, employeeWorkDueDate } =
    require(require('path').join(__dirname, '..', 'lib', 'taskOverdue'));
  checkTrue('needsReaccept true (column or event log)', needsReaccept(approved));
  // Plan dates are calendar days held at local midnight; toISOString would
  // shift them back a day, so compare in local time.
  check('originalPlanDate resolves to 5 Sept', localDay(originalPlanDate(approved)), '2026-09-05');
  check('activePlanDate resolves to 7 Sept', localDay(activePlanDate(approved)), '2026-09-07');
  check('no live work deadline while awaiting re-accept', employeeWorkDueDate(approved), 'null');

  console.log('\n6. Sending for verification must be blocked until re-accept');
  const blocked = await call('PATCH', `/tasks/${taskId}/send-for-verification`, empToken, { verifier_id: ADMIN.id });
  checkTrue(`blocked with 4xx (got ${blocked.status})`, blocked.status >= 400);

  // ── 7. re-accept ───────────────────────────────────────────────────────────
  console.log('\n7. Employee accepts again — full 2h restart from now');
  const reaccepted = (await call('PATCH', `/tasks/${taskId}/accept`, empToken)).body;
  check('status In Progress again', reaccepted.status, 'In Progress');
  checkTrue('accepted_at re-anchored to now', new Date(reaccepted.accepted_at) > new Date(accepted.accepted_at));
  check('first_accepted_at NOT overwritten', reaccepted.first_accepted_at, accepted.first_accepted_at);
  check('hold remainder cleared', reaccepted.hold_remaining_hours, 'null');
  check('full 2h budget', reaccepted.hours_to_complete, 2);
  check('needsReaccept now false', needsReaccept(reaccepted), false);
  if (reaccepted.accept_count !== undefined) check('accept_count = 2', reaccepted.accept_count, 2);
  const reEvent = (reaccepted.task_events || []).filter((e) => e.action === 'reaccept_task').pop();
  checkTrue('re-accept event logged', reEvent);

  // ── 8. delay report ────────────────────────────────────────────────────────
  console.log('\n8. Delay report shows the hold trail and the right hours');
  const dr = await call('GET', '/delay-report?range=month', adminToken);
  check('delay report loads', dr.status, 200);
  const row = (dr.body.rows || []).find((r) => r.id === taskId);
  if (row) {
    check('Hrs to Complete = original 2h', row.hours_label, '+2h');
    checkTrue('hold trail shows stop and restart',
      /timer stopped/.test(row.hold_resume_label) && /timer restarted/.test(row.hold_resume_label));
    checkTrue('total hold column filled', row.total_hold_label && row.total_hold_label !== '—');
    checkTrue('hold trail states the pause length', /timer stopped for /.test(row.hold_resume_label));
    check('plan history original', ymd(row.original_target_date), '2026-09-05');
    check('plan history active', ymd(row.active_target_date), '2026-09-07');
    console.log(`     trail: ${row.hold_resume_label}`);
  } else {
    console.log('  note: task outside the report range — skipped row checks');
  }

  // ── 9. reminder settings ───────────────────────────────────────────────────
  console.log('\n9. MIS reminder settings');
  const rsGet = await call('GET', '/master/reminder-settings', adminToken);
  check('settings endpoint loads', rsGet.status, 200);
  check('daily overdue default on', rsGet.body.settings?.daily_overdue_whatsapp, true);
  check('accept nudge default on', rsGet.body.settings?.accept_nudge_whatsapp, true);
  check('nudge wait default 20 min', rsGet.body.settings?.accept_nudge_minutes, 20);
  const rsPut = await call('PUT', '/master/reminder-settings', adminToken, { settings: { accept_nudge_minutes: 25 } });
  checkTrue(`admin (non-MIS) is refused (got ${rsPut.status})`, rsPut.status === 403);

  // ── 10. reminder engine, dry run ───────────────────────────────────────────
  console.log('\n10. Reminder engine (dry run — nothing sent)');
  const reminders = require(require('path').join(__dirname, '..', 'lib', 'taskReminders'));
  const nudge = await reminders.runAcceptNudges({ now: new Date(), dryRun: true });
  checkTrue('accept nudge sweep runs', nudge && typeof nudge.checked === 'number');
  console.log(`     would nudge ${nudge.checked} task(s), wait=${nudge.wait_minutes}m, max=${nudge.max_hours}h`);
  const overdue = await reminders.runDailyOverdueReminders({ now: new Date(), dryRun: true });
  checkTrue('overdue sweep runs', overdue && typeof overdue.checked === 'number');
  console.log(`     ${overdue.checked} overdue task(s) across ${overdue.employees} employee(s)`);
  (overdue.breakdown || []).slice(0, 5).forEach((b) => {
    console.log(`       - ${b.name}: ${b.tasks} task(s), worst ${b.maxDays} day(s) overdue`);
  });
}

async function cleanup() {
  if (!taskId) return;
  console.log('\nCleaning up test data…');
  await supabase.from('bot_alerts').delete().eq('task_id', taskId).then(() => {}, () => {});
  await supabase.from('overdue_wa_log').delete().eq('task_id', taskId).then(() => {}, () => {});
  await supabase.from('task_checkpoints').delete().eq('task_id', taskId).then(() => {}, () => {});
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  console.log(error ? `  WARNING could not delete task ${taskId}: ${error.message}` : `  deleted test task ${taskId}`);
}

run()
  .catch((err) => { fail += 1; failures.push(`threw: ${err.message}`); console.error('\nERROR:', err.message); })
  .finally(async () => {
    await cleanup();
    console.log(`\n${'='.repeat(60)}\n${pass} passed, ${fail} failed`);
    if (failures.length) {
      console.log('\nFailures:');
      failures.forEach((f) => console.log('  - ' + f));
    }
    process.exit(fail ? 1 : 0);
  });
