const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin); // every route here is admin-only

// ----------------------------- helpers -----------------------------

// Turns "Jignesh Thakorbhai Lad" -> "jignesh.l" (firstname.lastinitial),
// then appends a number if that username is already taken.
function slugifyName(full_name) {
  const parts = full_name.trim().toLowerCase().split(/\s+/);
  const first = parts[0].replace(/[^a-z0-9]/g, '');
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return lastInitial ? `${first}.${lastInitial}` : first;
}

async function generateUniqueUsername(full_name) {
  const base = slugifyName(full_name);
  let candidate = base;
  let suffix = 1;

  // Keep trying base, base2, base3... until we find one that's free.
  // (Loop is bounded — there's no realistic scenario with 1000s of clashes.)
  while (true) {
    const { data: existing, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();
    if (error) throw error;
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
}

function generatePassword() {
  // 8 random alphanumeric characters — easy enough to read out/type once,
  // the employee can be asked to change it after first login if you add
  // that flow later.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

// Attaches `reporting_head: { id, full_name }` to one or more user rows via a
// manual lookup, instead of an embedded Supabase FK-join (`users!fkey(...)`).
// The embedded-join syntax depends on knowing the exact auto-generated FK
// constraint name, which breaks silently ("Could not load employees") if it
// doesn't match — same class of issue we hit before with sites.js, fixed the
// same way there.
async function attachReportingHead(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  const headIds = [...new Set(list.map(u => u.reporting_head_id).filter(Boolean))];
  let headMap = {};
  if (headIds.length) {
    const { data: heads, error } = await supabase.from('users').select('id, full_name').in('id', headIds);
    if (error) throw error;
    (heads || []).forEach(h => { headMap[h.id] = h; });
  }
  const enriched = list.map(u => ({ ...u, reporting_head: headMap[u.reporting_head_id] || null }));
  return Array.isArray(rows) ? enriched : enriched[0];
}

// ----------------------------- list employees -----------------------------
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, department, designation, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, created_at, reporting_head_id, is_head, site_name, site_names, whatsapp_number')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(await attachReportingHead(data));
  } catch (err) {
    console.error('List employees error:', err.message);
    res.status(500).json({ error: 'Could not load employees' });
  }
});

// ----------------------------- add employee -----------------------------
router.post('/', async (req, res) => {
  try {
    const {
      full_name, department, designation, role, reporting_head_id,
      is_head, site_name, site_names, whatsapp_number, password: customPassword
    } = req.body || {};

    if (!full_name || !department || !designation || !role) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }
    if (!['admin', 'employee', 'head', 'client'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin, employee, head, or client' });
    }

    const username = await generateUniqueUsername(full_name);
    const password = customPassword && String(customPassword).trim()
      ? String(customPassword).trim()
      : generatePassword();
    const password_hash = await bcrypt.hash(password, 10);

    // Head = employee-level TaskFlow access + Office/Site toggle (is_head)
    // Client = portal login only (no is_head)
    const headFlag = role === 'head' ? true : !!is_head;
    const departmentFinal =
      role === 'client' && !(department || '').trim()
        ? 'Client'
        : department;

    const { data, error } = await supabase
      .from('users')
      .insert({
        username, password_hash, full_name, department: departmentFinal, designation, role, is_active: true,
        reporting_head_id: reporting_head_id || null,
        is_head: headFlag,
        site_name: site_name || null,
        site_names: site_names || null,
        whatsapp_number: whatsapp_number ? String(whatsapp_number).trim() : null
      })
      .select('id, username, full_name, department, designation, role, is_active, reporting_head_id, is_head, site_name, site_names, whatsapp_number')
      .single();

    if (error) throw error;
    const withHead = await attachReportingHead(data);

    // Plaintext password is only ever returned here, right after creation —
    // it is not retrievable again afterwards (only the hash is stored).
    res.status(201).json({ ...withHead, generated_password: password });
  } catch (err) {
    console.error('Add employee error:', err.message);
    res.status(500).json({ error: err.message || 'Could not add employee' });
  }
});

// ----------------------------- update employee (details, status) -----------------------------
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name, department, designation, role, is_active, can_verify,
      is_mis_executive, can_add_site, can_add_employee, reporting_head_id,
      is_head, site_name, site_names, whatsapp_number
    } = req.body || {};

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (department !== undefined) updates.department = department;
    if (designation !== undefined) updates.designation = designation;
    if (whatsapp_number !== undefined) {
      updates.whatsapp_number = whatsapp_number ? String(whatsapp_number).trim() : null;
    }
    if (role !== undefined) {
      if (!['admin', 'employee', 'head', 'client'].includes(role)) {
        return res.status(400).json({ error: 'Role must be admin, employee, head, or client' });
      }
      updates.role = role;
      // Keep is_head in sync with Head role unless explicitly overridden below
      if (is_head === undefined) {
        updates.is_head = role === 'head';
      }
      if (role === 'client' && department === undefined && updates.department === undefined) {
        updates.department = 'Client';
      }
    }
    if (is_head !== undefined) updates.is_head = !!is_head;
    if (site_name !== undefined) updates.site_name = site_name;
    if (site_names !== undefined) updates.site_names = site_names;
    if (is_active !== undefined) updates.is_active = is_active;
    if (can_verify !== undefined) updates.can_verify = can_verify;
    if (is_mis_executive !== undefined) updates.is_mis_executive = is_mis_executive;
    if (can_add_site !== undefined) updates.can_add_site = can_add_site;
    if (can_add_employee !== undefined) updates.can_add_employee = can_add_employee;
    // reporting_head_id is optional — '' / null clears it back to "no head / top level".
    // Can't be your own reporting head — guard against that here too (frontend already excludes it).
    if (reporting_head_id !== undefined) {
      if (reporting_head_id && String(reporting_head_id) === String(id)) {
        return res.status(400).json({ error: 'An employee cannot be their own reporting head' });
      }
      updates.reporting_head_id = reporting_head_id || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, username, full_name, department, designation, role, is_active, can_verify, is_mis_executive, can_add_site, can_add_employee, reporting_head_id')
      .single();

    if (error) throw error;
    res.json(await attachReportingHead(data));
  } catch (err) {
    console.error('Update employee error:', err.message);
    res.status(500).json({ error: err.message || 'Could not update employee' });
  }
});

// ----------------------------- reset password -----------------------------
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const password = generatePassword();
    const password_hash = await bcrypt.hash(password, 10);

    const { error } = await supabase.from('users').update({ password_hash }).eq('id', id);
    if (error) throw error;

    res.json({ generated_password: password });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

module.exports = router;
