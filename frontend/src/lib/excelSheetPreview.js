/**
 * Load a submitted weekly-plan workbook into a display matrix that mirrors
 * the Excel sheet (values, fills, fonts, merges, column widths).
 */
import * as XLSX from "xlsx";

const MAX_ROWS = 120;
const MAX_COLS = 40;

function excelArgbToCss(value) {
  if (!value) return "";
  if (typeof value === "object") {
    if (value.argb) return excelArgbToCss(value.argb);
    if (value.rgb) return excelArgbToCss(value.rgb);
    return "";
  }
  const hex = String(value).replace(/^#/, "").replace(/\s+/g, "");
  if (!hex || /^0+$/i.test(hex)) return "";
  if (hex.length === 8) return `#${hex.slice(2)}`;
  if (hex.length === 6) return `#${hex}`;
  return "";
}

function isDarkHex(bg) {
  const hex = String(bg || "").replace(/^#/, "");
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
}

function normalizeHex(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
    if (raw.length === 4) {
      return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
    }
    return raw.toUpperCase();
  }
  return raw.toUpperCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex).replace(/^#/, "");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function rgbLuminance({ r, g, b }) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function rgbToHue({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d < 0.0001) return { h: 0, s: 0, l: max };
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

/** Soft dark surfaces — keep tint, never solid mustard/yellow blocks. */
const DARK_SURFACES = {
  base: { bg: "#171512", color: "#f3efe8", border: "#3a342c" },
  neutral: { bg: "#1c1915", color: "#f3efe8", border: "#3a342c" },
  gold: { bg: "#241f16", color: "#efe6d2", border: "#4a3f2c" },
  warm: { bg: "#231c16", color: "#f0e6d8", border: "#4a3a2c" },
  green: { bg: "#171d18", color: "#dde8de", border: "#334036" },
  blue: { bg: "#161b22", color: "#dce4ee", border: "#334155" },
  rose: { bg: "#221618", color: "#f0e0e2", border: "#4a3336" },
};

function classifyFillFamily(bg) {
  const rgb = hexToRgb(bg);
  if (!rgb) return "neutral";
  const { h, s } = rgbToHue(rgb);
  if (s < 0.1) return "neutral";
  if (h >= 35 && h <= 75) return "gold"; // yellow / mustard / amber
  if (h > 75 && h <= 165) return "green";
  if (h > 165 && h <= 255) return "blue";
  if (h > 255 && h <= 330) return "rose";
  return "warm"; // orange / red
}

/**
 * Remap Excel/PDF fills for dark theme.
 * Always use muted dark surfaces — never keep bright Excel yellows.
 */
export function mapSheetColorsForTheme(bg, color, isDark) {
  if (!isDark) {
    return {
      bg: bg || "#FFFFFF",
      color: color || (isDarkHex(bg) ? "#FFFFFF" : "#111827"),
      border: "#9ca3af",
    };
  }

  const b = normalizeHex(bg);
  const exact = {
    "#FFFFFF": "base",
    "#FFF": "base",
    "#FFF2CC": "gold",
    "#FFEB9C": "gold",
    "#FFFF00": "gold",
    "#FFC000": "gold",
    "#FFD966": "gold",
    "#FFE699": "gold",
    "#E2EFDA": "green",
    "#C6EFCE": "green",
    "#DDEBF7": "blue",
    "#BDD7EE": "blue",
    "#FCE4D6": "warm",
    "#FFE4CC": "warm",
    "#FFF7ED": "warm",
    "#FFFBEB": "gold",
    "#FFC7CE": "rose",
    "#EEF2FF": "neutral",
    "#F8FAFC": "neutral",
    "#F3F4F6": "neutral",
    "#F2F2F2": "neutral",
  };

  const family = exact[b] || classifyFillFamily(b);
  const surface = DARK_SURFACES[family] || DARK_SURFACES.neutral;

  // Prefer light text on dark surfaces; ignore Excel's dark-on-yellow ink.
  const srcRgb = hexToRgb(color);
  const keepColor =
    srcRgb && rgbLuminance(srcRgb) > 160 && !isDarkHex(color) ? normalizeHex(color) : surface.color;

  return {
    bg: surface.bg,
    color: keepColor || surface.color,
    border: surface.border,
  };
}

function statusFallbackStyle(text) {
  const t = String(text || "").trim().toUpperCase();
  if (!t) return null;
  if (/(COMPLETED|COMPLETE|DONE)/.test(t)) return { bg: "#C6EFCE", color: "#006100" };
  if (/IN\s*PROGRESS|PROGRESS/.test(t)) return { bg: "#BDD7EE", color: "#1F4E79" };
  if (/PENDING/.test(t)) return { bg: "#FFEB9C", color: "#9C5700" };
  if (/ON\s*HOLD|HOLD/.test(t)) return { bg: "#FFC7CE", color: "#9C0006" };
  if (/CANCEL/.test(t)) return { bg: "#F2F2F2", color: "#595959" };
  return null;
}

function fallbackColumnFill(_colIdx, _rowIdx, display) {
  const status = statusFallbackStyle(display);
  return status?.bg || "#FFFFFF";
}

function emptyCell() {
  return { display: "", bg: "", color: "", bold: false, align: "left", wrap: true };
}

function formatDateValue(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function excelJsCellDisplay(cell) {
  if (!cell) return "";
  const value = cell.value;

  // Prefer real Date values — ExcelJS often puts Date.toString() into cell.text.
  if (value instanceof Date) return formatDateValue(value);
  if (typeof value === "object" && value) {
    if (value.result instanceof Date) return formatDateValue(value.result);
    if (value.richText) return value.richText.map((p) => p.text || "").join("");
    if (value.text != null && String(value.text).trim() !== "") {
      const t = String(value.text);
      if (/GMT[+-]\d{4}/i.test(t) || /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.+\d{4}/i.test(t)) {
        const d = new Date(t);
        if (!Number.isNaN(d.getTime())) return formatDateValue(d);
      }
      return t;
    }
    if (value.result != null) return String(value.result);
    if (value.formula) {
      return value.result != null ? String(value.result) : "";
    }
  }
  if (cell.text != null && String(cell.text).trim() !== "") {
    const t = String(cell.text);
    if (/GMT[+-]\d{4}/i.test(t) || /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.+\d{4}/i.test(t)) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return formatDateValue(d);
    }
    return t;
  }
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (approx)
    if (value > 20000 && value < 80000) {
      try {
        const d = XLSX.SSF.parse_date_code(value);
        if (d) {
          return formatDateValue(new Date(Date.UTC(d.y, d.m - 1, d.d, 12)));
        }
      } catch {
        /* fall through */
      }
    }
    return String(value);
  }
  return String(value);
}

function colLettersToIndex(letters) {
  let n = 0;
  const s = String(letters || "").toUpperCase();
  for (let i = 0; i < s.length; i += 1) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

function decodeExcelRef(ref) {
  const match = String(ref || "")
    .toUpperCase()
    .match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return { r: Number(match[2]) - 1, c: colLettersToIndex(match[1]) };
}

function clampMatrix(matrix, merges = [], colWidths = []) {
  const rows = (matrix || []).slice(0, MAX_ROWS).map((row) => (row || []).slice(0, MAX_COLS));
  const clippedMerges = (merges || []).filter((m) => m.r1 < MAX_ROWS && m.c1 < MAX_COLS);
  return {
    matrix: rows,
    merges: clippedMerges,
    colWidths: (colWidths || []).slice(0, MAX_COLS),
  };
}

export function resolveSheetCellStyle(cell, rowIdx, colIdx) {
  const display = cell?.display ?? "";
  const status = !cell?.bg ? statusFallbackStyle(display) : null;
  const bg = cell?.bg || fallbackColumnFill(colIdx, rowIdx, display);
  const color = cell?.color || status?.color || (isDarkHex(bg) ? "#FFFFFF" : "#111827");
  const bold = Boolean(cell?.bold);
  const align = cell?.align || (colIdx === 1 ? "left" : "center");
  const minWidth = colIdx === 1 ? 160 : colIdx === 0 ? 56 : 88;
  return { display, bg, color, bold, align, minWidth, wrap: cell?.wrap !== false };
}

export function buildMergeMaps(merges = []) {
  const mergeStarts = new Map();
  const covered = new Set();
  for (const merge of merges) {
    const r1 = merge.r1;
    const c1 = merge.c1;
    const r2 = merge.r2;
    const c2 = merge.c2;
    mergeStarts.set(`${r1}:${c1}`, { rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        if (r === r1 && c === c1) continue;
        covered.add(`${r}:${c}`);
      }
    }
  }
  return { mergeStarts, covered };
}

async function parseWorkbookWithExcelJs(arrayBuffer) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No spreadsheet data found");

  const dimRows = Number(worksheet.dimensions?.bottom) || 0;
  const dimCols = Number(worksheet.dimensions?.right) || 0;
  const rowCount = Math.min(
    Math.max(worksheet.actualRowCount || 0, worksheet.rowCount || 0, dimRows, 1),
    MAX_ROWS
  );
  const colCount = Math.min(
    Math.max(worksheet.actualColumnCount || 0, worksheet.columnCount || 0, dimCols, 1),
    MAX_COLS
  );
  if (!rowCount || !colCount) throw new Error("No spreadsheet data found");

  const matrix = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => emptyCell())
  );

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const r = rowNumber - 1;
      const c = colNumber - 1;
      if (r >= rowCount || c >= colCount) return;

      const fill = cell.fill || {};
      const fg =
        fill.type === "pattern"
          ? excelArgbToCss(fill.fgColor) || excelArgbToCss(fill.bgColor)
          : excelArgbToCss(fill.fgColor);
      const font = cell.font || {};
      const align = (cell.alignment && cell.alignment.horizontal) || "left";

      matrix[r][c] = {
        display: excelJsCellDisplay(cell),
        bg: fg && !/^#(ffffff|000000)$/i.test(fg) ? fg : "",
        color: excelArgbToCss(font.color),
        bold: Boolean(font.bold),
        align,
        wrap: cell.alignment?.wrapText !== false,
      };
    });
  });

  const merges = [];
  const mergeModel = (worksheet.model && worksheet.model.merges) || [];
  for (const ref of mergeModel) {
    const [start, end] = String(ref).split(":");
    const s = decodeExcelRef(start);
    const e = decodeExcelRef(end || start);
    if (s && e) merges.push({ r1: s.r, c1: s.c, r2: e.r, c2: e.c });
  }

  if (!merges.length && worksheet._merges) {
    for (const merge of Object.values(worksheet._merges)) {
      merges.push({
        r1: merge.top - 1,
        c1: merge.left - 1,
        r2: merge.bottom - 1,
        c2: merge.right - 1,
      });
    }
  }

  const colWidths = [];
  for (let c = 1; c <= colCount; c += 1) {
    const width = Number(worksheet.getColumn(c)?.width);
    colWidths.push(Number.isFinite(width) && width > 0 ? Math.round(width * 7.5) : 0);
  }

  return clampMatrix(matrix, merges, colWidths);
}

function parseWorkbookWithXlsx(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) throw new Error("No spreadsheet data found");

  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!range) throw new Error("No spreadsheet data found");

  const rowCount = Math.min(range.e.r - range.s.r + 1, MAX_ROWS);
  const colCount = Math.min(range.e.c - range.s.c + 1, MAX_COLS);
  const matrix = [];
  for (let r = 0; r < rowCount; r += 1) {
    const row = [];
    for (let c = 0; c < colCount; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c })] || {};
      const value = cell.v != null ? cell.v : "";
      row.push({
        display:
          value instanceof Date
            ? formatDateValue(value)
            : cell.w != null && cell.w !== ""
              ? String(cell.w)
              : String(value),
        bg: "",
        color: "",
        bold: false,
        align: c === 0 || c >= 2 ? "center" : "left",
        wrap: true,
      });
    }
    matrix.push(row);
  }

  const merges = (Array.isArray(sheet["!merges"]) ? sheet["!merges"] : []).map((m) => ({
    r1: m.s.r - range.s.r,
    c1: m.s.c - range.s.c,
    r2: m.e.r - range.s.r,
    c2: m.e.c - range.s.c,
  }));

  const colWidths = (Array.isArray(sheet["!cols"]) ? sheet["!cols"] : []).map((col) => {
    const width = Number(col?.wpx || (col?.wch ? col.wch * 7.5 : 0));
    return Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
  });

  return clampMatrix(matrix, merges, colWidths);
}

export function matrixFromPlainRows(rows) {
  const matrix = (rows || []).map((row) =>
    (row || []).map((value) => ({
      ...emptyCell(),
      display: value == null ? "" : String(value),
    }))
  );
  return clampMatrix(matrix);
}

export async function loadExcelSheetFromBuffer(arrayBuffer, fileName = "") {
  const lowerName = String(fileName || "").toLowerCase();
  const isLegacy =
    lowerName.includes(".csv") || (lowerName.includes(".xls") && !lowerName.includes(".xlsx"));

  if (isLegacy) return parseWorkbookWithXlsx(arrayBuffer);

  try {
    return await parseWorkbookWithExcelJs(arrayBuffer);
  } catch {
    return parseWorkbookWithXlsx(arrayBuffer);
  }
}

export function sheetHasContent(sheet) {
  const matrix = sheet?.matrix;
  if (!Array.isArray(matrix) || !matrix.length) return false;
  return matrix.some((row) => (row || []).some((cell) => String(cell?.display || "").trim()));
}

export function isStatusHeaderText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return /\bstatus\b|^work\s*update$|^work\s*updates?$|^updates?(?:\s+written)?$/i.test(text);
}

/** Columns containing status or work-update headers (e.g. WORK STATUS). */
export function findStatusHeaderColumns(matrix, headerRows = 15) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const colCount = matrix.reduce((max, row) => Math.max(max, (row || []).length), 0);
  const limit = Math.min(matrix.length, Math.max(1, headerRows));
  const hidden = [];
  for (let c = 0; c < colCount; c += 1) {
    for (let r = 0; r < limit; r += 1) {
      if (isStatusHeaderText(matrix[r]?.[c]?.display ?? matrix[r]?.[c])) {
        hidden.push(c);
        break;
      }
    }
  }
  return hidden;
}

/**
 * Drop status-header columns and remap merges so the preview keeps planning/time
 * columns only (mirrors Excel without WORK STATUS / status pairs).
 */
export function omitStatusHeaderColumns(sheet) {
  const matrix = sheet?.matrix;
  if (!Array.isArray(matrix) || !matrix.length) {
    return sheet || { matrix: [], merges: [], colWidths: [] };
  }

  const hidden = findStatusHeaderColumns(matrix);
  if (!hidden.length) {
    return {
      matrix,
      merges: Array.isArray(sheet.merges) ? sheet.merges : [],
      colWidths: Array.isArray(sheet.colWidths) ? sheet.colWidths : [],
    };
  }

  const hide = new Set(hidden);
  const colCount = matrix.reduce((max, row) => Math.max(max, (row || []).length), 0);
  const map = new Map();
  let next = 0;
  for (let c = 0; c < colCount; c += 1) {
    if (hide.has(c)) continue;
    map.set(c, next);
    next += 1;
  }

  const nextMatrix = matrix.map((row) => {
    const out = [];
    for (let c = 0; c < colCount; c += 1) {
      if (hide.has(c)) continue;
      out.push(row?.[c] || emptyCell());
    }
    return out;
  });

  const nextWidths = [];
  for (let c = 0; c < colCount; c += 1) {
    if (hide.has(c)) continue;
    nextWidths.push(Number(sheet.colWidths?.[c]) || 0);
  }

  const nextMerges = [];
  for (const merge of Array.isArray(sheet.merges) ? sheet.merges : []) {
    const kept = [];
    for (let c = merge.c1; c <= merge.c2; c += 1) {
      if (!hide.has(c) && map.has(c)) kept.push(map.get(c));
    }
    if (!kept.length) continue;
    nextMerges.push({
      r1: merge.r1,
      r2: merge.r2,
      c1: Math.min(...kept),
      c2: Math.max(...kept),
    });
  }

  return { matrix: nextMatrix, merges: nextMerges, colWidths: nextWidths };
}
