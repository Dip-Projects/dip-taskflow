const crypto = require('crypto');
const supabase = require('./supabaseClient');
const { sendWhatsAppTemplate } = require('./whatsapp');

function isSchemaMissing(err) {
  const m = String(err?.message || err?.details || err?.hint || '').toLowerCase();
  const tables = ['chat_rooms', 'chat_room_members', 'chat_messages', 'project_members'];
  return tables.some(
    (t) =>
      m.includes(`could not find the table 'public.${t}'`) ||
      m.includes(`relation "${t}" does not exist`) ||
      m.includes(`relation "public.${t}" does not exist`)
  );
}

async function notifyUserWa(userId, templateParams) {
  try {
    const { data: u } = await supabase
      .from('users')
      .select('whatsapp_number, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!u?.whatsapp_number) return;
    await sendWhatsAppTemplate(u.whatsapp_number, 'task_notification_v2', [
      u.full_name || 'Team member',
      String(templateParams.desc || 'DIP Bot alert').slice(0, 200),
      templateParams.project || 'DIP Projects',
      String(templateParams.date || new Date().toISOString().slice(0, 10)),
      templateParams.priority || 'Medium',
    ]);
  } catch (err) {
    console.warn('WA notify failed:', err.message || err);
  }
}

/** Resolve project ids from site_name / site_names */
async function findProjectsForSites(siteName, siteNames) {
  const names = new Set();
  if (siteName && String(siteName).trim()) names.add(String(siteName).trim());
  let arr = siteNames;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch (_) {
      arr = [arr];
    }
  }
  if (Array.isArray(arr)) {
    arr.forEach((n) => {
      if (n && String(n).trim()) names.add(String(n).trim());
    });
  }
  if (!names.size) return [];

  const { data: projects } = await supabase.from('projects').select('id, name');
  const list = projects || [];
  const matched = [];
  for (const name of names) {
    const p = list.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
    if (p) matched.push(p);
  }
  return matched;
}

/**
 * When a site person is added / assigned: put them on project_members,
 * ensure project discussion room, add membership, optional WhatsApp.
 */
async function onboardUserToProjectChats(user, { notifyWa = true, assignedBy = null } = {}) {
  if (!user?.id) return { projects: [] };
  const projects = await findProjectsForSites(user.site_name, user.site_names);
  const results = [];

  for (const project of projects) {
    try {
      await supabase.from('project_members').upsert(
        {
          project_id: project.id,
          user_id: user.id,
          role_on_project: 'member',
          assigned_by: assignedBy || null,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,user_id' }
      );

      let { data: room } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('kind', 'project')
        .eq('project_id', project.id)
        .maybeSingle();

      if (!room) {
        const invite = crypto.randomBytes(6).toString('hex');
        const { data: created, error } = await supabase
          .from('chat_rooms')
          .insert({
            kind: 'project',
            title: `${project.name} discussion`,
            project_id: project.id,
            invite_code: invite,
            created_by: assignedBy || user.id,
          })
          .select('*')
          .single();
        if (error) throw error;
        room = created;
      }

      const { data: alreadyMem } = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', room.id)
        .eq('user_id', user.id)
        .maybeSingle();

      await supabase
        .from('chat_room_members')
        .upsert({ room_id: room.id, user_id: user.id }, { onConflict: 'room_id,user_id' });

      if (!alreadyMem) {
        await supabase.from('chat_messages').insert({
          room_id: room.id,
          sender_id: user.id,
          body: `${user.full_name || 'Member'} joined ${project.name} project group`,
          is_bot: true,
          msg_type: 'text',
        });
      }

      if (notifyWa && !alreadyMem) {
        await notifyUserWa(user.id, {
          desc: `You were added to ${project.name} project group. Open DIP TaskFlow → Team chat for group + individual chats.`,
          project: project.name,
          priority: 'High',
        });
      }

      results.push({ project, room });
    } catch (err) {
      if (!isSchemaMissing(err)) {
        console.warn('onboardUserToProjectChats:', err.message || err);
      }
    }
  }

  return { projects: results };
}

/** One group chat for everyone on the same site (site team). */
async function ensureSiteTeamRoom(user) {
  const siteName = String(user?.site_name || '').trim();
  if (!user?.id || !siteName) return null;
  const title = `${siteName} team group`;
  try {
    let { data: room } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('kind', 'team')
      .eq('title', title)
      .maybeSingle();
    if (!room) {
      const invite = crypto.randomBytes(6).toString('hex');
      const created = await supabase
        .from('chat_rooms')
        .insert({
          kind: 'team',
          title,
          invite_code: invite,
          created_by: user.id,
        })
        .select('*')
        .single();
      if (created.error) {
        const fallback = await supabase
          .from('chat_rooms')
          .insert({
            kind: 'project',
            title,
            invite_code: invite,
            created_by: user.id,
          })
          .select('*')
          .single();
        if (fallback.error) throw fallback.error;
        room = fallback.data;
      } else {
        room = created.data;
      }
    }
    const { data: siteUsers } = await supabase
      .from('users')
      .select('id')
      .eq('is_active', true)
      .eq('site_name', siteName);
    for (const u of siteUsers || []) {
      await supabase
        .from('chat_room_members')
        .upsert({ room_id: room.id, user_id: u.id }, { onConflict: 'room_id,user_id' });
    }
    return room;
  } catch (err) {
    if (!isSchemaMissing(err)) console.warn('ensureSiteTeamRoom:', err.message || err);
    return null;
  }
}

module.exports = {
  onboardUserToProjectChats,
  ensureSiteTeamRoom,
  findProjectsForSites,
  notifyUserWa,
  isSchemaMissing,
};
