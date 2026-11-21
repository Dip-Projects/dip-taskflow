const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { isSiteDefaultPerson } = require('../lib/siteDefaults');

const router = express.Router();
router.use(requireAuth);

const IST_MS = 5.5 * 60 * 60 * 1000;
const istDate = (d = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istDateOf = (iso) => (iso ? istDate(new Date(iso)) : null);

const lc = (v) => String(v || '').trim().toLowerCase();

// Admin, or anyone with users.can_view_team_overview switched on (set by MIS/admin).
async function requireOverviewAccess(req, res, next) {
  try {
    if (req.user?.role === 'admin') return next();
    if (isSiteDefaultPerson(req.user)) return next();
    const { data, error } = await supabase
      .from('users')
      .select('full_name, username, can_view_team_overview')
      .eq('id', req.user.id)
      .maybeSingle();
    if (!error && (data?.can_view_team_overview || isSiteDefaultPerson(data))) return next();
  } catch (err) {
    console.error('Team overview access check failed:', err.message);
  }
  return res.status(403).json({ error: 'You do not have access to Team Overview.' });
}

function siteListOf(u) {
  const out = [];
  const add = (s) => { const v = String(s || '').trim(); if (v && !out.includes(v)) out.push(v); };
  add(u.site_name);
  if (Array.isArray(u.site_names)) u.site_names.forEach(add);
  else if (typeof u.site_names === 'string' && u.site_names.trim()) {
    try { const p = JSON.parse(u.site_names); if (Array.isArray(p)) p.forEach(add); else add(u.site_names); }
    catch { add(u.site_names); }
  }
  return out;
}

// Optional tables/columns must never take the whole page down.
async function safeRows(query) {
  try {
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch { return []; }
}

// GET /api/team-overview?scope=all|direct
router.get('/', requireOverviewAccess, async (req, res) => {
  try {
    const asked = String(req.query.date || '');
    const today = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= istDate() ? asked : istDate();
    const utcToday = today === istDate() ? new Date().toISOString().slice(0, 10) : today;
    const scope = req.query.scope === 'direct' ? 'direct' : 'all';

    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, username, full_name, department, designation, role, is_active, reporting_head_id, site_name, site_names');
    if (uErr) throw uErr;

    const active = (users || []).filter((u) => u.is_active !== false && lc(u.role) !== 'client' && lc(u.department) !== 'client');
    const me = req.user.id;

    // Who is "under" me: reporting_head_id chain (direct reports, or whole tree)
    let team;
    if (req.user.role === 'admin' && !(users || []).some((u) => u.reporting_head_id === me)) {
      team = active.filter((u) => u.id !== me); // admin with no direct tree → everyone
    } else {
      const kids = new Map();
      active.forEach((u) => {
        if (!u.reporting_head_id) return;
        if (!kids.has(u.reporting_head_id)) kids.set(u.reporting_head_id, []);
        kids.get(u.reporting_head_id).push(u);
      });
      team = [];
      const seen = new Set([me]);
      let frontier = [me];
      while (frontier.length) {
        const next = [];
        for (const id of frontier) {
          for (const k of kids.get(id) || []) {
            if (seen.has(k.id)) continue;
            seen.add(k.id);
            team.push(k);
            next.push(k.id);
          }
        }
        frontier = scope === 'direct' ? [] : next;
      }
    }

    const names = team.map((u) => u.username).filter(Boolean);
    const ids = team.map((u) => u.id);

    const [attRows, qrRows, siteLeaves, officeLeaves] = await Promise.all([
      names.length
        ? safeRows(supabase.from('attendance')
            .select('user_name, date, clock_in, clock_out, clock_in_location, clock_in_status')
            .in('date', [...new Set([today, utcToday])]).in('user_name', names))
        : [],
      names.length
        ? safeRows(supabase.from('qr_site_attendance')
            .select('employee_username, employee_site_name, attendance_status, scanned_at')
            .eq('scan_date', today).in('employee_username', names))
        : [],
      names.length
        ? safeRows(supabase.from('site_leaves')
            .select('user_name, leave_type, from_date, to_date, level_approved, head_approved')
            .lte('from_date', today).gte('to_date', today).in('user_name', names))
        : [],
      ids.length
        ? safeRows(supabase.from('leaves')
            .select('user_id, from_date, to_date, status')
            .lte('from_date', today).gte('to_date', today).eq('status', 'Approved').in('user_id', ids))
        : [],
    ]);

    const attBy = new Map();
    attRows.forEach((r) => {
      if (istDateOf(r.clock_in) !== today && r.date !== today) return; // only today (IST)
      attBy.set(lc(r.user_name), r);
    });
    const qrBy = new Map(qrRows.map((r) => [lc(r.employee_username), r]));
    const leaveNames = new Set(
      siteLeaves
        .filter((l) => l.level_approved === true && l.head_approved === true)
        .map((l) => lc(l.user_name))
    );
    const leaveIds = new Set(officeLeaves.map((l) => l.user_id));

    const members = team.map((u) => {
      const att = attBy.get(lc(u.username));
      const qr = qrBy.get(lc(u.username));
      const present = !!(att?.clock_in) || lc(qr?.attendance_status) === 'present';
      const onLeave = !present && (leaveNames.has(lc(u.username)) || leaveIds.has(u.id));
      const assigned = siteListOf(u);
      const qrSite = qr?.employee_site_name ? String(qr.employee_site_name).trim() : '';
      const loc = String(att?.clock_in_location || '');
      const coords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(loc) ? loc.replace(/\s/g, '') : '';
      return {
        id: u.id,
        name: u.full_name,
        username: u.username,
        department: u.department || '',
        designation: u.designation || '',
        status: present ? 'present' : onLeave ? 'leave' : 'absent',
        site: qrSite || assigned[0] || '',
        site_source: qrSite ? 'qr' : assigned.length ? 'assigned' : '',
        assigned_sites: assigned,
        clock_in: att?.clock_in || qr?.scanned_at || null,
        clock_out: att?.clock_out || null,
        clock_in_status: att?.clock_in_status || '',
        hours: att?.clock_in
          ? Math.max(0, Math.round((((att.clock_out ? new Date(att.clock_out) : new Date()) - new Date(att.clock_in)) / 3600000) * 10) / 10)
          : null,
        still_in: !!(att?.clock_in && !att?.clock_out),
        map_url: coords ? `https://www.google.com/maps?q=${coords}` : '',
      };
    });

    const order = { absent: 0, leave: 1, present: 2 };
    members.sort((a, b) => order[a.status] - order[b.status] || String(a.name).localeCompare(String(b.name)));

    const bySite = new Map();
    members.forEach((m) => {
      const key = m.site || 'No site assigned';
      if (!bySite.has(key)) bySite.set(key, { site: key, total: 0, present: 0, leave: 0, absent: 0 });
      const row = bySite.get(key);
      row.total += 1;
      row[m.status] += 1;
    });

    res.json({
      date: today,
      scope,
      summary: {
        total: members.length,
        present: members.filter((m) => m.status === 'present').length,
        leave: members.filter((m) => m.status === 'leave').length,
        absent: members.filter((m) => m.status === 'absent').length,
        late: members.filter((m) => m.status === 'present' && m.clock_in_status === 'late').length,
      },
      sites: [...bySite.values()].sort((a, b) => b.total - a.total),
      members,
    });
  } catch (err) {
    console.error('Team overview error:', err.message);
    res.status(500).json({ error: err.message || 'Could not load team overview' });
  }
});

module.exports = router;
