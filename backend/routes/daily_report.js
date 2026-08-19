// ═══════════════════════════════════════════════════════════════════
// ─── DAILY REPORT MODULE (rewritten for mobile-friendliness) ──────
// ═══════════════════════════════════════════════════════════════════
//
// Why this was rewritten:
//   The old version rendered one big hardcoded <table> with a ton of
//   inline styles (style="..."), the same way on every screen size.
//   On mobile that table has 6+ columns and just overflows / gets cut
//   off — there was no responsive fallback at all.
//
//   The rest of the app already solves this with a consistent pattern:
//   render BOTH a table (.view-desktop-only) and a card list
//   (.view-mobile-only), and let CSS (in the stylesheet, see the
//   @media (max-width:768px) rule) decide which one is visible. This
//   rewrite brings Daily Report in line with that pattern, and moves
//   all the ad-hoc inline styling into real CSS classes (.drpt-*,
//   already partly defined in the stylesheet — see daily_report.css.patch
//   for the additions needed).
//
// Drop-in replacement: this whole block replaces everything from
// "// ─── DAILY REPORT MODULE" to the end of generateDailyReport /
// downloadDailyReportPdf in your existing script.js.

let _drptMode = 'single';

function loadDailyReport() {
  const dateInput      = document.getElementById('drptDate');
  const genBtn         = document.getElementById('drptGenBtn');
  const dlBtn          = document.getElementById('drptDownloadBtn');
  const body           = document.getElementById('drptBody');
  const subtitle       = document.getElementById('drptSubtitle');
  const modeSingle     = document.getElementById('drptModeSingle');
  const modeRange      = document.getElementById('drptModeRange');
  const singleControls = document.getElementById('drptSingleControls');
  const rangeControls  = document.getElementById('drptRangeControls');
  const fromInput      = document.getElementById('drptFrom');
  const toInput        = document.getElementById('drptTo');
  const rangeGenBtn    = document.getElementById('drptRangeGenBtn');

  // Default: yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (dateInput && !dateInput._drptInit) {
    dateInput.value = yStr;
    dateInput._drptInit = true;
  }
  // Default range: last 7 days → yesterday
  if (fromInput && !fromInput._drptInit) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    fromInput.value = weekAgo.toISOString().slice(0, 10);
    toInput.value   = yStr;
    fromInput._drptInit = true;
  }

  // ── Mode toggle ──────────────────────────────────────────────────
  // (classList-based now, instead of building style="" strings by hand)
  if (modeSingle && !modeSingle._drptModeBound) {
    modeSingle._drptModeBound = true;

    function activateSingle() {
      _drptMode = 'single';
      modeSingle.classList.add('drpt-mode-active');
      modeRange.classList.remove('drpt-mode-active');
      singleControls.style.display = 'flex';
      rangeControls.style.display  = 'none';
      if (body) body.innerHTML = '';
      if (dlBtn) dlBtn.style.display = 'none';
    }
    function activateRange() {
      _drptMode = 'range';
      modeRange.classList.add('drpt-mode-active');
      modeSingle.classList.remove('drpt-mode-active');
      singleControls.style.display = 'none';
      rangeControls.style.display  = 'flex';
      if (body) body.innerHTML = '';
      if (dlBtn) dlBtn.style.display = 'none';
    }

    modeSingle.addEventListener('click', activateSingle);
    modeRange.addEventListener('click', activateRange);
    activateSingle(); // ensure correct initial highlight state
  }

  // ── Single-date mode ─────────────────────────────────────────────
  if (genBtn && !genBtn._drptBound) {
    genBtn._drptBound = true;
    genBtn.addEventListener('click', () => generateDailyReport());
    dateInput.addEventListener('change', () => generateDailyReport());
    generateDailyReport(); // auto-generate on first load
  }

  // ── Range mode (PMS) ─────────────────────────────────────────────
  if (rangeGenBtn && !rangeGenBtn._drptBound) {
    rangeGenBtn._drptBound = true;
    rangeGenBtn.addEventListener('click', () => {
      if (!fromInput.value || !toInput.value) {
        showToast('Please select both From and To dates', 'error'); return;
      }
      if (fromInput.value > toInput.value) {
        showToast('"From" date cannot be after "To" date', 'error'); return;
      }
      generatePmsRangeReport(fromInput.value, toInput.value);
    });
  }

  // ── Download PDF ─────────────────────────────────────────────────
  if (dlBtn && !dlBtn._drptBound) {
    dlBtn._drptBound = true;
    dlBtn.addEventListener('click', () => downloadDailyReportPdf());
  }
}

// ─── shared helpers ───────────────────────────────────────────────────────
function _drptFmtDate(iso) {
  return iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
}

// Returns { label, className, cardClass } describing the delay/status cell
// for a single task — shared by the table renderer and the card renderer
// so the two views can never drift out of sync with each other.
function _drptDelayInfo(task, now) {
  const isDone   = task.status === 'Completed' || task.verification_status === 'Verified';
  const isVerify = task.verification_status === 'Pending Verification';
  const targetD  = task.target_date ? new Date(task.target_date) : null;
  if (targetD) targetD.setHours(0, 0, 0, 0);

  let daysLate = 0;
  if (!isDone && !isVerify && targetD && targetD < now) {
    daysLate = Math.floor((now - targetD) / 86400000);
  }

  if (isDone) {
    return { label: 'DONE', className: 'drpt-delay-done', cardClass: 'drpt-card-done' };
  }
  if (isVerify) {
    return { label: 'Under Verification', className: 'drpt-delay-verify', cardClass: 'drpt-card-verify' };
  }
  if (daysLate > 0) {
    return { label: `${daysLate} Day${daysLate > 1 ? 's' : ''} late`, className: 'drpt-delay-late', cardClass: 'drpt-card-late' };
  }
  return { label: '—', className: 'drpt-delay-ontime', cardClass: '' };
}

// ─── Single-date report ────────────────────────────────────────────────────
async function generateDailyReport() {
  const dateInput = document.getElementById('drptDate');
  const body      = document.getElementById('drptBody');
  const subtitle  = document.getElementById('drptSubtitle');
  const dlBtn     = document.getElementById('drptDownloadBtn');

  const reportDate = dateInput.value;
  if (!reportDate) return;

  const rDateEnd = new Date(reportDate); rDateEnd.setHours(23, 59, 59, 999);
  const now      = new Date();

  if (subtitle) subtitle.textContent = `PMS Report — ${_drptFmtDate(reportDate)}`;
  body.innerHTML = `<div class="empty-state">⏳ Generating report…</div>`;
  if (dlBtn) dlBtn.style.display = 'none';

  try {
    const allTasks = await api('/tasks/all');

    // All tasks whose target_date is on or before the selected date
    const tasks = allTasks.filter(t => {
      if (!t.target_date) return false;
      const d = new Date(t.target_date); d.setHours(0, 0, 0, 0);
      return d <= rDateEnd;
    });

    // Sort: target_date ascending, then by assignee name
    tasks.sort((a, b) => {
      const da = new Date(a.target_date), db = new Date(b.target_date);
      if (da - db !== 0) return da - db;
      return (a.assigned_to_user?.full_name ?? '').localeCompare(b.assigned_to_user?.full_name ?? '');
    });

    body.innerHTML = '';

    if (!tasks.length) {
      body.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>No tasks found for this date</div>`;
      return;
    }

    body.appendChild(renderDrptTasksDual(tasks, now));
    if (dlBtn) dlBtn.style.display = '';

  } catch (err) {
    body.innerHTML = `<div class="empty-state">Failed to generate report: ${escapeHtml(err.message)}</div>`;
  }
}

// ─── PMS range report ───────────────────────────────────────────────────────
async function generatePmsRangeReport(from, to) {
  const body     = document.getElementById('drptBody');
  const subtitle = document.getElementById('drptSubtitle');
  const dlBtn    = document.getElementById('drptDownloadBtn');

  const fromDate = new Date(from); fromDate.setHours(0, 0, 0, 0);
  const toDate   = new Date(to);   toDate.setHours(23, 59, 59, 999);
  const now      = new Date();

  if (subtitle) subtitle.textContent = `PMS Report: ${_drptFmtDate(from)} → ${_drptFmtDate(to)}`;

  body.innerHTML = `<div class="empty-state">⏳ Generating PMS report…</div>`;
  if (dlBtn) dlBtn.style.display = 'none';

  try {
    const allTasks = await api('/tasks/all');

    const rangeTasks = allTasks.filter(t => {
      if (!t.target_date) return false;
      const d = new Date(t.target_date); d.setHours(0, 0, 0, 0);
      return d >= fromDate && d <= toDate;
    });
    rangeTasks.sort((a, b) => new Date(a.target_date) - new Date(b.target_date));

    body.innerHTML = '';

    // ── Summary cards (already responsive via .drpt-summary-row in CSS) ──
    const doneTasks    = rangeTasks.filter(t => t.status === 'Completed' || t.verification_status === 'Verified');
    const overdueTasks = rangeTasks.filter(t => {
      if (t.status === 'Completed' || t.status === 'Rejected') return false;
      if (t.verification_status === 'Verified' || t.verification_status === 'Verification Rejected') return false;
      return t.target_date && new Date(t.target_date) < now;
    });
    const pendingTasks = rangeTasks.filter(t => t.status === 'Pending' || t.status === 'In Progress');
    const verifyTasks  = rangeTasks.filter(t => t.verification_status === 'Pending Verification');

    const summary = document.createElement('div');
    summary.className = 'drpt-summary-row';
    summary.innerHTML = `
      <div class="drpt-stat-card drpt-stat-done">
        <div class="drpt-stat-num">${doneTasks.length}</div>
        <div class="drpt-stat-label">✅ Completed</div>
      </div>
      <div class="drpt-stat-card drpt-stat-pending">
        <div class="drpt-stat-num">${pendingTasks.length}</div>
        <div class="drpt-stat-label">⏳ Pending / In Progress</div>
      </div>
      <div class="drpt-stat-card drpt-stat-overdue">
        <div class="drpt-stat-num">${overdueTasks.length}</div>
        <div class="drpt-stat-label">🔴 Overdue</div>
      </div>
      <div class="drpt-stat-card drpt-stat-verify">
        <div class="drpt-stat-num">${verifyTasks.length}</div>
        <div class="drpt-stat-label">🔎 Under Verification</div>
      </div>
    `;
    body.appendChild(summary);

    if (!rangeTasks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<span class="emoji">📭</span>No tasks with target date in this range`;
      body.appendChild(empty);
      return;
    }

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'drpt-section-title';
    sectionTitle.textContent = `📊 PMS Task Summary (${rangeTasks.length} tasks)`;
    body.appendChild(sectionTitle);

    body.appendChild(renderDrptTasksDual(rangeTasks, now));
    if (dlBtn) dlBtn.style.display = '';

  } catch (err) {
    body.innerHTML = `<div class="empty-state">Failed to generate PMS report: ${escapeHtml(err.message)}</div>`;
  }
}

// ─── shared dual renderer: table for desktop, cards for mobile ────────────
// Returns a single wrapper element containing BOTH views — CSS handles
// which one is actually visible at any given screen width, same as
// renderAllTasksTable + renderTaskList do elsewhere in the app.
function renderDrptTasksDual(tasks, now) {
  const wrap = document.createElement('div');

  // ── Desktop table ──
  const tableWrap = document.createElement('div');
  tableWrap.className = 'drpt-table-wrap view-desktop-only';

  const table = document.createElement('table');
  table.className = 'drpt-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:48px">Sr.no</th>
        <th style="width:110px">Date</th>
        <th>Task</th>
        <th style="width:150px">Assignee</th>
        <th style="width:140px">Delay</th>
        <th style="width:200px">Remarks</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');

  tasks.forEach((task, i) => {
    const delay = _drptDelayInfo(task, now);
    const tr = document.createElement('tr');

    const tdSr = document.createElement('td');
    tdSr.innerHTML = `<span class="sr-number">${i + 1}</span>`;

    const tdDate = document.createElement('td');
    tdDate.style.whiteSpace = 'nowrap';
    tdDate.textContent = _drptFmtDate(task.target_date);

    const tdTask = document.createElement('td');
    tdTask.innerHTML = `
      ${task.project?.name ? `<span class="drpt-task-project">${escapeHtml(task.project.name)}</span>` : ''}
      <div class="drpt-task-desc">${escapeHtml(task.description ?? '')}</div>
    `;

    const tdAssignee = document.createElement('td');
    tdAssignee.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong>`;

    const tdDelay = document.createElement('td');
    if (delay.label === 'Under Verification' && task.verifier?.full_name) {
      tdDelay.innerHTML = `<span class="${delay.className}">${delay.label}</span><div style="font-size:0.72rem;color:var(--muted)">${escapeHtml(task.verifier.full_name)}</div>`;
    } else {
      tdDelay.innerHTML = `<span class="${delay.className}">${delay.label}</span>`;
    }

    const tdRemarks = document.createElement('td');
    const remarkInput = document.createElement('input');
    remarkInput.type = 'text';
    remarkInput.className = 'drpt-remark-input';
    remarkInput.placeholder = 'Add remark…';
    tdRemarks.appendChild(remarkInput);

    tr.append(tdSr, tdDate, tdTask, tdAssignee, tdDelay, tdRemarks);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);

  // ── Mobile cards ──
  const cardList = document.createElement('div');
  cardList.className = 'drpt-card-list view-mobile-only';

  tasks.forEach((task, i) => {
    const delay = _drptDelayInfo(task, now);
    const card = document.createElement('div');
    card.className = `drpt-card ${delay.cardClass}`;

    card.innerHTML = `
      <div class="drpt-card-top">
        <div>
          ${task.project?.name ? `<div class="drpt-card-project">${escapeHtml(task.project.name)}</div>` : ''}
        </div>
        <span class="drpt-card-sr">#${i + 1}</span>
      </div>
      <div class="drpt-card-desc">${escapeHtml(task.description ?? '')}</div>
      <div class="drpt-card-meta">
        <span>📅 ${_drptFmtDate(task.target_date)}</span>
        <span>👤 <strong>${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong></span>
        <span class="${delay.className}">${delay.label}${delay.label === 'Under Verification' && task.verifier?.full_name ? ` · ${escapeHtml(task.verifier.full_name)}` : ''}</span>
      </div>
      <div class="drpt-card-remark">
        <input type="text" class="drpt-remark-input" placeholder="Add remark…" />
      </div>
    `;
    cardList.appendChild(card);
  });

  wrap.appendChild(cardList);
  return wrap;
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Pulls remark values out of whichever view is visible (table or cards)
// before building the print document, so remarks typed on mobile also
// make it into the PDF.
function downloadDailyReportPdf() {
  const dateInput  = document.getElementById('drptDate');
  const fromInput  = document.getElementById('drptFrom');
  const toInput    = document.getElementById('drptTo');
  const reportDate = _drptMode === 'range'
    ? `${fromInput?.value || ''}_to_${toInput?.value || ''}`
    : (dateInput?.value || 'report');
  const subtitle   = document.getElementById('drptSubtitle');

  // Always print from the table markup (most complete columns), but pull
  // remark text from whichever inputs the user actually typed into.
  const tableWrap = document.querySelector('#drptBody .drpt-table-wrap');
  const cardList  = document.querySelector('#drptBody .drpt-card-list');
  if (!tableWrap) {
    showToast('Generate a report first', 'error');
    return;
  }

  const tableRemarkInputs = [...tableWrap.querySelectorAll('.drpt-remark-input')];
  const cardRemarkInputs  = cardList ? [...cardList.querySelectorAll('.drpt-remark-input')] : [];
  tableRemarkInputs.forEach((inp, idx) => {
    const cardVal = cardRemarkInputs[idx]?.value?.trim();
    if (!inp.value.trim() && cardVal) inp.value = cardVal;
  });

  const summaryHtml = document.querySelector('#drptBody .drpt-summary-row')?.outerHTML || '';
  const sectionHtml = document.querySelector('#drptBody .drpt-section-title')?.outerHTML || '';
  const tablePrintHtml = tableWrap.outerHTML.replace(/class="drpt-remark-input"/g, 'style="border:none;width:100%;font-size:11px"');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Report – ${reportDate}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
        h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
        .sub { text-align:center; color:#555; margin-bottom: 20px; font-size:12px; }
        .drpt-summary-row { display:flex; gap:16px; margin-bottom:20px; }
        .drpt-stat-card { border:1px solid #ddd; border-radius:8px; padding:12px 20px; text-align:center; flex:1; }
        .drpt-stat-num { font-size:28px; font-weight:700; }
        .drpt-stat-done { border-color:#10b981; color:#10b981; }
        .drpt-stat-pending { border-color:#f59e0b; color:#f59e0b; }
        .drpt-stat-overdue { border-color:#ef4444; color:#ef4444; }
        .drpt-stat-verify { border-color:#6d28d9; color:#6d28d9; }
        .drpt-stat-label { font-size:11px; color:#555; margin-top:4px; }
        .drpt-section-title { font-weight:700; font-size:13px; text-transform:uppercase;
          letter-spacing:.05em; margin:20px 0 8px; padding-bottom:4px;
          border-bottom:2px solid #6d28d9; color:#6d28d9; }
        table { width:100%; border-collapse:collapse; margin-bottom:16px; }
        th { background:#1e1b4b; color:#fff; padding:7px 10px; text-align:left; font-size:11px; }
        td { padding:6px 10px; border-bottom:1px solid #e5e7eb; font-size:11px; vertical-align:top; }
        tr:nth-child(even) td { background:#f9fafb; }
        .drpt-delay-done   { color:#059669; font-weight:700; }
        .drpt-delay-verify { color:#6d28d9; font-weight:700; }
        .drpt-delay-late   { color:#b45309; font-weight:700; }
        .drpt-delay-ontime { color:#9ca3af; }
        @media print { body { margin:10px; } }
      </style>
    </head>
    <body>
      <h1>📋 DIP Projects — PMS Report</h1>
      <p class="sub">${subtitle?.textContent || reportDate}</p>
      ${summaryHtml}
      ${sectionHtml}
      ${tablePrintHtml}
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}
