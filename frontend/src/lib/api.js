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

/** Where should this user land after login? */
export function postLoginPath(user) {
  if (isClient(user)) return '/client';
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

export function isHead(user) {
  return !!(user?.is_head || user?.can_access_site);
}

/** Site portal oversight (team submissions) */
export function isSiteHead(user) {
  if (!user) return false;
  if (user.is_head || user.can_access_site) return true;
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'head') return true;
  const desig = (user.designation || user.site_role || '').toLowerCase().trim();
  return desig === 'project head' || desig === 'site incharge';
}

export function canToggleSite(user) {
  // Clients never toggle. Admin / Head / permission toggle / known site roles.
  if (!user || isClient(user)) return false;
  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'head') return true;
  if (user.can_switch_office_site || user.is_head || user.can_access_site) return true;
  if (isSiteEngineer(user)) return false;
  const desig = (user.designation || '').toLowerCase().trim();
  return desig === 'project head' || desig === 'site incharge';
}
