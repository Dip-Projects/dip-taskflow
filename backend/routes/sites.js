const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createClientAccount } = require('../lib/createClientAccount');

const router = express.Router();
router.use(requireAuth);

const SITE_SELECT_BASE = `
  id, name, client_name, project_type, location, start_date, expected_end_date,
  status, description, created_at,
  team_leader_id, coordinator_id, site_incharge_id
`;
const SITE_SELECT = `${SITE_SELECT_BASE}, pc_id`;

function isMissingPcColumn(err) {
  return /pc_id/i.test(String(err?.message || err?.details || ''));
}

async function fetchProjects(order = true) {
  let q = supabase.from('projects').select(SITE_SELECT);
  if (order) q = q.order('created_at', { ascending: false });
  let { data, error } = await q;
  if (error && isMissingPcColumn(error)) {
    let retry = supabase.from('projects').select(SITE_SELECT_BASE);
    if (order) retry = retry.order('created_at', { ascending: false });
    ({ data, error } = await retry);
  }
  if (error) throw error;
  return data || [];
}

async function fetchProjectById(id) {
  let { data, error } = await supabase.from('projects').select(SITE_SELECT).eq('id', id).maybeSingle();
  if (error && isMissingPcColumn(error)) {
    ({ data, error } = await supabase.from('projects').select(SITE_SELECT_BASE).eq('id', id).maybeSingle());
  }
  if (error) throw error;
  return data;
}

async function withPeople(row) {
  if (!row) return row;
  const ids = [
    row.team_leader_id,
    row.coordinator_id,
    row.site_incharge_id,
    row.pc_id,
  ].filter(Boolean);
  const userMap = {};
  if (ids.length) {
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', ids);
    (users || []).forEach((u) => { userMap[u.id] = u; });
  }
  return {
    ...row,
    team_leader: userMap[row.team_leader_id] || null,
    coordinator: userMap[row.coordinator_id] || null,
    site_incharge: userMap[row.site_incharge_id] || null,
    pc: userMap[row.pc_id] || null,
  };
}

async function countLinked(table, column, id) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, id);
  if (error) return 0;
  return count || 0;
}

router.get('/', async (req, res) => {
  try {
    const data = await fetchProjects(true);
    const enriched = await Promise.all(data.map(withPeople));
    res.json(enriched);
  } catch (err) {
    console.error('List sites error:', err.message);
    res.status(500).json({ error: 'Could not load sites' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name, client_name, project_type, location,
      start_date, expected_end_date,
      team_leader_id, coordinator_id, site_incharge_id, pc_id,
      description
    } = req.body || {};

    if (!name || !client_name || !project_type || !location || !start_date ||
        !team_leader_id || !coordinator_id || !site_incharge_id || !pc_id) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    const payload = {
      name, client_name, project_type, location,
      start_date, expected_end_date: expected_end_date || null,
      team_leader_id, coordinator_id, site_incharge_id, pc_id,
      description: description || null,
      status: 'Planning'
    };

    let { data, error } = await supabase.from('projects').insert(payload).select(SITE_SELECT).single();
    if (error && isMissingPcColumn(error)) {
      const { pc_id: _drop, ...withoutPc } = payload;
      ({ data, error } = await supabase.from('projects').insert(withoutPc).select(SITE_SELECT_BASE).single());
    }
    if (error) {
      if (/projects_name_key|duplicate key|unique/i.test(error.message || '')) {
        return res.status(409).json({
          error: `Site name "${name}" already exists. Choose a different site name, or edit the existing site.`,
        });
      }
      throw error;
    }

    const siteRow = await withPeople(data);
    let clientLogin = null;
    try {
      const created = await createClientAccount({
        full_name: client_name,
        site_name: name,
        // Manage site people → client My Profile contacts
        head_id: team_leader_id,
        coordinator_id: coordinator_id,
        pc_id: pc_id,
      });
      clientLogin = {
        id: created.user.id,
        username: created.user.username,
        full_name: created.user.full_name,
        generated_password: created.generated_password,
        site_name: created.user.site_name,
      };
    } catch (clientErr) {
      console.error('Auto-create client for site failed:', clientErr.message);
    }

    res.status(201).json({
      ...siteRow,
      client_login: clientLogin,
    });
  } catch (err) {
    console.error('Add site error:', err.message);
    res.status(500).json({ error: err.message || 'Could not add site' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'name', 'client_name', 'project_type', 'location', 'start_date',
      'expected_end_date', 'team_leader_id', 'coordinator_id',
      'site_incharge_id', 'pc_id', 'description', 'status'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    let { data, error } = await supabase.from('projects').update(updates).eq('id', id).select(SITE_SELECT).single();
    if (error && isMissingPcColumn(error)) {
      const { pc_id: _drop, ...withoutPc } = updates;
      if (!Object.keys(withoutPc).length) {
        data = await fetchProjectById(id);
        error = null;
      } else {
        ({ data, error } = await supabase.from('projects').update(withoutPc).eq('id', id).select(SITE_SELECT_BASE).single());
      }
    }
    if (error) throw error;

    res.json(await withPeople(data));
  } catch (err) {
    console.error('Update site error:', err.message);
    res.status(500).json({ error: err.message || 'Could not update site' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const taskCount = await countLinked('tasks', 'project_id', id);
    if (taskCount > 0) {
      return res.status(409).json({
        error: `Cannot delete this site — ${taskCount} task(s) are still linked to it. Use Edit to update the site, or reassign those tasks first.`,
      });
    }

    const recCount = await countLinked('recurring_tasks', 'project_id', id);
    if (recCount > 0) {
      return res.status(409).json({
        error: `Cannot delete this site — ${recCount} recurring task(s) are still linked to it. Use Edit instead.`,
      });
    }

    const drawingCount = await countLinked('drawings', 'project_id', id);
    if (drawingCount > 0) {
      return res.status(409).json({
        error: `Cannot delete this site — ${drawingCount} drawing(s) are still linked to it. Use Edit instead.`,
      });
    }

    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      if (/foreign key|violates/i.test(error.message || '')) {
        return res.status(409).json({
          error: 'Cannot delete this site because other records still use it. Use Edit instead.',
        });
      }
      throw error;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete site error:', err.message);
    res.status(500).json({ error: err.message || 'Could not delete site' });
  }
});

module.exports = router;
