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
  const siteUser = {
    id: user.id,
    user_name: user.username,
    name: user.full_name,
    department: user.department || '',
    role: user.designation || user.site_role || user.role || '',
    status: user.is_active === false ? 'Inactive' : 'Active',
    site_name: user.site_name || '',
    site_names: user.site_names || null,
    designation: user.designation || user.department || '',
    is_head: !!(user.is_head || user.can_access_site),
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

/** Where should this user land after login? */
export function postLoginPath(user) {
  const dept = (user.department || '').trim().toLowerCase();
  if (dept === 'site engineer') return '/site';
  return '/app';
}

export function isSiteEngineer(user) {
  return (user?.department || '').trim().toLowerCase() === 'site engineer';
}

export function isHead(user) {
  return !!(user?.is_head || user?.can_access_site);
}

/** Site portal head/incharge (oversight of team submissions) */
export function isSiteHead(user) {
  if (!user) return false;
  if (user.is_head || user.can_access_site) return true;
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin') return true;
  const desig = (user.designation || user.site_role || user.role || '').toLowerCase().trim();
  return (
    desig === 'project head' ||
    desig === 'site incharge' ||
    desig.includes('head') ||
    desig.includes('incharge')
  );
}

export function canToggleSite(user) {
  // Pure site engineers stay on /site only.
  // Admin, is_head, and Project Head / Site Incharge get Office ↔ Site toggle.
  if (!user || isSiteEngineer(user)) return false;
  if (isHead(user)) return true;
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin') return true;
  return isSiteHead(user);
}
