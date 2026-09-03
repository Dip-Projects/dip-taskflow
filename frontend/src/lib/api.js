const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export function getToken() {
  return localStorage.getItem('tf_token');
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('tf_user') || 'null');
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem('tf_token', token);
  localStorage.setItem('tf_user', JSON.stringify(user));
  // Site portal still reads localStorage.user in the dip-projects shape
  syncSiteUser(user);
}

export function syncSiteUser(user) {
  if (!user) {
    localStorage.removeItem('user');
    return;
  }
  const clientLogin =
    String(user.role || '').toLowerCase() === 'client' ||
    String(user.department || '').toLowerCase() === 'client';
  const siteUser = {
    id: user.id,
    user_name: user.username,
    name: user.full_name,
    department: user.department || '',
    role: clientLogin ? 'Client' : (user.designation || user.site_role || user.role || ''),
    status: user.is_active === false ? 'Inactive' : 'Active',
    site_name: user.site_name || '',
    site_names: user.site_names || null,
    designation: clientLogin ? 'Client' : (user.designation || user.department || ''),
    is_head: clientLogin ? false : !!user.is_head,
  };
  localStorage.setItem('user', JSON.stringify(siteUser));
}

export function clearSession() {
  localStorage.removeItem('tf_token');
  localStorage.removeItem('tf_user');
  localStorage.removeItem('user');
  localStorage.removeItem('tf_surface');
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const newToken = res.headers.get('X-New-Token');
  if (newToken) localStorage.setItem('tf_token', newToken);

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    clearSession();
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function login(username, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setSession(data.token, data.user);
  return data.user;
}

/** Process Controller = MDO portal (attendance log, DPR, drawings, leave). */
export function isProcessController(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  const dept = String(user.department || '').toLowerCase().trim();
  if (role === 'admin' || role === 'client' || dept === 'client') return false;
  const blob = [user.role, user.designation, user.department]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /process controller/.test(blob);
}

/** Process Controller last choice: MDO portal or Office TaskFlow. */
export function processControllerPath() {
  try {
    const s = localStorage.getItem('tf_surface');
    if (s === 'app' || s === 'office') return '/app';
  } catch {
    /* ignore */
  }
  return '/mdo';
}

/** Where should this user land after login? */
export function postLoginPath(user) {
  if (isClient(user)) return '/client';
  if (isProcessController(user) || user.can_switch_office_mdo) return processControllerPath();
  const dept = (user.department || '').trim().toLowerCase();
  if (dept === 'site engineer') return '/site';
  return '/app';
}

export function isClient(user) {
  if (!user) return false;
  const role = (user.role || '').toLowerCase().trim();
  const dept = (user.department || '').trim().toLowerCase();
  return role === 'client' || dept === 'client';
}

export function isSiteEngineer(user) {
  return (user?.department || '').trim().toLowerCase() === 'site engineer';
}

/** People who work on site (clock-in, own DPR). Not office heads. */
export function isOnSiteStaff(user) {
  if (!user) return false;
  if (isSiteEngineer(user)) return true;
  const blob = [user.role, user.designation, user.department, user.site_role]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /jr\.?\s*site engineer|junior site engineer|site engineer|site incharge|site coordinator|co-?ordinator/.test(blob);
}

/** Office head on Site view: only their team's submitted reports. */
export function isOfficeSiteViewer(user) {
  return isSiteHead(user) && !isOnSiteStaff(user);
}

export function isHead(user) {
  return !!(user?.is_head || user?.can_access_site);
}

/** Site portal oversight (team submissions) — not Office↔Site, not every site engineer */
export function isSiteHead(user) {
  if (!user) return false;
  if (user.is_head) return true;
  const role = String(user.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'head') return true;
  const des = String(user.designation || user.site_role || '').toLowerCase().trim();
  if (des === 'head' || des === 'project head' || des === 'site head') return true;
  const blob = [
    user.role,
    user.designation,
    user.department,
    user.site_role,
  ]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /site incharge|project head|site head/.test(blob);
}

export function canToggleSite(user) {
  // Clients never toggle. Admin / Head / permission toggle / known site roles.
  if (!user || isClient(user)) return false;
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'head') return true;
  if (user.can_switch_office_site || user.is_head || user.can_access_site) return true;
  if (isSiteEngineer(user)) return false;
  const desig = (user.designation || '').toLowerCase().trim();
  return (
    desig === 'project head' ||
    desig === 'site incharge' ||
    desig === 'site head' ||
    desig === 'head' ||
    /co-?ordinator/.test(desig)
  );
}

/** Office ↔ MDO: Process Controller by role, or Permissions toggle. */
export function canToggleMdo(user) {
  if (!user || isClient(user)) return false;
  if (isProcessController(user)) return true;
  return !!user.can_switch_office_mdo;
}
