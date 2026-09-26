import { parseDateFromText } from "./weeklyPlanExcel.js";

export function getCellDisplayText(task) {
  const raw = String(task?.time_slot || task?.task_name || "").trim();
  return raw || "—";
}

export function getCellStatusText(task) {
  const status = String(task?.status || "Pending").trim();
  if (!status) return "Pending";
  return status;
}

export function normalizePreviewText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Normalize time strings so "9-00 AM" and "9:00AM" match. */
export function normalizeTimeText(value) {
  return normalizePreviewText(value)
    .replace(/\s*(am|pm)\s*/g, "$1")
    .replace(/(\d)\s*[-.]\s*(\d)/g, "$1:$2")
    .replace(/\s*(to|-|–|—)\s*/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatWeekDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "—");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }
  );
}

function cellDisplay(matrix, r, c) {
  const cell = matrix?.[r]?.[c];
  if (cell == null) return "";
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  }
  if (typeof cell === "object") {
    const display = String(cell.display ?? "").trim();
    if (/GMT[+-]\d{4}/i.test(display) || /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.+\d{4}/i.test(display)) {
      const d = new Date(display);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
      }
    }
    return display;
  }
  return String(cell).trim();
}

export function isHeaderLikeCell(value) {
  const t = String(value || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  const u = t.toUpperCase();

  // Exact header labels only. Do NOT use a broad "PLANNING"+"WORK" rule —
  // real tasks like "SITE WORK … ENGINEER PLANNING" must stay as data rows.
  if (/^(SR\s*NO|SITE\s*NAME|DATE|DAYS|TIME|WORK\s*STATUS)$/.test(u)) return true;
  if (/^(WEEKLY\s*PLAN(?:NING)?|DIP\s*PROJECTS?|PROJECT\s*CO\.?)$/.test(u)) return true;
  if (/^(1ST|2ND|FIRST|SECOND)\s*HALF(\s*PLANNING)?$/.test(u)) return true;
  if (/^DAYS\s*PLANNING$/.test(u) || /^WORK\s*UPDATE$/.test(u)) return true;
  if (/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(u)) return true;
  if (/^\d{1,2}[.\-\/]\s*[A-Za-z]{3}/.test(t)) return true;
  if (/^\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}$/.test(t)) return true;
  return false;
}

export function isNoWorkCell(value) {
  const text = String(value || "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!text || /^[-_.\/]+$/.test(text)) return true;
  return /^(?:N\/?A|NA|NONE|NIL|NO\s+WORK|NO\s+TASK|NOT\s+APPLICABLE|OFF|WEEKLY\s+OFF|HOLIDAY|LEAVE|ON\s+LEAVE|NO\s+WORK\s+TODAY|NOT\s+REQUIRED)$/.test(
    text
  );
}

/** Status/work-update values — not plan content; never show Pending controls. */
export function isStatusValueCell(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!text) return false;
  return /^(PENDING|COMPLETED|COMPLETE|DONE|IN\s*PROGRESS|PROGRESS|ON\s*HOLD|HOLD|CANCELLED|CANCELED|CANCEL)$/.test(
    text
  );
}

export function isWorkUpdateColumn(matrix, colIdx) {
  const limit = Math.min(Array.isArray(matrix) ? matrix.length : 0, 15);
  for (let rowIdx = 0; rowIdx < limit; rowIdx += 1) {
    const header = cellDisplay(matrix, rowIdx, colIdx).replace(/\s+/g, " ").trim().toUpperCase();
    if (/^(WORK\s+UPDATE|WORK\s+UPDATES?|UPDATE|UPDATES)$/.test(header)) return true;
  }
  return false;
}

/** True when the cell looks like a clock range (header timing or type-1 plan). */
export function isDaywiseTimeValue(value) {
  const t = String(value || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isHeaderLikeCell(t)) return false;
  return /\d{1,2}\s*[-.:]?\s*\d{0,2}\s*(AM|PM)\s*(TO|-|–|—)\s*\d{1,2}/i.test(t);
}

function isFirstHalfLabel(text) {
  return /1ST\s*HALF|FIRST\s*HALF/i.test(String(text || ""));
}

function isSecondHalfLabel(text) {
  return /2ND\s*HALF|SECOND\s*HALF/i.test(String(text || ""));
}

/** Detect 1st/2nd half planning layout from header labels. */
export function hasHalfPlanningLayout(matrix) {
  const limit = Math.min(Array.isArray(matrix) ? matrix.length : 0, 20);
  let first = 0;
  let second = 0;
  for (let r = 0; r < limit; r += 1) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const t = cellDisplay(matrix, r, c).toUpperCase();
      if (/1ST\s*HALF|FIRST\s*HALF/.test(t)) first += 1;
      if (/2ND\s*HALF|SECOND\s*HALF/.test(t)) second += 1;
    }
  }
  return first >= 1 && second >= 1;
}

function findHalfLabelRow(matrix, dateHeaderRow = 0) {
  const maxRows = Math.min(
    Array.isArray(matrix) ? matrix.length : 0,
    Math.max(dateHeaderRow + 30, 30),
  );
  for (let r = Math.max(0, dateHeaderRow); r < maxRows; r += 1) {
    const row = matrix[r] || [];
    let firstHits = 0;
    let secondHits = 0;
    for (let c = 0; c < row.length; c += 1) {
      const t = cellDisplay(matrix, r, c);
      if (isFirstHalfLabel(t)) firstHits += 1;
      else if (isSecondHalfLabel(t)) secondHits += 1;
    }
    if (firstHits >= 1 && secondHits >= 1) return r;
  }
  return null;
}

/** Map day / half columns — pair 1st+2nd half headers, assign to nearest date. */
function findSheetDayColumns(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];

  let best = null;
  for (let r = 0; r < Math.min(matrix.length, 20); r += 1) {
    const row = matrix[r] || [];
    const dates = [];
    for (let c = 0; c < row.length; c += 1) {
      const ymd = parseDateFromText(cellDisplay(matrix, r, c));
      if (ymd) dates.push({ col: c, ymd });
    }
    if (dates.length >= 1 && (!best || dates.length > best.dates.length)) {
      best = { row: r, dates };
    }
  }
  if (!best) return [];

  const halfRow = findHalfLabelRow(matrix, best.row);
  if (halfRow == null) {
    return best.dates.map((cur) => {
      const label = findWeekdayLabelNear(matrix, best.row, cur.col);
      return {
        ymd: alignYmdToWeekdayLabel(cur.ymd, label),
        firstCol: cur.col,
        secondCol: null,
        layout: "daily",
      };
    });
  }

  const firstHalfCols = [];
  const secondHalfCols = [];
  const halfRowCells = matrix[halfRow] || [];
  for (let c = 0; c < halfRowCells.length; c += 1) {
    const t = cellDisplay(matrix, halfRow, c);
    if (isFirstHalfLabel(t)) firstHalfCols.push(c);
    else if (isSecondHalfLabel(t)) secondHalfCols.push(c);
  }

  const pairs = [];
  const usedSecond = new Set();
  for (const fc of firstHalfCols) {
    const sc = secondHalfCols.find((c) => c > fc && !usedSecond.has(c));
    if (sc == null) continue;
    usedSecond.add(sc);
    pairs.push({ firstCol: fc, secondCol: sc, mid: (fc + sc) / 2 });
  }

  const usedPairs = new Set();
  return best.dates.map((cur) => {
    let bestPairIdx = -1;
    let bestDist = Infinity;
    for (let p = 0; p < pairs.length; p += 1) {
      if (usedPairs.has(p)) continue;
      const dist = Math.abs(pairs[p].mid - cur.col);
      if (dist < bestDist) {
        bestDist = dist;
        bestPairIdx = p;
      }
    }
    let firstCol;
    let secondCol;
    if (bestPairIdx >= 0) {
      usedPairs.add(bestPairIdx);
      firstCol = pairs[bestPairIdx].firstCol;
      secondCol = pairs[bestPairIdx].secondCol;
    } else {
      firstCol = cur.col;
      secondCol = cur.col + 1;
    }
    const label =
      findWeekdayLabelNear(matrix, best.row, firstCol) ||
      findWeekdayLabelNear(matrix, best.row, cur.col) ||
      findWeekdayLabelNear(matrix, best.row, secondCol);
    return {
      ymd: alignYmdToWeekdayLabel(cur.ymd, label),
      firstCol,
      secondCol,
      layout: "half",
    };
  });
}

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

function alignYmdToWeekdayLabel(ymd, weekdayLabel) {
  if (!ymd || !weekdayLabel) return ymd;
  const want = WEEKDAY_TO_INDEX[String(weekdayLabel).trim().toLowerCase()];
  if (want == null) return ymd;
  const have = new Date(`${ymd}T12:00:00+05:30`).getDay();
  let diff = want - have;
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  return diff === 0 ? ymd : ymdAddDays(ymd, diff);
}

function findWeekdayLabelNear(matrix, dateHeaderRow, col) {
  if (col == null || !Number.isFinite(col)) return null;
  const start = Math.max(0, (dateHeaderRow ?? 0) - 1);
  const end = Math.min(matrix.length, (dateHeaderRow ?? 0) + 4);
  for (let r = start; r < end; r += 1) {
    const t = cellDisplay(matrix, r, col).toUpperCase();
    if (/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(t)) {
      return t;
    }
  }
  return null;
}

/** YYYY-MM-DD for the calendar day that owns this sheet column. */
export function findDateForSheetColumn(matrix, colIdx) {
  if (!Array.isArray(matrix) || !Number.isFinite(colIdx)) return null;
  const days = findSheetDayColumns(matrix);
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const next = days[i + 1];
    const owned = [day.firstCol, day.secondCol].filter((c) => c != null && Number.isFinite(c));
    if (owned.includes(colIdx)) return day.ymd;
    if (!owned.length) continue;
    const start = Math.min(...owned);
    const end = next
      ? Math.min(
          ...[next.firstCol, next.secondCol].filter((c) => c != null && Number.isFinite(c))
        ) - 1
      : Infinity;
    if (colIdx >= start && colIdx <= end) return day.ymd;
  }

  // Fallback: nearest date header at/left of this column.
  let bestYmd = null;
  let bestCol = -Infinity;
  for (let r = 0; r < Math.min(matrix.length, 20); r += 1) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      if (c > colIdx) continue;
      const ymd = parseDateFromText(cellDisplay(matrix, r, c));
      if (ymd && c >= bestCol) {
        bestCol = c;
        bestYmd = ymd;
      }
    }
  }
  return bestYmd;
}

/** 1 / 2 for half-planning columns, otherwise 0. */
export function findHalfForSheetColumn(matrix, colIdx) {
  if (!Array.isArray(matrix) || !Number.isFinite(colIdx)) return 0;

  for (let r = 0; r < Math.min(matrix.length, 20); r += 1) {
    const t = cellDisplay(matrix, r, colIdx);
    if (isFirstHalfLabel(t)) return 1;
    if (isSecondHalfLabel(t)) return 2;
  }

  const days = findSheetDayColumns(matrix);
  for (const day of days) {
    if (day.layout !== "half") continue;
    if (day.firstCol === colIdx) return 1;
    if (day.secondCol === colIdx) return 2;
  }
  return 0;
}

function rowLabel(matrix, r) {
  return cellDisplay(matrix, r, 1).toUpperCase() || cellDisplay(matrix, r, 0).toUpperCase();
}

/** DATE / DAYS / TIME / half-planning header rows (never actionable). */
export function isPreviewHeaderBandRow(matrix, rowIdx) {
  const label = rowLabel(matrix, rowIdx);
  if (/^(DATE|DAYS|TIME|SITE\s*NAME|SR\s*NO)$/.test(label)) return true;

  // Real task rows always have a site/task title in col 1 — never treat as header.
  const siteOrTask = cellDisplay(matrix, rowIdx, 1);
  if (siteOrTask && !isHeaderLikeCell(siteOrTask) && !/^(DATE|DAYS|TIME|SITE\s*NAME)$/i.test(siteOrTask)) {
    return false;
  }

  const row = matrix?.[rowIdx] || [];
  let halfHits = 0;
  let weekdayHits = 0;
  let dateHits = 0;
  let timeHits = 0;
  let other = 0;
  for (let c = 2; c < row.length; c += 1) {
    const t = cellDisplay(matrix, rowIdx, c);
    if (!t) continue;
    const u = t.toUpperCase();
    if (/1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF/.test(u)) halfHits += 1;
    else if (/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(u)) weekdayHits += 1;
    else if (isHeaderLikeCell(t) && /^\d{1,2}/.test(t)) dateHits += 1;
    else if (isDaywiseTimeValue(t)) timeHits += 1;
    else other += 1;
  }

  if (halfHits >= 1 && other === 0) return true;
  if (weekdayHits >= 1 && other === 0) return true;
  if (dateHits >= 1 && other === 0) return true;
  // TIME header row only when the row label is TIME (not a data row of time slots).
  if (timeHits >= 1 && other === 0 && /^TIME$/.test(label)) return true;
  return false;
}

/**
 * First body row = numeric SR + task/site name.
 * Ignores title rows and DATE/DAYS/TIME/HALF header bands.
 */
export function findPreviewDataStartRow(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return 0;

  let halfHeaderRow = -1;
  if (hasHalfPlanningLayout(matrix)) {
    for (let r = 0; r < Math.min(matrix.length, 30); r += 1) {
      const row = matrix[r] || [];
      let hits = 0;
      for (let c = 0; c < row.length; c += 1) {
        const t = cellDisplay(matrix, r, c).toUpperCase();
        if (/1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF/.test(t)) hits += 1;
      }
      if (hits >= 1) halfHeaderRow = r;
    }
  }

  for (let r = 0; r < Math.min(matrix.length, 50); r += 1) {
    if (halfHeaderRow >= 0 && r <= halfHeaderRow) continue;
    if (isPreviewHeaderBandRow(matrix, r)) continue;

    const a = cellDisplay(matrix, r, 0);
    const b = cellDisplay(matrix, r, 1);
    if (!/^\d+$/.test(a)) continue;
    if (!b || isHeaderLikeCell(b)) continue;
    return r;
  }

  // Fallback: first non-header band row after half headers.
  for (let r = Math.max(0, halfHeaderRow + 1); r < Math.min(matrix.length, 50); r += 1) {
    if (isPreviewHeaderBandRow(matrix, r)) continue;
    const b = cellDisplay(matrix, r, 1);
    if (b && !isHeaderLikeCell(b)) return r;
  }

  return Math.min(matrix.length, 8);
}

/**
 * Type 1: Pending control on daywise time data cells.
 * Type 2: Pending control on 1st/2nd half planning task data cells.
 * Never on headers (including TIME timing row).
 */
export function isActionablePlanCell(matrix, rowIdx, colIdx, cellText) {
  const text = String(cellText || "").trim();
  if (!text || colIdx < 2) return false;
  if (isNoWorkCell(text)) return false;
  if (isStatusValueCell(text)) return false;
  if (isWorkUpdateColumn(matrix, colIdx)) return false;
  if (isPreviewHeaderBandRow(matrix, rowIdx)) return false;
  const dataStart = findPreviewDataStartRow(matrix);
  if (rowIdx < dataStart) return false;
  if (isHeaderLikeCell(text)) return false;

  if (hasHalfPlanningLayout(matrix)) {
    // Type 2 — task text only; never the timing header values.
    if (isDaywiseTimeValue(text)) return false;
    return true;
  }

  // Type 1 — daywise scheduled time (or any non-empty plan cell in body).
  return isDaywiseTimeValue(text) || Boolean(text);
}

function taskMatchesCellText(task, text, { exactOnly = true } = {}) {
  const slot = normalizePreviewText(task?.time_slot);
  const slotTime = normalizeTimeText(task?.time_slot);
  const textNorm = normalizePreviewText(text);
  const textTime = normalizeTimeText(text);
  if (!textNorm) return false;
  // Don't match plan cells to ingested WORK STATUS values.
  if (isStatusValueCell(task?.time_slot) && !isStatusValueCell(text)) return false;
  if (slot && slot === textNorm) return true;
  if (slotTime && textTime && slotTime === textTime) return true;
  if (exactOnly) return false;
  return false;
}

function sameTaskDate(task, taskDate) {
  if (!taskDate) return false;
  return String(task?.task_date || "").slice(0, 10) === String(taskDate).slice(0, 10);
}

function sameTaskRow(task, rowName, srNo) {
  const nameOk =
    rowName && normalizePreviewText(task?.task_name) === rowName;
  const taskSr = Number(task?.sr_no);
  const hasTaskSr = Number.isFinite(taskSr) && taskSr > 0;
  const srOk = srNo != null && hasTaskSr && taskSr === srNo;
  // Prefer SR+name when both sides have SR; otherwise name (or SR) alone.
  if (srNo != null && rowName && hasTaskSr) return srOk && nameOk;
  if (srNo != null && hasTaskSr) return srOk;
  return Boolean(nameOk);
}

function isAssignablePlanTask(task) {
  if (!task?.id) return false;
  if (isStatusValueCell(task.time_slot)) return false;
  if (isNoWorkCell(task.time_slot)) return false;
  return Boolean(String(task.time_slot || task.task_name || "").trim());
}

function scoreTaskForCell(task, { cellText, taskDate, half, requireDate = true }) {
  // Require exact cell text match — soft contains caused status bleed across cells.
  if (!taskMatchesCellText(task, cellText, { exactOnly: true })) return -1;
  let score = 100;

  if (taskDate && sameTaskDate(task, taskDate)) score += 40;
  else if (taskDate && requireDate) return -1; // never cross days on the strict pass
  else if (taskDate) score -= 20; // soft pass: prefer dated matches first

  if (half != null && Number(half) > 0) {
    if (Number(task.half) === Number(half)) score += 30;
    else if (Number(task.half) === 0) score += 5; // legacy rows only
    else return -1; // wrong half
  }
  return score;
}

/**
 * Build a 1:1 map of sheet cell → task.
 * Each task is used at most once, so duplicate labels on other days/rows
 * cannot share status when one Pending is clicked.
 *
 * Returns Map<"row:col", task>
 */
export function buildSheetTaskIndex(matrix, tasks) {
  const index = new Map();
  if (!Array.isArray(matrix) || !matrix.length) return index;
  const pool = (Array.isArray(tasks) ? tasks : []).filter(isAssignablePlanTask);
  if (!pool.length) return index;

  const used = new Set();
  const cells = [];

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const rowName = cellDisplay(matrix, r, 1) || cellDisplay(matrix, r, 0);
    const srRaw = cellDisplay(matrix, r, 0);
    const srNo = /^\d+$/.test(srRaw) ? Number(srRaw) : null;
    for (let c = 0; c < row.length; c += 1) {
      const text = cellDisplay(matrix, r, c);
      if (!isActionablePlanCell(matrix, r, c, text)) continue;
      cells.push({
        key: `${r}:${c}`,
        rowIdx: r,
        colIdx: c,
        cellText: text,
        rowTaskName: rowName,
        srNo,
        taskDate: findDateForSheetColumn(matrix, c),
        half: findHalfForSheetColumn(matrix, c),
      });
    }
  }

  const scored = [];
  for (const cell of cells) {
    const rowName = normalizePreviewText(cell.rowTaskName);
    for (const task of pool) {
      if (!sameTaskRow(task, rowName, cell.srNo)) continue;
      const score = scoreTaskForCell(task, cell);
      if (score < 0) continue;
      scored.push({ cell, task, score: score + 50 });
    }
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (String(b.task.status || "") === "Completed" ? 1 : 0) -
        (String(a.task.status || "") === "Completed" ? 1 : 0) ||
      a.cell.rowIdx - b.cell.rowIdx ||
      a.cell.colIdx - b.cell.colIdx,
  );

  const usedCells = new Set();
  for (const { cell, task } of scored) {
    const ck = cell.key;
    const tid = String(task.id);
    if (usedCells.has(ck) || used.has(tid)) continue;
    index.set(ck, task);
    used.add(tid);
    usedCells.add(ck);
  }

  // Exact text + date + half among unused (no column-order guessing).
  // Prefer Completed when duplicate rows exist for the same cell.
  for (const cell of cells) {
    if (usedCells.has(cell.key) || index.has(cell.key)) continue;
    const text = normalizePreviewText(cell.cellText);
    const hits = pool
      .filter((task) => {
        if (used.has(String(task.id))) return false;
        if (normalizePreviewText(task.time_slot) !== text) return false;
        if (cell.taskDate && !sameTaskDate(task, cell.taskDate)) return false;
        if (
          cell.half != null &&
          Number(cell.half) > 0 &&
          Number(task.half) > 0 &&
          Number(task.half) !== Number(cell.half)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ac = String(a.status || "") === "Completed" ? 1 : 0;
        const bc = String(b.status || "") === "Completed" ? 1 : 0;
        return bc - ac;
      });
    const hit = hits[0];
    if (!hit) continue;
    index.set(cell.key, hit);
    used.add(String(hit.id));
    usedCells.add(cell.key);
  }

  return index;
}

/**
 * Match a visible Excel data cell to ONE weekly_plan_tasks row.
 * Prefer buildSheetTaskIndex in the UI for sheet-wide unique assignment.
 */
export function findTaskForSheetCell(
  tasks,
  { cellText, rowTaskName, taskDate, half, matrix, rowIdx, usedIds } = {},
) {
  const text = normalizePreviewText(cellText);
  if (!text || text === "—") return null;
  const used = usedIds instanceof Set ? usedIds : null;
  const list = (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (!isAssignablePlanTask(task)) return false;
    if (used && used.has(String(task.id))) return false;
    return true;
  });
  const rowName = normalizePreviewText(rowTaskName);
  const srRaw =
    Array.isArray(matrix) && Number.isFinite(rowIdx)
      ? cellDisplay(matrix, rowIdx, 0)
      : "";
  const srNo = /^\d+$/.test(srRaw) ? Number(srRaw) : null;

  let best = null;
  let bestScore = -1;
  for (const task of list) {
    if (!sameTaskRow(task, rowName, srNo)) continue;
    const score = scoreTaskForCell(task, { cellText, taskDate, half });
    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }
  return bestScore >= 0 ? best : null;
}

/** Prefer open tasks for one Excel task/site row. */
export function findPendingTasksForRow(tasks, rowTaskName) {
  const rowName = normalizePreviewText(rowTaskName);
  if (!rowName) return [];
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (normalizePreviewText(task.task_name) !== rowName) return false;
    const s = String(task.status || "");
    return s !== "Completed" && s !== "Cancelled";
  });
}
