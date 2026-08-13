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
    m.includes('meeting_moms') ||
    m.includes('overdue_wa_log') ||
    m.includes('does not exist') ||
    m.includes('schema cache')
  );
}

function schemaHint() {
  return 'Run add_dip_bot.sql, add_chat_unread_meet.sql, and add_meeting_moms.sql in Supabase SQL Editor.';
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
  try {
    const { data: u } = await supabase
      .from('users')
      .select('whatsapp_number, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!u?.whatsapp_number) {
      console.warn('WA skip: no whatsapp_number for user', userId);
      return;
    }
    // Reuse existing approved template shape
    await sendWhatsAppTemplate(u.whatsapp_number, 'task_notification_v2', [
      u.full_name || 'Team member',
      String(templateParams.desc || 'DIP Bot alert').slice(0, 200),
      templateParams.project || 'DIP Projects',
      String(templateParams.date || new Date().toISOString().slice(0, 10)),
      templateParams.priority || 'Medium',
    ]);
  } catch (err) {
    // Never fail chat/task because WhatsApp failed
    console.warn('WA notify failed:', err.message || err);
  }
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

// ─── AI ask (admin only) ──────────────────────────────────────────────────────
router.post('/ask', requireAuth, requireAdmin, async (req, res) => {
  try {
    const question = String((req.body || {}).question || '').trim();
    if (!question) return res.status(400).json({ error: 'Type a question' });

    const result = await answerQuestion({ question, user: req.user, isAdmin: true });

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
    // DIP Bot panel: never show chat spam. Initiate → WhatsApp + Team chat unread.
    const filtered = (data || []).filter((a) => {
      const hint = String(a.link_hint || '');
      const title = String(a.title || '');
      if (hint === 'team-chat') return false;
      if (/^Chat\s*·/i.test(title)) return false;
      if (/^New chat$/i.test(title)) return false;
      if (/^Chat join$/i.test(title)) return false;
      if (/^Video call/i.test(title)) return false;
      return true;
    });
    res.json(filtered);
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
      .select('room_id, last_read_at, chat_rooms(id, kind, title, project_id, invite_code, created_at)')
      .eq('user_id', req.user.id);
    if (error) {
      if (isSchemaMissing(error)) return res.status(503).json({ error: schemaHint() });
      throw error;
    }

    const rooms = [];
    for (const m of memberships || []) {
      const room = m.chat_rooms;
      if (!room) continue;
      const lastRead = m.last_read_at || null;

      const { data: lastRows, error: lastErr } = await supabase
        .from('chat_messages')
        .select('id, body, created_at, sender_id, msg_type, meeting_url, is_bot')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1);
      let last_message = (!lastErr && lastRows && lastRows[0]) || null;
      if (lastErr) {
        const { data: fallback } = await supabase
          .from('chat_messages')
          .select('id, body, created_at, sender_id, is_bot')
          .eq('room_id', room.id)
          .order('created_at', { ascending: false })
          .limit(1);
        last_message = (fallback && fallback[0]) || null;
      }

      let unread_count = 0;
      let q = supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .neq('sender_id', req.user.id);
      if (lastRead) q = q.gt('created_at', lastRead);
      const { count } = await q;
      unread_count = count || 0;

      rooms.push({
        ...room,
        last_read_at: lastRead,
        last_message,
        unread_count,
        sort_at: last_message?.created_at || room.created_at,
      });
    }

    rooms.sort((a, b) => String(b.sort_at).localeCompare(String(a.sort_at)));
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/chats/unread-total', requireAuth, async (req, res) => {
  try {
    const { data: memberships, error } = await supabase
      .from('chat_room_members')
      .select('room_id, last_read_at')
      .eq('user_id', req.user.id);
    if (error) {
      if (isSchemaMissing(error)) return res.json({ total: 0 });
      throw error;
    }
    let total = 0;
    for (const m of memberships || []) {
      let q = supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', m.room_id)
        .neq('sender_id', req.user.id);
      if (m.last_read_at) q = q.gt('created_at', m.last_read_at);
      const { count } = await q;
      total += count || 0;
    }
    res.json({ total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/chats/:id/read', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.id;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('chat_room_members')
      .update({ last_read_at: now })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id);
    if (error) {
      if (isSchemaMissing(error)) return res.json({ ok: true });
      throw error;
    }
    res.json({ ok: true, last_read_at: now });
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

    // Only on chat initiate: WhatsApp + in-app alert for the peer (not for every later message)
    await notifyUserWa(peer.id, {
      desc: `${req.user.full_name} started a Team Chat with you. Open DIP TaskFlow → Chat.`,
      project: 'Team Chat',
      priority: 'High',
    });
    await pushAlert(
      peer.id,
      'New chat',
      `${req.user.full_name} started a chat with you — open Team chat.`,
      'team-chat'
    );

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
      .select('id, body, is_bot, created_at, sender_id, msg_type, meeting_url, sender:users!chat_messages_sender_id_fkey(id, full_name)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;

    // Mark read when opening thread (WhatsApp-style)
    await supabase
      .from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id);

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
      .insert({
        room_id: roomId,
        sender_id: req.user.id,
        body,
        is_bot: false,
        msg_type: 'text',
      })
      .select('id, body, is_bot, created_at, sender_id, msg_type, meeting_url')
      .single();
    if (error) throw error;

    // Sender is up to date; peers keep unread until they open
    await supabase
      .from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id);

    // No bot_alerts for chat messages — only unread badges (WhatsApp-style).
    // Each user only sees their own Team chat unread; admin is not flooded.

    res.status(201).json(data);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

// Start online video meeting (Jitsi) — stored in chat like WhatsApp
router.post('/chats/:id/meeting', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data: mem } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!mem) return res.status(403).json({ error: 'Not a member of this chat' });

    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id, title, project_id, kind')
      .eq('id', roomId)
      .maybeSingle();

    const slug = `DIPTaskFlow-${String(roomId).replace(/-/g, '').slice(0, 12)}-${Date.now().toString(36)}`;
    const meeting_url = `https://meet.jit.si/${slug}`;
    const body = `📹 Video meeting started by ${req.user.full_name}\nJoin: ${meeting_url}`;

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        sender_id: req.user.id,
        body,
        is_bot: false,
        msg_type: 'meeting',
        meeting_url,
      })
      .select('id, body, is_bot, created_at, sender_id, msg_type, meeting_url')
      .single();
    if (error) throw error;

    await supabase
      .from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', req.user.id);

    const { data: members } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId);
    const attendeeIds = (members || []).map((m) => m.user_id);

    // Create MoM draft so minutes can be filled after the call
    let mom = null;
    try {
      const { data: momRow } = await supabase
        .from('meeting_moms')
        .insert({
          chat_room_id: roomId,
          project_id: room?.project_id || null,
          meeting_url,
          title: `MoM · ${room?.title || 'Meeting'} · ${new Date().toISOString().slice(0, 10)}`,
          started_by: req.user.id,
          attendees: attendeeIds,
          mom_body:
            'Agenda:\n1. \n\nDiscussion:\n- \n\nDecisions:\n- \n\nAction items:\n- Owner — task — due date\n',
          status: 'draft',
        })
        .select('*')
        .single();
      mom = momRow;
    } catch (e) {
      console.warn('MoM create:', e.message);
    }

    // One WhatsApp per member when meeting starts (not for every chat message)
    for (const uid of attendeeIds) {
      if (String(uid) === String(req.user.id)) continue;
      await notifyUserWa(uid, {
        desc: `Video meeting started by ${req.user.full_name}. Open Chat → Join video, then check Meetings for MoM.`,
        project: room?.title || 'Meeting',
        priority: 'High',
      });
    }

    res.status(201).json({ message: data, meeting_url, mom });
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

router.post('/chats/:id/invite', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.id;
    const { data: mem } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (!mem) return res.status(403).json({ error: 'Not a member' });

    const { data: room } = await supabase.from('chat_rooms').select('*').eq('id', roomId).maybeSingle();
    if (!room) return res.status(404).json({ error: 'Chat not found' });

    let code = room.invite_code;
    if (!code || req.body?.regenerate) {
      code = crypto.randomBytes(6).toString('hex');
      const { data: updated, error } = await supabase
        .from('chat_rooms')
        .update({ invite_code: code })
        .eq('id', roomId)
        .select('*')
        .single();
      if (error) throw error;
      return res.json(updated);
    }
    res.json(room);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: schemaHint() });
    res.status(500).json({ error: err.message });
  }
});

// ─── Meetings / MoM ──────────────────────────────────────────────────────────
router.get('/meetings', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let q = supabase
      .from('meeting_moms')
      .select(
        '*, project:projects(id, name), starter:users!meeting_moms_started_by_fkey(id, full_name)'
      )
      .order('started_at', { ascending: false })
      .limit(200);
    const { data, error } = await q;
    if (error) {
      if (isSchemaMissing(error)) return res.json([]);
      throw error;
    }
    let list = data || [];
    if (!isAdmin) {
      list = list.filter((m) => {
        const attendees = Array.isArray(m.attendees) ? m.attendees.map(String) : [];
        return attendees.includes(String(req.user.id)) || String(m.started_by) === String(req.user.id);
      });
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/meetings/:id', requireAuth, async (req, res) => {
  try {
    const { title, mom_body, status } = req.body || {};
    const { data: existing, error: findErr } = await supabase
      .from('meeting_moms')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });

    const isAdmin = req.user.role === 'admin';
    const isStarter = String(existing.started_by) === String(req.user.id);
    if (!isAdmin && !isStarter) {
      return res.status(403).json({ error: 'Only starter or admin can edit MoM' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (mom_body !== undefined) updates.mom_body = mom_body;
    if (status !== undefined) {
      if (!['draft', 'final'].includes(status)) {
        return res.status(400).json({ error: 'status must be draft or final' });
      }
      updates.status = status;
    }

    const { data, error } = await supabase
      .from('meeting_moms')
      .update(updates)
      .eq('id', req.params.id)
      .select(
        '*, project:projects(id, name), starter:users!meeting_moms_started_by_fkey(id, full_name)'
      )
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    if (isSchemaMissing(err)) return res.status(503).json({ error: 'Run backend/sql/add_meeting_moms.sql' });
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

    const { data: already } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', room.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    await supabase
      .from('chat_room_members')
      .upsert({ room_id: room.id, user_id: req.user.id }, { onConflict: 'room_id,user_id' });

    // WhatsApp only on chat join (not on every message)
    if (!already) {
      const roomTitle = room.title || 'Team Chat';
      await notifyUserWa(req.user.id, {
        desc: `You joined chat: ${roomTitle}. Open DIP TaskFlow → Team chat.`,
        project: roomTitle,
        priority: 'Medium',
      });
      const { data: members } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', room.id);
      for (const m of members || []) {
        if (String(m.user_id) === String(req.user.id)) continue;
        await pushAlert(
          m.user_id,
          'Chat join',
          `${req.user.full_name} joined ${roomTitle}`,
          'team-chat'
        );
        await notifyUserWa(m.user_id, {
          desc: `${req.user.full_name} joined chat: ${roomTitle}`,
          project: roomTitle,
          priority: 'Medium',
        });
      }
    }

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

    // Put assignee into project discussion group + WA (site/office same)
    try {
      const crypto = require('crypto');
      let { data: room } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('kind', 'project')
        .eq('project_id', project_id)
        .maybeSingle();
      if (!room) {
        const invite = crypto.randomBytes(6).toString('hex');
        const { data: created } = await supabase
          .from('chat_rooms')
          .insert({
            kind: 'project',
            title: `${data.project?.name || 'Project'} discussion`,
            project_id,
            invite_code: invite,
            created_by: req.user.id,
          })
          .select('*')
          .single();
        room = created;
      }
      if (room) {
        await supabase
          .from('chat_room_members')
          .upsert({ room_id: room.id, user_id }, { onConflict: 'room_id,user_id' });
      }
    } catch (e) {
      console.warn('project chat assign:', e.message);
    }

    await notifyUserWa(user_id, {
      desc: `Added to ${data.project?.name || 'project'} group. Open Team chat for project group + individual chats.`,
      project: data.project?.name || 'Project',
      priority: 'High',
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
