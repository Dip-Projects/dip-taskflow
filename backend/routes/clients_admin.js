const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  createClientAccount,
  contactsFromPeopleIds,
  upsertSiteContacts,
} = require('../lib/createClientAccount');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

function isClientRow(u) {
  const role = String(u.role || '').toLowerCase();
  const dept = String(u.department || '').toLowerCase();
  return role === 'client' || dept === 'client';
}

async function loadSiteDetailsForSites(siteNames) {
  const byKey = {};
  if (!(siteNames || []).length) return byKey;
  const { data } = await supabase
    .from('site_details')
    .select('site_name, client_name, head_name, head_contact_no, incharge_name, incharge_contact_no, pc_name, pc_contact_no');
  (data || []).forEach((row) => {
    const key = String(row.site_name || '').trim().toLowerCase();
    if (key) byKey[key] = row;
  });
  return byKey;
}

function matchSiteDetails(byKey, siteName) {
  const key = String(siteName || '').trim().toLowerCase();
  if (!key) return null;
  if (byKey[key]) return byKey[key];
  const hit = Object.entries(byKey).find(([k]) => k.includes(key) || key.includes(k));
  return hit ? hit[1] : null;
}

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, department, designation, role, is_active, site_name, site_names, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const clients = (data || []).filter(isClientRow);
    const detailsBySite = await loadSiteDetailsForSites(clients.map((c) => c.site_name));
    res.json(clients.map((c) => ({
      ...c,
      site_contacts: matchSiteDetails(detailsBySite, c.site_name),
    })));
  } catch (err) {
    console.error('List clients error:', err.message);
    res.status(500).json({ error: 'Could not load clients' });
  }
});

router.get('/site-contacts', async (req, res) => {
  try {
    const site = String(req.query.site || '').trim();
    if (!site) return res.json(null);
    const { data } = await supabase
      .from('site_details')
      .select('site_name, client_name, head_name, head_contact_no, incharge_name, incharge_contact_no, pc_name, pc_contact_no')
      .ilike('site_name', site)
      .maybeSingle();
    res.json(data || null);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load contacts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await createClientAccount(req.body || {});
    res.status(201).json({
      ...created.user,
      site_contacts: created.site_contacts,
      generated_password: created.generated_password,
    });
  } catch (err) {
    console.error('Add client error:', err.message);
    res.status(500).json({ error: err.message || 'Could not add client' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name, site_name, is_active,
      head_id, coordinator_id, pc_id,
    } = req.body || {};

    const { data: existing, error: exErr } = await supabase
      .from('users')
      .select('id, username, full_name, department, designation, role, is_active, site_name, site_names')
      .eq('id', id)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing || !isClientRow(existing)) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const updates = {};
    if (full_name !== undefined) updates.full_name = String(full_name).trim();
    if (is_active !== undefined) updates.is_active = !!is_active;
    if (site_name !== undefined) {
      const site = String(site_name || '').trim();
      if (!site) return res.status(400).json({ error: 'Please select the project / site' });
      updates.site_name = site;
      updates.site_names = [site];
    }
    if (full_name !== undefined || site_name !== undefined) {
      updates.department = 'Client';
      updates.designation = existing.designation || 'Client';
    }

    let data = existing;
    if (Object.keys(updates).length) {
      const { data: updated, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', id)
        .select('id, username, full_name, department, designation, role, is_active, site_name, site_names')
        .single();
      if (error) throw error;
      data = updated;
    }

    const site = data.site_name;
    const touchingPeople = head_id !== undefined || coordinator_id !== undefined || pc_id !== undefined;
    if (touchingPeople) {
      if (!head_id || !coordinator_id || !pc_id) {
        return res.status(400).json({ error: 'Please select Head, Coordinator and PC' });
      }
      const contacts = await contactsFromPeopleIds({ head_id, coordinator_id, pc_id });
      await upsertSiteContacts(site, data.full_name, contacts);
      return res.json({ ...data, site_contacts: contacts });
    }

    if (full_name !== undefined || site_name !== undefined) {
      const detailsBySite = await loadSiteDetailsForSites([site]);
      const prev = matchSiteDetails(detailsBySite, site) || {};
      await upsertSiteContacts(site, data.full_name, {
        head_name: prev.head_name,
        head_contact_no: prev.head_contact_no,
        incharge_name: prev.incharge_name,
        incharge_contact_no: prev.incharge_contact_no,
        pc_name: prev.pc_name,
        pc_contact_no: prev.pc_contact_no,
      });
    }

    res.json(data);
  } catch (err) {
    console.error('Update client error:', err.message);
    res.status(500).json({ error: err.message || 'Could not update client' });
  }
});

module.exports = router;
