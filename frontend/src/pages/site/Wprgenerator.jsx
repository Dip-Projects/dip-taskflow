import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { ensureSiteBucket, sanitizeBucketName, SITE_FILES_BUCKET, uploadViaApi } from '../../lib/ensureBucket';
import generatePPT from "./pptGenerator";
import PptxGenJS from "pptxgenjs";
// ─── CSS ────────────────────────────────────────────────────────────────────
import "./Wprgenerator.css";

const STANDARD_SECTIONS = [
  "Detailed Status of Activities",
  "Graphical Report of Work",
  "Site Photographs",
  "Cube Testing Register",
  "Next Week Planning",
  "Drawing Register",
  "Office Activity",
  "Visitor Register",
  "Drawing & Decision Pending",
  "Weekly Site Checklist",
  "Delay Points / Highlights / Red Flag",
  "MOM Review",
  "Barchart & Worksheet",
];

const VISITOR_TYPES = [
  "Architect",
  "Structural Engineer",
  "Client / Owner",
  "Contractor",
  "Sub-Contractor",
  "Supplier",
  "Government Inspector",
  "Consultant",
  "PMC Representative",
  "Bank / Finance Officer",
];

const zp = (n) => String(parseInt(n) || 1).padStart(2, "0");
const today = () => new Date().toISOString().split("T")[0];

// ─── HEIC loader (lazy) ──────────────────────────────────────────────────────
// ─── HEIC loader (lazy) ──────────────────────────────────────────────────────
let _heic2anyPromise = null;
function loadHeic2Any() {
  if (_heic2anyPromise) return _heic2anyPromise;
  _heic2anyPromise = new Promise((resolve, reject) => {
    if (window.heic2any) {
      resolve(window.heic2any);
      return;
    }
    const s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js";
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => {
      _heic2anyPromise = null;
      reject(new Error("Could not load HEIC converter"));
    };
    document.head.appendChild(s);
  });
  return _heic2anyPromise;
}

// ─── Processing counter (module-level so processImage can reach it) ───────────
let _wprProcessingCount = 0;
function _wprBumpProcessing(delta) {
  _wprProcessingCount = Math.max(0, _wprProcessingCount + delta);
  // Drive the toast DOM directly — no React render cycle delay
  const el = document.getElementById("wpr-proc-toast");
  const ct = document.getElementById("wpr-proc-count");
  if (el) el.style.display = _wprProcessingCount > 0 ? "flex" : "none";
  if (ct)
    ct.textContent = `Processing ${_wprProcessingCount} image${_wprProcessingCount !== 1 ? "s" : ""}…`;
  // Also fire event so React state stays in sync (for SSR / unmount cleanup)
  window.dispatchEvent(
    new CustomEvent("wpr:processing", {
      detail: { count: _wprProcessingCount },
    }),
  );
}

// ─── Image processing (HEIC + resize + compress) ─────────────────────────────
async function processImage(
  file,
  maxW = 1920,
  maxSizeKB = 800,
  quality = 0.82,
) {
  _wprBumpProcessing(+1);
  try {
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      /\.(heic|heif)$/i.test(file.name);

    let sourceBlob = file;

    if (isHeic) {
      try {
        const heic2any = await loadHeic2Any();
        const converted = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.92,
        });
        sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      } catch (err) {
        console.warn("HEIC conversion failed, trying raw:", err);
      }
    }

    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(sourceBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        let q = quality;
        let result = canvas.toDataURL("image/jpeg", q);
        while (result.length / 1024 > maxSizeKB * 1.37 && q > 0.3) {
          q -= 0.06;
          result = canvas.toDataURL("image/jpeg", q);
        }
        resolve(result);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image load failed"));
      };
      img.src = url;
    });
  } finally {
    _wprBumpProcessing(-1);
  }
}

function readFileAsDataUrl(file) {
  return processImage(file);
}
function dataUrlToBase64(dataUrl) {
  return dataUrl.split(",")[1] || "";
}
function getMime(dataUrl) {
  return dataUrl.split(";")[0].split(":")[1] || "image/jpeg";
}
function toPptxData(dataUrl) {
  const mime = getMime(dataUrl);
  const b64 = dataUrlToBase64(dataUrl);
  return `${mime};base64,${b64}`;
}
function bucketNameFor(_site) {
  return SITE_FILES_BUCKET;
}

async function ensureBucket(_supabaseClient, site) {
  return ensureSiteBucket(site);
}

function buildSiteDatePath(date) {
  const [year, month, day] = date.split("-");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthName = monthNames[parseInt(month, 10) - 1];
  const dayFolder = `${day}-${month}-${year}`;
  return `${year}/${monthName}/${dayFolder}`;
}

function safeNamePart(s) {
  return (s || "")
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 30);
}
async function uploadImage(_supabase, _bucketName, dataUrl, path) {
  return uploadViaApi({
    path,
    dataUrl,
    contentType: getMime(dataUrl) || "image/jpeg",
    bucket: SITE_FILES_BUCKET,
  });
}

async function uploadBlob(_supabase, _bucketName, blob, path, contentType) {
  return uploadViaApi({
    path,
    blob,
    contentType: contentType || "application/octet-stream",
    bucket: SITE_FILES_BUCKET,
  });
}
function isOfficeFile(url) {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop().toLowerCase();
  return ["ppt", "pptx", "doc", "docx", "xls", "xlsx"].includes(ext);
}

function getExtensionFromUrl(url, fallback = "") {
  if (!url) return fallback;
  try {
    const clean = url.split("?")[0].split("#")[0];
    const ext = clean.split(".").pop().toLowerCase();
    if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return ext;
  } catch (_) {}
  return fallback;
}

const mimeToExt = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
};

async function forceDownload(url, filenameBase) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = mimeToExt[blob.type] || getExtensionFromUrl(url, "");
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = ext ? `${filenameBase}.${ext}` : filenameBase;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Download failed:", err);
    window.open(url, "_blank");
  }
}

function resolveViewUrl(url) {
  if (!url) return url;
  return isOfficeFile(url)
    ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
    : url;
}
// ─── Excel parsing via SheetJS ───────────────────────────────────────────────
let _xlsxPromise = null;
function loadXlsx() {
  if (_xlsxPromise) return _xlsxPromise;

  const sources = [
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];

  const isReady = () => window.XLSX && typeof window.XLSX.read === "function";

  const tryLoad = (i) =>
    new Promise((resolve, reject) => {
      if (isReady()) {
        resolve(window.XLSX);
        return;
      }
      if (i >= sources.length) {
        reject(
          new Error(
            "Could not load the Excel library (XLSX). Check your internet connection or try again.",
          ),
        );
        return;
      }
      const existing = document.querySelector(`script[src="${sources[i]}"]`);
      const s = existing || document.createElement("script");
      s.src = sources[i];
      s.onload = () => {
        if (isReady()) resolve(window.XLSX);
        else tryLoad(i + 1).then(resolve, reject);
      };
      s.onerror = () => tryLoad(i + 1).then(resolve, reject);
      if (!existing) document.head.appendChild(s);
      else if (isReady()) resolve(window.XLSX); // script tag already present & loaded
    });

  _xlsxPromise = tryLoad(0).catch((err) => {
    _xlsxPromise = null; // allow retry on next upload attempt
    throw err;
  });
  return _xlsxPromise;
}
function isExcelFile(file) {
  const excelTypes = ["application", "JSON", "xlsx", "pdf", "doc"];
  const excelExtensions = [".xlsx", ".xls", ".xlsm", ".xlsb", ".csv"];
  const fileType = file.type;
  const fileName = file.name.toLowerCase();
  const hasExcelType = excelTypes.includes(fileType);
  const hasExcelExtension = excelExtensions.some((ext) =>
    fileName.endsWith(ext),
  );
  return hasExcelType || hasExcelExtension;
  for (let i = 0; i < excelExtensions.length; i++) {
    if (fileName.endsWith(excelExtensions[i])) {
      return true;
    } else if (fileType === excelTypes[i]) {
      return fileType[i] + " " + fileName[i] + "is an excel file";
    } else {
      console.log("Error occured in file checking.");
      return false;
    }
  }
}
function rederExcel(excelFile) {
  for (let i = 0; i < excelFile.length; i++) {
    if (isExcelFile(excelFile[i])) {
      console.log(excelFile[i].name + " is an excel file");
    } else {
      console.log("Erro occured while checking file type.");
    }
  }
}

// Parse an Excel file
async function parseExcel(file) {
  const XLSX = await loadXlsx();
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const sheets = {};
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const merges = (ws["!merges"] || []).map((m) => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c },
    }));
    sheets[name] = { raw, merges };
  });
  return { sheetNames: wb.SheetNames, sheets };
}

// Convert col index (0-based) → letter (A, B, …, Z, AA, …)
function colLetter(n) {
  let s = "";
  n++;
  while (n > 0) {
    s = String.fromCharCode(((n - 1) % 26) + 65) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function wrapTextToLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width <= maxWidth || !current) {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    let tail = lines.slice(maxLines - 1).join(" ");
    while (ctx.measureText(tail + "…").width > maxWidth && tail.length > 1) {
      tail = tail.slice(0, -1);
    }
    head.push(tail + "…");
    return head;
  }
  return lines;
}
function measureWrappedWidth(
  ctx,
  text,
  font,
  maxLines = 2,
  minW = 80,
  maxW = 260,
  step = 8,
) {
  ctx.font = font;
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return minW;

  for (let w = minW; w <= maxW; w += step) {
    const maxTextW = w - 14;
    const lines = [];
    let current = "";
    let fits = true;

    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width <= maxTextW || !current) {
        current = test;
      } else {
        lines.push(current);
        current = word;
        if (lines.length >= maxLines) {
          fits = false;
          break;
        }
      }
    }
    if (fits) {
      if (current) lines.push(current);
      if (lines.length <= maxLines) return w; // smallest width that fits cleanly
    }
  }
  return maxW; // nothing under maxW worked — use the cap
}
// ─── Auto-detect header rows from a sheet ──────────────────────────────────
function detectHeaderInfo(raw, merges) {
  if (!raw || !raw.length)
    return { titleRows: [], labelRows: [], headerEnd: -1 };

  const wideMergeRows = new Set();
  (merges || []).forEach((m) => {
    if (m.s.r === m.e.r && m.e.c - m.s.c >= 2) wideMergeRows.add(m.s.r);
  });

  const SCAN_LIMIT = Math.min(raw.length, 10);
  const titleRows = [];
  let r = 0;

  while (r < SCAN_LIMIT) {
    const row = raw[r] || [];
    const filled = row.filter((c) => c !== "" && c != null);
    if (!filled.length) {
      r++;
      continue;
    }
    const isWideMerge = wideMergeRows.has(r);
    const isSingleCellRow = filled.length === 1 && row.length > 1;
    if (isWideMerge || isSingleCellRow) {
      titleRows.push(r);
      r++;
      continue;
    }
    break;
  }

  const labelRows = [];
  while (r < SCAN_LIMIT) {
    const row = raw[r] || [];
    const filled = row.filter((c) => c !== "" && c != null);
    if (!filled.length) break;
    const numericCount = filled.filter(
      (c) => !isNaN(parseFloat(c)) && isFinite(c),
    ).length;
    const mostlyText = numericCount / filled.length < 0.4;
    if (mostlyText && filled.length >= 2) {
      labelRows.push(r);
      r++;
    } else break;
  }

  const headerEnd = labelRows.length
    ? labelRows[labelRows.length - 1]
    : titleRows.length
      ? titleRows[titleRows.length - 1]
      : -1;

  return { titleRows, labelRows, headerEnd };
}
// ADD this helper function right above renderTableImage
const yieldToMain = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
// Render a branded band + auto-detected header rows + a chunk of data rows to a canvas image
async function renderTableImageAsync({
  raw,
  headerInfo,
  dataR1,
  dataR2,
  c1,
  c2,
  bandText,
  sectionLabel,
}) {
  const MAX_COLS_PER_IMAGE = 15;
  const allSelectedCols = Array.from({ length: c2 - c1 + 1 }, (_, i) => i + c1);
  const cols = allSelectedCols.slice(0, MAX_COLS_PER_IMAGE);
  if (!cols.length || dataR2 < dataR1) return null;

  const titleRows = headerInfo?.titleRows || [];
  const labelRows = headerInfo?.labelRows || [];
  const useFallbackColHeader = labelRows.length === 0;

  const MAX_CANVAS_W = 900;
  const idealCellW = Math.floor((MAX_CANVAS_W - 24) / cols.length);
  const CELL_W = Math.max(40, Math.min(90, idealCellW));
  const CELL_H = 26,
    BAND_H = 38,
    TITLE_H = 22,
    LABEL_H = 24,
    PAD = 12;

  const dataRows = [];
  for (let r = dataR1; r <= dataR2; r++) dataRows.push(raw[r] || []);

  const titleBlockH = titleRows.length * TITLE_H;
  const labelBlockH = useFallbackColHeader
    ? LABEL_H
    : labelRows.length * LABEL_H;
  const W = PAD * 2 + cols.length * CELL_W;
  const H = BAND_H + titleBlockH + labelBlockH + dataRows.length * CELL_H + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  let y = 0;

  // Branded band
  const grad = ctx.createLinearGradient(0, 0, W, BAND_H);
  grad.addColorStop(0, "#3d1200");
  grad.addColorStop(0.5, "#7a2e00");
  grad.addColorStop(1, "#c96a10");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, W, BAND_H);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(bandText || sectionLabel, PAD, y + BAND_H / 2);
  if (bandText && sectionLabel && bandText !== sectionLabel) {
    ctx.fillStyle = "rgba(255,207,160,0.85)";
    ctx.font = "11px Arial, sans-serif";
    const tw = ctx.measureText(sectionLabel).width;
    ctx.fillText(sectionLabel, W - PAD - tw, y + BAND_H / 2);
  }
  y += BAND_H;

  // Title rows
  titleRows.forEach((rIdx) => {
    const row = raw[rIdx] || [];
    const text = row.find((c) => c !== "" && c != null) ?? "";
    ctx.fillStyle = "#fdf3e7";
    ctx.fillRect(0, y, W, TITLE_H);
    ctx.strokeStyle = "rgba(201,106,16,0.3)";
    ctx.lineWidth = 0.75;
    ctx.strokeRect(0, y, W, TITLE_H);
    ctx.fillStyle = "#7a2e00";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text), PAD, y + TITLE_H / 2);
    y += TITLE_H;
  });

  // Label rows
  if (!useFallbackColHeader) {
    labelRows.forEach((rIdx) => {
      const row = raw[rIdx] || [];
      ctx.fillStyle = "#f0e4d4";
      ctx.fillRect(0, y, W, LABEL_H);
      cols.forEach((ci, xi) => {
        const x = PAD + xi * CELL_W;
        const val = String(row[ci] ?? "");
        ctx.fillStyle = "#3d1200";
        ctx.font = "bold 11.5px Arial, sans-serif";
        ctx.textBaseline = "middle";
        let text = val;
        const maxTW = CELL_W - 10;
        while (ctx.measureText(text).width > maxTW && text.length > 1)
          text = text.slice(0, -1) + "…";
        ctx.fillText(text, x + 5, y + LABEL_H / 2);
        if (xi > 0) {
          ctx.strokeStyle = "rgba(201,106,16,0.3)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + LABEL_H);
          ctx.stroke();
        }
      });
      ctx.strokeStyle = "#c96a10";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + LABEL_H);
      ctx.lineTo(W, y + LABEL_H);
      ctx.stroke();
      y += LABEL_H;
    });
  } else {
    ctx.fillStyle = "#f5f0e8";
    ctx.fillRect(0, y, W, LABEL_H);
    cols.forEach((ci, xi) => {
      const x = PAD + xi * CELL_W;
      const label = colLetter(ci);
      ctx.fillStyle = "#7a2e00";
      ctx.font = "bold 10px Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(
        label,
        x + CELL_W / 2 - ctx.measureText(label).width / 2,
        y + LABEL_H / 2,
      );
      if (xi > 0) {
        ctx.strokeStyle = "rgba(201,106,16,0.25)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + LABEL_H);
        ctx.stroke();
      }
    });
    y += LABEL_H;
  }

  // ── DATA ROWS: draw in chunks of 30, yielding between each chunk ──
  const CHUNK = 30;
  for (let start = 0; start < dataRows.length; start += CHUNK) {
    // Yield to browser between chunks — this is what prevents freezing
    await new Promise((resolve) => setTimeout(resolve, 0));

    const end = Math.min(start + CHUNK, dataRows.length);
    for (let ri = start; ri < end; ri++) {
      const row = dataRows[ri];
      const ry = y + ri * CELL_H;
      ctx.fillStyle = ri % 2 === 0 ? "#ffffff" : "#fdf9f4";
      ctx.fillRect(0, ry, W, CELL_H);
      ctx.strokeStyle = "rgba(201,106,16,0.18)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, ry + CELL_H);
      ctx.lineTo(W, ry + CELL_H);
      ctx.stroke();
      cols.forEach((ci, xi) => {
        const x = PAD + xi * CELL_W;
        const val = String(row[ci] ?? "");
        ctx.fillStyle = "#1c1917";
        ctx.font = "12px Arial, sans-serif";
        ctx.textBaseline = "middle";
        const maxTW = CELL_W - 8;
        let text = val;
        while (ctx.measureText(text).width > maxTW && text.length > 1)
          text = text.slice(0, -1) + "…";
        ctx.fillText(text, x + 4, ry + CELL_H / 2);
        if (xi > 0) {
          ctx.strokeStyle = "rgba(201,106,16,0.15)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, ry);
          ctx.lineTo(x, ry + CELL_H);
          ctx.stroke();
        }
      });
    }
  }

  ctx.strokeStyle = "#c96a10";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, W, H);

  return await new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(canvas.toDataURL("image/jpeg", 0.85));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.7,
    );
  });
}

// ─── Load pptxgenjs (npm package first, CDN fallback) ─────────────────────────
let _pptxPromise = null;
function loadPptxGen() {
  if (_pptxPromise) return _pptxPromise;
  _pptxPromise = new Promise((resolve, reject) => {
    if (window.PptxGenJS) {
      resolve(window.PptxGenJS);
      return;
    }
    // Prefer bundled package (works offline / on :4000 without CDN)
    try {
      const mod = PptxGenJS?.default || PptxGenJS;
      if (mod) {
        window.PptxGenJS = mod;
        resolve(mod);
        return;
      }
    } catch (_) { /* fall through to CDN */ }

    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js";
    script.onload = () => {
      if (window.PptxGenJS) resolve(window.PptxGenJS);
      else reject(new Error("PptxGenJS loaded but not available on window"));
    };
    script.onerror = () =>
      reject(new Error("Failed to load PptxGenJS — check network or npm install pptxgenjs"));
    document.head.appendChild(script);
  });
  return _pptxPromise;
}

function ExcelRangeCapture({
  items,
  setItems,
  sectionLabel,
  headerText,
  setHeaderText,
}) {
  const [mode, setMode] = useState("images");
  const [capturing, setCapturing] = useState(false);
  const [workbook, setWorkbook] = useState(null);
  const [activeSheet, setActiveSheet] = useState("");
  const [xlLoading, setXlLoading] = useState(false);
  const [xlFileName, setXlFileName] = useState("");
  const [xlError, setXlError] = useState("");
  const [headerInfo, setHeaderInfo] = useState({
    titleRows: [],
    labelRows: [],
    headerEnd: -1,
  });
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rowsPerImage, setRowsPerImage] = useState(8);
  const [zoom, setZoom] = useState(1);
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 });
  const photoRef = useRef();
  const xlRef = useRef();
  const tableRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const wrapperRef = useRef(null);
  const hTrackRef = useRef(null),
    hThumbRef = useRef(null);
  const vTrackRef = useRef(null),
    vThumbRef = useRef(null);
  const dragStateRef = useRef({ axis: null, startPos: 0, startScroll: 0 });
  const sheetData = workbook?.sheets?.[activeSheet]?.raw || [];
  const sheetMerges = workbook?.sheets?.[activeSheet]?.merges || [];
  const maxCols = sheetData.reduce(
    (m, r) => Math.max(m, Array.isArray(r) ? r.length : 0),
    0,
  );

  useEffect(() => {
    if (!workbook || !activeSheet) {
      setHeaderInfo({ titleRows: [], labelRows: [], headerEnd: -1 });
      return;
    }
    setHeaderInfo(detectHeaderInfo(sheetData, sheetMerges));
    setSelStart(null);
    setSelEnd(null);
  }, [workbook, activeSheet]);

  const handleXlFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlLoading(true);
    setXlError("");
    setXlFileName(file.name);
    try {
      const wb = await parseExcel(file);
      setWorkbook(wb);
      setActiveSheet(wb.sheetNames[0] || "");
    } catch (err) {
      setXlError(err.message || "Failed to parse Excel file.");
      setWorkbook(null);
    }
    setXlLoading(false);
    e.target.value = "";
  };

  const getNorm = () => {
    if (!selStart || !selEnd) return null;
    return {
      r1: Math.min(selStart.r, selEnd.r),
      r2: Math.max(selStart.r, selEnd.r),
      c1: Math.min(selStart.c, selEnd.c),
      c2: Math.max(selStart.c, selEnd.c),
    };
  };
  const isSel = (r, c) => {
    const n = getNorm();
    if (!n) return false;
    return r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2;
  };
  const isSelStart = (r, c) => selStart?.r === r && selStart?.c === c;
  const isHeaderRow = (r) => r <= (headerInfo?.headerEnd ?? -1);

  // ── Draw image from selected range ──────────────────────────────────────────
  const drawRangeImage = async (r1, r2, c1, c2) => {
    const titleRows = headerInfo?.titleRows || [];
    const labelRows = headerInfo?.labelRows || [];
    const useFallback = labelRows.length === 0;
    const cols = Array.from({ length: c2 - c1 + 1 }, (_, i) => i + c1);
    const dataSlice = [];
    for (let r = r1; r <= r2; r++) dataSlice.push(sheetData[r] || []);

    // merge spans
    const mergeSpansByRow = {};
    (sheetMerges || []).forEach((m) => {
      if (m.s.r === m.e.r) {
        const span = m.e.c - m.s.c + 1;
        if (span > 1) {
          if (!mergeSpansByRow[m.s.r]) mergeSpansByRow[m.s.r] = [];
          mergeSpansByRow[m.s.r].push({ startCol: m.s.c, span });
        }
      }
    });
    const isMergeCont = (ri, ci) =>
      (mergeSpansByRow[ri] || []).some(
        (s) => ci > s.startCol && ci < s.startCol + s.span,
      );

    const BH = 48,
      TH = 30,
      LH = 50,
      PAD = 14;
    const BASE_CH = 40,
      LINE_H = 18,
      MAX_LINES = 6;
    const mc = document.createElement("canvas");
    const mctx = mc.getContext("2d");

    const colWidths = cols.map((ci) => {
      let maxW = 70;
      mctx.font = "bold 13px Arial,sans-serif";
      labelRows.forEach((ri) => {
        const t = String((sheetData[ri] || [])[ci] ?? "");
        maxW = Math.max(
          maxW,
          measureWrappedWidth(
            mctx,
            t,
            "bold 13px Arial,sans-serif",
            2,
            70,
            260,
            8,
          ),
        );
      });
      mctx.font = "14px Arial,sans-serif";
      dataSlice.forEach((row) => {
        const t = String(row[ci] ?? "");
        maxW = Math.max(maxW, mctx.measureText(t).width + 18);
      });
      return Math.min(Math.max(maxW, 70), 260);
    });

    const colX = [];
    let acc = PAD;
    colWidths.forEach((w) => {
      colX.push(acc);
      acc += w;
    });

    const W = PAD + acc;
    // Initial canvas — height will be recalculated after text measurement
    const SCALE = 2;
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = 10; // temp, resized below after measurement
    const ctx = canvas.getContext("2d");
    // don't scale yet — measure first at 1x

    let y = 0; // will be reset after resize

    // data rows
    // ── pre-calculate each row's wrapped lines and height ──
    const FONT_DATA = "13px Arial,sans-serif";
    ctx.font = FONT_DATA;

    const rowWrapped = dataSlice.map((row) => {
      return cols.map((ci, xi) => {
        const text = String(row[ci] ?? "");
        const maxW = colWidths[xi] - 14;
        // wrap into lines
        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) return { lines: [""], lineCount: 1 };
        const lines = [];
        let cur = "";
        for (const word of words) {
          const test = cur ? cur + " " + word : word;
          if (ctx.measureText(test).width <= maxW || !cur) {
            cur = test;
          } else {
            lines.push(cur);
            cur = word;
          }
        }
        if (cur) lines.push(cur);
        return { lines, lineCount: lines.length };
      });
    });

    // row heights based on max lines across all cols
    const rowHeights = rowWrapped.map((cols) => {
      const maxLines = Math.max(...cols.map((c) => c.lineCount), 1);
      const capped = Math.min(maxLines, MAX_LINES);
      return Math.max(BASE_CH, capped * LINE_H + 14);
    });

    // recalculate total H now that we know real row heights
    const dataH = rowHeights.reduce((a, b) => a + b, 0);
    const totalH =
      BH +
      titleRows.length * TH +
      (useFallback ? LH : labelRows.length * LH) +
      dataH +
      PAD;

    // resize canvas to new height
    canvas.height = totalH * SCALE;
    ctx.scale(SCALE, SCALE);
    // re-draw white background on resized canvas
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, totalH);

    // re-draw everything from scratch on resized canvas
    // (re-run brand header, title rows, label rows which were already drawn —
    //  we need to redo since canvas resize clears it)

    // ── RE-DRAW brand header ──
    y = 0;
    const grad2 = ctx.createLinearGradient(0, 0, W, BH);
    grad2.addColorStop(0, "#3d1200");
    grad2.addColorStop(0.5, "#7a2e00");
    grad2.addColorStop(1, "#c96a10");
    ctx.fillStyle = grad2;
    ctx.fillRect(0, y, W, BH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial,sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(headerText || sectionLabel, PAD, y + BH / 2);
    y += BH;

    // ── RE-DRAW title rows ──
    titleRows.forEach((ri) => {
      const row = sheetData[ri] || [];
      ctx.fillStyle = "#fdf3e7";
      ctx.fillRect(0, y, W, TH);
      ctx.strokeStyle = "rgba(201,106,16,0.35)";
      ctx.lineWidth = 0.75;
      ctx.strokeRect(0, y, W, TH);
      ctx.fillStyle = "#7a2e00";
      ctx.font = "bold 15px Arial,sans-serif";
      ctx.textBaseline = "middle";
      cols.forEach((ci) => {
        if (isMergeCont(ri, ci)) return;
        const val = row[ci];
        if (val === "" || val == null) return;
        ctx.fillText(
          String(val),
          (colX[cols.indexOf(ci)] ?? PAD) + 6,
          y + TH / 2,
        );
      });
      y += TH;
    });

    // ── RE-DRAW label rows ──
    if (!useFallback) {
      labelRows.forEach((ri) => {
        const row = sheetData[ri] || [];
        ctx.fillStyle = "#f0e4d4";
        ctx.fillRect(0, y, W, LH);
        cols.forEach((ci, xi) => {
          const x = colX[xi],
            cw = colWidths[xi];
          ctx.fillStyle = "#3d1200";
          ctx.font = "bold 12.5px Arial,sans-serif";
          ctx.textBaseline = "middle";
          const lines = wrapTextToLines(ctx, String(row[ci] ?? ""), cw - 14, 2);
          const lh = 15,
            startY = y + LH / 2 - ((lines.length - 1) * lh) / 2;
          lines.forEach((line, li) =>
            ctx.fillText(line, x + 6, startY + li * lh),
          );
          if (xi > 0) {
            ctx.strokeStyle = "rgba(201,106,16,0.3)";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + LH);
            ctx.stroke();
          }
        });
        ctx.strokeStyle = "#c96a10";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + LH);
        ctx.lineTo(W, y + LH);
        ctx.stroke();
        y += LH;
      });
    } else {
      ctx.fillStyle = "#f5f0e8";
      ctx.fillRect(0, y, W, LH);
      cols.forEach((ci, xi) => {
        const x = colX[xi];
        ctx.fillStyle = "#7a2e00";
        ctx.font = "bold 12px Arial,sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(colLetter(ci), x + 6, y + LH / 2);
        if (xi > 0) {
          ctx.strokeStyle = "rgba(201,106,16,0.25)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + LH);
          ctx.stroke();
        }
      });
      y += LH;
    }

    // ── data rows with full text wrapping ──
    dataSlice.forEach((row, ri) => {
      const rh = rowHeights[ri];
      const ry = y;
      ctx.fillStyle = ri % 2 === 0 ? "#ffffff" : "#fdf9f4";
      ctx.fillRect(0, ry, W, rh);
      ctx.strokeStyle = "rgba(201,106,16,0.18)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, ry + rh);
      ctx.lineTo(W, ry + rh);
      ctx.stroke();

      cols.forEach((ci, xi) => {
        const x = colX[xi];
        const cw = colWidths[xi];
        const { lines } = rowWrapped[ri][xi];
        const shown = lines.slice(0, MAX_LINES);
        const totalTextH = shown.length * LINE_H;
        const startY = ry + (rh - totalTextH) / 2 + LINE_H / 2;

        ctx.fillStyle = "#1c1917";
        ctx.font = FONT_DATA;
        ctx.textBaseline = "middle";

        shown.forEach((line, li) => {
          ctx.fillText(line, x + 6, startY + li * LINE_H);
        });

        if (xi > 0) {
          ctx.strokeStyle = "rgba(201,106,16,0.15)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, ry);
          ctx.lineTo(x, ry + rh);
          ctx.stroke();
        }
      });

      y += rh;
    });

    ctx.strokeStyle = "#c96a10";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, W, totalH);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(canvas.toDataURL("image/jpeg", 0.9));
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => resolve(canvas.toDataURL("image/jpeg", 0.9));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.9,
      );
    });
  };

  const getScrollContainer = () =>
    tableRef.current?.closest(".wpr-xl-table-wrap");
  const updateScrollbars = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const hTrack = hTrackRef.current,
      hThumb = hThumbRef.current;
    const vTrack = vTrackRef.current,
      vThumb = vThumbRef.current;

    if (hTrack && hThumb) {
      const trackW = hTrack.clientWidth;
      const ratio = el.clientWidth / el.scrollWidth;
      const thumbW = Math.max(40, ratio * trackW);
      const maxScroll = el.scrollWidth - el.clientWidth;
      const left =
        maxScroll > 0 ? (el.scrollLeft / maxScroll) * (trackW - thumbW) : 0;
      hThumb.style.width = thumbW + "px";
      hThumb.style.transform = `translateX(${left}px)`;
      hTrack.style.display = ratio >= 0.999 ? "none" : "block";
    }
    if (vTrack && vThumb) {
      const trackH = vTrack.clientHeight;
      const ratio = el.clientHeight / el.scrollHeight;
      const thumbH = Math.max(40, ratio * trackH);
      const maxScroll = el.scrollHeight - el.clientHeight;
      const top =
        maxScroll > 0 ? (el.scrollTop / maxScroll) * (trackH - thumbH) : 0;
      vThumb.style.height = thumbH + "px";
      vThumb.style.transform = `translateY(${top}px)`;
      vTrack.style.display = ratio >= 0.999 ? "none" : "block";
    }
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    updateScrollbars();
    el.addEventListener("scroll", updateScrollbars, { passive: true });
    window.addEventListener("resize", updateScrollbars);
    return () => {
      el.removeEventListener("scroll", updateScrollbars);
      window.removeEventListener("resize", updateScrollbars);
    };
  }, [workbook, activeSheet, zoom, updateScrollbars]);

  const startDrag = (axis) => (e) => {
    e.stopPropagation();
    const t = e.touches ? e.touches[0] : e;
    const el = wrapperRef.current;
    dragStateRef.current = {
      axis,
      startPos: axis === "h" ? t.clientX : t.clientY,
      startScroll: axis === "h" ? el.scrollLeft : el.scrollTop,
    };
  };

  useEffect(() => {
    const move = (e) => {
      const { axis, startPos, startScroll } = dragStateRef.current;
      if (!axis) return;
      e.preventDefault();
      const el = wrapperRef.current;
      const t = e.touches ? e.touches[0] : e;
      if (axis === "h") {
        const trackW = hTrackRef.current.clientWidth,
          thumbW = hThumbRef.current.clientWidth;
        const maxScroll = el.scrollWidth - el.clientWidth;
        const delta = ((t.clientX - startPos) / (trackW - thumbW)) * maxScroll;
        el.scrollLeft = Math.min(maxScroll, Math.max(0, startScroll + delta));
      } else {
        const trackH = vTrackRef.current.clientHeight,
          thumbH = vThumbRef.current.clientHeight;
        const maxScroll = el.scrollHeight - el.clientHeight;
        const delta = ((t.clientY - startPos) / (trackH - thumbH)) * maxScroll;
        el.scrollTop = Math.min(maxScroll, Math.max(0, startScroll + delta));
      }
    };
    const end = () => {
      dragStateRef.current = { axis: null };
    };
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    return () => {
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };
  }, []);
  const autoScroll = (clientX, clientY) => {
    const container = getScrollContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ZONE = 48,
      SPEED = 10;
    clearInterval(scrollTimerRef.current);
    let dx = 0,
      dy = 0;
    if (clientY < rect.top + ZONE) dy = -SPEED;
    if (clientY > rect.bottom - ZONE) dy = SPEED;
    if (clientX < rect.left + ZONE) dx = -SPEED;
    if (clientX > rect.right - ZONE) dx = SPEED;
    if (dx || dy) {
      scrollTimerRef.current = setInterval(() => {
        container.scrollBy(dx, dy);
      }, 16);
    }
  };

  const stopAutoScroll = () => {
    clearInterval(scrollTimerRef.current);
    scrollTimerRef.current = null;
  };

  const cellFromPoint = (clientX, clientY) => {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      if (el.dataset?.r !== undefined && el.dataset?.c !== undefined) {
        return { r: parseInt(el.dataset.r), c: parseInt(el.dataset.c) };
      }
    }
    return null;
  };
  // ── Native touch listeners (passive:false allows preventDefault) ──
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const dist = (t0, t1) =>
      Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        // start pinch — cancel any in-progress cell drag-select
        setIsDragging(false);
        stopAutoScroll();
        pinchRef.current = {
          active: true,
          startDist: dist(e.touches[0], e.touches[1]),
          startZoom: zoom,
        };
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const cell = cellFromPoint(touch.clientX, touch.clientY);
      if (!cell || isHeaderRow(cell.r)) return;
      e.preventDefault();
      setSelStart(cell);
      setSelEnd(cell);
      setIsDragging(true);
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current.active) {
        e.preventDefault();
        const newDist = dist(e.touches[0], e.touches[1]);
        const ratio = newDist / Math.max(pinchRef.current.startDist, 1);
        const next = Math.min(
          3,
          Math.max(0.5, pinchRef.current.startZoom * ratio),
        );
        setZoom(next);
        return;
      }
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      autoScroll(touch.clientX, touch.clientY);
      const cell = cellFromPoint(touch.clientX, touch.clientY);
      if (cell && !isHeaderRow(cell.r)) setSelEnd(cell);
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) pinchRef.current.active = false;
      if (e.touches.length === 0) {
        setIsDragging(false);
        stopAutoScroll();
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, workbook, activeSheet, zoom]);

  const captureSelection = async () => {
    const n = getNorm();
    if (!n) {
      alert("Select a range first by clicking and dragging on the table.");
      return;
    }
    if (n.r1 <= (headerInfo?.headerEnd ?? -1)) {
      alert(
        "Your selection includes header rows — please select only data rows.",
      );
      return;
    }
    setCapturing(true);
    const chunk = Math.max(1, parseInt(rowsPerImage, 10) || 8);
    const newItems = [];
    try {
      // chunk the selected row range into multiple images
      for (let start = n.r1; start <= n.r2; start += chunk) {
        await new Promise((r) => setTimeout(r, 0));
        const end = Math.min(start + chunk - 1, n.r2);
        const dataUrl = await drawRangeImage(start, end, n.c1, n.c2);
        if (dataUrl)
          newItems.push({
            dataUrl,
            caption: "",
            kind: "table-image",
            sheet: activeSheet,
          });
      }
      if (newItems.length) setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error(err);
    } finally {
      setCapturing(false);
    }
  };

  const VISIBLE_ROWS = Math.min(sheetData.length, 1000);
  const VISIBLE_COLS = Math.min(maxCols, 30);
  const norm = getNorm();
  const selInfo = norm
    ? `Rows ${norm.r1 + 1}–${norm.r2 + 1}  ·  Cols ${colLetter(norm.c1)}–${colLetter(norm.c2)}  ·  ${norm.r2 - norm.r1 + 1} rows × ${norm.c2 - norm.c1 + 1} cols`
    : null;

  return (
    <div>
      {capturing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(15,13,10,0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              border: "4px solid rgba(201,106,16,0.2)",
              borderTop: "4px solid #c96a10",
              borderRadius: "50%",
              animation: "wprSpin .7s linear infinite",
            }}
          />
          <div style={{ color: "#ffcfa0", fontWeight: 700, fontSize: 15 }}>
            Generating images…
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="wpr-xl-tabs">
        <button
          className={`wpr-xl-tab${mode === "images" ? " active" : ""}`}
          onClick={() => setMode("images")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Upload Photos
        </button>
        <button
          className={`wpr-xl-tab${mode === "excel" ? " active" : ""}`}
          onClick={() => setMode("excel")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <polyline points="8 13 10.5 16 14 11" />
          </svg>
          From Excel
        </button>
      </div>

      {/* Photo upload */}
      {mode === "images" && (
        <div>
          <button
            className="btn btn-out"
            style={{ height: 42, fontSize: 13 }}
            onClick={() => photoRef.current?.click()}
          >
            📁 Upload Images
          </button>
          <input
            type="file"
            ref={photoRef}
            accept="image/*,.heic,.heif"
            multiple
            style={{ display: "none" }}
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              const imgs = await Promise.all(
                files.map((f) =>
                  readFileAsDataUrl(f).then((d) => ({
                    dataUrl: d,
                    caption: "",
                    kind: "image",
                  })),
                ),
              );
              setItems((p) => [...p, ...imgs]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Excel mode */}
      {mode === "excel" && (
        <div className="wpr-xl-section">
          {/* Header text */}
          <div className="wpr-xl-hdr-field">
            <label className="wpr-lbl">Report Header Text</label>
            <input
              className="finput"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder={`e.g. ${sectionLabel} — Week 24`}
            />
          </div>

          {/* Upload Excel */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn btn-amber"
              style={{
                height: 38,
                fontSize: 12.5,
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
              onClick={() => xlRef.current?.click()}
              disabled={xlLoading}
            >
              {xlLoading ? (
                <>
                  <div
                    className="wpr-spinner"
                    style={{ width: 14, height: 14, borderWidth: 2 }}
                  />{" "}
                  Parsing…
                </>
              ) : (
                <>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>{" "}
                  Upload Excel (.xlsx / .xls)
                </>
              )}
            </button>
            <input
              type="file"
              ref={xlRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={handleXlFile}
            />
            {xlFileName && !xlError && (
              <span style={{ fontSize: 12, color: "#c96a10", fontWeight: 700 }}>
                📊 {xlFileName}
              </span>
            )}
          </div>

          {xlError && (
            <div
              className="wpr-hint"
              style={{
                background: "#fef2f2",
                borderColor: "#fecaca",
                color: "#dc2626",
                marginBottom: 12,
              }}
            >
              {xlError}
            </div>
          )}

          {/* Sheet tabs */}
          {workbook && workbook.sheetNames.length > 1 && (
            <div className="wpr-xl-sheet-tabs" style={{ marginBottom: 10 }}>
              {workbook.sheetNames.map((name) => (
                <button
                  key={name}
                  className={`wpr-xl-sheet-tab${name === activeSheet ? " active" : ""}`}
                  onClick={() => {
                    setActiveSheet(name);
                    setSelStart(null);
                    setSelEnd(null);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* ── Range selector ── */}
          {workbook && sheetData.length > 0 && (
            <>
              {/* Instruction hint */}
              <div className="wpr-hint" style={{ marginBottom: 8 }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c96a10"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  <strong>Click and drag</strong> on the table to select your
                  data range, then click <strong>⚡ Capture</strong>. You can
                  capture multiple ranges.
                  <strong>⚠️ Do not select headers in selection.</strong>
                </span>
              </div>

              {/* Rows per image control */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <span className="wpr-range-label">Rows per image:</span>
                <input
                  className="finput"
                  type="number"
                  min="1"
                  max="100"
                  value={rowsPerImage}
                  onChange={(e) => setRowsPerImage(e.target.value)}
                  style={{ width: 64, textAlign: "center" }}
                />
                {norm && (
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "#c96a10",
                      fontWeight: 700,
                    }}
                  >
                    → {norm.r2 - norm.r1 + 1} rows selected →{" "}
                    {Math.ceil(
                      (norm.r2 - norm.r1 + 1) /
                        Math.max(1, parseInt(rowsPerImage, 10) || 8),
                    )}{" "}
                    image
                    {Math.ceil(
                      (norm.r2 - norm.r1 + 1) /
                        Math.max(1, parseInt(rowsPerImage, 10) || 8),
                    ) !== 1
                      ? "s"
                      : ""}
                  </span>
                )}
              </div>
              {/* Selection bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: norm ? "rgba(201,106,16,0.1)" : "var(--surface)",
                  border: "1.5px solid #c96a10",
                  borderRadius: 9,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                {/* Range display */}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: norm ? "#c96a10" : "var(--ink3)",
                    fontFamily: "var(--mono)",
                    flex: 1,
                    minWidth: 160,
                  }}
                >
                  {selInfo || (
                    <>
                      No range selected — click & drag below
                      <br />
                      ⚠️ Do not select headers in selection.
                    </>
                  )}
                </span>

                {norm && (
                  <button
                    onClick={() => {
                      setSelStart(null);
                      setSelEnd(null);
                    }}
                    style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 6,
                      border: "1.5px solid #c96a10",
                      background: "transparent",
                      color: "#c96a10",
                      cursor: "pointer",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✕ Clear
                  </button>
                )}

                <button
                  onClick={captureSelection}
                  disabled={capturing || !norm}
                  style={{
                    height: 32,
                    padding: "0 16px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    fontFamily: "var(--font)",
                    background: norm
                      ? "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)"
                      : "var(--surface)",
                    color: norm ? "#fff" : "var(--ink3)",
                    border: "1.5px solid #c96a10",
                    borderRadius: 8,
                    cursor: norm ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  {capturing ? (
                    <>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTop: "2px solid #fff",
                          borderRadius: "50%",
                          animation: "wprSpin .7s linear infinite",
                        }}
                      />{" "}
                      Working…
                    </>
                  ) : (
                    "⚡ Capture"
                  )}
                </button>
              </div>

              {/* Zoom controls */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <span className="wpr-range-label">Zoom:</span>
                <button
                  onClick={() =>
                    setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))
                  }
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: "1.5px solid #c96a10",
                    background: "var(--surface)",
                    color: "#c96a10",
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  −
                </button>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#c96a10",
                    fontFamily: "var(--mono)",
                    minWidth: 42,
                    textAlign: "center",
                  }}
                >
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() =>
                    setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))
                  }
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: "1.5px solid #c96a10",
                    background: "var(--surface)",
                    color: "#c96a10",
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  +
                </button>
                <button
                  onClick={() => setZoom(1)}
                  style={{
                    height: 30,
                    padding: "0 12px",
                    borderRadius: 7,
                    border: "1.5px solid #c96a10",
                    background: "var(--surface)",
                    color: "#c96a10",
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
                <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                  📱 Pinch to zoom on touch
                </span>
              </div>

              {/* Excel table */}
              <div className="wpr-xl-scroll-outer">
                <div
                  ref={wrapperRef}
                  className="wpr-xl-table-wrap"
                  style={{
                    maxHeight: 480,
                    border: "1.5px solid #c96a10",
                    borderRadius: 8,
                    overflow: "auto",
                    userSelect: "none",
                    touchAction: "none",
                    WebkitOverflowScrolling: "touch",
                  }}
                  onMouseMove={(e) => {
                    if (!isDragging) return;
                    autoScroll(e.clientX, e.clientY);
                  }}
                  onMouseUp={() => {
                    setIsDragging(false);
                    stopAutoScroll();
                  }}
                  onWheel={(e) => {
                    if (!e.ctrlKey && !e.metaKey) return; // ctrl/cmd+scroll to zoom on desktop
                    e.preventDefault();
                    setZoom((z) =>
                      Math.min(
                        3,
                        Math.max(
                          0.5,
                          +(z + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2),
                        ),
                      ),
                    );
                  }}
                  onMouseLeave={() => {}}
                >
                  <table
                    ref={tableRef}
                    className="wpr-xl-table"
                    style={{ minWidth: "100%", zoom }}
                  >
                    <thead>
                      <tr>
                        <th
                          style={{
                            minWidth: 36,
                            width: 36,
                            position: "sticky",
                            left: 0,
                            zIndex: 3,
                            background:
                              "linear-gradient(135deg,#3d1200,#7a2e00)",
                          }}
                        >
                          #
                        </th>
                        {Array.from({ length: VISIBLE_COLS }, (_, ci) => (
                          <th key={ci} style={{ minWidth: 80 }}>
                            {colLetter(ci)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: VISIBLE_ROWS }, (_, ri) => {
                        const row = sheetData[ri] || [];
                        return (
                          <tr key={ri}>
                            <td
                              style={{
                                background:
                                  "linear-gradient(135deg,#3d1200,#7a2e00)",
                                color: "#ffcfa0",
                                fontWeight: 800,
                                textAlign: "center",
                                fontSize: 10,
                                padding: "3px 5px",
                                position: "sticky",
                                left: 0,
                                zIndex: 1,
                                userSelect: "none",
                                borderRight: "1.5px solid #c96a10",
                              }}
                            >
                              {ri + 1}
                            </td>
                            {Array.from({ length: VISIBLE_COLS }, (_, ci) => {
                              const selected = isSel(ri, ci);
                              const isStart = isSelStart(ri, ci);
                              return (
                                <td
                                  key={ci}
                                  data-r={ri}
                                  data-c={ci}
                                  className={`${selected ? (isStart ? "sel-start" : "sel") : ""}${isHeaderRow(ri) ? " hdr-locked" : ""}`}
                                  style={{
                                    cursor: isHeaderRow(ri)
                                      ? "not-allowed"
                                      : "crosshair",
                                    minWidth: 80,
                                    maxWidth: 180,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    padding: "5px 8px",
                                    fontSize: 11.5,
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    if (isHeaderRow(ri)) return;
                                    setSelStart({ r: ri, c: ci });
                                    setSelEnd({ r: ri, c: ci });
                                    setIsDragging(true);
                                  }}
                                  onMouseEnter={() => {
                                    if (!isDragging) return;
                                    if (isHeaderRow(ri)) return; // ← block extending selection into header rows
                                    setSelEnd({ r: ri, c: ci });
                                  }}
                                >
                                  {String(row[ci] ?? "")}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Custom fat mobile scrollbars — real webkit ones can't be resized on touch */}
                <div ref={hTrackRef} className="wpr-mob-hbar">
                  <div
                    ref={hThumbRef}
                    className="wpr-mob-hbar-thumb"
                    onTouchStart={startDrag("h")}
                    onMouseDown={startDrag("h")}
                  />
                </div>
                <div ref={vTrackRef} className="wpr-mob-vbar">
                  <div
                    ref={vThumbRef}
                    className="wpr-mob-vbar-thumb"
                    onTouchStart={startDrag("v")}
                    onMouseDown={startDrag("v")}
                  />
                </div>
              </div>
              {/* Overflow notices */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginTop: 5,
                  flexWrap: "wrap",
                }}
              >
                {sheetData.length > 200 && (
                  <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                    ⚠ Showing {sheetData.length} rows — selection captures exact
                    rows chosen
                  </span>
                )}
                {maxCols > 30 && (
                  <span style={{ fontSize: 11, color: "var(--ink3)" }}>
                    ⚠ Showing {maxCols} columns
                  </span>
                )}
              </div>
            </>
          )}

          {/* No file yet */}
          {!workbook && !xlLoading && !xlError && (
            <div className="wpr-hint">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#c96a10"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Upload an Excel file — then select the exact range you want to
              capture as a branded image.
            </div>
          )}
        </div>
      )}

      {/* Captured items */}
      {items.length > 0 && (
        <div className="wpr-xl-captured-grid">
          {items.map((item, i) =>
            item.dataUrl ? (
              <div key={i} className="wpr-xl-captured-card">
                <div className="wpr-xl-captured-card-hdr">
                  {item.kind === "table-image" ? "📊" : "🖼"}{" "}
                  {item.caption || `Item ${i + 1}`}
                </div>
                <img
                  src={item.dataUrl}
                  alt=""
                  style={{ cursor: "zoom-in" }}
                  onClick={() => {
                    const all = items.filter((it) => it?.dataUrl);
                    const idx = all.indexOf(item);
                    // bubble up via a custom event since ExcelRangeCapture doesn't have lightbox access
                    window.dispatchEvent(
                      new CustomEvent("wpr:lightbox", {
                        detail: { images: all, idx },
                      }),
                    );
                  }}
                />
                <button
                  className="wpr-xl-captured-del"
                  onClick={() => setItems((p) => p.filter((_, x) => x !== i))}
                >
                  ✕
                </button>
                <div className="wpr-xl-captured-cap">
                  <input
                    value={item.caption || ""}
                    placeholder="Caption…"
                    onChange={(e) =>
                      setItems((p) =>
                        p.map((it, x) =>
                          x === i ? { ...it, caption: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

function Acc({ id, icon, title, sub, open, onToggle, children }) {
  const ref = useRef(null);

  const handleToggle = () => {
    const opening = !open;
    onToggle();
    if (opening) {
      setTimeout(() => {
        const el = ref.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: "smooth" });
      }, 70);
    }
  };

  return (
    <div className={`wpr-acc${open ? " open" : ""}`} ref={ref}>
      <div className="wpr-acc-hdr" onClick={handleToggle}>
        <div className="wpr-acc-ico">{icon}</div>
        <div className="wpr-acc-titles">
          <div className="wpr-acc-title">{title}</div>
          {sub && <div className="wpr-acc-sub">{sub}</div>}
        </div>
        <span className="wpr-acc-arrow">▾</span>
      </div>
      <div className="wpr-acc-body">{open && children}</div>
    </div>
  );
}

function BtnAdd({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        height: 46,
        background: "transparent",
        border: "2px dashed var(--line2)",
        borderRadius: 9,
        color: "var(--ink2)",
        fontSize: 13.5,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 10,
        fontFamily: "var(--font)",
        transition: "all .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#c96a10";
        e.currentTarget.style.color = "#c96a10";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--line2)";
        e.currentTarget.style.color = "var(--ink2)";
      }}
    >
      + {label}
    </button>
  );
}
function PhotoGrid({
  photos,
  onRemove,
  onCaption,
  onAdd,
  accept,
  multiple = true,
  label = "Upload Photos",
  onLightbox,
}) {
  const fileRef = useRef();
  return (
    <div>
      <button
        className="btn btn-out"
        style={{ height: 42, fontSize: 13, width: "100%" }}
        onClick={() => fileRef.current?.click()}
      >
        📁 {label}
      </button>
      <input
        type="file"
        ref={fileRef}
        accept={accept || "image/*,.heic,.heif"}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={onAdd}
      />
      <div className="wpr-photo-grid">
        {photos.map((ph, i) =>
          ph.dataUrl ? (
            <div key={i} className="wpr-photo-card">
              <img
                src={ph.dataUrl}
                alt=""
                style={{ cursor: "zoom-in" }}
                onClick={() => onLightbox?.(photos, i)}
              />
              <button className="wpr-photo-del" onClick={() => onRemove(i)}>
                ✕
              </button>
              <div className="wpr-photo-cap">
                <input
                  value={ph.label || ph.caption || ""}
                  placeholder="Caption…"
                  onChange={(e) => onCaption(i, e.target.value)}
                />
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function WprGenerator({ user, supabase }) {
  const [openSec, setOpenSec] = useState({ info: true });
  const toggle = (k) => setOpenSec((p) => ({ ...p, [k]: !p[k] }));
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [jobNo, setJobNo] = useState("");
  const [site, setSite] = useState(
    user?.site_names?.[0] || user?.site_name || "",
  );
  const [engineer, setEngineer] = useState(user?.name || "");
  const [reportDate, setReportDate] = useState(today());
  const [location, setLocation] = useState("");
  const [reportNum, setReportNum] = useState(1);
  const [siteImage, setSiteImage] = useState(null);
  const [activities, setActivities] = useState([]);
  const [graphicalImages, setGraphicalImages] = useState([]);
  const [sitePhotos, setSitePhotos] = useState([]);
  const [drawingHeaders, setDrawingHeaders] = useState([
    "Architect GFC Drawing",
    "Structure GFC Drawing",
    "MEPF GFC Drawing",
  ]);
  const [drawingData, setDrawingData] = useState([]);
  const [officeItems, setOfficeItems] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [drawDecision, setDrawDecision] = useState([]);
  const [checklistPhotos, setChecklistPhotos] = useState([]);
  const [delayPoints, setDelayPoints] = useState([]);
  const [plans, setPlans] = useState([]);
  const [sections, setSections] = useState(() =>
    STANDARD_SECTIONS.map((title) => ({
      key: title,
      title,
      isStandard: true,
      hidden: false,
      slideHidden: false,
      type: "text",
      textItems: [],
      images: [],
    })),
  );

  // ── The three new sections ──────────────────────────────────────────────
  const [barchartItems, setBarchartItems] = useState([]);
  const [barchartHeader, setBarchartHeader] = useState("");
  const [cubeItems, setCubeItems] = useState([]);
  const [cubeHeader, setCubeHeader] = useState("");
  const [momItems, setMomItems] = useState([]);
  const [momHeader, setMomHeader] = useState("");
  const [draftSite, setDraftSite] = useState("");
  const [draftExists, setDraftExists] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [autoSavePending, setAutoSavePending] = useState(false);
  const [toast, setToast] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState("");
  const [genProgress, setGenProgress] = useState(0);
  const [successUrls, setSuccessUrls] = useState(null);
  // ── Lightbox ──────────────────────────────────────────────────────────────
  const [lightbox, setLightbox] = useState(null); // { images:[{dataUrl,label}], idx:0 }

  const openLightbox = (images, idx) => {
    const filtered = images.filter((i) => i?.dataUrl);
    if (!filtered.length) return;
    setLightbox({ images: filtered, idx: Math.min(idx, filtered.length - 1) });
  };
  const closeLightbox = () => setLightbox(null);
  const lbPrev = () =>
    setLightbox((p) => ({
      ...p,
      idx: (p.idx - 1 + p.images.length) % p.images.length,
    }));
  const lbNext = () =>
    setLightbox((p) => ({ ...p, idx: (p.idx + 1) % p.images.length }));
  const uploadWprRef = useRef();
  const showToast = (msg, type = "info", ms = 3000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), ms);
  };

  const fetchReportNum = useCallback(
    async (siteName, date) => {
      if (!siteName || !date || !supabase) return;
      const { data } = await supabase
        .from("wpr_reports")
        .select("report_number")
        .eq("site_name", siteName)
        .order("report_number", { ascending: false })
        .limit(1);
      setReportNum(data?.[0]?.report_number ? data[0].report_number + 1 : 1);
    },
    [supabase],
  );

  useEffect(() => {
    fetchReportNum(site, reportDate);
  }, [site, reportDate, fetchReportNum]);
  // ── Auto-load site image from site_details when site changes ──
  useEffect(() => {
    if (!site || !supabase) return;
    (async () => {
      const { data } = await supabase
        .from("site_details")
        .select("site_image_url")
        .eq("site_name", site)
        .maybeSingle();
      if (data?.site_image_url) {
        try {
          // cache-bust so stale CDN copy doesn't block updated image
          const bustUrl = data.site_image_url + "?t=" + Date.now();
          const res = await fetch(bustUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onload = (e) => setSiteImage(e.target.result);
          reader.readAsDataURL(blob);
        } catch (_) {
          /* silently ignore if image fetch fails */
        }
      }
      // Also fetch job_no
      const { data: sd } = await supabase
        .from("site_details")
        .select("job_no")
        .eq("site_name", site)
        .maybeSingle();
      if (sd?.job_no) setJobNo(sd.job_no);
    })();
  }, [site, supabase]);
  const checkDraft = useCallback(async () => {
    if (!engineer || !supabase) return;
    // Don't filter by site — find ANY draft for this engineer
    // so it shows even before site is selected
    const { data } = await supabase
      .from("wpr_drafts")
      .select("site_name, updated_at")
      .eq("engineer_name", engineer)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setDraftExists(true);
      setDraftSite(data.site_name);
      setDraftSavedAt(
        new Date(data.updated_at).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      );
    } else {
      setDraftExists(false);
      setDraftSavedAt("");
      setDraftSite("");
    }
  }, [site, engineer, supabase]);

  // Run on mount (as soon as engineer is known) AND whenever site/engineer change
  useEffect(() => {
    if (engineer) checkDraft();
  }, [engineer, site, checkDraft]);

  // keyboard nav for lightbox
  useEffect(() => {
    const handler = (e) => {
      if (!lightbox) return;
      if (e.key === "ArrowRight") lbNext();
      if (e.key === "ArrowLeft") lbPrev();
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox]);

  // lightbox trigger from ExcelRangeCapture (via custom event)
  useEffect(() => {
    const handler = (e) => openLightbox(e.detail.images, e.detail.idx);
    window.addEventListener("wpr:lightbox", handler);
    return () => window.removeEventListener("wpr:lightbox", handler);
  }, []);

  const hasAnyData = useCallback(() => {
    if (activities.filter((a) => a.name).length > 0) return true;
    if (plans.filter(Boolean).length > 0) return true;
    if (officeItems.filter(Boolean).length > 0) return true;
    if (delayPoints.filter(Boolean).length > 0) return true;
    if (drawingData.length > 0) return true;
    if (visitors.filter((v) => v.name).length > 0) return true;
    if (drawDecision.filter((d) => d.drawingName).length > 0) return true;
    if (location.trim()) return true;
    return false;
  }, [
    activities,
    plans,
    officeItems,
    delayPoints,
    drawingData,
    visitors,
    drawDecision,
    location,
  ]);

  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    if (hasAnyData()) setIsDirty(true);
  }, [
    activities,
    plans,
    officeItems,
    delayPoints,
    drawingData,
    visitors,
    drawDecision,
    location,
  ]);
  useEffect(() => {
    if (!site || !engineer || !supabase) return;
    const t = setInterval(() => {
      if (isDirty && hasAnyData()) {
        saveDraft(true);
        setIsDirty(false);
      }
    }, 20000);
    return () => clearInterval(t);
  }, [site, engineer, supabase, isDirty, hasAnyData]);

  const totalImages = () => {
    let n = 0;
    activities.forEach((a) => {
      n += (a.progressImages || []).filter((i) => i.dataUrl).length;
    });
    n += graphicalImages.filter((i) => i.dataUrl).length;
    n += sitePhotos.filter((i) => i.dataUrl).length;
    n += checklistPhotos.filter((i) => i.dataUrl).length;
    n += barchartItems.filter((i) => i.dataUrl).length;
    n += cubeItems.filter((i) => i.dataUrl).length;
    n += momItems.filter((i) => i.dataUrl).length;
    return n;
  };

  const saveDraft = async (silent = false) => {
    if (!supabase) {
      if (!silent) showToast("Database not ready", "error");
      return;
    }
    if (!site || !engineer) {
      if (!silent) showToast("Site and engineer required", "error");
      return;
    }
    setAutoSavePending(true);
    const payload = {
      site_name: site,
      engineer_name: engineer,
      report_date: reportDate,
      report_number: reportNum,
      location,
      activities: activities.map((a) => ({
        name: a.name || "",
        status: a.status || "",
        progressImages: a.progressImages || [],
      })),
      next_week_plans: plans,
      drawing_register_headers: drawingHeaders,
      drawing_register_data: drawingData,
      office_activity_items: officeItems,
      visitor_register_data: visitors,
      drawing_decision_data: drawDecision,
      delay_points: delayPoints,
      report_sections: sections.map((s) => ({
        title: s.title,
        isStandard: s.isStandard,
        hidden: s.hidden,
        slideHidden: s.slideHidden,
        type: s.type,
        textItems: s.textItems || [],
      })),
      barchart_header: barchartHeader,
      cube_header: cubeHeader,
      mom_header: momHeader,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("wpr_drafts")
      .upsert(payload, { onConflict: "site_name,engineer_name" })
      .select();
    setAutoSavePending(false);
    if (error) {
      if (!silent) showToast("❌ Save failed: " + error.message, "error");
      return;
    }
    const ts = new Date().toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    setDraftExists(true);
    setDraftSavedAt(ts);
    if (!silent) showToast("✅ Draft saved — " + ts, "success");
  };

  const loadDraft = async () => {
    const targetSite = site || draftSite;
    if (!targetSite || !engineer) {
      showToast("Engineer name required to load draft", "error");
      return;
    }
    const { data, error } = await supabase
      .from("wpr_drafts")
      .select("*")
      .eq("site_name", targetSite)
      .eq("engineer_name", engineer)
      .maybeSingle();
    if (error || !data) {
      showToast("No draft found", "error");
      return;
    }
    if (data.site_name && !site) setSite(data.site_name);
    if (data.report_date) setReportDate(data.report_date);
    if (data.location !== undefined) setLocation(data.location ?? "");
    if (data.report_number) setReportNum(data.report_number);
    if (Array.isArray(data.activities))
      setActivities(
        data.activities.map((a) => ({
          ...a,
          progressImages: a.progressImages || [],
        })),
      );
    if (Array.isArray(data.next_week_plans)) setPlans(data.next_week_plans);
    if (Array.isArray(data.drawing_register_headers))
      setDrawingHeaders(data.drawing_register_headers);
    if (Array.isArray(data.drawing_register_data))
      setDrawingData(data.drawing_register_data);
    if (Array.isArray(data.office_activity_items))
      setOfficeItems(data.office_activity_items);
    if (Array.isArray(data.visitor_register_data))
      setVisitors(data.visitor_register_data);
    if (Array.isArray(data.drawing_decision_data))
      setDrawDecision(data.drawing_decision_data);
    if (Array.isArray(data.delay_points)) setDelayPoints(data.delay_points);
    if (Array.isArray(data.report_sections))
      setSections(
        data.report_sections.map((s) => ({
          key: s.key || s.title,
          ...s,
          textItems: s.textItems || [],
          images: s.images || [],
        })),
      );
    if (data.barchart_header) setBarchartHeader(data.barchart_header);
    if (data.cube_header) setCubeHeader(data.cube_header);
    if (data.mom_header) setMomHeader(data.mom_header);
    showToast("✅ Draft restored! (Re-upload images/Excel files)", "success");
  };

  const deleteDraft = async () => {
    const targetSite = site || draftSite;
    await supabase
      .from("wpr_drafts")
      .delete()
      .eq("site_name", targetSite)
      .eq("engineer_name", engineer);
    setDraftExists(false);
    setDraftSavedAt("");
    setDraftSite("");
    showToast("🗑 Draft deleted", "info");
  };

  const generate = async () => {
    if (!site) {
      showToast("Select a site", "error");
      return;
    }
    if (!engineer) {
      showToast("Enter engineer name", "error");
      return;
    }
    if (!reportDate) {
      showToast("Select report date", "error");
      return;
    }
    setGenerating(true);
    setGenProgress(5);
    setGenStep("Preparing…");
    setSuccessUrls(null);
    try {
      await loadPptxGen();
      const dateFormatted = new Date(
        reportDate + "T00:00:00",
      ).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const safeSite = site.replace(/\s+/g, "_");
      const reportNumStr = String(reportNum ?? "");

      // 1) Generate PPT first — so download works even if DB/schema is broken
      setGenProgress(10);
      setGenStep("Generating PowerPoint presentation…");
      const sectionVisibility = {};
      sections.forEach((s) => {
        sectionVisibility[s.key || s.title] = !s.slideHidden;
      });

      const pptBlob = await generatePPT({
        site,
        engineer,
        reportDate: dateFormatted,
        reportNum,
        location,
        activities,
        graphicalImages,
        sitePhotos,
        siteImage,
        plans,
        drawingHeaders,
        drawingData,
        officeItems,
        visitors,
        drawDecision,
        delayPoints,
        checklistPhotos,
        sections,
        sectionVisibility,
        barchartItems,
        cubeItems,
        momItems,
      });

      const downloadPpt = () => {
        const dlUrl = URL.createObjectURL(pptBlob);
        const dlA = document.createElement("a");
        dlA.href = dlUrl;
        dlA.download = `WPR_${zp(reportNum)}_${safeSite}.pptx`;
        dlA.style.display = "none";
        document.body.appendChild(dlA);
        dlA.click();
        document.body.removeChild(dlA);
        setTimeout(() => URL.revokeObjectURL(dlUrl), 10000);
      };

      // 2) Save to DB
      setGenProgress(40);
      setGenStep("Saving report data…");

      await supabase
        .from("wpr_reports")
        .delete()
        .eq("site_name", site)
        .eq("engineer_name", engineer)
        .eq("report_date", dateFormatted)
        .eq("report_number", reportNumStr);

      const { data: reportData, error: reportError } = await supabase
        .from("wpr_reports")
        .insert({
          site_name: site,
          engineer_name: engineer,
          report_date: dateFormatted,
          report_number: reportNumStr,
          location,
          status: "submitted",
          activities: activities.map((a) => ({
            name: a.name,
            status: a.status,
          })),
          next_week_plans: plans.filter(Boolean),
          drawing_register_headers: drawingHeaders,
          drawing_register_data: drawingData,
          office_activity_items: officeItems.filter(Boolean),
          visitor_register_data: visitors,
          drawing_decision_data: drawDecision,
          delay_points: delayPoints.filter(Boolean),
          report_sections: sections.map((s) => ({
            title: s.title,
            isStandard: s.isStandard,
            hidden: s.hidden,
            slideHidden: s.slideHidden,
            type: s.type,
            textItems: s.textItems || [],
          })),
          submitted_by: user?.user_name || engineer,
        })
        .select("id")
        .single();

      if (reportError) {
        // Still give the user the PPT; DB needs fix_wpr_tables.sql
        downloadPpt();
        throw reportError;
      }
      const reportId = reportData.id;

      const ensured = await ensureBucket(supabase, site);
      const bucketName = ensured.bucket || SITE_FILES_BUCKET;
      const prefix = ensured.prefix || sanitizeBucketName(site);

      const datePath = buildSiteDatePath(reportDate);
      const wprBase = `${prefix}/${datePath}/wpr`;

      setGenProgress(55);
      setGenStep("Uploading presentation…");
      const pptPath = `${wprBase}/reports/WPR_${zp(reportNum)}_${safeSite}.pptx`;
      const pptUrl = await uploadBlob(
        supabase,
        bucketName,
        pptBlob,
        pptPath,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
      await supabase
        .from("wpr_reports")
        .update({ presentation_url: pptUrl })
        .eq("id", reportId);

      setGenProgress(65);
      setGenStep("Uploading images…");
      let uploadedCount = 0;
      const totalUp = [
        graphicalImages,
        sitePhotos,
        checklistPhotos,
        barchartItems,
        cubeItems,
        momItems,
        ...activities.map((a) => a.progressImages || []),
      ].reduce((sum, arr) => sum + arr.filter((i) => i.dataUrl).length, 0);

      const uploadBatch = async (images, imageType, subfolder, namePrefix) => {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          if (!img.dataUrl) continue;
          const ext = img.dataUrl.split(";")[0].split("/")[1] || "jpg";
          const cap = safeNamePart(img.label || img.caption || "");
          const fname = `${namePrefix}_${i + 1}${cap ? "_" + cap : ""}.${ext}`;
          const path = `${wprBase}/${subfolder}/${fname}`;
          const publicUrl = await uploadImage(
            supabase,
            bucketName,
            img.dataUrl,
            path,
          );
          await supabase.from("wpr_images").insert({
            wpr_report_id: reportId,
            image_type: imageType,
            storage_path: path,
            public_url: publicUrl,
            caption: img.label || img.caption || "",
            sort_order: i,
          });
          uploadedCount++;
          setGenProgress(
            Math.min(
              100,
              65 + Math.round((uploadedCount / Math.max(totalUp, 1)) * 28),
            ),
          );
          setGenStep(`Uploading images… (${uploadedCount}/${totalUp})`);
        }
      };

      if (siteImage) {
        const path = `${wprBase}/title_img/title.jpg`;
        const url = await uploadImage(supabase, bucketName, siteImage, path);
        await supabase.from("wpr_images").insert({
          wpr_report_id: reportId,
          image_type: "site_image",
          storage_path: path,
          public_url: url,
          caption: "Site Title Image",
          sort_order: 0,
        });
        await supabase
          .from("wpr_reports")
          .update({ site_image_url: url })
          .eq("id", reportId);
      }

      await uploadBatch(graphicalImages, "graphical", "graphical", "graphical");
      await uploadBatch(sitePhotos, "site_photos", "site_photos", "site");
      await uploadBatch(checklistPhotos, "checklist", "checklist", "checklist");
      await uploadBatch(barchartItems, "barchart", "barchart", "barchart");
      await uploadBatch(cubeItems, "cube_testing", "cube_testing", "cube");
      await uploadBatch(momItems, "mom_review", "mom_review", "mom");
      for (let ai = 0; ai < activities.length; ai++) {
        const imgs = activities[ai].progressImages || [];
        if (imgs.length)
          await uploadBatch(
            imgs,
            "progress",
            "progress",
            `act${ai + 1}_progress`,
          );
      }

      setGenProgress(100);
      setGenStep("Done!");
      downloadPpt();

      if (draftExists)
        await supabase
          .from("wpr_drafts")
          .delete()
          .eq("site_name", site)
          .eq("engineer_name", engineer);
      setDraftExists(false);
      setDraftSavedAt("");
      await fetchReportNum(site, reportDate);
      setSuccessUrls({ reportId, pptUrl, viewUrl: `/wpr/${reportId}` });
    } catch (err) {
      setGenerating(false);
      const msg =
        err?.message ||
        err?.error_description ||
        err?.error ||
        (typeof err === "string" ? err : null) ||
        "Generation failed";
      const detail = err?.details || err?.hint || "";
      console.error("WPR generate error:", err);
      showToast("❌ " + msg + (detail ? " — " + detail : ""), "error", 12000);
    }
  };
  const uploadExistingWpr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!site) {
      showToast("Select a site first", "error");
      return;
    }
    if (!engineer) {
      showToast("Enter engineer name first", "error");
      return;
    }
    if (!reportDate) {
      showToast("Select report date first", "error");
      return;
    }

    setGenerating(true);
    setGenProgress(10);
    setGenStep("Reading file…");
    setSuccessUrls(null);

    try {
      const dateFormatted = new Date(
        reportDate + "T00:00:00",
      ).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const dateStr = reportDate.replace(/-/g, "");
      const safeEng = engineer
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "");
      const safeSite = site.replace(/\s+/g, "_");
      const folder = `${dateStr}_${safeEng}`;

      setGenProgress(20);
      setGenStep("Preparing storage…");
      const ensured = await ensureBucket(supabase, site);
      const bucketName = ensured.bucket || SITE_FILES_BUCKET;
      const prefix = ensured.prefix || sanitizeBucketName(site);

      const datePath = buildSiteDatePath(reportDate);
      const wprPathPrefix = `${prefix}/${datePath}`;

      setGenProgress(35);
      setGenStep("Saving report record…");

      // Delete any existing report with same site+engineer+date+number (override old entry)
      await supabase
        .from("wpr_reports")
        .delete()
        .eq("site_name", site)
        .eq("engineer_name", engineer)
        .eq("report_date", dateFormatted)
        .eq("report_number", reportNum);

      const { data: reportData, error: reportError } = await supabase
        .from("wpr_reports")
        .insert({
          site_name: site,
          engineer_name: engineer,
          report_date: dateFormatted,
          report_number: reportNum,
          location,
          status: "uploaded",
          activities: [],
          next_week_plans: [],
          drawing_register_headers: drawingHeaders,
          drawing_register_data: [],
          office_activity_items: [],
          visitor_register_data: [],
          drawing_decision_data: [],
          delay_points: [],
          report_sections: sections.map((s) => ({
            title: s.title,
            isStandard: s.isStandard,
            hidden: s.hidden,
            slideHidden: s.slideHidden,
            type: s.type,
            textItems: s.textItems || [],
          })),
          submitted_by: user?.user_name || engineer,
        })
        .select("id")
        .single();

      if (reportError) throw reportError;
      const reportId = reportData.id;

      setGenProgress(60);
      setGenStep("Uploading file…");

      const ext = file.name.split(".").pop() || "pptx";
      const pptPath = `${wprPathPrefix}/wpr/reports/WPR_${zp(reportNum)}_${safeSite}_uploaded.${ext}`;
      const contentType =
        file.type ||
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";

      const { error: upErr } = await supabase.storage
        .from(bucketName)
        .upload(pptPath, file, { contentType, upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(pptPath);
      const pptUrl = urlData.publicUrl;

      await supabase
        .from("wpr_reports")
        .update({ presentation_url: pptUrl })
        .eq("id", reportId);

      setGenProgress(100);
      setGenStep("Done!");
      await fetchReportNum(site, reportDate);
      setSuccessUrls({ reportId, pptUrl, viewUrl: `/wpr/${reportId}` });
    } catch (err) {
      setGenerating(false);
      showToast("❌ " + (err.message || "Upload failed"), "error", 6000);
    }

    e.target.value = "";
  };
  const closeOverlay = () => {
    setGenerating(false);
    setSuccessUrls(null);
    setGenProgress(0);
  };
  const imgCount = totalImages();
  const actsCount = activities.filter((a) => a.name).length;
  const photosCount = sitePhotos.filter((p) => p.dataUrl).length;
  const barchartCount = barchartItems.filter((i) => i.dataUrl).length;
  const cubeCount = cubeItems.filter((i) => i.dataUrl).length;
  const momCount = momItems.filter((i) => i.dataUrl).length;

  return (
    <>
      <div className="wpr-wrap">
        {/* Upload Existing WPR */}
        <button
          onClick={() => {
            if (!site) {
              showToast("Select a site first", "error");
              return;
            }
            if (!engineer) {
              showToast("Enter engineer name first", "error");
              return;
            }
            if (!reportDate) {
              showToast("Select report date first", "error");
              return;
            }
            uploadWprRef.current?.click();
          }}
          style={{
            width: "100%",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 16px",
            background:
              "repeating-linear-gradient(135deg, #fff6ec, #fff6ec 10px, #ffefdb 10px, #ffefdb 20px)",
            border: "2px dashed #c96a10",
            borderRadius: 12,
            cursor: "pointer",
            fontFamily: "var(--font)",
            textAlign: "left",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              flexShrink: 0,
              background: "#fff",
              border: "2px solid #c96a10",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c96a10"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#c96a10" }}>
              Tap to Upload WPR
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 1 }}>
              Any file · saved for selected date
            </div>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#fff",
              background: "#c96a10",
              borderRadius: 6,
              padding: "3px 7px",
              flexShrink: 0,
            }}
          >
            Browse
          </div>
        </button>
        <input
          type="file"
          ref={uploadWprRef}
          accept="*/*"
          style={{ display: "none" }}
          onChange={uploadExistingWpr}
        />

        {/* Image budget */}
        {imgCount > 0 && (
          <div className="wpr-budget">
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--ink2)",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Image Budget
            </span>
            <div className="wpr-budget-track">
              <div
                className="wpr-budget-fill"
                style={{
                  width: `${Math.min(100, (imgCount / 25) * 100)}%`,
                  background:
                    imgCount <= 15
                      ? "var(--green)"
                      : imgCount <= 22
                        ? "var(--amber)"
                        : "#dc2626",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--mono)",
                whiteSpace: "nowrap",
                color: imgCount <= 15 ? "var(--green)" : "var(--amber)",
              }}
            >
              {imgCount} / 25
            </span>
          </div>
        )}

        {/* Draft banner */}
        {draftExists && (
          <div className="wpr-draft-banner">
            <div>
              <div
                className="wpr-draft-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Draft found
              </div>
              <div className="wpr-draft-sub">Saved on {draftSavedAt}</div>
            </div>
            <button
              className="btn btn-amber"
              style={{
                height: 36,
                fontSize: 12,
                padding: "0 13px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={loadDraft}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Open
            </button>
            <button
              className="btn btn-red"
              style={{
                height: 36,
                fontSize: 12,
                padding: "0 11px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={deleteDraft}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </button>
          </div>
        )}

        {/* ① PROJECT INFO */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
          title="Project Information"
          sub={site || "Site, engineer, date"}
          open={openSec.info}
          onToggle={() => toggle("info")}
        >
          <div className="wpr-g2">
            <div className="wpr-fg">
              <label className="wpr-lbl">Site Name *</label>
              {user?.site_names?.length > 1 ? (
                <select
                  className="finput"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                >
                  {user.site_names.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="finput"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="Site name…"
                />
              )}
            </div>
            <div className="wpr-fg">
              <label className="wpr-lbl">Engineer *</label>
              <input
                className="finput"
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
                placeholder="Engineer name…"
              />
            </div>
            <div className="wpr-fg">
              <label className="wpr-lbl">Location</label>
              <input
                className="finput"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Surat"
              />
            </div>
            <div className="wpr-fg">
              <label className="wpr-lbl">Report Date *</label>
              <input
                className="finput"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
              border: "1.5px solid #c96a10",
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--amber)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#ffcfa0",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                Report Number
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,207,160,0.75)",
                  marginTop: 3,
                  fontFamily: "var(--mono)",
                }}
              >
                {jobNo || "—"}
              </div>
            </div>
          </div>
          <div className="wpr-fg">
            <label className="wpr-lbl">Title Slide Image (optional)</label>
            {siteImage ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img
                  src={siteImage}
                  alt="site"
                  style={{
                    height: 110,
                    borderRadius: 10,
                    border: "1.5px solid var(--line2)",
                  }}
                />
                <button
                  className="wpr-photo-del"
                  style={{ position: "absolute", top: 6, right: 6 }}
                  onClick={() => setSiteImage(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label
                className="wpr-drop-zone"
                style={{
                  display: "block",
                  textAlign: "center",
                  cursor: "pointer",
                  padding: "20px",
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ink3)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  style={{ marginBottom: 8 }}
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink2)",
                    fontWeight: 600,
                  }}
                >
                  Upload site overview photo
                </div>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const dataUrl = await processImage(file, 1920, 800, 0.85);
                    setSiteImage(dataUrl);

                    if (site && supabase) {
                      try {
                        const ensured = await ensureBucket(supabase, site);
                        const bucketName = ensured.bucket || SITE_FILES_BUCKET;
                        const prefix = ensured.prefix || sanitizeBucketName(site);
                        const path = `${prefix}/SiteImg/site_title.jpg`;

                        // Step 1 — upload to bucket
                        const mime = getMime(dataUrl);
                        const base64 = dataUrlToBase64(dataUrl);
                        const bytes = Uint8Array.from(atob(base64), (c) =>
                          c.charCodeAt(0),
                        );
                        const blob = new Blob([bytes], { type: mime });

                        // ── Direct REST PUT — always overwrites, bypasses SDK policy quirks ──
                        // ── Extract Supabase URL + key from client (works for all client versions) ──
                        const supabaseUrl = (
                          supabase.supabaseUrl ||
                          supabase.storageUrl?.replace("/storage/v1", "") ||
                          supabase.rest?.url?.replace("/rest/v1", "") ||
                          supabase._supabaseUrl
                        )?.replace(/\/$/, "");

                        // Get the active session JWT — required for storage writes
                        const {
                          data: { session },
                        } = await supabase.auth.getSession();
                        const supabaseKey =
                          supabase.supabaseKey ||
                          supabase._supabaseKey ||
                          supabase.headers?.apikey ||
                          supabase.rest?.headers?.apikey;
                        const authToken = session?.access_token || supabaseKey;

                        console.log(
                          "🔍 resolved url:",
                          supabaseUrl,
                          "| key prefix:",
                          supabaseKey?.slice(0, 12),
                        );

                        if (!supabaseUrl || !supabaseKey) {
                          throw new Error(
                            "Cannot resolve Supabase URL/key from client — check console",
                          );
                        }

                        const putRes = await fetch(
                          `${supabaseUrl}/storage/v1/object/${bucketName}/${path}`,
                          {
                            method: "PUT",
                            headers: {
                              apikey: supabaseKey,
                              Authorization: `Bearer ${authToken}`, // ← JWT not anon key
                              "Content-Type": mime,
                              "Cache-Control": "no-cache, no-store",
                              "x-upsert": "true",
                            },
                            body: blob,
                          },
                        );

                        if (!putRes.ok) {
                          const errText = await putRes.text();
                          throw new Error(
                            `Storage PUT failed ${putRes.status}: ${errText}`,
                          );
                        }
                        console.log("✅ Storage PUT success:", putRes.status);
                        // Step 2 — get public URL
                        // Step 2 — get public URL with cache-bust timestamp
                        const { data: urlData } = supabase.storage
                          .from(bucketName)
                          .getPublicUrl(path);
                        const publicUrl = urlData?.publicUrl
                          ? `${urlData.publicUrl}?t=${Date.now()}`
                          : null;
                        if (!publicUrl)
                          throw new Error("Could not get public URL");

                        // Step 3 — update site_details (log result to verify)
                        const { data: updateData, error: updateErr } =
                          await supabase
                            .from("site_details")
                            .update({ site_image_url: publicUrl })
                            .eq("site_name", site)
                            .select(); // ← .select() forces it to return rows

                        if (updateErr)
                          throw new Error(
                            "DB update failed: " + updateErr.message,
                          );
                        console.log(
                          "✅ site_image_url updated:",
                          publicUrl,
                          "rows:",
                          updateData,
                        );
                        showToast("✅ Site image saved", "success");
                      } catch (err) {
                        console.error(
                          "❌ Site image sync failed:",
                          err.message,
                        );
                        showToast(
                          "⚠ Image uploaded locally but DB sync failed: " +
                            err.message,
                          "error",
                          5000,
                        );
                      }
                    }
                  }}
                />
              </label>
            )}
          </div>
        </Acc>

        {/* ② ACTIVITIES */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 16l4-4 4 4 4-4" />
            </svg>
          }
          title="Activities"
          sub={
            actsCount
              ? `${actsCount} activities`
              : "Add construction activities"
          }
          open={openSec.acts}
          onToggle={() => toggle("acts")}
        >
          {activities.map((act, i) => (
            <div key={i} className="wpr-act-card">
              <button
                className="wpr-act-del"
                onClick={() =>
                  setActivities((p) => p.filter((_, x) => x !== i))
                }
              >
                ✕
              </button>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div className="wpr-act-num">{i + 1}</div>
                <span
                  style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}
                >
                  {act.name || `Activity ${i + 1}`}
                </span>
              </div>
              <div className="wpr-g2">
                <div className="wpr-fg">
                  <label className="wpr-lbl">Activity Name</label>
                  <input
                    className="finput"
                    value={act.name}
                    placeholder="e.g. EXCAVATION WORK"
                    onChange={(e) =>
                      setActivities((p) =>
                        p.map((a, x) =>
                          x === i ? { ...a, name: e.target.value } : a,
                        ),
                      )
                    }
                  />
                </div>
                <div className="wpr-fg">
                  <label className="wpr-lbl">Status / Note</label>
                  <input
                    className="finput"
                    value={act.status}
                    placeholder="e.g. 75% completed"
                    onChange={(e) =>
                      setActivities((p) =>
                        p.map((a, x) =>
                          x === i ? { ...a, status: e.target.value } : a,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          <BtnAdd
            label="Add Activity"
            onClick={() =>
              setActivities((p) => [
                ...p,
                { name: "", status: "", progressImages: [] },
              ])
            }
          />
        </Acc>

        {/* ③ GRAPHICAL REPORT */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          }
          title="Graphical Report of Work"
          sub={
            graphicalImages.filter((i) => i.dataUrl).length
              ? `${graphicalImages.filter((i) => i.dataUrl).length} images`
              : "Upload progress images"
          }
          open={openSec.graph}
          onToggle={() => toggle("graph")}
        >
          <PhotoGrid
            photos={graphicalImages}
            onRemove={(i) =>
              setGraphicalImages((p) => p.filter((_, x) => x !== i))
            }
            onCaption={(i, v) =>
              setGraphicalImages((p) =>
                p.map((im, x) => (x === i ? { ...im, caption: v } : im)),
              )
            }
            onAdd={async (e) => {
              const files = Array.from(e.target.files || []);
              const imgs = await Promise.all(
                files.map((f) =>
                  readFileAsDataUrl(f).then((d) => ({
                    dataUrl: d,
                    caption: "",
                  })),
                ),
              );
              setGraphicalImages((p) => [...p, ...imgs]);
              e.target.value = "";
            }}
            label="Upload Graphical Images"
            onLightbox={(imgs, idx) => openLightbox(imgs, idx)}
          />
        </Acc>

        {/* ④ SITE PHOTOGRAPHS */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          }
          title="Site Photographs"
          sub={photosCount ? `${photosCount} photos` : "General site photos"}
          open={openSec.photos}
          onToggle={() => toggle("photos")}
        >
          <PhotoGrid
            photos={sitePhotos}
            onRemove={(i) => setSitePhotos((p) => p.filter((_, x) => x !== i))}
            onCaption={(i, v) =>
              setSitePhotos((p) =>
                p.map((ph, x) => (x === i ? { ...ph, label: v } : ph)),
              )
            }
            onAdd={async (e) => {
              const files = Array.from(e.target.files || []);
              const imgs = await Promise.all(
                files.map((f) =>
                  readFileAsDataUrl(f).then((d) => ({ dataUrl: d, label: "" })),
                ),
              );
              setSitePhotos((p) => [...p, ...imgs]);
              e.target.value = "";
            }}
            label="Upload Site Photos"
            onLightbox={(imgs, idx) => openLightbox(imgs, idx)}
          />
        </Acc>

        {/* ⑤ CUBE TESTING REGISTER */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          }
          title="Cube Testing Register"
          sub={
            cubeCount
              ? `${cubeCount} items`
              : "Upload photos or capture from Excel"
          }
          open={openSec.cube}
          onToggle={() => toggle("cube")}
        >
          <div className="wpr-hint">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c96a10"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Upload photos of cube test results, or load an Excel file, select
            the data range, and capture it as an image with a branded header.
          </div>
          <ExcelRangeCapture
            items={cubeItems}
            setItems={setCubeItems}
            sectionLabel="Cube Testing Register"
            headerText={cubeHeader}
            setHeaderText={setCubeHeader}
          />
        </Acc>

        {/* ⑥ DRAWING REGISTER */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
          title="Drawing Register"
          sub={
            drawingData.length
              ? `${drawingData.length} rows`
              : "GFC Drawing entries"
          }
          open={openSec.drawing}
          onToggle={() => toggle("drawing")}
        >
          <div className="wpr-hint">
            ℹ Column headers become table headers in the report. Add/remove
            columns as needed.
          </div>
          <div style={{ marginBottom: 8 }}>
            {/* Column header editors — scrollable on mobile */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px",
                background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
                border: "1.5px solid #c96a10",
                borderRadius: "8px 8px 0 0",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div
                style={{
                  width: 28,
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#ffcfa0",
                  textAlign: "center",
                }}
              >
                #
              </div>
              {drawingHeaders.map((h, hi) => (
                <div
                  key={hi}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 100,
                    flex: 1,
                  }}
                >
                  <input
                    value={h}
                    onChange={(e) =>
                      setDrawingHeaders((p) =>
                        p.map((v, x) => (x === hi ? e.target.value : v)),
                      )
                    }
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.15)",
                      border: "1.5px dashed rgba(255,207,160,0.5)",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: "#ffcfa0",
                      fontFamily: "var(--font)",
                      outline: "none",
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      minWidth: 80,
                    }}
                  />
                  {drawingHeaders.length > 1 && (
                    <button
                      onClick={() =>
                        setDrawingHeaders((p) => p.filter((_, x) => x !== hi))
                      }
                      style={{
                        width: 18,
                        height: 18,
                        background: "rgba(220,38,38,.7)",
                        border: "none",
                        borderRadius: 4,
                        color: "#fff",
                        fontSize: 11,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setDrawingHeaders((p) => [...p, "New Column"])}
                style={{
                  width: 26,
                  height: 26,
                  background: "rgba(255,255,255,0.2)",
                  border: "1.5px solid rgba(255,207,160,0.5)",
                  borderRadius: 6,
                  color: "#ffcfa0",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                +
              </button>
            </div>

            {/* Rows — horizontally scrollable on mobile */}
            <div
              style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
            >
              {drawingData.map((row, ri) => (
                <div
                  key={ri}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `28px ${drawingHeaders.map(() => "minmax(100px,1fr)").join(" ")} 28px`,
                    gap: 6,
                    alignItems: "center",
                    padding: "7px 10px",
                    background: "var(--surface)",
                    border: "1.5px solid #c96a10",
                    borderTop: "none",
                    minWidth:
                      drawingHeaders.length > 3
                        ? `${drawingHeaders.length * 110 + 60}px`
                        : "auto",
                  }}
                  className={
                    ri === drawingData.length - 1 ? "wpr-tbl-row-last" : ""
                  }
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      background:
                        "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
                      color: "#fff",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {ri + 1}
                  </div>
                  {drawingHeaders.map((h, hi) => (
                    <input
                      key={hi}
                      className="finput"
                      value={row[`col${hi}`] || ""}
                      placeholder={h}
                      onChange={(e) =>
                        setDrawingData((p) =>
                          p.map((r, x) =>
                            x === ri
                              ? { ...r, [`col${hi}`]: e.target.value }
                              : r,
                          ),
                        )
                      }
                      style={{ minWidth: 90 }}
                    />
                  ))}
                  <button
                    onClick={() =>
                      setDrawingData((p) => p.filter((_, x) => x !== ri))
                    }
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--ink3)",
                      fontSize: 18,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <BtnAdd
            label="Add Drawing Row"
            onClick={() => {
              const newRow = {};
              drawingHeaders.forEach((_, hi) => {
                newRow[`col${hi}`] = "";
              });
              setDrawingData((p) => [...p, newRow]);
            }}
          />
        </Acc>

        {/* ⑦ OFFICE ACTIVITY */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          }
          title="Office Activity"
          sub={
            officeItems.filter(Boolean).length
              ? `${officeItems.filter(Boolean).length} items`
              : "Back office work"
          }
          open={openSec.office}
          onToggle={() => toggle("office")}
        >
          {officeItems.map((item, i) => (
            <div key={i} className="wpr-plan-item">
              <div className="wpr-plan-num">{i + 1}</div>
              <input
                value={item}
                placeholder="e.g. Lift work order prepared"
                onChange={(e) =>
                  setOfficeItems((p) =>
                    p.map((v, x) => (x === i ? e.target.value : v)),
                  )
                }
              />
              <button
                onClick={() =>
                  setOfficeItems((p) => p.filter((_, x) => x !== i))
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink3)",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <BtnAdd
            label="Add Item"
            onClick={() => setOfficeItems((p) => [...p, ""])}
          />
        </Acc>

        {/* ⑧ VISITOR REGISTER */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          title="Visitor Register"
          sub={
            visitors.filter((v) => v.name).length
              ? `${visitors.filter((v) => v.name).length} visitors`
              : "Record site visitors"
          }
          open={openSec.visitor}
          onToggle={() => toggle("visitor")}
        >
          {visitors.map((row, i) => (
            <div key={i} className="wpr-vis-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  marginBottom: 12,
                }}
              >
                <div
                  className="wpr-act-num"
                  style={{ width: 28, height: 28, fontSize: 12 }}
                >
                  {i + 1}
                </div>
                <select
                  className="finput"
                  style={{ flex: 1 }}
                  value={row.type || VISITOR_TYPES[0]}
                  onChange={(e) =>
                    setVisitors((p) =>
                      p.map((v, x) =>
                        x === i ? { ...v, type: e.target.value } : v,
                      ),
                    )
                  }
                >
                  {VISITOR_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                  <option value="__other__">+ Other…</option>
                </select>
                <button
                  onClick={() =>
                    setVisitors((p) => p.filter((_, x) => x !== i))
                  }
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ink3)",
                    fontSize: 20,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="wpr-g2">
                <div className="wpr-fg">
                  <label className="wpr-lbl">Name / Company</label>
                  <input
                    className="finput"
                    value={row.name || ""}
                    placeholder="Visitor name"
                    onChange={(e) =>
                      setVisitors((p) =>
                        p.map((v, x) =>
                          x === i ? { ...v, name: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </div>
                <div className="wpr-fg">
                  <label className="wpr-lbl">Instruction / Remark</label>
                  <input
                    className="finput"
                    value={row.instruction || ""}
                    placeholder="Instructions given"
                    onChange={(e) =>
                      setVisitors((p) =>
                        p.map((v, x) =>
                          x === i ? { ...v, instruction: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          <BtnAdd
            label="Add Visitor"
            onClick={() =>
              setVisitors((p) => [
                ...p,
                { type: VISITOR_TYPES[0], name: "", instruction: "" },
              ])
            }
          />
        </Acc>

        {/* ⑨ DRAWING & DECISION PENDING */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title="Drawing & Decision Pending"
          sub={
            drawDecision.filter((r) => r.drawingName).length
              ? `${drawDecision.filter((r) => r.drawingName).length} items`
              : "Pending drawings"
          }
          open={openSec.drawdec}
          onToggle={() => toggle("drawdec")}
        >
          {drawDecision.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 1fr 28px",
                gap: 8,
                padding: "8px 12px",
                background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
                border: "1.5px solid #c96a10",
                borderRadius: "8px 8px 0 0",
                fontSize: 11,
                fontWeight: 800,
                color: "#ffcfa0",
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              <div />
              <div>Drawing / Decision Name</div>
              <div>Required Date</div>
              <div />
            </div>
          )}
          {drawDecision.map((row, i) => (
            <div
              key={i}
              className="wpr-drawdec-row"
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 1fr 28px", // ← overridden by CSS on mobile
                gap: 8,
                alignItems: "start",
                padding: "8px 12px",
                background: i % 2 === 0 ? "var(--surface)" : "var(--paper)",
                border: "1.5px solid #c96a10",
                borderTop: "none",
                borderRadius: i === drawDecision.length - 1 ? "0 0 8px 8px" : 0,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
                  color: "#fff",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 4,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{ display: "contents" }}
                className="wpr-drawdec-fields"
              >
                <input
                  className="finput"
                  value={row.drawingName || ""}
                  placeholder="Drawing or decision name…"
                  onChange={(e) =>
                    setDrawDecision((p) =>
                      p.map((r, x) =>
                        x === i ? { ...r, drawingName: e.target.value } : r,
                      ),
                    )
                  }
                />
                <input
                  className="finput"
                  type="date"
                  value={row.requiredDate || ""}
                  onChange={(e) =>
                    setDrawDecision((p) =>
                      p.map((r, x) =>
                        x === i ? { ...r, requiredDate: e.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              <button
                onClick={() =>
                  setDrawDecision((p) => p.filter((_, x) => x !== i))
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink3)",
                  fontSize: 18,
                  cursor: "pointer",
                  marginTop: 2,
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <BtnAdd
            label="Add Pending Item"
            onClick={() =>
              setDrawDecision((p) => [
                ...p,
                { drawingName: "", requiredDate: "" },
              ])
            }
          />
        </Acc>

        {/* ⑩ WEEKLY CHECKLIST */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
          title="Weekly Site Checklist"
          sub={
            checklistPhotos.filter((p) => p.dataUrl).length
              ? `${checklistPhotos.filter((p) => p.dataUrl).length} photos`
              : "Checklist photos"
          }
          open={openSec.checklist}
          onToggle={() => toggle("checklist")}
        >
          <PhotoGrid
            photos={checklistPhotos}
            onRemove={(i) =>
              setChecklistPhotos((p) => p.filter((_, x) => x !== i))
            }
            onCaption={(i, v) =>
              setChecklistPhotos((p) =>
                p.map((ph, x) => (x === i ? { ...ph, label: v } : ph)),
              )
            }
            onAdd={async (e) => {
              const files = Array.from(e.target.files || []);
              const imgs = await Promise.all(
                files.map((f) =>
                  readFileAsDataUrl(f).then((d) => ({ dataUrl: d, label: "" })),
                ),
              );
              setChecklistPhotos((p) => [...p, ...imgs]);
              e.target.value = "";
            }}
            label="Upload Checklist Photos"
            onLightbox={(imgs, idx) => openLightbox(imgs, idx)}
          />
        </Acc>

        {/* ⑪ DELAY POINTS */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
          title="Delay Points / Highlights / Red Flag"
          sub={
            delayPoints.filter(Boolean).length
              ? `${delayPoints.filter(Boolean).length} points`
              : "Issues and flags"
          }
          open={openSec.delay}
          onToggle={() => toggle("delay")}
        >
          {delayPoints.map((pt, i) => (
            <div
              key={i}
              className="wpr-plan-item"
              style={{ borderColor: "rgba(220,38,38,.25)" }}
            >
              <div
                className="wpr-plan-num"
                style={{ background: "rgba(220,38,38,.1)", color: "#dc2626" }}
              >
                {i + 1}
              </div>
              <input
                value={pt}
                placeholder="Delay point or red flag…"
                onChange={(e) =>
                  setDelayPoints((p) =>
                    p.map((v, x) => (x === i ? e.target.value : v)),
                  )
                }
              />
              <button
                onClick={() =>
                  setDelayPoints((p) => p.filter((_, x) => x !== i))
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink3)",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <BtnAdd
            label="Add Delay Point"
            onClick={() => setDelayPoints((p) => [...p, ""])}
          />
        </Acc>

        {/* ⑫ NEXT WEEK PLANNING */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          title="Next Week Planning"
          sub={
            plans.filter(Boolean).length
              ? `${plans.filter(Boolean).length} plans`
              : "Planned activities"
          }
          open={openSec.plan}
          onToggle={() => toggle("plan")}
        >
          {plans.map((pl, i) => (
            <div key={i} className="wpr-plan-item">
              <div className="wpr-plan-num">{i + 1}</div>
              <input
                value={pl}
                placeholder="Planned activity for next week…"
                onChange={(e) =>
                  setPlans((p) =>
                    p.map((v, x) => (x === i ? e.target.value : v)),
                  )
                }
              />
              <button
                onClick={() => setPlans((p) => p.filter((_, x) => x !== i))}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink3)",
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <BtnAdd
            label="Add Planned Item"
            onClick={() => setPlans((p) => [...p, ""])}
          />
        </Acc>

        {/* ⑬ MOM REVIEW */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          title="MOM Review"
          sub={
            momCount
              ? `${momCount} items`
              : "Minutes of Meeting — photos or Excel capture"
          }
          open={openSec.mom}
          onToggle={() => toggle("mom")}
        >
          <div className="wpr-hint">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c96a10"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Upload MOM photos or select a range from your MOM Excel sheet to
            capture it as a branded table image.
          </div>
          <ExcelRangeCapture
            items={momItems}
            setItems={setMomItems}
            sectionLabel="MOM Review"
            headerText={momHeader}
            setHeaderText={setMomHeader}
          />
        </Acc>

        {/* ⑭ BARCHART & WORKSHEET */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          }
          title="Barchart & Worksheet"
          sub={
            barchartCount
              ? `${barchartCount} items`
              : "Programme / schedule — photos or Excel capture"
          }
          open={openSec.barchart}
          onToggle={() => toggle("barchart")}
        >
          <div className="wpr-hint">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c96a10"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Upload bar chart / programme photos, or open your schedule Excel
            file, select the barchart range, and capture it with a header
            banner.
          </div>
          <ExcelRangeCapture
            items={barchartItems}
            setItems={setBarchartItems}
            sectionLabel="Barchart & Worksheet"
            headerText={barchartHeader}
            setHeaderText={setBarchartHeader}
          />
        </Acc>
        <hr
          style={{
            border: 0,
            borderTop: "3px dotted #f59e0b",
            margin: "16px 0",
          }}
        />

        {/* ⑮ REPORT SECTIONS */}
        <Acc
          icon={
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          }
          title="Report Sections"
          sub="Reorder, hide or add custom sections"
          open={openSec.rc}
          onToggle={() => toggle("rc")}
        >
          <div className="wpr-hint">
            ℹ Standard sections are always included. Drag the ⠿ handle to
            reorder, use Hide to exclude from PPT, or 🚫 to omit entirely.
          </div>
          {sections.map((sec, si) => (
            <div
              key={si}
              className="wpr-rc-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(si));
                e.currentTarget.style.opacity = "0.45";
              }}
              onDragEnd={(e) => {
                e.currentTarget.style.opacity = "1";
                document.querySelectorAll(".wpr-rc-item").forEach((el) => {
                  el.style.borderTop = "";
                  el.style.borderBottom = "";
                });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const midY =
                  e.currentTarget.getBoundingClientRect().top +
                  e.currentTarget.getBoundingClientRect().height / 2;
                document.querySelectorAll(".wpr-rc-item").forEach((el) => {
                  el.style.borderTop = "";
                  el.style.borderBottom = "";
                });
                if (e.clientY < midY)
                  e.currentTarget.style.borderTop = "2.5px solid #c96a10";
                else e.currentTarget.style.borderBottom = "2.5px solid #c96a10";
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderTop = "";
                e.currentTarget.style.borderBottom = "";
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderTop = "";
                e.currentTarget.style.borderBottom = "";
                const fromIdx = parseInt(
                  e.dataTransfer.getData("text/plain"),
                  10,
                );
                if (isNaN(fromIdx) || fromIdx === si) return;
                const midY =
                  e.currentTarget.getBoundingClientRect().top +
                  e.currentTarget.getBoundingClientRect().height / 2;
                const insertAfter = e.clientY >= midY;
                setSections((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(fromIdx, 1);
                  let toIdx = fromIdx < si ? si - 1 : si;
                  if (insertAfter) toIdx += 1;
                  next.splice(toIdx, 0, moved);
                  return next;
                });
              }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                e.currentTarget._touchStartY = touch.clientY;
                e.currentTarget._touchIdx = si;
                e.currentTarget.style.opacity = "0.55";
                e.currentTarget.style.transform = "scale(1.02)";
                e.currentTarget.style.zIndex = "100";
                e.currentTarget.style.boxShadow =
                  "0 8px 24px rgba(201,106,16,0.35)";
              }}
              onTouchMove={(e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const allItems = Array.from(
                  document.querySelectorAll(".wpr-rc-item"),
                );
                allItems.forEach((el) => {
                  el.style.borderTop = "";
                  el.style.borderBottom = "";
                });
                const target = document
                  .elementFromPoint(touch.clientX, touch.clientY)
                  ?.closest(".wpr-rc-item");
                if (target && target !== e.currentTarget) {
                  const rect = target.getBoundingClientRect();
                  if (touch.clientY < rect.top + rect.height / 2)
                    target.style.borderTop = "2.5px solid #c96a10";
                  else target.style.borderBottom = "2.5px solid #c96a10";
                }
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "";
                e.currentTarget.style.zIndex = "";
                e.currentTarget.style.boxShadow = "";
                document.querySelectorAll(".wpr-rc-item").forEach((el) => {
                  el.style.borderTop = "";
                  el.style.borderBottom = "";
                });
                const touch = e.changedTouches[0];
                const target = document
                  .elementFromPoint(touch.clientX, touch.clientY)
                  ?.closest(".wpr-rc-item");
                if (!target || target === e.currentTarget) return;
                const allItems = Array.from(
                  document.querySelectorAll(".wpr-rc-item"),
                );
                const fromIdx = si;
                const toIdx = allItems.indexOf(target);
                if (toIdx === -1 || fromIdx === toIdx) return;
                const rect = target.getBoundingClientRect();
                const insertAfter = touch.clientY >= rect.top + rect.height / 2;
                setSections((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(fromIdx, 1);
                  let finalIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
                  if (insertAfter) finalIdx += 1;
                  next.splice(finalIdx, 0, moved);
                  return next;
                });
              }}
            >
              <div className="wpr-rc-hdr">
                {/* Drag handle */}
                <div
                  title="Drag to reorder"
                  style={{
                    cursor: "grab",
                    color: "var(--ink3)",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: "0 4px",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  ⠿
                </div>

                <input
                  className="wpr-rc-title"
                  value={sec.title}
                  onChange={(e) =>
                    setSections((p) =>
                      p.map((s, x) =>
                        x === si ? { ...s, title: e.target.value } : s,
                      ),
                    )
                  }
                />
                <div className="wpr-rc-actions">
                  <button
                    className="wpr-rc-btn"
                    title="Move up"
                    onClick={() => {
                      if (si === 0) return;
                      setSections((p) => {
                        const n = [...p];
                        [n[si - 1], n[si]] = [n[si], n[si - 1]];
                        return n;
                      });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="wpr-rc-btn"
                    title="Move down"
                    onClick={() => {
                      if (si === sections.length - 1) return;
                      setSections((p) => {
                        const n = [...p];
                        [n[si], n[si + 1]] = [n[si + 1], n[si]];
                        return n;
                      });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    className={`wpr-rc-btn${sec.slideHidden ? " hide-active" : ""}`}
                    title={
                      sec.slideHidden
                        ? "Slide hidden in PPT — click to show"
                        : "Hide slide in PPT (slide stays but is hidden)"
                    }
                    onClick={() =>
                      setSections((p) =>
                        p.map((s, x) =>
                          x === si ? { ...s, slideHidden: !s.slideHidden } : s,
                        ),
                      )
                    }
                  >
                    {sec.slideHidden ? "👁" : "Hide"}
                  </button>
                  {sec.isStandard ? (
                    <button
                      className={`wpr-rc-btn${sec.hidden ? " hide-active" : ""}`}
                      title={
                        sec.hidden
                          ? "Section excluded from PPT — click to include"
                          : "Remove section from PPT completely"
                      }
                      onClick={() =>
                        setSections((p) =>
                          p.map((s, x) =>
                            x === si ? { ...s, hidden: !s.hidden } : s,
                          ),
                        )
                      }
                    >
                      🚫
                    </button>
                  ) : (
                    <button
                      className="wpr-rc-btn del"
                      onClick={() =>
                        setSections((p) => p.filter((_, x) => x !== si))
                      }
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Acc>
        <hr
          style={{
            border: 0,
            borderTop: "3px dotted #f59e0b",
            margin: "16px 0",
          }}
        />
        {/* FAB */}
        <div className="wpr-fab-wrap">
          <button
            onClick={() => saveDraft(false)}
            disabled={autoSavePending}
            style={{
              width: "100%",
              height: 40,
              marginBottom: 8,
              fontSize: 13,
              fontFamily: "var(--font)",
              fontWeight: 700,
              borderRadius: "10px",
              border: "2px solid #e2e8f0",
              borderColor: "#475569",
              cursor: "pointer",
              pointerEvents: "all",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            {autoSavePending ? (
              <>
                <div
                  className="wpr-spinner"
                  style={{ width: 14, height: 14, borderWidth: 2 }}
                />{" "}
                Saving…
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>{" "}
                Save Draft
              </>
            )}
          </button>
          <button
            className="wpr-fab"
            onClick={generate}
            disabled={generating}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
            Generate Report + PPT
          </button>
        </div>

        {/* Generation Overlay */}
        {generating && (
          <div className="wpr-overlay">
            {!successUrls ? (
              <div className="wpr-overlay-card">
                <div className="wpr-spinner" />
                <div
                  style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}
                >
                  Generating Report…
                </div>
                <div style={{ fontSize: 13, color: "var(--ink2)" }}>
                  {genStep}
                </div>
                <div className="wpr-progress-bar">
                  <div
                    className="wpr-progress-fill"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink3)",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {genProgress}%
                </div>
              </div>
            ) : (
              <div className="wpr-overlay-card">
                <div
                  style={{
                    width: 64,
                    height: 64,
                    background: "#f0fdf4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div className="wpr-success-title">Report Generated!</div>
                <div className="wpr-success-sub">
                  WPR — {zp(reportNum)} for <strong>{site}</strong> has been
                  saved with all images uploaded and a PowerPoint presentation
                  created.
                </div>
                <div className="wpr-success-links">
                  <div
                    className="wpr-link-row"
                    style={{background:"linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",border: "1.5px solid #c96a10",color: "#fff",}}>
                    <span className="wpr-link-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="2" y="2" width="20" height="20" rx="2" />
                        <path d="M7 12h2l2-4 2 8 2-4h2" />
                      </svg>
                    </span>
                    <div className="wpr-link-label">
                      <div style={{ fontWeight: 800, color: "#ffcfa0" }}>
                        PowerPoint Downloaded!
                      </div>
                      <div
                        style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2,}}>
                        WPR_{zp(reportNum)}_{site}.pptx — check your Downloads
                        folder
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                 <a href={resolveViewUrl(successUrls.pptUrl)} target="_blank" rel="noreferrer" className="wpr-link-row">
                <span className="wpr-link-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                <div className="wpr-link-label">
                  <div style={{ fontWeight: 800 }}>View Report</div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                    Preview in browser
                  </div>
                </div>
                <span className="wpr-link-arrow">→</span>
              </a>

              <button
                type="button"
                className="wpr-link-row"
                style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
                onClick={() =>
                  forceDownload(successUrls.pptUrl, `WPR_${zp(reportNum)}_${site.replace(/\s+/g, "_")}`)
                }
              >
                <span className="wpr-link-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
                <div className="wpr-link-label">
                  <div style={{ fontWeight: 800 }}>Download Report</div>
                  <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
                    Save in its original format
                  </div>
                </div>
                <span className="wpr-link-arrow">↓</span>
              </button>
                </div>
                <button className="btn btn-amber" style={{ width: "100%", height: 44, marginTop: 4 }} onClick={closeOverlay} >
                  ✓ Done
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Lightbox ── */}
        {lightbox &&
          (() => {
            const img = lightbox.images[lightbox.idx];
            return (
              <div
                onClick={closeLightbox}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 99999,
                  background: "rgba(0,0,0,0.92)",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Close */}
                <button
                  onClick={closeLightbox}
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "#dc2626",
                    border: "none",
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  ✕
                </button>

                {/* Counter */}
                <div
                  style={{
                    position: "absolute",
                    top: 18,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 20,
                    padding: "4px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {lightbox.idx + 1} / {lightbox.images.length}
                </div>

                {/* Prev */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    lbPrev();
                  }}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    border: "1.5px solid rgba(255,255,255,0.3)",
                    color: "#fff",
                    fontSize: 22,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  ‹
                </button>

                {/* Image */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: "90vw",
                    maxHeight: "85vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <img
                    src={img.dataUrl}
                    alt=""
                    style={{
                      maxWidth: "90vw",
                      maxHeight: "78vh",
                      objectFit: "contain",
                      borderRadius: 10,
                      border: "1.5px solid rgba(201,106,16,0.4)",
                      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                    }}
                  />
                  {(img.label || img.caption) && (
                    <div
                      style={{
                        background: "rgba(201,106,16,0.15)",
                        border: "1px solid #c96a10",
                        borderRadius: 8,
                        padding: "6px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#ffcfa0",
                        maxWidth: "80vw",
                        textAlign: "center",
                      }}
                    >
                      {img.label || img.caption}
                    </div>
                  )}
                </div>

                {/* Next */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    lbNext();
                  }}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(139, 135, 135, 0.15)",
                    border: "1.5px solid rgba(255,255,255,0.3)",
                    color: "#fff",
                    fontSize: 22,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  ›
                </button>
              </div>
            );
          })()}

        {/* Toast */}
        {toast && <div className={`wpr-toast ${toast.type}`}>{toast.msg}</div>}
      </div>

      {/* Image processing toast — driven by DOM directly for zero-lag display */}
      <div
        id="wpr-proc-toast"
        className="wpr-heic-toast"
        style={{ display: "none" }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            flexShrink: 0,
            border: "2.5px solid rgba(255,207,160,0.3)",
            borderTopColor: "#ffcfa0",
            animation: "wprSpin .7s linear infinite",
          }}
        />
        <div>
          <div
            id="wpr-proc-count"
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              color: "#ffcfa0",
              marginBottom: 3,
            }}
          >
            Processing…
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "rgba(255,207,160,0.75)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            Converting &amp; compressing
            <span className="wpr-heic-dots">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
