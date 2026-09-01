/**
 * Adapted from backend/legacy/app.js for React (no iframe).
 * Call mountTaskflowApp() once after TaskflowDom is in the document.
 * Login UI is owned by React AuthContext.
 */
const API_BASE = '/api';

let _onLogout = null;
let _listenersBound = false;
let _enterApp = null;
let els = {};
let state = {
  token: null,
  user: null,
  master: { departments: [], projects: [], taskTypes: [], employees: [] },
  activeView: null,
  pendingTaskId: null,
  pendingVerifierId: null,
  pendingLeaveId: null
};

function collectEls() {
  return {
    loginScreen: document.getElementById('loginScreen'),
    appScreen: document.getElementById('appScreen'),
    loginForm: document.getElementById('loginForm'),
    loginError: document.getElementById('loginError'),
    loginBtn: document.getElementById('loginBtn'),
    togglePassword: document.getElementById('togglePassword'),
    passwordInput: document.getElementById('password'),
    userName: document.getElementById('userName'),
    userRoleTag: document.getElementById('userRoleTag'),
    logoutBtn: document.getElementById('logoutBtn'),
    menuToggle: document.getElementById('menuToggle'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    navList: document.getElementById('navList'),
    addTaskForm: document.getElementById('addTaskForm'),
    addTaskMsg: document.getElementById('addTaskMsg'),
    fDepartment: document.getElementById('f-department'),
    fEmployee: document.getElementById('f-employee'),
    fProject: document.getElementById('f-project'),
    fTaskType: document.getElementById('f-tasktype'),
    filterDepartment: document.getElementById('filter-department'),
    filterEmployee: document.getElementById('filter-employee'),
    filterStatus: document.getElementById('filter-status'),
    clearAllFilters: document.getElementById('clearAllFilters'),
    allTasksList: document.getElementById('allTasksList'),
    filterCreatedFrom: document.getElementById('filter-created-from'),
    filterCreatedTo: document.getElementById('filter-created-to'),
    dateRangeCount: document.getElementById('dateRangeCount'),
    myTasksList: document.getElementById('myTasksList'),
    myTasksTableBody: document.getElementById('myTasksTableBody'),
    employeesTableBody: document.getElementById('employeesTableBody'),
    employeesCards: document.getElementById('employeesCards'),
    openAddEmployee: document.getElementById('openAddEmployee'),
    employeeModal: document.getElementById('employeeModal'),
    employeeForm: document.getElementById('employeeForm'),
    employeeFormMsg: document.getElementById('employeeFormMsg'),
    closeEmployeeModal: document.getElementById('closeEmployeeModal'),
    cancelEmployeeModal: document.getElementById('cancelEmployeeModal'),
    empReportingHead: document.getElementById('emp-reporting-head'),
    empSite: document.getElementById('emp-site'),
    credsModal: document.getElementById('credsModal'),
    credsUsername: document.getElementById('credsUsername'),
    credsPassword: document.getElementById('credsPassword'),
    closeCredsModal: document.getElementById('closeCredsModal'),
    closeCredsModalBtn: document.getElementById('closeCredsModalBtn'),
    editEmployeeModal: document.getElementById('editEmployeeModal'),
    editEmployeeForm: document.getElementById('editEmployeeForm'),
    editEmployeeFormMsg: document.getElementById('editEmployeeFormMsg'),
    closeEditEmployeeModal: document.getElementById('closeEditEmployeeModal'),
    cancelEditEmployeeModal: document.getElementById('cancelEditEmployeeModal'),
    editEmpId: document.getElementById('edit-emp-id'),
    editEmpFullname: document.getElementById('edit-emp-fullname'),
    editEmpDepartment: document.getElementById('edit-emp-department'),
    editEmpDesignation: document.getElementById('edit-emp-designation'),
    editEmpRole: document.getElementById('edit-emp-role'),
    editEmpReportingHead: document.getElementById('edit-emp-reporting-head'),
    editEmpSite: document.getElementById('edit-emp-site'),
    editEmpStatusToggle: document.getElementById('edit-emp-status-toggle'),
    editEmpPassword: document.getElementById('edit-emp-password'),
    toggleEditPassword: document.getElementById('toggleEditPassword'),
    hierarchyTreeContainer: document.getElementById('hierarchyTreeContainer'),
    permissionsTableBody: document.getElementById('permissionsTableBody'),
    allTasksCards: document.getElementById('allTasksCards'),
    overdueTasksList: document.getElementById('overdueTasksList'),
    overdueTasksCards: document.getElementById('overdueTasksCards'),
    overdueExtendModal: document.getElementById('overdueExtendModal'),
    overdueExtendForm: document.getElementById('overdueExtendForm'),
    overdueExtendDate: document.getElementById('overdue-extend-date'),
    overdueExtendReason: document.getElementById('overdue-extend-reason'),
    overdueExtendFormMsg: document.getElementById('overdueExtendFormMsg'),
    closeOverdueExtendModal: document.getElementById('closeOverdueExtendModal'),
    cancelOverdueExtendModal: document.getElementById('cancelOverdueExtendModal'),
    overdueDrawerBackdrop: document.getElementById('overdueDrawerBackdrop'),
    closeOverdueDrawer: document.getElementById('closeOverdueDrawer'),
    overdueTabToday: document.getElementById('overdueTabToday'),
    overdueTabPending: document.getElementById('overdueTabPending'),
    overdueTabTodayCount: document.getElementById('overdueTabTodayCount'),
    overdueTabPendingCount: document.getElementById('overdueTabPendingCount'),
    overdueDrawerBody: document.getElementById('overdueDrawerBody'),
    overdueFilterEmployee: document.getElementById('overdue-filter-employee'),
    clearOverdueFilters: document.getElementById('clearOverdueFilters'),
    departmentsTableBody: document.getElementById('departmentsTableBody'),
    addDepartmentForm: document.getElementById('addDepartmentForm'),
    addDepartmentMsg: document.getElementById('addDepartmentMsg'),
    taskTypesTableBody: document.getElementById('taskTypesTableBody'),
    addTaskTypeForm: document.getElementById('addTaskTypeForm'),
    addTaskTypeMsg: document.getElementById('addTaskTypeMsg'),
    verificationsList: document.getElementById('verificationsList'),
    verificationsTableBody: document.getElementById('verificationsTableBody'),
    verifyModal: document.getElementById('verifyModal'),
    verifyForm: document.getElementById('verifyForm'),
    verifyFormMsg: document.getElementById('verifyFormMsg'),
    verifyPerson: document.getElementById('verify-person'),
    closeVerifyModal: document.getElementById('closeVerifyModal'),
    cancelVerifyModal: document.getElementById('cancelVerifyModal'),
    ticketsList: document.getElementById('ticketsList'),
    ticketsTableBody: document.getElementById('ticketsTableBody'),
    openRaiseTicket: document.getElementById('openRaiseTicket'),
    ticketModal: document.getElementById('ticketModal'),
    ticketForm: document.getElementById('ticketForm'),
    ticketFormMsg: document.getElementById('ticketFormMsg'),
    ticketDescription: document.getElementById('ticket-description'),
    closeTicketModal: document.getElementById('closeTicketModal'),
    cancelTicketModal: document.getElementById('cancelTicketModal'),
    myLeavesList: document.getElementById('myLeavesList'),
    myLeavesTableBody: document.getElementById('myLeavesTableBody'),
    openApplyLeave: document.getElementById('openApplyLeave'),
    leaveModal: document.getElementById('leaveModal'),
    leaveForm: document.getElementById('leaveForm'),
    leaveFormMsg: document.getElementById('leaveFormMsg'),
    leaveFrom: document.getElementById('leave-from'),
    leaveTo: document.getElementById('leave-to'),
    leaveHalfDay: document.getElementById('leave-halfday'),
    leaveReason: document.getElementById('leave-reason'),
    leaveBuddy: document.getElementById('leave-buddy'),
    closeLeaveModal: document.getElementById('closeLeaveModal'),
    cancelLeaveModal: document.getElementById('cancelLeaveModal'),
    leaveApprovalsList: document.getElementById('leaveApprovalsList'),
    leaveApprovalsTableBody: document.getElementById('leaveApprovalsTableBody'),
    buddyRequestsList: document.getElementById('buddyRequestsList'),
    buddyRequestsTableBody: document.getElementById('buddyRequestsTableBody'),
    leaveApprovalsStatusFilter: document.getElementById('leaveApprovalsStatusFilter'),
    rejectLeaveModal: document.getElementById('rejectLeaveModal'),
    rejectLeaveForm: document.getElementById('rejectLeaveForm'),
    rejectLeaveFormMsg: document.getElementById('rejectLeaveFormMsg'),
    rejectLeaveReason: document.getElementById('reject-leave-reason'),
    closeRejectLeaveModal: document.getElementById('closeRejectLeaveModal'),
    cancelRejectLeaveModal: document.getElementById('cancelRejectLeaveModal'),
    leaveCoverModal: document.getElementById('leaveCoverModal'),
    leaveCoverList: document.getElementById('leaveCoverList'),
    leaveCoverIntro: document.getElementById('leaveCoverIntro'),
    leaveCoverFormMsg: document.getElementById('leaveCoverFormMsg'),
    closeLeaveCoverModal: document.getElementById('closeLeaveCoverModal'),
    laterLeaveCoverModal: document.getElementById('laterLeaveCoverModal'),
    correctionsList: document.getElementById('correctionsList'),
    correctionsTableBody: document.getElementById('correctionsTableBody'),
    correctionModal: document.getElementById('correctionModal'),
    correctionForm: document.getElementById('correctionForm'),
    correctionFormMsg: document.getElementById('correctionFormMsg'),
    correctionNote: document.getElementById('correction-note'),
    closeCorrectionModal: document.getElementById('closeCorrectionModal'),
    cancelCorrectionModal: document.getElementById('cancelCorrectionModal'),
    corrStartRecord: document.getElementById('corrStartRecord'),
    corrStopRecord: document.getElementById('corrStopRecord'),
    corrRecordStatus: document.getElementById('corrRecordStatus'),
    corrVoicePlayback: document.getElementById('corrVoicePlayback'),
    resendVerifyModal: document.getElementById('resendVerifyModal'),
    resendVerifyForm: document.getElementById('resendVerifyForm'),
    resendVerifyFormMsg: document.getElementById('resendVerifyFormMsg'),
    resendVerifierName: document.getElementById('resendVerifierName'),
    resendFiles: document.getElementById('resend-files'),
    closeResendVerifyModal: document.getElementById('closeResendVerifyModal'),
    cancelResendVerifyModal: document.getElementById('cancelResendVerifyModal'),
    verifyFiles: document.getElementById('verify-files'),
    rescheduleModal: document.getElementById('rescheduleModal'),
    rescheduleForm: document.getElementById('rescheduleForm'),
    rescheduleFormMsg: document.getElementById('rescheduleFormMsg'),
    rescheduleDate: document.getElementById('reschedule-date'),
    rescheduleReason: document.getElementById('reschedule-reason'),
    closeRescheduleModal: document.getElementById('closeRescheduleModal'),
    cancelRescheduleModal: document.getElementById('cancelRescheduleModal'),
    reschedRequestModal: document.getElementById('reschedRequestModal'),
    reschedRequestForm: document.getElementById('reschedRequestForm'),
    reschedRequestFormMsg: document.getElementById('reschedRequestFormMsg'),
    reschedreqDate: document.getElementById('reschedreq-date'),
    reschedreqReason: document.getElementById('reschedreq-reason'),
    closeReschedRequestModal: document.getElementById('closeReschedRequestModal'),
    cancelReschedRequestModal: document.getElementById('cancelReschedRequestModal'),
    reassignModal: document.getElementById('reassignModal'),
    reassignForm: document.getElementById('reassignForm'),
    reassignFormMsg: document.getElementById('reassignFormMsg'),
    reassignEmployee: document.getElementById('reassign-employee'),
    closeReassignModal: document.getElementById('closeReassignModal'),
    cancelReassignModal: document.getElementById('cancelReassignModal'),
    sitesTableBody: document.getElementById('sitesTableBody'),
    openAddSite: document.getElementById('openAddSite'),
    siteModal: document.getElementById('siteModal'),
    siteForm: document.getElementById('siteForm'),
    siteFormMsg: document.getElementById('siteFormMsg'),
    closeSiteModal: document.getElementById('closeSiteModal'),
    cancelSiteModal: document.getElementById('cancelSiteModal'),
    siteTeamleader: document.getElementById('site-teamleader'),
    siteCoordinator: document.getElementById('site-coordinator'),
    siteIncharge: document.getElementById('site-incharge'),
    sitePc: document.getElementById('site-pc'),
    siteModalTitle: document.getElementById('siteModalTitle'),
    siteFormSubmit: document.getElementById('siteFormSubmit'),
    siteEditId: document.getElementById('site-edit-id'),
    clientsTableBody: document.getElementById('clientsTableBody'),
    openAddClient: document.getElementById('openAddClient'),
    clientModal: document.getElementById('clientModal'),
    clientForm: document.getElementById('clientForm'),
    clientFormMsg: document.getElementById('clientFormMsg'),
    closeClientModal: document.getElementById('closeClientModal'),
    cancelClientModal: document.getElementById('cancelClientModal'),
    clientModalTitle: document.getElementById('clientModalTitle'),
    clientFormSubmit: document.getElementById('clientFormSubmit'),
    clientEditId: document.getElementById('client-edit-id'),
    clientFullname: document.getElementById('client-fullname'),
    clientSite: document.getElementById('client-site'),
    clientHead: document.getElementById('client-head'),
    clientCoordinator: document.getElementById('client-coordinator'),
    clientPc: document.getElementById('client-pc'),
    clientCredsNote: document.getElementById('clientCredsNote'),
    toast: document.getElementById('toast')
  };
}


/**
 * @param {{ getToken?: () => string|null, getUser?: () => object|null, onLogout?: () => void }} [opts]
 */
export async function mountTaskflowApp(opts = {}) {
  const { getToken, getUser, onLogout } = opts;
  _onLogout = onLogout || null;
  state.token = (typeof getToken === 'function' ? getToken() : null) || localStorage.getItem('tf_token') || null;
  try {
    state.user = (typeof getUser === 'function' ? getUser() : null) || JSON.parse(localStorage.getItem('tf_user') || 'null');
  } catch {
    state.user = null;
  }

  // If React remounted the DOM (Strict Mode / HMR), old els are detached — rebind.
  if (_listenersBound && els.navList && els.navList.isConnected) {
    if (state.token && state.user && typeof _enterApp === 'function') await _enterApp();
    return;
  }
  _listenersBound = false;
  _enterApp = null;

  els = collectEls();
  if (!els.appScreen || !els.navList) {
    console.error('[mountTaskflowApp] TaskflowDom not in document yet', {
      appScreen: !!els.appScreen,
      navList: !!els.navList,
    });
    return;
  }

  const __tfReadyFns = [];

  
  /* els via collectEls() */
  
  /* state module-scoped */
  
  // ─── helpers ────────────────────────────────────────────────────────────────
  function showToast(message, type = '') {
    if (!els.toast) {
      console.log('[toast]', type, message);
      return;
    }
    els.toast.textContent = message;
    els.toast.className = `toast ${type}`;
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { els.toast.hidden = true; }, 3200);
  }

  function showCredsModal(username, password, { title, note } = {}) {
    const titleEl = document.getElementById('credsModalTitle');
    const noteEl = document.getElementById('credsModalNote');
    if (titleEl) titleEl.textContent = title || 'Login created ✅';
    if (noteEl) noteEl.textContent = note || "Share these login details — they won't be shown again.";
    els.credsUsername.textContent = username;
    els.credsPassword.textContent = password;
    els.credsModal.hidden = false;
  }

  function hideFormMsg(el) {
    if (el) el.hidden = true;
  }
  function showFormMsg(el, text) {
    if (!el) {
      showToast(text, 'error');
      return;
    }
    el.textContent = text;
    el.hidden = false;
  }
  
  async function api(path, { method = 'GET', body, isForm = false } = {}) {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (!isForm && body) headers['Content-Type'] = 'application/json';
    // const res = await fetch(`${API_BASE}${path}`, {
    //   method, headers,
    //   cache: 'no-store',
    //   body: isForm ? body : (body ? JSON.stringify(body) : undefined)
    // });
    // if (res.status === 401) { logout(); throw new Error('Session expired, please log in again'); }
    const res = await fetch(`${API_BASE}${path}`, {
      method, headers,
      cache: 'no-store',
      body: isForm ? body : (body ? JSON.stringify(body) : undefined)
    });
  
    // Sliding session: backend jab token expiry ke kareeb hota hai to naya
    // token bhej deta hai — usko silently swap kar do
    const newToken = res.headers.get('X-New-Token');
    if (newToken) {
      state.token = newToken;
      localStorage.setItem('tf_token', newToken);
    }
  
  //   if (res.status === 401) { logout(); throw new Error('Session expired, please log in again'); }
  //   const data = await res.json().catch(() => ({}));
  //   if (!res.ok) throw new Error(data.error || 'Something went wrong');
  //   return data;
  // }
  const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Login attempt ke liye backend ka asli message dikhao (e.g. "Invalid
      // username or password"), auto-logout na karo — abhi to login hi nahi hue.
      if (path === '/auth/login') {
        throw new Error(data.error || 'Invalid username or password');
      }
      logout();
      throw new Error('Session expired, please log in again');
    }
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }
  function fillSelect(select, items, { placeholder, valueKey = 'id', labelKey = 'name', extraOption } = {}) {
    if (!select) return;
    select.innerHTML = '';
    if (placeholder) {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = placeholder;
      select.appendChild(opt);
    }
    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item[valueKey]; opt.textContent = item[labelKey];
      select.appendChild(opt);
    });
    if (extraOption) {
      const opt = document.createElement('option');
      opt.value = extraOption.value; opt.textContent = extraOption.label;
      select.appendChild(opt);
    }
  }
  
  // JS parses a bare "YYYY-MM-DD" string (no time, no offset) as UTC midnight
  // per the ISO-8601 spec — but a full timestamp like "...T10:15:00" (no
  // timezone) is parsed as LOCAL time. target_date started life as a
  // date-only field, so every plain date silently shifted by the browser's
  // UTC offset once displayed (India = UTC+5:30, so midnight UTC → 5:30 AM
  // IST — that's where the mystery "5:30 AM" was coming from, and why a
  // date-only target_date and a reschedule's date+time target_date could
  // disagree by hours even though both were "the same day"). This parses
  // date-only strings as LOCAL midnight instead, so there's no shift.
  function parseLocalDate(iso) {
    if (!iso) return null;
    if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d); // local midnight — no UTC shift
    }
    return new Date(iso);
  }

  function isRejectedTask(t) {
    return String(t?.status || '').trim().toLowerCase() === 'rejected';
  }

  function isClosedOrRejectedTask(t) {
    const st = String(t?.status || '').trim().toLowerCase();
    const vs = String(t?.verification_status || '').trim().toLowerCase();
    if (st === 'completed' || st === 'rejected') return true;
    if (vs === 'verified' || vs === 'verification rejected') return true;
    return false;
  }

  const VERIFICATION_SLA_MS = 2 * 60 * 60 * 1000;

  function isVerificationOverdueTask(t, now = new Date()) {
    if (t?.verification_status !== 'Pending Verification') return false;
    if (!t?.verification_started_at) return false;
    const started = parseLocalDate(t.verification_started_at);
    if (!started || Number.isNaN(started.getTime())) return false;
    return (now - started) >= VERIFICATION_SLA_MS;
  }

  function isAssignmentOverdueTask(t, now = new Date()) {
    if (isClosedOrRejectedTask(t)) return false;
    if (t?.is_on_hold) return false;
    if (t?.verification_status === 'Pending Verification') return false;
    if (!t?.accepted_at) return false;
    const hours = Number(t.hours_to_complete);
    if (!hours || hours <= 0) return false;
    const due = addWorkingHours(t.accepted_at, hours, { fromNowIfToday: false });
    return now > due;
  }

  function isDelegatedOverdueTask(t, now = new Date()) {
    if (isClosedOrRejectedTask(t)) return false;
    return isVerificationOverdueTask(t, now) || isAssignmentOverdueTask(t, now);
  }

  function employeeWorkDueDate(task) {
    if (!task?.accepted_at) return null;
    const hours = Number(task.hours_to_complete);
    if (!hours || hours <= 0) return null;
    return addWorkingHours(task.accepted_at, hours, { fromNowIfToday: false });
  }

  function fmtOverdueDateCell(task, now = new Date()) {
    if (isVerificationOverdueTask(task, now)) {
      const started = parseLocalDate(task.verification_started_at);
      const hrsPast = Math.max(0, Math.floor((now - started) / 3600000) - 2);
      return `
        <div>Started verify: ${fmtDate(task.verification_started_at)}</div>
        <div style="color:#d33;font-size:0.8rem;font-weight:600">${hrsPast > 0 ? `${hrsPast}h past 2h verify limit 🔴` : 'Verify limit crossed 🔴'}</div>
      `;
    }
    const workDue = employeeWorkDueDate(task);
    if (workDue && isAssignmentOverdueTask(task, now)) {
      const hrsLate = Math.max(0, Math.floor((now - workDue) / 3600000));
      return `
        <div>Work due: ${fmtDate(workDue.toISOString())}</div>
        <div style="color:#d33;font-size:0.8rem;font-weight:600">${hrsLate > 0 ? `${hrsLate}h work overdue 🔴` : 'Work overdue today 🔴'}</div>
      `;
    }
    const daysOverdue = task.target_date
      ? Math.floor((now - parseLocalDate(task.target_date)) / 86400000)
      : 0;
    return `
      <div>${task.target_date ? fmtDateOnly(task.target_date) : '—'}</div>
      <div style="color:#d33;font-size:0.8rem;font-weight:600">${daysOverdue <= 0 ? 'Overdue today' : `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue 🔴`}</div>
    `;
  }
  
  function fmtDate(iso) {
    if (!iso) return '—';
    return parseLocalDate(iso).toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }
  function fmtDateOnly(iso) {
    if (!iso) return '—';
    return parseLocalDate(iso).toLocaleDateString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }
  function fmtSheetDateTime(iso) {
    if (!iso) return '—';
    const d = parseLocalDate(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  // Admin-facing deadline: ONLY the target date, no time. The employee-facing
  // calculated deadline (fmtCalculatedDeadline / fmtDueDateFromCreated below)
  // is the one that shows an actual time, since that's the real computed
  // due-by moment; the raw target_date has no meaningful time of its own.
  function fmtDeadlineDateOnlyWithHours(iso, hours) {
    const d = fmtDateOnly(iso);
    return hours != null ? `${d} · ${hours}h` : d;
  }
  
  // ── Office-hours-aware due date calculator ─────────────────────────────────
  // Office hours: 9:30 AM – 6:30 PM, Monday–Saturday (Sunday off), with a
  // 1-hour lunch break from 1:00 PM – 2:00 PM that doesn't count as work time.
  // Due date = task's target date/time + hours_to_complete of *working* time,
  // skipping nights, lunch, and Sundays.
  const OFFICE_HOURS = {
    startH: 9, startM: 30,
    endH: 18, endM: 30,
    lunchStartH: 13, lunchStartM: 0,
    lunchEndH: 14, lunchEndM: 0
  };
  
  function atTime(date, h, m) {
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  }
  
  // Moves a moment forward to the next valid working instant: not on a Sunday,
  // not before opening, not after closing, and not during lunch.
  function snapToWorkingMoment(date) {
    let d = new Date(date);
    for (let guard = 0; guard < 30; guard++) { // guard against any edge-case infinite loop
      if (d.getDay() === 0) { // Sunday — jump to Monday 9:30
        d.setDate(d.getDate() + 1);
        d = atTime(d, OFFICE_HOURS.startH, OFFICE_HOURS.startM);
        continue;
      }
      const dayStart = atTime(d, OFFICE_HOURS.startH, OFFICE_HOURS.startM);
      const dayEnd = atTime(d, OFFICE_HOURS.endH, OFFICE_HOURS.endM);
      const lunchStart = atTime(d, OFFICE_HOURS.lunchStartH, OFFICE_HOURS.lunchStartM);
      const lunchEnd = atTime(d, OFFICE_HOURS.lunchEndH, OFFICE_HOURS.lunchEndM);
  
      if (d < dayStart) { d = dayStart; continue; }
      if (d >= dayEnd) {
        d.setDate(d.getDate() + 1);
        d = atTime(d, OFFICE_HOURS.startH, OFFICE_HOURS.startM);
        continue;
      }
      if (d >= lunchStart && d < lunchEnd) { d = new Date(lunchEnd); continue; }
      return d; // valid working instant
    }
    return d;
  }
  
  // Adds `hours` of working time (office hours, minus lunch, Mon–Sat only) to
  // a starting datetime and returns the resulting Date.
  // function addWorkingHours(startDate, hours) {
  //   let remainingMs = (Number(hours) || 0) * 3600000;
  //   let current = snapToWorkingMoment(parseLocalDate(startDate));
  //   if (remainingMs <= 0) return current;
  function addWorkingHours(startDate, hours, { fromNowIfToday = true } = {}) {
    let remainingMs = (Number(hours) || 0) * 3600000;
    let current = snapToWorkingMoment(parseLocalDate(startDate));
  
    // For a target date of today, start from "now" so the preview is not already
    // in the past. Employee due dates pass fromNowIfToday:false so they stay
    // anchored to the real assign/create time.
    if (fromNowIfToday) {
    const now = snapToWorkingMoment(new Date());
    const targetDay = parseLocalDate(startDate);
    const isSameCalendarDay = targetDay.getFullYear() === new Date().getFullYear()
      && targetDay.getMonth() === new Date().getMonth()
      && targetDay.getDate() === new Date().getDate();
    if (isSameCalendarDay && now > current) {
      current = now;
      }
    }
  
    if (remainingMs <= 0) return current;
  
    for (let guard = 0; guard < 1000 && remainingMs > 0; guard++) {
      const dayEnd = atTime(current, OFFICE_HOURS.endH, OFFICE_HOURS.endM);
      const lunchStart = atTime(current, OFFICE_HOURS.lunchStartH, OFFICE_HOURS.lunchStartM);
      const segmentEnd = current < lunchStart ? lunchStart : dayEnd;
      const availableMs = segmentEnd - current;
  
      if (remainingMs <= availableMs) {
        current = new Date(current.getTime() + remainingMs);
        remainingMs = 0;
      } else {
        remainingMs -= availableMs;
        current = snapToWorkingMoment(segmentEnd);
      }
    }
    return current;
  }

  /** Working hours elapsed between two instants (office hours, minus lunch, Sun off). */
  function elapsedWorkingHoursBetween(startDate, endDate) {
    const start = snapToWorkingMoment(parseLocalDate(startDate));
    const end = snapToWorkingMoment(new Date(endDate));
    if (!start || !end || end <= start) return 0;
    let totalMs = 0;
    let current = new Date(start);
    for (let guard = 0; guard < 1000 && current < end; guard++) {
      const dayEnd = atTime(current, OFFICE_HOURS.endH, OFFICE_HOURS.endM);
      const lunchStart = atTime(current, OFFICE_HOURS.lunchStartH, OFFICE_HOURS.lunchStartM);
      const segmentEnd = current < lunchStart ? lunchStart : dayEnd;
      const effectiveEnd = end < segmentEnd ? end : segmentEnd;
      if (effectiveEnd > current) totalMs += effectiveEnd - current;
      if (end <= segmentEnd) break;
      current = snapToWorkingMoment(segmentEnd);
    }
    return totalMs / 3600000;
  }

  function formatDurationShort(ms) {
    if (!ms || ms <= 0) return '~0m';
    const totalMin = Math.ceil(ms / 60000);
    if (totalMin < 60) return `~${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
  }

  function formatHoursLabel(h) {
    const n = Number(h);
    if (!n || Number.isNaN(n)) return '—';
    return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
  }

  /** Remaining working-time budget until due (excludes nights, lunch, Sunday). */
  function workingTimeLeftMs(from, due) {
    if (!due || !from) return 0;
    const hours = elapsedWorkingHoursBetween(from, due);
    return Math.max(0, hours * 3600000);
  }

  /** Employee My Tasks: due line + live time-left / hold / overdue (HTML). */
  function fmtEmployeeTimerHtml(task, now = new Date()) {
    if (task.is_on_hold) {
      const rem = task.hold_remaining_hours ?? task.hours_to_complete;
      return `
        <div class="task-timer-hold">⏸ Timer paused</div>
        <div class="task-timer-sub">${formatHoursLabel(rem)} saved — tap Resume to continue</div>
      `;
    }
    if (!task.accepted_at) {
      return `<div class="task-timer-wait">Accept task to start timer</div>`;
    }
    if (task.verification_status === 'Pending Verification') {
      return `
        <div class="task-timer-due">Sent for verification</div>
        <div class="task-timer-sub">Waiting on ${escapeHtml(task.verifier?.full_name ?? 'verifier')}</div>
      `;
    }
    const hours = Number(task.hours_to_complete);
    if (!hours || hours <= 0) {
      return `<div class="task-timer-due">Accepted ${fmtDate(task.accepted_at)}</div>`;
    }
    const due = employeeWorkDueDate(task);
    if (!due) return `<div class="task-timer-wait">Accept task to start timer</div>`;

    if (isAssignmentOverdueTask(task, now)) {
      const overdueMs = workingTimeLeftMs(due, now);
      return `
        <div class="task-timer-due">Due ${fmtDate(due.toISOString())}</div>
        <div class="task-timer-overdue">🔴 Overdue by ${formatDurationShort(overdueMs)}</div>
      `;
    }

    const msLeft = workingTimeLeftMs(now, due);
    const urgent = msLeft < 30 * 60 * 1000;
    return `
      <div class="task-timer-due">Due ${fmtDate(due.toISOString())}</div>
      <div class="task-timer-left${urgent ? ' task-timer-urgent' : ''}">⏱ ${formatDurationShort(msLeft)} left</div>
    `;
  }

  // Employee due date plain text (fallback)
  function fmtDueDateFromCreated(task) {
    if (task.is_on_hold) {
      return `⏸ On hold · ${formatHoursLabel(task.hold_remaining_hours ?? task.hours_to_complete)} saved`;
    }
    if (!task.accepted_at) return 'Accept task to start timer';
    if (task.hours_to_complete == null) return fmtDate(task.accepted_at);
    const due = addWorkingHours(task.accepted_at, task.hours_to_complete, { fromNowIfToday: false });
    return `${fmtDate(due.toISOString())} · ${task.hours_to_complete}h`;
  }

  let myTasksTimerCache = [];

  function refreshEmployeeTimerDisplays() {
    const now = new Date();
    document.querySelectorAll('[data-task-timer-id]').forEach((el) => {
      const id = el.dataset.taskTimerId;
      const task = myTasksTimerCache.find((t) => t.id === id);
      if (task) el.innerHTML = fmtEmployeeTimerHtml(task, now);
    });
    document.querySelectorAll('[data-task-timer-card-id]').forEach((el) => {
      const id = el.dataset.taskTimerCardId;
      const task = myTasksTimerCache.find((t) => t.id === id);
      if (task) el.innerHTML = fmtEmployeeTimerHtml(task, now);
    });
  }
  
  function fmtCalculatedDeadline(targetDateIso, hours) {
    if (!targetDateIso) return '—';
    const due = addWorkingHours(targetDateIso, hours);
    const d = fmtDate(due.toISOString());
    return hours != null ? `${d} · ${hours}h` : d;
  }
  
  function toDatetimeLocalValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function datetimeLocalToIso(value) {
    if (!value) return '';
    const [date, time] = String(value).split('T');
    if (!date || !time) return '';
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi, se] = time.split(':').map(Number);
    return new Date(y, mo - 1, d, h, mi || 0, se || 0).toISOString();
  }
  function syncDueActionFields(prefix) {
    const action = document.getElementById(`${prefix}-due-action`)?.value || 'keep';
    const extraWrap = document.getElementById(`${prefix}ExtraWrap`);
    const dueWrap = document.getElementById(`${prefix}NewDueWrap`);
    const unit = document.getElementById(`${prefix}-extra-unit`);
    if (extraWrap) extraWrap.hidden = action !== 'hours' && action !== 'days';
    if (dueWrap) dueWrap.hidden = action !== 'new';
    if (unit) unit.value = action === 'hours' || action === 'days' ? action : '';
  }
  function fillDuePrompt(prefix, task) {
    const label = document.getElementById(`${prefix}CurrentDue`);
    const due = document.getElementById(`${prefix}-new-due`);
    const action = document.getElementById(`${prefix}-due-action`);
    const amount = document.getElementById(`${prefix}-extra-amount`);
    if (label) {
      label.innerHTML = task?.target_date
        ? `This was your target date: <strong>${escapeHtml(fmtDate(task.target_date))}</strong>`
        : 'This task has no target date yet.';
    }
    if (action) action.value = 'keep';
    if (amount) amount.value = '';
    if (due) due.value = toDatetimeLocalValue(task?.target_date);
    syncDueActionFields(prefix);
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  
  // Builds the "Project: / Task Type: / Details: [/ Assigned to:]" block used
  // in the Task Details column of both the All Tasks and My Tasks tables.
  function buildTaskDetailsHtml(task, { showAssignee = false } = {}) {
    const desc = task.description ?? '';
    const shortDesc = desc.length > 100 ? desc.slice(0, 100) + '…' : desc;
    let html = `
      <div class="task-detail-line"><span class="task-detail-label">Project:</span> ${escapeHtml(task.project?.name ?? '—')}</div>
      <div class="task-detail-line"><span class="task-detail-label">Task Type:</span> ${escapeHtml(task.task_type?.name ?? '—')}</div>
      <div class="task-detail-line"><span class="task-detail-label">Details:</span> ${escapeHtml(shortDesc)}</div>
    `;
    if (showAssignee) {
      html += `<div class="task-detail-line"><span class="task-detail-label">Assigned to:</span> ${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</div>`;
    }
    return html;
  }
  
  // ─── auth (login handled by React AuthContext) ────────────────────────────────
  function logout() {
    state.token = null; state.user = null;
    localStorage.removeItem('tf_token'); localStorage.removeItem('tf_user');
    if (window._badgeInterval) clearInterval(window._badgeInterval);
    if (typeof _onLogout === 'function') _onLogout();
  }
  function bindAuthControls() {
    if (els.logoutBtn) els.logoutBtn?.addEventListener('click', logout);
  }
  bindAuthControls();

  // ─── sidebar toggle ─────────────────────────────────────────────────────────
  function isMobileNav() {
    return window.matchMedia('(max-width: 768px)').matches;
  }
  function closeSidebar() {
    els.sidebar?.classList.remove('open');
    if (els.sidebarOverlay) {
      els.sidebarOverlay.hidden = true;
      els.sidebarOverlay.setAttribute('hidden', '');
    }
    document.body.classList.remove('sidebar-open');
  }
  function openSidebar() {
    els.sidebar?.classList.add('open');
    // Overlay is visual-only on mobile; close only via ☰ (menuToggle).
    if (els.sidebarOverlay) {
      if (isMobileNav()) {
        els.sidebarOverlay.hidden = false;
        els.sidebarOverlay.removeAttribute('hidden');
      } else {
        els.sidebarOverlay.hidden = true;
        els.sidebarOverlay.setAttribute('hidden', '');
      }
    }
    document.body.classList.add('sidebar-open');
  }
  if (els.menuToggle) {
    els.menuToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (els.sidebar?.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }
  // Do not close on overlay / outside / main clicks — only ☰ toggles.
  window.addEventListener('resize', () => {
    if (els.sidebar?.classList.contains('open')) openSidebar();
  });
  
  // ─── app shell ───────────────────────────────────────────────────────────────
  async function enterApp() {
    if (els.appScreen) els.appScreen.hidden = false;
    if (els.userName) els.userName.textContent = state.user.full_name;
    if (els.userRoleTag) els.userRoleTag.textContent = state.user.is_mis_executive ? 'MIS executive' : state.user.role;
    try {
      const vis = await api('/master/nav-visibility');
      state.navVis = vis.map || {};
      state.navModules = vis.modules || [];
    } catch {
      state.navVis = {};
    }
    buildNav();
    setupTopbarQuick();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (_) {}
    // Desktop: sidebar open by default; mobile: closed
    if (isMobileNav()) closeSidebar();
    else openSidebar();
    if (state.user.role === 'admin') {
      await loadMasterData(); switchView('add');
    } else {
      switchView('my');
    }
    // Refresh badge counts now and every 15s
    refreshNavBadges();
    if (window._badgeInterval) clearInterval(window._badgeInterval);
    window._badgeInterval = setInterval(refreshNavBadges, 15000);
    if (window._timerInterval) clearInterval(window._timerInterval);
    window._timerInterval = setInterval(() => {
      if (state.activeView === 'my') refreshEmployeeTimerDisplays();
    }, 60000);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (_) {}
    // Head/admin: unresolved leave covers (buddy declined) — popup until resolved
    checkLeaveCoverAlerts();
  }
  
  function visOk(key) {
    const map = state.navVis || {};
    const row = map[key];
    if (!row) return true;
    const role = (state.user?.role || '').toLowerCase();
    const deptDesig = `${state.user?.department || ''} ${state.user?.designation || ''}`.toLowerCase();
    const who = role === 'admin' ? 'admin' : (state.user?.is_mis_executive || /\bmis\b/.test(deptDesig)) ? 'mis' : 'employee';
    return row[who] !== false;
  }
  
  function buildNav() {
    const isAdmin = state.user.role === 'admin';
    const isMis = !isAdmin && (!!state.user.is_mis_executive || /\bmis\b/i.test(`${state.user.department || ''} ${state.user.designation || ''}`));
    const canAddSite = isAdmin || !!state.user.can_add_site;
    const canAddEmployee = isAdmin || !!state.user.can_add_employee;
    const canResolveTickets = isAdmin || !!state.user.can_resolve_tickets;
  
    const taskItems = [];
    if (visOk('add') && isAdmin) taskItems.push({ key:'add', label:'➕ Add new task' });
    if (visOk('all') && isAdmin) taskItems.push({ key:'all', label:'📋 All delegated tasks' });
    if (visOk('overdue') && isAdmin) taskItems.push({ key:'overdue', label:'⏰ Overdue tasks' });
    if (visOk('my')) taskItems.push({ key:'my', label:'✅ My tasks' });
    if (visOk('recurring')) taskItems.push({ key: 'recurring', label: isAdmin ? '🔁 Recurring tasks' : '🔁 My recurring tasks' });
  
    els.navList.innerHTML = '';
    if (taskItems.length) {
      appendCollapsibleNav(
        'Tasks',
        taskItems.map((t) => makeNavButton(t.key, t.label)),
        { collapsed: true, sectionId: 'tasks' }
      );
    }
  
    if (visOk('verifications') && (isAdmin || state.user.can_verify || isMis)) {
      appendCollapsibleNav(
        'Verification',
        [makeNavButton('verifications', '🔎 Verification requests')],
        { collapsed: true, sectionId: 'verification' }
      );
    }
  
    if (visOk('tickets')) {
      appendCollapsibleNav(
        isMis ? 'MIS — Ticket Tracking' : 'Support',
        [makeNavButton('tickets-open', '🟠 Open Tickets'), makeNavButton('tickets-resolved', '✅ Resolved Tickets')],
        { collapsed: true, sectionId: 'support' }
      );
    }

    if (!isAdmin && visOk('corrections')) {
      appendCollapsibleNav(
        'Corrections',
        [makeNavButton('corrections', '↩ Corrections'), makeNavButton('updations', '📝 Updations')],
        { collapsed: true, sectionId: 'corrections' }
      );
    }

    if (visOk('reschedule-requests') !== false) {
      appendCollapsibleNav(
        'Reschedule',
        [makeNavButton('reschedule-requests', '🗓️ Reschedule requests')],
        { collapsed: true, sectionId: 'reschedule' }
      );
    }
  
    const showAdminBlock = visOk('employees') && (isAdmin || canAddEmployee)
      || visOk('sites') && (isAdmin || canAddSite)
      || visOk('clients') && isAdmin
      || visOk('hierarchy') && isAdmin
      || visOk('project-mgmt') && isAdmin
      || visOk('masterdata') && isAdmin
      || visOk('permissions') && isAdmin
      || visOk('daily-report') && (isAdmin || isMis)
      || visOk('mis-report') && (isAdmin || isMis)
      || visOk('time-dashboard') && (isAdmin || isMis)
      || visOk('fms') && (isAdmin || isMis);

    if (showAdminBlock) {
      const adminBtns = [];
      if (visOk('employees') && (isAdmin || canAddEmployee)) adminBtns.push(makeNavButton('employees', '👥 Manage employees'));
      if (visOk('hierarchy') && isAdmin) {
        adminBtns.push(makeNavButton('hierarchy', '🌳 Org Hierarchy'));
        if (visOk('project-mgmt')) adminBtns.push(makeNavButton('project-mgmt', '🗂️ Project management'));
      }
      if (visOk('sites') && (isAdmin || canAddSite)) adminBtns.push(makeNavButton('sites', '🏗️ Manage sites'));
      if (visOk('clients') && isAdmin) adminBtns.push(makeNavButton('clients', '👤 Manage clients'));
      if (visOk('masterdata') && isAdmin) adminBtns.push(makeNavButton('masterdata', '🗂️ Departments & task types'));
      if (visOk('permissions') && isAdmin) adminBtns.push(makeNavButton('permissions', '🔐 Permissions'));
      if (visOk('daily-report') && (isAdmin || isMis)) adminBtns.push(makeNavButton('daily-report', '📋 Daily Report'));
      if (visOk('mis-report') && (isAdmin || isMis)) adminBtns.push(makeNavButton('mis-report', '📊 MIS Report'));
      if (visOk('time-dashboard') && (isAdmin || isMis)) adminBtns.push(makeNavButton('time-dashboard', '⏱ Time dashboard'));
      if (visOk('fms') && (isAdmin || isMis)) adminBtns.push(makeNavButton('fms', '📑 FMS tracker'));
      appendCollapsibleNav(
        isMis && !isAdmin ? 'MIS' : 'Administration',
        adminBtns,
        { collapsed: true, sectionId: 'administration' }
      );
    }

    if (isMis && state.user?.role !== 'admin') {
      appendCollapsibleNav(
        'MIS Support',
        [makeNavButton('visibility', '👁 Who sees what')],
        { collapsed: true, sectionId: 'mis-support' }
      );
    }

    if (visOk('drawings') && isAdmin) {
      appendCollapsibleNav(
        'Drawings',
        [makeNavButton('drawings-add', '➕ Add Drawing'), makeNavButton('drawings-all', '📐 All Drawings')],
        { collapsed: true, sectionId: 'drawings' }
      );
    }

    if (visOk('monthly-report')) {
      appendCollapsibleNav(
        'Reports',
        [makeNavButton('monthly-report', '📁 Monthly Report')],
        { collapsed: true, sectionId: 'reports' }
      );
    }

    const leaveBtns = [];
    if (visOk('applyleave')) leaveBtns.push(makeNavButton('applyleave', '🌴 Apply Leave'));
    if (visOk('buddyrequests')) leaveBtns.push(makeNavButton('buddyrequests', '🤝 Buddy requests'));
    if (visOk('leaveapprovals') && isAdmin) leaveBtns.push(makeNavButton('leaveapprovals', '🗒️ Leave Approvals'));
    if (leaveBtns.length) {
      appendCollapsibleNav('Leave', leaveBtns, { collapsed: true, sectionId: 'leave' });
    }
  }
  
  const NAV_SECTION_BY_VIEW = {
    add: 'tasks', all: 'tasks', overdue: 'tasks', my: 'tasks', recurring: 'tasks',
    verifications: 'verification',
    'reschedule-requests': 'reschedule',
    employees: 'administration', hierarchy: 'administration', 'project-mgmt': 'administration',
    sites: 'administration', clients: 'administration', masterdata: 'administration', permissions: 'administration',
    'daily-report': 'administration', 'mis-report': 'administration',
    'time-dashboard': 'administration', fms: 'administration',
    'monthly-report': 'reports',
    visibility: 'mis-support',
    applyleave: 'leave', buddyrequests: 'leave', leaveapprovals: 'leave',
    corrections: 'corrections', updations: 'corrections',
    'tickets-open': 'support', 'tickets-resolved': 'support', tickets: 'support',
    'drawings-add': 'drawings', 'drawings-all': 'drawings',
  };

  function appendCollapsibleNav(title, buttons, { collapsed = true, sectionId } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'nav-group' + (collapsed ? ' is-collapsed' : '');
    wrap.dataset.section = sectionId || title.toLowerCase();
    const hdr = document.createElement('button');
    hdr.type = 'button';
    hdr.className = 'nav-section-toggle';
    hdr.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    hdr.innerHTML = `<span class="nav-section-toggle-label">${title}</span><span class="nav-section-chev" aria-hidden="true"></span>`;
    const kids = document.createElement('div');
    kids.className = 'nav-group-kids';
    if (collapsed) kids.hidden = true;
    buttons.forEach((b) => kids.appendChild(b));
    hdr.addEventListener('click', (e) => {
      e.stopPropagation();
      const shut = !kids.hidden;
      if (!shut) setNavGroupOpen(wrap, true);
      else setNavGroupOpen(wrap, false);
    });
    wrap.appendChild(hdr);
    wrap.appendChild(kids);
    els.navList.appendChild(wrap);
  }

  function setNavGroupOpen(group, open, { accordion = false } = {}) {
    if (!group) return;
    if (open && accordion) {
      document.querySelectorAll('#appScreen .nav-group').forEach((g) => {
        if (g === group) return;
        setNavGroupOpen(g, false, { accordion: false });
      });
    }
    const kids = group.querySelector('.nav-group-kids');
    const hdr = group.querySelector('.nav-section-toggle');
    if (kids) kids.hidden = !open;
    group.classList.toggle('is-collapsed', !open);
    hdr?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function ensureNavSectionOpen(viewKey) {
    const sectionId = NAV_SECTION_BY_VIEW[viewKey];
    if (!sectionId) return;
    const group = document.querySelector(`#appScreen .nav-group[data-section="${sectionId}"]`);
    if (!group) return;
    setNavGroupOpen(group, true);
  }
  
  function makeNavButton(key, label, badge) {
    const btn = document.createElement('button');
    btn.className = 'nav-btn'; btn.dataset.view = key;
    btn.dataset.label = label;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'nav-btn-label';
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);
    if (badge != null && badge > 0) {
      const bdg = document.createElement('span');
      bdg.className = 'nav-badge';
      bdg.textContent = badge > 99 ? '99+' : badge;
      btn.appendChild(bdg);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      switchView(key);
      // Keep sidebar open until user taps ☰ — do not auto-close on nav item.
    });
    return btn;
  }
  
  // Updates badge on an existing nav button (or creates one if missing)
  function setNavBadge(viewKey, count) {
    if (viewKey === 'team-chat') {
      const top = document.getElementById('topChatBadge');
      if (top) {
        if (!count || count <= 0) {
          top.hidden = true;
          top.textContent = '';
        } else {
          top.hidden = false;
          top.textContent = count > 99 ? '99+' : String(count);
        }
      }
    }
    const btn = document.querySelector(`.nav-btn[data-view="${viewKey}"]`);
    if (!btn) return;
    let bdg = btn.querySelector('.nav-badge');
    if (!count || count <= 0) {
      if (bdg) bdg.remove();
      return;
    }
    if (!bdg) {
      bdg = document.createElement('span');
      bdg.className = 'nav-badge';
      btn.appendChild(bdg);
    }
    bdg.textContent = count > 99 ? '99+' : count;
  }

  function setupTopbarQuick() {
    const isAdmin = state.user?.role === 'admin';
    const dip = document.getElementById('topDipBotBtn');
    const chat = document.getElementById('topChatBtn');
    const mom = document.getElementById('topMomBtn');
    const cal = document.getElementById('topCalBtn');
    if (dip) {
      dip.hidden = !visOk('ai-bot') || !isAdmin;
      dip.onclick = () => switchView('ai-bot');
    }
    if (chat) {
      chat.hidden = !visOk('team-chat');
      chat.onclick = () => switchView('team-chat');
    }
    if (mom) {
      mom.hidden = !visOk('meetings');
      mom.onclick = () => switchView('meetings');
    }
    if (cal) {
      cal.hidden = !visOk('calendar') || !!isAdmin;
      cal.onclick = () => switchView('calendar');
    }
  }
  
  // Poll badge counts from the API and update nav
  async function refreshNavBadges() {
    try {
      if (state.user?.role !== 'admin') {
        // Employee: my tasks (pending), corrections, updations, verifications
        const myTasks = await api('/tasks/my');
        const pending = myTasks.filter(t => t.status === 'Pending' || t.status === 'In Progress').length;
        const corrections = myTasks.filter(t => t.verification_status === 'Verification Rejected').length;
        const updations = myTasks.filter(t => t.verification_status === 'Updation Required').length;
        setNavBadge('my', pending);
        setNavBadge('corrections', corrections);
        setNavBadge('updations', updations);
  
        // Verifications (if verifier)
        if (state.user?.can_verify) {
          const verifs = await api('/tasks/verifications');
          setNavBadge('verifications', verifs.length);
        }
  
        // Reschedule requests (own — any status change worth a glance, but
        // badge only counts ones still awaiting a decision)
        const myResched = await api('/tasks/reschedule-requests').catch(() => []);
        setNavBadge('reschedule-requests', myResched.filter(t => t.reschedule_status === 'Pending').length);
  
        // My recurring tasks — count of instances still outstanding (today's
        // due instance plus any backlog that hasn't been marked Completed yet)
        const myRecurring = await api('/recurring-tasks/my').catch(() => []);
        const recurringPending = myRecurring.filter(t => {
          const st = t.instance?.status;
          return st !== 'Completed' && st !== 'NotApplicable';
        }).length;
        setNavBadge('recurring', recurringPending);
  
        // Open tickets
        const tickets = await api('/tickets').catch(() => []);
        const openTickets = tickets.filter(t => t.status === 'Open').length;
        setNavBadge('tickets-open', openTickets);

        const buddyReqs = await api('/leaves/buddy-requests').catch(() => []);
        setNavBadge('buddyrequests', buddyReqs.length);

        const chatUnreadEmp = await api('/bot/chats/unread-total').catch(() => ({ total: 0 }));
        setNavBadge('team-chat', chatUnreadEmp?.total || 0);
      } else {
        // Admin: all tasks pending, overdue (delegated + recurring), verifications, open tickets
        const allTasks = await api('/tasks/all');
        const now = new Date();
        const pendingCount = allTasks.filter(t => t.status === 'Pending' || t.verification_status === 'Pending Verification').length;
        const overdueCount = allTasks.filter((t) => isDelegatedOverdueTask(t, now)).length;
  
        const recurringAll = await api('/recurring-tasks/all').catch(() => []);
        const overdueRecurringCount = recurringAll.filter(t => t.is_overdue).length;
  
        setNavBadge('all', pendingCount);
        setNavBadge('overdue', overdueCount + overdueRecurringCount);
  
        // Admin's own "My tasks" — admins can be personally assigned tasks too
        // (see loadMyTasks). This was missing before, same gap as verifications.
        const myTasks = await api('/tasks/my').catch(() => []);
        const myPending = myTasks.filter(t => t.status === 'Pending' || t.status === 'In Progress').length;
        setNavBadge('my', myPending);
  
        // Verifications where THIS admin is the chosen verifier (admins can be
        // picked as a verifier too — see /master/verifiers). This was missing
        // before, so the badge never showed up for admins even when tasks were
        // sitting in their verification queue.
        const adminVerifs = await api('/tasks/verifications').catch(() => []);
        setNavBadge('verifications', adminVerifs.length);
  
        // Reschedule requests awaiting a decision
        const reschedReqs = await api('/tasks/reschedule-requests').catch(() => []);
        setNavBadge('reschedule-requests', reschedReqs.length);
  
        // Open tickets
        const tickets = await api('/tickets').catch(() => []);
        const openTickets = tickets.filter(t => t.status === 'Open').length;
        setNavBadge('tickets-open', openTickets);
  
        // Pending leave requests awaiting approval
        const pendingLeaves = await api('/leaves/all?status=Pending').catch(() => []);
        const coverItems = await api('/leaves/unresolved-covers').catch(() => []);
        setNavBadge('leaveapprovals', pendingLeaves.length + (Array.isArray(coverItems) ? coverItems.length : 0));

        const buddyReqs = await api('/leaves/buddy-requests').catch(() => []);
        setNavBadge('buddyrequests', buddyReqs.length);

        const chatUnreadAdmin = await api('/bot/chats/unread-total').catch(() => ({ total: 0 }));
        setNavBadge('team-chat', chatUnreadAdmin?.total || 0);
      }

      const alerts = await api('/bot/alerts').catch(() => []);
      const unreadMeet = (alerts || []).filter((a) => !a.is_read && /^Meeting started/i.test(String(a.title || '')));
      setNavBadge('meetings', unreadMeet.length);
      if (!window._seenMeetAlerts) window._seenMeetAlerts = new Set();
      unreadMeet.forEach((a) => {
        if (window._seenMeetAlerts.has(a.id)) return;
        window._seenMeetAlerts.add(a.id);
        const age = Date.now() - new Date(a.created_at || 0).getTime();
        if (Number.isFinite(age) && age < 3 * 60 * 1000) fireSystemNotify(a.title, a.body);
      });
    } catch(e) { /* silently fail — badges are non-critical */ }
  }
  
  function switchView(viewKey) {
    // DIP Bot is admin-only
    if (viewKey === 'visibility') {
      const misOnly = state.user?.role !== 'admin' && (
        !!state.user?.is_mis_executive || /\bmis\b/i.test(`${state.user?.department || ''} ${state.user?.designation || ''}`)
      );
      if (!misOnly) {
        showToast('Who sees what is only for MIS Support', 'error');
        return;
      }
    }
    state.activeView = viewKey;
    ensureNavSectionOpen(viewKey);
    document.querySelectorAll('.view').forEach((v) => { v.hidden = true; });
  
    // tickets-open and tickets-resolved share the same view-tickets section
    const htmlKey = (viewKey === 'tickets-open' || viewKey === 'tickets-resolved') ? 'tickets' : viewKey;
    const viewEl = document.getElementById(`view-${htmlKey}`);
    if (viewEl) viewEl.hidden = false;
  
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === viewKey);
    });
    if (viewKey === 'all')           loadAllTasks();
    if (viewKey === 'overdue')       loadOverdueTasks();
    if (viewKey === 'my')            loadMyTasks();
    if (viewKey === 'employees')     loadEmployees();
    if (viewKey === 'hierarchy')     loadHierarchy();
    if (viewKey === 'sites')         loadSites();
    if (viewKey === 'clients')       loadClients();
    if (viewKey === 'masterdata')    loadMasterDataView();
    if (viewKey === 'permissions')   loadPermissions();
    if (viewKey === 'visibility')    loadVisibility();
    if (viewKey === 'verifications') loadVerifications();
    if (viewKey === 'reschedule-requests') loadRescheduleRequests();
    if (viewKey === 'tickets')       loadTickets();
    if (viewKey === 'tickets-open')     loadTicketsFiltered('Open');
    if (viewKey === 'tickets-resolved') loadTicketsFiltered('Resolved');
    if (viewKey === 'corrections')   loadCorrections();
    if (viewKey === 'updations')     loadUpdations();
    if (viewKey === 'recurring')     loadRecurringView();
    if (viewKey === 'applyleave')      loadMyLeaves();
    if (viewKey === 'buddyrequests')  loadBuddyRequests();
    if (viewKey === 'leaveapprovals')  { loadLeaveApprovals(); checkLeaveCoverAlerts(); }
    if (viewKey === 'drawings-add')  renderDrawingAddView();
    if (viewKey === 'drawings-all')  loadAllDrawings();
    if (viewKey === 'daily-report')  loadDailyReport();
    if (viewKey === 'mis-report')    loadMisReport();
    if (viewKey === 'time-dashboard') loadTimeDashboard();
    if (viewKey === 'fms')           loadFms();
    if (viewKey === 'ai-bot')        loadAiBot();
    if (viewKey === 'team-chat')     loadTeamChat();
    if (viewKey === 'meetings')      loadMeetings();
    if (viewKey === 'calendar')      loadCalendar();
    if (viewKey === 'project-mgmt')  loadProjectMgmt();
  }
  
  // ─── master data (admin) ─────────────────────────────────────────────────────
  function normDeptName(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /** Employees whose users.department text matches the selected departments.name */
  function employeesForDepartmentId(deptId) {
    const all = state.master.employees || [];
    if (!deptId) return [];
    const dept = (state.master.departments || []).find((d) => d.id === deptId);
    if (!dept) return [];
    const target = normDeptName(dept.name);
    return all.filter((e) => normDeptName(e.department) === target);
  }

  function syncTaskEmployeeDropdown() {
    if (!els.fEmployee) return;
    const deptId = els.fDepartment?.value || '';
    const list = employeesForDepartmentId(deptId);
    const prev = els.fEmployee.value;
    fillSelect(els.fEmployee, list, {
      placeholder: deptId
        ? list.length
          ? 'Select employee'
          : 'No employees in this department'
        : 'Select department first',
      labelKey: 'full_name',
    });
    if (prev && list.some((e) => e.id === prev)) els.fEmployee.value = prev;
  }

  function syncFilterEmployeeDropdown() {
    if (!els.filterEmployee) return;
    const deptId = els.filterDepartment?.value || '';
    const list = deptId ? employeesForDepartmentId(deptId) : state.master.employees || [];
    const prev = els.filterEmployee.value;
    fillSelect(els.filterEmployee, list, {
      placeholder: deptId
        ? list.length
          ? 'All employees in dept'
          : 'No employees in this department'
        : 'All employees',
      labelKey: 'full_name',
    });
    if (prev && list.some((e) => e.id === prev)) els.filterEmployee.value = prev;
  }

  function syncOverdueEmployeeDropdown() {
    if (!els.overdueFilterEmployee) return;
    const list = state.master.employees || [];
    const prev = els.overdueFilterEmployee.value;
    fillSelect(els.overdueFilterEmployee, list, {
      placeholder: 'All employees',
      labelKey: 'full_name',
    });
    if (prev && list.some((e) => e.id === prev)) els.overdueFilterEmployee.value = prev;
  }

  function syncRecurringEmployeeDropdown() {
    const empSel = recEls.employee?.();
    const deptSel = recEls.department?.();
    if (!empSel) return;
    const deptId = deptSel?.value || '';
    const list = employeesForDepartmentId(deptId);
    const prev = empSel.value;
    fillSelect(empSel, list, {
      placeholder: deptId
        ? list.length
          ? 'Select Employee'
          : 'No employees in this department'
        : 'Select department first',
      labelKey: 'full_name',
    });
    if (prev && list.some((e) => e.id === prev)) empSel.value = prev;
  }

  async function loadMasterData() {
    try {
      const [departments, projects, taskTypes, employees] = await Promise.all([
        api('/master/departments'), api('/master/projects'),
        api('/master/task-types'),  api('/master/employees')
      ]);
      state.master = {
        departments,
        projects,
        taskTypes,
        employees: (employees || []).filter((e) => !isClientUserRow(e)),
      };
      fillSelect(els.fDepartment, departments, { placeholder: 'Select department' });
      fillSelect(els.fProject, projects, { placeholder: 'Select project' });
      fillSelect(els.fTaskType, taskTypes, { placeholder: 'Select task type' });
      fillSelect(els.filterDepartment, departments, { placeholder: 'All departments' });
      fillSitePeopleDropdowns(employees);
      syncTaskEmployeeDropdown();
      syncFilterEmployeeDropdown();
      syncOverdueEmployeeDropdown();
      fillRecurringDropdowns();
    } catch (err) { showToast(err.message, 'error'); }
  }
  // 17 july 2026
  els.fDepartment?.addEventListener('change', () => {
    const dept = state.master.departments.find(d => d.id === els.fDepartment.value);
    const isMdoOffice = dept && dept.name === 'MDO OFFICE';
    els.fProject.required = !isMdoOffice;
    const reqStar = document.getElementById('f-project-req');
    if (reqStar) reqStar.style.display = isMdoOffice ? 'none' : 'inline';
    syncTaskEmployeeDropdown();
  });

  els.filterDepartment?.addEventListener('change', () => {
    syncFilterEmployeeDropdown();
  });
  
  
  async function refreshEmployeeDropdowns() {
    try {
      const employees = (await api('/master/employees')).filter((e) => !isClientUserRow(e));
      state.master.employees = employees;
      syncTaskEmployeeDropdown();
      syncFilterEmployeeDropdown();
      syncOverdueEmployeeDropdown();
      syncRecurringEmployeeDropdown();
      fillSelect(els.siteTeamleader, siteTeamLeaderOptions(employees), { placeholder: 'Select team leader', labelKey: 'full_name' });
      fillSelect(els.siteCoordinator, siteCoordinatorOptions(employees), { placeholder: 'Select coordinator', labelKey: 'full_name' });
      fillSelect(els.siteIncharge, siteInchargeOptions(employees), { placeholder: 'Select site incharge (Head)', labelKey: 'full_name' });
      fillSitePcDropdown(employees);
      // Reporting Head — optional field on the employee form. Add form shows everyone;
      // Edit form additionally excludes the employee being edited (can't report to self).
      fillSelect(els.empReportingHead, employees, { placeholder: '— None (Top level) —', labelKey: 'full_name' });
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // ─── Add New Task ────────────────────────────────────────────────────────────
  
  els.addTaskForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormMsg(els.addTaskMsg);
    if (!els.fDepartment.value || !els.fEmployee.value || !els.fTaskType.value) {
      showFormMsg(els.addTaskMsg, 'Please fill in all required fields');
      return;
    }
    await openAssignCheckpointGate();
  });

  async function actuallyAssignTask(cpLabels) {
    const formData = new FormData();
    formData.append('department_id', els.fDepartment.value);
    formData.append('assigned_to', els.fEmployee.value);
    formData.append('project_id', els.fProject.value);
    formData.append('task_type_id', els.fTaskType.value);
    formData.append('description', document.getElementById('f-description').value);
    formData.append('hours_to_complete', document.getElementById('f-hours').value);
    formData.append('target_date', document.getElementById('f-targetdate').value);
    formData.append('priority', document.getElementById('f-priority').value);
    formData.append('rescheduling_possible', document.getElementById('f-reschedule').value);
    const attachment = document.getElementById('f-attachment').files[0];
    const voiceNote  = document.getElementById('f-voicenote').files[0];
    if (attachment) formData.append('attachment', attachment);
    if (voiceNote)  formData.append('voice_note', voiceNote);
    if (cpLabels.length) formData.append('checkpoints', JSON.stringify(cpLabels));
    const created = await api('/tasks', { method: 'POST', body: formData, isForm: true });
    if (cpLabels.length && created?.id && !(created.checkpoints || []).length && !created.checkpoint_error) {
      try {
        await api(`/tasks/${created.id}/checkpoints`, {
          method: 'POST',
          body: { labels: cpLabels, task_type_id: els.fTaskType.value },
        });
      } catch (_) { /* table missing — task is still assigned */ }
    }
      showToast('Task assigned ✅', 'success');
      els.addTaskForm.reset();
      document.getElementById('f-priority').value = 'Medium';
      document.getElementById('f-reschedule').value = 'false';
      updateTaskDeadlinePreview();
  }

  function toggleInlineAdd(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.hidden = !row.hidden;
    if (!row.hidden) row.querySelector('input')?.focus();
  }

  document.getElementById('f-add-dept')?.addEventListener('click', () => toggleInlineAdd('f-add-dept-row'));
  document.getElementById('f-add-project')?.addEventListener('click', () => toggleInlineAdd('f-add-project-row'));
  document.getElementById('f-add-tasktype')?.addEventListener('click', () => toggleInlineAdd('f-add-tasktype-row'));

  document.getElementById('f-save-dept')?.addEventListener('click', async () => {
    const input = document.getElementById('f-new-dept');
    const name = (input?.value || '').trim();
    if (!name) return showToast('Enter a department name', 'error');
    try {
      const created = await api('/master/departments', { method: 'POST', body: { name } });
      await loadMasterData();
      if (els.fDepartment) els.fDepartment.value = created.id;
      els.fDepartment?.dispatchEvent(new Event('change'));
      if (input) input.value = '';
      const row = document.getElementById('f-add-dept-row');
      if (row) row.hidden = true;
      showToast('Department added', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('f-save-project')?.addEventListener('click', async () => {
    const input = document.getElementById('f-new-project');
    const name = (input?.value || '').trim();
    if (!name) return showToast('Enter a project name', 'error');
    try {
      const created = await api('/master/projects', { method: 'POST', body: { name } });
      await loadMasterData();
      if (els.fProject) els.fProject.value = created.id;
      if (input) input.value = '';
      const row = document.getElementById('f-add-project-row');
      if (row) row.hidden = true;
      showToast('Project added', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });

  document.getElementById('f-save-tasktype')?.addEventListener('click', async () => {
    const input = document.getElementById('f-new-tasktype');
    const name = (input?.value || '').trim();
    if (!name) return showToast('Enter a task type name', 'error');
    try {
      const created = await api('/master/task-types', { method: 'POST', body: { name } });
      await loadMasterData();
      if (els.fTaskType) els.fTaskType.value = created.id;
      if (input) input.value = '';
      const row = document.getElementById('f-add-tasktype-row');
      if (row) row.hidden = true;
      showToast('Task type added', 'success');
      openTypeCheckpointEditModal(created.id, created.name || name);
    } catch (err) { showToast(err.message, 'error'); }
  });

  let _typeCpEditId = null;
  function addTypeCpEditRow(value = '') {
    const list = document.getElementById('typeCpEditList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'checkpoint-row';
    row.innerHTML = `
      <input type="text" class="checkpoint-input type-cp-edit-input" placeholder="Checkpoint label…" value="${escapeHtml(value)}" />
      <button type="button" class="ghost-btn-text type-cp-edit-remove">Remove</button>
    `;
    row.querySelector('.type-cp-edit-remove').addEventListener('click', () => row.remove());
    list.appendChild(row);
    row.querySelector('input')?.focus();
  }
  function openTypeCheckpointEditModal(typeId, typeName) {
    _typeCpEditId = typeId;
    const modal = document.getElementById('typeCpEditModal');
    const title = document.getElementById('typeCpEditTitle');
    const list = document.getElementById('typeCpEditList');
    const msg = document.getElementById('typeCpEditMsg');
    if (title) title.textContent = `Add checkpoints — ${typeName || 'task type'}`;
    if (list) list.innerHTML = '';
    if (msg) { msg.hidden = true; msg.textContent = ''; }
    addTypeCpEditRow();
    if (modal) modal.hidden = false;
  }
  function closeTypeCpEditModal() {
    const modal = document.getElementById('typeCpEditModal');
    if (modal) modal.hidden = true;
    _typeCpEditId = null;
  }
  document.getElementById('typeCpEditAdd')?.addEventListener('click', () => addTypeCpEditRow());
  document.getElementById('closeTypeCpEditModal')?.addEventListener('click', closeTypeCpEditModal);
  document.getElementById('cancelTypeCpEditModal')?.addEventListener('click', closeTypeCpEditModal);
  document.getElementById('saveTypeCpEditModal')?.addEventListener('click', async () => {
    const msg = document.getElementById('typeCpEditMsg');
    const labels = [...document.querySelectorAll('#typeCpEditList .type-cp-edit-input')]
      .map((el) => el.value.trim())
      .filter(Boolean);
    if (!_typeCpEditId) return closeTypeCpEditModal();
    if (!labels.length) return closeTypeCpEditModal();
    try {
      await api(`/master/task-types/${_typeCpEditId}/checkpoints`, { method: 'PUT', body: { labels } });
      showToast('Checkpoints saved on this task type', 'success');
      closeTypeCpEditModal();
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Could not save'; msg.hidden = false; }
    }
  });
  
  // ─── All Delegated Tasks ──────────────────────────────────────────────────────
  function buildAllTasksQuery() {
    const params = new URLSearchParams();
    if (els.filterDepartment.value) params.set('department_id', els.filterDepartment.value);
    if (els.filterEmployee.value)   params.set('employee_id',   els.filterEmployee.value);
    const st = els.filterStatus.value;
    if (st && st !== 'open') params.set('status', st);
    return params.toString();
  }
  
  async function loadAllTasks() {
    const tbody = els.allTasksList;
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Loading tasks…</td></tr>`;
    els.allTasksCards.innerHTML = `<div class="empty-state">Loading tasks…</div>`;
    try {
      const query = buildAllTasksQuery();
      let tasks = await api(`/tasks/all${query ? `?${query}` : ''}`);
  
      if (els.filterStatus.value === 'open') {
        tasks = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress');
      }
  
      const from = els.filterCreatedFrom.value ? new Date(els.filterCreatedFrom.value) : null;
      const to   = els.filterCreatedTo.value   ? new Date(els.filterCreatedTo.value + 'T23:59:59') : null;
      if (from || to) {
        const before = tasks.length;
        tasks = tasks.filter((t) => {
          const d = new Date(t.created_at);
          if (from && d < from) return false;
          if (to   && d > to)   return false;
          return true;
        });
        const hidden = before - tasks.length;
        els.dateRangeCount.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''} in range${hidden ? ` · ${hidden} hidden` : ''}`;
        els.dateRangeCount.hidden = false;
      } else {
        els.dateRangeCount.hidden = true;
      }
  
      renderAllTasksTable(tbody, tasks);
      renderTaskList(els.allTasksCards, tasks, { showAssignee: true, allowActions: true });
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  [els.filterDepartment, els.filterEmployee, els.filterStatus].forEach((sel) =>
    sel.addEventListener('change', loadAllTasks)
  );
  [els.filterCreatedFrom, els.filterCreatedTo].forEach((inp) =>
    inp.addEventListener('change', loadAllTasks)
  );
  els.clearAllFilters?.addEventListener('click', () => {
    els.filterDepartment.value = ''; els.filterEmployee.value = '';
    els.filterStatus.value = 'open'; els.filterCreatedFrom.value = '';
    els.filterCreatedTo.value = ''; els.dateRangeCount.hidden = true;
    loadAllTasks();
  });
  
  // renders the admin "All delegated tasks" as a table (desktop)
  function renderAllTasksTable(tbody, tasks) {
    if (!tasks || tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><span class="emoji">📭</span>No tasks found</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
      const statusClass = task.status.replace(/\s/g, '');
  
      // Sr No
      const tdSr = document.createElement('td');
      tdSr.innerHTML = `<span class="sr-number">${index + 1}</span>`;
  
      // Task details
      const tdDetails = document.createElement('td');
      tdDetails.className = 'task-name-cell';
      tdDetails.innerHTML = buildTaskDetailsHtml(task, { showAssignee: true });
  
      // Planned date
      const tdDate = document.createElement('td');
      tdDate.style.wordBreak = 'break-word';
      tdDate.textContent = task.target_date
        ? fmtDateOnly(task.target_date)
        : '—';
  
      // Assigned to
      const tdAssigned = document.createElement('td');
      tdAssigned.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong>`;
  
      // Voice note
      const tdVoice = document.createElement('td');
      tdVoice.style.textAlign = 'center';
      if (task.voice_note_url) {
        const a = document.createElement('a');
        a.href = task.voice_note_url; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'media-link'; a.title = 'Play voice note'; a.textContent = '🎤';
        tdVoice.appendChild(a);
      } else {
        tdVoice.innerHTML = `<span class="media-none">—</span>`;
      }
  
      // Attachment
      const tdAttach = document.createElement('td');
      tdAttach.style.textAlign = 'center';
      if (task.attachment_url) {
        const a = document.createElement('a');
        a.href = task.attachment_url; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'media-link'; a.title = 'View attachment'; a.textContent = '📎';
        tdAttach.appendChild(a);
      } else {
        tdAttach.innerHTML = `<span class="media-none">—</span>`;
      }
  
      // Priority
      const tdPriority = document.createElement('td');
      tdPriority.innerHTML = `<span class="pill pill-${task.priority}">${task.priority}</span>`;
  
      // Status (with verification badge if applicable)
      const tdStatus = document.createElement('td');
      let statusHtml = `<span class="pill pill-${statusClass}">${task.status}</span>`;
      if (task.is_on_hold) {
        statusHtml += `<br><span class="pill pill-Pending" style="margin-top:4px">⏸ On hold</span>`;
      } else if (task.verification_status === 'Pending Verification') {
        statusHtml += `<br><span class="pill pill-PendingVerification" style="margin-top:4px">⏳ Verifying</span>`;
      } else if (task.verification_status === 'Verified') {
        statusHtml += `<br><span class="pill pill-Completed" style="margin-top:4px">✅ Verified</span>`;
      } else if (task.verification_status === 'Verification Rejected') {
        statusHtml += `<br><span class="pill pill-Rejected" style="margin-top:4px">Correction</span>`;
      } else if (task.verification_status === 'Updation Required') {
        statusHtml += `<br><span class="pill pill-Pending" style="margin-top:4px">📝 Updation</span>`;
      }
      tdStatus.innerHTML = statusHtml;
  
      // Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      buildPrimaryStatusButtons(task, { showAssignee: true, allowActions: true }).forEach((btn) => tdActions.appendChild(btn));
      tdActions.appendChild(buildCardMenuElement(task, { showAssignee: true }));
  
      tr.append(tdSr, tdDetails, tdDate, tdAssigned, tdVoice, tdAttach, tdPriority, tdStatus, tdActions);
      tbody.appendChild(tr);
    });
  }
  
  // ─── Overdue Tasks (admin) ───────────────────────────────────────────────────
  // Reuses the same /tasks/all data as "All delegated tasks". A task counts as
  // overdue when its target_date has passed and it hasn't actually finished
  // (Rejected tasks never show here at all). Within that set:
  //   - "source" tells you whether it's overdue because it's still sitting
  //     unfinished from assignment, or because it's stuck waiting on a verifier.
  //   - if an admin has set an overdue_extended_until that's still in the
  //     future, the task moves to the "Pending" tab inside the drawer (it's
  //     still overdue against the real target_date, but someone already
  //     acknowledged it and gave the employee more time). Once that extended
  //     time itself passes, it falls back into "Today" — needs attention again.
  let overdueTasksCache = [];
  let overdueDrawerTab = 'today';
  
  function taskOverdueSource(task) {
    if (isVerificationOverdueTask(task)) return 'verification';
    if (isAssignmentOverdueTask(task)) return 'assignment';
    return 'assignment';
  }
  
  function isOverdueExtensionActive(task) {
    return !!task.overdue_extended_until && new Date(task.overdue_extended_until) > new Date();
  }
  
  function overdueAssigneeId(task) {
    return task.assigned_to || task.assigned_to_user?.id || '';
  }
  
  async function loadOverdueTasks() {
    els.overdueTasksList.innerHTML = `<tr><td colspan="9" class="empty-state">Loading overdue tasks…</td></tr>`;
    els.overdueTasksCards.innerHTML = `<div class="empty-state">Loading overdue tasks…</div>`;
    try {
      syncOverdueEmployeeDropdown();
      const empId = els.overdueFilterEmployee?.value || '';
      const tasks = await api('/tasks/all');
      const now = new Date();
      const overdue = tasks.filter((t) => {
        if (!isDelegatedOverdueTask(t, now)) return false;
        if (empId && overdueAssigneeId(t) !== empId) return false;
        return true;
      }).sort((a, b) => {
        const aVerify = isVerificationOverdueTask(a, now) ? 0 : 1;
        const bVerify = isVerificationOverdueTask(b, now) ? 0 : 1;
        if (aVerify !== bVerify) return aVerify - bVerify;
        const aDue = employeeWorkDueDate(a) || parseLocalDate(a.target_date) || now;
        const bDue = employeeWorkDueDate(b) || parseLocalDate(b.target_date) || now;
        return aDue - bDue;
      });
  
      overdueTasksCache = overdue;
      renderOverdueTasksTable(els.overdueTasksList, overdue);
      renderTaskList(els.overdueTasksCards, overdue, { showAssignee: true, allowActions: true });
      setBadge('overdueTaskBadge', overdue.length);
  
      // Recurring tasks that have missed a due date also count as "overdue"
      // for the admin — kept in their own "Recurring Task" tab since they're
      // a different kind of record (instances, not delegated tasks).
      const recurringAll = await api('/recurring-tasks/all').catch(() => []);
      const overdueRecurring = recurringAll
        .filter((t) => t.is_overdue && (!empId || overdueAssigneeId(t) === empId))
        .sort((a, b) => b.overdue_days - a.overdue_days);
      renderOverdueRecurringSection(overdueRecurring);
      setBadge('overdueRecurringBadge', overdueRecurring.length);
    } catch (err) { showToast(err.message, 'error'); }
  }

  els.overdueFilterEmployee?.addEventListener('change', () => {
    if (state.activeView === 'overdue') loadOverdueTasks();
  });
  els.clearOverdueFilters?.addEventListener('click', () => {
    if (els.overdueFilterEmployee) els.overdueFilterEmployee.value = '';
    if (state.activeView === 'overdue') loadOverdueTasks();
  });
  
  // ─── Overdue tab switching: Task ↔ Recurring Task ──────────────────────────
  __tfReadyFns.push(() => {
    document.querySelectorAll('#overdueTabBar .my-tasks-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#overdueTabBar .my-tasks-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.overduetab;
        const taskPanel = document.getElementById('overdueTaskTabPanel');
        const recPanel = document.getElementById('overdueRecurringTabPanel');
        if (taskPanel) taskPanel.hidden = tab !== 'task';
        if (recPanel) recPanel.hidden = tab !== 'recurring';
      });
    });
  });
  
  function renderOverdueRecurringSection(tasks) {
    const tbody = document.getElementById('overdueRecurringTableBody');
    const cards = document.getElementById('overdueRecurringCards');
    if (!tbody || !cards) return;
  
    if (tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><span class="emoji">🎉</span>No overdue recurring tasks</td></tr>`;
      cards.innerHTML = `<div class="empty-state"><span class="emoji">🎉</span>No overdue recurring tasks</div>`;
      return;
    }
  
    tbody.innerHTML = '';
    cards.innerHTML = '';
    tasks.forEach((task) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong></td>
        <td>${escapeHtml(task.description ?? '')}</td>
        <td>${escapeHtml(freqLabel(task))}</td>
        <td>${escapeHtml(fmtDateOnly(task.oldest_overdue_date))}</td>
        <td><span class="pill pill-Rejected">${task.overdue_days} day${task.overdue_days > 1 ? 's' : ''}</span></td>
      `;
      tbody.appendChild(tr);
  
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-card-header">
          <span class="pill pill-Rejected">${task.overdue_days} day${task.overdue_days > 1 ? 's' : ''} overdue</span>
          <span style="font-size:12px;color:#888">${escapeHtml(freqLabel(task))}</span>
        </div>
        <div class="task-card-body">
          <div class="task-detail-line"><span class="task-detail-label">Employee:</span> ${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</div>
          <div class="task-detail-line"><strong>${escapeHtml(task.description ?? '')}</strong></div>
          <div class="task-detail-line"><span class="task-detail-label">Overdue since:</span> ${escapeHtml(fmtDateOnly(task.oldest_overdue_date))}</div>
        </div>
      `;
      cards.appendChild(card);
    });
  }
  
  // renders the admin "Overdue tasks" as a table (desktop) — adds a Verifier
  // column and a Source badge, and clicking a row opens the Today/Pending
  // detail drawer for that task.
  function renderOverdueTasksTable(tbody, tasks) {
    if (!tasks || tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><span class="emoji">🎉</span>No overdue tasks</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const statusClass = task.status.replace(/\s/g, '');
      const source = taskOverdueSource(task);
  
      // Sr No
      const tdSr = document.createElement('td');
      tdSr.innerHTML = `<span class="sr-number">${index + 1}</span>`;
  
      // Task details
      const tdDetails = document.createElement('td');
      tdDetails.className = 'task-name-cell';
      tdDetails.innerHTML = buildTaskDetailsHtml(task, { showAssignee: true });
  
      // Source — why is this overdue: stuck before submission, or stuck in verification?
      const tdSource = document.createElement('td');
      tdSource.innerHTML = source === 'verification'
        ? `<span class="source-badge source-verification">⏳ Verification</span>`
        : `<span class="source-badge source-assignment">📋 Assignment</span>`;
  
      // Overdue detail (assignment work hours or verification 2h SLA)
      const tdDate = document.createElement('td');
      tdDate.style.wordBreak = 'break-word';
      tdDate.innerHTML = fmtOverdueDateCell(task);
      if (isOverdueExtensionActive(task)) {
        tdDate.innerHTML += `<div style="color:var(--emerald);font-size:0.75rem;margin-top:2px">⏱ Extended to ${fmtDate(task.overdue_extended_until)}</div>`;
      }
  
      // Assigned to
      const tdAssigned = document.createElement('td');
      tdAssigned.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong>`;
  
      // Verifier — who must verify (highlight when verification overdue)
      const tdVerifier = document.createElement('td');
      if (task.verifier?.full_name) {
        const verifyNote = isVerificationOverdueTask(task)
          ? `<div style="color:#d33;font-size:0.75rem;margin-top:2px">Pending verify &gt;2h</div>`
          : (task.verification_status === 'Pending Verification' && !task.verification_started_at
            ? `<div style="color:var(--muted);font-size:0.75rem;margin-top:2px">Not started yet</div>`
            : '');
        tdVerifier.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.verifier.full_name)}</strong>${verifyNote}`;
      } else {
        tdVerifier.innerHTML = `<span class="media-none">—</span>`;
      }
  
      // Priority
      const tdPriority = document.createElement('td');
      tdPriority.innerHTML = `<span class="pill pill-${task.priority}">${task.priority}</span>`;
  
      // Status (with verification badge if applicable)
      const tdStatus = document.createElement('td');
      let statusHtml = `<span class="pill pill-${statusClass}">${task.status}</span>`;
      if (task.is_on_hold) {
        statusHtml += `<br><span class="pill pill-Pending" style="margin-top:4px">⏸ On hold</span>`;
      } else if (task.verification_status === 'Pending Verification') {
        statusHtml += `<br><span class="pill pill-PendingVerification" style="margin-top:4px">⏳ Verifying</span>`;
      } else if (task.verification_status === 'Verification Rejected') {
        statusHtml += `<br><span class="pill pill-Rejected" style="margin-top:4px">Correction</span>`;
      } else if (task.verification_status === 'Updation Required') {
        statusHtml += `<br><span class="pill pill-Pending" style="margin-top:4px">📝 Updation</span>`;
      }
      tdStatus.innerHTML = statusHtml;
  
      // Actions — overdue view only offers "Mark as done" + "Set extended time"
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      tdActions.addEventListener('click', (e) => e.stopPropagation()); // don't open drawer when using the menu
      tdActions.appendChild(buildOverdueMenuElement(task));
  
      tr.append(tdSr, tdDetails, tdSource, tdDate, tdAssigned, tdVerifier, tdPriority, tdStatus, tdActions);
      tr.addEventListener('click', () => openOverdueDrawer(task.id));
      tbody.appendChild(tr);
    });
  }
  
  // Dedicated 3-dot menu for the Overdue view — intentionally just these two
  // actions (not the full reschedule/reassign/reject menu used elsewhere),
  // since "deal with it from here" in this view means either finish it or
  // buy it more time.
  function buildOverdueMenuElement(task) {
    const wrap = document.createElement('div'); wrap.className = 'card-menu';
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button'; menuBtn.className = 'card-menu-btn';
    menuBtn.setAttribute('aria-label', 'More options'); menuBtn.textContent = '⋮';
    const menuList = document.createElement('div');
    menuList.className = 'card-menu-list'; menuList.hidden = true;
  
    const items = [];
    if (task.status !== 'Completed') {
      items.push({ label: '✅ Mark as done', onClick: () => updateStatus(task.id, 'Completed') });
    }
    items.push({ label: '⏱ Set extended time', onClick: () => openOverdueExtendModal(task) });
  
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'card-menu-item'; btn.textContent = item.label;
      btn.addEventListener('click', () => { menuList.hidden = true; item.onClick(); });
      menuList.appendChild(btn);
    });
  
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.card-menu-list').forEach((l) => { if (l !== menuList) l.hidden = true; });
      const willShow = menuList.hidden;
      menuList.hidden = !menuList.hidden;
      if (willShow) positionCardMenu(menuBtn, menuList);
    });
    wrap.appendChild(menuBtn); wrap.appendChild(menuList);
    return wrap;
  }
  
  // ─── Set extended time modal ──────────────────────────────────────────────
  function openOverdueExtendModal(task) {
    state.pendingTaskId = task.id;
    els.overdueExtendFormMsg.hidden = true;
    els.overdueExtendDate.value = task.overdue_extended_until ? toDatetimeLocalValue(task.overdue_extended_until) : '';
    els.overdueExtendReason.value = task.overdue_extension_reason ?? '';
    els.overdueExtendModal.hidden = false;
  }
  els.closeOverdueExtendModal?.addEventListener('click', () => { els.overdueExtendModal.hidden = true; });
  els.cancelOverdueExtendModal?.addEventListener('click', () => { els.overdueExtendModal.hidden = true; });
  els.overdueExtendForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.overdueExtendFormMsg.hidden = true;
    try {
      await api(`/tasks/${state.pendingTaskId}/overdue-extend`, {
        method: 'PATCH',
        body: { extended_until: els.overdueExtendDate.value, reason: els.overdueExtendReason.value }
      });
      showToast('Extended time saved ⏱', 'success');
      els.overdueExtendModal.hidden = true;
      if (state.activeView === 'overdue') loadOverdueTasks();
    } catch (err) { els.overdueExtendFormMsg.textContent = err.message; els.overdueExtendFormMsg.hidden = false; }
  });
  
  // ─── Overdue detail drawer (Today / Pending tabs) ─────────────────────────
  // "Today" = needs attention right now (no active extension, or the
  // extension itself has already lapsed). "Pending" = an admin already gave
  // the employee more time and that window hasn't passed yet.
  function openOverdueDrawer(taskId) {
    const task = overdueTasksCache.find((t) => t.id === taskId);
    if (!task) return;
    overdueDrawerTab = isOverdueExtensionActive(task) ? 'pending' : 'today';
    renderOverdueDrawer();
    els.overdueDrawerBackdrop.hidden = false;
  }
  els.closeOverdueDrawer?.addEventListener('click', () => { els.overdueDrawerBackdrop.hidden = true; });
  els.overdueDrawerBackdrop?.addEventListener('click', (e) => {
    if (e.target === els.overdueDrawerBackdrop) els.overdueDrawerBackdrop.hidden = true;
  });
  els.overdueTabToday?.addEventListener('click', () => { overdueDrawerTab = 'today'; renderOverdueDrawer(); });
  els.overdueTabPending?.addEventListener('click', () => { overdueDrawerTab = 'pending'; renderOverdueDrawer(); });
  
  function renderOverdueDrawer() {
    const today = overdueTasksCache.filter((t) => !isOverdueExtensionActive(t));
    const pending = overdueTasksCache.filter((t) => isOverdueExtensionActive(t));
  
    els.overdueTabTodayCount.textContent = today.length;
    els.overdueTabPendingCount.textContent = pending.length;
    els.overdueTabToday.classList.toggle('active', overdueDrawerTab === 'today');
    els.overdueTabPending.classList.toggle('active', overdueDrawerTab === 'pending');
  
    const list = overdueDrawerTab === 'today' ? today : pending;
    const body = els.overdueDrawerBody;
  
    if (!list.length) {
      body.innerHTML = `<div class="empty-state">${overdueDrawerTab === 'today' ? 'Nothing needs attention right now 🎉' : 'No tasks on extended time'}</div>`;
      return;
    }
  
    body.innerHTML = '';
    list.forEach((task) => {
      const source = taskOverdueSource(task);
      const item = document.createElement('div');
      item.className = 'drawer-task-item';
      item.innerHTML = `
        ${source === 'verification'
          ? `<span class="source-badge source-verification">⏳ Verification</span>`
          : `<span class="source-badge source-assignment">📋 Assignment</span>`}
        <div class="task-detail-line"><strong>${escapeHtml(task.description ?? '')}</strong></div>
        <div class="task-detail-line"><span class="task-detail-label">Assigned to:</span> ${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</div>
        ${task.verifier?.full_name ? `<div class="task-detail-line"><span class="task-detail-label">Verifier:</span> ${escapeHtml(task.verifier.full_name)}</div>` : ''}
        <div class="task-detail-line"><span class="task-detail-label">Planned date:</span> ${escapeHtml(fmtDateOnly(task.target_date))}</div>
        ${overdueDrawerTab === 'pending' ? `
          <div class="drawer-extension-note">
            ⏱ Extended to <strong>${escapeHtml(fmtDate(task.overdue_extended_until))}</strong>
            ${task.overdue_extension_reason ? `<br>Reason: ${escapeHtml(task.overdue_extension_reason)}` : ''}
          </div>
        ` : ''}
        <div class="drawer-task-actions"></div>
      `;
      const actionsEl = item.querySelector('.drawer-task-actions');
      if (task.status !== 'Completed') {
        actionsEl.appendChild(makeActionBtn('action-complete', '✅ Mark as done', () => updateStatus(task.id, 'Completed')));
      }
      actionsEl.appendChild(makeActionBtn('action-start', '⏱ Set extended time', () => openOverdueExtendModal(task)));
      body.appendChild(item);
    });
  }
  
  // ─── My Tasks ────────────────────────────────────────────────────────────────
  async function loadMyTasks() {
    els.myTasksTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">Loading tasks…</td></tr>`;
    els.myTasksList.innerHTML = '<div class="empty-state">Loading tasks…</div>';
  
    const isAdmin = state.user.role === 'admin';
    const tabBar = document.getElementById('myTasksTabBar');
    if (tabBar) tabBar.hidden = !isAdmin;
  
    try {
      const allTasks = await api('/tasks/my');
      const visibleTasks = allTasks.filter(
        (task) => task.status !== 'Completed' && !isRejectedTask(task)
      );
  
      // Admin can be personally assigned recurring tasks too — those never
      // showed up anywhere before (the Recurring Tasks nav item is the admin's
      // management/CRUD view, not their own to-do list). They're merged into
      // this same table/list — one unified "My Task" view, not a separate
      // section — with a 🔁 marker so they're still easy to tell apart.
      const recurringTasks = isAdmin ? await api('/recurring-tasks/my').catch(() => []) : [];

      myTasksTimerCache = visibleTasks;
  
      renderMyTasksTable(els.myTasksTableBody, visibleTasks, recurringTasks);
  
      els.myTasksList.innerHTML = '';
      els.myTasksList.classList.add('task-list');
      visibleTasks.forEach(t => els.myTasksList.appendChild(renderTaskCard(t, { showAssignee: false, allowActions: true, useCreatedDueDate: true })));
      recurringTasks.forEach(t => els.myTasksList.appendChild(buildEmployeeRecurringCard(t, loadMyTasks)));
      if (!visibleTasks.length && !recurringTasks.length) {
        els.myTasksList.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>No tasks found</div>`;
      }
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // ─── "My Tasks" tabs (admin only): My Task ↔ Other Pending Work ───────────
  __tfReadyFns.push(() => {
    document.querySelectorAll('#myTasksTabBar .my-tasks-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#myTasksTabBar .my-tasks-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.mytab;
        const myPanel = document.getElementById('myTaskTabPanel');
        const otherPanel = document.getElementById('otherPendingTabPanel');
        if (myPanel) myPanel.hidden = tab !== 'mytask';
        if (otherPanel) otherPanel.hidden = tab !== 'other';
        if (tab === 'other') loadOtherPendingWork();
      });
    });
  
    // Other Pending Work has its own 3 sub-tabs: Leave / Verification / Tickets
    document.querySelectorAll('#otherPendingSubTabBar .my-tasks-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#otherPendingSubTabBar .my-tasks-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const sub = btn.dataset.subtab;
        const leaves = document.getElementById('otherPendingLeavesList');
        const verifs = document.getElementById('otherPendingVerificationsWrap');
        const ticks = document.getElementById('otherPendingTicketsList');
        if (leaves) leaves.hidden = sub !== 'leave';
        if (verifs) verifs.hidden = sub !== 'verification';
        if (ticks) ticks.hidden = sub !== 'tickets';
      });
    });
  });
  
  // Read-only summary of things pending elsewhere that need the admin's
  // attention — leave requests, verifications, open tickets. Nothing can be
  // actioned from here on purpose; approve/verify/resolve from the real
  // pages, and an item disappears from this list on its own the moment it's
  // no longer pending (next time this tab loads).
  async function loadOtherPendingWork() {
    const leavesWrap = document.getElementById('otherPendingLeavesList');
    const verifWrap = document.getElementById('otherPendingVerificationsList');
    const verifTableBody = document.getElementById('otherPendingVerificationsTableBody');
    const ticketsWrap = document.getElementById('otherPendingTicketsList');
    if (!leavesWrap || !verifWrap || !ticketsWrap) return;
  
    leavesWrap.innerHTML = '<div class="empty-state">Loading…</div>';
    verifWrap.innerHTML = '<div class="empty-state">Loading…</div>';
    if (verifTableBody) verifTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading…</td></tr>`;
    ticketsWrap.innerHTML = '<div class="empty-state">Loading…</div>';
  
    try {
      const [leaves, verifications, tickets] = await Promise.all([
        api('/leaves/all?status=Pending'),
        api('/tasks/verifications'),
        api('/tickets')
      ]);
      const openTickets = tickets.filter((t) => t.status === 'Open');
  
      renderOtherPendingLeaves(leaves, leavesWrap);
      renderOtherPendingVerifications(verifications, verifWrap);
      // Same renderer used by the main "Verification requests" page — so
      // Verify / Send for Correction / Updation all work identically from here.
      if (verifTableBody) renderVerificationsTable(verifTableBody, verifications);
      renderOtherPendingTickets(openTickets, ticketsWrap);
  
      setBadge('otherPendingLeaveBadge', leaves.length);
      setBadge('otherPendingVerificationBadge', verifications.length);
      setBadge('otherPendingTicketsBadge', openTickets.length);
  
      const total = leaves.length + verifications.length + openTickets.length;
      setBadge('otherPendingBadge', total);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // Small helper for the badge spans on tab buttons (not the sidebar nav
  // badges — those go through setNavBadge).
  function setBadge(elementId, count) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    badge.hidden = count <= 0;
    badge.textContent = count > 99 ? '99+' : count;
  }
  
  function renderOtherPendingLeaves(leaves, wrap) {
    if (!leaves.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="emoji">🎉</span>No pending leave requests</div>`;
      return;
    }
    wrap.innerHTML = '';
    leaves.forEach((leave) => {
      const card = document.createElement('div');
      card.className = 'ticket-card';
      card.innerHTML = `
        <div class="ticket-top">
          <span class="pill ${leavePillClass(leave.status)}">${escapeHtml(leave.status)}</span>
        </div>
        <div class="ticket-desc"><strong>${escapeHtml(leave.user?.full_name ?? '—')}</strong> · ${escapeHtml(leaveDateRangeLabel(leave))}</div>
        <p class="ticket-desc">${escapeHtml(leave.reason)}</p>
        <div class="ticket-meta">Applied ${fmtDate(leave.created_at)}</div>
      `;
      wrap.appendChild(card);
    });
  }
  
  function renderOtherPendingVerifications(tasks, wrap) {
    if (!tasks.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="emoji">🎉</span>No pending verifications</div>`;
      return;
    }
    renderTaskList(wrap, tasks, { showAssignee: true, allowActions: false, verificationMode: true });
  }
  
  function renderOtherPendingTickets(tickets, wrap) {
    if (!tickets.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="emoji">🎉</span>No open tickets</div>`;
      return;
    }
    wrap.innerHTML = '';
    tickets.forEach((ticket) => {
      const card = document.createElement('div');
      card.className = 'ticket-card';
      const catLabel = TICKET_CATEGORY_LABELS[ticket.category] || ticket.category || '';
      card.innerHTML = `
        <div class="ticket-top">
          <div class="ticket-top-left">
            <span class="pill pill-Pending">${escapeHtml(ticket.status)}</span>
            ${catLabel ? `<span class="ticket-category-chip">${escapeHtml(catLabel)}</span>` : ''}
          </div>
        </div>
        <p class="ticket-desc">${escapeHtml(ticket.description)}</p>
        <div class="ticket-meta">Raised by <strong>${escapeHtml(ticket.raised_by_user?.full_name ?? '—')}</strong> · ${fmtDate(ticket.created_at)}</div>
      `;
      wrap.appendChild(card);
    });
  }
  
  // renders "My tasks" as a table (desktop). Same columns as All Tasks, minus
  // "Assigned to" (it's always you), since this is the employee's own task list.
  function renderMyTasksTable(tbody, tasks, recurringTasks = []) {
    if ((!tasks || tasks.length === 0) && recurringTasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><span class="emoji">📭</span>No tasks found</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
      const statusClass = task.status.replace(/\s/g, '');
  
      // Sr No
      const tdSr = document.createElement('td');
      tdSr.innerHTML = `<span class="sr-number">${index + 1}</span>`;
  
      // Task details
      const tdDetails = document.createElement('td');
      tdDetails.className = 'task-name-cell';
      tdDetails.innerHTML = buildTaskDetailsHtml(task, { showAssignee: false });
  
      // Due date + live timer (office-hours aware)
      const tdDate = document.createElement('td');
      tdDate.className = 'task-timer-cell';
      tdDate.style.wordBreak = 'break-word';
      tdDate.dataset.taskTimerId = task.id;
      tdDate.innerHTML = fmtEmployeeTimerHtml(task);
  
      // Voice note
      const tdVoice = document.createElement('td');
      tdVoice.style.textAlign = 'center';
      if (task.voice_note_url) {
        const a = document.createElement('a');
        a.href = task.voice_note_url; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'media-link'; a.title = 'Play voice note'; a.textContent = '🎤';
        tdVoice.appendChild(a);
      } else {
        tdVoice.innerHTML = `<span class="media-none">—</span>`;
      }
  
      // Attachment
      const tdAttach = document.createElement('td');
      tdAttach.style.textAlign = 'center';
      if (task.attachment_url) {
        const a = document.createElement('a');
        a.href = task.attachment_url; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'media-link'; a.title = 'View attachment'; a.textContent = '📎';
        tdAttach.appendChild(a);
      } else {
        tdAttach.innerHTML = `<span class="media-none">—</span>`;
      }
  
      // Priority
      const tdPriority = document.createElement('td');
      tdPriority.innerHTML = `<span class="pill pill-${task.priority}">${task.priority}</span>`;
  
      // Status (with verification badge if applicable)
      const tdStatus = document.createElement('td');
      let statusHtml = `<span class="pill pill-${statusClass}">${task.status}</span>`;
      if (task.is_on_hold) {
        statusHtml += `<br><span class="pill pill-Pending" style="margin-top:4px">⏸ On hold</span>`;
      } else if (task.verification_status === 'Pending Verification') {
        statusHtml += `<br><span class="pill pill-PendingVerification" style="margin-top:4px">⏳ Verifying</span>`;
      } else if (task.verification_status === 'Verified') {
        statusHtml += `<br><span class="pill pill-Completed" style="margin-top:4px">✅ Verified</span>`;
      } else if (task.verification_status === 'Verification Rejected') {
        statusHtml += `<br><span class="pill pill-Rejected" style="margin-top:4px">Correction</span>`;
      } else if (task.verification_status === 'Updation Required') {
        statusHtml += `<br><span class="pill pill-Pending" style="margin-top:4px">📝 Updation</span>`;
      }
      tdStatus.innerHTML = statusHtml;
  
      // Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      buildPrimaryStatusButtons(task, { showAssignee: false, allowActions: true }).forEach((btn) => tdActions.appendChild(btn));
      tdActions.appendChild(buildCardMenuElement(task, { showAssignee: false }));
  
      tr.append(tdSr, tdDetails, tdDate, tdVoice, tdAttach, tdPriority, tdStatus, tdActions);
      tbody.appendChild(tr);
    });
  
    // Recurring tasks assigned to the admin personally — merged into this
    // same table (continuing the Sr No count) rather than a separate section,
    // with a 🔁 marker on the task details so they're still easy to spot.
    recurringTasks.forEach((task, i) => {
      const tr = document.createElement('tr');
      const inst = task.instance;
      const checkpoints = (task.checkpoints || []).sort((a, b) => a.sort_order - b.sort_order);
      const completedIds = inst
        ? (inst.recurring_task_checkpoint_completions || []).map((c) => c.checkpoint_id)
        : [];
      const isCompleted = inst?.status === 'Completed' || inst?.status === 'NotApplicable';
      const isNa = inst?.status === 'NotApplicable';
      const isOverdue = !task.is_today && !isCompleted;
      const statusText = isNa ? 'Not Applicable'
        : isCompleted ? 'Completed'
        : checkpoints.length === 0 ? (isOverdue ? 'Pending (overdue)' : 'Pending')
        : `Pending (${completedIds.length}/${checkpoints.length} done)${isOverdue ? ' — overdue' : ''}`;
      const pillClass = isNa ? 'pill-InProgress'
        : isCompleted ? 'pill-Completed'
        : isOverdue ? 'pill-Rejected'
        : 'pill-InProgress';
  
      const tdSr = document.createElement('td');
      tdSr.innerHTML = `<span class="sr-number">${tasks.length + i + 1}</span>`;
  
      const tdDetails = document.createElement('td');
      tdDetails.className = 'task-name-cell';
      tdDetails.innerHTML = `
        <div class="task-detail-line"><span class="pill pill-InProgress" style="font-size:10px">🔁 Recurring</span></div>
        <div class="task-detail-line"><strong>${escapeHtml(task.description ?? '')}</strong></div>
        ${task.project ? `<div class="task-detail-line"><span class="task-detail-label">Project:</span> ${escapeHtml(task.project.name)}</div>` : ''}
        ${task.task_type ? `<div class="task-detail-line"><span class="task-detail-label">Type:</span> ${escapeHtml(task.task_type.name)}</div>` : ''}
      `;
  
      const tdDate = document.createElement('td');
      tdDate.style.wordBreak = 'break-word';
      tdDate.textContent = fmtDateOnly(task.due_date);
  
      const tdVoice = document.createElement('td');
      tdVoice.style.textAlign = 'center';
      tdVoice.innerHTML = `<span class="media-none">—</span>`;
  
      const tdAttach = document.createElement('td');
      tdAttach.style.textAlign = 'center';
      tdAttach.innerHTML = `<span class="media-none">—</span>`;
  
      const tdPriority = document.createElement('td');
      tdPriority.innerHTML = `<span class="media-none">—</span>`;
  
      const tdStatus = document.createElement('td');
      tdStatus.innerHTML = `<span class="pill ${pillClass}">${escapeHtml(statusText)}</span>`;
  
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      if (!isCompleted) {
        appendRecurringActionButtons(tdActions, task, inst, checkpoints, loadMyTasks);
      }
  
      tr.append(tdSr, tdDetails, tdDate, tdVoice, tdAttach, tdPriority, tdStatus, tdActions);
      tbody.appendChild(tr);
    });
  }
  
  // ─── shared task card rendering (My Tasks / Verifications) ───────────────────
  function renderTaskList(container, tasks, { showAssignee, allowActions, verificationMode = false }) {
    if (!tasks || tasks.length === 0) {
      container.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>No tasks found</div>`;
      return;
    }
    container.classList.add('task-list');
    container.innerHTML = '';
    tasks.forEach((task) => container.appendChild(renderTaskCard(task, { showAssignee, allowActions, verificationMode })));
  }
  
  function getDeadlineHtml(task, showAssignee, useCreatedDate = false) {
    if (useCreatedDate) return fmtEmployeeTimerHtml(task);
    return task.target_date ? fmtDateOnly(task.target_date) : '—';
  }
  
  function verificationBadgeHtml(task) {
    if (task.verification_status === 'Updation Required') {
      return `<span class="pill pill-Pending" style="font-size:0.7rem">📝 Updation Required</span>`;
    }
    if (task.status === 'Ticket Raised') {
      return `<span class="pill pill-Pending" style="font-size:0.7rem">🎫 Ticket Raised</span>`;
    }
    if (task.verification_status === 'Pending Verification') {
      return `<div class="verify-badge pending">⏳ Sent for verification to <strong>${escapeHtml(task.verifier?.full_name ?? '—')}</strong></div>`;
    }
    if (task.verification_status === 'Verification Rejected') {
      return `<div class="verify-badge rejected">Correction${task.verification_note ? `: ${escapeHtml(task.verification_note)}` : ''}</div>`;
    }
    if (task.verification_status === 'Verified') {
      return `<div class="verify-badge verified">✅ Verified by <strong>${escapeHtml(task.verifier?.full_name ?? '—')}</strong></div>`;
    }
    return '';
  }
  
  function buildCardMenuItems(task, { showAssignee }) {
    const isActuallyMine = task.assigned_to_user?.id === state.user.id;
    const canManageThisTask = state.user.role === 'admin' || isActuallyMine;
    const isPendingVerification = task.verification_status === 'Pending Verification';
    const isOnHold = !!task.is_on_hold;
    const isAdminManaging = showAssignee && state.user.role === 'admin';
    const isTicketRaised = task.status === 'Ticket Raised';
    const isReschedulePending = task.reschedule_status === 'Pending';
    const items = [];
  
    if (!isAdminManaging && task.status === 'Pending') {
      return items;
    }
  
    if (isAdminManaging) {
      if (task.status !== 'Completed') {
        items.push({ label: '✅ Mark as done', onClick: () => updateStatus(task.id, 'Completed') });
      }
      items.push({ label: '🗓️ Reschedule', onClick: () => openRescheduleModal(task.id, task.target_date) });
      items.push({ label: '🔁 Reassign', onClick: () => openReassignModal(task.id) });
      if (task.status !== 'Rejected') {
        items.push({ label: '❌ Reject task', onClick: () => {
          const reason = prompt('Reason for rejecting this task (optional):') || '';
          updateStatus(task.id, 'Rejected', reason);
        }});
      }
    } else if (isOnHold && isActuallyMine) {
      items.push({ label: '▶️ Resume task', onClick: () => resumeTask(task.id) });
    } else if (
      !isOnHold
      && task.status === 'In Progress'
      && isActuallyMine
      && task.accepted_at
      && Number(task.hours_to_complete) > 0
      && !isPendingVerification
      && !isTicketRaised
      && !isReschedulePending
    ) {
      items.push({ label: '⏸ Hold task', onClick: () => holdTask(task.id) });
    }

    if (task.rescheduling_possible && task.status !== 'Completed' && !isPendingVerification && !isOnHold && canManageThisTask) {
      if (isTicketRaised) {
        items.push({ label: '🗓️ Reschedule blocked — ticket raised', disabled: true });
      } else if (isReschedulePending) {
        items.push({ label: '🗓️ Reschedule request pending…', onClick: () => switchView('reschedule-requests'), disabled: true });
      } else {
        items.push({ label: '🗓️ Request reschedule', onClick: () => openReschedRequestModal(task.id) });
      }
    }
  
    if (task.status !== 'Completed' && !isPendingVerification && !isOnHold && canManageThisTask) {
      if (isTicketRaised) {
        items.push({ label: '🔎 Verification blocked — ticket raised', disabled: true });
      } else if (isReschedulePending) {
        items.push({ label: '🔎 Verification blocked — reschedule pending', disabled: true });
      } else {
        items.push({ label: '🔎 Send for verification', onClick: () => openVerifyModal(task.id) });
      }
    }
    items.push({ label: '🎫 Raise a ticket', onClick: () => openTicketModal(task.id, task.description, task.project?.name) });
    return items;
  }
  
  function buildPrimaryStatusButtons(task, { showAssignee, allowActions }) {
    const isOwnTask = state.user.role !== 'admin' || (showAssignee === false);
    const isPendingVerification = task.verification_status === 'Pending Verification';
    const isOnHold = !!task.is_on_hold;
    const isAdminManaging = showAssignee && state.user.role === 'admin';
    const canAct = allowActions && (state.user.role === 'admin' || isOwnTask)
      && task.status !== 'Completed' && !isPendingVerification && !isAdminManaging;
    const buttons = [];
    if (!canAct) return buttons;
    if (isOnHold && isOwnTask) {
      buttons.push(makeActionBtn('action-start', '▶ Resume', () => resumeTask(task.id)));
      return buttons;
    }
    if (task.status === 'Pending') {
      buttons.push(makeActionBtn('action-start', 'Accept', () => updateStatus(task.id, 'In Progress')));
      buttons.push(makeActionBtn('action-reject', 'Reject', () => {
        const reason = prompt('Reason for rejecting this task (optional):') || '';
        updateStatus(task.id, 'Rejected', reason);
      }));
    }
    if (task.status === 'In Progress' && state.user.role === 'admin') {
      buttons.push(makeActionBtn('action-complete', 'Mark complete', () => updateStatus(task.id, 'Completed')));
    }
    if (task.status === 'Rejected' && state.user.role === 'admin') {
      buttons.push(makeActionBtn('action-start', 'Re-open', () => updateStatus(task.id, 'Pending')));
    }
    return buttons;
  }
  
  function buildCardMenuElement(task, { showAssignee }) {
    const items = buildCardMenuItems(task, { showAssignee });
    const wrap = document.createElement('div'); wrap.className = 'card-menu';
    if (items.length === 0) return wrap; // nothing to show — keep an empty wrapper for layout
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button'; menuBtn.className = 'card-menu-btn';
    menuBtn.setAttribute('aria-label', 'More options'); menuBtn.textContent = '⋮';
    const menuList = document.createElement('div');
    menuList.className = 'card-menu-list'; menuList.hidden = true;
  
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'card-menu-item'; btn.textContent = item.label;
      if (item.disabled) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => { menuList.hidden = true; item.onClick(); });
      }
      menuList.appendChild(btn);
    });
  
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.card-menu-list').forEach((l) => { if (l !== menuList) l.hidden = true; });
      const willShow = menuList.hidden;
      menuList.hidden = !menuList.hidden;
      if (willShow) positionCardMenu(menuBtn, menuList);
    });
    wrap.appendChild(menuBtn); wrap.appendChild(menuList);
    return wrap;
  }
  
  function renderTaskCard(task, { showAssignee, allowActions, verificationMode = false, useCreatedDueDate = false }) {
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority}`;
    const statusClass = task.status.replace(/\s/g, '');
    card.innerHTML = `
      <div class="task-card-top">
        <div>
          <div class="task-card-project">${escapeHtml(task.project?.name ?? '—')}</div>
          <div class="task-card-type">${escapeHtml(task.task_type?.name ?? '—')} · ${escapeHtml(task.department?.name ?? '—')}</div>
        </div>
        <span class="pill pill-${task.priority}">${task.priority}</span>
      </div>
      <p class="task-card-desc">${escapeHtml(task.description)}</p>
      <div class="task-meta task-meta-due">
        <span class="task-meta-due-label">Due</span>
        <div class="task-timer-wrap" data-task-timer-card-id="${task.id}">${useCreatedDueDate ? fmtEmployeeTimerHtml(task) : (task.target_date ? fmtDateOnly(task.target_date) : '—')}</div>
      </div>
      <div class="task-meta task-meta-files">
        ${task.attachment_url ? `<a class="attachment-link" href="${task.attachment_url}" target="_blank" rel="noopener">📎 Attachment</a>` : ''}
        ${task.voice_note_url ? `<a class="attachment-link" href="${task.voice_note_url}" target="_blank" rel="noopener">🎤 Voice note</a>` : ''}
      </div>
      ${showAssignee ? `<div class="assigned-line">Assigned to <strong>${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong> by ${escapeHtml(task.assigned_by_user?.full_name ?? '—')}</div>` : ''}
      ${task.status_note ? `<div class="assigned-line">${escapeHtml(task.status_note)}</div>` : ''}
      ${verificationBadgeHtml(task)}
      <div class="task-card-footer">
        <span class="pill pill-${statusClass}">${task.status}</span>
        <div class="task-actions"></div>
      </div>
    `;
    if (allowActions && !verificationMode) {
      card.querySelector('.task-card-top').appendChild(buildCardMenuElement(task, { showAssignee }));
    }
    const actionsEl = card.querySelector('.task-actions');
    if (verificationMode) {
      if (verificationHasStarted(task)) {
        startVerificationInline(task, actionsEl);
      } else {
        const startBtn = makeActionBtn('action-start', '🔎 Start Verification', async () => {
          await clickStartVerification(task, actionsEl, startBtn);
        });
        actionsEl.appendChild(startBtn);
      }
      return card;
    }
  
    buildPrimaryStatusButtons(task, { showAssignee, allowActions }).forEach((btn) => actionsEl.appendChild(btn));
    return card;
  }
  // The dropdown menu (.card-menu-list) is position:fixed with no explicit
  // top/left, so it relies on the browser's implicit "static position" —
  // fragile, and it can end up off-screen or collapsed to nothing whenever an
  // ancestor's layout/width changes (e.g. table column width tweaks). This
  // sets real viewport coordinates instead, so it always shows up right next
  // to the button that opened it, regardless of table layout.
  function positionCardMenu(menuBtn, menuList) {
    const rect = menuBtn.getBoundingClientRect();
    const menuWidth = menuList.offsetWidth || 200;
    let left = rect.right - menuWidth;
    left = Math.min(left, window.innerWidth - menuWidth - 8);
    left = Math.max(8, left);
  
    let top = rect.bottom + 4;
    const menuHeight = menuList.offsetHeight || 160;
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 4;
      if (top < 8) top = 8;
    }
    menuList.style.top = `${top}px`;
    menuList.style.left = `${left}px`;
  }
  
  function makeActionBtn(cls, label, onClick) {
    const btn = document.createElement('button');
    btn.className = `action-btn ${cls}`; btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }
  
  async function updateStatus(taskId, status, status_note) {
    try {
      await api(`/tasks/${taskId}/status`, { method: 'PATCH', body: { status, status_note } });
      showToast('Task updated ✅', 'success'); reloadCurrentTaskView(); refreshNavBadges();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function holdTask(taskId) {
    try {
      await api(`/tasks/${taskId}/hold`, { method: 'PATCH' });
      showToast('Task on hold — timer paused ⏸', 'success');
      reloadCurrentTaskView();
      refreshNavBadges();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function resumeTask(taskId) {
    try {
      await api(`/tasks/${taskId}/resume`, { method: 'PATCH' });
      showToast('Task resumed — countdown restarted ▶', 'success');
      reloadCurrentTaskView();
      refreshNavBadges();
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function reloadCurrentTaskView() {
    if (state.activeView === 'all')           loadAllTasks();
    else if (state.activeView === 'my')       loadMyTasks();
    else if (state.activeView === 'overdue')  loadOverdueTasks();
    else if (state.activeView === 'verifications') loadVerifications();
    else if (state.activeView === 'reschedule-requests') loadRescheduleRequests();
  }
  
  document.addEventListener('click', () => {
    document.querySelectorAll('.card-menu-list').forEach((l) => { l.hidden = true; });
  });
  
  async function openAssignCheckpointGate() {
    const typeId = els.fTaskType.value;
    const typeName = els.fTaskType.options[els.fTaskType.selectedIndex]?.text || 'this task type';
    const modal = document.getElementById('taskCpModal');
    const listEl = document.getElementById('taskCpModalList');
    const msgEl = document.getElementById('taskCpModalMsg');
    const titleEl = document.getElementById('taskCpModalTitle');
    const assignBtn = document.getElementById('submitTaskCpModal');
    if (!modal || !listEl) {
      showFormMsg(els.addTaskMsg, 'Could not open checkpoint popup');
      return;
    }
    if (titleEl) titleEl.textContent = `Checkpoints — ${typeName}`;
    if (msgEl) { msgEl.hidden = true; msgEl.textContent = ''; }
    listEl.innerHTML = '<p class="form-note">Loading checkpoints…</p>';
    if (assignBtn) { assignBtn.disabled = true; assignBtn.hidden = false; }
    modal.hidden = false;

    let labels = [];
    try {
      const template = await api(`/master/task-types/${typeId}/checkpoints`);
      labels = (template || []).map((r) => r.label).filter(Boolean);
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message || 'Could not load checkpoints'; msgEl.hidden = false; }
    }

    if (!labels.length) {
      listEl.innerHTML = '<p class="form-note">No checkpoints for this task type. You can assign it now.</p>';
      if (assignBtn) assignBtn.disabled = false;
      return;
    }

    listEl.innerHTML = `<div class="checkpoint-list">${labels.map((label, i) => `
      <label class="checkpoint-item">
        <input type="checkbox" data-cp-label="${escapeHtml(label)}" data-cp-i="${i}" />
        <span>${escapeHtml(label)}</span>
      </label>`).join('')}</div>`;

    const syncAssignBtn = () => {
      const boxes = [...listEl.querySelectorAll('input[type=checkbox]')];
      const allTicked = boxes.length > 0 && boxes.every((b) => b.checked);
      if (assignBtn) assignBtn.disabled = !allTicked;
      if (msgEl) {
        if (allTicked) {
          msgEl.hidden = true;
          msgEl.textContent = '';
        } else {
          msgEl.textContent = 'Tick every checkpoint to assign this task.';
          msgEl.hidden = false;
        }
      }
    };
    listEl.querySelectorAll('input[type=checkbox]').forEach((box) => {
      box.addEventListener('change', () => {
        box.closest('.checkpoint-item')?.classList.toggle('cp-done', box.checked);
        syncAssignBtn();
      });
    });
    syncAssignBtn();
  }

  function closeTaskCpModal() {
    const modal = document.getElementById('taskCpModal');
    if (modal) modal.hidden = true;
  }
  document.getElementById('closeTaskCpModal')?.addEventListener('click', closeTaskCpModal);
  document.getElementById('cancelTaskCpModal')?.addEventListener('click', closeTaskCpModal);
  document.getElementById('submitTaskCpModal')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('taskCpModalMsg');
    const assignBtn = document.getElementById('submitTaskCpModal');
    const boxes = [...document.querySelectorAll('#taskCpModalList input[type=checkbox]')];
    const labels = boxes.map((b) => b.dataset.cpLabel || '').filter(Boolean);
    if (boxes.length && !boxes.every((b) => b.checked)) {
      if (msgEl) { msgEl.textContent = 'Tick every checkpoint to assign this task.'; msgEl.hidden = false; }
      return;
    }
    if (assignBtn) assignBtn.disabled = true;
    try {
      await actuallyAssignTask(labels);
      closeTaskCpModal();
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message || 'Could not assign task'; msgEl.hidden = false; }
      if (assignBtn) assignBtn.disabled = false;
    }
  });
  
  // ─── Send for verification ───────────────────────────────────────────────────
  async function openVerifyModal(taskId) {
    state.pendingTaskId = taskId;
    hideFormMsg(els.verifyFormMsg);
    els.verifyPerson.innerHTML = '<option value="">Loading…</option>';
    if (els.verifyFiles) els.verifyFiles.value = '';
    if (els.verifyModal) els.verifyModal.hidden = false;
    try {
      const verifiers = await api('/master/verifiers');
      fillSelect(els.verifyPerson, verifiers, { placeholder: 'Select a verifier', labelKey: 'full_name' });
    } catch (err) { showFormMsg(els.verifyFormMsg, err.message); }
  }
  els.closeVerifyModal?.addEventListener('click', () => { if (els.verifyModal) els.verifyModal.hidden = true; });
  els.cancelVerifyModal?.addEventListener('click', () => { if (els.verifyModal) els.verifyModal.hidden = true; });
  els.verifyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormMsg(els.verifyFormMsg);
    try {
      const formData = new FormData();
      formData.append('verifier_id', els.verifyPerson.value);
      const files = els.verifyFiles ? [...els.verifyFiles.files].slice(0, 3) : [];
      files.forEach((f) => formData.append('verification_files', f));
      await api(`/tasks/${state.pendingTaskId}/send-for-verification`, {
        method: 'PATCH', body: formData, isForm: true
      });
      showToast('Sent for verification ✅', 'success');
      if (els.verifyModal) els.verifyModal.hidden = true;
      reloadCurrentTaskView();
    } catch (err) { showFormMsg(els.verifyFormMsg, err.message); }
  });
  
  // ─── Verifier two-step flow: Start → Verify OR Send for Correction ───────────
  // Called when verifier clicks "Start Verification" on a card/row.
  // We toggle the card's action area to show the two choice buttons.
  function startVerificationInline(task, actionsEl) {
    const taskId = task?.id || task;
    actionsEl.innerHTML = '';
    actionsEl.appendChild(makeActionBtn('action-complete', '✅ Verify', () => {
      if (confirm('Mark this task as Verified?')) verifyApprove(taskId);
    }));
    actionsEl.appendChild(makeActionBtn('action-reject', '↩ Correction', () => openCorrectionModal(task)));
    actionsEl.appendChild(makeActionBtn('action-updation', '📝 Updation', () => openUpdationModal(task)));
  }
  
  async function verifyApprove(taskId) {
    try {
      await api(`/tasks/${taskId}/verify`, { method: 'PATCH', body: { approved: true } });
      showToast('Task verified ✅', 'success');
      loadVerifications();
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // ─── Correction Modal (verifier sends correction note + optional voice) ────────
  let corrVoiceBlob = null;
  let corrMediaRecorder = null;
  
  function openCorrectionModal(taskOrId) {
    const task = taskOrId && typeof taskOrId === 'object' ? taskOrId : { id: taskOrId };
    state.pendingTaskId = task.id;
    if (els.correctionNote) els.correctionNote.value = '';
    if (els.correctionFormMsg) els.correctionFormMsg.hidden = true;
    if (els.corrVoicePlayback) {
    els.corrVoicePlayback.hidden = true;
    els.corrVoicePlayback.src = '';
    }
    if (els.corrRecordStatus) els.corrRecordStatus.textContent = '';
    if (els.corrStartRecord) els.corrStartRecord.disabled = false;
    if (els.corrStopRecord) els.corrStopRecord.disabled = true;
    corrVoiceBlob = null;
    fillDuePrompt('correction', task);
    if (els.correctionModal) els.correctionModal.hidden = false;
  }
  
  els.closeCorrectionModal?.addEventListener('click', stopCorrectionRecordingAndClose);
  els.cancelCorrectionModal?.addEventListener('click', stopCorrectionRecordingAndClose);
  document.getElementById('correction-due-action')?.addEventListener('change', () => syncDueActionFields('correction'));
  document.getElementById('updation-due-action')?.addEventListener('change', () => syncDueActionFields('updation'));
  function stopCorrectionRecordingAndClose() {
    if (corrMediaRecorder && corrMediaRecorder.state !== 'inactive') corrMediaRecorder.stop();
    const modal = els.correctionModal || document.getElementById('correctionModal');
    if (modal) modal.hidden = true;
  }
  
  // Voice recording for correction modal
  els.corrStartRecord?.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      corrMediaRecorder = new MediaRecorder(stream);
      corrMediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      corrMediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        corrVoiceBlob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(corrVoiceBlob);
        if (els.corrVoicePlayback) {
        els.corrVoicePlayback.src = url;
        els.corrVoicePlayback.hidden = false;
        }
        if (els.corrRecordStatus) els.corrRecordStatus.textContent = '✅ Recording saved';
        if (els.corrStartRecord) els.corrStartRecord.disabled = false;
        if (els.corrStopRecord) els.corrStopRecord.disabled = true;
      };
      corrMediaRecorder.start();
      if (els.corrStartRecord) els.corrStartRecord.disabled = true;
      if (els.corrStopRecord) els.corrStopRecord.disabled = false;
      if (els.corrRecordStatus) els.corrRecordStatus.textContent = '🔴 Recording…';
      if (els.corrVoicePlayback) els.corrVoicePlayback.hidden = true;
    } catch (err) {
      if (els.corrRecordStatus) els.corrRecordStatus.textContent = '❌ Microphone access denied';
    }
  });
  els.corrStopRecord?.addEventListener('click', () => {
    if (corrMediaRecorder && corrMediaRecorder.state !== 'inactive') corrMediaRecorder.stop();
  });
  
  els.correctionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = els.correctionFormMsg || document.getElementById('correctionFormMsg');
    if (msg) msg.hidden = true;
    const note = (els.correctionNote?.value || '').trim();
    if (!note) {
      if (msg) {
        msg.textContent = 'Please write a correction note before sending';
        msg.hidden = false;
      } else {
        showToast('Please write a correction note before sending', 'error');
      }
      return;
    }
    try {
      const formData = new FormData();
      formData.append('note', note);
      const action = document.getElementById('correction-due-action')?.value || 'keep';
      if (action === 'hours' || action === 'days') {
        const extraAmount = document.getElementById('correction-extra-amount')?.value || '';
        if (!extraAmount || Number(extraAmount) <= 0) {
          if (msg) {
            msg.textContent = 'Enter how much extra time to give';
            msg.hidden = false;
          }
          return;
        }
        formData.append('extra_unit', action);
        formData.append('extra_amount', extraAmount);
      }
      if (action === 'new') {
        const newDue = document.getElementById('correction-new-due')?.value || '';
        if (!newDue) {
          if (msg) {
            msg.textContent = 'Pick the new due date and time';
            msg.hidden = false;
          }
          return;
        }
        formData.append('new_target_date', datetimeLocalToIso(newDue));
      }
      if (corrVoiceBlob) {
        formData.append('correction_voice', corrVoiceBlob, 'correction_voice.webm');
      }
      await api(`/tasks/${state.pendingTaskId}/send-correction`, {
        method: 'PATCH', body: formData, isForm: true
      });
      showToast('Correction sent ✅', 'success');
      const modal = els.correctionModal || document.getElementById('correctionModal');
      if (modal) modal.hidden = true;
      loadVerifications();
    } catch (err) {
      if (msg) {
        msg.textContent = err.message;
        msg.hidden = false;
      } else {
        showToast(err.message, 'error');
      }
    }
  });
  
  const _startVerifyBusy = new Set();

  function showBusyOverlay(msg) {
    let el = document.getElementById('tfBusyOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tfBusyOverlay';
      el.className = 'tf-busy-overlay';
      el.innerHTML = '<div class="tf-busy-card"><div class="tf-busy-spinner"></div><span class="tf-busy-msg"></span></div>';
      (document.getElementById('appScreen') || document.body).appendChild(el);
    }
    const msgEl = el.querySelector('.tf-busy-msg');
    if (msgEl) msgEl.textContent = msg || 'Loading…';
    el.hidden = false;
  }

  function hideBusyOverlay() {
    const el = document.getElementById('tfBusyOverlay');
    if (el) el.hidden = true;
  }

  function verificationHasStarted(task) {
    return !!(task?.verification_started_at || task?.verification_started_by);
  }

  async function startVerification(taskId) {
    return api(`/tasks/${taskId}/start-verification`, { method: 'PATCH' });
  }
  
  async function clickStartVerification(task, actionsEl, btn) {
    const id = task?.id;
    if (!id || _startVerifyBusy.has(id) || verificationHasStarted(task)) return;
    _startVerifyBusy.add(id);
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.style.pointerEvents = 'none';
      btn.textContent = 'Starting…';
    }
    showBusyOverlay('Starting verification…');
    try {
      const updated = await startVerification(id);
      const next = {
        ...task,
        ...(updated || {}),
        verification_started_at: updated?.verification_started_at || new Date().toISOString(),
        verification_started_by: updated?.verification_started_by || state.user?.id,
      };
      startVerificationInline(next, actionsEl);
      showToast('Verification started', 'success');
      await loadVerifications({ quiet: true });
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.style.pointerEvents = '';
        btn.textContent = '🔎 Start Verification';
      }
      showToast(err.message, 'error');
    } finally {
      _startVerifyBusy.delete(id);
      hideBusyOverlay();
    }
  }

  async function loadVerifications(opts = {}) {
    if (!opts.quiet) {
      if (els.verificationsTableBody) {
        els.verificationsTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading…</td></tr>`;
      }
      if (els.verificationsList) {
    els.verificationsList.innerHTML = '<div class="empty-state">Loading…</div>';
      }
    }
    try {
      const tasks = await api('/tasks/verifications');
      renderVerificationsTable(els.verificationsTableBody, tasks);
      renderTaskList(els.verificationsList, tasks, { showAssignee: true, allowActions: false, verificationMode: true });
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // ─── Reschedule requests ────────────────────────────────────────────────────
  // Admin: every request still awaiting a decision, with Approve/Reject.
  // Everyone else: only their own requests (any status), read-only.
  async function loadRescheduleRequests() {
    const wrap = document.getElementById('reschedRequestsList');
    const sub = document.getElementById('reschedViewSub');
    const isAdmin = state.user.role === 'admin';
    sub.textContent = isAdmin
      ? "Employees' requests to move a task's date — approve to apply the new date, or reject to leave it as is."
      : 'Status of the reschedule requests you\'ve sent.';
    wrap.innerHTML = '<div class="empty-state">Loading…</div>';
    const tbody = document.getElementById('reschedRequestsTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Loading…</td></tr>`;
    try {
      const tasks = await api('/tasks/reschedule-requests');
      renderRescheduleRequests(wrap, tasks, isAdmin);
      if (tbody) renderRescheduleRequestsTable(tbody, tasks, isAdmin);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // Desktop table view — was previously missing, so the desktop table stayed
  // empty forever even though the nav badge and the mobile card list both had
  // the right count/data.
  function renderRescheduleRequestsTable(tbody, tasks, isAdmin) {
    if (!tasks || tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><span class="emoji">🎉</span>${isAdmin ? 'No reschedule requests pending' : 'You have no reschedule requests'}</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
  
      const tdSr = document.createElement('td');
      tdSr.textContent = index + 1;
  
      const tdEmployee = document.createElement('td');
      tdEmployee.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong>`;
  
      const tdTask = document.createElement('td');
      tdTask.textContent = task.description ?? '—';
  
      const tdCurrentDate = document.createElement('td');
      tdCurrentDate.textContent = fmtDate(task.target_date);
  
      const tdRequestedDate = document.createElement('td');
      tdRequestedDate.textContent = fmtDateOnly(task.reschedule_requested_date);
  
      const tdReason = document.createElement('td');
      tdReason.textContent = task.reschedule_reason || '—';
  
      const tdStatus = document.createElement('td');
      const statusPill = task.reschedule_status === 'Pending' ? 'pill-Pending'
        : task.reschedule_status === 'Approved' ? 'pill-Completed'
        : 'pill-Rejected';
      tdStatus.innerHTML = `<span class="pill ${statusPill}">${escapeHtml(task.reschedule_status)}</span>`;
  
      const tdDecidedBy = document.createElement('td');
      if (task.reschedule_status !== 'Pending' && task.reschedule_decided_by_user) {
        tdDecidedBy.innerHTML = `${escapeHtml(task.reschedule_decided_by_user.full_name)} · ${escapeHtml(fmtDate(task.reschedule_decided_at))}`;
      } else {
        tdDecidedBy.textContent = '—';
      }
  
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      if (isAdmin && task.reschedule_status === 'Pending') {
        tdActions.appendChild(makeActionBtn('action-complete', '✅ Approve', () => decideRescheduleRequest(task.id, 'approve')));
        tdActions.appendChild(makeActionBtn('action-reject', '❌ Reject', () => decideRescheduleRequest(task.id, 'reject')));
      } else {
        tdActions.textContent = '—';
      }
  
      tr.append(tdSr, tdEmployee, tdTask, tdCurrentDate, tdRequestedDate, tdReason, tdStatus, tdDecidedBy, tdActions);
      tbody.appendChild(tr);
    });
  }
  
  function renderRescheduleRequests(wrap, tasks, isAdmin) {
    if (!tasks.length) {
      wrap.innerHTML = `<div class="empty-state"><span class="emoji">🎉</span>${isAdmin ? 'No reschedule requests pending' : 'You have no reschedule requests'}</div>`;
      return;
    }
    wrap.innerHTML = '';
    tasks.forEach((task) => {
      const card = document.createElement('div');
      card.className = 'task-card';
      const statusPill = task.reschedule_status === 'Pending' ? 'pill-Pending'
        : task.reschedule_status === 'Approved' ? 'pill-Completed'
        : 'pill-Rejected';
      card.innerHTML = `
        <div class="task-card-header">
          <span class="pill ${statusPill}">${escapeHtml(task.reschedule_status)}</span>
          <span style="font-size:12px;color:#888">${escapeHtml(task.project?.name ?? '')}</span>
        </div>
        <div class="task-card-body">
          ${isAdmin ? `<div class="task-detail-line"><span class="task-detail-label">Employee:</span> ${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</div>` : ''}
          <div class="task-detail-line"><strong>${escapeHtml(task.description ?? '')}</strong></div>
          <div class="task-detail-line"><span class="task-detail-label">Current date:</span> ${escapeHtml(fmtDate(task.target_date))}</div>
          <div class="task-detail-line"><span class="task-detail-label">Requested date:</span> ${escapeHtml(fmtDateOnly(task.reschedule_requested_date))}</div>
          ${task.reschedule_reason ? `<div class="task-detail-line"><span class="task-detail-label">Reason:</span> ${escapeHtml(task.reschedule_reason)}</div>` : ''}
          ${task.reschedule_status !== 'Pending' && task.reschedule_decided_by_user ? `<div class="task-detail-line"><span class="task-detail-label">Decided by:</span> ${escapeHtml(task.reschedule_decided_by_user.full_name)} · ${escapeHtml(fmtDate(task.reschedule_decided_at))}</div>` : ''}
        </div>
        ${isAdmin && task.reschedule_status === 'Pending' ? `
        <div class="task-card-actions">
          <button class="action-btn action-complete resched-approve-btn">✅ Approve</button>
          <button class="action-btn action-reject resched-reject-btn">❌ Reject</button>
        </div>` : ''}
      `;
      if (isAdmin && task.reschedule_status === 'Pending') {
        card.querySelector('.resched-approve-btn').addEventListener('click', () => decideRescheduleRequest(task.id, 'approve'));
        card.querySelector('.resched-reject-btn').addEventListener('click', () => decideRescheduleRequest(task.id, 'reject'));
      }
      wrap.appendChild(card);
    });
  }
  
  async function decideRescheduleRequest(taskId, decision) {
    let reason = '';
    if (decision === 'reject') {
      reason = prompt('Reason for rejecting this reschedule request (optional):') || '';
    }
    try {
      await api(`/tasks/${taskId}/reschedule-request/${decision}`, {
        method: 'PATCH', body: decision === 'reject' ? { reason } : {}
      });
      showToast(decision === 'approve' ? 'Reschedule approved ✅' : 'Reschedule rejected', 'success');
      loadRescheduleRequests();
      refreshNavBadges();
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // ─── Corrections view (employee) ──────────────────────────────────────────────
  async function loadCorrections() {
    if (els.correctionsTableBody) {
      els.correctionsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Loading corrections…</td></tr>`;
    }
    if (els.correctionsList) {
      els.correctionsList.innerHTML = '<div class="empty-state">Loading corrections…</div>';
    }
    try {
      const allTasks = await api('/tasks/my');
      const corrections = allTasks.filter((t) => t.verification_status === 'Verification Rejected');
      renderCorrectionsTable(corrections);
      renderCorrectionsList(corrections);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // Desktop table view — same data as the card view below, just laid out as rows.
  function renderCorrectionsTable(tasks) {
    const tbody = els.correctionsTableBody;
    if (!tbody) return;
    if (!tasks.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><span class="emoji">✅</span>No corrections — you're all good!</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
  
      const tdSr = document.createElement('td');
      tdSr.innerHTML = `<span class="sr-number">${index + 1}</span>`;
  
      const tdDetails = document.createElement('td');
      tdDetails.className = 'task-name-cell';
      tdDetails.innerHTML = buildTaskDetailsHtml(task, { showAssignee: false });
  
      const tdNote = document.createElement('td');
      tdNote.innerHTML = `
        <div class="correction-note-box" style="margin:0">
          <div class="correction-note-label">↩ From <strong>${escapeHtml(task.verifier?.full_name ?? 'Verifier')}</strong>:</div>
          <div class="correction-note-text">${escapeHtml(task.verification_note ?? '(no note)')}</div>
          ${task.correction_voice_url ? `<a href="${task.correction_voice_url}" target="_blank" rel="noopener" class="attachment-link" style="margin-top:6px;display:inline-block">🎤 Voice note</a>` : ''}
        </div>
      `;
  
      const tdPriority = document.createElement('td');
      tdPriority.innerHTML = `<span class="pill pill-${task.priority}">${task.priority}</span>`;
  
      const tdStatus = document.createElement('td');
      tdStatus.innerHTML = `<span class="pill pill-InProgress">${escapeHtml(task.status)}</span>`;
  
      const tdActions = document.createElement('td');
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'task-actions';
      actionsWrap.appendChild(makeActionBtn('action-start', '🔄 Resend for Verification', () => openResendVerifyModal(task)));
      tdActions.appendChild(actionsWrap);
  
      tr.append(tdSr, tdDetails, tdNote, tdPriority, tdStatus, tdActions);
      tbody.appendChild(tr);
    });
  }
  
  function renderCorrectionsList(tasks) {
    if (!tasks.length) {
      els.correctionsList.innerHTML = `<div class="empty-state"><span class="emoji">✅</span>No corrections — you're all good!</div>`;
      return;
    }
    els.correctionsList.innerHTML = '';
    tasks.forEach((task) => {
      const card = document.createElement('div');
      card.className = `task-card priority-${task.priority}`;
      card.innerHTML = `
        <div class="task-card-top">
          <div>
            <div class="task-card-project">${escapeHtml(task.project?.name ?? '—')}</div>
            <div class="task-card-type">${escapeHtml(task.task_type?.name ?? '—')} · ${escapeHtml(task.department?.name ?? '—')}</div>
          </div>
          <span class="pill pill-Rejected">Correction Needed</span>
        </div>
        <p class="task-card-desc">${escapeHtml(task.description)}</p>
        <div class="correction-note-box">
          <div class="correction-note-label">↩ Correction note from <strong>${escapeHtml(task.verifier?.full_name ?? 'Verifier')}</strong>:</div>
          <div class="correction-note-text">${escapeHtml(task.verification_note ?? '(no note)')}</div>
          ${task.correction_voice_url ? `<a href="${task.correction_voice_url}" target="_blank" rel="noopener" class="attachment-link" style="margin-top:6px;display:inline-block">🎤 Voice note from verifier</a>` : ''}
        </div>
        ${task.verification_attachment_urls?.length ? `<div class="task-meta">${task.verification_attachment_urls.map((u, i) => `<a href="${u}" target="_blank" rel="noopener" class="attachment-link">📎 Your file ${i + 1}</a>`).join(' ')}</div>` : ''}
        <div class="task-card-footer">
          <span class="pill pill-InProgress">${task.status}</span>
          <div class="task-actions" id="corr-actions-${task.id}"></div>
        </div>
      `;
      const actionsEl = card.querySelector(`#corr-actions-${task.id}`);
      actionsEl.appendChild(makeActionBtn('action-start', '🔄 Resend for Verification', () => openResendVerifyModal(task)));
      els.correctionsList.appendChild(card);
    });
  }
  
  // Resend for verification (employee after correction — verifier is already known)
  function openResendVerifyModal(task) {
    state.pendingTaskId = task.id;
    state.pendingVerifierId = task.verifier?.id ?? null;
    els.resendVerifierName.textContent = task.verifier?.full_name ?? 'the verifier';
    els.resendVerifyFormMsg.hidden = true;
    els.resendFiles.value = '';
    els.resendVerifyModal.hidden = false;
  }
  els.closeResendVerifyModal?.addEventListener('click', () => { els.resendVerifyModal.hidden = true; });
  els.cancelResendVerifyModal?.addEventListener('click', () => { els.resendVerifyModal.hidden = true; });
  els.resendVerifyForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.resendVerifyFormMsg.hidden = true;
    try {
      if (!state.pendingVerifierId) {
        throw new Error('Verifier not found — please contact your admin');
      }
      const formData = new FormData();
      formData.append('verifier_id', state.pendingVerifierId);
      const files = [...els.resendFiles.files].slice(0, 3);
      files.forEach((f) => formData.append('verification_files', f));
      await api(`/tasks/${state.pendingTaskId}/send-for-verification`, {
        method: 'PATCH', body: formData, isForm: true
      });
      showToast('Resent for verification ✅', 'success');
      els.resendVerifyModal.hidden = true;
      loadCorrections();
    } catch (err) { els.resendVerifyFormMsg.textContent = err.message; els.resendVerifyFormMsg.hidden = false; }
  });
  
  function renderVerificationsTable(tbody, tasks) {
    if (!tasks || tasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><span class="emoji">📭</span>No verification requests</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
      const tr = document.createElement('tr');
  
      // Task Sr No
      const tdSr = document.createElement('td');
      tdSr.textContent = index + 1;
  
      // Project
      const tdProject = document.createElement('td');
      tdProject.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.project?.name ?? '—')}</strong>`;
  
      // Task Type
      const tdTaskType = document.createElement('td');
      tdTaskType.textContent = task.task_type?.name ?? '—';
  
      // Submitted By (person who did the task and sent for verification)
      const tdSubmittedBy = document.createElement('td');
      tdSubmittedBy.innerHTML = `<strong style="font-weight:600">${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong>`;
  
      // Attachments
      const tdAttach = document.createElement('td');
      tdAttach.style.textAlign = 'center';
      const links = [];
      if (task.attachment_url) {
        links.push(`<a href="${task.attachment_url}" target="_blank" rel="noopener" class="media-link" title="View attachment">📎</a>`);
      }
      if (task.voice_note_url) {
        links.push(`<a href="${task.voice_note_url}" target="_blank" rel="noopener" class="media-link" title="Play voice note">🎤</a>`);
      }
      tdAttach.innerHTML = links.length ? links.join(' ') : `<span class="media-none">—</span>`;
  
      // Submission date
      const tdDate = document.createElement('td');
      tdDate.style.whiteSpace = 'nowrap';
      tdDate.textContent = fmtDate(task.verification_requested_at ?? task.updated_at ?? task.created_at);
  
      // Actions — Verify / Correction / Updation, shown directly (no gate)
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
  
      function showVerifyActions() {
        tdActions.innerHTML = '';
        tdActions.appendChild(makeActionBtn('action-complete', '✅ Verify', () => {
          if (confirm('Mark this task as Verified?')) verifyApprove(task.id);
        }));
        tdActions.appendChild(makeActionBtn('action-reject', '↩ Correction', () => openCorrectionModal(task)));
        tdActions.appendChild(makeActionBtn('action-updation', '📝 Updation', () => openUpdationModal(task)));
      }
  
      // Actions — "Start Verification" → then Verify or Send for Correction
      if (verificationHasStarted(task)) {
        // Already started (recorded on the task itself) — show verify/correction buttons directly
        showVerifyActions();
      } else {
        const startBtn = makeActionBtn('action-start', '🔎 Start Verification', async () => {
          await clickStartVerification(task, tdActions, startBtn);
        });
        tdActions.appendChild(startBtn);
      }
      tr.append(tdSr, tdProject, tdTaskType, tdSubmittedBy, tdAttach, tdDate, tdActions);
      tbody.appendChild(tr);
    });
  }
  
  // ─── Reschedule ───────────────────────────────────────────────────────────────
  function openRescheduleModal(taskId, currentTargetDate) {
  //   state.pendingTaskId = taskId; els.rescheduleFormMsg.hidden = true;
  //   els.rescheduleDate.value = toDatetimeLocalValue(currentTargetDate);
  //   els.rescheduleModal.hidden = false;
  // }
  // els.closeRescheduleModal?.addEventListener('click', () => { els.rescheduleModal.hidden = true; });
  // els.cancelRescheduleModal?.addEventListener('click', () => { els.rescheduleModal.hidden = true; });
  // els.rescheduleForm?.addEventListener('submit', async (e) => {
  //   e.preventDefault(); els.rescheduleFormMsg.hidden = true;
  //   try {
  //     await api(`/tasks/${state.pendingTaskId}/reschedule`, {
  //       method: 'PATCH', body: { target_date: els.rescheduleDate.value }
  //     });
  //     showToast('Task rescheduled ✅', 'success');
  //     els.rescheduleModal.hidden = true; reloadCurrentTaskView(); refreshNavBadges();
  //   } catch (err) { els.rescheduleFormMsg.textContent = err.message; els.rescheduleFormMsg.hidden = false; }
  // });
  
  
  state.pendingTaskId = taskId; els.rescheduleFormMsg.hidden = true;
    els.rescheduleDate.value = toDatetimeLocalValue(currentTargetDate);
    els.rescheduleReason.value = '';
    els.rescheduleModal.hidden = false;
  };
  els.closeRescheduleModal?.addEventListener('click', () => { els.rescheduleModal.hidden = true; });
  els.cancelRescheduleModal?.addEventListener('click', () => { els.rescheduleModal.hidden = true; });
  els.rescheduleForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.rescheduleFormMsg.hidden = true;
    try {
      await api(`/tasks/${state.pendingTaskId}/reschedule`, {
        method: 'PATCH', body: { target_date: els.rescheduleDate.value, reason: els.rescheduleReason.value }
      });
      showToast('Task rescheduled ✅', 'success');
      els.rescheduleModal.hidden = true; els.rescheduleReason.value = ''; reloadCurrentTaskView(); refreshNavBadges();
    } catch (err) { els.rescheduleFormMsg.textContent = err.message; els.rescheduleFormMsg.hidden = false; }
  });
  
  
    //17th july chg above
  // ─── Reschedule request (employee — goes to admin for approval) ───────────────
  function openReschedRequestModal(taskId) {
    state.pendingTaskId = taskId; els.reschedRequestFormMsg.hidden = true;
    els.reschedreqDate.value = ''; els.reschedreqReason.value = '';
    els.reschedRequestModal.hidden = false;
  }
  els.closeReschedRequestModal?.addEventListener('click', () => { els.reschedRequestModal.hidden = true; });
  els.cancelReschedRequestModal?.addEventListener('click', () => { els.reschedRequestModal.hidden = true; });
  els.reschedRequestForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.reschedRequestFormMsg.hidden = true;
    try {
      await api(`/tasks/${state.pendingTaskId}/reschedule-request`, {
        method: 'POST',
        body: { requested_date: els.reschedreqDate.value, reason: els.reschedreqReason.value }
      });
      showToast('Reschedule request sent ✅', 'success');
      els.reschedRequestModal.hidden = true; reloadCurrentTaskView(); refreshNavBadges();
    } catch (err) { els.reschedRequestFormMsg.textContent = err.message; els.reschedRequestFormMsg.hidden = false; }
  });
  
  // ─── Reassign ─────────────────────────────────────────────────────────────────
  function openReassignModal(taskId) {
    state.pendingTaskId = taskId; els.reassignFormMsg.hidden = true;
    fillSelect(els.reassignEmployee, state.master.employees, { placeholder: 'Select employee', labelKey: 'full_name' });
    els.reassignModal.hidden = false;
  }
  els.closeReassignModal?.addEventListener('click', () => { els.reassignModal.hidden = true; });
  els.cancelReassignModal?.addEventListener('click', () => { els.reassignModal.hidden = true; });
  els.reassignForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.reassignFormMsg.hidden = true;
    try {
      await api(`/tasks/${state.pendingTaskId}/reassign`, {
        method: 'PATCH', body: { assigned_to: els.reassignEmployee.value }
      });
      showToast('Task reassigned ✅', 'success');
      els.reassignModal.hidden = true; reloadCurrentTaskView();
    } catch (err) { els.reassignFormMsg.textContent = err.message; els.reassignFormMsg.hidden = false; }
  });
  
  // ─── Tickets ──────────────────────────────────────────────────────────────────
  
  const TICKET_CATEGORY_LABELS = {
    'Technical': '🔧 Technical',
    'Task':      '📋 Task related',
    'Access':    '🔑 Access / Login',
    'Other':     '📌 Other',
    'General':   '📌 General'
  };
  
  // Categories that require screenshot / screen recording
  const TICKET_NEEDS_MEDIA = new Set(['Technical', 'Access']);
  
  function openTicketModal(taskId, taskDescription) {
    state.pendingTaskId = taskId || null;
    els.ticketFormMsg.hidden = true;
    els.ticketDescription.value = '';
    document.getElementById('ticket-category').value = '';
    document.getElementById('ticketMediaFields').hidden = true;
    const mediaInput = document.getElementById('ticket-media');
    if (mediaInput) mediaInput.value = '';
  
    // Task banner
    const banner     = document.getElementById('ticketTaskBanner');
    const bannerText = document.getElementById('ticketTaskBannerText');
    if (taskId && taskDescription) {
      bannerText.textContent = taskDescription.length > 80
        ? taskDescription.slice(0, 80) + '…'
        : taskDescription;
      banner.hidden = false;
      document.getElementById('ticket-category').value = 'Task';
      document.getElementById('ticketMediaFields').hidden = true;
    } else {
      banner.hidden = true;
    }
  
    els.ticketModal.hidden = false;
  }
  
  // Show/hide media upload when category changes
  document.getElementById('ticket-category')?.addEventListener('change', function () {
    const mediaWrap = document.getElementById('ticketMediaFields');
    mediaWrap.hidden = !TICKET_NEEDS_MEDIA.has(this.value);
    if (mediaWrap.hidden) {
      const mi = document.getElementById('ticket-media');
      if (mi) mi.value = '';
    }
  });
  
  els.openRaiseTicket?.addEventListener('click', () => openTicketModal(null));
  els.closeTicketModal?.addEventListener('click',  () => { els.ticketModal.hidden = true; });
  els.cancelTicketModal?.addEventListener('click', () => { els.ticketModal.hidden = true; });
  
  els.ticketForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.ticketFormMsg.hidden = true;
  
    const category    = document.getElementById('ticket-category').value;
    const description = els.ticketDescription.value.trim();
    if (!category)    { els.ticketFormMsg.textContent = 'Please select a category'; els.ticketFormMsg.hidden = false; return; }
    if (!description) { els.ticketFormMsg.textContent = 'Please describe the issue'; els.ticketFormMsg.hidden = false; return; }
  
    try {
      const mediaInput = document.getElementById('ticket-media');
      const hasMedia   = mediaInput && mediaInput.files[0] && TICKET_NEEDS_MEDIA.has(category);
  
      if (hasMedia) {
        // Use FormData so the media file goes through the backend (same pattern as task attachments)
        const formData = new FormData();
        formData.append('task_id',     state.pendingTaskId || '');
        formData.append('category',    category);
        formData.append('description', description);
        formData.append('media',       mediaInput.files[0]);
        await api('/tickets', { method: 'POST', body: formData, isForm: true });
      } else {
        await api('/tickets', { method: 'POST', body: { task_id: state.pendingTaskId, category, description } });
      }
  
      showToast('Ticket raised ✅', 'success');
      els.ticketModal.hidden = true;
      if (state.activeView === 'tickets') loadTickets();
      reloadCurrentTaskView();
      refreshNavBadges();
    } catch (err) {
      els.ticketFormMsg.textContent = err.message;
      els.ticketFormMsg.hidden = false;
    }
  });
  
  // ─── Updation Modal (verifier/admin → employee: request task updation) ──────────
  function openUpdationModal(taskOrId) {
    const task = taskOrId && typeof taskOrId === 'object' ? taskOrId : { id: taskOrId };
    state.pendingTaskId = task.id;
    const note = document.getElementById('updation-note');
    const msg = document.getElementById('updationFormMsg');
    const modal = document.getElementById('updationModal');
    if (note) note.value = '';
    if (msg) msg.hidden = true;
    fillDuePrompt('updation', task);
    if (modal) modal.hidden = false;
  }
  
  function closeUpdationModal() {
    const modal = document.getElementById('updationModal');
    if (modal) modal.hidden = true;
  }
  document.getElementById('closeUpdationModal')?.addEventListener('click', closeUpdationModal);
  document.getElementById('cancelUpdationModal')?.addEventListener('click', closeUpdationModal);
  document.getElementById('updationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = (document.getElementById('updation-note')?.value || '').trim();
    const msgEl = document.getElementById('updationFormMsg');
    if (msgEl) msgEl.hidden = true;
    if (!note) {
      if (msgEl) {
      msgEl.textContent = 'Please write an updation note before sending';
      msgEl.hidden = false;
      }
      return;
    }
    try {
      await api(`/tasks/${state.pendingTaskId}/send-updation`, {
        method: 'PATCH',
        body: (() => {
          const action = document.getElementById('updation-due-action')?.value || 'keep';
          const payload = { note };
          if (action === 'hours' || action === 'days') {
            payload.extra_unit = action;
            payload.extra_amount = document.getElementById('updation-extra-amount')?.value || '';
          }
          if (action === 'new') {
            payload.new_target_date = datetimeLocalToIso(document.getElementById('updation-new-due')?.value || '');
          }
          return payload;
        })(),
      });
      showToast('Updation request sent ✅', 'success');
      closeUpdationModal();
      loadVerifications();
    } catch (err) {
      if (msgEl) {
      msgEl.textContent = err.message;
      msgEl.hidden = false;
      } else {
        showToast(err.message, 'error');
      }
    }
  });
  
  // ─── Load & Render Updations (employee view) ──────────────────────────────────
  async function loadUpdations() {
    const listEl = document.getElementById('updationsList');
    if (listEl) listEl.innerHTML = '<div class="empty-state">Loading updations…</div>';
    try {
      const allTasks = await api('/tasks/my');
      const updations = allTasks.filter((t) => t.verification_status === 'Updation Required');
      renderUpdationsList(updations);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function renderUpdationsList(tasks) {
    const listEl = document.getElementById('updationsList');
    if (!listEl) return;
    if (!tasks.length) {
      listEl.innerHTML = `<div class="empty-state"><span class="emoji">📝</span>No updations pending — you're all good!</div>`;
      return;
    }
    listEl.innerHTML = '';
    tasks.forEach((task) => {
      const card = document.createElement('div');
      card.className = `task-card priority-${task.priority}`;
      card.innerHTML = `
        <div class="task-card-top">
          <div>
            <div class="task-card-project">${escapeHtml(task.project?.name ?? '—')}</div>
            <div class="task-card-type">${escapeHtml(task.task_type?.name ?? '—')} · ${escapeHtml(task.department?.name ?? '—')}</div>
          </div>
          <span class="pill pill-Pending">📝 Updation Required</span>
        </div>
        <p class="task-card-desc">${escapeHtml(task.description)}</p>
        <div class="correction-note-box">
          <div class="correction-note-label">📝 Updation note from <strong>${escapeHtml(task.verifier?.full_name ?? 'Verifier')}</strong>:</div>
          <div class="correction-note-text">${escapeHtml(task.updation_note ?? '(no note)')}</div>
        </div>
        <div class="task-card-footer">
          <span class="pill pill-InProgress">${task.status}</span>
          <div class="task-actions" id="upd-actions-${task.id}"></div>
        </div>
      `;
      const actionsEl = card.querySelector(`#upd-actions-${task.id}`);
      actionsEl.appendChild(makeActionBtn('action-start', '🔄 Resend for Verification', () => openResendVerifyModal(task)));
      listEl.appendChild(card);
    });
  }
  
  // ─── Solution Modal (admin / resolver) ───────────────────────────────────────
  let _solvingTicketId = null;
  
  function openSolutionModal(ticket) {
    _solvingTicketId = ticket.id;
    document.getElementById('solution-text').value = '';
    document.getElementById('solutionFormMsg').hidden = true;
  
    const info = document.getElementById('solutionTicketInfo');
    info.innerHTML = `
      <div class="solution-ticket-summary">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
          <span class="pill pill-Pending pill-sm">Open</span>
          <span class="ticket-category-chip">${escapeHtml(TICKET_CATEGORY_LABELS[ticket.category] || ticket.category)}</span>
        </div>
        <p class="solution-ticket-desc">"${escapeHtml(ticket.description.length > 120 ? ticket.description.slice(0,120)+'…' : ticket.description)}"</p>
        <p class="solution-ticket-meta">
          Raised by <strong>${escapeHtml(ticket.raised_by_user?.full_name ?? '—')}</strong>
          ${ticket.task ? ` · Task: <em>${escapeHtml(ticket.task.description.slice(0,60))}${ticket.task.description.length > 60 ? '…' : ''}</em>` : ''}
          · ${fmtDate(ticket.created_at)}
        </p>
        ${ticket.attachment_url ? `<div style="margin-top:6px"><a href="${escapeHtml(ticket.attachment_url)}" target="_blank" class="ghost-btn-text" style="font-size:0.8rem">📎 View attached screenshot/recording</a></div>` : ''}
      </div>
    `;
    document.getElementById('solutionModal').hidden = false;
  }
  
  document.getElementById('closeSolutionModal')?.addEventListener('click',  () => { document.getElementById('solutionModal').hidden = true; });
  document.getElementById('cancelSolutionModal')?.addEventListener('click', () => { document.getElementById('solutionModal').hidden = true; });
  
  document.getElementById('submitSolutionBtn')?.addEventListener('click', async () => {
    const solution = document.getElementById('solution-text').value.trim();
    const msgEl    = document.getElementById('solutionFormMsg');
    msgEl.hidden   = true;
    if (!solution) { msgEl.textContent = 'Please write a solution before submitting'; msgEl.hidden = false; return; }
    try {
      await api(`/tickets/${_solvingTicketId}/solve`, { method: 'PATCH', body: { solution } });
      showToast('Solution submitted & ticket resolved ✅', 'success');
      document.getElementById('solutionModal').hidden = true;
      loadTickets();
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.hidden = false;
    }
  });
  
  // ─── Load & Render ────────────────────────────────────────────────────────────
  async function loadTickets() {
    const titleEl = document.getElementById('ticketsViewTitle');
    const subEl   = document.getElementById('ticketsViewSub');
    if (titleEl) titleEl.textContent = '🎫 Tickets';
    if (subEl)   subEl.textContent   = 'Raise and track support issues.';
    els.ticketsList.innerHTML = '<div class="empty-state">Loading tickets…</div>';
    if (els.ticketsTableBody) {
      els.ticketsTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading tickets…</td></tr>';
    }
    try {
      const tickets = await api('/tickets');
      renderTicketsList(tickets);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  async function loadTicketsFiltered(statusFilter) {
    // Update view heading dynamically
    const titleEl = document.getElementById('ticketsViewTitle');
    const subEl   = document.getElementById('ticketsViewSub');
    if (titleEl) titleEl.textContent = statusFilter === 'Open' ? '🟠 Open Tickets' : '✅ Resolved Tickets';
    if (subEl)   subEl.textContent   = statusFilter === 'Open'
      ? 'All open tickets pending resolution.'
      : 'All resolved / closed tickets.';
  
    els.ticketsList.innerHTML = `<div class="empty-state">Loading ${statusFilter.toLowerCase()} tickets…</div>`;
    if (els.ticketsTableBody) {
      els.ticketsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Loading ${statusFilter.toLowerCase()} tickets…</td></tr>`;
    }
    try {
      const tickets = await api('/tickets');
      const filtered = tickets.filter(t => t.status === statusFilter);
      renderTicketsList(filtered, statusFilter);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function renderTicketsList(tickets, statusFilter) {
    const emptyMsg = statusFilter === 'Open' ? '🟠 No open tickets right now'
                : statusFilter === 'Resolved' ? '✅ No resolved tickets yet'
                : '🎫 No tickets yet';
    if (!tickets.length) {
      if (els.ticketsList) {
        els.ticketsList.innerHTML = `<div class="empty-state"><span class="emoji">🎫</span>${emptyMsg}</div>`;
      }
      if (els.ticketsTableBody) {
        els.ticketsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">${emptyMsg}</td></tr>`;
      }
      return;
    }
    if (els.ticketsList) els.ticketsList.innerHTML = '';
    if (els.ticketsTableBody) els.ticketsTableBody.innerHTML = '';
  
    const canSolve = state.user.role === 'admin' || !!state.user.can_resolve_tickets || !!state.user.is_mis_executive;
  
    tickets.forEach((ticket, idx) => {
      const catLabel = TICKET_CATEGORY_LABELS[ticket.category] || ticket.category || '';
      const raisedBy = ticket.raised_by_user?.full_name ?? '—';
      const descShort = ticket.description.length > 100
        ? `${ticket.description.slice(0, 100)}…`
        : ticket.description;
      const taskRef = ticket.task
        ? `${ticket.task.project?.name ? `${ticket.task.project.name} · ` : ''}Task: ${ticket.task.description.slice(0, 60)}${ticket.task.description.length > 60 ? '…' : ''}`
        : '';

      // Mobile card
      const card = document.createElement('div');
      card.className = 'ticket-card';
      card.innerHTML = `
        <div class="ticket-top">
          <div class="ticket-top-left">
            <span class="pill ${ticket.status === 'Open' ? 'pill-Pending' : 'pill-Completed'}">${ticket.status}</span>
            ${catLabel ? `<span class="ticket-category-chip">${escapeHtml(catLabel)}</span>` : ''}
          </div>
          <div class="row-actions"></div>
        </div>
        ${taskRef ? `<div class="ticket-task-ref">🔗 ${escapeHtml(taskRef)}</div>` : ''}
        <p class="ticket-desc">${escapeHtml(ticket.description)}</p>
        ${ticket.attachment_url ? `
          <div class="ticket-media-row">
            <a href="${escapeHtml(ticket.attachment_url)}" target="_blank" class="ticket-media-link">📎 Screenshot / Recording</a>
          </div>` : ''}
        <div class="ticket-meta">
          Raised by <strong>${escapeHtml(raisedBy)}</strong>
          · ${fmtDate(ticket.created_at)}
        </div>
        ${ticket.solution ? `
          <div class="ticket-solution-box">
            <div class="ticket-solution-header">💡 Solution</div>
            <p class="ticket-solution-text">${escapeHtml(ticket.solution)}</p>
            <div class="ticket-solution-meta">
              By <strong>${escapeHtml(ticket.solved_by_user?.full_name ?? '—')}</strong>
              · ${fmtDate(ticket.solution_at)}
            </div>
          </div>` : ''}
      `;
      const cardActions = card.querySelector('.row-actions');
      if (canSolve && ticket.status === 'Open') {
        const solveBtn = document.createElement('button');
        solveBtn.className = 'action-btn action-verify';
        solveBtn.textContent = '💡 Solution';
        solveBtn.addEventListener('click', () => openSolutionModal(ticket));
        cardActions.appendChild(solveBtn);
      }
      els.ticketsList?.appendChild(card);

      // Desktop table row
      if (els.ticketsTableBody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="col-sr">${idx + 1}</td>
          <td>
            <div class="cell-primary">${escapeHtml(descShort)}</div>
            ${taskRef ? `<div class="cell-muted">${escapeHtml(taskRef)}</div>` : ''}
            ${ticket.attachment_url ? `<a href="${escapeHtml(ticket.attachment_url)}" target="_blank" class="ticket-media-link">📎 Attachment</a>` : ''}
            ${ticket.solution ? `<div class="cell-muted" style="margin-top:4px">💡 ${escapeHtml(ticket.solution.slice(0, 80))}${ticket.solution.length > 80 ? '…' : ''}</div>` : ''}
          </td>
          <td>${escapeHtml(catLabel || '—')}</td>
          <td>${escapeHtml(raisedBy)}<div class="cell-muted">${fmtDate(ticket.created_at)}</div></td>
          <td class="col-status"><span class="pill ${ticket.status === 'Open' ? 'pill-Pending' : 'pill-Completed'}">${ticket.status}</span></td>
          <td class="col-actions"><div class="row-actions"></div></td>
        `;
        const rowActions = tr.querySelector('.row-actions');
        if (canSolve && ticket.status === 'Open') {
          const solveBtn = document.createElement('button');
          solveBtn.className = 'action-btn action-verify';
          solveBtn.textContent = '💡 Solution';
          solveBtn.addEventListener('click', () => openSolutionModal(ticket));
          rowActions.appendChild(solveBtn);
        } else {
          rowActions.textContent = '—';
        }
        els.ticketsTableBody.appendChild(tr);
      }
    });
  }
  
  // ─── Leave: apply (everyone) ───────────────────────────────────────────────────
  async function fillLeaveBuddySelect() {
    const sel = els.leaveBuddy || document.getElementById('leave-buddy');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading buddies…</option>';
    sel.disabled = true;
    try {
      // Dedicated endpoint (any employee). Prefer same department (e.g. Engineering).
      let employees = await api('/leaves/buddies').catch(() => null);
      if (!employees) {
        // Fallback for older deploys
        employees = await api('/master/employees');
      }
      sel.innerHTML = '<option value="">Select buddy…</option>';
      const list = (employees || [])
        .filter((e) => e.is_active !== false && e.id !== state.user.id && (e.role || '').toLowerCase() !== 'client')
        .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
      if (!list.length) {
        sel.innerHTML = '<option value="">No colleagues in your department</option>';
        if (els.leaveFormMsg) {
          els.leaveFormMsg.textContent =
            'No buddy found in your department. Check that colleagues have the same department name (e.g. MDO OFFICE).';
          els.leaveFormMsg.hidden = false;
        }
        return;
      }
      list.forEach((e) => {
        const opt = document.createElement('option');
        opt.value = e.id;
        const dept = e.department ? ` · ${e.department}` : '';
        const desig = e.designation ? ` (${e.designation})` : '';
        opt.textContent = `${e.full_name}${dept}${desig}`;
        sel.appendChild(opt);
      });
    } catch (err) {
      console.warn('buddy list', err.message);
      sel.innerHTML = '<option value="">Could not load buddies</option>';
      if (els.leaveFormMsg) {
        els.leaveFormMsg.textContent = err.message || 'Could not load buddy list';
        els.leaveFormMsg.hidden = false;
      }
    } finally {
      sel.disabled = false;
    }
  }

  function buddyStatusLabel(leave) {
    const name = leave.buddy?.full_name || '—';
    const st = leave.buddy_status || 'None';
    return `${name} (${st})`;
  }

  function openLeaveModal() {
    els.leaveFormMsg.hidden = true;
    els.leaveForm.reset();
    fillLeaveBuddySelect();
    els.leaveModal.hidden = false;
  }
  els.openApplyLeave?.addEventListener('click', openLeaveModal);
  els.closeLeaveModal?.addEventListener('click', () => { els.leaveModal.hidden = true; });
  els.cancelLeaveModal?.addEventListener('click', () => { els.leaveModal.hidden = true; });
  els.leaveForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.leaveFormMsg.hidden = true;
    const buddyId = (els.leaveBuddy || document.getElementById('leave-buddy'))?.value;
    if (!buddyId) {
      els.leaveFormMsg.textContent = 'Please choose a buddy to cover your tasks';
      els.leaveFormMsg.hidden = false;
      return;
    }
    try {
      await api('/leaves', {
        method: 'POST',
        body: {
          from_date: els.leaveFrom.value,
          to_date: els.leaveTo.value,
          is_half_day: els.leaveHalfDay.checked,
          reason: els.leaveReason.value.trim(),
          buddy_id: buddyId,
        }
      });
      showToast('Leave request submitted — waiting for buddy Yes/No ✅', 'success');
      els.leaveModal.hidden = true;
      if (state.activeView === 'applyleave') loadMyLeaves();
      if (state.activeView === 'buddyrequests') loadBuddyRequests();
      refreshNavBadges();
    } catch (err) { els.leaveFormMsg.textContent = err.message; els.leaveFormMsg.hidden = false; }
  });

  function attachBuddyRespondButtons(container, leave) {
    if (!container) return;
    const yesBtn = document.createElement('button');
    yesBtn.className = 'action-btn action-complete';
    yesBtn.textContent = '✅ Yes, I\'ll cover';
    yesBtn.addEventListener('click', async () => {
      try {
        const res = await api(`/leaves/${leave.id}/buddy-respond`, { method: 'PATCH', body: { accept: true } });
        const n = res.tasks_moved || 0;
        showToast(n ? `${n} task(s) moved to you — due dates unchanged` : 'You accepted buddy cover ✅', 'success');
        loadBuddyRequests();
        refreshNavBadges();
      } catch (err) { showToast(err.message, 'error'); }
    });
    const noBtn = document.createElement('button');
    noBtn.className = 'action-btn action-reject';
    noBtn.textContent = '✕ No';
    noBtn.addEventListener('click', async () => {
      if (!confirm('Decline this buddy request?')) return;
      try {
        await api(`/leaves/${leave.id}/buddy-respond`, { method: 'PATCH', body: { accept: false } });
        showToast('Declined — admin can reassign or change the target date', 'success');
        loadBuddyRequests();
        refreshNavBadges();
      } catch (err) { showToast(err.message, 'error'); }
    });
    container.appendChild(yesBtn);
    container.appendChild(noBtn);
  }

  async function loadBuddyRequests() {
    const wrap = els.buddyRequestsList || document.getElementById('buddyRequestsList');
    const tbody = els.buddyRequestsTableBody || document.getElementById('buddyRequestsTableBody');
    if (!wrap && !tbody) return;
    if (wrap) wrap.innerHTML = '<div class="empty-state">Loading buddy requests…</div>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading buddy requests…</td></tr>';
    try {
      const rows = await api('/leaves/buddy-requests');
      if (!rows.length) {
        if (wrap) wrap.innerHTML = `<div class="empty-state"><span class="emoji">🤝</span>No pending buddy requests</div>`;
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No pending buddy requests</td></tr>`;
        return;
      }
      if (wrap) wrap.innerHTML = '';
      if (tbody) tbody.innerHTML = '';
      rows.forEach((leave, idx) => {
        const fromName = leave.user?.full_name || 'Colleague';
        if (wrap) {
          const card = document.createElement('div');
          card.className = 'ticket-card';
          card.innerHTML = `
            <div class="ticket-top">
              <span class="pill pill-Pending">Buddy request</span>
              <div class="row-actions"></div>
            </div>
            <div class="ticket-desc"><strong>${escapeHtml(fromName)}</strong> · ${escapeHtml(leaveDateRangeLabel(leave))}</div>
            <p class="ticket-desc">${escapeHtml(leave.reason || '')}</p>
            <div class="ticket-meta">Say Yes to cover their open tasks due in this window after leave is approved.</div>
          `;
          attachBuddyRespondButtons(card.querySelector('.row-actions'), leave);
          wrap.appendChild(card);
        }
        if (tbody) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="col-sr">${idx + 1}</td>
            <td>${escapeHtml(fromName)}</td>
            <td>${escapeHtml(leaveDateRangeLabel(leave))}</td>
            <td>${escapeHtml(leave.reason || '—')}</td>
            <td class="col-actions"><div class="row-actions"></div></td>
          `;
          attachBuddyRespondButtons(tr.querySelector('.row-actions'), leave);
          tbody.appendChild(tr);
        }
      });
    } catch (err) {
      if (wrap) wrap.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
    }
  }
  
  async function loadMyLeaves() {
    els.myLeavesList.innerHTML = '<div class="empty-state">Loading your leave requests…</div>';
    if (els.myLeavesTableBody) {
      els.myLeavesTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading your leave requests…</td></tr>';
    }
    try {
      const leaves = await api('/leaves/my');
      renderMyLeavesList(leaves);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function leavePillClass(status) {
    if (status === 'Approved') return 'pill-Completed';
    if (status === 'Rejected') return 'pill-Rejected';
    return 'pill-Pending';
  }
  
  function leaveDateRangeLabel(leave) {
    const from = fmtDateOnly(leave.from_date);
    const to = fmtDateOnly(leave.to_date);
    const range = leave.from_date === leave.to_date ? from : `${from} → ${to}`;
    return leave.is_half_day ? `${range} (Half day)` : range;
  }
  
  function renderMyLeavesList(leaves) {
    if (!leaves.length) {
      if (els.myLeavesList) {
      els.myLeavesList.innerHTML = `<div class="empty-state"><span class="emoji">🌴</span>No leave requests yet</div>`;
      }
      if (els.myLeavesTableBody) {
        els.myLeavesTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No leave requests yet</td></tr>`;
      }
      return;
    }
    if (els.myLeavesList) els.myLeavesList.innerHTML = '';
    if (els.myLeavesTableBody) els.myLeavesTableBody.innerHTML = '';

    leaves.forEach((leave, idx) => {
      const card = document.createElement('div');
      card.className = 'ticket-card';
      card.innerHTML = `
        <div class="ticket-top">
          <span class="pill ${leavePillClass(leave.status)}">${leave.status}</span>
          <div class="row-actions"></div>
        </div>
        <div class="ticket-desc"><strong>${escapeHtml(leaveDateRangeLabel(leave))}</strong></div>
        <p class="ticket-desc">${escapeHtml(leave.reason)}</p>
        <div class="ticket-meta">Buddy: <strong>${escapeHtml(buddyStatusLabel(leave))}</strong></div>
        ${leave.decision_note ? `<div class="ticket-meta">Admin's note: ${escapeHtml(leave.decision_note)}</div>` : ''}
        <div class="ticket-meta">
          Applied ${fmtDate(leave.created_at)}
          ${leave.decided_at ? ` · Decided by <strong>${escapeHtml(leave.decided_by_user?.full_name ?? '—')}</strong> on ${fmtDate(leave.decided_at)}` : ''}
        </div>
      `;
      if (leave.status === 'Pending') {
        const actionsCell = card.querySelector('.row-actions');
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'action-btn action-reject';
        cancelBtn.textContent = '✕ Cancel';
        cancelBtn.addEventListener('click', async () => {
          if (!confirm('Cancel this leave request?')) return;
          try {
            await api(`/leaves/${leave.id}`, { method: 'DELETE' });
            showToast('Leave request cancelled', 'success'); loadMyLeaves();
          } catch (err) { showToast(err.message, 'error'); }
        });
        actionsCell.appendChild(cancelBtn);
      }
      els.myLeavesList?.appendChild(card);

      if (els.myLeavesTableBody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="col-sr">${idx + 1}</td>
          <td>${escapeHtml(leaveDateRangeLabel(leave))}</td>
          <td>
            <div class="cell-primary">${escapeHtml(leave.reason)}</div>
            ${leave.decision_note ? `<div class="cell-muted">Note: ${escapeHtml(leave.decision_note)}</div>` : ''}
          </td>
          <td>${escapeHtml(buddyStatusLabel(leave))}</td>
          <td class="col-status"><span class="pill ${leavePillClass(leave.status)}">${leave.status}</span></td>
          <td>${fmtDate(leave.created_at)}</td>
          <td class="col-actions"><div class="row-actions"></div></td>
        `;
        const rowActions = tr.querySelector('.row-actions');
        if (leave.status === 'Pending') {
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'action-btn action-reject';
          cancelBtn.textContent = '✕ Cancel';
          cancelBtn.addEventListener('click', async () => {
            if (!confirm('Cancel this leave request?')) return;
            try {
              await api(`/leaves/${leave.id}`, { method: 'DELETE' });
              showToast('Leave request cancelled', 'success'); loadMyLeaves();
            } catch (err) { showToast(err.message, 'error'); }
          });
          rowActions.appendChild(cancelBtn);
        } else {
          rowActions.textContent = '—';
        }
        els.myLeavesTableBody.appendChild(tr);
      }
    });
  }
  
  // ─── Leave: approvals (admin) ──────────────────────────────────────────────────
  async function loadLeaveApprovals() {
    els.leaveApprovalsList.innerHTML = '<div class="empty-state">Loading leave requests…</div>';
    if (els.leaveApprovalsTableBody) {
      els.leaveApprovalsTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading leave requests…</td></tr>';
    }
    try {
      const status = els.leaveApprovalsStatusFilter.value;
      const leaves = await api(`/leaves/all${status ? `?status=${encodeURIComponent(status)}` : ''}`);
      renderLeaveApprovalsList(leaves);
    } catch (err) { showToast(err.message, 'error'); }
  }
  els.leaveApprovalsStatusFilter?.addEventListener('change', loadLeaveApprovals);
  
  function renderLeaveApprovalsList(leaves) {
    if (!leaves.length) {
      if (els.leaveApprovalsList) {
      els.leaveApprovalsList.innerHTML = `<div class="empty-state"><span class="emoji">🗒️</span>No leave requests found</div>`;
      }
      if (els.leaveApprovalsTableBody) {
        els.leaveApprovalsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No leave requests found</td></tr>`;
      }
      return;
    }
    if (els.leaveApprovalsList) els.leaveApprovalsList.innerHTML = '';
    if (els.leaveApprovalsTableBody) els.leaveApprovalsTableBody.innerHTML = '';

    leaves.forEach((leave, idx) => {
      const empName = leave.user?.full_name ?? '—';
      const card = document.createElement('div');
      card.className = 'ticket-card';
      card.innerHTML = `
        <div class="ticket-top">
          <span class="pill ${leavePillClass(leave.status)}">${leave.status}</span>
          <div class="row-actions"></div>
        </div>
        <div class="ticket-desc"><strong>${escapeHtml(empName)}</strong> · ${escapeHtml(leaveDateRangeLabel(leave))}</div>
        <p class="ticket-desc">${escapeHtml(leave.reason)}</p>
        <div class="ticket-meta">Buddy: <strong>${escapeHtml(buddyStatusLabel(leave))}</strong></div>
        ${leave.decision_note ? `<div class="ticket-meta">Decision note: ${escapeHtml(leave.decision_note)}</div>` : ''}
        <div class="ticket-meta">
          Applied ${fmtDate(leave.created_at)}
          ${leave.decided_at ? ` · Decided by <strong>${escapeHtml(leave.decided_by_user?.full_name ?? '—')}</strong> on ${fmtDate(leave.decided_at)}` : ''}
        </div>
      `;
      if (leave.status === 'Pending') {
        const actionsCell = card.querySelector('.row-actions');
        const approveBtn = document.createElement('button');
        approveBtn.className = 'action-btn action-complete';
        approveBtn.textContent = '✅ Approve';
        approveBtn.addEventListener('click', async () => {
          try {
            const res = await api(`/leaves/${leave.id}/approve`, { method: 'PATCH' });
            const n = res.tasks_transferred || 0;
            if (res.cover_needed) {
              showToast('Leave approved — buddy declined; resolve task cover in the popup', 'success');
              checkLeaveCoverAlerts();
            } else {
              showToast(n ? `Leave approved — ${n} task(s) moved to buddy ✅` : 'Leave approved ✅', 'success');
            }
            loadLeaveApprovals();
          } catch (err) { showToast(err.message, 'error'); }
        });
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'action-btn action-reject';
        rejectBtn.textContent = '✕ Reject';
        rejectBtn.addEventListener('click', () => openRejectLeaveModal(leave.id));
        actionsCell.appendChild(approveBtn);
        actionsCell.appendChild(rejectBtn);
      }
      els.leaveApprovalsList?.appendChild(card);

      if (els.leaveApprovalsTableBody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="col-sr">${idx + 1}</td>
          <td>${escapeHtml(empName)}</td>
          <td>${escapeHtml(leaveDateRangeLabel(leave))}</td>
          <td>
            <div class="cell-primary">${escapeHtml(leave.reason)}</div>
            ${leave.decision_note ? `<div class="cell-muted">${escapeHtml(leave.decision_note)}</div>` : ''}
          </td>
          <td>${escapeHtml(buddyStatusLabel(leave))}</td>
          <td class="col-status"><span class="pill ${leavePillClass(leave.status)}">${leave.status}</span></td>
          <td class="col-actions"><div class="row-actions"></div></td>
        `;
        const rowActions = tr.querySelector('.row-actions');
        if (leave.status === 'Pending') {
          const approveBtn = document.createElement('button');
          approveBtn.className = 'action-btn action-complete';
          approveBtn.textContent = '✅ Approve';
          approveBtn.addEventListener('click', async () => {
            try {
              const res = await api(`/leaves/${leave.id}/approve`, { method: 'PATCH' });
              const n = res.tasks_transferred || 0;
              if (res.cover_needed) {
                showToast('Leave approved — buddy declined; resolve task cover in the popup', 'success');
                checkLeaveCoverAlerts();
              } else {
                showToast(n ? `Leave approved — ${n} task(s) moved to buddy ✅` : 'Leave approved ✅', 'success');
              }
              loadLeaveApprovals();
            } catch (err) { showToast(err.message, 'error'); }
          });
          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'action-btn action-reject';
          rejectBtn.textContent = '✕ Reject';
          rejectBtn.addEventListener('click', () => openRejectLeaveModal(leave.id));
          rowActions.appendChild(approveBtn);
          rowActions.appendChild(rejectBtn);
        } else {
          rowActions.textContent = '—';
        }
        els.leaveApprovalsTableBody.appendChild(tr);
      }
    });
  }

  // ─── Leave cover alerts (buddy declined, leave approved) ─────────────────────
  let _leaveCoverItems = [];
  async function checkLeaveCoverAlerts() {
    try {
      const items = await api('/leaves/unresolved-covers');
      _leaveCoverItems = Array.isArray(items) ? items : [];
      if (!_leaveCoverItems.length) {
        if (els.leaveCoverModal) els.leaveCoverModal.hidden = true;
        return;
      }
      renderLeaveCoverModal(_leaveCoverItems);
    } catch (err) {
      console.warn('Leave cover check:', err.message);
    }
  }

  function renderLeaveCoverModal(items) {
    if (!els.leaveCoverModal || !els.leaveCoverList) return;
    els.leaveCoverFormMsg.hidden = true;
    els.leaveCoverList.innerHTML = '';
    items.forEach((item, idx) => {
      const leave = item.leave || {};
      const name = item.applicant?.full_name || 'Employee';
      const block = document.createElement('div');
      block.className = 'ticket-card';
      block.style.marginBottom = '12px';
      const taskLines = (item.tasks || [])
        .map((t) => `<li>${escapeHtml((t.description || 'Task').slice(0, 120))} · ${escapeHtml(String(t.target_date || '').slice(0, 10))}</li>`)
        .join('');
      const assigneeOpts = (item.assignees || [])
        .map((u) => `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`)
        .join('');
      block.innerHTML = `
        <div class="ticket-desc"><strong>${escapeHtml(name)}</strong> · ${escapeHtml(leaveDateRangeLabel(leave))}</div>
        <div class="ticket-meta">Buddy: <strong>${escapeHtml(item.buddy?.full_name || '—')}</strong> (declined)</div>
        <ul style="margin:8px 0;padding-left:18px;">${taskLines || '<li>No open tasks in leave window</li>'}</ul>
        <div class="field">
          <label>Reassign tasks to</label>
          <select class="leave-cover-assignee" data-idx="${idx}">
            <option value="">Select employee…</option>
            ${assigneeOpts}
          </select>
        </div>
        <div class="field">
          <label>Or change target date</label>
          <input type="date" class="leave-cover-date" data-idx="${idx}" />
        </div>
        <div class="row-actions" style="margin-top:8px;gap:8px;display:flex;flex-wrap:wrap;"></div>
      `;
      const actions = block.querySelector('.row-actions');
      const transferBtn = document.createElement('button');
      transferBtn.type = 'button';
      transferBtn.className = 'action-btn action-complete';
      transferBtn.textContent = 'Reassign tasks';
      transferBtn.addEventListener('click', async () => {
        const sel = block.querySelector('.leave-cover-assignee');
        const assignee_id = sel?.value;
        if (!assignee_id) {
          els.leaveCoverFormMsg.textContent = 'Select an employee to transfer to';
          els.leaveCoverFormMsg.hidden = false;
          return;
        }
        try {
          const res = await api(`/leaves/${leave.id}/resolve-cover`, {
            method: 'POST',
            body: { action: 'reassign', assignee_id },
          });
          showToast(`Transferred ${res.updated || 0} task(s)`, 'success');
          checkLeaveCoverAlerts();
        } catch (err) {
          els.leaveCoverFormMsg.textContent = err.message;
          els.leaveCoverFormMsg.hidden = false;
        }
      });
      const reschedBtn = document.createElement('button');
      reschedBtn.type = 'button';
      reschedBtn.className = 'action-btn';
      reschedBtn.textContent = 'Change target date';
      reschedBtn.addEventListener('click', async () => {
        const dateEl = block.querySelector('.leave-cover-date');
        const target_date = dateEl?.value;
        if (!target_date) {
          els.leaveCoverFormMsg.textContent = 'Pick a new target date';
          els.leaveCoverFormMsg.hidden = false;
          return;
        }
        try {
          const res = await api(`/leaves/${leave.id}/resolve-cover`, {
            method: 'POST',
            body: { action: 'reschedule', target_date },
          });
          showToast(`Rescheduled ${res.updated || 0} task(s)`, 'success');
          checkLeaveCoverAlerts();
        } catch (err) {
          els.leaveCoverFormMsg.textContent = err.message;
          els.leaveCoverFormMsg.hidden = false;
        }
      });
      actions.appendChild(transferBtn);
      actions.appendChild(reschedBtn);
      els.leaveCoverList.appendChild(block);
    });
    els.leaveCoverModal.hidden = false;
  }

  els.closeLeaveCoverModal?.addEventListener('click', () => {
    if (els.leaveCoverModal) els.leaveCoverModal.hidden = true;
  });
  els.laterLeaveCoverModal?.addEventListener('click', () => {
    if (els.leaveCoverModal) els.leaveCoverModal.hidden = true;
    showToast('Reminder will show again next time you open TaskFlow', '');
  });
  
  function openRejectLeaveModal(leaveId) {
    state.pendingLeaveId = leaveId;
    els.rejectLeaveFormMsg.hidden = true;
    els.rejectLeaveReason.value = '';
    els.rejectLeaveModal.hidden = false;
  }
  els.closeRejectLeaveModal?.addEventListener('click', () => { els.rejectLeaveModal.hidden = true; });
  els.cancelRejectLeaveModal?.addEventListener('click', () => { els.rejectLeaveModal.hidden = true; });
  els.rejectLeaveForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.rejectLeaveFormMsg.hidden = true;
    try {
      await api(`/leaves/${state.pendingLeaveId}/reject`, {
        method: 'PATCH',
        body: { reason: els.rejectLeaveReason.value.trim() }
      });
      showToast('Leave rejected', 'success');
      els.rejectLeaveModal.hidden = true;
      loadLeaveApprovals();
    } catch (err) { els.rejectLeaveFormMsg.textContent = err.message; els.rejectLeaveFormMsg.hidden = false; }
  });
  
  // ─── Manage Employees ─────────────────────────────────────────────────────────
  function isClientUserRow(u) {
    const role = String(u?.role || '').toLowerCase().trim();
    const dept = String(u?.department || '').toLowerCase().trim();
    const des = String(u?.designation || '').toLowerCase().trim();
    return role === 'client' || dept === 'client' || des === 'client';
  }

  async function loadEmployees() {
    els.employeesTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Loading employees…</td></tr>`;
    els.employeesCards.innerHTML = `<div class="empty-state">Loading employees…</div>`;
    try {
      const all = await api('/employees');
      // Clients belong only in Manage clients — never here
      const employees = (all || []).filter((e) => !isClientUserRow(e));
      renderEmployeesTable(employees);
      renderEmployeesCards(employees);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function renderEmployeesTable(employees) {
    if (!employees.length) {
      els.employeesTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">No employees yet</td></tr>`;
      return;
    }
    els.employeesTableBody.innerHTML = '';
    employees.forEach((emp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="font-weight:600">${escapeHtml(emp.full_name)}</strong></td>
        <td>${escapeHtml(emp.department ?? '—')}</td>
        <td>${escapeHtml(emp.designation ?? '—')}</td>
        <td>${escapeHtml(emp.reporting_head?.full_name ?? '—')}</td>
        <td><span class="role-pill ${emp.role}">${emp.role}</span></td>
        <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(emp.username)}</td>
        <td></td><td></td><td class="row-actions"></td>
      `;
      const statusCell = tr.children[6];
      const statusBtn = document.createElement('button');
      statusBtn.className = `status-toggle ${emp.is_active ? 'active' : 'inactive'}`;
      statusBtn.textContent = emp.is_active ? 'Active' : 'Inactive';
      statusBtn.addEventListener('click', () => toggleEmployeeStatus(emp));
      statusCell.appendChild(statusBtn);
  
      const verifierCell = tr.children[7];
      const verifierBtn = document.createElement('button');
      verifierBtn.className = `status-toggle ${emp.can_verify ? 'active' : 'inactive'}`;
      verifierBtn.textContent = emp.can_verify ? 'Yes' : 'No';
      verifierBtn.addEventListener('click', () => toggleEmployeeVerifier(emp));
      verifierCell.appendChild(verifierBtn);
  
      const actionsCell = tr.children[8];
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn action-start';
      editBtn.textContent = '✏️ Edit';
      editBtn.addEventListener('click', () => openEditEmployeeModal(emp));
      actionsCell.appendChild(editBtn);
  
      const resetBtn = document.createElement('button');
      resetBtn.className = 'action-btn action-start';
      resetBtn.textContent = '🔑 Reset password';
      resetBtn.addEventListener('click', () => resetEmployeePassword(emp));
      actionsCell.appendChild(resetBtn);
  
      els.employeesTableBody.appendChild(tr);
    });
  }
  
  // renders the "Manage employees" view as cards (shown on mobile)
  function renderEmployeesCards(employees) {
    if (!employees.length) {
      els.employeesCards.innerHTML = `<div class="empty-state"><span class="emoji">👥</span>No employees yet</div>`;
      return;
    }
    els.employeesCards.innerHTML = '';
    employees.forEach((emp) => {
      const card = document.createElement('div');
      card.className = 'employee-card';
      card.innerHTML = `
        <div class="employee-card-top">
          <div>
            <strong>${escapeHtml(emp.full_name)}</strong>
            <span class="employee-card-meta">${escapeHtml(emp.designation ?? '—')} · ${escapeHtml(emp.department ?? '—')}</span>
          </div>
          <span class="role-pill ${emp.role}">${emp.role}</span>
        </div>
        <div class="employee-card-row">
          <span class="employee-card-label">Username</span>
          <span class="employee-card-value mono">${escapeHtml(emp.username)}</span>
        </div>
        <div class="employee-card-row">
          <span class="employee-card-label">Reporting Head</span>
          <span class="employee-card-value">${escapeHtml(emp.reporting_head?.full_name ?? '—')}</span>
        </div>
        <div class="employee-card-toggles"></div>
        <div class="employee-card-actions"></div>
      `;
  
      const togglesEl = card.querySelector('.employee-card-toggles');
      const statusBtn = document.createElement('button');
      statusBtn.className = `status-toggle ${emp.is_active ? 'active' : 'inactive'}`;
      statusBtn.textContent = emp.is_active ? 'Active' : 'Inactive';
      statusBtn.addEventListener('click', () => toggleEmployeeStatus(emp));
      togglesEl.appendChild(statusBtn);
  
      const verifierBtn = document.createElement('button');
      verifierBtn.className = `status-toggle ${emp.can_verify ? 'active' : 'inactive'}`;
      verifierBtn.textContent = emp.can_verify ? 'Verifier: Yes' : 'Verifier: No';
      verifierBtn.addEventListener('click', () => toggleEmployeeVerifier(emp));
      togglesEl.appendChild(verifierBtn);
  
      const actionsEl = card.querySelector('.employee-card-actions');
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn action-start';
      editBtn.textContent = '✏️ Edit';
      editBtn.addEventListener('click', () => openEditEmployeeModal(emp));
      actionsEl.appendChild(editBtn);
  
      const resetBtn = document.createElement('button');
      resetBtn.className = 'action-btn action-start';
      resetBtn.textContent = '🔑 Reset password';
      resetBtn.addEventListener('click', () => resetEmployeePassword(emp));
      actionsEl.appendChild(resetBtn);
  
      els.employeesCards.appendChild(card);
    });
  }
  
  async function toggleEmployeeStatus(emp) {
    try {
      await api(`/employees/${emp.id}`, { method: 'PATCH', body: { is_active: !emp.is_active } });
      showToast(`${emp.full_name} marked ${!emp.is_active ? 'active' : 'inactive'} ✅`, 'success');
      loadEmployees(); refreshEmployeeDropdowns();
    } catch (err) { showToast(err.message, 'error'); }
  }
  async function toggleEmployeeVerifier(emp) {
    try {
      await api(`/employees/${emp.id}`, { method: 'PATCH', body: { can_verify: !emp.can_verify } });
      showToast(`${emp.full_name} ${!emp.can_verify ? 'can now verify tasks' : 'is no longer a verifier'} ✅`, 'success');
      loadEmployees();
    } catch (err) { showToast(err.message, 'error'); }
  }
  async function resetEmployeePassword(emp) {
    if (!confirm(`Reset password for ${emp.full_name}?`)) return;
    try {
      const { generated_password } = await api(`/employees/${emp.id}/reset-password`, { method: 'POST' });
      showCredsModal(emp.username, generated_password, {
        title: 'Password reset ✅',
        note: 'Share the new password with them — it won’t be shown again.',
      });
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  els.openAddEmployee?.addEventListener('click', () => {
    els.employeeForm.reset(); els.employeeFormMsg.hidden = true;
    // Fill project/site dropdown from master projects
    fillSelect(els.empSite || document.getElementById('emp-site'), state.master.projects || [], {
      placeholder: '— None —', labelKey: 'name', valueKey: 'name'
    });
    els.employeeModal.hidden = false;
  });
  els.closeEmployeeModal?.addEventListener('click', () => { els.employeeModal.hidden = true; });
  els.cancelEmployeeModal?.addEventListener('click', () => { els.employeeModal.hidden = true; });
  els.employeeForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.employeeFormMsg.hidden = true;
    const siteName = (document.getElementById('emp-site')?.value || '').trim();
    const role = document.getElementById('emp-role').value;
    let department = document.getElementById('emp-department').value.trim();
    if (role === 'client' && !department) department = 'Client';
    if (role === 'client' && !siteName) {
      els.employeeFormMsg.textContent = 'Please select the project for this client';
      els.employeeFormMsg.hidden = false;
      return;
    }
    const body = {
      full_name:   document.getElementById('emp-fullname').value.trim(),
      department,
      designation: document.getElementById('emp-designation').value.trim(),
      role,
      is_head: role === 'head',
      reporting_head_id: els.empReportingHead.value || null,
      site_name: siteName || null,
      site_names: siteName ? [siteName] : null,
      whatsapp_number: (document.getElementById('emp-whatsapp')?.value || '').trim() || null
    };
    try {
      const created = await api('/employees', { method: 'POST', body });
      els.employeeModal.hidden = true;
      showCredsModal(created.username, created.generated_password, {
        title: 'Employee added ✅',
        note: 'Share these login details with the employee — they won’t be shown again.',
      });
      loadEmployees(); refreshEmployeeDropdowns();
    } catch (err) { els.employeeFormMsg.textContent = err.message; els.employeeFormMsg.hidden = false; }
  });
  els.closeCredsModal?.addEventListener('click', () => { els.credsModal.hidden = true; });
  els.closeCredsModalBtn?.addEventListener('click', () => { els.credsModal.hidden = true; });
  
  // ─── Edit employee (designation + role + department + optional new password) ─
  function openEditEmployeeModal(emp) {
    els.editEmployeeFormMsg.hidden = true;
    els.editEmpId.value = emp.id;
    els.editEmpFullname.value = emp.full_name || '';
    els.editEmpDepartment.value = emp.department || '';
    els.editEmpDesignation.value = emp.designation || '';
    els.editEmpRole.value = emp.role || 'employee';
    // Reporting Head — can't be your own reporting head, so exclude self from the list.
    const headOptions = (state.master.employees || []).filter((e) => e.id !== emp.id);
    fillSelect(els.editEmpReportingHead, headOptions, { placeholder: '— None (Top level) —', labelKey: 'full_name' });
    els.editEmpReportingHead.value = emp.reporting_head_id || '';
    fillSelect(els.editEmpSite || document.getElementById('edit-emp-site'), state.master.projects || [], {
      placeholder: '— None —', labelKey: 'name', valueKey: 'name'
    });
    const editSiteEl = els.editEmpSite || document.getElementById('edit-emp-site');
    if (editSiteEl) editSiteEl.value = emp.site_name || '';
    const waEl = document.getElementById('edit-emp-whatsapp');
    if (waEl) waEl.value = emp.whatsapp_number || '';
    setEditStatusToggle(emp.is_active !== false);
    els.editEmpPassword.value = '';
    els.editEmployeeModal.hidden = false;
  }
  // Reflects the given active/inactive state onto the toggle button's look + dataset.
  function setEditStatusToggle(isActive) {
    els.editEmpStatusToggle.dataset.active = isActive ? 'true' : 'false';
    els.editEmpStatusToggle.className = `status-toggle ${isActive ? 'active' : 'inactive'}`;
    els.editEmpStatusToggle.textContent = isActive ? 'Active' : 'Inactive';
  }
  els.editEmpStatusToggle?.addEventListener('click', () => {
    setEditStatusToggle(els.editEmpStatusToggle.dataset.active !== 'true');
  });
  els.closeEditEmployeeModal?.addEventListener('click', () => { els.editEmployeeModal.hidden = true; });
  els.cancelEditEmployeeModal?.addEventListener('click', () => { els.editEmployeeModal.hidden = true; });
  els.toggleEditPassword?.addEventListener('click', () => {
    const isPw = els.editEmpPassword.type === 'password';
    els.editEmpPassword.type = isPw ? 'text' : 'password';
    els.toggleEditPassword.textContent = isPw ? '🙈' : '👁';
  });
  els.editEmployeeForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.editEmployeeFormMsg.hidden = true;
    const newPassword = els.editEmpPassword.value;
    if (newPassword && newPassword.length < 6) {
      els.editEmployeeFormMsg.textContent = 'Password must be at least 6 characters';
      els.editEmployeeFormMsg.hidden = false;
      return;
    }
    const role = els.editEmpRole.value;
    let department = els.editEmpDepartment.value.trim();
    if (role === 'client' && !department) department = 'Client';
    const body = {
      full_name:   els.editEmpFullname.value.trim(),
      department,
      designation: els.editEmpDesignation.value.trim(),
      role,
      is_head:     role === 'head',
      reporting_head_id: els.editEmpReportingHead.value || null, // optional — blank clears it
      is_active:   els.editEmpStatusToggle.dataset.active === 'true'
    };
    const siteName = (els.editEmpSite || document.getElementById('edit-emp-site'))?.value?.trim() || '';
    if (role === 'client' && !siteName) {
      els.editEmployeeFormMsg.textContent = 'Please select the project for this client';
      els.editEmployeeFormMsg.hidden = false;
      return;
    }
    body.site_name = siteName || null;
    body.site_names = siteName ? [siteName] : null;
    body.whatsapp_number = (document.getElementById('edit-emp-whatsapp')?.value || '').trim() || null;
    if (newPassword) body.new_password = newPassword;
    try {
      await api(`/employees/${els.editEmpId.value}`, { method: 'PATCH', body });
      showToast('Employee updated ✅', 'success');
      els.editEmployeeModal.hidden = true;
      loadEmployees(); refreshEmployeeDropdowns();
    } catch (err) { els.editEmployeeFormMsg.textContent = err.message; els.editEmployeeFormMsg.hidden = false; }
  });
  
  // ─── Org Hierarchy (admin only) ────────────────────────────────────────────────
  // Root = whoever has no reporting_head_id (normally just Chirag Sir). Everyone
  // else nests under their reporting_head_id, however many levels deep. Inactive
  // employees are filtered out entirely before the tree is built, so deactivating
  // someone removes them (and, naturally, their own sub-tree moves up as orphans
  // — see buildOrgTree below) from the view immediately.
  async function loadHierarchy() {
    els.hierarchyTreeContainer.innerHTML = `<div class="empty-state">Loading hierarchy…</div>`;
    try {
      const employees = await api('/employees'); // admin-only, includes is_active + reporting_head_id
      const active = employees.filter((e) => e.is_active !== false && !isClientUserRow(e));
      renderOrgTree(active);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function buildOrgTree(employees) {
    const byId = new Map(employees.map((e) => [e.id, { ...e, children: [] }]));
    const roots = [];
    byId.forEach((node) => {
      const headId = node.reporting_head_id;
      // No reporting head, OR reporting head isn't in the active set (e.g. was
      // deactivated) — treat as a root so nobody silently disappears from the tree.
      if (headId && byId.has(headId)) {
        byId.get(headId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }
  
  function orgInitials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
  function renderOrgNode(node, isRoot = false) {
    const branch = document.createElement('div');
    branch.className = 'org-branch';
  
    const nodeEl = document.createElement('div');
    nodeEl.className = `org-node${isRoot ? ' org-node-root' : ''}`;
    nodeEl.innerHTML = `
      <div class="org-node-avatar">${escapeHtml(orgInitials(node.full_name))}</div>
      <div class="org-node-info">
        <span class="org-node-name">${escapeHtml(node.full_name)}</span>
        <span class="org-node-meta">${escapeHtml(node.designation || node.role)}</span>
      </div>
    `;
    branch.appendChild(nodeEl);
  
    if (node.children && node.children.length) {
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'org-branch-children';
      node.children
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .forEach((child) => childrenWrap.appendChild(renderOrgNode(child, false)));
      branch.appendChild(childrenWrap);
    }
    return branch;
  }
  
  function renderOrgTree(employees) {
    const roots = buildOrgTree(employees);
    els.hierarchyTreeContainer.innerHTML = '';
    if (!roots.length) {
      els.hierarchyTreeContainer.innerHTML = `<div class="org-tree-empty">No active employees to show yet.</div>`;
      return;
    }
    const treeEl = document.createElement('div');
    treeEl.className = 'org-tree';
    roots
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .forEach((root) => treeEl.appendChild(renderOrgNode(root, true)));
    els.hierarchyTreeContainer.appendChild(treeEl);
  
    requestAnimationFrame(() => {
      centerOrgTreeView();
      drawOrgTreeLines(treeEl);
    });
  }

  function centerOrgTreeView() {
    const wrap = els.hierarchyTreeContainer;
    if (!wrap) return;
    const root = wrap.querySelector('.org-node-root') || wrap.querySelector('.org-node');
    if (!root) return;
    const extra = (root.getBoundingClientRect().left + root.offsetWidth / 2)
      - (wrap.getBoundingClientRect().left + wrap.clientWidth / 2);
    wrap.scrollLeft += extra;
  }
  
  function drawOrgTreeLines(treeEl) {
    const existing = els.hierarchyTreeContainer.querySelector('.org-tree-svg');
    if (existing) existing.remove();
  
    const containerRect = els.hierarchyTreeContainer.getBoundingClientRect();
    const scrollX = els.hierarchyTreeContainer.scrollLeft;
    const scrollY = els.hierarchyTreeContainer.scrollTop;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'org-tree-svg');
    svg.setAttribute('width', els.hierarchyTreeContainer.scrollWidth);
    svg.setAttribute('height', els.hierarchyTreeContainer.scrollHeight);
  
    treeEl.querySelectorAll('.org-branch').forEach((branch) => {
      const parentNode = branch.querySelector(':scope > .org-node');
      const childrenWrap = branch.querySelector(':scope > .org-branch-children');
      if (!parentNode || !childrenWrap) return;
  
      const pRect = parentNode.getBoundingClientRect();
      const px = pRect.left + pRect.width / 2 - containerRect.left + scrollX;
      const py = pRect.bottom - containerRect.top + scrollY;
      const childrenTop = childrenWrap.getBoundingClientRect().top - containerRect.top + scrollY;
      const midY = py + (childrenTop - py) / 2;
  
      Array.from(childrenWrap.children).forEach((childBranch) => {
        const childNode = childBranch.querySelector(':scope > .org-node');
        if (!childNode) return;
        const cRect = childNode.getBoundingClientRect();
        const cx = cRect.left + cRect.width / 2 - containerRect.left + scrollX;
        const cy = cRect.top - containerRect.top + scrollY;
  
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', 'org-line');
        path.setAttribute('fill', 'none');
        path.setAttribute('d', `M ${px} ${py} V ${midY} H ${cx} V ${cy}`);
        svg.appendChild(path);
      });
    });
  
    els.hierarchyTreeContainer.insertBefore(svg, treeEl);
  }
  
  let orgTreeResizeTimer = null;
  window.addEventListener('resize', () => {
    if (state.activeView !== 'hierarchy') return;
    clearTimeout(orgTreeResizeTimer);
    orgTreeResizeTimer = setTimeout(() => {
      const treeEl = els.hierarchyTreeContainer.querySelector('.org-tree');
      if (treeEl) drawOrgTreeLines(treeEl);
    }, 150);
  });
  // ─── Permissions (admin only) ──────────────────────────────────────────────────
  async function loadPermissions() {
    els.permissionsTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">Loading employees…</td></tr>`;
    try {
      const employees = (await api('/employees')).filter((e) => !isClientUserRow(e));
      renderPermissionsTable(employees);
    } catch (err) { showToast(err.message, 'error'); }
  }
  function renderPermissionsTable(employees) {
    if (!employees.length) {
      els.permissionsTableBody.innerHTML = `<tr><td colspan="9" class="empty-state">No employees yet</td></tr>`;
      return;
    }
    els.permissionsTableBody.innerHTML = '';
    employees.forEach((emp) => {
      const tr = document.createElement('tr');
      const isAdminRow = emp.role === 'admin';
      tr.innerHTML = `
        <td><strong style="font-weight:600">${escapeHtml(emp.full_name)}</strong></td>
        <td><span class="role-pill ${emp.role}">${emp.role}</span></td>
      `;
      const flags = [
        ['can_add_site', 'Add site'],
        ['can_add_employee', 'Add employee'],
        ['can_resolve_tickets', 'Resolve tickets'],
        ['can_verify', 'Verify tasks'],
        ['is_mis_executive', 'MIS Executive'],
        ['can_switch_office_site', 'Office ↔ Site'],
        ['can_switch_office_mdo', 'Office ↔ MDO'],
      ];
      flags.forEach(([flag, label]) => {
        const td = document.createElement('td');
        td.className = 'perm-col';
        const btn = document.createElement('button');
        // Office↔Site also shows Yes when Head role / is_head already grants it
        const autoSite =
          flag === 'can_switch_office_site' &&
          (emp.role === 'head' || !!emp.is_head);
        const autoMdo =
          flag === 'can_switch_office_mdo' &&
          /process controller/i.test(`${emp.designation || ''} ${emp.role || ''} ${emp.department || ''}`);
        const checked = isAdminRow || autoSite || autoMdo || !!emp[flag];
        btn.className = `status-toggle ${checked ? 'active' : 'inactive'}`;
        btn.textContent = checked ? 'Yes' : 'No';
        btn.title = isAdminRow
          ? 'Admins already have full access'
          : autoSite
            ? 'Head role already has Office ↔ Site'
            : autoMdo
              ? 'Process Controller already has Office ↔ MDO'
            : `Toggle "${label}" for ${emp.full_name}`;
        if (isAdminRow || autoSite || autoMdo) {
          btn.disabled = true;
        } else {
          btn.addEventListener('click', () => togglePermission(emp, flag));
        }
        td.appendChild(btn);
        tr.appendChild(td);
      });
      els.permissionsTableBody.appendChild(tr);
    });
  }
  async function togglePermission(emp, flag) {
    try {
      await api(`/employees/${emp.id}`, { method: 'PATCH', body: { [flag]: !emp[flag] } });
      showToast(`Permission updated for ${emp.full_name} ✅`, 'success');
      loadPermissions();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function loadVisibility() {
    const body = document.getElementById('visibilityTableBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="empty-state">Loading…</td></tr>`;
    try {
      const data = await api('/master/nav-visibility');
      state.navVis = data.map || {};
      const roles = data.roles || ['admin', 'mis', 'employee', 'site', 'site_head'];
      const modules = data.modules || [];
      body.innerHTML = '';
      modules.forEach((mod) => {
        const tr = document.createElement('tr');
        const name = document.createElement('td');
        name.innerHTML = `<strong>${escapeHtml(mod.label)}</strong><div class="td-muted">${escapeHtml(mod.area)}</div>`;
        tr.appendChild(name);
        const row = state.navVis[mod.key] || {};
        roles.forEach((r) => {
          const td = document.createElement('td');
          td.className = 'perm-col';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = row[r] !== false;
          cb.dataset.mod = mod.key;
          cb.dataset.role = r;
          td.appendChild(cb);
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    } catch (err) {
      body.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  document.getElementById('visibilitySaveBtn')?.addEventListener('click', async () => {
    const body = document.getElementById('visibilityTableBody');
    if (!body) return;
    const map = {};
    body.querySelectorAll('input[type="checkbox"][data-mod]').forEach((cb) => {
      const k = cb.dataset.mod;
      if (!map[k]) map[k] = {};
      map[k][cb.dataset.role] = cb.checked;
    });
    try {
      const saved = await api('/master/nav-visibility', { method: 'PUT', body: { map } });
      state.navVis = saved.map || map;
      showToast('Visibility saved. Reloading menus…', 'success');
      buildNav();
      setupTopbarQuick();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  
  // ─── Master data ──────────────────────────────────────────────────────────────
  async function loadMasterDataView() {
    try {
      const [departments, taskTypes] = await Promise.all([
        api('/master/departments'), api('/master/task-types')
      ]);
      renderSimpleNameTable(els.departmentsTableBody, departments);
      renderSimpleNameTable(els.taskTypesTableBody, taskTypes);
    } catch (err) { showToast(err.message, 'error'); }
  }
  function renderSimpleNameTable(tbody, items) {
    if (!items.length) {
      tbody.innerHTML = `<tr><td class="empty-state">None yet — add one above</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(item.name)}</td>`;
      tbody.appendChild(tr);
    });
  }
  els.addDepartmentForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.addDepartmentMsg.hidden = true;
    const nameInput = document.getElementById('new-department-name');
    try {
      await api('/master/departments', { method: 'POST', body: { name: nameInput.value.trim() } });
      showToast('Department added ✅', 'success'); nameInput.value = '';
      loadMasterDataView(); loadMasterData();
    } catch (err) { els.addDepartmentMsg.textContent = err.message; els.addDepartmentMsg.hidden = false; }
  });
  els.addTaskTypeForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.addTaskTypeMsg.hidden = true;
    const nameInput = document.getElementById('new-tasktype-name');
    try {
      await api('/master/task-types', { method: 'POST', body: { name: nameInput.value.trim() } });
      showToast('Task type added ✅', 'success'); nameInput.value = '';
      loadMasterDataView(); loadMasterData();
    } catch (err) { els.addTaskTypeMsg.textContent = err.message; els.addTaskTypeMsg.hidden = false; }
  });
  
  // ─── Manage Sites ─────────────────────────────────────────────────────────────
  const DEFAULT_SITE_PROJECT_TYPES = ['Residential', 'Commercial', 'Industrial', 'Institutional'];
  let siteProjectTypeOptions = [...DEFAULT_SITE_PROJECT_TYPES];

  function mergeSiteProjectTypesFromSites(sites) {
    const set = new Set(DEFAULT_SITE_PROJECT_TYPES);
    (sites || []).forEach((s) => {
      const t = String(s.project_type || '').trim();
      if (t) set.add(t);
    });
    siteProjectTypeOptions = [...set].sort((a, b) => a.localeCompare(b));
  }

  function fillSiteProjectTypeSelect(selected) {
    const sel = document.getElementById('site-type');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select project type</option>';
    siteProjectTypeOptions.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    if (selected) sel.value = selected;
  }

  function dateInputValue(raw) {
    if (!raw) return '';
    return String(raw).slice(0, 10);
  }

  function empRoleBlob(emp) {
    return [emp?.department, emp?.designation, emp?.role]
      .map((s) => String(s || '').toLowerCase())
      .join(' ');
  }

  function isClientEmployee(emp) {
    const role = String(emp?.role || '').toLowerCase();
    const dept = String(emp?.department || '').toLowerCase();
    return role === 'client' || dept === 'client';
  }

  function isMdoEmployee(emp) {
    const blob = empRoleBlob(emp);
    return /\bmdo\b/.test(blob) || blob.includes('mdo office');
  }

  function isHeadEmployee(emp) {
    if (isMdoEmployee(emp) || isClientEmployee(emp)) return false;
    const role = String(emp?.role || '').toLowerCase();
    if (role === 'head' || emp?.is_head) return true;
    const des = String(emp?.designation || '').toLowerCase().trim();
    if (des === 'head' || des === 'project head' || des === 'site head') return true;
    return /project head|site head/.test(empRoleBlob(emp));
  }

  function isSitePeopleEmployee(emp) {
    if (isMdoEmployee(emp) || isClientEmployee(emp)) return false;
    const blob = empRoleBlob(emp);
    if (/site engineer|site incharge|site coordinator|site execution|team leader|\bsite\b/.test(blob)) return true;
    if (emp?.site_name || (Array.isArray(emp?.site_names) && emp.site_names.length)) return true;
    return false;
  }

  function isCoordinatorEmployee(emp) {
    if (isMdoEmployee(emp) || isClientEmployee(emp)) return false;
    const blob = empRoleBlob(emp);
    return /co-?ordinator|coordinator/.test(blob);
  }

  function isPcEmployee(emp) {
    if (isClientEmployee(emp)) return false;
    const role = String(emp?.role || '').toLowerCase().trim();
    const des = String(emp?.designation || '').toLowerCase().trim();
    if (role === 'pc' || des === 'pc') return true;
    const blob = `${role} ${des}`;
    if (/\bpc\b/.test(blob)) return true;
    if (blob.includes('process controller')) return true;
    return false;
  }

  function keepSelected(list, employees, keepId) {
    if (!keepId || list.some((e) => e.id === keepId)) return list;
    const extra = (employees || []).find((e) => e.id === keepId);
    return extra ? [extra, ...list] : list;
  }

  /** Team leader: all site people + heads (no MDO). */
  function siteTeamLeaderOptions(employees, keepId) {
    const list = (employees || []).filter((e) => isSitePeopleEmployee(e) || isHeadEmployee(e));
    return keepSelected(list, employees, keepId);
  }

  /** Co-ordinator: coordinators + site people + heads (no MDO). */
  function siteCoordinatorOptions(employees, keepId) {
    const list = (employees || []).filter(
      (e) => isCoordinatorEmployee(e) || isSitePeopleEmployee(e) || isHeadEmployee(e)
    );
    return keepSelected(list, employees, keepId);
  }

  /** Site incharge (Head slot): heads only (no MDO). */
  function siteInchargeOptions(employees, keepId) {
    const list = (employees || []).filter((e) => isHeadEmployee(e));
    return keepSelected(list, employees, keepId);
  }

  function fillSitePeopleDropdowns(employees, keep = {}) {
    const emps = employees || state.master.employees || [];
    fillSelect(els.siteTeamleader, siteTeamLeaderOptions(emps, keep.team_leader_id), {
      placeholder: 'Select team leader', labelKey: 'full_name',
    });
    fillSelect(els.siteCoordinator, siteCoordinatorOptions(emps, keep.coordinator_id), {
      placeholder: 'Select coordinator', labelKey: 'full_name',
    });
    fillSelect(els.siteIncharge, siteInchargeOptions(emps, keep.site_incharge_id), {
      placeholder: 'Select site incharge (Head)', labelKey: 'full_name',
    });
    fillSitePcDropdown(emps, keep.pc_id);
    if (keep.team_leader_id && els.siteTeamleader) els.siteTeamleader.value = keep.team_leader_id;
    if (keep.coordinator_id && els.siteCoordinator) els.siteCoordinator.value = keep.coordinator_id;
    if (keep.site_incharge_id && els.siteIncharge) els.siteIncharge.value = keep.site_incharge_id;
    if (keep.pc_id && els.sitePc) els.sitePc.value = keep.pc_id;
  }

  function fillSitePcDropdown(employees, keepId) {
    const pcs = keepSelected((employees || []).filter(isPcEmployee), employees, keepId);
    fillSelect(els.sitePc, pcs, { placeholder: 'Select PC', labelKey: 'full_name' });
  }

  function openSiteModal(site) {
    els.siteForm?.reset();
    if (els.siteFormMsg) els.siteFormMsg.hidden = true;
    fillSitePeopleDropdowns(state.master.employees || [], site ? {
      team_leader_id: site.team_leader_id,
      coordinator_id: site.coordinator_id,
      site_incharge_id: site.site_incharge_id,
      pc_id: site.pc_id,
    } : {});
    fillSiteProjectTypeSelect(site?.project_type || '');
    if (site) {
      if (els.siteEditId) els.siteEditId.value = site.id;
      if (els.siteModalTitle) els.siteModalTitle.textContent = 'Edit site';
      if (els.siteFormSubmit) els.siteFormSubmit.textContent = 'Save changes';
      document.getElementById('site-client').value = site.client_name || '';
      document.getElementById('site-name').value = site.name || '';
      document.getElementById('site-type').value = site.project_type || '';
      document.getElementById('site-location').value = site.location || '';
      document.getElementById('site-start').value = dateInputValue(site.start_date);
      document.getElementById('site-end').value = dateInputValue(site.expected_end_date);
      document.getElementById('site-description').value = site.description || '';
    } else {
      if (els.siteEditId) els.siteEditId.value = '';
      if (els.siteModalTitle) els.siteModalTitle.textContent = 'Add new construction site';
      if (els.siteFormSubmit) els.siteFormSubmit.textContent = 'Add site';
    }
    els.siteModal.hidden = false;
  }

  async function loadSites() {
    els.sitesTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading sites…</td></tr>`;
    try {
      const sites = await api('/sites');
      mergeSiteProjectTypesFromSites(sites);
      renderSitesTable(sites);
    }
    catch (err) { showToast(err.message, 'error'); }
  }
  function renderSitesTable(sites) {
    if (!sites.length) {
      els.sitesTableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No sites yet</td></tr>`;
      return;
    }
    els.sitesTableBody.innerHTML = '';
    sites.forEach((site) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="font-weight:600">${escapeHtml(site.name)}</strong></td>
        <td>${escapeHtml(site.client_name ?? '—')}</td>
        <td>${escapeHtml(site.location ?? '—')}</td>
        <td>${escapeHtml(site.project_type ?? '—')}</td>
        <td><span class="pill pill-Pending">${escapeHtml(site.status)}</span></td>
        <td>${escapeHtml(site.team_leader?.full_name ?? '—')}</td>
        <td class="row-actions"></td>
      `;
      const actionsCell = tr.children[6];
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn action-accept';
      editBtn.textContent = '✏️ Edit';
      editBtn.addEventListener('click', () => openSiteModal(site));
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-btn action-reject'; deleteBtn.textContent = '🗑️ Delete';
      deleteBtn.addEventListener('click', () => deleteSite(site));
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      els.sitesTableBody.appendChild(tr);
    });
  }
  async function deleteSite(site) {
    if (!confirm(`Delete site "${site.name}"? This cannot be undone.`)) return;
    try {
      await api(`/sites/${site.id}`, { method: 'DELETE' });
      showToast('Site deleted', 'success'); loadSites(); loadMasterData();
    } catch (err) { showToast(err.message, 'error'); }
  }
  els.openAddSite?.addEventListener('click', () => openSiteModal(null));
  document.getElementById('site-add-type')?.addEventListener('click', () => toggleInlineAdd('site-add-type-row'));
  document.getElementById('site-save-type')?.addEventListener('click', () => {
    const input = document.getElementById('site-new-type');
    const name = (input?.value || '').trim();
    if (!name) return showToast('Enter project type name', 'error');
    if (!siteProjectTypeOptions.some((t) => t.toLowerCase() === name.toLowerCase())) {
      siteProjectTypeOptions.push(name);
      siteProjectTypeOptions.sort((a, b) => a.localeCompare(b));
    }
    fillSiteProjectTypeSelect(name);
    if (input) input.value = '';
    const row = document.getElementById('site-add-type-row');
    if (row) row.hidden = true;
    showToast('Project type added', 'success');
  });
  els.closeSiteModal?.addEventListener('click', () => { els.siteModal.hidden = true; });
  els.cancelSiteModal?.addEventListener('click', () => { els.siteModal.hidden = true; });
  els.siteForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); els.siteFormMsg.hidden = true;
    const editId = (els.siteEditId?.value || '').trim();
    const body = {
      client_name:       document.getElementById('site-client').value.trim(),
      name:              document.getElementById('site-name').value.trim(),
      project_type:      document.getElementById('site-type').value,
      location:          document.getElementById('site-location').value.trim(),
      start_date:        document.getElementById('site-start').value,
      expected_end_date: document.getElementById('site-end').value || null,
      team_leader_id:    els.siteTeamleader.value,
      coordinator_id:    els.siteCoordinator.value,
      site_incharge_id:  els.siteIncharge.value,
      pc_id:             els.sitePc?.value || '',
      description:       document.getElementById('site-description').value.trim()
    };
    try {
      if (editId) {
        await api(`/sites/${editId}`, { method: 'PATCH', body });
        showToast('Site updated ✅', 'success');
        els.siteModal.hidden = true;
      } else {
        const created = await api('/sites', { method: 'POST', body });
        els.siteModal.hidden = true;
        showToast('Site added ✅', 'success');
        if (created?.client_login?.username && created?.client_login?.generated_password) {
          showCredsModal(created.client_login.username, created.client_login.generated_password, {
            title: 'Client login created ✅',
            note: 'Share these client portal login details — they won’t be shown again.',
          });
        } else {
          showToast('Site added, but client login was not created — add from Manage clients', 'error');
        }
      }
      loadSites(); loadMasterData();
    } catch (err) { els.siteFormMsg.textContent = err.message; els.siteFormMsg.hidden = false; }
  });

  // ─── Manage Clients ───────────────────────────────────────────────────────────
  function fillClientPeopleDropdowns(employees) {
    const list = employees || state.master.employees || [];
    fillSelect(els.clientHead, list, { placeholder: 'Select head', labelKey: 'full_name' });
    fillSelect(els.clientCoordinator, list, { placeholder: 'Select coordinator', labelKey: 'full_name' });
    fillSitePcDropdownFor(els.clientPc, list);
  }

  function fillSitePcDropdownFor(selectEl, employees, keepId) {
    const pcs = (employees || []).filter(isPcEmployee);
    if (keepId && !pcs.some((e) => e.id === keepId)) {
      const extra = (employees || []).find((e) => e.id === keepId);
      if (extra) pcs.unshift(extra);
    }
    fillSelect(selectEl, pcs, { placeholder: 'Select PC', labelKey: 'full_name' });
  }

  function matchEmployeeIdByName(employees, name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return '';
    const hit = (employees || []).find((e) => String(e.full_name || '').trim().toLowerCase() === n);
    return hit?.id || '';
  }

  function openClientModal(client) {
    els.clientForm?.reset();
    if (els.clientFormMsg) els.clientFormMsg.hidden = true;
    fillSelect(els.clientSite, state.master.projects || [], {
      placeholder: 'Select project', labelKey: 'name', valueKey: 'name'
    });
    fillClientPeopleDropdowns(state.master.employees || []);
    if (client) {
      if (els.clientEditId) els.clientEditId.value = client.id;
      if (els.clientModalTitle) els.clientModalTitle.textContent = 'Edit client';
      if (els.clientFormSubmit) els.clientFormSubmit.textContent = 'Save changes';
      if (els.clientCredsNote) els.clientCredsNote.textContent = 'Username stays the same. Use Reset password from the list if needed.';
      if (els.clientFullname) els.clientFullname.value = client.full_name || '';
      if (els.clientSite) els.clientSite.value = client.site_name || '';
      const sc = client.site_contacts || {};
      const emps = state.master.employees || [];
      if (els.clientHead) els.clientHead.value = matchEmployeeIdByName(emps, sc.head_name);
      if (els.clientCoordinator) els.clientCoordinator.value = matchEmployeeIdByName(emps, sc.incharge_name);
      fillSitePcDropdownFor(els.clientPc, emps, matchEmployeeIdByName(emps, sc.pc_name));
      if (els.clientPc) els.clientPc.value = matchEmployeeIdByName(emps, sc.pc_name);
    } else {
      if (els.clientEditId) els.clientEditId.value = '';
      if (els.clientModalTitle) els.clientModalTitle.textContent = 'Add client';
      if (els.clientFormSubmit) els.clientFormSubmit.textContent = 'Add client';
      if (els.clientCredsNote) els.clientCredsNote.textContent = 'Username and password will be auto-generated after save.';
    }
    if (els.clientModal) els.clientModal.hidden = false;
  }

  async function loadClients() {
    if (!els.clientsTableBody) return;
    els.clientsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">Loading clients…</td></tr>`;
    try {
      const clients = await api('/clients');
      renderClientsTable(clients);
    } catch (err) {
      showToast(err.message, 'error');
      els.clientsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderClientsTable(clients) {
    if (!clients.length) {
      els.clientsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">No clients yet</td></tr>`;
      return;
    }
    els.clientsTableBody.innerHTML = '';
    clients.forEach((c) => {
      const sc = c.site_contacts || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="font-weight:600">${escapeHtml(c.full_name || '—')}</strong></td>
        <td>${escapeHtml(c.username || '—')}</td>
        <td>${escapeHtml(c.site_name || '—')}</td>
        <td>${escapeHtml(sc.head_name || '—')}</td>
        <td>${escapeHtml(sc.incharge_name || '—')}</td>
        <td>${escapeHtml(sc.pc_name || '—')}</td>
        <td></td>
        <td class="row-actions"></td>
      `;
      const statusCell = tr.children[6];
      const statusBtn = document.createElement('button');
      statusBtn.className = `status-toggle ${c.is_active === false ? 'inactive' : 'active'}`;
      statusBtn.textContent = c.is_active === false ? 'Inactive' : 'Active';
      statusBtn.title = 'Click to toggle. Inactive clients cannot open client portal.';
      statusBtn.addEventListener('click', () => toggleClientStatus(c));
      statusCell.appendChild(statusBtn);

      const actions = tr.children[7];
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn action-accept';
      editBtn.textContent = '✏️ Edit';
      editBtn.addEventListener('click', () => openClientModal(c));
      const resetBtn = document.createElement('button');
      resetBtn.className = 'action-btn action-start';
      resetBtn.textContent = '🔑 Reset password';
      resetBtn.addEventListener('click', () => resetClientPassword(c));
      actions.appendChild(editBtn);
      actions.appendChild(resetBtn);
      els.clientsTableBody.appendChild(tr);
    });
  }

  async function toggleClientStatus(client) {
    const next = client.is_active === false;
    try {
      await api(`/clients/${client.id}`, { method: 'PATCH', body: { is_active: next } });
      showToast(
        `${client.full_name} marked ${next ? 'active' : 'inactive'} ✅` +
          (next ? '' : ' — client portal login blocked'),
        'success'
      );
      loadClients();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function resetClientPassword(client) {
    if (!confirm(`Reset password for ${client.full_name}?`)) return;
    try {
      const { generated_password } = await api(`/employees/${client.id}/reset-password`, { method: 'POST' });
      showCredsModal(client.username, generated_password, {
        title: 'Password reset ✅',
        note: 'Share the new password with the client — it won’t be shown again.',
      });
    } catch (err) { showToast(err.message, 'error'); }
  }

  els.openAddClient?.addEventListener('click', () => openClientModal(null));
  els.closeClientModal?.addEventListener('click', () => { if (els.clientModal) els.clientModal.hidden = true; });
  els.cancelClientModal?.addEventListener('click', () => { if (els.clientModal) els.clientModal.hidden = true; });
  els.clientForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (els.clientFormMsg) els.clientFormMsg.hidden = true;
    const editId = (els.clientEditId?.value || '').trim();
    const body = {
      full_name: els.clientFullname?.value.trim() || '',
      site_name: els.clientSite?.value || '',
      head_id: els.clientHead?.value || '',
      coordinator_id: els.clientCoordinator?.value || '',
      pc_id: els.clientPc?.value || '',
    };
    try {
      if (editId) {
        await api(`/clients/${editId}`, { method: 'PATCH', body });
        showToast('Client updated ✅', 'success');
        if (els.clientModal) els.clientModal.hidden = true;
        loadClients();
      } else {
        const created = await api('/clients', { method: 'POST', body });
        if (els.clientModal) els.clientModal.hidden = true;
        showCredsModal(created.username, created.generated_password, {
          title: 'Client added ✅',
          note: 'Share these client portal login details — they won’t be shown again.',
        });
        loadClients();
      }
    } catch (err) {
      if (els.clientFormMsg) {
        els.clientFormMsg.textContent = err.message;
        els.clientFormMsg.hidden = false;
      } else showToast(err.message, 'error');
    }
  });
  
  // boot deferred to mountTaskflowApp
  
  // ─── RECURRING TASKS ──────────────────────────────────────────────────────────
  
  // Elem references (recurring modal)
  const recEls = {
    modal:         () => document.getElementById('recurringModal'),
    modalTitle:    () => document.getElementById('recurringModalTitle'),
    editId:        () => document.getElementById('recurring-edit-id'),
    department:    () => document.getElementById('rec-department'),
    employee:      () => document.getElementById('rec-employee'),
    taskType:      () => document.getElementById('rec-tasktype'),
    project:       () => document.getElementById('rec-project'),
    description:   () => document.getElementById('rec-description'),
    priority:      () => document.getElementById('rec-priority'),
    weeklyField:   () => document.getElementById('weeklyDaysField'),
    startDate:     () => document.getElementById('rec-start'),
    endDate:       () => document.getElementById('rec-end'),
    checkpointsList: () => document.getElementById('checkpointsList'),
    formMsg:       () => document.getElementById('recurringFormMsg'),
    saveBtn:       () => document.getElementById('saveRecurringBtn'),
    openBtn:       () => document.getElementById('openAddRecurring'),
    adminWrap:     () => document.getElementById('adminRecurringWrap'),
    empWrap:       () => document.getElementById('employeeRecurringWrap'),
    empList:       () => document.getElementById('employeeRecurringList'),
    adminTable:    () => document.getElementById('recurringTasksTableBody'),
    adminCards:    () => document.getElementById('adminRecurringCards'),
    newTaskTypeRow:    () => document.getElementById('recNewTaskTypeRow'),
    newTaskTypeInput:  () => document.getElementById('recNewTaskTypeInput'),
    newTaskTypeSave:   () => document.getElementById('recNewTaskTypeSave'),
    newTaskTypeCancel: () => document.getElementById('recNewTaskTypeCancel'),
    taskTypeMsg:       () => document.getElementById('recTaskTypeMsg'),
  };
  
  let recurringSelectedFreq = '';
  
  function initRecurringModal() {
    // Frequency buttons
    document.querySelectorAll('.freq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        recurringSelectedFreq = btn.dataset.freq;
        recEls.weeklyField().hidden = recurringSelectedFreq !== 'Weekly';
      });
    });
  
    // Add checkpoint
    document.getElementById('addCheckpointBtn')?.addEventListener('click', () => {
      addCheckpointRow('');
    });
  
    // Save button
    recEls.saveBtn().addEventListener('click', saveRecurringTask);
  
    // Close/cancel
    document.getElementById('closeRecurringModal')?.addEventListener('click', closeRecurringModal);
    document.getElementById('cancelRecurringModal')?.addEventListener('click', closeRecurringModal);
  
    // Open Add button (admin only)
    recEls.openBtn().addEventListener('click', () => openRecurringModal(null));
  
    // Task type changed → either open the inline "add new" row, or
    // auto-load that type's saved checkpoint template.
    recEls.taskType().addEventListener('change', async () => {
      const taskTypeId = recEls.taskType().value;
  
      if (taskTypeId === '__add_new__') {
        recEls.taskTypeMsg().hidden = true;
        recEls.newTaskTypeInput().value = '';
        recEls.newTaskTypeRow().hidden = false;
        recEls.newTaskTypeInput().focus();
        // Reset selection back to placeholder so "+ Add new task type…"
        // doesn't stay selected as if it were a real task type.
        recEls.taskType().value = '';
        return;
      }
  
      recEls.newTaskTypeRow().hidden = true;
      if (!taskTypeId) return;
  
      const hasExisting = recEls.checkpointsList().children.length > 0;
      if (hasExisting) {
        const ok = confirm("Load this task type's saved checkpoints? This will replace the current checkpoint list.");
        if (!ok) return;
      }
      try {
        const template = await api(`/recurring-tasks/checkpoint-templates/${taskTypeId}`);
        recEls.checkpointsList().innerHTML = '';
        template
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach(cp => addCheckpointRow(cp.label));
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  
    recEls.newTaskTypeCancel().addEventListener('click', () => {
      recEls.newTaskTypeRow().hidden = true;
    });
    recEls.newTaskTypeSave().addEventListener('click', saveNewTaskTypeFromModal);
    recEls.newTaskTypeInput().addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveNewTaskTypeFromModal(); }
    });
  }
  
  // Adds a new task type from inside the recurring-task modal, then refreshes
  // every task-type dropdown in the app (including this modal's) and selects
  // the freshly created type so the admin can keep going without re-opening
  // the modal.
  async function saveNewTaskTypeFromModal() {
    const name = recEls.newTaskTypeInput().value.trim();
    recEls.taskTypeMsg().hidden = true;
    if (!name) {
      recEls.taskTypeMsg().textContent = 'Please enter a task type name';
      recEls.taskTypeMsg().hidden = false;
      return;
    }
    recEls.newTaskTypeSave().disabled = true;
    try {
      await api('/master/task-types', { method: 'POST', body: { name } });
      // Refresh master task types everywhere (admin add-task form, filters, this modal)
      const taskTypes = await api('/master/task-types');
      state.master.taskTypes = taskTypes;
      fillSelect(els.fTaskType, taskTypes, { placeholder: 'Select task type' });
      fillSelect(recEls.taskType(), taskTypes, {
        placeholder: 'Select Task Type',
        extraOption: { value: '__add_new__', label: '+ Add new task type…' }
      });
      const created = taskTypes.find(t => t.name === name);
      if (created) recEls.taskType().value = created.id;
      recEls.newTaskTypeRow().hidden = true;
      showToast(`Task type "${name}" added ✅`, 'success');
    } catch (err) {
      recEls.taskTypeMsg().textContent = err.message;
      recEls.taskTypeMsg().hidden = false;
    } finally {
      recEls.newTaskTypeSave().disabled = false;
    }
  }
  
  function addCheckpointRow(value) {
    const list = recEls.checkpointsList();
    const row = document.createElement('div');
    row.className = 'checkpoint-row';
    row.innerHTML = `
      <input type="text" class="checkpoint-input" placeholder="Checkpoint label…" value="${escapeHtml(value)}" />
      <button type="button" class="ghost-btn-text cp-remove" style="color:#e53e3e">✕</button>
    `;
    row.querySelector('.cp-remove').addEventListener('click', () => row.remove());
    list.appendChild(row);
  }
  
  function getCheckpointValues() {
    return [...document.querySelectorAll('.checkpoint-input')]
      .map(i => i.value.trim())
      .filter(Boolean);
  }
  
  function openRecurringModal(task) {
    recEls.formMsg().hidden = true;
    recEls.checkpointsList().innerHTML = '';
    document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('selected'));
    recEls.weeklyField().hidden = true;
    recEls.newTaskTypeRow().hidden = true;
    recEls.taskTypeMsg().hidden = true;
    // uncheck all days
    document.querySelectorAll('#weeklyDaysField input[type=checkbox]').forEach(c => c.checked = false);
  
    if (task) {
      // Edit mode
      recEls.modalTitle().textContent = '✏️ Edit Recurring Task';
      recEls.saveBtn().textContent = 'Save Changes';
      recEls.editId().value = task.id;
      recEls.description().value = task.description || '';
      recEls.priority().value = task.priority || 'Medium';
      recEls.startDate().value = task.start_date || '';
      recEls.endDate().value = task.end_date || '';
      if (task.department?.id) recEls.department().value = task.department.id;
      if (task.project?.id) recEls.project().value = task.project.id;
      if (task.task_type?.id) recEls.taskType().value = task.task_type.id;
      if (task.assigned_to_user?.id) recEls.employee().value = task.assigned_to_user.id;
      // Frequency
      recurringSelectedFreq = task.frequency || '';
      const freqBtn = document.querySelector(`.freq-btn[data-freq="${recurringSelectedFreq}"]`);
      if (freqBtn) freqBtn.classList.add('selected');
      if (recurringSelectedFreq === 'Weekly') {
        recEls.weeklyField().hidden = false;
        const days = (task.frequency_days || '').split(',').map(Number);
        document.querySelectorAll('#weeklyDaysField input[type=checkbox]').forEach(c => {
          c.checked = days.includes(Number(c.value));
        });
      }
      // Checkpoints
      (task.checkpoints || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach(cp => addCheckpointRow(cp.label));
    } else {
      // Create mode
      recEls.modalTitle().textContent = '🔁 Create Recurring Task';
      recEls.saveBtn().textContent = 'Create Recurring Task';
      recEls.editId().value = '';
      recEls.description().value = '';
      recEls.department().value = '';
      recEls.employee().value = '';
      recEls.taskType().value = '';
      recEls.project().value = '';
      recEls.priority().value = 'Medium';
      recEls.startDate().value = '';
      recEls.endDate().value = '';
      recurringSelectedFreq = '';
    }
  
    recEls.modal().hidden = false;
  }
  
  function closeRecurringModal() {
    recEls.modal().hidden = true;
  }
  
  async function saveRecurringTask() {
    recEls.formMsg().hidden = true;
    const editId = recEls.editId().value;
  
    if (!recEls.employee().value) {
      recEls.formMsg().textContent = 'Please select an employee'; recEls.formMsg().hidden = false; return;
    }
    if (!recEls.description().value.trim()) {
      recEls.formMsg().textContent = 'Please enter a task description'; recEls.formMsg().hidden = false; return;
    }
    if (!recurringSelectedFreq) {
      recEls.formMsg().textContent = 'Please select a frequency'; recEls.formMsg().hidden = false; return;
    }
    if (!recEls.startDate().value) {
      recEls.formMsg().textContent = 'Please select a start date'; recEls.formMsg().hidden = false; return;
    }
  
    const freqDays = [];
    if (recurringSelectedFreq === 'Weekly') {
      document.querySelectorAll('#weeklyDaysField input[type=checkbox]:checked').forEach(c => {
        freqDays.push(Number(c.value));
      });
      if (!freqDays.length) {
        recEls.formMsg().textContent = 'Please select at least one day'; recEls.formMsg().hidden = false; return;
      }
    }
  
    const body = {
      assigned_to:    recEls.employee().value,
      department_id:  recEls.department().value || null,
      project_id:     recEls.project().value || null,
      task_type_id:   recEls.taskType().value || null,
      description:    recEls.description().value.trim(),
      priority:       recEls.priority().value,
      frequency:      recurringSelectedFreq,
      frequency_days: freqDays,
      start_date:     recEls.startDate().value,
      end_date:       recEls.endDate().value || null,
      checkpoints:    getCheckpointValues()
    };
  
    recEls.saveBtn().disabled = true;
    try {
      if (editId) {
        await api(`/recurring-tasks/${editId}`, { method: 'PATCH', body });
        showToast('Recurring task updated ✅', 'success');
      } else {
        await api('/recurring-tasks', { method: 'POST', body });
        showToast('Recurring task created ✅', 'success');
      }
      closeRecurringModal();
      loadRecurringView();
    } catch (err) {
      recEls.formMsg().textContent = err.message;
      recEls.formMsg().hidden = false;
    } finally {
      recEls.saveBtn().disabled = false;
    }
  }
  
  
  async function loadRecurringView() {
    const isAdmin = state.user.role === 'admin';
    // NOTE: this used to also check state.user.can_add_employee, which is an
    // "Add employee" permission unrelated to recurring tasks. That caused any
    // employee granted that one permission to also get the admin recurring
    // task view (Add Recurring Task button, edit/delete, etc.), even though
    // the backend only allows actual admins to create/edit/delete recurring
    // tasks (see requireAdmin in recurring_tasks.js). Gate on isAdmin only.
    const canManageRecurring = isAdmin;
    recEls.openBtn().hidden = !canManageRecurring;
    recEls.adminWrap().hidden = !canManageRecurring;
    recEls.empWrap().hidden = canManageRecurring;
  
    if (canManageRecurring) {
      await loadAdminRecurringTasks();
    } else {
      await loadEmployeeRecurringTasks();
    }
  }
  // ─── Admin view ───────────────────────────────────────────────────────────────
  
  async function loadAdminRecurringTasks() {
    const tbody = recEls.adminTable();
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading…</td></tr>`;
    recEls.adminCards().innerHTML = `<div class="empty-state">Loading…</div>`;
    try {
      const tasks = await api('/recurring-tasks/all');
      renderAdminRecurringTable(tasks);
      renderAdminRecurringCards(tasks);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  function freqLabel(task) {
    if (task.frequency === 'Weekly' && task.frequency_days) {
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const days = task.frequency_days.split(',').map(Number).map(d => dayNames[d]).join(', ');
      return `Weekly (${days})`;
    }
    return task.frequency;
  }
  
  function renderAdminRecurringTable(tasks) {
    const tbody = recEls.adminTable();
    if (!tasks.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No recurring tasks yet</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach(task => {
      const tr = document.createElement('tr');
      const cpCount = (task.checkpoints || []).length;
      tr.innerHTML = `
        <td><strong>${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</strong></td>
        <td style="max-width:200px">${escapeHtml(task.description?.slice(0,80) ?? '—')}${task.description?.length > 80 ? '…' : ''}</td>
        <td>${escapeHtml(freqLabel(task))}</td>
        <td style="font-size:12px">${escapeHtml(task.start_date ?? '—')} → ${escapeHtml(task.end_date ?? 'ongoing')}</td>
        <td>${cpCount ? `${cpCount} checkpoint${cpCount>1?'s':''}` : '<span style="color:#aaa">None</span>'}</td>
        <td><span class="pill ${task.is_active ? 'pill-In-Progress' : 'pill-Rejected'}">${task.is_active ? 'Active' : 'Inactive'}</span></td>
        <td class="row-actions"></td>
      `;
      const actCell = tr.lastElementChild;
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn action-accept'; editBtn.textContent = '✏️ Edit';
      editBtn.addEventListener('click', () => openRecurringModal(task));
      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn action-reject'; delBtn.textContent = '🗑️ Delete';
      delBtn.addEventListener('click', () => deleteRecurringTask(task));
      actCell.appendChild(editBtn); actCell.appendChild(delBtn);
      tbody.appendChild(tr);
    });
  }
  
  function renderAdminRecurringCards(tasks) {
    const wrap = recEls.adminCards();
    if (!tasks.length) { wrap.innerHTML = `<div class="empty-state">No recurring tasks yet</div>`; return; }
    wrap.innerHTML = '';
    tasks.forEach(task => {
      const cpCount = (task.checkpoints || []).length;
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-card-header">
          <span class="pill ${task.is_active ? 'pill-In-Progress' : 'pill-Rejected'}">${task.is_active ? 'Active' : 'Inactive'}</span>
          <span style="font-size:12px;color:#888">${escapeHtml(freqLabel(task))}</span>
        </div>
        <div class="task-card-body">
          <div class="task-detail-line"><span class="task-detail-label">Employee:</span> ${escapeHtml(task.assigned_to_user?.full_name ?? '—')}</div>
          <div class="task-detail-line"><span class="task-detail-label">Task:</span> ${escapeHtml(task.description?.slice(0,100) ?? '—')}${task.description?.length>100?'…':''}</div>
          <div class="task-detail-line"><span class="task-detail-label">Period:</span> ${escapeHtml(task.start_date)} → ${escapeHtml(task.end_date ?? 'ongoing')}</div>
          <div class="task-detail-line"><span class="task-detail-label">Checkpoints:</span> ${cpCount ? `${cpCount}` : 'None'}</div>
        </div>
        <div class="task-card-actions">
          <button class="action-btn action-accept edit-rec-btn">✏️ Edit</button>
          <button class="action-btn action-reject del-rec-btn">🗑️ Delete</button>
        </div>
      `;
      card.querySelector('.edit-rec-btn').addEventListener('click', () => openRecurringModal(task));
      card.querySelector('.del-rec-btn').addEventListener('click', () => deleteRecurringTask(task));
      wrap.appendChild(card);
    });
  }
  
  async function deleteRecurringTask(task) {
    if (!confirm(`Delete recurring task "${task.description?.slice(0,60)}"? This cannot be undone.`)) return;
    try {
      await api(`/recurring-tasks/${task.id}`, { method: 'DELETE' });
      showToast('Recurring task deleted', 'success');
      loadRecurringView();
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // ─── Employee view ────────────────────────────────────────────────────────────
  
  // async function loadEmployeeRecurringTasks() {
  //   const wrap = recEls.empList();
  //   wrap.innerHTML = `<div class="empty-state">Loading your recurring tasks…</div>`;
  //   try {
  //     const tasks = await api('/recurring-tasks/my');
  //     renderEmployeeRecurringList(tasks);
  //   } catch (err) { showToast(err.message, 'error'); }
  // }
  
  async function loadEmployeeRecurringTasks() {
    const wrap = recEls.empList();
    const tbody = document.getElementById('employeeRecurringTableBody');
    wrap.innerHTML = `<div class="empty-state">Loading your recurring tasks…</div>`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Loading…</td></tr>`;
    try {
      const tasks = await api('/recurring-tasks/my');
      renderEmployeeRecurringList(tasks);
      renderEmployeeRecurringTable(tasks);
    } catch (err) { showToast(err.message, 'error'); }
  }
  
  // Default refresh used after marking a recurring task done from the main
  // "My recurring tasks" page. (The admin's own recurring tasks inside "My
  // Tasks" are merged into that table directly and refresh via loadMyTasks.)
  async function refreshMainRecurringView() {
    const refreshed = await api('/recurring-tasks/my');
    renderEmployeeRecurringList(refreshed);
    renderEmployeeRecurringTable(refreshed);
  }
  
  // Desktop table view — same data as the card list above, laid out as rows.
  // tbody/refreshFn are overridable so this same renderer can also be reused
  // for an admin's own recurring tasks inside the "My Tasks" tab.
  function renderEmployeeRecurringTable(allTasks, tbody = document.getElementById('employeeRecurringTableBody'), refreshFn = refreshMainRecurringView) {
    if (!tbody) return;
    // Backend already sends exactly the rows that belong here: one per
    // pending due date (including any missed/backdated days, each keeping
    // its own row), plus today's if it just got marked done. Nothing to
    // filter here — a missed day like the 6th shows alongside the 7th
    // instead of disappearing once the 7th's instance is created.
    const tasks = allTasks;
    if (!tasks.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No recurring tasks assigned to you</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    tasks.forEach((task) => {
      const tr = document.createElement('tr');
      const inst = task.instance;
      const checkpoints = (task.checkpoints || []).sort((a, b) => a.sort_order - b.sort_order);
      const completedIds = inst
        ? (inst.recurring_task_checkpoint_completions || []).map((c) => c.checkpoint_id)
        : [];
      const allDone = checkpoints.length > 0 && completedIds.length === checkpoints.length;
      const isCompleted = inst?.status === 'Completed' || inst?.status === 'NotApplicable';
      const isNa = inst?.status === 'NotApplicable';
      const isOverdue = !task.is_today && !isCompleted;
      const canAct = !isCompleted;
      const statusText = isNa ? 'Not Applicable'
        : isCompleted ? 'Completed'
        : checkpoints.length === 0 ? (isOverdue ? 'Pending (overdue)' : 'Pending')
        : `Pending (${completedIds.length}/${checkpoints.length} done)${isOverdue ? ' — overdue' : ''}`;
      const pillClass = isNa ? 'pill-InProgress'
        : isCompleted ? 'pill-Completed'
        : isOverdue ? 'pill-Rejected'
        : 'pill-InProgress';
  
      const tdTask = document.createElement('td');
      tdTask.innerHTML = `
        <div class="task-detail-line"><strong>${escapeHtml(task.description ?? '')}</strong></div>
        ${task.project ? `<div class="task-detail-line"><span class="task-detail-label">Project:</span> ${escapeHtml(task.project.name)}</div>` : ''}
        ${task.task_type ? `<div class="task-detail-line"><span class="task-detail-label">Type:</span> ${escapeHtml(task.task_type.name)}</div>` : ''}
      `;
  
      const tdFreq = document.createElement('td');
      tdFreq.textContent = freqLabel(task);
  
      // Each row is its own due date now — the 6th's missed instance shows
      // "6 Jul" here while the 7th's shows "7 Jul", side by side as separate rows.
      const tdDate = document.createElement('td');
      tdDate.style.whiteSpace = 'nowrap';
      tdDate.textContent = fmtDateOnly(task.due_date);
  
      const tdStatus = document.createElement('td');
      tdStatus.innerHTML = `<span class="pill ${pillClass}">${escapeHtml(statusText)}</span>`;
      if (canAct) {
        const actions = document.createElement('div');
        actions.style.marginTop = '6px';
        actions.style.display = 'flex';
        actions.style.gap = '6px';
        actions.style.flexWrap = 'wrap';
        appendRecurringActionButtons(actions, task, inst, checkpoints, refreshFn);
        tdStatus.appendChild(actions);
      }
  
      tr.append(tdTask, tdFreq, tdDate, tdStatus);
      tbody.appendChild(tr);
    });
  }
  
  // Shared "Done" / "Not Applicable" buttons for recurring instances
  function appendRecurringActionButtons(container, task, inst, checkpoints, refreshFn) {
    const doneBtn = document.createElement('button');
    doneBtn.className = 'action-btn action-accept';
    doneBtn.textContent = '✅ Done';
    doneBtn.addEventListener('click', () => openRecurringDoneFlow(task, inst, checkpoints, refreshFn));
    container.appendChild(doneBtn);

    const naBtn = document.createElement('button');
    naBtn.className = 'action-btn action-reject';
    naBtn.textContent = '⊘ Not Applicable';
    naBtn.title = 'Not applicable for this due date only — next week still appears';
    naBtn.addEventListener('click', () => markRecurringNotApplicable(inst, refreshFn));
    container.appendChild(naBtn);
  }

  async function markRecurringNotApplicable(inst, refresh = refreshMainRecurringView) {
    if (!inst) return;
    if (!confirm('Mark Not Applicable for this due date only?\n\nNext weekly occurrence will still appear.')) return;
    try {
      await api(`/recurring-tasks/instances/${inst.id}/not-applicable`, { method: 'POST' });
      await refresh();
      showToast('Marked Not Applicable for this date ⊘', 'success');
      refreshNavBadges();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  
  // Shared "Done" flow for a recurring task instance, used by both the table
  // and card views. If the task has no checkpoints, completes immediately.
  // If it has checkpoints, opens a modal to tick them off, then Submit saves
  // and closes it. On completion the task drops out of the active list —
  // renderEmployeeRecurringList/-Table already do this automatically once the
  // refreshed data shows status: 'Completed'.
  async function openRecurringDoneFlow(task, inst, checkpoints, refresh = refreshMainRecurringView) {
    if (!inst) return;
  
    if (checkpoints.length === 0) {
      try {
        const updated = await api(`/recurring-tasks/instances/${inst.id}/complete`, { method: 'POST' });
        await refresh();
        if (updated.status === 'Completed') showToast('Task marked as done ✅', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }
  
    const completedIds = (inst.recurring_task_checkpoint_completions || []).map(c => c.checkpoint_id);
    const modal = document.getElementById('checkpointModal');
    const titleEl = document.getElementById('checkpointModalTitle');
    const listEl = document.getElementById('checkpointModalList');
    const msgEl = document.getElementById('checkpointModalMsg');
    const submitBtn = document.getElementById('submitCheckpointModal');
  
    titleEl.textContent = task.description || 'Checkpoints';
    msgEl.hidden = true;
    listEl.innerHTML = `<div class="checkpoint-list">` + checkpoints.map(cp => {
      const done = completedIds.includes(cp.id);
      return `
        <label class="checkpoint-item ${done ? 'cp-done' : ''}" data-cp="${cp.id}">
          <input type="checkbox" class="cp-checkbox" ${done ? 'checked' : ''} />
          <span>${escapeHtml(cp.label)}</span>
        </label>`;
    }).join('') + `</div>`;
  
    listEl.querySelectorAll('.cp-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        e.target.closest('label').classList.toggle('cp-done', cb.checked);
      });
    });
  
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  
    function close() {
      modal.hidden = true;
      submitBtn.removeEventListener('click', onSubmit);
      document.getElementById('cancelCheckpointModal').removeEventListener('click', close);
      document.getElementById('closeCheckpointModal').removeEventListener('click', close);
    }
  
    async function onSubmit() {
      const checkedIds = [...listEl.querySelectorAll('.cp-checkbox:checked')]
        .map(cb => cb.closest('label').dataset.cp);
      submitBtn.disabled = true;
      try {
        const updated = await api(
          `/recurring-tasks/instances/${inst.id}/submit`,
          { method: 'POST', body: { checkpoint_ids: checkedIds } }
        );
        close();
        await refresh();
        if (updated.status === 'Completed') {
          showToast('All checkpoints done — task completed! ✅', 'success');
        } else {
          showToast('Checkpoints saved', 'success');
        }
      } catch (err) {
        submitBtn.disabled = false;
        showToast(err.message, 'error');
      }
    }
  
    submitBtn.addEventListener('click', onSubmit);
    document.getElementById('cancelCheckpointModal')?.addEventListener('click', close);
    document.getElementById('closeCheckpointModal')?.addEventListener('click', close);
  
    modal.hidden = false;
  }
  function renderEmployeeRecurringList(tasks, wrap = recEls.empList(), refreshFn = refreshMainRecurringView) {
    if (!tasks.length) {
      wrap.innerHTML = `<div class="empty-state">No recurring tasks assigned to you</div>`;
      return;
    }
    wrap.innerHTML = '';
  
    // Backend already sends one row per pending due date, oldest first — a
    // missed day (e.g. the 6th) keeps its own row instead of vanishing once
    // the 7th's instance exists. Split just for a friendlier "Today" vs
    // "Overdue" heading; nothing gets filtered out here.
    const todays = tasks.filter(t => t.is_today);
    const overdue = tasks.filter(t => !t.is_today);
  
    if (overdue.length) {
      const hdr = document.createElement('div');
      hdr.className = 'nav-section-label'; hdr.textContent = 'Overdue';
      wrap.appendChild(hdr);
      overdue.forEach(t => wrap.appendChild(buildEmployeeRecurringCard(t, refreshFn)));
    }
  
    const hdr = document.createElement('div');
    hdr.className = 'nav-section-label'; hdr.style.marginTop = overdue.length ? '24px' : '0';
    hdr.textContent = "Today's tasks";
    wrap.appendChild(hdr);
    if (todays.length) {
      todays.forEach(t => wrap.appendChild(buildEmployeeRecurringCard(t, refreshFn)));
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nothing due today 🎉';
      wrap.appendChild(empty);
    }
  }
  
  function buildEmployeeRecurringCard(task, refreshFn = refreshMainRecurringView) {
    const card = document.createElement('div');
    card.className = 'task-card';
    const inst = task.instance;
    const checkpoints = (task.checkpoints || []).sort((a, b) => a.sort_order - b.sort_order);
    const completedIds = inst
      ? (inst.recurring_task_checkpoint_completions || []).map(c => c.checkpoint_id)
      : [];
    const allDone = checkpoints.length > 0 && completedIds.length === checkpoints.length;
    const isCompleted = inst?.status === 'Completed' || inst?.status === 'NotApplicable';
    const isNa = inst?.status === 'NotApplicable';
    const isOverdue = !task.is_today && !isCompleted;
    const canAct = !isCompleted;
    const status = isNa ? 'Not Applicable'
      : isCompleted ? 'Completed'
      : checkpoints.length === 0 ? (isOverdue ? 'Pending (overdue)' : 'Pending')
      : `Pending (${completedIds.length}/${checkpoints.length} done)${isOverdue ? ' — overdue' : ''}`;
  
    const pillClass = isNa ? 'pill-InProgress'
      : isCompleted ? 'pill-Completed'
      : isOverdue ? 'pill-Rejected'
      : 'pill-In-Progress';
  
    card.innerHTML = `
      <div class="task-card-header">
        <span class="pill ${pillClass}">${escapeHtml(status)}</span>
        <span style="font-size:12px;color:#888">${escapeHtml(freqLabel(task))}</span>
      </div>
      <div class="task-card-body">
        <div class="task-detail-line"><strong>${escapeHtml(task.description ?? '')}</strong></div>
        ${task.project ? `<div class="task-detail-line"><span class="task-detail-label">Project:</span> ${escapeHtml(task.project.name)}</div>` : ''}
        ${task.task_type ? `<div class="task-detail-line"><span class="task-detail-label">Type:</span> ${escapeHtml(task.task_type.name)}</div>` : ''}
        <div class="task-detail-line"><span class="task-detail-label">Planned date:</span> ${escapeHtml(fmtDateOnly(task.due_date))}</div>
      </div>
      ${canAct ? `<div class="task-card-actions" style="display:flex;gap:8px;flex-wrap:wrap"></div>` : ''}
    `;
  
    if (canAct) {
      const actions = card.querySelector('.task-card-actions');
      appendRecurringActionButtons(actions, task, inst, checkpoints, refreshFn);
    }
  
    return card;
  }
  
  // ─── Boot recurring modal once DOM is ready ───────────────────────────────────
  __tfReadyFns.push(() => {
    initRecurringModal();
  });
  
  // Fills the Department/Employee/Task Type/Project selects inside the
  // recurring-task modal from state.master. Called directly from
  // loadMasterData() once master data has loaded (not via monkey-patching —
  // that previously broke silently if this file loaded after the dropdowns
  // were first read).
  function fillRecurringDropdowns() {
    if (!state.master) return;
    fillSelect(recEls.department(), state.master.departments, { placeholder: 'Select Department' });
    fillSelect(recEls.taskType(), state.master.taskTypes, {
      placeholder: 'Select Task Type',
      extraOption: { value: '__add_new__', label: '+ Add new task type…' }
    });
    fillSelect(recEls.project(), state.master.projects, { placeholder: 'Select Project' });
    syncRecurringEmployeeDropdown();
    const deptSel = recEls.department();
    if (deptSel && !deptSel.dataset.deptFilterBound) {
      deptSel.dataset.deptFilterBound = '1';
      deptSel.addEventListener('change', syncRecurringEmployeeDropdown);
    }
  }
  // ═══════════════════════════════════════════════════════════════════
  // ─── DRAWINGS MODULE ───────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  
  const DRAWING_CATEGORIES = ['Layout','Presentation','Architectural','Structural','MEP','Others'];
  
  // ─── Add Drawing View ────────────────────────────────────────────────
  function renderDrawingAddView() {
    const view = document.getElementById('view-drawings-add');
    if (!view) return;
  
    // Load projects for dropdown
    api('/master/projects').then(projects => {
      const projSel = view.querySelector('#drw-project');
      if (projSel) {
        projSel.innerHTML = '<option value="">-- Select Project --</option>';
        (projects || []).forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id; opt.textContent = p.name;
          projSel.appendChild(opt);
        });
      }
    }).catch(() => {});
  
    // Load verifiers/heads for dropdown
    api('/master/verifiers').then(users => {
      const headSel = view.querySelector('#drw-head');
      if (headSel) {
        headSel.innerHTML = '<option value="">-- Select Head --</option>';
        (users || []).forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id; opt.textContent = u.full_name;
          headSel.appendChild(opt);
        });
      }
    }).catch(() => {});
  
    // Category change → update subcategory
    const catSel = view.querySelector('#drw-category');
    const sub1Sel = view.querySelector('#drw-sub1');
    if (catSel && sub1Sel) {
      catSel.addEventListener('change', () => {
        sub1Sel.innerHTML = '<option value="">-- Select Sub Category --</option>';
      });
    }
  
    const form = view.querySelector('#drawingForm');
    const msgEl = view.querySelector('#drawingFormMsg');
    if (!form) return;
  
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msgEl.hidden = true;
  
      const project_id = view.querySelector('#drw-project').value;
      const category   = view.querySelector('#drw-category').value;
      const sub_cat_1  = view.querySelector('#drw-sub1').value;
      const sub_cat_2  = view.querySelector('#drw-sub2').value;
      const sub_cat_3  = view.querySelector('#drw-sub3').value;
      const drawing_date = view.querySelector('#drw-date').value;
      const head_id    = view.querySelector('#drw-head').value;
      const revision   = view.querySelector('#drw-revision').value || 'R0';
      const remarks    = view.querySelector('#drw-remarks').value;
      const fileInput  = view.querySelector('#drw-files');
  
      if (!project_id || !category || !drawing_date || !head_id) {
        msgEl.textContent = 'Please fill in all required fields';
        msgEl.hidden = false;
        return;
      }
  
      try {
        const fd = new FormData();
        fd.append('project_id', project_id);
        fd.append('category', category);
        fd.append('sub_cat_1', sub_cat_1);
        fd.append('sub_cat_2', sub_cat_2);
        fd.append('sub_cat_3', sub_cat_3);
        fd.append('drawing_date', drawing_date);
        fd.append('head_id', head_id);
        fd.append('revision', revision);
        fd.append('remarks', remarks);
        if (fileInput.files.length > 0) {
          Array.from(fileInput.files).forEach(f => fd.append('files', f));
        }
  
        await api('/drawings', { method: 'POST', body: fd, isForm: true });
        showToast('Drawing saved ✅', 'success');
        form.reset();
      } catch (err) {
        msgEl.textContent = err.message || 'Failed to save drawing';
        msgEl.hidden = false;
      }
    });
  
    // Reset button
    const resetBtn = view.querySelector('#drawingResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => { form.reset(); msgEl.hidden = true; });
  }
  
  // ─── All Drawings View ───────────────────────────────────────────────
  let allDrawingsCache = [];
  
  async function loadAllDrawings() {
    const view = document.getElementById('view-drawings-all');
    if (!view) return;
    const tbody = view.querySelector('#drawingsTableBody');
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state">Loading drawings…</td></tr>`;
  
    try {
      allDrawingsCache = await api('/drawings');
      // Populate project filter
      const filterSel = view.querySelector('#drwFilterProject');
      if (filterSel) {
        const projects = [...new Map(allDrawingsCache.map(d => [d.project?.id, d.project?.name])).entries()]
          .filter(([id]) => id).sort((a,b) => a[1].localeCompare(b[1]));
        filterSel.innerHTML = '<option value="">All Projects</option>';
        projects.forEach(([id, name]) => {
          const opt = document.createElement('option');
          opt.value = id; opt.textContent = name;
          filterSel.appendChild(opt);
        });
      }
      renderDrawingsTable(allDrawingsCache);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-state">Failed to load drawings</td></tr>`;
      showToast(err.message, 'error');
    }
  }
  
  function renderDrawingsTable(drawings) {
    const view = document.getElementById('view-drawings-all');
    const tbody = view.querySelector('#drawingsTableBody');
    const countEl = view.querySelector('#drawingsCount');
    if (countEl) countEl.textContent = `${drawings.length} total`;
  
    if (!drawings.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-state"><span class="emoji">📐</span>No drawings found</td></tr>`;
      return;
    }
    tbody.innerHTML = '';
    drawings.forEach((d, i) => {
      const tr = document.createElement('tr');
      const fileUrls = Array.isArray(d.file_urls) ? d.file_urls : (d.file_url ? [d.file_url] : []);
      const previewHtml = fileUrls.length
        ? fileUrls.map(u => `<a href="${escapeHtml(u)}" target="_blank" class="media-link drw-view-btn">View</a>`).join(' ')
        : `<span class="media-none">—</span>`;
  
      tr.innerHTML = `
        <td><span class="sr-number">${i+1}</span></td>
        <td><strong style="font-weight:600">${escapeHtml(d.project?.name ?? '—')}</strong></td>
        <td><span class="ticket-category-chip">${escapeHtml(d.category ?? '—')}</span></td>
        <td>${escapeHtml(d.sub_cat_1 || '—')}</td>
        <td>${escapeHtml(d.sub_cat_2 || '—')}</td>
        <td>${escapeHtml(d.sub_cat_3 || '—')}</td>
        <td style="white-space:nowrap">${d.drawing_date ? fmtDate(d.drawing_date) : '—'}</td>
        <td>${escapeHtml(d.head_user?.full_name ?? '—')}</td>
        <td><span class="pill pill-Pending" style="font-size:0.72rem;padding:2px 8px">${escapeHtml(d.revision ?? 'R0')}</span></td>
        <td style="font-size:0.8rem">${escapeHtml(d.remarks || '—')}</td>
        <td style="text-align:center">${previewHtml}</td>
        <td>${escapeHtml(d.added_by_user?.full_name ?? '—')}</td>
        <td class="row-actions"><button class="action-btn action-delete drw-delete-btn" data-id="${d.id}">🗑 Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  
    // Delete listeners
    tbody.querySelectorAll('.drw-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this drawing?')) return;
        try {
          await api(`/drawings/${btn.dataset.id}`, { method: 'DELETE' });
          showToast('Drawing deleted', 'success');
          loadAllDrawings();
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  }
  
  // Filter by project
  document.addEventListener('change', (e) => {
    if (e.target.id === 'drwFilterProject') {
      const val = e.target.value;
      const filtered = val
        ? allDrawingsCache.filter(d => String(d.project?.id) === val)
        : allDrawingsCache;
      renderDrawingsTable(filtered);
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // ─── DAILY REPORT MODULE ──────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  
  let _drptMode = 'single'; // 'single' | 'range'
  
  function loadDailyReport() {
    const dateInput   = document.getElementById('drptDate');
    const fromInput   = document.getElementById('drptFromDate');
    const toInput     = document.getElementById('drptToDate');
    const genBtn      = document.getElementById('drptGenBtn');
    const dlBtn       = document.getElementById('drptDownloadBtn');
    const modeSingle  = document.getElementById('drptModeSingle');
    const modeRange   = document.getElementById('drptModeRange');
    const singleWrap  = document.getElementById('drptSingleWrap');
    const rangeWrap   = document.getElementById('drptRangeWrap');
  
    // Default: yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    if (dateInput && !dateInput._drptInit) {
      dateInput.value = yStr;
      dateInput._drptInit = true;
    }
    if (fromInput && !fromInput._drptInit) {
      fromInput.value = yStr;
      toInput.value = new Date().toISOString().slice(0, 10);
      fromInput._drptInit = true;
    }
  
    // Mode toggle
    if (modeSingle && !modeSingle._drptBound) {
      modeSingle._drptBound = true;
      modeSingle.addEventListener('click', () => {
        _drptMode = 'single';
        modeSingle.classList.add('active');
        modeRange.classList.remove('active');
        singleWrap.style.display = 'flex';
        rangeWrap.style.display = 'none';
      });
      modeRange.addEventListener('click', () => {
        _drptMode = 'range';
        modeRange.classList.add('active');
        modeSingle.classList.remove('active');
        singleWrap.style.display = 'none';
        rangeWrap.style.display = 'flex';
      });
    }
  
    // Generate on button click
    if (genBtn && !genBtn._drptBound) {
      genBtn._drptBound = true;
      genBtn.addEventListener('click', () => generateDailyReport());
      if (dateInput) dateInput.addEventListener('change', () => generateDailyReport());
      // Auto-generate on first load
      generateDailyReport();
    }
  
    if (dlBtn && !dlBtn._drptBound) {
      dlBtn._drptBound = true;
      dlBtn.addEventListener('click', () => downloadDailyReportPdf());
    }
  }
  
  async function generateDailyReport() {
    const dateInput  = document.getElementById('drptDate');
    const fromInput  = document.getElementById('drptFromDate');
    const toInput    = document.getElementById('drptToDate');
    const body       = document.getElementById('drptBody');
    const subtitle   = document.getElementById('drptSubtitle');
    const dlBtn      = document.getElementById('drptDownloadBtn');
  
    let reportDateStr, rangeLabel;
  
    if (_drptMode === 'range') {
      const fromStr = fromInput?.value;
      const toStr   = toInput?.value;
      if (!fromStr || !toStr) return;
      const fmtD = (s) => new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      rangeLabel = `${fmtD(fromStr)} – ${fmtD(toStr)}`;
      if (subtitle) subtitle.textContent = `Report: ${rangeLabel}`;
      reportDateStr = null; // signal range mode
      body.innerHTML = `<div class="empty-state">Generating report…</div>`;
      await _generateDailyReportForRange(fromStr, toStr, body, dlBtn, subtitle, rangeLabel);
      return;
    }
  
    reportDateStr = dateInput?.value;
    if (!reportDateStr) return;
  
    const d = new Date(reportDateStr);
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'long' });
    if (subtitle) subtitle.textContent = `Report for ${label}`;
  
    body.innerHTML = `<div class="empty-state">Generating report…</div>`;
  
    try {
      const allTasks = await api('/tasks/all');
      const rDate    = new Date(reportDateStr); rDate.setHours(0,0,0,0);
      const prevDate = new Date(rDate); prevDate.setDate(prevDate.getDate() - 1);

      const allForDay = classifyDailyReportTasks(allTasks, rDate);
  
      body.innerHTML = '';
  
      // ── PMS-style header (matching image format) ──
      const periodLabel = `${d.toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric'})}`;
      const pmsHtml = `
        <div class="drpt-pms-header">
          <div class="drpt-pms-smile">☺</div>
          <div class="drpt-pms-title">PMS (${periodLabel})</div>
        </div>`;
      body.insertAdjacentHTML('beforeend', pmsHtml);
  
      if (allForDay.length) {
        body.insertAdjacentHTML('beforeend', `<div class="drpt-section-title" style="margin-top:20px">📋 Task Status Summary</div>`);
        const tbl = buildDrptPmsTable(allForDay, prevDate);
        body.appendChild(tbl);
      } else {
        body.insertAdjacentHTML('beforeend', `<div class="empty-state">No overdue, pending, or done-today tasks for this date</div>`);
      }

      if (dlBtn) dlBtn.style.display = '';
    } catch (err) {
      body.innerHTML = `<div class="empty-state">Failed to generate report: ${escapeHtml(err.message)}</div>`;
    }
  }

  function startOfLocalDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function taskVerifiedDay(t) {
    const iso = t.verified_at || t.first_verified_at;
    if (!iso) return null;
    const d = parseLocalDate(iso);
    if (!d || Number.isNaN(d.getTime())) return null;
    return startOfLocalDay(d);
  }

  function isReportVerified(t) {
    return t.verification_status === 'Verified' || (!!taskVerifiedDay(t) && t.status === 'Completed');
  }

  // Daily report rows: overdue + pending (incl. under-verification) + verified today.
  // Yesterday-or-earlier verified tasks are omitted. Future-due and Rejected omitted.
  function classifyDailyReportTasks(allTasks, reportDate) {
    const rDate = startOfLocalDay(reportDate);
    const overdue = [];
    const pending = [];
    const doneToday = [];

    (allTasks || []).forEach((t) => {
      if (t.status === 'Rejected') return;
      if (t.verification_status === 'Verification Rejected') return;

      const verified = isReportVerified(t);
      const doneDay = taskVerifiedDay(t);

      if (verified) {
        if (doneDay && doneDay.getTime() === rDate.getTime()) {
          doneToday.push({ ...t, _section: 'done', _daysLate: 0 });
        }
        return;
      }

      const targetD = t.target_date ? parseLocalDate(t.target_date) : null;
      if (!targetD || Number.isNaN(targetD.getTime())) return;
      targetD.setHours(0, 0, 0, 0);
      if (targetD > rDate) return;

      const daysLate = Math.floor((rDate - targetD) / 86400000);
      const row = { ...t, _daysLate: Math.max(0, daysLate), _section: daysLate > 0 ? 'overdue' : 'pending' };
      if (daysLate > 0) overdue.push(row);
      else pending.push(row);
    });

    overdue.sort((a, b) => b._daysLate - a._daysLate);
    return [...overdue, ...pending, ...doneToday];
  }

  // Builds the PMS-style main table (Sr, Prev. date, Target date, Task, Assignee, Delay, Remarks)
  function buildDrptPmsTable(tasks, prevDate) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap drpt-pms-wrap';
    const tbl  = document.createElement('table');
    tbl.className = 'data-table drpt-table drpt-pms-table';
    const prevLabel = prevDate ? fmtDateOnly(prevDate) : '—';
  
    tbl.innerHTML = `<thead><tr>
      <th class="col-sr">Sr.no</th>
      <th>Prev. date</th>
      <th>Target date</th>
      <th>Task</th>
      <th>Assigne</th>
      <th>Delay</th>
      <th>Remarks</th>
    </tr></thead>`;
  
    const tbody = document.createElement('tbody');
    tasks.forEach((t, i) => {
      const tr = document.createElement('tr');
      const isDone = t._section === 'done';
      const daysLate = t._daysLate ?? 0;
  
      let delayHtml;
      if (isDone) delayHtml = `<span class="drpt-done-badge">DONE</span>`;
      else if (daysLate > 0) delayHtml = `<span class="drpt-overdue-badge">${daysLate} Days</span>`;
      else delayHtml = `<span class="drpt-pending-badge">Today</span>`;
  
      tr.innerHTML = `
        <td><span class="sr-number">${i + 1}</span></td>
        <td style="white-space:nowrap;font-size:0.82rem">${escapeHtml(prevLabel)}</td>
        <td style="white-space:nowrap;font-size:0.82rem">${t.target_date ? fmtDateOnly(t.target_date) : '—'}</td>
        <td class="drpt-task-cell">
          <div style="font-size:0.8rem;font-weight:700;color:var(--indigo,#4f46e5);text-transform:uppercase">${escapeHtml(t.project?.name ?? '')}</div>
          <div style="font-size:0.82rem">${escapeHtml(t.description)}</div>
        </td>
        <td style="font-weight:600;font-size:0.82rem">${escapeHtml(t.assigned_to_user?.full_name ?? '—')}</td>
        <td>${delayHtml}</td>
        <td></td>
      `;
      const remarksCell = tr.children[6];
      remarksCell.innerHTML = `<input type="text" value="" placeholder="Add remark…" class="drpt-remark-input" />`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    return wrap;
  }
  
  // Date-range report: one table per calendar day using the same overdue / pending / done-today rules
  async function _generateDailyReportForRange(fromStr, toStr, body, dlBtn, subtitle, rangeLabel) {
    try {
      const allTasks = await api('/tasks/all');
      const from = startOfLocalDay(parseLocalDate(fromStr));
      const to   = startOfLocalDay(parseLocalDate(toStr));
  
      body.innerHTML = '';
      body.insertAdjacentHTML('beforeend', `
        <div class="drpt-pms-header">
          <div class="drpt-pms-smile">☺</div>
          <div class="drpt-pms-title">PMS (${rangeLabel})</div>
        </div>`);
  
      let anyRows = false;
      for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
        const day = startOfLocalDay(cursor);
        const rows = classifyDailyReportTasks(allTasks, day);
        if (!rows.length) continue;
        anyRows = true;
        const dayLabel = day.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric', weekday:'long' });
        const prevDate = new Date(day); prevDate.setDate(prevDate.getDate() - 1);
        body.insertAdjacentHTML('beforeend', `<div class="drpt-section-title" style="margin-top:28px">📅 ${dayLabel}</div>`);
        body.appendChild(buildDrptPmsTable(rows, prevDate));
      }

      if (!anyRows) {
        body.insertAdjacentHTML('beforeend', `<div class="empty-state">No overdue, pending, or done-today tasks for this date range</div>`);
        if (dlBtn) dlBtn.style.display = 'none';
        return;
      }
  
      if (dlBtn) dlBtn.style.display = '';
    } catch (err) {
      body.innerHTML = `<div class="empty-state">Failed: ${escapeHtml(err.message)}</div>`;
    }
  }
  
  function buildDrptTable(headers, rows, editableRemarks) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
  
    const colCount = headers.length;
    const tbl = document.createElement('table');
    tbl.className = 'data-table drpt-table';
  
    // Head
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    tbl.appendChild(thead);
  
    // Body
    const tbody = document.createElement('tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="empty-state">No tasks</td></tr>`;
    } else {
      rows.forEach(row => {
        const tr = document.createElement('tr');
        const vals = Object.values(row);
        vals.forEach((val, idx) => {
          const td = document.createElement('td');
          // Last column + editableRemarks → make it an input
          if (editableRemarks && idx === vals.length - 1) {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = val || '';
            inp.placeholder = 'Add remark…';
            inp.className = 'drpt-remark-input';
            td.appendChild(inp);
          } else {
            td.innerHTML = String(val ?? '—');
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    return wrap;
  }
  
  function downloadDailyReportPdf() {
    const dateInput  = document.getElementById('drptDate');
    const reportDate = dateInput?.value || 'report';
    const body       = document.getElementById('drptBody');
    const subtitle   = document.getElementById('drptSubtitle');
  
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
          .drpt-overdue-badge { background:#fef2f2; color:#dc2626; font-weight:700;
            padding:2px 8px; border-radius:6px; font-size:10px; }
          input.drpt-remark-input { border:none; background:transparent; width:100%; font-size:11px; }
          @media print { body { margin:10px; } }
        </style>
      </head>
      <body>
        <h1>📋 DIP Projects — Daily Report</h1>
        <p class="sub">${subtitle?.textContent || reportDate}</p>
        ${body.innerHTML.replace(/class="drpt-remark-input"/g, 'style="border:none;width:100%;font-size:11px"')}
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  // ─── MIS Report (admin, week-wise) ────────────────────────────────────────────
  let _misLastData = null;

  function misPill(n, kind, icon = '') {
    return `<span class="mis-pill ${kind}">${icon ? `${icon} ` : ''}${n}</span>`;
  }

  function misPctCell(pct) {
    // 0 = all done (good). Higher = more still open.
    const color = pct <= 0 ? '#16a34a' : pct <= 33.33 ? '#d97706' : '#dc2626';
    const w = Math.max(0, Math.min(100, pct));
    const text = formatMisPct(pct);
    return `
      <div class="mis-pct-wrap">
        <strong style="color:${color}">${text}%</strong>
        <div class="mis-pct-bar"><div class="mis-pct-fill" style="width:${w}%;background:${color}"></div></div>
      </div>`;
  }

  function formatMisPct(pct) {
    const n = Number(pct) || 0;
    if (n === 0) return '0';
    // Up to 2 decimals (33.33, 44.7)
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  }

  function misEmployeeRow(e, isTotal = false, taskType = 'all') {
    let splitHtml = '';
    if (!isTotal) {
      if (taskType === 'normal') {
        splitHtml = `<div class="mis-split">Delegated ${e.regular_total || 0}</div>`;
      } else if (taskType === 'recurring') {
        splitHtml = `<div class="mis-split">Recurring ${e.recurring_total || 0}</div>`;
      } else {
        splitHtml = `<div class="mis-split">Delegated ${e.regular_total || 0} · Recurring ${e.recurring_total || 0}</div>`;
      }
    }
    const nameHtml = isTotal
      ? `<strong>Grand Total (${e.employee_count || 0} employees)</strong>`
      : `<div class="mis-emp-name">${escapeHtml(e.name)}</div>
         <div class="mis-emp-meta">${escapeHtml(e.username || '')}${e.department ? ` · ${escapeHtml(e.department)}` : ''}</div>
         ${splitHtml}`;
    return `
      <tr class="${isTotal ? 'mis-total-row' : ''}">
        <td>${nameHtml}</td>
        <td>${misPill(e.total || 0, 'total')}</td>
        <td>${misPill(e.done || 0, 'done', '✓')}</td>
        <td>${misPill(e.on_time || 0, 'ontime')}<div class="mis-emp-meta">${e.on_time_pct || 0}%</div></td>
        <td>${misPill(e.delayed_done || 0, 'delayed-done')}</td>
        <td>${misPill(e.delayed || e.delayed_not_done || 0, 'delayed')}</td>
        <td>${misPill(e.pending || 0, 'pending', '⏳')}</td>
        <td>${misPill(e.na || 0, 'na')}</td>
        <td>${misPctCell(e.completion_pct || 0)}</td>
      </tr>`;
  }

  function renderMisWeekCard(w, taskType = 'all') {
    const hint = w.spans_prev_month
      ? ' · includes previous month'
      : w.spans_next_month
        ? ' · includes next month'
        : '';
    let rowsHtml = '';
    if (!w.employees?.length) {
      rowsHtml = `<tr><td colspan="9" class="empty-state">No tasks due this week</td></tr>`;
    } else {
      rowsHtml = w.employees.map((e) => misEmployeeRow(e, false, taskType)).join('');
      rowsHtml += misEmployeeRow({ ...w.totals, employee_count: w.employee_count }, true, taskType);
    }
    return `
      <div class="mis-week-card" data-week="${w.week}">
        <div class="mis-week-head">
          <h3>${escapeHtml(w.label)}${hint ? `<span class="mis-week-meta">${hint}</span>` : ''}</h3>
          <div class="mis-week-meta">${w.employee_count} employees · ${w.totals?.total || 0} tasks · Open ${formatMisPct(w.totals?.completion_pct || 0)}%</div>
        </div>
        <div class="table-scroll">
          <table class="data-table mis-table" style="min-width:960px">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Total</th>
                <th>Done</th>
                <th>On-time</th>
                <th>Delayed done</th>
                <th>Delayed</th>
                <th>Pending</th>
                <th>N/A</th>
                <th>Open % (0=all done)</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  function downloadMisCsv(data) {
    if (!data?.weeks?.length) {
      showToast('Nothing to export', 'error');
      return;
    }
    const headers = [
      'Week', 'From', 'To', 'Employee', 'Username', 'Department',
      'Total', 'Done', 'OnTime', 'DelayedDone', 'Delayed', 'Pending', 'NA',
      'CompletionPct', 'Regular', 'Recurring',
    ];
    const lines = [headers.join(',')];
    data.weeks.forEach((w) => {
      (w.employees || []).forEach((e) => {
        const cells = [
          w.week, w.from, w.to,
          `"${(e.name || '').replace(/"/g, '""')}"`,
          e.username || '',
          `"${(e.department || '').replace(/"/g, '""')}"`,
          e.total, e.done, e.on_time, e.delayed_done || 0,
          e.delayed || e.delayed_not_done || 0, e.pending, e.na,
          e.completion_pct, e.regular_total || 0, e.recurring_total || 0,
        ];
        lines.push(cells.join(','));
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MIS-${data.year}-${String(data.month).padStart(2, '0')}-${data.filters?.task_type || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded ✅', 'success');
  }

  async function loadMisReport() {
    const body = document.getElementById('misReportBody');
    const monthEl = document.getElementById('misMonth');
    const weekEl = document.getElementById('misWeek');
    const deptEl = document.getElementById('misDept');
    const sortEl = document.getElementById('misSort');
    const typeEl = document.getElementById('misTaskType');
    const genBtn = document.getElementById('misGenBtn');
    const csvBtn = document.getElementById('misCsvBtn');
    if (!body || !monthEl) return;

    const now = new Date();
    if (!monthEl.value) {
      monthEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    async function run() {
      body.innerHTML = '<div class="empty-state">Building MIS report…</div>';
      try {
        const [y, m] = monthEl.value.split('-').map(Number);
        const taskType = typeEl?.value || 'all';
        const qs = new URLSearchParams({ year: String(y), month: String(m), task_type: taskType });
        if (weekEl?.value) qs.set('week', weekEl.value);
        if (deptEl?.value) qs.set('department', deptEl.value);
        if (sortEl?.value) qs.set('sort', sortEl.value);

        const data = await api(`/mis-report?${qs}`);
        _misLastData = data;
        const activeType = data.filters?.task_type || taskType;

        // Week options
        if (weekEl) {
          const prev = weekEl.value;
          weekEl.innerHTML = '<option value="">All weeks</option>';
          (data.week_options || data.weeks || []).forEach((w) => {
            const opt = document.createElement('option');
            opt.value = String(w.week);
            opt.textContent = w.label + (w.spans_prev_month ? ' *' : '');
            weekEl.appendChild(opt);
          });
          if ([...weekEl.options].some((o) => o.value === prev)) weekEl.value = prev;
        }

        // Department options
        if (deptEl) {
          const prev = deptEl.value;
          deptEl.innerHTML = '<option value="">All departments</option>';
          (data.departments || []).forEach((d) => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            deptEl.appendChild(opt);
          });
          if ([...deptEl.options].some((o) => o.value === prev)) deptEl.value = prev;
        }

        if (!data.weeks?.length) {
          body.innerHTML = `<div class="empty-state">No weeks / tasks for this selection</div>`;
          return;
        }

        const typeLabel =
          activeType === 'normal'
            ? 'Normal / Delegated only'
            : activeType === 'recurring'
              ? 'Recurring only'
              : 'All tasks';

        const tabs = `
          <div class="mis-week-tabs" id="misWeekTabs">
            <button type="button" class="mis-week-tab active" data-week="">All weeks</button>
            ${(data.week_options || data.weeks).map((w) => `
              <button type="button" class="mis-week-tab ${String(weekEl?.value) === String(w.week) ? 'active' : ''}" data-week="${w.week}">
                W${w.week}${w.spans_prev_month ? '<span class="mis-week-hint">+prev</span>' : ''}
              </button>`).join('')}
          </div>`;

        body.innerHTML =
          `<div class="mis-filter-chip">Showing: <strong>${escapeHtml(typeLabel)}</strong></div>` +
          tabs +
          data.weeks.map((w) => renderMisWeekCard(w, activeType)).join('');

        body.querySelectorAll('#misWeekTabs .mis-week-tab').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (weekEl) weekEl.value = btn.dataset.week || '';
            run();
          });
        });
        // Sync active tab with current week filter
        body.querySelectorAll('#misWeekTabs .mis-week-tab').forEach((btn) => {
          btn.classList.toggle('active', (btn.dataset.week || '') === (weekEl?.value || ''));
        });
      } catch (err) {
        body.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
        showToast(err.message, 'error');
      }
    }

    if (!monthEl._misBound) {
      monthEl._misBound = true;
      genBtn?.addEventListener('click', run);
      csvBtn?.addEventListener('click', () => downloadMisCsv(_misLastData));
      monthEl.addEventListener('change', () => {
        if (weekEl) weekEl.value = '';
        run();
      });
      weekEl?.addEventListener('change', run);
      deptEl?.addEventListener('change', run);
      sortEl?.addEventListener('change', run);
      typeEl?.addEventListener('change', run);
    }
    run();
  }

  function fmtHrs(h) {
    if (h == null || h === '') return '—';
    const n = Number(h);
    if (Number.isNaN(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const d = Math.floor(abs / 24);
    const hrs = Math.round((abs - d * 24) * 10) / 10;
    if (d >= 1) return hrs ? `${sign}${d}d ${hrs}h` : `${sign}${d}d`;
    return `${sign}${abs}h`;
  }

  function tdHeat(h, good, warn) {
    if (h == null || h === '') return '';
    const n = Number(h);
    if (Number.isNaN(n)) return '';
    if (n <= good) return ' td-heat-good';
    if (n <= warn) return ' td-heat-mid';
    return ' td-heat-bad';
  }

  let _tdLastData = null;

  function tdPct(done, total) {
    if (!total) return 0;
    return Math.round((done / total) * 100);
  }

  function renderTimeDashboardSummary(emps) {
    const el = document.getElementById('tdSummary');
    if (!el) return;
    if (!emps.length) {
      el.innerHTML = '';
      return;
    }
    const all = emps.map((e) => e.portfolio || {});
    const sum = (k) => all.reduce((s, p) => s + Number(p[k] || 0), 0);
    const avgOf = (k) => {
      const vals = all.map((p) => p[k]).filter((v) => v != null);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };
    const total = sum('total');
    const done = sum('completed');
    const onTime = sum('onTime');
    const late = sum('late');
    const slowest = [...emps]
      .filter((e) => e.portfolio?.avgCycleHrs != null)
      .sort((a, b) => b.portfolio.avgCycleHrs - a.portfolio.avgCycleHrs)[0];
    el.innerHTML = `
      <div class="td-stat"><span>Tasks in range</span><strong>${total}</strong><small>${emps.length} people</small></div>
      <div class="td-stat"><span>Completed</span><strong>${done}</strong>
        <div class="td-bar"><i style="width:${tdPct(done, total)}%"></i></div>
        <small>${tdPct(done, total)}% closed</small></div>
      <div class="td-stat"><span>Still open</span><strong>${sum('pending') + sum('inProgress')}</strong><small>pending + in progress</small></div>
      <div class="td-stat"><span>On time</span><strong>${onTime}</strong><small>${late} late vs planned hours</small></div>
      <div class="td-stat"><span>Planned hours</span><strong>${fmtHrs(sum('plannedHours'))}</strong><small>+${fmtHrs(sum('extraHours'))} / ${sum('extraDays')}d extra</small></div>
      <div class="td-stat"><span>Avg accept</span><strong>${fmtHrs(avgOf('avgAcceptHrs'))}</strong><small>assign → accept</small></div>
      <div class="td-stat"><span>Avg submit</span><strong>${fmtHrs(avgOf('avgSubmitHrs'))}</strong><small>accept → send for verify</small></div>
      <div class="td-stat"><span>Longest cycle</span><strong>${fmtHrs(slowest?.portfolio?.avgCycleHrs)}</strong><small>${escapeHtml(slowest?.name || '—')}</small></div>`;
  }

  function downloadTimeCsv(data) {
    if (!data?.report?.length) return showToast('Nothing to export yet', 'error');
    const head = ['Employee', 'Project', 'Task', 'Assigned', 'Accepted', 'Accept hrs', 'Submit hrs', 'Verify hrs', 'Cycle hrs', 'Extra hrs', 'Extra days'];
    const lines = [head.join(',')];
    data.report.forEach((emp) => {
      (emp.projects || []).forEach((p) => {
        (p.tasks || []).forEach((t) => {
          lines.push([
            emp.name, p.name, (t.description || '').replace(/\s+/g, ' '),
            t.assigned_at || t.created_at || '', t.accepted_at || '',
            t.time_to_accept_hrs ?? '', t.time_to_submit_hrs ?? '',
            t.time_to_verify_hrs ?? '', t.total_cycle_hrs ?? '',
            t.extra_hours || 0, t.extra_days || 0,
          ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `time-dashboard-${(data.from || '').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function filterTdEmps(allEmps) {
    const personId = document.getElementById('tdPerson')?.value || '';
    const dept = document.getElementById('tdDept')?.value || '';
    const sort = document.getElementById('tdSort')?.value || 'name';
    let emps = allEmps.filter((e) => {
      if (personId && String(e.id) !== String(personId)) return false;
      if (dept && String(e.department || e.portfolio?.department || '') !== dept) return false;
      return true;
    });
    emps = [...emps].sort((a, b) => {
      const pa = a.portfolio || {};
      const pb = b.portfolio || {};
      if (sort === 'cycle') return (pb.avgCycleHrs || 0) - (pa.avgCycleHrs || 0);
      if (sort === 'open') return ((pb.pending || 0) + (pb.inProgress || 0)) - ((pa.pending || 0) + (pa.inProgress || 0));
      if (sort === 'hours') return (pb.plannedHours || 0) - (pa.plannedHours || 0);
      if (sort === 'late') return (pb.late || 0) - (pa.late || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return emps;
  }

  function renderTdPeopleSheet(emps) {
    if (!emps.length) return '';
    const rows = emps.map((e) => {
      const pf = e.portfolio || {};
      const open = (pf.pending || 0) + (pf.inProgress || 0);
      return `<tr>
        <td class="td-sticky">${escapeHtml(e.name)}</td>
        <td>${escapeHtml(e.department || pf.department || '—')}</td>
        <td>${pf.total || 0}</td>
        <td>${pf.completed || 0}</td>
        <td>${open}</td>
        <td>${pf.onTime || 0}</td>
        <td class="${(pf.late || 0) ? 'td-heat-bad' : ''}">${pf.late || 0}</td>
        <td>${fmtHrs(pf.plannedHours)}</td>
        <td>${Number(pf.extraHours || 0) || Number(pf.extraDays || 0) ? `${fmtHrs(pf.extraHours)} / ${pf.extraDays || 0}d` : '—'}</td>
        <td class="${tdHeat(pf.avgAcceptHrs, 4, 24)}">${fmtHrs(pf.avgAcceptHrs)}</td>
        <td class="${tdHeat(pf.avgSubmitHrs, 24, 72)}">${fmtHrs(pf.avgSubmitHrs)}</td>
        <td class="${tdHeat(pf.avgVerifyHrs, 8, 24)}">${fmtHrs(pf.avgVerifyHrs)}</td>
        <td class="${tdHeat(pf.avgCycleHrs, 24, 72)}">${fmtHrs(pf.avgCycleHrs)}</td>
      </tr>`;
    }).join('');
    return `<div class="td-sheet-wrap"><div class="td-sheet-scroll">
      <table class="td-sheet">
        <thead><tr>
          <th class="td-sticky">Employee</th><th>Dept</th><th>Tasks</th><th>Done</th><th>Open</th>
          <th>On time</th><th>Late</th><th>Planned</th><th>Extra</th>
          <th>Avg accept</th><th>Avg submit</th><th>Avg verify</th><th>Avg cycle</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div></div>`;
  }

  async function loadTimeDashboard(opts = {}) {
    const body = document.getElementById('tdBody');
    const rangeEl = document.getElementById('tdRange');
    if (!body) return;
    const range = rangeEl?.value || 'month';
    try {
      let data = opts.fromCache ? _tdLastData : null;
      if (!data) {
        if (!opts.quiet) body.innerHTML = '<div class="empty-state">Loading time data…</div>';
        data = await api(`/tasks/report?range=${encodeURIComponent(range)}`);
      }
      _tdLastData = data;
      const allEmps = data.report || [];
      fillTdFilters(allEmps);
      const emps = filterTdEmps(allEmps);
      const vers = personFilteredVerifiers(data.verifiers || []);
      renderTimeDashboardSummary(emps);
      if (!emps.length && !vers.length) {
        body.innerHTML = '<div class="empty-state">No tasks in this range</div>';
        return;
      }
      const empHtml = `<div class="td-grid">${emps.map((emp) => {
        const pf = emp.portfolio || {};
        const open = (pf.pending || 0) + (pf.inProgress || 0);
        const projBlocks = (emp.projects || []).map((p) => {
          const rows = (p.tasks || []).map((t) => {
            const planned = Number(t.hours_to_complete || 0);
            const cycle = t.total_cycle_hrs;
            const late = cycle != null && planned > 0 && cycle > planned;
            return `
            <tr>
              <td class="td-sticky" title="${escapeHtml(t.description || '')}">${escapeHtml((t.description || '').slice(0, 70))}</td>
              <td>${escapeHtml(t.status || '—')}</td>
              <td>${planned ? fmtHrs(planned) : '—'}</td>
              <td>${escapeHtml(fmtDate(t.assigned_at || t.created_at))}</td>
              <td>${escapeHtml(t.accepted_at ? fmtDate(t.accepted_at) : '—')}</td>
              <td class="${tdHeat(t.time_to_accept_hrs, 4, 24)}">${fmtHrs(t.time_to_accept_hrs)}</td>
              <td class="${tdHeat(t.time_to_submit_hrs, planned || 24, (planned || 24) * 1.5)}">${fmtHrs(t.time_to_submit_hrs)}</td>
              <td class="${tdHeat(t.time_to_start_verify_hrs, 4, 24)}">${fmtHrs(t.time_to_start_verify_hrs)}</td>
              <td class="${tdHeat(t.time_to_verify_hrs, 8, 24)}">${fmtHrs(t.time_to_verify_hrs)}</td>
              <td class="${late ? 'td-heat-bad' : tdHeat(cycle, planned || 24, (planned || 24) * 1.25)}">${fmtHrs(cycle)}</td>
              <td>${Number(t.extra_hours || 0) || Number(t.extra_days || 0)
                ? `${t.extra_hours || 0}h / ${t.extra_days || 0}d`
                : '—'}</td>
            </tr>`;
          }).join('');
          return `<div class="td-project">
            <h4>${escapeHtml(p.name)} <span class="td-muted">${p.summary?.total || 0} tasks · avg cycle ${fmtHrs(p.summary?.avgCycleHrs)}</span></h4>
            <div class="td-sheet-scroll"><table class="td-sheet td-table">
              <thead><tr>
                <th class="td-sticky">Task</th><th>Status</th><th>Planned</th><th>Assigned</th><th>Accepted</th>
                <th>Accept</th><th>Submit</th><th>Start verify</th><th>Verified</th><th>Cycle</th><th>Extra</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>`;
        }).join('');
        return `<article class="td-card">
          <header class="td-card-head">
            <div>
              <h3>${escapeHtml(emp.name)}</h3>
              <span class="td-muted">${escapeHtml(emp.department || pf.department || '')}${emp.department || pf.department ? ' · ' : ''}${pf.total || 0} tasks</span>
            </div>
            <span class="td-pill ${open ? 'td-pill-open' : 'td-pill-done'}">${open ? `${open} open` : 'clear'}</span>
          </header>
          <div class="td-kpis">
            <div class="td-kpi"><span>Planned</span><strong>${fmtHrs(pf.plannedHours)}</strong></div>
            <div class="td-kpi"><span>Extra</span><strong>${fmtHrs(pf.extraHours)} / ${pf.extraDays || 0}d</strong></div>
            <div class="td-kpi"><span>Done</span><strong>${pf.completed || 0}</strong></div>
            <div class="td-kpi"><span>On time / late</span><strong>${pf.onTime || 0} / ${pf.late || 0}</strong></div>
            <div class="td-kpi"><span>Avg accept</span><strong>${fmtHrs(pf.avgAcceptHrs)}</strong></div>
            <div class="td-kpi"><span>Avg submit</span><strong>${fmtHrs(pf.avgSubmitHrs)}</strong></div>
            <div class="td-kpi"><span>Avg verify</span><strong>${fmtHrs(pf.avgVerifyHrs)}</strong></div>
            <div class="td-kpi"><span>Avg cycle</span><strong>${fmtHrs(pf.avgCycleHrs)}</strong></div>
          </div>
          ${projBlocks}
        </article>`;
      }).join('')}</div>`;

      const verHtml = vers.length
        ? `<div class="td-emp"><h3>Verification time by person</h3>
            <div class="td-sheet-scroll"><table class="td-sheet td-table">
              <thead><tr><th class="td-sticky">Verifier</th><th>Tasks</th><th>Avg verify</th><th>By project</th></tr></thead>
              <tbody>${vers.map((v) => `<tr>
                <td class="td-sticky">${escapeHtml(v.name)}</td>
                <td>${v.total}</td>
                <td class="${tdHeat(v.avgVerifyHrs, 8, 24)}">${fmtHrs(v.avgVerifyHrs)}</td>
                <td>${(v.projects || []).map((p) => `${escapeHtml(p.name)} (${p.count}, avg ${fmtHrs(p.avgVerifyHrs)})`).join('<br>')}</td>
              </tr>`).join('')}</tbody>
            </table></div></div>`
        : '';

      body.innerHTML = `<div class="td-range-note">${escapeHtml(data.from?.slice(0,10) || '')} – ${escapeHtml(data.to?.slice(0,10) || '')} · ${emps.length} people</div>
        <div class="td-section-title">Team overview</div>
        ${renderTdPeopleSheet(emps)}
        <div class="td-section-title">By person</div>
        ${empHtml}${verHtml}`;
    } catch (err) {
      body.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function personFilteredVerifiers(vers) {
    const personId = document.getElementById('tdPerson')?.value || '';
    if (!personId) return vers;
    return vers.filter((v) => String(v.id) === String(personId));
  }

  function fillTdFilters(emps) {
    const personSel = document.getElementById('tdPerson');
    const deptSel = document.getElementById('tdDept');
    const personId = personSel?.value || '';
    const dept = deptSel?.value || '';
    if (personSel) {
      personSel.innerHTML = ['<option value="">All employees</option>']
        .concat(emps.map((e) => `<option value="${escapeHtml(String(e.id))}">${escapeHtml(e.name)}</option>`)).join('');
      personSel.value = personId;
    }
    if (deptSel && !deptSel.dataset.filled) {
      const depts = [...new Set(emps.map((e) => e.department || e.portfolio?.department).filter(Boolean))].sort();
      deptSel.innerHTML = ['<option value="">All departments</option>']
        .concat(depts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)).join('');
      deptSel.dataset.filled = '1';
      deptSel.value = dept;
    }
  }

  document.getElementById('tdGenBtn')?.addEventListener('click', () => loadTimeDashboard());
  document.getElementById('tdRange')?.addEventListener('change', () => {
    const deptSel = document.getElementById('tdDept');
    if (deptSel) delete deptSel.dataset.filled;
    loadTimeDashboard();
  });
  document.getElementById('tdPerson')?.addEventListener('change', () => loadTimeDashboard({ fromCache: true, quiet: true }));
  document.getElementById('tdDept')?.addEventListener('change', () => loadTimeDashboard({ fromCache: true, quiet: true }));
  document.getElementById('tdSort')?.addEventListener('change', () => loadTimeDashboard({ fromCache: true, quiet: true }));
  document.getElementById('tdCsvBtn')?.addEventListener('click', () => downloadTimeCsv(_tdLastData));

  // ─── FMS step tracker (Planned vs Actual per workflow step) ─────────────────
  let _fmsLastData = null;

  function fmsCell(step) {
    if (!step || step.status === 'NA') {
      return `<td class="fms-na">—</td><td class="fms-na">—</td><td><span class="fms-pill fms-pill-NA">n/a</span></td><td class="fms-na">—</td>`;
    }
    const delay = step.delayHrs;
    let delayText = '—';
    if (delay != null) {
      const abs = Math.abs(delay);
      const label = abs >= 24 ? `${Math.round((abs / 24) * 10) / 10}d` : `${abs}h`;
      delayText = delay > 0
        ? `<span class="fms-delay-late">+${label}</span>`
        : `<span class="fms-delay-early">${abs ? `-${label}` : 'on time'}</span>`;
    }
    return `<td>${escapeHtml(fmtSheetDateTime(step.planned))}</td>
      <td>${escapeHtml(step.actual ? fmtSheetDateTime(step.actual) : '—')}</td>
      <td><span class="fms-pill fms-pill-${escapeHtml(step.status)}">${escapeHtml(step.status)}</span>${
        step.actor ? `<div class="fms-actor">${escapeHtml(step.actor)}</div>` : ''
      }</td>
      <td>${delayText}</td>`;
  }

  function renderFmsSummary(data) {
    const el = document.getElementById('fmsSummary');
    if (!el) return;
    const steps = data.steps || [];
    const sum = data.summary || {};
    el.innerHTML = steps.map((s) => {
      const v = sum[s.key] || {};
      return `<div class="fms-step-card">
        <h4>${escapeHtml(s.label)}</h4>
        <div class="fms-step-nums">
          <span>On time <b>${v.done || 0}</b></span>
          <span>Delayed <b>${v.delayed || 0}</b></span>
          <span>Overdue <b>${v.overdue || 0}</b></span>
          <span>Waiting <b>${v.pending || 0}</b></span>
        </div>
      </div>`;
    }).join('');
  }

  function fillFmsFilters(rows) {
    const projSel = document.getElementById('fmsProject');
    const perSel = document.getElementById('fmsPerson');
    const uniq = (list) => [...new Map(list.filter((x) => x.id).map((x) => [String(x.id), x])).values()];
    if (projSel && !projSel.dataset.filled) {
      const projects = uniq(rows.map((r) => ({ id: r.project_id, name: r.project })));
      projSel.innerHTML = ['<option value="">All projects</option>']
        .concat(projects.map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name)}</option>`)).join('');
      projSel.dataset.filled = '1';
    }
    if (perSel && !perSel.dataset.filled) {
      const people = uniq(rows.map((r) => ({ id: r.person_id, name: r.person })));
      perSel.innerHTML = ['<option value="">All people</option>']
        .concat(people.map((p) => `<option value="${escapeHtml(String(p.id))}">${escapeHtml(p.name)}</option>`)).join('');
      perSel.dataset.filled = '1';
    }
  }

  async function loadFms() {
    const body = document.getElementById('fmsBody');
    if (!body) return;
    const range = document.getElementById('fmsRange')?.value || 'month';
    const project = document.getElementById('fmsProject')?.value || '';
    const person = document.getElementById('fmsPerson')?.value || '';
    body.innerHTML = '<div class="empty-state">Building FMS sheet…</div>';
    try {
      const qs = new URLSearchParams({ range });
      if (project) qs.set('project', project);
      if (person) qs.set('person', person);
      const data = await api(`/tasks/fms?${qs.toString()}`);
      _fmsLastData = data;
      const rows = data.rows || [];
      const steps = data.steps || [];
      fillFmsFilters(rows);
      renderFmsSummary(data);
      if (!rows.length) {
        body.innerHTML = '<div class="empty-state">No tasks in this range</div>';
        return;
      }
      const metaRow = (key, cls) =>
        `<th class="fms-meta-label fms-sticky">${key}</th>` +
        '<th></th><th></th><th></th><th></th><th></th>' +
        steps.map((s, i) =>
          `<th class="fms-meta-cell${i % 2 ? ' fms-meta-cell--alt' : ''} ${cls}" colspan="4">${escapeHtml(s[key.toLowerCase()] || s.label)}</th>`
        ).join('');
      const stepHead = steps.map((s, i) =>
        `<th class="fms-step-head${i % 2 ? ' fms-step-head--alt' : ''}" colspan="4">${escapeHtml(s.label)}</th>`).join('');
      const subHead = steps.map(() => '<th class="fms-sub-head">Planned</th><th class="fms-sub-head">Actual</th><th class="fms-sub-head">Status</th><th class="fms-sub-head">Time Delay</th>').join('');
      const tbody = rows.map((r) => `<tr>
        <td class="fms-sticky" title="${escapeHtml(r.description || '')}">${escapeHtml(fmtSheetDateTime(r.timestamp))}</td>
        <td>${escapeHtml(r.job_no)}</td>
        <td>${escapeHtml(r.project)}</td>
        <td title="${escapeHtml(r.description || '')}">${escapeHtml(r.work_type)}</td>
        <td>${escapeHtml(r.person)}</td>
        <td>${r.lead_time_hrs || 0}${r.extra_hours ? ` +${r.extra_hours}h` : ''}${r.extra_days ? ` +${r.extra_days}d` : ''}</td>
        ${steps.map((s) => fmsCell(r.steps?.[s.key])).join('')}
      </tr>`).join('');

      body.innerHTML = `<div class="fms-wrap"><div class="fms-scroll">
        <table class="fms-table">
          <thead>
            <tr class="fms-meta-row">${metaRow('What', '')}</tr>
            <tr class="fms-meta-row">${metaRow('Who', '')}</tr>
            <tr class="fms-meta-row">${metaRow('How', '')}</tr>
            <tr class="fms-meta-row">${metaRow('Why', '')}</tr>
            <tr>
              <th class="fms-sticky fms-id-head" rowspan="2">Timestamp</th>
              <th class="fms-id-head" rowspan="2">JOB NO.</th>
              <th class="fms-id-head" rowspan="2">PROJECT NAME</th>
              <th class="fms-id-head" rowspan="2">WORK TYPE</th>
              <th class="fms-id-head" rowspan="2">PERSON</th>
              <th class="fms-id-head" rowspan="2">LEAD TIME</th>
              ${stepHead}
            </tr>
            <tr class="fms-sub-row">${subHead}</tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
      </div></div>
      <p class="td-muted" style="margin-top:10px">${escapeHtml((data.from || '').slice(0, 10))} → ${escapeHtml((data.to || '').slice(0, 10))} · ${rows.length} tasks</p>`;
    } catch (err) {
      body.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function downloadFmsCsv(data) {
    if (!data?.rows?.length) return showToast('Nothing to export yet', 'error');
    const steps = data.steps || [];
    const head = ['Timestamp', 'JOB NO.', 'PROJECT NAME', 'WORK TYPE', 'PERSON', 'LEAD TIME'];
    steps.forEach((s) => head.push(`${s.label} Planned`, `${s.label} Actual`, `${s.label} Status`, `${s.label} Time Delay`));
    const lines = [head.join(',')];
    data.rows.forEach((r) => {
      const cells = [
        r.timestamp || '', r.job_no, r.project, r.work_type,
        r.person, r.lead_time_hrs || 0,
      ];
      steps.forEach((s) => {
        const st = r.steps?.[s.key] || {};
        cells.push(st.planned || '', st.actual || '', st.actor ? `${st.status || ''} (${st.actor})` : (st.status || ''), st.delayHrs ?? '');
      });
      lines.push(cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fms-tracker-${(data.from || '').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('fmsGenBtn')?.addEventListener('click', () => loadFms());
  document.getElementById('fmsRange')?.addEventListener('change', () => loadFms());
  document.getElementById('fmsProject')?.addEventListener('change', () => loadFms());
  document.getElementById('fmsPerson')?.addEventListener('change', () => loadFms());
  document.getElementById('fmsCsvBtn')?.addEventListener('click', () => downloadFmsCsv(_fmsLastData));

  // ─── DIP AI Bot ─────────────────────────────────────────────────────────────
  // Bot answers arrive as plain text with SECTION HEADINGS, "• bullet" lines and
  // "  Label: value" detail lines. Turn that into readable blocks instead of a
  // wall of <br>s.
  function stripBotMd(s) {
    return String(s || '')
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }
  function isBotHeading(trimmed) {
    if (/^[•*\u2022-]/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) return false;
    if (/^#{1,3}\s+/.test(trimmed)) return true;
    if (/^\*\*.+\*\*$/.test(trimmed)) return true;
    // OVERDUE — Charmy Desai (5)  /  TASK COUNTS  /  DELEGATED OVERDUE (12)
    if (
      /^[A-Z][A-Z0-9 /&()]{1,48}( — | —|- |:|\s*\(|$)/.test(trimmed) &&
      trimmed.length < 90
    ) {
      return true;
    }
    return false;
  }
  function renderBotAnswer(text) {
    const raw = stripBotMd(String(text || '').replace(/\r/g, ''));
    const out = [];
    let list = [];
    const flushList = () => {
      if (list.length) {
        out.push(`<ul class="bot-list">${list.join('')}</ul>`);
        list = [];
      }
    };
    const attachKv = (label, value) => {
      if (list.length) {
        list[list.length - 1] = list[list.length - 1].replace(
          /<\/li>$/,
          `<span class="bot-kv"><em>${escapeHtml(label)}</em> ${escapeHtml(value)}</span></li>`
        );
        return true;
      }
      return false;
    };
    raw.split('\n').forEach((lineRaw) => {
      const line = lineRaw.replace(/\s+$/, '');
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        return;
      }
      const headingText = trimmed.replace(/^#{1,3}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1');
      if (isBotHeading(trimmed)) {
        flushList();
        out.push(`<div class="bot-heading">${escapeHtml(headingText)}</div>`);
        return;
      }
      if (/^[•*\u2022-]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
        const body = trimmed.replace(/^[•*\u2022-]\s+/, '').replace(/^\d+[.)]\s+/, '');
        const parts = body.split('|').map((p) => p.trim()).filter(Boolean);
        const inner = parts.length > 1
          ? `<strong>${escapeHtml(parts[0])}</strong>` +
            parts.slice(1).map((p) => `<span class="bot-chip">${escapeHtml(p)}</span>`).join('')
          : escapeHtml(body);
        list.push(`<li>${inner}</li>`);
        return;
      }
      const kv = /^([A-Za-z][A-Za-z0-9 \/]{1,28}):\s*(.+)$/.exec(trimmed);
      if (kv) {
        if (!attachKv(kv[1], kv[2])) {
          flushList();
          out.push(`<p class="bot-line bot-kv-line"><em>${escapeHtml(kv[1])}</em> ${escapeHtml(kv[2])}</p>`);
        }
        return;
      }
      if (/^\([^)]+\)$/.test(trimmed) || /^none\.?$/i.test(trimmed)) {
        if (list.length) {
          list.push(`<li class="bot-empty">${escapeHtml(trimmed)}</li>`);
        } else {
          out.push(`<p class="bot-line bot-empty">${escapeHtml(trimmed)}</p>`);
        }
        return;
      }
      flushList();
      out.push(`<p class="bot-line">${escapeHtml(trimmed)}</p>`);
    });
    flushList();
    return out.join('') || `<p class="bot-line">${escapeHtml(raw)}</p>`;
  }

  function appendBotBubble(who, text, downloads) {
    const log = document.getElementById('botChatLog');
    if (!log) return;
    const div = document.createElement('div');
    div.className = `bot-bubble ${who === 'you' ? 'bot-bubble-you' : 'bot-bubble-bot'}`;
    const body = who === 'you'
      ? `<div class="bot-bubble-body">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`
      : `<div class="bot-bubble-body bot-rich">${renderBotAnswer(text)}</div>`;
    div.innerHTML = `<div class="bot-bubble-who">${who === 'you' ? 'You' : 'DIP Bot'}</div>${body}`;
    if (who !== 'you' && Array.isArray(downloads) && downloads.length) {
      const bar = document.createElement('div');
      bar.className = 'bot-downloads';
      downloads.forEach((d) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'primary-btn primary-btn-inline';
        btn.textContent = `Download ${d.label || d.filename || 'report'}`;
        btn.addEventListener('click', () => {
          const blob = new Blob([d.html || ''], { type: 'text/html;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = d.filename || 'report.html';
          a.click();
          URL.revokeObjectURL(a.href);
        });
        bar.appendChild(btn);
      });
      div.appendChild(bar);
    }
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  async function loadAiBot() {
    const log = document.getElementById('botChatLog');
    if (log && !log.dataset.ready) {
      log.dataset.ready = '1';
      try {
        const hist = await api('/bot/qa').catch(() => []);
        if (Array.isArray(hist) && hist.length) {
          hist.forEach((row) => {
            if (row.question) appendBotBubble('you', row.question);
            if (row.answer) appendBotBubble('bot', row.answer);
          });
        } else {
          appendBotBubble('bot', 'DIP Bot. Ask one thing — overdue, a name, leave, attendance, or tickets.');
        }
      } catch (_) {
        appendBotBubble('bot', 'DIP Bot. Ask one thing — overdue, a name, leave, or tickets.');
      }
    }
  }

  if (!window._botAskBound) {
    window._botAskBound = true;
    document.getElementById('botAskForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('botAskInput');
      const q = (input?.value || '').trim();
      if (!q) return;
      appendBotBubble('you', q);
      if (input) input.value = '';
      try {
        const res = await api('/bot/ask', { method: 'POST', body: { question: q } });
        appendBotBubble('bot', res.answer || 'No answer', res.downloads);
      } catch (err) {
        appendBotBubble('bot', err.message || 'Error');
      }
    });
  }

  // ─── Team chat (WhatsApp-style store + unread + video) ─────────────────────
  let _activeChatRoom = null;
  let _activeChatTitle = '';
  let _chatPollTimer = null;

  function formatChatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function previewText(msg) {
    if (!msg) return 'No messages yet';
    if (msg.msg_type === 'meeting' || msg.meeting_url) return '📹 Video meeting';
    return String(msg.body || '').replace(/\s+/g, ' ').slice(0, 48);
  }

  function renderChatMessage(m) {
    const mine = String(m.sender_id) === String(state.user.id);
    const div = document.createElement('div');
    div.className = `bot-bubble ${mine ? 'bot-bubble-you' : 'bot-bubble-bot'}`;
    const who = m.is_bot ? 'Bot' : m.sender?.full_name || (mine ? 'You' : 'User');
    const meetUrl = m.meeting_url || (String(m.body || '').match(/https:\/\/meet\.jit\.si\/[^\s]+/) || [])[0];
    let bodyHtml;
    if (m.msg_type === 'meeting' || meetUrl) {
      bodyHtml = `<div class="chat-meeting-card">
        <div>${escapeHtml((m.body || 'Video meeting').split('\n')[0])}</div>
        <button type="button" class="primary-btn primary-btn-inline js-join-meet" data-meet-url="${escapeHtml(meetUrl || '')}">Join video</button>
      </div>`;
    } else {
      bodyHtml = `<div class="bot-bubble-body">${escapeHtml(m.body).replace(/\n/g, '<br>')}</div>`;
    }
    div.innerHTML = `<div class="bot-bubble-who">${escapeHtml(who)}</div>${bodyHtml}<div class="chat-msg-meta">${escapeHtml(formatChatTime(m.created_at))}</div>`;
    return div;
  }

  let _jitsiWin = null;
  let _meetUrl = null;
  let _meetRecog = null;
  let _meetMomId = null;
  let _meetKeepListening = false;
  let _meetFlushTimer = null;
  let _meetPending = '';
  let _meetRecorder = null;
  let _meetStream = null;

  async function resolveMomIdForUrl(meetUrl) {
    if (!meetUrl) return null;
    try {
      const rows = await api('/bot/meetings');
      const hit = (rows || []).find((m) => String(m.meeting_url || '') === String(meetUrl));
      return hit?.id || null;
    } catch (_) {
      return null;
    }
  }

  function setMeetCaptionStatus(text) {
    const el = document.getElementById('meetCaptionStatus');
    if (el) el.textContent = text;
  }

  function appendLiveCaptionLine(line) {
    const pre = document.getElementById('meetLiveCaption');
    if (!pre) return;
    pre.textContent = `${pre.textContent}${pre.textContent ? '\n' : ''}${line}`.split('\n').slice(-12).join('\n');
    pre.scrollTop = pre.scrollHeight;
  }

  async function flushMeetCaptions() {
    const chunk = _meetPending.trim();
    _meetPending = '';
    if (!chunk || !_meetMomId) return;
    try {
      await api(`/bot/meetings/${_meetMomId}/transcript`, { method: 'POST', body: { chunk } });
    } catch (err) {
      console.warn('MoM caption:', err.message);
    }
  }

  function stopCallAudioBackup() {
    try { _meetRecorder?.stop(); } catch (_) {}
    _meetRecorder = null;
    try { _meetStream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    _meetStream = null;
  }

  async function startCallAudioBackup(momId) {
    stopCallAudioBackup();
    if (!momId || !navigator.mediaDevices?.getUserMedia) return;
    try {
      _meetStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) {
      setMeetCaptionStatus('Allow microphone so spoken words can be written to MoM');
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    let rec;
    try {
      rec = new MediaRecorder(_meetStream, { mimeType: mime });
    } catch (_) {
      rec = new MediaRecorder(_meetStream);
    }
    rec.ondataavailable = async (ev) => {
      if (!ev.data || ev.data.size < 2500 || !_meetMomId) return;
      const fd = new FormData();
      fd.append('audio', ev.data, 'chunk.webm');
      try {
        const res = await api(`/bot/meetings/${_meetMomId}/transcribe-audio`, { method: 'POST', body: fd, isForm: true });
        if (res?.text) appendLiveCaptionLine(`${state.user?.full_name || 'You'}: ${res.text}`);
      } catch (_) {}
    };
    rec.start(12000);
    _meetRecorder = rec;
  }

  function stopCallCaptions() {
    _meetKeepListening = false;
    if (_meetFlushTimer) {
      clearInterval(_meetFlushTimer);
      _meetFlushTimer = null;
    }
    try { _meetRecog?.stop(); } catch (_) {}
    _meetRecog = null;
    flushMeetCaptions();
    stopCallAudioBackup();
  }

  async function startCallCaptions(momId) {
    stopCallCaptions();
    _meetMomId = momId;
    if (!momId) {
      setMeetCaptionStatus('MoM not linked — spoken words will not be saved');
      return;
    }
    await startCallAudioBackup(momId);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMeetCaptionStatus('Keep this tab open — microphone audio is being saved to MoM');
      return;
    }
    _meetKeepListening = true;
    _meetPending = '';
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-IN';
    rec.onresult = (ev) => {
      let finals = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const t = ev.results[i][0]?.transcript || '';
        if (ev.results[i].isFinal) finals += ` ${t}`;
      }
      const piece = finals.replace(/\s+/g, ' ').trim();
      if (piece) {
        _meetPending = `${_meetPending} ${piece}`.trim();
        appendLiveCaptionLine(`${state.user?.full_name || 'You'}: ${piece}`);
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (_meetKeepListening) {
        try { rec.start(); } catch (_) {}
      }
    };
    _meetRecog = rec;
    try {
      rec.start();
      setMeetCaptionStatus('Listening here — keep this tab open. Speech goes into MoM.');
    } catch (_) {
      setMeetCaptionStatus('Allow microphone so spoken words can be written to MoM');
    }
    _meetFlushTimer = setInterval(flushMeetCaptions, 4000);
  }

  async function closeInAppMeeting(goToMom) {
    const momId = _meetMomId;
    stopCallCaptions();
    _meetUrl = null;
    const overlay = document.getElementById('meetOverlay');
    if (overlay) overlay.hidden = true;
    if (goToMom && momId) {
      switchView('meetings');
      try {
        const rows = await api('/bot/meetings');
        const m = (rows || []).find((r) => String(r.id) === String(momId));
        if (m) openMomEditor(m);
      } catch (_) {}
    }
  }

  function launchJitsiWindow(meetUrl) {
    if (!meetUrl) return;
    try {
      _jitsiWin = window.open(meetUrl, 'dip-jitsi-call', 'noopener,noreferrer');
    } catch (_) {
      _jitsiWin = null;
    }
    if (!_jitsiWin) window.open(meetUrl, '_blank', 'noopener,noreferrer');
  }

  async function openInAppMeeting(meetUrl, momId) {
    const overlay = document.getElementById('meetOverlay');
    if (!overlay) {
      window.open(meetUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    _meetUrl = meetUrl;
    overlay.hidden = false;
    const cap = document.getElementById('meetLiveCaption');
    if (cap) cap.textContent = '';
    setMeetCaptionStatus('Opening Jitsi in a new window… keep this tab open for MoM');
    const linkedMom = momId || (await resolveMomIdForUrl(meetUrl));
    await startCallCaptions(linkedMom);
    launchJitsiWindow(meetUrl);
  }

  if (!window._meetOverlayBound) {
    window._meetOverlayBound = true;
    document.getElementById('meetEndMomBtn')?.addEventListener('click', () => closeInAppMeeting(true));
    document.getElementById('meetCloseBtn')?.addEventListener('click', () => closeInAppMeeting(false));
    document.getElementById('meetOpenCallBtn')?.addEventListener('click', () => {
      if (_meetUrl) launchJitsiWindow(_meetUrl);
    });
    document.getElementById('meetNoticeClose')?.addEventListener('click', () => {
      const n = document.getElementById('meetJitsiNotice');
      if (n) n.hidden = true;
    });
    document.getElementById('chatMsgLog')?.addEventListener('click', async (e) => {
      const btn = e.target.closest?.('.js-join-meet');
      if (!btn) return;
      const url = btn.dataset.meetUrl;
      if (!url) return;
      await openInAppMeeting(url, null);
    });
  }

  function stopChatPoll() {
    if (_chatPollTimer) {
      clearInterval(_chatPollTimer);
      _chatPollTimer = null;
    }
  }

  function startChatPoll() {
    stopChatPoll();
    _chatPollTimer = setInterval(async () => {
      if (state.activeView !== 'team-chat' || !_activeChatRoom) return;
      try {
        const msgs = await api(`/bot/chats/${_activeChatRoom}/messages`);
        const log = document.getElementById('chatMsgLog');
        if (!log) return;
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
        log.innerHTML = '';
        (msgs || []).forEach((m) => log.appendChild(renderChatMessage(m)));
        if (atBottom) log.scrollTop = log.scrollHeight;
        await loadTeamChatRoomsOnly();
        const chatUnread = await api('/bot/chats/unread-total').catch(() => ({ total: 0 }));
        setNavBadge('team-chat', chatUnread?.total || 0);
      } catch (_) {}
    }, 8000);
  }

  async function loadTeamChatRoomsOnly() {
    const list = document.getElementById('chatRoomList');
    if (!list) return;
    try {
      const rooms = await api('/bot/chats');
      list.innerHTML = '';
      if (!(rooms || []).length) {
        list.innerHTML = '<div class="empty-state" style="padding:8px;font-size:0.82rem">No chats yet — pick a colleague and Start chat.</div>';
        return;
      }
      (rooms || []).forEach((r) => {
        const unread = Number(r.unread_count || 0);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.roomId = r.id;
        btn.className =
          'chat-room-btn' +
          (_activeChatRoom === r.id ? ' active' : '') +
          (unread > 0 && _activeChatRoom !== r.id ? ' has-unread' : '');
        btn.innerHTML = `
          <span class="chat-room-btn-title">${escapeHtml(r.title || r.kind)} <span class="chat-kind-tag">${r.kind === 'project' ? 'Group' : (r.kind === 'team' || /team group/i.test(r.title || '') ? 'Team' : 'DM')}</span></span>
          ${unread > 0 && _activeChatRoom !== r.id ? `<span class="chat-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
          <span class="chat-room-btn-preview">${escapeHtml(previewText(r.last_message))}</span>
        `;
        btn.addEventListener('click', () => openChatRoom(r));
        list.appendChild(btn);
      });
    } catch (_) {}
  }

  async function loadTeamChat() {
    const list = document.getElementById('chatRoomList');
    startChatPoll();
    try {
      let rooms = [];
      let directory = [];
      try {
        rooms = await api('/bot/chats');
      } catch (err) {
        const msg = err?.message || String(err);
        if (list) {
          list.innerHTML = `<div class="empty-state" style="padding:12px;font-size:0.85rem">No chats yet — pick a colleague and Start chat.</div>`;
        }
        if (msg && !/run backend\/sql/i.test(msg)) showToast(msg, 'error');
        return;
      }
      try {
        directory = await api('/bot/directory');
      } catch (_) {
        directory = [];
      }
      const peer = document.getElementById('chatPeerSelect');
      if (peer) {
        peer.innerHTML = '<option value="">Select colleague…</option>';
        (directory || []).forEach((u) => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.full_name}${u.department ? ` · ${u.department}` : ''}`;
          peer.appendChild(opt);
        });
      }
      if (list) {
        list.innerHTML = '';
        if (!(rooms || []).length) {
          list.innerHTML = '<div class="empty-state" style="padding:8px;font-size:0.82rem">No chats yet — pick a colleague and Start chat.</div>';
        }
        (rooms || []).forEach((r) => {
          const unread = Number(r.unread_count || 0);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.roomId = r.id;
          btn.className =
            'chat-room-btn' +
            (_activeChatRoom === r.id ? ' active' : '') +
            (unread > 0 && _activeChatRoom !== r.id ? ' has-unread' : '');
          btn.innerHTML = `
            <span class="chat-room-btn-title">${escapeHtml(r.title || r.kind)} <span class="chat-kind-tag">${r.kind === 'project' ? 'Group' : (r.kind === 'team' || /team group/i.test(r.title || '') ? 'Team' : 'DM')}</span></span>
            ${unread > 0 && _activeChatRoom !== r.id ? `<span class="chat-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
            <span class="chat-room-btn-preview">${escapeHtml(previewText(r.last_message))}</span>
          `;
          btn.addEventListener('click', () => openChatRoom(r));
          list.appendChild(btn);
        });
      }
      const params = new URLSearchParams(window.location.search);
      const join = params.get('joinChat');
      if (join) {
        try {
          const room = await api('/bot/chats/join', { method: 'POST', body: { invite_code: join } });
          showToast('Joined discussion', 'success');
          await openChatRoom(room);
          params.delete('joinChat');
          const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
          window.history.replaceState({}, '', url);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function openChatRoom(room) {
    _activeChatRoom = room.id;
    _activeChatTitle = room.title || 'Chat';
    const title = document.getElementById('chatRoomTitle');
    if (title) title.textContent = _activeChatTitle;
    const input = document.getElementById('chatMsgInput');
    const sendBtn = document.getElementById('chatSendBtn');
    const videoBtn = document.getElementById('chatVideoBtn');
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (videoBtn) videoBtn.disabled = false;

    // Invite code for project groups (and any room that has one)
    const inviteRow = document.getElementById('chatInviteRow');
    const inviteShow = document.getElementById('chatInviteCodeShow');
    try {
      let full = room;
      if (!room.invite_code && room.kind === 'project') {
        full = await api(`/bot/chats/${room.id}/invite`, { method: 'POST', body: {} });
      } else if (room.kind === 'project' && !room.invite_code) {
        full = await api(`/bot/chats/${room.id}/invite`, { method: 'POST', body: { regenerate: true } });
      }
      if (inviteRow && inviteShow) {
        if (full.kind === 'project' || full.invite_code) {
          if (!full.invite_code) {
            full = await api(`/bot/chats/${room.id}/invite`, { method: 'POST', body: { regenerate: true } });
          }
          inviteRow.hidden = false;
          inviteShow.textContent = full.invite_code || '—';
          _activeChatInvite = full.invite_code || '';
        } else {
          inviteRow.hidden = true;
          _activeChatInvite = '';
        }
      }
    } catch (_) {
      if (inviteRow) inviteRow.hidden = true;
    }

    const msgs = await api(`/bot/chats/${room.id}/messages`);
    const log = document.getElementById('chatMsgLog');
    if (!log) return;
    log.innerHTML = '';
    (msgs || []).forEach((m) => log.appendChild(renderChatMessage(m)));
    log.scrollTop = log.scrollHeight;
    document.querySelectorAll('.chat-room-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.roomId === room.id);
      if (b.dataset.roomId === room.id) b.classList.remove('has-unread');
    });
    await api(`/bot/chats/${room.id}/read`, { method: 'POST' }).catch(() => {});
    const chatUnread = await api('/bot/chats/unread-total').catch(() => ({ total: 0 }));
    setNavBadge('team-chat', chatUnread?.total || 0);
    await loadTeamChatRoomsOnly();
  }

  let _activeChatInvite = '';
  let _calMonth = new Date();
  let _editingMomId = null;

  function fireSystemNotify(title, body) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    } catch (_) {}
    showToast(`${title}: ${body}`, 'success');
  }

  if (!window._teamChatBound) {
    window._teamChatBound = true;
    document.getElementById('chatStartDmBtn')?.addEventListener('click', async () => {
      const peerId = document.getElementById('chatPeerSelect')?.value;
      if (!peerId) return showToast('Select a colleague', 'error');
      try {
        const room = await api('/bot/chats/dm', { method: 'POST', body: { user_id: peerId } });
        fireSystemNotify('Chat started', 'Peer gets WhatsApp + can open Team chat. Further msgs = unread badge only.');
        await loadTeamChat();
        await openChatRoom(room);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('chatJoinBtn')?.addEventListener('click', async () => {
      const code = document.getElementById('chatJoinCode')?.value?.trim();
      if (!code) return;
      try {
        const room = await api('/bot/chats/join', { method: 'POST', body: { invite_code: code } });
        showToast('Joined', 'success');
        await loadTeamChat();
        await openChatRoom(room);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('chatSendForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!_activeChatRoom) return;
      const input = document.getElementById('chatMsgInput');
      const body = (input?.value || '').trim();
      if (!body) return;
      try {
        await api(`/bot/chats/${_activeChatRoom}/messages`, { method: 'POST', body: { body } });
        if (input) input.value = '';
        await openChatRoom({ id: _activeChatRoom, title: _activeChatTitle || document.getElementById('chatRoomTitle')?.textContent, kind: 'dm' });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('chatVideoBtn')?.addEventListener('click', async () => {
      if (!_activeChatRoom) return showToast('Open a chat first', 'error');
      try {
        const res = await api(`/bot/chats/${_activeChatRoom}/meeting`, { method: 'POST', body: {} });
        const url = res.meeting_url;
        fireSystemNotify('Meeting started', 'Jitsi opens in a new window. Keep this TaskFlow tab open so spoken words go into MoM. WhatsApp sent to members.');
        await openChatRoom({ id: _activeChatRoom, title: _activeChatTitle, kind: 'project' });
        if (url) await openInAppMeeting(url, res.mom?.id || null);
      } catch (err) {
        showToast(err.message || 'Could not start meeting', 'error');
      }
    });
    document.getElementById('chatCopyInviteBtn')?.addEventListener('click', async () => {
      const code = document.getElementById('chatInviteCodeShow')?.textContent || _activeChatInvite;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        showToast('Invite code copied', 'success');
      } catch (_) {
        showToast(code, 'success');
      }
    });
    document.getElementById('chatNewInviteBtn')?.addEventListener('click', async () => {
      if (!_activeChatRoom) return;
      try {
        const room = await api(`/bot/chats/${_activeChatRoom}/invite`, {
          method: 'POST',
          body: { regenerate: true },
        });
        const show = document.getElementById('chatInviteCodeShow');
        if (show) show.textContent = room.invite_code;
        _activeChatInvite = room.invite_code;
        showToast('New invite code generated', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // ─── Meetings / MoM ─────────────────────────────────────────────────────────
  async function loadMeetings() {
    const list = document.getElementById('momList');
    const editor = document.getElementById('momEditor');
    if (editor) editor.hidden = true;
    if (!list) return;
    try {
      const rows = await api('/bot/meetings');
      if (!rows.length) {
        list.innerHTML = '<div class="empty-state">No meetings yet. Start a video call from Team chat — MoM draft is created automatically.</div>';
        return;
      }
      const isAdmin = state.user.role === 'admin';
      if (isAdmin) {
        const byProj = {};
        rows.forEach((m) => {
          const key = m.project?.name || 'Other / DM meetings';
          if (!byProj[key]) byProj[key] = [];
          byProj[key].push(m);
        });
        list.innerHTML = Object.keys(byProj)
          .sort()
          .map((proj) => {
            const items = byProj[proj]
              .map(
                (m) => `<button type="button" class="mom-card" data-mom-id="${m.id}">
                <strong>${escapeHtml(m.title)}</strong>
                <span class="mom-meta">${escapeHtml(m.starter?.full_name || '—')} · ${escapeHtml(formatChatTime(m.started_at))} · ${m.status}</span>
                <pre class="mom-preview">${escapeHtml((m.mom_body || '').slice(0, 180))}</pre>
              </button>`
              )
              .join('');
            return `<div class="mom-project-block"><h3 class="mom-project-title">${escapeHtml(proj)}</h3>${items}</div>`;
          })
          .join('');
      } else {
        list.innerHTML = rows
          .map(
            (m) => `<button type="button" class="mom-card" data-mom-id="${m.id}">
            <strong>${escapeHtml(m.title)}</strong>
            <span class="mom-meta">${escapeHtml(m.project?.name || 'Chat')} · ${escapeHtml(formatChatTime(m.started_at))} · ${m.status}</span>
            <pre class="mom-preview">${escapeHtml((m.mom_body || '').slice(0, 180))}</pre>
          </button>`
          )
          .join('');
      }
      list.querySelectorAll('[data-mom-id]').forEach((btn) => {
        btn.addEventListener('click', () => openMomEditor(rows.find((r) => r.id === btn.dataset.momId)));
      });
    } catch (err) {
      list.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}<br/>Run <code>add_meeting_moms.sql</code> in Supabase.</div>`;
    }
  }

  async function openMomEditor(m) {
    if (!m) return;
    _editingMomId = m.id;
    const editor = document.getElementById('momEditor');
    if (editor) editor.hidden = false;
    const t = document.getElementById('momTitle');
    const b = document.getElementById('momBody');
    if (t) t.value = m.title || '';
    if (b) b.value = m.mom_body || '';
    editor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (m.status !== 'final') {
      try {
        const row = await api(`/bot/meetings/${m.id}/from-chat`, { method: 'POST', body: {} });
        if (b && row?.mom_body) b.value = row.mom_body;
      } catch (_) {
        /* keep saved body */
      }
    }
  }

  if (!window._momBound) {
    window._momBound = true;
    document.getElementById('momSaveBtn')?.addEventListener('click', async () => {
      if (!_editingMomId) return;
      try {
        await api(`/bot/meetings/${_editingMomId}`, {
          method: 'PATCH',
          body: {
            title: document.getElementById('momTitle')?.value,
            mom_body: document.getElementById('momBody')?.value,
          },
        });
        showToast('MoM saved', 'success');
        loadMeetings();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('momFillChatBtn')?.addEventListener('click', async () => {
      if (!_editingMomId) return;
      try {
        const row = await api(`/bot/meetings/${_editingMomId}/from-chat`, { method: 'POST', body: {} });
        const b = document.getElementById('momBody');
        if (b) b.value = row.mom_body || '';
        showToast('Call captions loaded into MoM', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('momFinalBtn')?.addEventListener('click', async () => {
      if (!_editingMomId) return;
      try {
        await api(`/bot/meetings/${_editingMomId}`, {
          method: 'PATCH',
          body: {
            title: document.getElementById('momTitle')?.value,
            mom_body: document.getElementById('momBody')?.value,
            status: 'final',
          },
        });
        showToast('MoM marked final', 'success');
        loadMeetings();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('momCloseBtn')?.addEventListener('click', () => {
      const editor = document.getElementById('momEditor');
      if (editor) editor.hidden = true;
      _editingMomId = null;
    });
  }

  // ─── Employee calendar ──────────────────────────────────────────────────────
  async function loadCalendar() {
    const grid = document.getElementById('calGrid');
    const label = document.getElementById('calMonthLabel');
    if (!grid) return;
    const y = _calMonth.getFullYear();
    const m = _calMonth.getMonth();
    if (label) {
      label.textContent = _calMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }
    let tasks = [];
    try {
      tasks = (await api('/tasks/my')).filter((t) => !isRejectedTask(t));
    } catch (err) {
      grid.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
      return;
    }
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const heads = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
      .map((d) => `<div class="cal-head">${d}</div>`)
      .join('');
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayTasks = (tasks || []).filter((t) => String(t.target_date || '').slice(0, 10) === key);
      const chips = dayTasks
        .slice(0, 3)
        .map((t) => {
          const cls = calTaskClass(t, todayKey);
          return `<div class="cal-chip ${cls}" title="${escapeHtml(t.description || '')}">${escapeHtml((t.description || 'Task').slice(0, 22))}</div>`;
        })
        .join('');
      const more = dayTasks.length > 3 ? `<div class="cal-more">+${dayTasks.length - 3} more</div>` : '';
      cells += `<button type="button" class="cal-cell${key === todayKey ? ' cal-is-today' : ''}" data-day="${key}">
        <span class="cal-daynum">${day}</span>${chips}${more}
      </button>`;
    }
    grid.innerHTML = heads + cells;
    grid.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.day;
        const dayTasks = (tasks || []).filter((t) => String(t.target_date || '').slice(0, 10) === key);
        const detail = document.getElementById('calDayDetail');
        if (!detail) return;
        detail.innerHTML = dayTasks.length
          ? `<h3>${key}</h3>` +
            dayTasks
              .map((t) => {
                const cls = calTaskClass(t, todayKey);
                return `<div class="cal-detail-row ${cls}"><strong>${escapeHtml(t.description || 'Task')}</strong><span>${escapeHtml(t.status || '')} · ${escapeHtml(t.project?.name || '')}</span></div>`;
              })
              .join('')
          : `<h3>${key}</h3><p class="empty-state">No tasks</p>`;
      });
    });
  }

  function calTaskClass(t, todayKey) {
    const d = String(t.target_date || '').slice(0, 10);
    const done =
      t.status === 'Completed' ||
      t.verification_status === 'Verified' ||
      t.status === 'Verified';
    if (done) return 'cal-done';
    if (d && d < todayKey) return 'cal-overdue';
    if (d === todayKey) return 'cal-today';
    return 'cal-upcoming';
  }

  if (!window._calBound) {
    window._calBound = true;
    document.getElementById('calPrev')?.addEventListener('click', () => {
      _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() - 1, 1);
      loadCalendar();
    });
    document.getElementById('calNext')?.addEventListener('click', () => {
      _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() + 1, 1);
      loadCalendar();
    });
  }

  // ─── Project management ─────────────────────────────────────────────────────
  async function loadProjectMgmt() {
    try {
      const data = await api('/bot/management/projects');
      if (data.hint) showToast(data.hint, 'error');
      const projects = data.projects || [];
      const members = data.members || [];
      const fill = (sel, items, ph) => {
        const el = document.getElementById(sel);
        if (!el) return;
        el.innerHTML = `<option value="">${ph}</option>`;
        items.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name || p.full_name;
          el.appendChild(opt);
        });
      };
      fill('pmg-project', projects, 'Select project');
      fill('pmg-from', projects, 'From project');
      fill('pmg-to', projects, 'To project');
      const emps = state.master.employees?.length
        ? state.master.employees
        : await api('/master/employees').catch(() => []);
      fill('pmg-employee', emps, 'Select employee');
      fill('pmg-shift-emp', emps, 'Select employee');

      const box = document.getElementById('pmgMembers');
      if (box) {
        if (!members.length) {
          box.innerHTML = '<div class="empty-state">No project assignments yet</div>';
        } else {
          const byProj = {};
          members.forEach((m) => {
            const key = m.project_id;
            if (!byProj[key]) byProj[key] = [];
            byProj[key].push(m);
          });
          box.innerHTML = projects
            .map((p) => {
              const list = byProj[p.id] || [];
              if (!list.length) return '';
              return `<div class="ticket-card"><strong>${escapeHtml(p.name)}</strong><ul style="margin:8px 0 0;padding-left:18px">${list
                .map((m) => `<li>${escapeHtml(m.user?.full_name || '—')}${m.role_on_project ? ` · ${escapeHtml(m.role_on_project)}` : ''}</li>`)
                .join('')}</ul></div>`;
            })
            .join('');
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (!window._pmgBound) {
    window._pmgBound = true;
    document.getElementById('pmgAssignBtn')?.addEventListener('click', async () => {
      const project_id = document.getElementById('pmg-project')?.value;
      const user_id = document.getElementById('pmg-employee')?.value;
      if (!project_id || !user_id) return showToast('Pick project + employee', 'error');
      try {
        await api('/bot/management/assign', { method: 'POST', body: { project_id, user_id } });
        showToast('Assigned', 'success');
        loadProjectMgmt();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('pmgShiftBtn')?.addEventListener('click', async () => {
      const user_id = document.getElementById('pmg-shift-emp')?.value;
      const from_project_id = document.getElementById('pmg-from')?.value || null;
      const to_project_id = document.getElementById('pmg-to')?.value;
      if (!user_id || !to_project_id) return showToast('Pick employee + destination project', 'error');
      try {
        await api('/bot/management/shift', {
          method: 'POST',
          body: { user_id, from_project_id: from_project_id || undefined, to_project_id },
        });
        showToast('Shifted', 'success');
        loadProjectMgmt();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    document.getElementById('pmgDiscussBtn')?.addEventListener('click', async () => {
      const project_id = document.getElementById('pmg-project')?.value;
      if (!project_id) return showToast('Pick a project first', 'error');
      try {
        const room = await api(`/bot/projects/${project_id}/discussion`, { method: 'POST' });
        const box = document.getElementById('pmgInviteBox');
        if (box) {
          box.hidden = false;
          box.textContent = `Discussion ready. Invite code: ${room.invite_code} · Share path: ${room.invite_path || ''}`;
        }
        showToast('Discussion opened — members notified on WhatsApp', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  __tfReadyFns.forEach((fn) => {
    try { fn(); } catch (e) { console.error(e); }
  });

  _enterApp = enterApp;
  _listenersBound = true;

  if (state.token && state.user) await enterApp();
}
