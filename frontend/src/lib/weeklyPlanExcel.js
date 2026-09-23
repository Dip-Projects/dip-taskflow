/**
 * Browser-side EA weekly plan Excel parser (mirrors backend/lib/weeklyPlanExcel.js).
 */
import * as XLSX from "xlsx";

const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function cellText(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  }
  return String(v).replace(/\s+/g, " ").trim();
}

function toYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  // Always calendar day in IST — Excel/SheetJS UTC-midnight dates otherwise
  // shift ±1 day depending on the browser/server timezone.
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function parseDateLoose(raw) {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return toYmd(raw);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      if (d) return toYmd(new Date(Date.UTC(d.y, d.m - 1, d.d, 12)));
    } catch {
      /* ignore */
    }
  }
  const s = cellText(raw);
  if (!s) return null;

  // Prefer explicit date tokens inside longer header text.
  const candidates = [
    s,
    ...(s.match(/\d{1,2}[.\-\/\s]+[A-Za-z]{3,9}[.\-\/\s]+\d{2,4}/g) || []),
    ...(s.match(/\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}/g) || []),
    ...(s.match(/\d{1,2}[.\-\s\/]+[A-Za-z]{3,9}/g) || []),
    ...(s.match(/\d{4}-\d{1,2}-\d{1,2}/g) || []),
  ];

  const currentYear = new Date().getFullYear();

  for (const cand of candidates) {
    const t = cellText(cand);
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    }
    m = t.match(
      /^(\d{1,2})[.\-\s\/]+([A-Za-z]{3,9})(?:[.\-\s\/]+(?:(\d{2,4})|(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)))?(?:[.\-\s\/]+(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY))?$/i
    );
    if (m) {
      const mon = MONTHS[m[2].toLowerCase()];
      if (mon == null) continue;
      const year = m[3] ? Number(m[3]) : currentYear;
      const yy = year < 100 ? year + 2000 : year;
      return toYmd(new Date(yy, mon, Number(m[1]), 12));
    }
    m = t.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
    if (m) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      // Prefer DD.MM.YYYY (common in plan files)
      return toYmd(new Date(year, Number(m[2]) - 1, Number(m[1]), 12));
    }
  }
  return null;
}

/** Inclusive YYYY-MM-DD list from → to (hard-capped to avoid UI freezes). */
export function ymdRangeInclusive(from, to, maxDays = 31) {
  const out = [];
  if (!from || !to) return out;
  let startMs = new Date(`${from}T12:00:00`).getTime();
  let endMs = new Date(`${to}T12:00:00`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return out;
  if (startMs > endMs) {
    const tmp = startMs;
    startMs = endMs;
    endMs = tmp;
  }
  const limit = Math.max(1, Math.min(Number(maxDays) || 31, 62));
  let cur = new Date(startMs);
  const end = new Date(endMs);
  while (cur <= end && out.length < limit) {
    out.push(toYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function parseDateFromText(raw) {
  return parseDateLoose(raw);
}

function normalizeStatus(raw) {
  const t = cellText(raw).toUpperCase();
  if (!t) return "Pending";
  if (/(COMPLETED|COMPLETE|DONE)/.test(t)) return "Completed";
  if (/IN\s*PROGRESS|PROGRESS/.test(t)) return "In Progress";
  if (/ON\s*HOLD|HOLD/.test(t)) return "On Hold";
  if (/CANCEL/.test(t)) return "Cancelled";
  if (/PENDING/.test(t)) return "Pending";
  return "Pending";
}

function splitCellTasks(raw) {
  const text = cellText(raw);
  if (!text) return [];
  const candidates = text
    .split(/\n|\s*\/\s*|\s*•\s*|\s*;\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return candidates.length ? candidates : [text];
}

function isHeaderTaskName(name) {
  const t = String(name || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!t) return true;
  // Exact header labels only — keep real titles like "SITE WORK … PLANNING".
  if (/^(SR\s*NO|SITE\s*NAME|DATE|DAYS|TIME|WORK\s*STATUS)$/.test(t)) return true;
  if (/^(WEEKLY\s*PLAN(?:NING)?|DIP\s*PROJECTS?|PROJECT\s*CO\.?)$/.test(t)) return true;
  if (/^(1ST|2ND|FIRST|SECOND)\s*HALF(\s*PLANNING)?$/.test(t)) return true;
  if (/^DAYS\s*PLANNING$/.test(t) || /^WORK\s*UPDATE$/.test(t)) return true;
  return false;
}

function isHalfOrTimeHeader(text) {
  const t = String(text || "").toUpperCase();
  return (
    /1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF/.test(t) ||
    /\d{1,2}\s*[-:]?\s*\d{0,2}\s*(AM|PM)\s*TO\s*\d{1,2}/.test(t) ||
    /AM\s*TO\s*.*PM|PM\s*TO\s*.*PM/.test(t)
  );
}

// function sheetToMatrix(sheet) {
//   const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
//   if (!range) return [];
//   const rows = [];
//   for (let r = range.s.r; r <= range.e.r; r += 1) {
//     const row = [];
//     for (let c = range.s.c; c <= range.e.c; c += 1) {
//       const cell = sheet[XLSX.utils.encode_cell({ r, c })];
//       row.push(cell ? (cell.v != null ? cell.v : "") : "");
//     }
//     rows.push(row);
//   }
//   return rows;
// }
function sheetToMatrix(sheet) {
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!range) return [];
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? (cell.v != null ? cell.v : "") : "");
    }
    rows.push(row);
  }

  // XLSX only stores a value in the TOP-LEFT cell of a merged range; every
  // other cell in that range reads as blank. That silently breaks continuation
  // rows (e.g. a merged SR/Task column spanning 2 rows where the 2nd row has
  // extra task content in a day column, but blank SR/Task columns of its own).
  // Fill every cell in each merge with the master value so downstream row
  // detection sees the "real" SR/Task identity on every row of the merge.
  const merges = Array.isArray(sheet["!merges"]) ? sheet["!merges"] : [];
  for (const m of merges) {
    const topRow = m.s.r - range.s.r;
    const topCol = m.s.c - range.s.c;
    if (topRow < 0 || topCol < 0 || topRow >= rows.length) continue;
    const masterValue = rows[topRow]?.[topCol];
    for (let r = m.s.r; r <= m.e.r; r += 1) {
      const rr = r - range.s.r;
      if (rr < 0 || rr >= rows.length) continue;
      for (let c = m.s.c; c <= m.e.c; c += 1) {
        const cc = c - range.s.c;
        if (cc < 0 || cc >= rows[rr].length) continue;
        if (rr === topRow && cc === topCol) continue;
        rows[rr][cc] = masterValue;
      }
    }
  }

  return rows;
}

/**
 * Each calendar day owns two partitions (1st half 8AM–1PM | 2nd half 2PM–7PM).
 */

// function findDateColumns(matrix) {
//   let best = null;
//   for (let r = 0; r < Math.min(matrix.length, 20); r += 1) {
//     const row = matrix[r] || [];
//     const dates = [];
//     for (let c = 0; c < row.length; c += 1) {
//       const ymd = parseDateLoose(row[c]);
//       if (ymd) dates.push({ col: c, ymd });
//     }
//     if (dates.length >= 2 && (!best || dates.length > best.dates.length)) {
//       best = { row: r, dates };
//     }
//   }
//   if (!best) return [];
//   const dayCols = [];
//   for (let i = 0; i < best.dates.length; i += 1) {
//     const cur = best.dates[i];
//     const next = best.dates[i + 1];
//     const span = next ? Math.max(1, next.col - cur.col) : 2;
//     let firstCol = cur.col;
//     let secondCol = null;
//     if (span >= 4) {
//       // Old TIME|STATUS pairs for each half
//       firstCol = cur.col;
//       secondCol = cur.col + 2;
//     } else if (span >= 2) {
//       firstCol = cur.col;
//       secondCol = cur.col + 1;
//     }
//     dayCols.push({
//       ymd: cur.ymd,
//       firstCol,
//       secondCol,
//       // legacy aliases
//       timeCol: firstCol,
//       statusCol: secondCol != null ? secondCol : firstCol,
//     });
//   }
//   return dayCols;
// }
const WEEKDAY_TO_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function ymdAddDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function weekdayIndexFromYmd(ymd) {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00+05:30`);
  return d.getDay();
}

/** Snap a parsed ymd onto the weekday label shown in the sheet (fixes duplicate Thu / Fri→Thu). */
function alignYmdToWeekdayLabel(ymd, weekdayLabel) {
  if (!ymd || !weekdayLabel) return ymd;
  const want = WEEKDAY_TO_INDEX[String(weekdayLabel).trim().toLowerCase()];
  if (want == null) return ymd;
  const have = weekdayIndexFromYmd(ymd);
  if (have == null) return ymd;
  let diff = want - have;
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  return diff === 0 ? ymd : ymdAddDays(ymd, diff);
}

function findWeekdayLabelNear(matrix, dateHeaderRow, col) {
  const start = Math.max(0, (dateHeaderRow ?? 0) - 1);
  const end = Math.min(matrix.length, (dateHeaderRow ?? 0) + 4);
  for (let r = start; r < end; r += 1) {
    const t = cellText(matrix[r]?.[col]).toUpperCase();
    if (/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(t)) {
      return t;
    }
  }
  return null;
}

function isFirstHalfLabel(text) {
  return /1ST\s*HALF|FIRST\s*HALF/i.test(String(text || ""));
}
function isSecondHalfLabel(text) {
  return /2ND\s*HALF|SECOND\s*HALF/i.test(String(text || ""));
}

/** Find the row (near the date row) that carries explicit "1st half" / "2nd half" labels. */
function findHalfLabelRow(matrix, dateHeaderRow) {
  const maxRows = Math.min(matrix.length, 12);
  for (let r = dateHeaderRow; r < maxRows; r += 1) {
    const row = matrix[r] || [];
    let firstHits = 0;
    let secondHits = 0;
    for (let c = 0; c < row.length; c += 1) {
      const t = cellText(row[c]);
      if (isFirstHalfLabel(t)) firstHits += 1;
      else if (isSecondHalfLabel(t)) secondHits += 1;
    }
    if (firstHits >= 1 && secondHits >= 1) return r;
  }
  return null;
}

/**
 * Each calendar day owns two partitions (1st half 8AM–1PM | 2nd half 2PM–7PM).
 */
function findDateColumns(matrix) {
  let best = null;
  for (let r = 0; r < Math.min(matrix.length, 20); r += 1) {
    const row = matrix[r] || [];
    const dates = [];
    for (let c = 0; c < row.length; c += 1) {
      const ymd = parseDateLoose(row[c]);
      if (ymd) dates.push({ col: c, ymd });
    }
    if (dates.length >= 2 && (!best || dates.length > best.dates.length)) {
      best = { row: r, dates };
    }
  }
  if (!best) return [];

  const halfRow = findHalfLabelRow(matrix, best.row);
  const hasHalfLayout = halfRow != null;

  if (!hasHalfLayout) {
    return best.dates.map((cur) => {
      const label = findWeekdayLabelNear(matrix, best.row, cur.col);
      return {
        ymd: alignYmdToWeekdayLabel(cur.ymd, label),
        firstCol: cur.col,
        secondCol: null,
        timeCol: cur.col,
        statusCol: cur.col,
        layout: "daily",
      };
    });
  }

  // Prefer the *real* 1st half / 2nd half sub-header columns when present,
  // instead of guessing offsets from date-cell spacing (which breaks on
  // merged cells / uneven column widths).
  let firstHalfCols = [];
  let secondHalfCols = [];
  const row = matrix[halfRow] || [];
  for (let c = 0; c < row.length; c += 1) {
    const t = cellText(row[c]);
    if (isFirstHalfLabel(t)) firstHalfCols.push(c);
    else if (isSecondHalfLabel(t)) secondHalfCols.push(c);
  }

  const dayCols = [];
  if (firstHalfCols.length >= best.dates.length && secondHalfCols.length >= best.dates.length) {
    for (let i = 0; i < best.dates.length; i += 1) {
      const cur = best.dates[i];
      const firstCol = firstHalfCols[i];
      const secondCol = secondHalfCols[i];
      const label =
        findWeekdayLabelNear(matrix, best.row, firstCol) ||
        findWeekdayLabelNear(matrix, best.row, cur.col);
      dayCols.push({
        ymd: alignYmdToWeekdayLabel(cur.ymd, label),
        firstCol,
        secondCol,
        timeCol: firstCol,
        statusCol: secondCol != null ? secondCol : firstCol,
        layout: "half",
      });
    }
    return dayCols;
  }

  for (let i = 0; i < best.dates.length; i += 1) {
    const cur = best.dates[i];
    const prev = best.dates[i - 1];
    const next = best.dates[i + 1];
    const rangeStart = prev ? Math.floor((prev.col + cur.col) / 2) + 1 : Math.max(0, cur.col - 1);
    const rangeEnd = next ? Math.ceil((cur.col + next.col) / 2) : Infinity;

    let firstCol = firstHalfCols.find((c) => c >= rangeStart && c < rangeEnd);
    let secondCol = secondHalfCols.find((c) => c >= rangeStart && c < rangeEnd);

    if (firstCol == null || secondCol == null) {
      // Fallback to the old spacing heuristic only if labels weren't found.
      const span = next ? Math.max(1, next.col - cur.col) : 2;
      firstCol = firstCol != null ? firstCol : cur.col;
      secondCol =
        secondCol != null
          ? secondCol
          : span >= 4
            ? cur.col + 2
            : span >= 2
              ? cur.col + 1
              : null;
    }

    dayCols.push({
      ymd: alignYmdToWeekdayLabel(
        cur.ymd,
        findWeekdayLabelNear(matrix, best.row, firstCol) ||
          findWeekdayLabelNear(matrix, best.row, cur.col)
      ),
      firstCol,
      secondCol,
      timeCol: firstCol,
      statusCol: secondCol != null ? secondCol : firstCol,
      layout: "half",
    });
  }
  return dayCols;
}

function findDataStartRow(matrix, dateHeaderRow) {
  for (let r = (dateHeaderRow ?? 0) + 1; r < Math.min(matrix.length, 40); r += 1) {
    const a = cellText(matrix[r]?.[0]).toUpperCase();
    const b = cellText(matrix[r]?.[1]).toUpperCase();
    if (a === "TIME" || b === "TIME" || a === "WORK STATUS" || b.includes("WORK STATUS")) continue;
    if (
      /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(a) ||
      /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(b)
    ) {
      continue;
    }
    if (isHalfOrTimeHeader(a) || isHalfOrTimeHeader(b)) continue;

    const sr = Number(cellText(matrix[r]?.[0]));
    const name = cellText(matrix[r]?.[1]);
    // Type-1 body rows have AM–PM values in day columns — that must not delay dataStart.
    if (Number.isFinite(sr) && sr > 0 && name && !isHeaderTaskName(name)) {
      return r;
    }

    const sample = [2, 3, 4, 5].map((c) => cellText(matrix[r]?.[c])).filter(Boolean);
    if (sample.length && sample.every((t) => isHalfOrTimeHeader(t) || parseDateLoose(t))) continue;

    if (name && !isHeaderTaskName(name)) {
      return r;
    }
  }
  return Math.min((dateHeaderRow ?? 0) + 4, matrix.length);
}

function isSkipPlanCellText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!t) return true;
  // Skip half/status headers accidentally read as body cells.
  // Do NOT skip AM–PM ranges — those are valid type-1 daywise plan values.
  if (/^(1ST|2ND|FIRST|SECOND)\s*HALF(\s*PLANNING)?$/.test(t)) return true;
  if (/^WORK\s*STATUS$/.test(t) || /^DAYS\s*PLANNING$/.test(t) || /^WORK\s*UPDATE$/.test(t)) return true;
  if (/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(t)) return true;
  return false;
}

function pushHalfTask(tasks, { ymd, taskName, srNo, half, content }) {
  const text = cellText(content);
  if (!text || isSkipPlanCellText(text)) return;

  const items = splitCellTasks(text);
  if (!items.length) return;

  for (const item of items) {
    const itemText = cellText(item);
    if (!itemText || isSkipPlanCellText(itemText)) continue;

    const maybeStatus = normalizeStatus(itemText);
    const isPureStatus =
      maybeStatus !== "Pending" || /^(COMPLETED|COMPLETE|DONE|PENDING|IN\s*PROGRESS|ON\s*HOLD|CANCELLED?)$/i.test(itemText);

    tasks.push({
      task_date: ymd,
      task_name: taskName,
      time_slot: itemText,
      status: isPureStatus ? maybeStatus : "Pending",
      sr_no: srNo,
      half,
    });
  }
}

export function parseWeeklyPlanMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) {
    return { tasks: [], meta: { error: "empty_matrix" } };
  }

  const dayCols = findDateColumns(matrix);
  if (!dayCols.length) return { tasks: [], meta: { error: "no_dates", rows: matrix.length } };

  let dateHeaderRow = 0;
  for (let r = 0; r < Math.min(matrix.length, 20); r += 1) {
    const count = (matrix[r] || []).filter((v) => parseDateLoose(v)).length;
    if (count >= 2) {
      dateHeaderRow = r;
      break;
    }
  }

  const dataStart = findDataStartRow(matrix, dateHeaderRow);
  const tasks = [];
  const halfLayout = dayCols.some((day) => day.layout === "half");

  for (let r = dataStart; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const taskName = cellText(row[1] || row[0]);
    if (!taskName || isHeaderTaskName(taskName) || isHalfOrTimeHeader(taskName)) continue;
    const srRaw = cellText(row[0]);
    const srNo = /^\d+$/.test(srRaw) ? Number(srRaw) : null;

    for (const day of dayCols) {
      if (halfLayout) {
        const first = cellText(row[day.firstCol]);
        const second = day.secondCol != null ? cellText(row[day.secondCol]) : "";
        pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 1, content: first });
        if (day.secondCol != null) {
          pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 2, content: second });
        }
      } else {
        const plan = day.firstCol != null ? cellText(row[day.firstCol]) : "";
        pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 0, content: plan });
      }
    }
  }

  return {
    tasks,
    meta: {
      dateHeaderRow,
      dataStart,
      days: dayCols.map((d) => d.ymd),
      count: tasks.length,
      halves: halfLayout,
    },
    dayCols,
    dataStart,
    dateHeaderRow,
    matrix,
  };
}

export function parseWeeklyPlanBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { tasks: [], meta: { error: "empty_sheet" } };

  const matrix = sheetToMatrix(sheet);
  const parsed = parseWeeklyPlanMatrix(matrix);
  return {
    ...parsed,
    meta: { ...parsed.meta, sheetName },
  };
}

export async function parseWeeklyPlanFile(file) {
  if (!file) return { tasks: [], meta: { error: "no_file" } };
  const buffer = await file.arrayBuffer();
  return parseWeeklyPlanBuffer(buffer);
}
