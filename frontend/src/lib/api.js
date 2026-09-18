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
  if (token) localStorage.setItem('tf_token', token);
  if (user) localStorage.setItem('tf_user', JSON.stringify(user));
  // Site portal still reads localStorage.user in the dip-projects shape
  if (user) syncSiteUser(user);
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
  const tokenUsed = token || '';
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (body != null && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  const newToken = res.headers.get('X-New-Token');
  if (newToken) {
    // Only apply refresh if this response is still for the active session
    const current = getToken();
    if (!current || current === tokenUsed) {
      localStorage.setItem('tf_token', newToken);
    }
  }

  const raw = await res.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  if (res.status === 401 && path !== '/auth/login') {
    // Soft polls (heartbeat) must NEVER wipe a fresh login — old in-flight
    // 401s were racing and clearing the new session ("login → instant logout").
    if (options.softAuth) {
      const err = new Error(data.error || data.message || 'Unauthorized');
      err.status = 401;
      err.data = data;
      throw err;
    }
    const msg = String(data.error || data.message || '').toLowerCase();
    const hadToken = !!tokenUsed;
    const authFail =
      hadToken &&
      /session expired|invalid token|jwt malformed|jwt expired|token expired|jwt must be provided/i.test(
        msg
      );
    // Only clear if the failing token is STILL the stored one (not replaced by a newer login)
    if (authFail && getToken() === tokenUsed) {
      clearSession();
      try {
        window.dispatchEvent(new CustomEvent('tf:session-cleared'));
      } catch {
        /* ignore */
      }
    }
  }
  if (!res.ok) {
    const errMsg =
      data.error ||
      data.note ||
      data.message ||
      (raw && !raw.trim().startsWith('<') ? raw.trim().slice(0, 180) : '') ||
      `Request failed (${res.status})`;
    const err = new Error(errMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function login(username, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: {
      username: String(username || '').trim(),
      password: String(password || '').trim(),
    },
  });
  if (!data?.token || !data?.user) {
    throw new Error('Login failed — no session returned. Try again.');
  }
  setSession(data.token, data.user);
  return data.user;
}

/** HR / Human Resources — dedicated HRMS portal. */
export function isHr(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  if (role === 'hr') return true;
  const blob = [user.role, user.designation, user.department]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /\bhr\b|human\s*resource/.test(blob);
}

/** Process Controller = MDO portal (attendance log, DPR, drawings, leave). */
export function isProcessController(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  const dept = String(user.department || '').toLowerCase().trim();
  if (role === 'admin' || role === 'client' || role === 'hr' || dept === 'client') return false;
  if (isHr(user)) return false;
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
  if (isHr(user)) return '/hr';
  // MDO only via Process Controller role or Permissions "Office ↔ MDO" toggle
  // (dept name alone must NOT auto-open MDO when toggle is Off).
  if (isProcessController(user) || user.can_switch_office_mdo) return processControllerPath();
  // Site field staff → Site portal only (no Office)
  if (isSitePortalOnlyStaff(user)) return '/site';
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

/**
 * Field staff who only use the Site portal (no Office TaskFlow, no Office↔Site toggle).
 * Site Engineer department, Site Engineer / Site Incharge / Site Coordinator roles.
 */
export function isSitePortalOnlyStaff(user) {
  if (!user) return false;
  if (isSiteEngineer(user)) return true;
  const blob = [user.role, user.designation, user.site_role]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /jr\.?\s*site engineer|junior site engineer|site engineer|site incharge|site coordinator/.test(
    blob
  );
}

/** People who work on site (clock-in, own DPR). Not office heads. */
export function isOnSiteStaff(user) {
  if (!user) return false;
  if (isSitePortalOnlyStaff(user)) return true;
  const blob = [user.role, user.designation, user.department, user.site_role]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /co-?ordinator/.test(blob);
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
  // Clients never toggle. Site field staff never toggle (Site portal only).
  if (!user || isClient(user)) return false;
  if (isSitePortalOnlyStaff(user)) return false;

  const role = (user.role || '').toLowerCase().trim();
  if (role === 'admin' || role === 'head') return true;
  // Explicit Permissions "Office ↔ Site" toggle
  if (user.can_switch_office_site) return true;
  // Office heads who may also open Site
  if (user.is_head) return true;

  const desig = (user.designation || '').toLowerCase().trim();
  // Do NOT auto-grant for Site Incharge / Site Engineer / Coordinator — those are site-only
  return desig === 'project head' || desig === 'site head' || desig === 'head';
}

/**
 * Office ↔ MDO switch / /mdo access.
 * Only: Process Controller designation, or Permissions toggle can_switch_office_mdo.
 * Being in "MDO Office" department alone does NOT grant MDO when the toggle is Off.
 */
export function canToggleMdo(user) {
  if (!user || isClient(user)) return false;
  const role = String(user.role || '').toLowerCase().trim();
  if (role === 'admin') return true;
  if (isProcessController(user)) return true;
  return !!user.can_switch_office_mdo;
}
