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

function belongsToSite(row, site) {
  const want = String(site || "").trim().toLowerCase();
  if (!want) return false;
  if (String(row.site_name || "").trim().toLowerCase() === want) return true;
  const names = Array.isArray(row.site_names) ? row.site_names : [];
  return names.some((n) => String(n || "").trim().toLowerCase() === want);
}

function asPerson(row, rank) {
  if (!row?.username) return null;
  return {
    username: row.username,
    name: row.name || row.full_name || row.username,
    role: ROLE_DISPLAY[ROLE_LEVELS[rank]] || ROLE_LEVELS[rank] || row.role || "",
    rank,
  };
}

async function fetchUserById(supabase, id) {
  if (!id) return null;
  const { data } = await supabase
    .from("site_user_details")
    .select(SITE_USER_COLS)
    .eq("id", id)
    .maybeSingle();
  return data || null;
}

async function fetchUsersOnSite(supabase, site) {
  const [{ data: byPrimary }, { data: byList }] = await Promise.all([
    supabase.from("site_user_details").select(SITE_USER_COLS).eq("status", "Active").ilike("site_name", site),
    supabase.from("site_user_details").select(SITE_USER_COLS).eq("status", "Active").contains("site_names", [site]),
  ]);
  const merged = [];
  const seen = new Set();
  [...(byPrimary || []), ...(byList || [])].forEach((row) => {
    if (!row?.username || seen.has(row.username)) return;
    if (!belongsToSite(row, site)) return;
    seen.add(row.username);
    merged.push(row);
  });
  return merged;
}

/**
 * People on this site, grouped by ladder rank.
 * Site Head / Co-ordinator / Incharge come from `projects` assignments first
 * (Manage Sites), then anyone else assigned to the site via site_name / site_names.
 */
export async function loadSiteRoster(supabase, site) {
  const byRank = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  const seen = new Set();

  const add = (row, forcedRank) => {
    if (!row?.username || seen.has(row.username)) return;
    if (String(row.status || "Active").toLowerCase() === "inactive") return;
    const rank = forcedRank != null ? forcedRank : siteRoleRank(row.role);
    if (rank == null || rank < 0) return;
    seen.add(row.username);
    const person = asPerson(row, rank);
    if (person) byRank[rank].push(person);
  };

  const { data: project } = await supabase
    .from("projects")
    .select("team_leader_id, coordinator_id, site_incharge_id")
    .ilike("name", site)
    .maybeSingle();

  if (project) {
    const [leader, coord, incharge] = await Promise.all([
      fetchUserById(supabase, project.team_leader_id),
      fetchUserById(supabase, project.coordinator_id),
      fetchUserById(supabase, project.site_incharge_id),
    ]);
    if (leader) add(leader, 4);
    if (coord) add(coord, 3);
    if (incharge && incharge.username !== leader?.username) {
      add(incharge, leader ? 2 : 4);
    }
  }

  const onSite = await fetchUsersOnSite(supabase, site);
  onSite.forEach((row) => add(row, null));

  const { data: assigned } = await supabase
    .from("user_site_assignments")
    .select("user_name")
    .ilike("site_name", site);
  const extraNames = [...new Set((assigned || []).map((a) => a.user_name).filter(Boolean))].filter(
    (n) => !seen.has(n)
  );
  if (extraNames.length) {
    const { data: extraUsers } = await supabase
      .from("site_user_details")
      .select(SITE_USER_COLS)
      .in("username", extraNames)
      .eq("status", "Active");
    (extraUsers || []).forEach((row) => add(row, null));
  }

  return byRank;
}

/**
 * For a given site: Head always approves. The next filled role above the
 * applicant on that same site is the level approver.
 * Engineer at Belcon (Head + Coordinator, no Incharge) → Coordinator + Head.
 * Coordinator → Head only.
 */
export async function resolveApprovalChain(supabase, site, applicantRole, applicantUsername) {
  if (!site) {
    return { levelApprover: null, headApprover: null, autoApproved: false };
  }

  const roster = await loadSiteRoster(supabase, site);
  const applicantRank = siteRoleRank(applicantRole);
  const idx = applicantRank < 0 ? 1 : applicantRank;

  const heads = (roster[4] || []).filter((p) => p.username !== applicantUsername);
  const headApprover = heads[0] || null;
  const applicantIsSiteHead = (roster[4] || []).some((p) => p.username === applicantUsername);

  if (applicantIsSiteHead && !headApprover) {
    return { levelApprover: null, headApprover: null, autoApproved: true };
  }

  let levelApprover = null;
  for (let r = idx + 1; r <= 3; r++) {
    const cand = (roster[r] || []).find((p) => p.username !== applicantUsername);
    if (cand) {
      levelApprover = cand;
      break;
    }
  }

  if (levelApprover && headApprover && levelApprover.username === headApprover.username) {
    levelApprover = null;
  }

  return { levelApprover, headApprover, autoApproved: false };
}
