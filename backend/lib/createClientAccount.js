const bcrypt = require('bcryptjs');
const supabase = require('./supabaseClient');

function slugifyName(full_name) {
  const parts = String(full_name || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const first = (parts[0] || 'client').replace(/[^a-z0-9]/g, '') || 'client';
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return lastInitial ? `${first}.${lastInitial}` : first;
}

async function generateUniqueUsername(full_name) {
  const base = slugifyName(full_name);
  let candidate = base;
  let suffix = 1;
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

async function loadUserMap(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  const map = {};
  if (!list.length) return map;
  const { data } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, designation, role')
    .in('id', list);
  (data || []).forEach((u) => { map[u.id] = u; });
  return map;
}

async function contactsFromPeopleIds({ head_id, coordinator_id, pc_id }) {
  const map = await loadUserMap([head_id, coordinator_id, pc_id]);
  const pick = (id) => {
    const u = map[id];
    if (!u) return { name: null, phone: null };
    return { name: u.full_name || null, phone: u.whatsapp_number || null };
  };
  const head = pick(head_id);
  const coord = pick(coordinator_id);
  const pc = pick(pc_id);
  return {
    head_id: head_id || null,
    coordinator_id: coordinator_id || null,
    pc_id: pc_id || null,
    head_name: head.name,
    head_contact_no: head.phone,
    incharge_name: coord.name,
    incharge_contact_no: coord.phone,
    pc_name: pc.name,
    pc_contact_no: pc.phone,
  };
}

async function upsertSiteContacts(siteName, clientName, contacts) {
  if (!siteName) return;
  const payload = {
    site_name: siteName,
    client_name: clientName || null,
    head_name: contacts.head_name || null,
    head_contact_no: contacts.head_contact_no || null,
    incharge_name: contacts.incharge_name || null,
    incharge_contact_no: contacts.incharge_contact_no || null,
    pc_name: contacts.pc_name || null,
    pc_contact_no: contacts.pc_contact_no || null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('site_details')
    .select('id')
    .ilike('site_name', siteName)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('site_details').update(payload).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('site_details').insert(payload);
    if (error) throw error;
  }
}

/**
 * Create client login + save Head/Coordinator/PC on site_details.
 * Returns { user, generated_password, site_contacts }.
 */
async function createClientAccount({
  full_name,
  site_name,
  head_id,
  coordinator_id,
  pc_id,
}) {
  const clientName = String(full_name || '').trim();
  const site = String(site_name || '').trim();
  if (!clientName) throw new Error('Client name is required');
  if (!site) throw new Error('Please select the project / site');
  if (!head_id || !coordinator_id || !pc_id) {
    throw new Error('Please select Head, Coordinator and PC');
  }

  const contacts = await contactsFromPeopleIds({ head_id, coordinator_id, pc_id });
  const username = await generateUniqueUsername(clientName);
  const password = generatePassword();
  const password_hash = await bcrypt.hash(password, 10);

  let insertRole = 'client';
  let { data, error } = await supabase
    .from('users')
    .insert({
      username,
      password_hash,
      full_name: clientName,
      department: 'Client',
      designation: 'Client',
      role: insertRole,
      is_active: true,
      is_head: false,
      site_name: site,
      site_names: [site],
    })
    .select('id, username, full_name, department, designation, role, is_active, site_name, site_names')
    .single();

  if (error && /users_role_check|role/i.test(error.message || '')) {
    insertRole = 'employee';
    ({ data, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash,
        full_name: clientName,
        department: 'Client',
        designation: 'Client',
        role: insertRole,
        is_active: true,
        is_head: false,
        site_name: site,
        site_names: [site],
      })
      .select('id, username, full_name, department, designation, role, is_active, site_name, site_names')
      .single());
  }
  if (error) throw error;

  await upsertSiteContacts(site, clientName, contacts);

  return {
    user: data,
    generated_password: password,
    site_contacts: contacts,
  };
}

module.exports = {
  createClientAccount,
  contactsFromPeopleIds,
  upsertSiteContacts,
  generateUniqueUsername,
  generatePassword,
};
