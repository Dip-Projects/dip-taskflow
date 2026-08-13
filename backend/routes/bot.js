const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendWhatsAppTemplate } = require('../lib/whatsapp');
const {
  answerQuestion,
  listOverdueTasksForWa,
  startOfToday,
} = require('../lib/botData');

const router = express.Router();

function isSchemaMissing(err) {
  const m = String(err?.message || err?.details || '').toLowerCase();
  return (
    m.includes('chat_rooms') ||
    m.includes('chat_messages') ||
    m.includes('bot_qa') ||
    m.includes('bot_alerts') ||
    m.includes('project_members') ||
    m.includes('overdue_wa_log') ||
    m.includes('does not exist') ||
    m.includes('schema cache')
  );
}

function schemaHint() {
  return 'Run backend/sql/add_dip_bot.sql in Supabase SQL Editor first.';
}

async function pushAlert(userId, title, body, linkHint) {
  const { error } = await supabase.from('bot_alerts').insert({
    user_id: userId,
    title,
    body,
    link_hint: linkHint || null,
  });
  if (error && !isSchemaMissing(error)) console.warn('bot alert:', error.message);
}

async function notifyUserWa(userId, templateParams) {
  const { data: u } = await supabase
    .from('users')
    .select('whatsapp_number, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (!u?.whatsapp_number) return;
  // Reuse existing approved template shape
  await sendWhatsAppTemplate(u.whatsapp_number, 'task_notification_v2', [
    u.full_name || 'Team member',
    String(templateParams.desc || 'DIP Bot alert').slice(0, 200),
    templateParams.project || 'DIP Projects',
    String(templateParams.date || new Date().toISOString().slice(0, 10)),
    templateParams.priority || 'Medium',
  ]);
}

async function notifyAdmins(title, body) {
  const { data: admins } = await supabase
    .from('users')
    .select('id, whatsapp_number, full_name')
    .eq('role', 'admin')
    .eq('is_active', true);
  for (const a of admins || []) {
    await pushAlert(a.id, title, body, 'ai-bot');
    if (a.whatsapp_number) {
      await sendWhatsAppTemplate(a.whatsapp_number, 'task_notification_v2', [
        a.full_name || 'Admin',
        String(body).slice(0, 200),
        'DIP Bot',
        new Date().toISOString().slice(0, 10),
        'High',
      ]);
    }
  }
}

// ─── AI ask ───────────────────────────────────────────────────────────────────
router.post('/ask', requireAuth, async (req, res) => {
  try {
    const question = String((req.body || {}).question || '').trim();
    if (!question) return res.status(400).json({ error: 'Type a question' });

    const isAdmin = req.user.role === 'admin';
    const result = await answerQuestion({ question, user: req.user, isAdmin });

    // Employees asking company-wide → notify admin
    const wantsCompany = /\b(company|sab|all|overall|team|kitne log|everyone|total|mis|report)\b/i.test(question);
    if (!isAdmin && (result.adminOnly || wantsCompany)) {
      await notifyAdmins(
        `Bot Q from ${req.user.full_name}`,
        `Q: ${question}\n(Employee asked company info — shown limited answer.)`
      );
    }

    try {
      await supabase.from('bot_qa').insert({
        user_id: req.user.id,
        question,
        answer: result.answer,
        is_admin_only_data: !!result.adminOnly,
      });
    } catch (_) {
      /* optional table */
    }

    res.json(result);
  } catch (err) {
    console.error('Bot ask error:', err.message);
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message || 'Bot could not answer' });
  }
});

router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bot_alerts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      if (isSchemaMissing(error)) return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/alerts/:id/read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('bot_alerts')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

// ─── Team chat (employees ↔ employees; admin can message anyone) ─────────────
router.get('/chats', requireAuth, async (req, res) => {
  try {
    const { data: memberships, error } = await supabase
      .from('chat_room_members')
      .select('room_id, chat_rooms(id, kind, title, project_id, invite_code, created_at)')
      .eq('user_id', req.user.id);
    if (error) {
      if (isSchemaMissing(error)) return res.json([]);
      throw error;
    }
    const rooms = (memberships || [])
      .map((m) => m.chat_rooms)
      .filter(Boolean)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chats/dm', requireAuth, async (req, res) => {
  try {
    const peerId = (req.body || {}).user_id;
    if (!peerId) return res.status(400).json({ error: 'Pick a colleague' });
    if (String(peerId) === String(req.user.id)) {
      return res.status(400).json({ error: 'Cannot chat with yourself' });
    }

    // Find existing DM with both members
    const { data: myRooms } = await supabase
      .from('chat_room_members')
      .select('room_id, chat_rooms!inner(id, kind)')
      .eq('user_id', req.user.id);
    for (const row of myRooms || []) {
      if (row.chat_rooms?.kind !== 'dm') continue;
      const { data: peers } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', row.room_id);
      const ids = (peers || []).map((p) => String(p.user_id));
      if (ids.length === 2 && ids.includes(String(peerId))) {
        return res.json({ id: row.room_id, kind: 'dm' });
      }
    }

    const { data: peer } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('id', peerId)
      .maybeSingle();
    if (!peer) return res.status(404).json({ error: 'User not found' });

    // Non-admins: only peer employees (not company data dump — just chat)
    const { data: room, error: rErr } = await supabase
      .from('chat_rooms')
      .insert({
        kind: 'dm',
        title: `${req.user.full_name} ↔ ${peer.full_name}`,
        created_by: req.user.id,
      })
      .select('*')
      .single();
    if (rErr) throw rErr;

    await supabase.from('chat_room_members').insert([
      { room_id: room.id, user_id: req.user.id },
      { room_id: room.id, user_id: peer.id },
    ]);

    await pushAlert(peer.id, 'New chat', `${req.user.full_name} started a chat with you`, 'team-chat');
    await notifyUserWa(peer.id, {
      desc: `${req.user.full_name} messaged you on DIP Bot chat`,
      project: 'Team Chat',
      priority: 'Medium',
    });

    res.status(201).json(room);
  } catch (err) {
    console.error('DM create error:', err.message);
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

router.get('/chats/:id/messages', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data: mem } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!mem) return res.status(403).json({ error: 'Not a member of this chat' });

    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, body, is_bot, created_at, sender_id, sender:users!chat_messages_sender_id_fkey(id, full_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

router.post('/chats/:id/messages', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.id;
    const body = String((req.body || {}).body || '').trim();
    if (!body) return res.status(400).json({ error: 'Empty message' });

    const { data: mem } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!mem) return res.status(403).json({ error: 'Not a member of this chat' });

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ room_id: roomId, sender_id: req.user.id, body, is_bot: false })
      .select('id, body, is_bot, created_at, sender_id')
      .single();
    if (error) throw error;

    // Notify other members (WA + alert)
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId);
    for (const m of members || []) {
      if (String(m.user_id) === String(req.user.id)) continue;
      await pushAlert(m.user_id, `Chat · ${req.user.full_name}`, body.slice(0, 180), 'team-chat');
      await notifyUserWa(m.user_id, {
        desc: `${req.user.full_name}: ${body.slice(0, 120)}`,
        project: 'DIP Chat',
        priority: 'Medium',
      });
    }

    res.status(201).json(data);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

// ─── Project discussion rooms (in-app “WhatsApp group” + invite link) ────────
router.post('/projects/:projectId/discussion', requireAuth, async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let { data: existing } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('kind', 'project')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!existing) {
      const invite = crypto.randomBytes(6).toString('hex');
      const { data: room, error } = await supabase
        .from('chat_rooms')
        .insert({
          kind: 'project',
          title: `${project.name} discussion`,
          project_id: projectId,
          invite_code: invite,
          created_by: req.user.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      existing = room;
    }

    // Ensure creator is member
    await supabase
      .from('chat_room_members')
      .upsert({ room_id: existing.id, user_id: req.user.id }, { onConflict: 'room_id,user_id' });

    // Add all project_members
    const { data: pms } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);
    for (const pm of pms || []) {
      await supabase
        .from('chat_room_members')
        .upsert({ room_id: existing.id, user_id: pm.user_id }, { onConflict: 'room_id,user_id' });
      if (String(pm.user_id) !== String(req.user.id)) {
        await pushAlert(
          pm.user_id,
          `${project.name} discussion`,
          `${req.user.full_name} started / opened project chat. Open Team Chat → project room.`,
          'team-chat'
        );
        await notifyUserWa(pm.user_id, {
          desc: `${project.name} discussion started — open DIP TaskFlow Team Chat`,
          project: project.name,
          priority: 'High',
        });
      }
    }

    const invitePath = `/app?joinChat=${existing.invite_code}`;
    res.json({ ...existing, invite_path: invitePath });
  } catch (err) {
    console.error('Project discussion error:', err.message);
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

router.post('/chats/join', requireAuth, async (req, res) => {
  try {
    const code = String((req.body || {}).invite_code || '').trim();
    if (!code) return res.status(400).json({ error: 'Invite code required' });
    const { data: room, error } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('invite_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!room) return res.status(404).json({ error: 'Invalid invite' });
    await supabase
      .from('chat_room_members')
      .upsert({ room_id: room.id, user_id: req.user.id }, { onConflict: 'room_id,user_id' });
    res.json(room);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

// ─── Project membership management ───────────────────────────────────────────
router.get('/management/projects', requireAuth, async (req, res) => {
  try {
    const { data: projects, error } = await supabase.from('projects').select('id, name').order('name');
    if (error) throw error;
    const { data: members, error: mErr } = await supabase
      .from('project_members')
      .select('id, project_id, user_id, role_on_project, user:users(id, full_name, department)');
    if (mErr) {
      if (isSchemaMissing(mErr)) {
        return res.json({ projects: projects || [], members: [], hint: schemaHint() });
      }
      throw mErr;
    }
    res.json({ projects: projects || [], members: members || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/management/assign', requireAdmin, async (req, res) => {
  try {
    const { project_id, user_id, role_on_project } = req.body || {};
    if (!project_id || !user_id) {
      return res.status(400).json({ error: 'project_id and user_id required' });
    }
    const { data, error } = await supabase
      .from('project_members')
      .upsert(
        {
          project_id,
          user_id,
          role_on_project: role_on_project || 'member',
          assigned_by: req.user.id,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,user_id' }
      )
      .select('*, user:users(id, full_name), project:projects(id, name)')
      .single();
    if (error) throw error;

    await pushAlert(
      user_id,
      'Project assignment',
      `You were assigned to ${data.project?.name || 'a project'}`,
      'project-mgmt'
    );
    await notifyUserWa(user_id, {
      desc: `Assigned to project ${data.project?.name || ''}`,
      project: data.project?.name || 'Project',
      priority: 'Medium',
    });

    res.json(data);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

router.post('/management/shift', requireAdmin, async (req, res) => {
  try {
    const { user_id, from_project_id, to_project_id } = req.body || {};
    if (!user_id || !to_project_id) {
      return res.status(400).json({ error: 'user_id and to_project_id required' });
    }
    if (from_project_id) {
      await supabase
        .from('project_members')
        .delete()
        .eq('user_id', user_id)
        .eq('project_id', from_project_id);
    }
    const { data, error } = await supabase
      .from('project_members')
      .upsert(
        {
          project_id: to_project_id,
          user_id,
          assigned_by: req.user.id,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,user_id' }
      )
      .select('*, user:users(full_name), project:projects(name)')
      .single();
    if (error) throw error;

    await notifyUserWa(user_id, {
      desc: `Shifted to project ${data.project?.name || ''}`,
      project: data.project?.name || 'Project',
      priority: 'High',
    });
    res.json(data);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/management/assign', requireAdmin, async (req, res) => {
  try {
    const { project_id, user_id } = req.body || {};
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', project_id)
      .eq('user_id', user_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Directory for starting DMs
router.get('/directory', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, department, role, designation')
      .eq('is_active', true)
      .neq('id', req.user.id)
      .order('full_name');
    if (error) throw error;
    // Employees see other employees/heads (not clients); admin sees all
    const list = (data || []).filter((u) => {
      if (req.user.role === 'admin') return u.role !== 'client';
      return u.role === 'employee' || u.role === 'head' || u.role === 'admin';
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Called from tasks route when verification is sent — keep export for reuse.
 */
async function notifyVerifierBot(verifierId, taskDesc, projectName) {
  await pushAlert(
    verifierId,
    'Verification request',
    `Please verify: ${String(taskDesc || 'Task').slice(0, 160)} (${projectName || '—'})`,
    'verifications'
  );
  await notifyUserWa(verifierId, {
    desc: `Verification pending: ${String(taskDesc || 'Task').slice(0, 120)}`,
    project: projectName || 'TaskFlow',
    priority: 'High',
  });
}

// ─── Overdue WhatsApp cron ───────────────────────────────────────────────────
async function runOverdueWhatsApp() {
  const day = startOfToday().toISOString().slice(0, 10);
  const overdue = await listOverdueTasksForWa();
  let sent = 0;
  for (const t of overdue) {
    const wa = t.assignee?.whatsapp_number;
    if (!wa) continue;
    const { data: already } = await supabase
      .from('overdue_wa_log')
      .select('task_id')
      .eq('task_id', t.id)
      .eq('alert_day', day)
      .maybeSingle();
    if (already) continue;

    await sendWhatsAppTemplate(wa, 'task_notification_v2', [
      t.assignee?.full_name || 'Team member',
      `OVERDUE: ${String(t.description || 'Task').slice(0, 180)}`,
      t.project?.name || '—',
      String(t.target_date || '').slice(0, 10),
      t.priority || 'High',
    ]);
    await pushAlert(
      t.assigned_to,
      'Task overdue',
      `${String(t.description || 'Task').slice(0, 120)} was due ${String(t.target_date || '').slice(0, 10)}`,
      'overdue'
    );
    await supabase.from('overdue_wa_log').upsert({ task_id: t.id, alert_day: day });
    sent += 1;
  }
  return { checked: overdue.length, sent, day };
}

router.post('/cron/overdue-whatsapp', handleOverdueCron);
router.get('/cron/overdue-whatsapp', handleOverdueCron);

async function handleOverdueCron(req, res) {
  try {
    const secret = process.env.CRON_SECRET || '';
    const hdr = req.headers['authorization'] || '';
    const ok =
      (secret && hdr === `Bearer ${secret}`) ||
      (secret && req.query.secret === secret) ||
      (!secret && process.env.VERCEL !== '1');
    if (!ok) return res.status(401).json({ error: 'Unauthorized cron' });
    const result = await runOverdueWhatsApp();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Overdue WA cron:', err.message);
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
}

module.exports = router;
module.exports.notifyVerifierBot = notifyVerifierBot;
module.exports.runOverdueWhatsApp = runOverdueWhatsApp;
