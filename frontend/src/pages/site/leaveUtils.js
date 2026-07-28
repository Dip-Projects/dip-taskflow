import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
export const MONTHLY_LEAVE_QUOTA = 4;
const MONTHLY_LEAVE_ROLES = ["site engineer", "site incharge", "site coordinator"]; // Site Engineering department roles

export function isMonthlyLeaveRole(user) {
  const role = (typeof user === "string" ? user : user?.role || "").trim().toLowerCase();
  return MONTHLY_LEAVE_ROLES.includes(role);
}   
function isLeaveApproved(l) {
  if (l.level_approved === false || l.head_approved === false) return false;
  return l.level_approved === true && l.head_approved === true;
}

// Splits a leave's [from_date, to_date] range into per-month day counts,
// e.g. 2026-01-30 → 2026-02-02 gives { "2026-01": 2, "2026-02": 2 }
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

  const { data: leaves } = await supabase
    .from("site_leaves")
    .select("from_date, to_date, level_approved, head_approved")
    .eq("user_name", user.user_name)
    .gte("to_date", fromStr);

  const usedByMonth = {};
  (leaves || []).filter(isLeaveApproved).forEach((l) => {
    if (!l.from_date || !l.to_date) return;
    const perMonth = splitLeaveDaysByMonth(l.from_date, l.to_date);
    Object.entries(perMonth).forEach(([mo, days]) => {
      usedByMonth[mo] = (usedByMonth[mo] || 0) + days;
    });
  });

  let balance = 0;
  let broughtForward = 0; // ← balance carried in from before the target month
  let cursor = new Date(startDate);
  while (cursor <= targetDate) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const isTargetMonth = key === targetMonth;
    if (isTargetMonth) broughtForward = balance; // snapshot before this month's quota/usage applied

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