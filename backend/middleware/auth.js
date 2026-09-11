const jwt = require('jsonwebtoken');

// Agar token ki baaki bachi hui life is se kam ho, to naya token bhej dete
// hain (X-New-Token header me) — taaki active session kabhi hard 7-din ki
// deewar se na takraye. Genuinely inactive user (7 din tak koi request
// nahi) ko phir bhi expiry pe logout hi milega.
const REFRESH_THRESHOLD_SECONDS = 24 * 60 * 60; // last 24 hours me refresh
const TOKEN_LIFETIME = '7d';

function signToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    department: user.department,
    department_id: user.department_id,
    designation: user.designation || '',
    is_head: !!user.is_head,
    can_access_site: !!(user.is_head || user.can_access_site || user.can_switch_office_site),
    can_switch_office_site: !!user.can_switch_office_site,
    can_switch_office_mdo: !!user.can_switch_office_mdo,
    site_name: user.site_name || '',
    site_names: user.site_names || null,
    can_verify: !!user.can_verify,
    is_mis_executive: !!user.is_mis_executive,
    can_add_site: !!user.can_add_site,
    can_add_employee: !!user.can_add_employee,
    can_add_task: !!user.can_add_task,
    can_resolve_tickets: !!user.can_resolve_tickets,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_LIFETIME });
}

// Verifies the Bearer token sent by the frontend and attaches the decoded
// user onto req.user. Also silently rotates the token if it's close to
// expiring (sliding session) so active users never get logged out mid-use.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Please log in to continue' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    const secondsLeft = decoded.exp - Math.floor(Date.now() / 1000);
    if (secondsLeft < REFRESH_THRESHOLD_SECONDS) {
      const freshToken = signToken(decoded);
      res.set('X-New-Token', freshToken);
      // Browser JS can only read custom headers if the server explicitly
      // exposes them — needed for res.headers.get('X-New-Token') to work.
      res.set('Access-Control-Expose-Headers', 'X-New-Token');
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

function isHrUser(user) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase().trim();
  if (role === 'hr') return true;
  const blob = [user.role, user.designation, user.department]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return /\bhr\b|human\s*resource/.test(blob);
}

// Use after requireAuth on routes that only the admin should reach.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can do this' });
  }
  next();
}

/** Admin or HR — employee master, leave approvals, HRMS APIs. */
function requireAdminOrHr(req, res, next) {
  if (req.user?.role === 'admin' || isHrUser(req.user)) return next();
  return res.status(403).json({ error: 'Only an admin or HR can do this' });
}

function requireAdminOrMis(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.is_mis_executive) return next();
  const blob = `${req.user?.department || ''} ${req.user?.designation || ''}`.toLowerCase();
  if (/\bmis\b/.test(blob)) return next();
  return res.status(403).json({ error: 'Only an admin or MIS executive can do this' });
}

/** Admin, Permissions can_add_task (live DB), or Who sees what grants Add task. */
async function requireCanAddTask(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.can_add_task) return next();
  try {
    const supabase = require('../lib/supabaseClient');
    // Permissions toggle updates DB immediately; JWT may still be old until re-login
    const { data: u } = await supabase
      .from('users')
      .select('can_add_task, role, is_mis_executive, department, designation')
      .eq('id', req.user.id)
      .maybeSingle();
    if (u?.role === 'admin' || u?.can_add_task) {
      req.user.can_add_task = true;
      return next();
    }
    const { canSee, mergeMap } = require('../lib/navVisibility');
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nav_visibility')
      .maybeSingle();
    const liveUser = { ...req.user, ...(u || {}) };
    if (canSee('add', liveUser, mergeMap(data?.value || null))) return next();
  } catch (err) {
    console.warn('requireCanAddTask nav check:', err.message);
  }
  return res.status(403).json({
    error: 'No permission to add tasks. Ask admin: Permissions → Add task = Yes, or MIS: Who sees what → Add task. Then log out and log in again.',
  });
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireAdminOrHr,
  requireAdminOrMis,
  requireCanAddTask,
  signToken,
  isHrUser,
};
