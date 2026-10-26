/**
 * Office / MDO Office leave balance — financial year April → March.
 * Accrual: +1 leave at the start of each FY month that has begun.
 * Unused months carry forward within the FY; overuse goes negative until earned back.
 */

const MONTHLY_ACCRUAL = 1;

const MONTH_NAMES = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
];

function istParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d instanceof Date ? d : new Date(d));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** FY starting April of `fyStartYear` (e.g. 2025 → Apr 2025–Mar 2026). */
function fyStartYearForDate(ref = new Date()) {
  const { year, month } = istParts(ref);
  return month >= 4 ? year : year - 1;
}

function fyMeta(ref = new Date()) {
  const fyStartYear = fyStartYearForDate(ref);
  return {
    fy_start_year: fyStartYear,
    fy_label: `FY ${fyStartYear}–${String(fyStartYear + 1).slice(-2)}`,
    from: ymd(fyStartYear, 4, 1),
    to: ymd(fyStartYear + 1, 3, 31),
  };
}

/** Calendar months in FY as { year, month 1-12, key, label }. */
function fyMonths(fyStartYear) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1; // Apr=4 … Mar=3
    const y = m >= 4 ? fyStartYear : fyStartYear + 1;
    out.push({
      year: y,
      month: m,
      key: `${y}-${pad(m)}`,
      label: `${MONTH_NAMES[i]} ${y}`,
      short: MONTH_NAMES[i],
    });
  }
  return out;
}

function parseYmd(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d, key: `${y}-${pad(m)}`, time: Date.UTC(y, m - 1, d) };
}

function daysInclusive(fromIso, toIso) {
  const a = parseYmd(fromIso);
  const b = parseYmd(toIso || fromIso);
  if (!a || !b || b.time < a.time) return 0;
  return Math.round((b.time - a.time) / 86400000) + 1;
}

/** Leave day count (half-day = 0.5). */
function leaveDayCount(leave) {
  if (leave?.is_half_day) return 0.5;
  return daysInclusive(leave.from_date, leave.to_date);
}

/**
 * Split leave days across calendar months (inclusive).
 * Half-day leaves count 0.5 on from_date's month.
 */
function splitLeaveByMonth(leave) {
  const map = {};
  if (leave?.is_half_day) {
    const p = parseYmd(leave.from_date);
    if (p) map[p.key] = 0.5;
    return map;
  }
  const a = parseYmd(leave.from_date);
  const b = parseYmd(leave.to_date || leave.from_date);
  if (!a || !b || b.time < a.time) return map;
  let cur = new Date(Date.UTC(a.y, a.m - 1, a.d));
  const end = new Date(Date.UTC(b.y, b.m - 1, b.d));
  while (cur <= end) {
    const key = `${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}`;
    map[key] = (map[key] || 0) + 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return map;
}

function isCountableStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'approved' || s === 'pending';
}

function isApprovedStatus(status) {
  return String(status || '').toLowerCase() === 'approved';
}

function isPendingStatus(status) {
  return String(status || '').toLowerCase() === 'pending';
}

/**
 * @param {object[]} leaves — rows with from_date, to_date, is_half_day, status
 * @param {{ asOf?: Date }} opts
 */
function buildOfficeLeaveBalance(leaves, opts = {}) {
  const asOf = opts.asOf || new Date();
  const fy = fyMeta(asOf);
  const months = fyMonths(fy.fy_start_year);
  const { year: cy, month: cm } = istParts(asOf);
  const asOfKey = `${cy}-${pad(cm)}`;

  const usedApproved = {};
  const usedPending = {};
  (leaves || []).forEach((leave) => {
    if (!isCountableStatus(leave.status)) return;
    // Only count days that fall inside this FY
    const split = splitLeaveByMonth(leave);
    Object.entries(split).forEach(([key, days]) => {
      if (key < fy.from.slice(0, 7) || key > fy.to.slice(0, 7)) return;
      if (isApprovedStatus(leave.status)) {
        usedApproved[key] = (usedApproved[key] || 0) + days;
      } else if (isPendingStatus(leave.status)) {
        usedPending[key] = (usedPending[key] || 0) + days;
      }
    });
  });

  let running = 0;
  let totalAccrued = 0;
  let totalUsedApproved = 0;
  let totalUsedPending = 0;
  const monthly = months.map((mo) => {
    const started = mo.key <= asOfKey;
    const accrued = started ? MONTHLY_ACCRUAL : 0;
    const used_approved = Math.round((usedApproved[mo.key] || 0) * 10) / 10;
    const used_pending = Math.round((usedPending[mo.key] || 0) * 10) / 10;
    const used = Math.round((used_approved + used_pending) * 10) / 10;
    if (accrued) running += accrued;
    running -= used;
    running = Math.round(running * 10) / 10;
    totalAccrued += accrued;
    totalUsedApproved += used_approved;
    totalUsedPending += used_pending;
    return {
      ...mo,
      accrued,
      used_approved,
      used_pending,
      used,
      balance_after: running,
      is_current: mo.key === asOfKey,
      is_future: mo.key > asOfKey,
    };
  });

  const balance = running;
  const available = balance; // can be negative

  return {
    ...fy,
    monthly_accrual: MONTHLY_ACCRUAL,
    as_of: ymd(cy, cm, istParts(asOf).day),
    total_accrued: totalAccrued,
    total_used_approved: Math.round(totalUsedApproved * 10) / 10,
    total_used_pending: Math.round(totalUsedPending * 10) / 10,
    total_used: Math.round((totalUsedApproved + totalUsedPending) * 10) / 10,
    balance,
    available,
    in_deficit: balance < 0,
    monthly,
  };
}

module.exports = {
  MONTHLY_ACCRUAL,
  fyMeta,
  fyMonths,
  leaveDayCount,
  daysInclusive,
  buildOfficeLeaveBalance,
  splitLeaveByMonth,
};
