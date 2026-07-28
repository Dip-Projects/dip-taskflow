import fs from 'fs';
import path from 'path';

const htmlPath = 'D:/div pmc/dip-taskflow/backend/legacy/index.html';
const appPath = 'D:/div pmc/dip-taskflow/backend/legacy/app.js';
const outDir = 'D:/div pmc/dip-taskflow/frontend/src/pages/taskflow';

const html = fs.readFileSync(htmlPath, 'utf8');
const appStart = html.indexOf('<!-- APP SHELL -->');
const scriptIdx = html.lastIndexOf('<script');
const chunk = html.slice(appStart, scriptIdx);

function htmlToJsx(src) {
  let s = src;

  // Drop HTML comments that contain markup; keep short text comments as JSX
  s = s.replace(/<!--([\s\S]*?)-->/g, (_m, body) => {
    const trimmed = body.trim();
    if (/<[a-zA-Z]/.test(trimmed)) return '';
    return `{/* ${trimmed.replace(/\*\//g, '* /')} */}`;
  });

  s = s.replace(/\sclass=/g, ' className=');
  s = s.replace(/\sfor=/g, ' htmlFor=');
  s = s.replace(/\shidden(?=[\s>/])/g, ' hidden={true}');
  s = s.replace(/\sselected(?=[\s>/])/g, ' defaultSelected');
  s = s.replace(/\sautocomplete=/gi, ' autoComplete=');

  // Uncontrolled defaults for React
  s = s.replace(/<input([^>]*?)\svalue="/g, '<input$1 defaultValue="');
  s = s.replace(/\srows="(\d+)"/g, ' rows={$1}');
  s = s.replace(/\scols="(\d+)"/g, ' cols={$1}');
  s = s.replace(/\smaxlength="/gi, ' maxLength="');
  s = s.replace(/\sminlength="/gi, ' minLength="');
  s = s.replace(/\stabindex="/gi, ' tabIndex="');

  // Inline style strings → objects
  s = s.replace(/\sstyle="([^"]*)"/g, (_m, css) => {
    const decls = css.split(';').map((d) => d.trim()).filter(Boolean);
    const obj = decls
      .map((d) => {
        const colon = d.indexOf(':');
        if (colon < 0) return null;
        let prop = d.slice(0, colon).trim();
        let val = d.slice(colon + 1).trim();
        prop = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (/^\d+(\.\d+)?px$/.test(val)) return `${prop}: ${parseFloat(val)}`;
        if (/^\d+(\.\d+)?$/.test(val)) return `${prop}: ${val}`;
        val = val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `${prop}: '${val}'`;
      })
      .filter(Boolean)
      .join(', ');
    return ` style={{${obj}}}`;
  });

  // Self-close void elements BEFORE adding JSX arrow handlers
  const voids = ['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'col', 'embed', 'wbr'];
  for (const v of voids) {
    const re = new RegExp(`<${v}(\\s[^>]*)?>`, 'gi');
    s = s.replace(re, (m) => {
      if (m.endsWith('/>')) return m;
      return m.slice(0, -1) + ' />';
    });
  }

  // onerror after void closing so `>` in arrow fn isn't confused
  s = s.replace(
    /onerror="this\.style\.display='none';this\.nextElementSibling\.style\.display='flex';"\s*\/>/g,
    `onError={(e) => { e.currentTarget.style.display='none'; if (e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.style.display='flex'; }} />`
  );

  return s;
}

let jsxBody = htmlToJsx(chunk);
jsxBody = jsxBody.replace(
  /id="appScreen" className="screen app-screen" hidden=\{true\}/,
  'id="appScreen" className="screen app-screen"'
);

const taskflowDom = `/* Auto-converted from backend/legacy/index.html — keep element IDs for mountTaskflowApp bridge */
export default function TaskflowDom() {
  return (
    <>
${jsxBody}
    </>
  );
}
`;

fs.writeFileSync(path.join(outDir, 'TaskflowDom.jsx'), taskflowDom);
console.log('Wrote TaskflowDom.jsx', Buffer.byteLength(taskflowDom), 'bytes');

// ─── mountTaskflowApp.js ─────────────────────────────────────────────────────
const collectElsFn = fs.readFileSync(new URL(import.meta.url), 'utf8').includes('collectEls')
  ? null
  : null;

function buildCollectEls() {
  return `function collectEls() {
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
    openRaiseTicket: document.getElementById('openRaiseTicket'),
    ticketModal: document.getElementById('ticketModal'),
    ticketForm: document.getElementById('ticketForm'),
    ticketFormMsg: document.getElementById('ticketFormMsg'),
    ticketDescription: document.getElementById('ticket-description'),
    closeTicketModal: document.getElementById('closeTicketModal'),
    cancelTicketModal: document.getElementById('cancelTicketModal'),
    myLeavesList: document.getElementById('myLeavesList'),
    openApplyLeave: document.getElementById('openApplyLeave'),
    leaveModal: document.getElementById('leaveModal'),
    leaveForm: document.getElementById('leaveForm'),
    leaveFormMsg: document.getElementById('leaveFormMsg'),
    leaveFrom: document.getElementById('leave-from'),
    leaveTo: document.getElementById('leave-to'),
    leaveHalfDay: document.getElementById('leave-halfday'),
    leaveReason: document.getElementById('leave-reason'),
    closeLeaveModal: document.getElementById('closeLeaveModal'),
    cancelLeaveModal: document.getElementById('cancelLeaveModal'),
    leaveApprovalsList: document.getElementById('leaveApprovalsList'),
    leaveApprovalsStatusFilter: document.getElementById('leaveApprovalsStatusFilter'),
    rejectLeaveModal: document.getElementById('rejectLeaveModal'),
    rejectLeaveForm: document.getElementById('rejectLeaveForm'),
    rejectLeaveFormMsg: document.getElementById('rejectLeaveFormMsg'),
    rejectLeaveReason: document.getElementById('reject-leave-reason'),
    closeRejectLeaveModal: document.getElementById('closeRejectLeaveModal'),
    cancelRejectLeaveModal: document.getElementById('cancelRejectLeaveModal'),
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
    toast: document.getElementById('toast')
  };
}
`;
}

let raw = fs.readFileSync(appPath, 'utf8');
raw = raw.replace(/^const API_BASE = '\/api';\r?\n/, '');
raw = raw.replace(/^\/\/ Absolute path[\s\S]*?\/\/ =+\r?\n/, '');

const elsBlock = raw.match(/const els = \{[\s\S]*?toast: document\.getElementById\('toast'\)\r?\n\};/);
if (!elsBlock) {
  console.error('Could not find els block');
  process.exit(1);
}
raw = raw.replace(elsBlock[0], '/* els via collectEls() */');

raw = raw.replace(
  /let state = \{[\s\S]*?pendingLeaveId: null\r?\n\};/,
  '/* state module-scoped */'
);

const a0 = raw.indexOf('// ─── auth ─');
const a1 = raw.indexOf('// ─── sidebar toggle');
if (a0 < 0 || a1 < 0) {
  console.error('auth/sidebar markers missing', a0, a1);
  process.exit(1);
}
raw =
  raw.slice(0, a0) +
  `// ─── auth (login handled by React AuthContext) ────────────────────────────────
function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('tf_token'); localStorage.removeItem('tf_user');
  if (window._badgeInterval) clearInterval(window._badgeInterval);
  if (typeof _onLogout === 'function') _onLogout();
}
function bindAuthControls() {
  if (els.logoutBtn) els.logoutBtn.addEventListener('click', logout);
}
bindAuthControls();

` +
  raw.slice(a1);

raw = raw.replace(
  /async function enterApp\(\) \{\r?\n  els\.loginScreen\.hidden = true; els\.appScreen\.hidden = false;\r?\n/,
  `async function enterApp() {
  if (els.appScreen) els.appScreen.hidden = false;
`
);

raw = raw.replace(
  /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{/g,
  '__tfReadyFns.push(() => {'
);

raw = raw.replace(
  /\/\/ ─── boot ─────────────────────────────────────────────────────────────────────\r?\nif \(state\.token && state\.user\) \{ enterApp\(\); \}\r?\n/,
  '// boot deferred to mountTaskflowApp\n'
);

const indented = raw
  .split('\n')
  .map((line) => (line.length ? '  ' + line : line))
  .join('\n');

const mountFile = `/**
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

${buildCollectEls()}

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

  if (_listenersBound) {
    if (state.token && state.user && typeof _enterApp === 'function') await _enterApp();
    return;
  }

  els = collectEls();
  const __tfReadyFns = [];

${indented}

  __tfReadyFns.forEach((fn) => {
    try { fn(); } catch (e) { console.error(e); }
  });

  _enterApp = enterApp;
  _listenersBound = true;

  if (state.token && state.user) await enterApp();
}
`;

fs.writeFileSync(path.join(outDir, 'mountTaskflowApp.js'), mountFile);
console.log('Wrote mountTaskflowApp.js', Buffer.byteLength(mountFile), 'bytes');

// ID checks
const ids = [
  'appScreen', 'navList', 'logoutBtn', 'menuToggle', 'view-add', 'view-my', 'view-all',
  'view-overdue', 'view-employees', 'view-hierarchy', 'view-sites', 'view-masterdata',
  'view-permissions', 'view-verifications', 'view-reschedule-requests', 'view-applyleave',
  'view-leaveapprovals', 'view-tickets', 'view-corrections', 'view-updations', 'view-recurring',
  'view-drawings-add', 'view-drawings-all', 'view-daily-report', 'employeeModal', 'toast',
  'recurringModal', 'verifyModal', 'ticketModal', 'leaveModal', 'correctionModal',
  'editEmployeeModal', 'siteModal', 'updationModal', 'solutionModal', 'checkpointModal',
  'rescheduleModal', 'reschedRequestModal', 'overdueExtendModal', 'reassignModal',
  'resendVerifyModal', 'rejectLeaveModal', 'credsModal', 'overdueDrawerBackdrop',
];
const missing = ids.filter((id) => !taskflowDom.includes(`id="${id}"`));
console.log('Missing IDs:', missing.length ? missing.join(', ') : 'none');

// Sanity: onError not mangled
if (taskflowDom.includes('onError={(e) = />')) {
  console.error('ERROR: onError still mangled');
  process.exit(1);
}
if (!taskflowDom.includes('onError={(e) =>')) {
  console.warn('WARN: onError handler missing');
}
console.log('Done.');
