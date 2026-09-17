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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    ...(s.match(/\d{4}-\d{1,2}-\d{1,2}/g) || []),
  ];

  for (const cand of candidates) {
    const t = cellText(cand);
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    }
    m = t.match(/^(\d{1,2})[.\-\s\/]+([A-Za-z]{3,9})[.\-\s\/]+(\d{2,4})$/i);
    if (m) {
      const mon = MONTHS[m[2].toLowerCase()];
      if (mon == null) continue;
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return toYmd(new Date(year, mon, Number(m[1]), 12));
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

function isHeaderTaskName(name) {
  const t = String(name || "").toUpperCase();
  if (!t) return true;
  return /^(SR\s*NO|SITE\s*NAME|DATE|DAYS|TIME|WORK\s*STATUS|WEEKLY\s*PLAN|DIP\s*PROJECT|PROJECT\s*CO|1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF)/.test(
    t
  );
}

function isHalfOrTimeHeader(text) {
  const t = String(text || "").toUpperCase();
  return (
    /1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF/.test(t) ||
    /\d{1,2}\s*[-:]?\s*\d{0,2}\s*(AM|PM)\s*TO\s*\d{1,2}/.test(t) ||
    /AM\s*TO\s*.*PM|PM\s*TO\s*.*PM/.test(t)
  );
}

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
  return rows;
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
  const dayCols = [];
  for (let i = 0; i < best.dates.length; i += 1) {
    const cur = best.dates[i];
    const next = best.dates[i + 1];
    const span = next ? Math.max(1, next.col - cur.col) : 2;
    let firstCol = cur.col;
    let secondCol = null;
    if (span >= 4) {
      // Old TIME|STATUS pairs for each half
      firstCol = cur.col;
      secondCol = cur.col + 2;
    } else if (span >= 2) {
      firstCol = cur.col;
      secondCol = cur.col + 1;
    }
    dayCols.push({
      ymd: cur.ymd,
      firstCol,
      secondCol,
      // legacy aliases
      timeCol: firstCol,
      statusCol: secondCol != null ? secondCol : firstCol,
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
    // Skip rows that are only half/time headers across day columns
    const sample = [2, 3, 4, 5].map((c) => cellText(matrix[r]?.[c])).filter(Boolean);
    if (sample.length && sample.every((t) => isHalfOrTimeHeader(t) || parseDateLoose(t))) continue;

    const sr = Number(cellText(matrix[r]?.[0]));
    const name = cellText(matrix[r]?.[1]);
    if ((Number.isFinite(sr) && sr > 0 && name) || (name && !isHeaderTaskName(name))) {
      return r;
    }
  }
  return Math.min((dateHeaderRow ?? 0) + 4, matrix.length);
}

function pushHalfTask(tasks, { ymd, taskName, srNo, half, content }) {
  const text = cellText(content);
  if (!text || isHalfOrTimeHeader(text)) return;
  const halfLabel = half === 1 ? "1st half" : "2nd half";
  const maybeStatus = normalizeStatus(text);
  const isPureStatus =
    maybeStatus !== "Pending" || /^(COMPLETED|COMPLETE|DONE|PENDING|IN\s*PROGRESS|ON\s*HOLD|CANCELLED?)$/i.test(text);
  tasks.push({
    task_date: ymd,
    // Suffix keeps DB unique index happy (one row per half per day).
    task_name: `${taskName} · ${halfLabel}`,
    time_slot: isPureStatus && maybeStatus !== "Pending" ? halfLabel : text,
    status: isPureStatus ? maybeStatus : "Pending",
    sr_no: srNo,
    half,
  });
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
  for (let r = dataStart; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const taskName = cellText(row[1] || row[0]);
    if (!taskName || isHeaderTaskName(taskName) || isHalfOrTimeHeader(taskName)) continue;
    const srRaw = cellText(row[0]);
    const srNo = /^\d+$/.test(srRaw) ? Number(srRaw) : null;

    for (const day of dayCols) {
      const first = cellText(row[day.firstCol]);
      const second = day.secondCol != null ? cellText(row[day.secondCol]) : "";
      pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 1, content: first });
      if (day.secondCol != null) {
        pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 2, content: second });
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
      halves: true,
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
