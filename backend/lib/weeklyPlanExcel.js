/**
 * Parse EA weekly-plan Excel into { task_date, task_name, time_slot, status, sr_no }[].
 * Expected layout (flexible):
 *   Col A = SR NO, Col B = activity / site name
 *   Remaining cols = day pairs (TIME | WORK STATUS) under date headers.
 */

const XLSX = require('xlsx');

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
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  }
  if (typeof v === 'object' && v.t === 'd' && v.v instanceof Date) {
    return cellText(v.v);
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

function toYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  // Always calendar day in IST — Excel/SheetJS often gives UTC midnight which
  // shifts ±1 day when using local getDate() on non-IST servers.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function parseDateLoose(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return toYmd(raw);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      if (d) {
        return toYmd(new Date(Date.UTC(d.y, d.m - 1, d.d, 12)));
      }
    } catch {
      /* ignore */
    }
  }

  const s = cellText(raw);
  if (!s) return null;

  // 2026-09-07
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }

  // 07-Sep-2026 / 7 Sep 2026 / 07/Sep/2026
  m = s.match(/^(\d{1,2})[-\s\/]+([A-Za-z]{3,9})[-\s\/]+(\d{2,4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon == null) return null;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return toYmd(new Date(year, mon, Number(m[1]), 12));
  }

  // 07-09-2026 / 07/09/2026
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return toYmd(new Date(year, Number(m[2]) - 1, Number(m[1]), 12));
  }

  return null;
}

function normalizeStatus(raw) {
  const t = cellText(raw).toUpperCase();
  if (!t) return 'Pending';
  if (/(COMPLETED|COMPLETE|DONE)/.test(t)) return 'Completed';
  if (/IN\s*PROGRESS|PROGRESS/.test(t)) return 'In Progress';
  if (/ON\s*HOLD|HOLD/.test(t)) return 'On Hold';
  if (/CANCEL/.test(t)) return 'Cancelled';
  if (/PENDING/.test(t)) return 'Pending';
  return 'Pending';
}

function isHeaderTaskName(name) {
  const t = String(name || '').toUpperCase();
  if (!t) return true;
  return /^(SR\s*NO|SITE\s*NAME|DATE|DAYS|TIME|WORK\s*STATUS|WEEKLY\s*PLAN|DIP\s*PROJECT|PROJECT\s*CO|1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF)/.test(
    t
  );
}

function isHalfOrTimeHeader(text) {
  const t = String(text || '').toUpperCase();
  return (
    /1ST\s*HALF|2ND\s*HALF|FIRST\s*HALF|SECOND\s*HALF/.test(t) ||
    /\d{1,2}\s*[-:]?\s*\d{0,2}\s*(AM|PM)\s*TO\s*\d{1,2}/.test(t) ||
    /AM\s*TO\s*.*PM|PM\s*TO\s*.*PM/.test(t)
  );
}

function sheetToMatrix(sheet) {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  if (!range) return [];
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? (cell.v != null ? cell.v : '') : '');
    }
    rows.push(row);
  }

  // Fill merged cells so continuation rows keep SR / Task identity.
  const merges = Array.isArray(sheet['!merges']) ? sheet['!merges'] : [];
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

function isFirstHalfLabel(text) {
  return /^(1ST|FIRST)\s*HALF(\s*PLANNING)?$/i.test(String(text || '').replace(/\s+/g, ' ').trim());
}

function isSecondHalfLabel(text) {
  return /^(2ND|SECOND)\s*HALF(\s*PLANNING)?$/i.test(String(text || '').replace(/\s+/g, ' ').trim());
}

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

  let halfRow = null;
  for (let r = best.row; r < Math.min(matrix.length, best.row + 30); r += 1) {
    const row = matrix[r] || [];
    let firstHits = 0;
    let secondHits = 0;
    for (let c = 0; c < row.length; c += 1) {
      const t = cellText(row[c]);
      if (isFirstHalfLabel(t)) firstHits += 1;
      else if (isSecondHalfLabel(t)) secondHits += 1;
    }
    if (firstHits >= 1 && secondHits >= 1) {
      halfRow = r;
      break;
    }
  }

  if (halfRow == null) {
    return best.dates.map((cur) => ({
      ymd: cur.ymd,
      firstCol: cur.col,
      secondCol: null,
      timeCol: cur.col,
      statusCol: cur.col,
      layout: 'daily',
    }));
  }

  const firstHalfCols = [];
  const secondHalfCols = [];
  {
    const row = matrix[halfRow] || [];
    for (let c = 0; c < row.length; c += 1) {
      const t = cellText(row[c]);
      if (isFirstHalfLabel(t)) firstHalfCols.push(c);
      else if (isSecondHalfLabel(t)) secondHalfCols.push(c);
    }
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
  const dayCols = [];
  const WEEKDAY = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  for (let i = 0; i < best.dates.length; i += 1) {
    const cur = best.dates[i];
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
      const next = best.dates[i + 1];
      const span = next ? Math.max(1, next.col - cur.col) : 2;
      firstCol = cur.col;
      secondCol = span >= 2 ? cur.col + 1 : null;
    }

    let ymd = cur.ymd;
    for (let r = Math.max(0, best.row - 1); r < Math.min(matrix.length, best.row + 4); r += 1) {
      const t = cellText(matrix[r]?.[firstCol] || matrix[r]?.[cur.col] || matrix[r]?.[secondCol]).toUpperCase();
      if (!/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(t)) continue;
      const want = WEEKDAY[t.toLowerCase()];
      const d = new Date(`${ymd}T12:00:00+05:30`);
      let diff = want - d.getDay();
      if (diff > 3) diff -= 7;
      if (diff < -3) diff += 7;
      if (diff) {
        d.setDate(d.getDate() + diff);
        ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      }
      break;
    }

    dayCols.push({
      ymd,
      firstCol,
      secondCol,
      timeCol: firstCol,
      statusCol: secondCol != null ? secondCol : firstCol,
      layout: 'half',
    });
  }
  return dayCols;
}

function findDataStartRow(matrix, dateHeaderRow) {
  for (let r = (dateHeaderRow ?? 0) + 1; r < Math.min(matrix.length, 40); r += 1) {
    const a = cellText(matrix[r]?.[0]).toUpperCase();
    const b = cellText(matrix[r]?.[1]).toUpperCase();
    if (a === 'TIME' || b === 'TIME' || a === 'WORK STATUS' || b.includes('WORK STATUS')) continue;
    if (
      /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(a) ||
      /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/.test(b)
    ) {
      continue;
    }
    if (isHalfOrTimeHeader(a) || isHalfOrTimeHeader(b)) continue;
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
  const maybeStatus = normalizeStatus(text);
  const isPureStatus =
    maybeStatus !== 'Pending' ||
    /^(COMPLETED|COMPLETE|DONE|PENDING|IN\s*PROGRESS|ON\s*HOLD|CANCELLED?)$/i.test(text);
  // One cell → one task (keep UI ↔ WhatsApp numbering in sync).
  tasks.push({
    task_date: ymd,
    task_name: taskName,
    time_slot: isPureStatus && maybeStatus !== 'Pending' ? '' : text,
    status: isPureStatus ? maybeStatus : 'Pending',
    sr_no: srNo,
    half,
  });
}

/**
 * @param {ArrayBuffer|Buffer} buffer
 * @returns {{ tasks: Array, meta: object }}
 */
function parseWeeklyPlanBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { tasks: [], meta: { error: 'empty_sheet' } };

  const matrix = sheetToMatrix(sheet);
  const dayCols = findDateColumns(matrix);
  if (!dayCols.length) {
    return { tasks: [], meta: { error: 'no_dates', rows: matrix.length } };
  }

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
    const halfLayout = dayCols.some((day) => day.layout === 'half');

    for (const day of dayCols) {
      if (halfLayout) {
        const first = cellText(row[day.firstCol]);
        const second = day.secondCol != null ? cellText(row[day.secondCol]) : '';
        pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 1, content: first });
        if (day.secondCol != null) {
          pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 2, content: second });
        }
      } else {
        const plan = day.firstCol != null ? cellText(row[day.firstCol]) : '';
        pushHalfTask(tasks, { ymd: day.ymd, taskName, srNo, half: 0, content: plan });
      }
    }
  }

  return {
    tasks,
    meta: {
      sheetName,
      dateHeaderRow,
      dataStart,
      days: dayCols.map((d) => d.ymd),
      count: tasks.length,
      halves: dayCols.some((d) => d.layout === 'half'),
    },
  };
}

module.exports = {
  parseWeeklyPlanBuffer,
  parseDateLoose,
  normalizeStatus,
  cellText,
};
