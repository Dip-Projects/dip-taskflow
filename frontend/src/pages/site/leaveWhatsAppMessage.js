/**
 * Builds the plain-text leave application message that employees share to WhatsApp
 * right after a leave is applied from the portal.
 *
 * Format follows the agreed template:
 *   {employee name}
 *   LEAVE APPLICATION
 *   TODAY DATE :- {applied date}
 *   LEAVE DATE :- {date/period} (half-day shows which half)
 *   Reason:-
 *   {reason}
 *   This month leave
 *   {total leave of current month}
 *   Pls give confirmation
 */

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" (or ISO timestamp) -> "DD-MM-YYYY". Pure string work, no timezone shift. */
export function formatDmy(iso) {
  const s = String(iso || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s || "—";
}

/** Today as "YYYY-MM-DD" in local time. */
export function localYmd(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Inclusive day count between two "YYYY-MM-DD" strings (0 if the range is invalid). */
export function inclusiveDays(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return 0;
  const a = new Date(`${fromYmd}T00:00:00`);
  const b = new Date(`${toYmd}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Days of [fromYmd, toYmd] that fall inside the month "YYYY-MM". */
export function daysInMonth(fromYmd, toYmd, monthKey) {
  if (!fromYmd || !toYmd || !monthKey) return 0;
  const cursor = new Date(`${fromYmd}T00:00:00`);
  const end = new Date(`${toYmd}T00:00:00`);
  let count = 0;
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
    if (key === monthKey) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * @param {object} p
 * @param {string} p.employeeName
 * @param {string} [p.appliedOn]        "YYYY-MM-DD", defaults to today
 * @param {string} p.fromDate           "YYYY-MM-DD"
 * @param {string} p.toDate             "YYYY-MM-DD"
 * @param {boolean} [p.isHalfDay]
 * @param {string} [p.halfDayPeriod]    "first_half" | "second_half"
 * @param {string} [p.reason]
 * @param {number} [p.thisMonthTotal]   total leave days in the current month, incl. this one
 */
export function buildLeaveWhatsAppMessage({
  employeeName,
  appliedOn,
  fromDate,
  toDate,
  isHalfDay = false,
  halfDayPeriod = "",
  reason = "",
  thisMonthTotal = 0,
}) {
  const applied = formatDmy(appliedOn || localYmd());

  let leaveDate;
  if (isHalfDay) {
    const half = halfDayPeriod === "second_half" ? "2nd half" : "1st half";
    leaveDate = `${formatDmy(fromDate)} - ${half}`;
  } else {
    leaveDate =
      fromDate === toDate
        ? formatDmy(fromDate)
        : `${formatDmy(fromDate)} to ${formatDmy(toDate)}`;
  }

  const total = Number(thisMonthTotal) || 0;
  const totalText = `${total} ${total === 1 ? "day" : "days"}`;

  return [
    String(employeeName || "Employee").trim(),
    "",
    "LEAVE APPLICATION",
    "",
    `TODAY DATE :- ${applied}`,
    "",
    `LEAVE DATE :- ${leaveDate}`,
    "",
    "Reason:-",
    String(reason || "—").trim(),
    "",
    "This month leave",
    totalText,
    "",
    "Pls give confirmation",
  ].join("\n");
}

/** wa.me share link. Opens WhatsApp and lets the user pick a chat or group. */
export function whatsAppShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ""))}`;
}
