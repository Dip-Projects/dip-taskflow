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
    site_name: user.site_name || '',
    site_names: user.site_names || null,
    can_verify: !!user.can_verify,
    is_mis_executive: !!user.is_mis_executive,
    can_add_site: !!user.can_add_site,
    can_add_employee: !!user.can_add_employee,
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

// Use after requireAuth on routes that only the admin should reach.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can do this' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, signToken };
