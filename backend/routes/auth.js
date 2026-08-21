const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const USER_SELECT_FULL =
  'id, username, password_hash, full_name, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, can_resolve_tickets, can_switch_office_site, can_switch_office_mdo, department, department_id, designation, is_head, site_name, site_names';
const USER_SELECT_BASIC =
  'id, username, password_hash, full_name, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, department, department_id, designation';

function toPayload(user) {
  const role = (user.role || '').toLowerCase();
  const desig = (user.designation || '').toLowerCase().trim();
  // Auto roles + Permissions toggle "Office ↔ Site"
  const canAccessSite =
    role !== 'client' &&
    (!!user.can_switch_office_site ||
      !!user.is_head ||
      role === 'admin' ||
      role === 'head' ||
      desig === 'project head' ||
      desig === 'site incharge');

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    department: user.department,
    department_id: user.department_id,
    designation: user.designation || '',
    is_head: role === 'client' ? false : (!!user.is_head || role === 'head' || canAccessSite),
    can_access_site: canAccessSite,
    can_switch_office_site: !!user.can_switch_office_site,
    can_switch_office_mdo: !!user.can_switch_office_mdo,
    site_name: user.site_name || '',
    site_names: user.site_names || null,
    can_verify: !!user.can_verify,
    is_mis_executive: !!user.is_mis_executive,
    can_add_site: !!user.can_add_site,
    can_add_employee: !!user.can_add_employee,
    can_resolve_tickets: !!user.can_resolve_tickets,
  };
}

async function loadUserByUsername(username) {
  let { data, error } = await supabase
    .from('users')
    .select(USER_SELECT_FULL)
    .eq('username', username)
    .maybeSingle();

  if (error && /is_head|site_name|site_names|can_switch_office_site|can_switch_office_mdo|can_resolve_tickets/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('users')
      .select(USER_SELECT_BASIC)
      .eq('username', username)
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

async function loadUserById(id) {
  let { data, error } = await supabase
    .from('users')
    .select(USER_SELECT_FULL.replace(', password_hash', ''))
    .eq('id', id)
    .maybeSingle();

  if (error && /is_head|site_name|site_names|can_switch_office_site|can_switch_office_mdo|can_resolve_tickets/i.test(error.message || '')) {
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

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await loadUserByUsername(username.trim());

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

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const payload = toPayload(user);
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

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
