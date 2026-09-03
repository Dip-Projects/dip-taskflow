import { fromMaybe } from '../../lib/supabase';

export const MONTHLY_LEAVE_QUOTA = 4;

/** Low → high. Leave of a role is approved by the next filled level on that site plus the site Head. */
export const ROLE_LEVELS = [
  "Jr Site Engineer",
  "Site Engineer",
  "Site Incharge",
  "Site Coordinator",
  "Project Head",
];

export const ROLE_DISPLAY = {
  "Jr Site Engineer": "Jr Site Engineer",
  "Site Engineer": "Engineer",
  "Site Incharge": "Incharge",
  "Site Coordinator": "Co-ordinator",
  "Project Head": "Head",
};

const ROLE_RANK_EXACT = {
  "jr site engineer": 0,
  "jr. site engineer": 0,
  "junior site engineer": 0,
  "jr engineer": 0,
  "jr. engineer": 0,
  "junior engineer": 0,
  "site engineer": 1,
  engineer: 1,
  "site incharge": 2,
  incharge: 2,
  "in-charge": 2,
  "site coordinator": 3,
  "site co-ordinator": 3,
  coordinator: 3,
  "co-ordinator": 3,
  "co ordinator": 3,
  "project head": 4,
  "site head": 4,
  head: 4,
  "team leader": 4,
};

const SITE_USER_COLS = "id, username, name, role, site_name, site_names, is_head, status";

export function normRole(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** 0 Jr Engineer … 4 Head. -1 if not a site ladder role. */
export function siteRoleRank(role) {
  const n = normRole(role);
  if (!n) return -1;
  if (ROLE_RANK_EXACT[n] != null) return ROLE_RANK_EXACT[n];
  if (/(jr\.?|junior)/.test(n) && /engineer/.test(n)) return 0;
  if (/in-?charge/.test(n)) return 2;
  if (/co-?ordinator/.test(n)) return 3;
  if (/\b(project head|site head|team leader)\b/.test(n) || n === "head") return 4;
  if (/engineer/.test(n)) return 1;
  return -1;
}

export function isMonthlyLeaveRole(user) {
  const role = typeof user === "string" ? user : user?.role || user?.designation || "";
  const rank = siteRoleRank(role);
  return rank >= 0 && rank <= 3;
}

export function canApproveSiteLeave(user) {
  if (!user) return false;
  const rank = siteRoleRank(user.role || user.designation || user.site_role);
  return rank >= 1;
}

function isLeaveApproved(l) {
  if (l.level_approved === false || l.head_approved === false) return false;
  return l.level_approved === true && l.head_approved === true;
}

function splitLeaveDaysByMonth(fromDate, toDate) {
  const result = {};
  let cursor = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    result[key] = (result[key] || 0) + 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/**
 * Running monthly leave balance for a user, up to and including
 * `targetMonth` ("YYYY-MM"). Unused days from earlier months carry
 * forward: 2 used of 4 this month → next month starts with 4 + 2 = 6.
 */
export async function computeMonthlyLeaveBalance(supabase, user, targetMonth) {
  const { data: userRow } = await supabase
    .from("site_user_details")
    .select("created_at")
    .eq("username", user.user_name)
    .maybeSingle();

  const [ty, tm] = targetMonth.split("-").map(Number);
  const targetDate = new Date(ty, tm - 1, 1);

  let startDate = userRow?.created_at
    ? new Date(new Date(userRow.created_at).getFullYear(), new Date(userRow.created_at).getMonth(), 1)
    : new Date(targetDate);

  const capDate = new Date(targetDate);
  capDate.setMonth(capDate.getMonth() - 36);
  if (startDate < capDate) startDate = capDate;
  if (startDate > targetDate) startDate = new Date(targetDate);

  const fromStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: leaves } = await fromMaybe("site_leaves", (q) =>
    q
      .select("from_date, to_date, level_approved, head_approved")
      .eq("user_name", user.user_name)
      .gte("to_date", fromStr)
  );

  const usedByMonth = {};
  (leaves || []).filter(isLeaveApproved).forEach((l) => {
    if (!l.from_date || !l.to_date) return;
    const perMonth = splitLeaveDaysByMonth(l.from_date, l.to_date);
    Object.entries(perMonth).forEach(([mo, days]) => {
      usedByMonth[mo] = (usedByMonth[mo] || 0) + days;
    });
  });

  let balance = 0;
  let broughtForward = 0;
  let cursor = new Date(startDate);
  while (cursor <= targetDate) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const isTargetMonth = key === targetMonth;
    if (isTargetMonth) broughtForward = balance;

    balance += MONTHLY_LEAVE_QUOTA;
    balance -= usedByMonth[key] || 0;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    remaining: Math.max(0, balance),
    broughtForward: Math.max(0, broughtForward),
    thisMonthUsed: usedByMonth[targetMonth] || 0,
    quotaPerMonth: MONTHLY_LEAVE_QUOTA,
  };
}

function sameId(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function asApprover(person, roleLabel) {
  if (!person?.username) return null;
  return {
    username: person.username,
    name: person.name || person.full_name || person.username,
    role: roleLabel,
  };
}

async function fetchPersonById(supabase, id) {
  if (!id) return null;
  const { data } = await supabase
    .from("site_user_details")
    .select(SITE_USER_COLS)
    .eq("id", id)
    .maybeSingle();
  if (data?.username) {
    return { id: data.id, username: data.username, name: data.name, role: data.role };
  }
  const { data: u } = await supabase
    .from("users")
    .select("id, username, full_name, designation")
    .eq("id", id)
    .maybeSingle();
  if (!u?.username) return null;
  return { id: u.id, username: u.username, name: u.full_name, role: u.designation };
}

/** projects.site_incharge_id = Head, coordinator_id = Co-ordinator, team_leader_id = fallback Head. */
export async function getSiteProjectStaff(supabase, site) {
  const want = String(site || "").trim().toLowerCase();
  if (!want) return { head: null, coordinator: null, teamLeader: null };
  const { data: rows } = await supabase
    .from("projects")
    .select("id, name, team_leader_id, coordinator_id, site_incharge_id");
  const project = (rows || []).find((p) => String(p.name || "").trim().toLowerCase() === want) || null;
  if (!project) return { head: null, coordinator: null, teamLeader: null };
  const [teamLeader, coordinator, incharge] = await Promise.all([
    fetchPersonById(supabase, project.team_leader_id),
    fetchPersonById(supabase, project.coordinator_id),
    fetchPersonById(supabase, project.site_incharge_id),
  ]);
  return {
    head: incharge || teamLeader,
    coordinator,
    teamLeader,
  };
}

/**
 * Engineer / Jr / Incharge leave → Co-ordinator AND Head must both approve.
 * Co-ordinator leave → Head only.
 * Head leave → auto-approved.
 */
export async function resolveApprovalChain(supabase, site, _applicantRole, applicantUsername) {
  if (!site) {
    return { levelApprover: null, headApprover: null, autoApproved: false, requiresLevel: true };
  }
  const staff = await getSiteProjectStaff(supabase, site);
  const applicantIsHead =
    staff.head?.username === applicantUsername || staff.teamLeader?.username === applicantUsername;
  const applicantIsCoord = staff.coordinator?.username === applicantUsername;

  const head =
    staff.head && staff.head.username !== applicantUsername
      ? asApprover(staff.head, "Head")
      : staff.teamLeader && staff.teamLeader.username !== applicantUsername
        ? asApprover(staff.teamLeader, "Head")
        : null;

  if (applicantIsHead) {
    return { levelApprover: null, headApprover: null, autoApproved: true, requiresLevel: false };
  }

  const samePerson = staff.coordinator && head && staff.coordinator.username === head.username;
  const requiresLevel = !applicantIsCoord && !samePerson;
  let levelApprover = null;
  if (requiresLevel && staff.coordinator) {
    levelApprover = asApprover(staff.coordinator, "Co-ordinator");
  }

  return { levelApprover, headApprover: head, autoApproved: false, requiresLevel };
}

/** Sites this user manages via projects.team_leader_id / coordinator_id / site_incharge_id. */
export async function fetchManagedSites(supabase, user) {
  const empty = { siteNames: [], headSites: new Set(), coordSites: new Set() };
  if (!user) return empty;
  let uid = user.id;
  if (!uid && user.user_name) {
    const { data } = await supabase
      .from("site_user_details")
      .select("id")
      .eq("username", user.user_name)
      .maybeSingle();
    uid = data?.id;
  }
  if (!uid) return empty;
  const { data: rows } = await supabase
    .from("projects")
    .select("name, team_leader_id, coordinator_id, site_incharge_id")
    .or(`team_leader_id.eq.${uid},coordinator_id.eq.${uid},site_incharge_id.eq.${uid}`);
  const siteNames = [];
  const headSites = new Set();
  const coordSites = new Set();
  (rows || []).forEach((p) => {
    const name = String(p.name || "").trim();
    if (!name) return;
    siteNames.push(name);
    const key = name.toLowerCase();
    if (sameId(p.site_incharge_id, uid) || sameId(p.team_leader_id, uid)) headSites.add(key);
    if (sameId(p.coordinator_id, uid)) coordSites.add(key);
  });
  return { siteNames, headSites, coordSites };
}

export function leaveRolesForUser(leave, user, managed) {
  const uname = user?.user_name;
  const key = String(leave?.site_name || "").trim().toLowerCase();
  if (!uname) return { asHead: false, asLevel: false };
  return {
    asHead: leave.head_approver_user_name === uname || !!managed?.headSites?.has(key),
    asLevel: leave.level_approver_user_name === uname || !!managed?.coordSites?.has(key),
  };
}

export function leaveActionSlot(leave, user, managed) {
  const { asHead, asLevel } = leaveRolesForUser(leave, user, managed);
  if (asHead) return "head";
  if (asLevel) return "level";
  return null;
}
