const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabaseClient');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

const USER_SELECT_FULL =
  'id, username, password_hash, full_name, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, can_add_task, can_resolve_tickets, can_switch_office_site, can_switch_office_mdo, department, department_id, designation, is_head, site_name, site_names';
const USER_SELECT_BASIC =
  'id, username, password_hash, full_name, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, department, department_id, designation';

function toPayload(user) {
  const role = (user.role || '').toLowerCase();
  const desig = (user.designation || '').toLowerCase().trim();
  const dept = String(user.department || '').toLowerCase().trim();
  // Field staff: Site portal only — never auto-grant Office↔Site toggle / is_head
  const siteOnlyStaff =
    dept === 'site engineer' ||
    /jr\.?\s*site engineer|junior site engineer|site engineer|site incharge|site coordinator/.test(
      desig
    ) ||
    /site engineer|site incharge|site coordinator/.test(role);

  // Who may open /site (includes site-only staff + office people with switch permission)
  const canAccessSite =
    role !== 'client' &&
    (siteOnlyStaff ||
      !!user.can_switch_office_site ||
      !!user.is_head ||
      role === 'admin' ||
      role === 'head' ||
      desig === 'project head' ||
      desig === 'site head');

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    department: user.department,
    department_id: user.department_id,
    designation: user.designation || '',
    // Do NOT promote Site Incharge to is_head — that wrongly showed Office↔Site toggle
    is_head: role === 'client' ? false : (!!user.is_head || role === 'head'),
    can_access_site: canAccessSite,
    // Site-only staff never get the Office↔Site switch, even if DB flag was ticked
    can_switch_office_site: siteOnlyStaff ? false : !!user.can_switch_office_site,
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
}

async function loadUserByUsername(username) {
  const raw = String(username || '').trim();
  if (!raw) return null;

  let { data, error } = await supabase
    .from('users')
    .select(USER_SELECT_FULL)
    .eq('username', raw)
    .maybeSingle();

  if (error && /is_head|site_name|site_names|can_switch_office_site|can_switch_office_mdo|can_resolve_tickets|can_add_task/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('users')
      .select(USER_SELECT_BASIC)
      .eq('username', raw)
      .maybeSingle());
  }
  if (error) throw error;
  if (data) return data;

  // Case-insensitive fallback (Alok.k vs alok.k) — escape LIKE wildcards
  const escaped = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  let list;
  ({ data: list, error } = await supabase
    .from('users')
    .select(USER_SELECT_FULL)
    .ilike('username', escaped)
    .limit(5));
  if (error && /is_head|site_name|site_names|can_switch_office_site|can_switch_office_mdo|can_resolve_tickets|can_add_task/i.test(error.message || '')) {
    ({ data: list, error } = await supabase
      .from('users')
      .select(USER_SELECT_BASIC)
      .ilike('username', escaped)
      .limit(5));
  }
  if (error) throw error;
  const low = raw.toLowerCase();
  return (list || []).find((u) => String(u.username || '').toLowerCase() === low) || null;
}

async function loadUserById(id) {
  let { data, error } = await supabase
    .from('users')
    .select(USER_SELECT_FULL.replace(', password_hash', ''))
    .eq('id', id)
    .maybeSingle();

  if (error && /is_head|site_name|site_names|can_switch_office_site|can_switch_office_mdo|can_resolve_tickets|can_add_task/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('users')
      .select(
        'id, username, full_name, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, department, department_id, designation'
      )
      .eq('id', id)
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const userName = String(username || '').trim();
    const pass = String(password || '').trim();

    if (!userName || !pass) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('Login error: JWT_SECRET missing');
      return res.status(500).json({ error: 'Server auth not configured. Contact admin.' });
    }

    const user = await loadUserByUsername(userName);

    if (!user || user.is_active === false) {
      const inactiveClient =
        user &&
        user.is_active === false &&
        ((user.role || '').toLowerCase() === 'client' ||
          (user.department || '').toLowerCase() === 'client');
      return res.status(401).json({
        error: inactiveClient
          ? 'This client account is inactive. Contact office.'
          : 'Invalid username or password',
      });
    }

    if (!user.password_hash) {
      console.error('Login error: missing password_hash for', user.username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    let passwordMatches = false;
    try {
      passwordMatches = await bcrypt.compare(pass, user.password_hash);
    } catch (e) {
      console.error('bcrypt.compare failed:', e.message);
      passwordMatches = false;
    }
    // Legacy plain-text hashes (rare) — accept once then force bcrypt path next time
    if (!passwordMatches && user.password_hash === pass) {
      passwordMatches = true;
    }
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const payload = toPayload(user);
    const token = signToken(payload);

    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed, please try again' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await loadUserById(req.user.id);
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(toPayload(user));
  } catch (err) {
    console.error('Me error:', err.message);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

module.exports = router;
