/** Who sees which screens. MIS + admin can change this. Hidden = hidden for that role. */

const MODULES = [
  { key: 'add', label: 'Add task', area: 'office' },
  { key: 'all', label: 'All delegated tasks', area: 'office' },
  { key: 'overdue', label: 'Overdue tasks', area: 'office' },
  { key: 'my', label: 'My tasks', area: 'office' },
  { key: 'recurring', label: 'Recurring tasks', area: 'office' },
  { key: 'verifications', label: 'Verification', area: 'office' },
  { key: 'employees', label: 'Manage employees', area: 'office' },
  { key: 'hierarchy', label: 'Org hierarchy', area: 'office' },
  { key: 'project-mgmt', label: 'Project management', area: 'office' },
  { key: 'sites', label: 'Manage sites', area: 'office' },
  { key: 'masterdata', label: 'Departments & task types', area: 'office' },
  { key: 'permissions', label: 'Employee permission toggles', area: 'office' },
  { key: 'visibility', label: 'Who sees what', area: 'office' },
  { key: 'daily-report', label: 'Daily report', area: 'office' },
  { key: 'mis-report', label: 'MIS report', area: 'office' },
  { key: 'time-dashboard', label: 'Time dashboard', area: 'office' },
  { key: 'applyleave', label: 'Apply leave', area: 'office' },
  { key: 'buddyrequests', label: 'Buddy requests', area: 'office' },
  { key: 'leaveapprovals', label: 'Leave approvals', area: 'office' },
  { key: 'tickets', label: 'Tickets', area: 'office' },
  { key: 'drawings', label: 'Drawings', area: 'office' },
  { key: 'ai-bot', label: 'DIP Bot', area: 'office' },
  { key: 'team-chat', label: 'Team chat', area: 'office' },
  { key: 'meetings', label: 'Meetings', area: 'office' },
  { key: 'calendar', label: 'My calendar', area: 'office' },
  { key: 'corrections', label: 'Corrections / updations', area: 'office' },
  { key: 'site-team-submissions', label: 'Site: Team submissions', area: 'site' },
  { key: 'site-leave-approvals', label: 'Site: Leave approvals', area: 'site' },
];

const ROLES = ['admin', 'mis', 'employee', 'site', 'site_head'];

function defaultRow(key) {
  const allTrue = { admin: true, mis: true, employee: true, site: true, site_head: true };
  const officeStaff = { admin: true, mis: true, employee: true, site: false, site_head: false };
  const adminMis = { admin: true, mis: true, employee: false, site: false, site_head: false };
  const adminOnly = { admin: true, mis: false, employee: false, site: false, site_head: false };
  const map = {
    add: adminOnly,
    all: adminOnly,
    overdue: adminOnly,
    my: officeStaff,
    recurring: officeStaff,
    verifications: { admin: true, mis: true, employee: true, site: false, site_head: false },
    employees: adminOnly,
    hierarchy: adminOnly,
    'project-mgmt': adminOnly,
    sites: adminOnly,
    masterdata: adminOnly,
    permissions: adminOnly,
    visibility: adminMis,
    'daily-report': adminMis,
    'mis-report': adminMis,
    'time-dashboard': adminMis,
    applyleave: officeStaff,
    buddyrequests: officeStaff,
    leaveapprovals: adminOnly,
    tickets: officeStaff,
    drawings: adminOnly,
    'ai-bot': adminOnly,
    'team-chat': officeStaff,
    meetings: officeStaff,
    calendar: { admin: false, mis: true, employee: true, site: false, site_head: false },
    corrections: { admin: false, mis: true, employee: true, site: false, site_head: false },
    'site-team-submissions': { admin: false, mis: false, employee: false, site: false, site_head: true },
    'site-leave-approvals': { admin: false, mis: false, employee: false, site: false, site_head: true },
  };
  return map[key] || allTrue;
}

function defaultMap() {
  const out = {};
  for (const m of MODULES) out[m.key] = defaultRow(m.key);
  return out;
}

function mergeMap(saved) {
  const base = defaultMap();
  if (!saved || typeof saved !== 'object') return base;
  for (const m of MODULES) {
    if (saved[m.key] && typeof saved[m.key] === 'object') {
      base[m.key] = { ...base[m.key], ...saved[m.key] };
    }
  }
  return base;
}

function viewerRole(user) {
  if (!user) return 'employee';
  const role = String(user.role || '').toLowerCase().trim();
  const dept = String(user.department || '').toLowerCase().trim();
  const desig = String(user.designation || user.site_role || '').toLowerCase().trim();
  if (role === 'client' || dept === 'client') return 'client';
  if (role === 'admin') return 'admin';
  if (user.is_mis_executive) return 'mis';
  const blob = `${role} ${dept} ${desig}`;
  const head =
    !!user.is_head ||
    role === 'head' ||
    /site incharge|project head|site head/.test(blob);
  if (dept === 'site engineer' || /site engineer/.test(blob)) {
    return head ? 'site_head' : 'site';
  }
  if (head && /incharge|project head/.test(blob)) return 'site_head';
  return 'employee';
}

function canSee(moduleKey, user, map) {
  const role = viewerRole(user);
  if (role === 'client') return false;
  const row = (map && map[moduleKey]) || defaultRow(moduleKey);
  return !!row[role];
}

module.exports = { MODULES, ROLES, defaultMap, mergeMap, viewerRole, canSee };
