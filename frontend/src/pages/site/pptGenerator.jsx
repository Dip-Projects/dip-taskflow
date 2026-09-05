import logo from '../../assets/icon.png';
// Conversion helpers (pt → inches)
const pt = (v) => parseFloat((v / 72).toFixed(4));

// ── Slide geometry (inches) ──────────────────────────────────────────────────
const SW   = pt(720);   // 10.0
const SH   = pt(540);   // 7.5
const ML   = pt(40);    // left margin
const MR   = pt(40);    // right margin
const MT   = pt(100);   // top margin (content start)
const MB   = pt(40);    // bottom margin
const CW   = pt(640);   // content width
const CH   = pt(400);   // content height
const SAFE_TOP    = MT;
const SAFE_BOTTOM = SH - MB;                   // 7.222…
const SAFE_LEFT   = ML;
const SAFE_WIDTH  = CW;
const SAFE_HEIGHT = SAFE_BOTTOM - SAFE_TOP;    // 5.556…

// ── Brand colours ────────────────────────────────────────────────────────────
const NAVY   = '1A3A5C';
const ORG    = 'E87722';
const WHT    = 'FFFFFF';
const MUT    = '888888';
const YELLOW = 'F6E595';
const HDR_BG = 'F4B183'; 
const SEC_BG = 'D9E1F2';  
const CAP_BG = 'EEF3FB'; 
const ALT_BG = 'F8F9FA'; 

const TBL_HDR_BG  = '1A3A5C';  
const TBL_HDR_FG  = 'FFFFFF';
const TBL_ALT_BG  = 'F0F4FA';
const TBL_BORDER  = '9EB3CC';   

// Font
const FONT   = 'Calibri';

// ── pptxgenjs helpers ────────────────────────────────────────────────────────
let logoDataUrl = null;

export async function getLogoDataUrl() {
  if (logoDataUrl) return logoDataUrl;

  const res = await fetch(logo);
  const blob = await res.blob();

  logoDataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  return logoDataUrl;
}


// Text box
function tx(slide, text, x, y, w, h, opts = {}) {
  if (w <= 0 || h <= 0) return;
  slide.addText(String(text ?? ''), {
    x, y, w, h,
    fontFace: opts.font || FONT,
    fontSize: opts.size || 11,
    bold:     !!opts.bold,
    italic:   !!opts.italic,
    color:    opts.color || NAVY,
    align:    opts.align || 'left',
    valign:   opts.vAlign || 'top',
    wrap:     true,
    margin:   opts.margin !== undefined ? opts.margin : 2,
    ...( opts.autoFit ? { autoFit: true } : {} ),
  });
}

// Filled rectangle
function rect(slide, x, y, w, h, fill, lineColor) {
  if (w <= 0 || h <= 0) return;
  slide.addShape('rect', {
    x, y, w, h,
    fill:   { color: fill },
    line:   lineColor ? { color: lineColor, width: 0.5 } : { color: fill, width: 0 },
  });
}

// Image from dataUrl
function img(slide, dataUrl, x, y, w, h) {
  if (!dataUrl || w <= 0 || h <= 0) return;
  try {
    slide.addImage({ data: dataUrl, x, y, w, h,
      sizing: { type: 'contain', w, h } });
  } catch (e) { /* skip bad image */ }
}

// ── SHARED: addHeader ────────────────────────────────────────────────────────
function addHeader(slide, fd, sectionTitle) {
  const siteName = fd.projectName || '';

  const TOP_MARGIN          = pt(18);
  const DATE_FONT           = pt(13);
  const DATE_TO_BOX_GAP     = pt(12);
  const BOX_HEIGHT          = pt(32);
  const BOX_TO_LINE_GAP     = pt(8);
  const LINE_TO_CONTENT_GAP = pt(10);
  const HEADER_FONT         = 10;

  const dateY = TOP_MARGIN;
  const boxY  = dateY + DATE_FONT + DATE_TO_BOX_GAP;
  const lineY = boxY + BOX_HEIGHT + BOX_TO_LINE_GAP;
  const contentStartY = lineY + LINE_TO_CONTENT_GAP;

  tx(slide,
    'Progress Report Till ' + fd.reportDate,
    SAFE_LEFT, dateY, SAFE_WIDTH * 0.55, DATE_FONT + pt(4),
    { color: NAVY, bold: true, size: HEADER_FONT, font: FONT }
  );

  const CW_est = (HEADER_FONT * 0.62) / 72;
  const maxAvailW = SAFE_WIDTH;

  const siteNat = Math.max(pt(40), siteName.length * CW_est + pt(32));
  const secNat  = sectionTitle
    ? Math.max(pt(60), sectionTitle.length * CW_est + pt(32))
    : 0;

  let siteW, secW;
  if (!sectionTitle) {
    siteW = Math.min(siteNat, maxAvailW);
    secW  = 0;
  } else if (siteNat + secNat <= maxAvailW) {
    siteW = siteNat;
    secW  = secNat;
  } else {
    siteW = Math.max(pt(40), Math.min(maxAvailW * 0.35, siteNat));
    secW  = Math.max(pt(60), maxAvailW - siteW);
  }

  rect(slide, SAFE_LEFT, boxY, siteW, BOX_HEIGHT, HDR_BG);
  tx(slide, siteName, SAFE_LEFT + pt(4), boxY, siteW - pt(8), BOX_HEIGHT,
    { color: NAVY, bold: true, size: HEADER_FONT, font: FONT, align: 'center', vAlign: 'middle', autoFit: true });

  if (sectionTitle && secW > 0) {
    rect(slide, SAFE_LEFT + siteW, boxY, secW, BOX_HEIGHT, SEC_BG);
    tx(slide, sectionTitle, SAFE_LEFT + siteW + pt(4), boxY, secW - pt(8), BOX_HEIGHT,
      { color: NAVY, bold: true, size: HEADER_FONT, font: FONT, align: 'center', vAlign: 'middle', autoFit: true });
  }

  const dashW = pt(3);
  const gapW  = pt(3);
  let lx = SAFE_LEFT;
  while (lx < SAFE_LEFT + SAFE_WIDTH - dashW) {
    rect(slide, lx, lineY, dashW, pt(1), '666666');
    lx += dashW + gapW;
  }

  // ── Single logo block ──
  if (fd.logoDataUrl) {
    const logoW = pt(88), logoH = pt(36);
    const logoX = SAFE_LEFT + SAFE_WIDTH - logoW;
    try {
      slide.addImage({ data: fd.logoDataUrl,
        x: logoX, y: pt(8), w: logoW, h: logoH,
        sizing: { type: 'contain', w: logoW, h: logoH } });
    } catch(e) {}
  }

  return contentStartY;
}

function addSlideNum(slide, pres) {
  const n = pres.slides ? pres.slides.length : '?';
  tx(slide, String(n), SW - pt(42), SH - pt(24), pt(28), pt(20),
    { color: MUT, size: 9, font: FONT, align: 'center' });
}

// ── placeImageContain ────────────────────────────────────────────────────────
function placeImageContain(slide, dataUrl, x, y, boxW, boxH) {
  if (!dataUrl) return { bottom: y };
  try {
    const finalW = boxW;
    const finalH = boxH;
    slide.addImage({ data: dataUrl,
      x: x, y: y, w: finalW, h: finalH,
      sizing: { type: 'contain', w: finalW, h: finalH } });
    return { bottom: y + finalH };
  } catch (e) {
    return { bottom: y };
  }
}

// ── Caption bar ──────────────────────────────────────────────────────────────
function drawCaption(slide, capX, capY, capW, capH, text) {
  rect(slide, capX, capY, capW, capH, CAP_BG);
  rect(slide, capX, capY,          capW, pt(0.5), NAVY);
  rect(slide, capX, capY+capH-pt(0.5), capW, pt(0.5), NAVY);
  tx(slide, text, capX + pt(4), capY, capW - pt(8), capH,
    { size: 9, color: NAVY, font: FONT, align: 'center', vAlign: 'middle' });
}

// ── Orange outer border ───────────────────────────────────────────────────────
// REPLACE outerBorder:
function outerBorder(slide, x, y, w, h) {
  const t = pt(1.2);
  const color = 'A0B4C8';  // soft blue-grey instead of thick orange
  rect(slide, x,       y,       w, t,     color);
  rect(slide, x,       y+h-t,   w, t,     color);
  rect(slide, x,       y,       t, h,     color);
  rect(slide, x+w-t,   y,       t, h,     color);
}

const CELL_BORDER = [
  { type: 'solid', pt: 0.6, color: TBL_BORDER },
  { type: 'solid', pt: 0.6, color: TBL_BORDER },
  { type: 'solid', pt: 0.6, color: TBL_BORDER },
  { type: 'solid', pt: 0.6, color: TBL_BORDER },
];
const HDR_BORDER = [
  { type: 'solid', pt: 0.6, color: '4A6A8A' },
  { type: 'solid', pt: 0.6, color: '4A6A8A' },
  { type: 'solid', pt: 1.5, color: ORG },
  { type: 'solid', pt: 0.6, color: '4A6A8A' },
];

function pptCell(text, opts = {}) {
  const options = {
    fontFace: opts.fontFace || FONT,
    fontSize: opts.fontSize || 9,
    bold: !!opts.bold,
    color: opts.color || '1A2E42',
    align: opts.align || 'left',
    valign: opts.valign || 'middle',
    fill: { color: opts.fill || WHT },
    border: opts.border || CELL_BORDER,
    margin: opts.margin != null ? opts.margin : 4,
  };
  if (opts.colspan > 1) options.colspan = opts.colspan;
  if (opts.rowspan > 1) options.rowspan = opts.rowspan;
  return { text: String(text ?? ''), options };
}

function headerRow(headers, fontSize = 10) {
  return (headers || []).map((h) =>
    pptCell(h, {
      bold: true,
      color: TBL_HDR_FG,
      fill: TBL_HDR_BG,
      align: 'center',
      fontSize,
      border: HDR_BORDER,
    })
  );
}

function bodyRow(vals, rowIdx, alignments, fontSize = 9, extras) {
  return (vals || []).map((val, ci) =>
    pptCell(val, {
      fontSize,
      align: (alignments && alignments[ci]) || (ci === 0 ? 'center' : 'left'),
      fill: rowIdx % 2 === 0 ? WHT : TBL_ALT_BG,
      ...(extras && extras[ci] ? extras[ci] : {}),
    })
  );
}

function addPptTable(slide, { x, y, w, colW, rows, fontSize = 9 }) {
  if (!rows?.length) return;
  slide.addTable(rows, {
    x,
    y,
    w,
    colW,
    fontFace: FONT,
    fontSize,
    valign: 'middle',
    border: CELL_BORDER,
    align: 'left',
  });
}

// ── Dynamic row height calculator ────────────────────────────────────────────
// ── Dynamic row height calculator ────────────────────────────────────────────
function calcRowHeight(colWidths, vals, fontSize, minH, maxH) {
  const charW = (fontSize * 0.55) / 72;  // approx inch per char
  const lineH = (fontSize + 2.5) / 72;
  let maxLines = 1;
  vals.forEach((val, ci) => {
    const charsPerLine = Math.max(1, Math.floor((colWidths[ci] - pt(10)) / charW));
    const lines = Math.ceil((String(val || '').length) / charsPerLine);
    maxLines = Math.max(maxLines, lines);
  });
  return Math.min(maxH, Math.max(minH, maxLines * lineH + pt(14)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════
// Wraps pres.addSlide() — if hidden=true, marks slide as hidden in PPT
function makeSlide(pres, hidden = false) {
  const s = pres.addSlide();
  if (hidden) {
    // PptxGenJS exposes the underlying slide object — set hidden via presLayout
    try { s.hidden = true; } catch(_) {}
    // Fallback: set on the raw slide data object
    try {
      const raw = pres.slides?.[pres.slides.length - 1];
      if (raw) raw.hidden = true;
    } catch(_) {}
  }
  return s;
}

function renderPagedTable(pres, hidden, fd, sectionTitle, {
  headers,
  getRow,
  count,
  colW,
  alignments,
  fontSize = 9,
  headerFontSize = 10,
  minRow = pt(24),
  maxRow = pt(80),
  extraTopRows,
  styleRow,
}) {
  if (!count) return;
  const hdrH = pt(28);
  const extraH = extraTopRows?.length ? extraTopRows.length * pt(24) : 0;
  let i = 0;
  while (i < count) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY = addHeader(s, fd, sectionTitle) + pt(8);
    let used = extraH + hdrH;
    const body = [];
    while (i < count) {
      const vals = getRow(i);
      const rowH = calcRowHeight(colW, vals, fontSize, minRow, maxRow);
      if (body.length && startY + used + rowH > SAFE_BOTTOM - pt(8)) break;
      body.push(bodyRow(vals, body.length, alignments, fontSize, styleRow?.(vals, body.length)));
      used += rowH;
      i++;
    }
    addPptTable(s, {
      x: SAFE_LEFT,
      y: startY,
      w: SAFE_WIDTH,
      colW,
      fontSize,
      rows: [...(extraTopRows || []), headerRow(headers, headerFontSize), ...body],
    });
    addSlideNum(s, pres);
  }
}

function weightColWidths(table, totalW) {
  const n = Math.max(1, table.colCount || 1);
  const weights = Array(n).fill(4);
  const addRow = (row) => {
    let col = 0;
    (row || []).forEach((c) => {
      const span = c.colspan || 1;
      weights[col] = Math.max(weights[col], Math.min(String(c.text || '').length, 40));
      col += span;
    });
  };
  (table.titles || []).forEach(addRow);
  (table.headers || []).forEach(addRow);
  (table.body || []).forEach(addRow);
  const sum = weights.reduce((a, b) => a + b, 0) || n;
  const widths = weights.map((w) => (w / sum) * totalW);
  const used = widths.slice(0, -1).reduce((a, b) => a + b, 0);
  widths[n - 1] = totalW - used;
  return widths;
}

function excelCellsToPptRow(row, styleFn) {
  return (row || []).map((c, ci) => {
    const extra = styleFn ? styleFn(c, ci) : {};
    return pptCell(c.text, {
      colspan: c.colspan,
      rowspan: c.rowspan,
      align: extra.align || 'center',
      fontSize: extra.fontSize || 8,
      bold: !!extra.bold,
      fill: extra.fill || WHT,
      color: extra.color || '1A2E42',
      border: extra.border,
    });
  });
}

function buildExcelTableSlides(pres, fd, item, sectionTitle, hidden = false) {
  const table = item?.table;
  const bodyAll = table?.body || [];
  if (!table || !bodyAll.length) return false;

  const colW = weightColWidths(table, SAFE_WIDTH);
  const titles = (table.titles || []).map((row) =>
    excelCellsToPptRow(row, () => ({
      bold: true,
      fill: 'FDF3E7',
      color: '7A2E00',
      fontSize: 10,
      align: 'center',
    }))
  );
  const headers = (table.headers || []).map((row) =>
    excelCellsToPptRow(row, () => ({
      bold: true,
      fill: TBL_HDR_BG,
      color: TBL_HDR_FG,
      fontSize: 9,
      align: 'center',
      border: HDR_BORDER,
    }))
  );

  const prefixH = titles.length * pt(22) + headers.length * pt(26);
  let i = 0;
  while (i < bodyAll.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY = addHeader(s, fd, sectionTitle) + pt(6);
    let used = prefixH;
    const chunk = [];
    while (i < bodyAll.length) {
      const vals = bodyAll[i].map((c) => c.text);
      const rowH = calcRowHeight(colW, vals, 8, pt(18), pt(56));
      if (chunk.length && startY + used + rowH > SAFE_BOTTOM - pt(8)) break;
      chunk.push(bodyAll[i]);
      used += rowH;
      i++;
    }
    const bodyRows = chunk.map((row, ri) =>
      excelCellsToPptRow(row, () => ({
        fontSize: 8,
        fill: ri % 2 ? TBL_ALT_BG : WHT,
        align: 'center',
      }))
    );
    addPptTable(s, {
      x: SAFE_LEFT,
      y: startY,
      w: SAFE_WIDTH,
      colW,
      fontSize: 8,
      rows: [...titles, ...headers, ...bodyRows],
    });
    addSlideNum(s, pres);
  }
  return true;
}

function itemHasContent(item) {
  return !!(item && (item.dataUrl || (item.table && item.table.body && item.table.body.length)));
}

// ── Title Slide ───────────────────────────────────────────────────────────────
async function buildTitleSlide(pres, fd, hidden = false) {
  const s = makeSlide(pres, hidden);
  s.background = { color: WHT };

  // Logo top-right (only on title slide)
  const logoW = pt(100), logoH = pt(42);
  const logoX = SAFE_LEFT + SAFE_WIDTH - logoW;
  if (fd.logoDataUrl) {
    try {
      s.addImage({ data: fd.logoDataUrl, x: logoX, y: pt(20), w: logoW, h: logoH,
        sizing: { type: 'contain', w: logoW, h: logoH } });
    } catch (e) {
      rect(s, logoX, pt(20), logoW, logoH, WHT, 'E0E0E0');
      tx(s, 'LOGO', logoX, pt(20), logoW, logoH, { color: MUT, size: 9, font: FONT, align: 'center', vAlign: 'middle' });
    }
  } else {
    rect(s, logoX, pt(20), logoW, logoH, WHT, 'E0E0E0');
    tx(s, 'LOGO', logoX, pt(20), logoW, logoH, { color: MUT, size: 9, font: FONT, align: 'center', vAlign: 'middle' });
  }

  const blockW  = pt(500);
  const blockX  = (SW - blockW) / 2;
  const blockH  = pt(260);
  let y         = (SH - blockH) / 2;

  if (fd.titleSiteImage) {
    const imgMaxW = pt(400);
    const imgMaxH = SH * 0.38;
    const dims    = await getNativeImageSize(fd.titleSiteImage);
    const scale   = Math.min(imgMaxW / dims.w, imgMaxH / dims.h, 1);
    const imgW    = dims.w * scale;
    const imgH    = dims.h * scale;
    const imgX    = (SW - imgW) / 2;
    try {
      s.addImage({ data: fd.titleSiteImage, x: imgX, y: y, w: imgW, h: imgH });
    } catch (e) {}
    y += imgH + pt(16);
  }

  tx(s, 'Work Progress Report — ' + String(fd.reportNumber || 1).padStart(2, '0'),
    blockX, y, blockW, pt(48),
    { bold: true, size: 22, align: 'center', color: NAVY, font: FONT });
  y += pt(52);

  tx(s, 'Till ' + fd.reportDate,
    blockX, y, blockW, pt(28),
    { size: 13, align: 'center', color: MUT, font: FONT });
  y += pt(34);

  tx(s, fd.projectName || '',
    blockX, y, blockW, pt(28),
    { size: 11, align: 'center', color: ORG, bold: true, font: FONT });
  y += pt(30);
}

// ── Contents Slide ───────────────────────────────────────────────────────────
async function buildContentsSlide(pres, fd, sections, hidden = false) {
  if (!sections || !sections.length) return;

  const s = makeSlide(pres, hidden);
  s.background = { color: WHT };
  const contentY = addHeader(s, fd, 'Report Contents');

  const srW = pt(40);
  const rows = [
    headerRow(['#', 'SECTION'], 10),
    ...sections.map((sec, idx) =>
      bodyRow([String(idx + 1), sec.title || ''], idx, ['center', 'left'], 11)
    ),
  ];
  addPptTable(s, {
    x: SAFE_LEFT,
    y: contentY + pt(8),
    w: SAFE_WIDTH,
    colW: [srW, SAFE_WIDTH - srW],
    fontSize: 11,
    rows,
  });

  addSlideNum(s, pres);
}

// ── Activities Slide ─────────────────────────────────────────────────────────
async function buildActivitiesSlide(pres, fd, hidden = false) { 
  const acts = (fd.activities || []).filter(a => a.name);
  if (!acts.length) return;

  const COL_SR   = pt(36);
  const COL_NAME = pt(210);
  const COL_NOTE = SAFE_WIDTH - COL_SR - COL_NAME;
  renderPagedTable(pres, hidden, fd, 'Detailed Status of Activities', {
    headers: ['SR', 'ACTIVITY NAME', 'STATUS / NOTE'],
    count: acts.length,
    getRow: (i) => [String(i + 1), (acts[i].name || '').toUpperCase(), acts[i].status || ''],
    colW: [COL_SR, COL_NAME, COL_NOTE],
    alignments: ['center', 'left', 'left'],
    fontSize: 9,
    headerFontSize: 10,
    minRow: pt(24),
    maxRow: pt(80),
  });
}

// ── Image grid helper (graphical / site photos / checklist / cube / mom / barchart)
async function buildPhotoSlides(pres, fd, items, sectionTitle, perRow = 3, hidden = false) {
  const photos = (items || []).filter(p => p && p.dataUrl);
  if (!photos.length) return;

  const GAP_X      = pt(14);
  const CAPTION_H  = pt(24);
  const CAPTION_GAP = pt(6);
  const IMG_MAX_H  = pt(240);

  let i = 0, slideNo = 1;
  while (i < photos.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY = addHeader(s, fd, sectionTitle) + pt(16);
    const batch  = photos.slice(i, i + perRow);
    const cols   = batch.length;
    const cellW  = (SAFE_WIDTH - GAP_X * (cols - 1)) / cols;
    const maxAvailH = SAFE_BOTTOM - startY - CAPTION_H - CAPTION_GAP - pt(4);
    const imageBoxH = Math.min(maxAvailH, IMG_MAX_H);

    let x = SAFE_LEFT + (SAFE_WIDTH - (cols * cellW + (cols-1)*GAP_X)) / 2;
    for (const photo of batch) {
      const caption = (photo.label || photo.caption || '').trim();
      const myBoxH  = caption ? imageBoxH : Math.min(imageBoxH + CAPTION_H + CAPTION_GAP, maxAvailH + CAPTION_H + CAPTION_GAP);

      await slide_addImage_contain(s, photo.dataUrl, x, startY, cellW, myBoxH);

      if (caption) {
        const capY = startY + myBoxH + CAPTION_GAP;
        const CHAR_W = pt(5.8);
        let capWidth = Math.min(caption.length * CHAR_W + pt(16), cellW - pt(4));
        if (capWidth < pt(50)) capWidth = pt(50);
        const capX = x + (cellW - capWidth) / 2;
        const safeCapY = Math.min(capY, SAFE_BOTTOM - CAPTION_H - pt(2));
        rect(s, capX, safeCapY, capWidth, CAPTION_H, CAP_BG);
        rect(s, capX, safeCapY, capWidth, pt(0.4), NAVY);
        rect(s, capX, safeCapY+CAPTION_H-pt(0.4), capWidth, pt(0.4), NAVY);
        rect(s, capX, safeCapY, pt(0.4), CAPTION_H, NAVY);
        rect(s, capX+capWidth-pt(0.4), safeCapY, pt(0.4), CAPTION_H, NAVY);
        tx(s, caption, capX+pt(3), safeCapY+pt(2), capWidth-pt(6), CAPTION_H-pt(4),
          { size: 9, font: FONT, align: 'center', vAlign: 'middle', color: NAVY });
      }
      x += cellW + GAP_X;
    }

    addSlideNum(s, pres);
    i += perRow;
  }
}


function getNativeImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({
      w: img.naturalWidth  / 96,
      h: img.naturalHeight / 96,
    });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}
  
// addImage with correct aspect ratio, no stretching
async function slide_addImage_contain(slide, dataUrl, x, y, w, h) {
  if (!dataUrl) return;
  try {
    const nativeDims = await getNativeImageSize(dataUrl);
    const scale = Math.min(w / nativeDims.w, h / nativeDims.h, 1);
    const finalW = nativeDims.w * scale;
    const finalH = nativeDims.h * scale;
    const offsetX = (w - finalW) / 2;
    const offsetY = (h - finalH) / 2;
    slide.addImage({ data: dataUrl,
      x: x + offsetX, y: y + offsetY,
      w: finalW, h: finalH });
  } catch (e) {}
}

// ── Graphical Report ─────────────────────────────────────────────────────────
// Images are made as large as possible — full content area
async function buildGraphicalSlides(pres, fd, hidden = false) {
  const imgs = (fd.graphicalImages || []).filter(i => i && i.dataUrl);
  if (!imgs.length) return;

  const CAPTION_H   = pt(26);
  const CAPTION_GAP = pt(6);

  let i = 0, slideNo = 1;
  while (i < imgs.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const imgTop = addHeader(s, fd, 'Graphical Report of Work') + pt(8);

    const imgObj = imgs[i];
    const caption = (imgObj.label || imgObj.caption || '').trim();
    const capReserve = caption ? CAPTION_H + CAPTION_GAP : 0;
    // Maximize the image area — use nearly all available content height
    const maxH = SAFE_BOTTOM - imgTop - capReserve - pt(4);

    await slide_addImage_contain(s, imgObj.dataUrl, SAFE_LEFT, imgTop, SAFE_WIDTH, maxH);

    if (caption) {
      const capY = Math.min(imgTop + maxH + CAPTION_GAP, SAFE_BOTTOM - CAPTION_H - pt(2));
      rect(s, SAFE_LEFT, capY, SAFE_WIDTH, CAPTION_H, CAP_BG);
      rect(s, SAFE_LEFT, capY, SAFE_WIDTH, pt(0.5), NAVY);
      rect(s, SAFE_LEFT, capY+CAPTION_H-pt(0.5), SAFE_WIDTH, pt(0.5), NAVY);
      tx(s, caption, SAFE_LEFT+pt(6), capY+pt(2), SAFE_WIDTH-pt(12), CAPTION_H-pt(4),
        { size: 10, color: NAVY, font: FONT, align: 'center', vAlign: 'middle' });
    }

    addSlideNum(s, pres);
    i++;
  }
}

// ── Next Week Planning ───────────────────────────────────────────────────────
async function buildNextWeekSlide(pres, fd, hidden = false) {
  const plans = (fd.nextWeekPlans || []).filter(Boolean);
  if (!plans.length) return;

  const srW = pt(40);
  renderPagedTable(pres, hidden, fd, 'Next Week Planning', {
    headers: ['SR', 'PLAN'],
    count: plans.length,
    getRow: (i) => [String(i + 1), plans[i]],
    colW: [srW, SAFE_WIDTH - srW],
    alignments: ['center', 'left'],
    fontSize: 10,
    minRow: pt(30),
    maxRow: pt(80),
    styleRow: () => [{ fill: NAVY, color: WHT, bold: true, align: 'center' }, {}],
  });
}

// ── Drawing Register ─────────────────────────────────────────────────────────
async function buildDrawingRegisterSlide(pres, fd, hidden = false) {
  const rows = (fd.drawingRegisterData || []).filter(r => {
    const hdrs = fd.drawingRegisterHeaders || [];
    return hdrs.some((_, hi) => r['col'+hi]);
  });
  if (!rows.length) return;

  const hdrs = fd.drawingRegisterHeaders || ['Architect GFC Drawing','Structure GFC Drawing','MEPF GFC Drawing'];
  const TABLE_W = SAFE_WIDTH;
  const SR_W = TABLE_W * 0.06;
  const COL_W = (TABLE_W - SR_W) / hdrs.length;
  const colWidths = [SR_W, ...hdrs.map((_, i) => i === hdrs.length - 1 ? TABLE_W - SR_W - COL_W * (hdrs.length - 1) : COL_W)];
  renderPagedTable(pres, hidden, fd, 'Drawing Register', {
    headers: ['SR.NO.', ...hdrs.map((h) => String(h).toUpperCase())],
    count: rows.length,
    getRow: (i) => [String(i + 1), ...hdrs.map((_, hi) => rows[i]['col' + hi] || '')],
    colW: colWidths,
    fontSize: 9,
    headerFontSize: 9,
    minRow: pt(26),
    maxRow: pt(90),
  });
}

// ── Office Activity ───────────────────────────────────────────────────────────
async function buildOfficeActivitySlide(pres, fd, hidden = false) {
  const items = (fd.officeActivityItems || []).filter(Boolean);
  if (!items.length) return;

  const SR_W = SAFE_WIDTH * 0.07;
  const DET_W = SAFE_WIDTH - SR_W;
  renderPagedTable(pres, hidden, fd, 'Office Activity', {
    headers: ['SR.NO.', 'DETAILS'],
    count: items.length,
    getRow: (i) => [String(i + 1), items[i]],
    colW: [SR_W, DET_W],
    alignments: ['center', 'left'],
    fontSize: 10,
    minRow: pt(24),
    maxRow: pt(80),
    extraTopRows: [[
      pptCell('BACK OFFICE WORK', {
        colspan: 2,
        bold: true,
        fill: '2C4A6E',
        color: WHT,
        align: 'center',
        fontSize: 9,
      }),
    ]],
  });
}

// ── Visitor Register ──────────────────────────────────────────────────────────
async function buildVisitorRegisterSlide(pres, fd, hidden = false) {
  const photos = (fd.visitorPhotos || []).filter((p) => p && (p.dataUrl || p.table));

  if (photos.length) {
    await buildRangeCaptureSlides(pres, fd, photos, 'Visitor Register', hidden);
    return;
  }

  const rows = (fd.visitorRegisterData || []).filter(r => r.name || r.type);
  if (!rows.length) return;

  const SR_W    = SAFE_WIDTH * 0.06;
  const TYPE_W  = SAFE_WIDTH * 0.20;
  const NAME_W  = SAFE_WIDTH * 0.24;
  const INSTR_W = SAFE_WIDTH - SR_W - TYPE_W - NAME_W;
  renderPagedTable(pres, hidden, fd, 'Visitor Register', {
    headers: ['SR.NO.', 'VISITOR TYPE', 'NAME / COMPANY', 'INSTRUCTIONS'],
    count: rows.length,
    getRow: (i) => {
      const row = rows[i];
      const typeLabel = row.type === '__other__' ? (row.typeOther || 'Other') : (row.type || '');
      return [String(i + 1), typeLabel, row.name || '', row.instruction || ''];
    },
    colW: [SR_W, TYPE_W, NAME_W, INSTR_W],
    fontSize: 9,
    minRow: pt(28),
    maxRow: pt(100),
  });
}

// ── Drawing & Decision Pending ────────────────────────────────────────────────
async function buildDrawingDecisionSlide(pres, fd, hidden = false) {
  const rows = (fd.drawingDecisionData || []).filter(r => r.drawingName);
  if (!rows.length) return;

  const SR_W   = SAFE_WIDTH * 0.06;
  const DATE_W = SAFE_WIDTH * 0.18;
  const DWG_W  = SAFE_WIDTH - SR_W - DATE_W;
  renderPagedTable(pres, hidden, fd, 'Drawing & Decision Pending', {
    headers: ['SR.', 'DRAWING / DECISION NAME', 'REQUIRED DATE'],
    count: rows.length,
    getRow: (i) => {
      const row = rows[i];
      let dateDisp = row.requiredDate || '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateDisp)) {
        const [yr, mo, da] = dateDisp.split('-');
        dateDisp = `${da}/${mo}/${yr}`;
      }
      return [String(i + 1), row.drawingName || '', dateDisp];
    },
    colW: [SR_W, DWG_W, DATE_W],
    alignments: ['center', 'left', 'center'],
    fontSize: 9,
    minRow: pt(26),
    maxRow: pt(80),
  });
}

// ── Delay Points ──────────────────────────────────────────────────────────────
async function buildDelayPointsSlide(pres, fd, hidden = false) {
  const points = (fd.delayPoints || []).filter(Boolean);
  if (!points.length) return;

  const BADGE_W = pt(40);
  renderPagedTable(pres, hidden, fd, 'Delay Points / Highlights / Red Flag', {
    headers: ['#', 'POINT'],
    count: points.length,
    getRow: (i) => [String(i + 1), points[i]],
    colW: [BADGE_W, SAFE_WIDTH - BADGE_W],
    alignments: ['center', 'left'],
    fontSize: 10,
    minRow: pt(30),
    maxRow: pt(90),
    styleRow: (_vals, rowIdx) => [
      { fill: 'DC2626', color: WHT, bold: true, align: 'center' },
      { fill: rowIdx % 2 ? 'FFF5F5' : WHT },
    ],
  });
}

// ── MOM / Barchart / Cube (native tables when captured from Excel) ────────────
async function buildRangeCaptureSlides(pres, fd, items, sectionTitle, hidden = false) {
  const filtered = (items || []).filter(itemHasContent);
  if (!filtered.length) return;

  const CAPTION_H   = pt(26);
  const CAPTION_GAP = pt(6);

  for (let slideNo = 0; slideNo < filtered.length; slideNo++) {
    const item = filtered[slideNo];
    if (item.table && buildExcelTableSlides(pres, fd, item, sectionTitle, hidden)) {
      continue;
    }
    if (!item.dataUrl) continue;
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY    = addHeader(s, fd, sectionTitle) + pt(8);
    const labelText = (item.caption || '').trim();
    const capReserve = labelText ? CAPTION_H + CAPTION_GAP : 0;
    // Maximize image height
    const maxH = SAFE_BOTTOM - startY - capReserve - pt(2);

    await slide_addImage_contain(s, item.dataUrl, SAFE_LEFT, startY, SAFE_WIDTH, maxH);

    if (labelText) {
      const capY = Math.min(startY + maxH + CAPTION_GAP, SAFE_BOTTOM - CAPTION_H - pt(2));
      rect(s, SAFE_LEFT, capY, SAFE_WIDTH, CAPTION_H, CAP_BG);
      rect(s, SAFE_LEFT, capY, SAFE_WIDTH, pt(0.5), NAVY);
      rect(s, SAFE_LEFT, capY+CAPTION_H-pt(0.5), SAFE_WIDTH, pt(0.5), NAVY);
      tx(s, labelText, SAFE_LEFT+pt(6), capY+pt(2), SAFE_WIDTH-pt(12), CAPTION_H-pt(4),
        { size: 10, color: NAVY, align: 'center', vAlign: 'middle', font: FONT });
    }

    addSlideNum(s, pres);
  }
}
// ── Thank You Slide ───────────────────────────────────────────────────────────
async function buildThankYouSlide(pres, fd, hidden = false) {
  const s = makeSlide(pres, hidden);
  s.background = { color: WHT };

  // Logo top-right (only on thank-you slide)
  const logoW = pt(100), logoH = pt(42);
  const logoX = SAFE_LEFT + SAFE_WIDTH - logoW;
  if (fd.logoDataUrl) {
    try {
      s.addImage({ data: fd.logoDataUrl, x: logoX, y: pt(20),
        w: logoW, h: logoH, sizing: { type: 'contain', w: logoW, h: logoH } });
    } catch (e) {
      rect(s, logoX, pt(20), logoW, logoH, WHT, 'E0E0E0');
      tx(s, 'LOGO', logoX, pt(20), logoW, logoH,
        { color: MUT, size: 9, font: FONT, align: 'center', vAlign: 'middle' });
    }
  } else {
    rect(s, logoX, pt(20), logoW, logoH, WHT, 'E0E0E0');
    tx(s, 'LOGO', logoX, pt(20), logoW, logoH,
      { color: MUT, size: 9, font: FONT, align: 'center', vAlign: 'middle' });
  }

  const imgMaxW   = pt(400);
  const imgMaxH   = SH * 0.35;
  let   imgActualH = 0;

  if (fd.titleSiteImage) {
    const dims  = await getNativeImageSize(fd.titleSiteImage);
    const scale = Math.min(imgMaxW / dims.w, imgMaxH / dims.h, 1);
    const imgW  = dims.w * scale;
    const imgH  = dims.h * scale;
    imgActualH  = imgH;

    const totalH = imgH + pt(20) + pt(56) + pt(16);
    let y = (SH - totalH) / 2;

    const imgX = (SW - imgW) / 2;
    try { s.addImage({ data: fd.titleSiteImage, x: imgX, y, w: imgW, h: imgH }); }
    catch (e) {}
    y += imgH + pt(20);

    const smileySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#FFF3CD" stroke="#E87722" stroke-width="4"/>
      <circle cx="34" cy="40" r="5" fill="#1A3A5C"/>
      <circle cx="66" cy="40" r="5" fill="#1A3A5C"/>
      <path d="M28 60 Q50 80 72 60" fill="none" stroke="#1A3A5C" stroke-width="4.5" stroke-linecap="round"/>
    </svg>`;
    const smileyB64  = 'data:image/svg+xml;base64,' + btoa(smileySvg);
    const smileySize = pt(56);
    try {
      s.addImage({ data: smileyB64,
        x: (SW - smileySize) / 2, y, w: smileySize, h: smileySize });
    } catch (e) {}
    y += smileySize + pt(10);

    tx(s, 'Thank You!', SAFE_LEFT, y, SAFE_WIDTH, pt(56),
      { bold: true, size: 28, align: 'center', color: NAVY, font: FONT });
    y += pt(34);

    tx(s, fd.projectName || '', SAFE_LEFT, y, SAFE_WIDTH, pt(28),
      { size: 11, align: 'center', color: ORG, bold: true, font: FONT });

  } else {
    const smileySize = pt(72);
    const totalH = smileySize + pt(16) + pt(56);
    let y = (SH - totalH) / 2;

    const smileySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="#FFF3CD" stroke="#E87722" stroke-width="4"/>
      <circle cx="34" cy="40" r="5" fill="#1A3A5C"/>
      <circle cx="66" cy="40" r="5" fill="#1A3A5C"/>
      <path d="M28 60 Q50 80 72 60" fill="none" stroke="#1A3A5C" stroke-width="4.5" stroke-linecap="round"/>
    </svg>`;
    const smileyB64 = 'data:image/svg+xml;base64,' + btoa(smileySvg);
    try {
      s.addImage({ data: smileyB64,
        x: (SW - smileySize) / 2, y, w: smileySize, h: smileySize });
    } catch (e) {}
    y += smileySize + pt(16);

    tx(s, 'Thank You!', SAFE_LEFT, y, SAFE_WIDTH, pt(56),
      { bold: true, size: 28, align: 'center', color: NAVY, font: FONT });
    y += pt(34);

    tx(s, fd.projectName || '', SAFE_LEFT, y, SAFE_WIDTH, pt(28),
      { size: 11, align: 'center', color: ORG, bold: true, font: FONT });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER generatePPT function
// ═══════════════════════════════════════════════════════════════════════════════
async function generatePPT({
  site, engineer, reportDate, reportNum, location,
  activities, graphicalImages, sitePhotos, siteImage,
  plans, drawingHeaders, drawingData, officeItems, visitors,
  drawDecision, delayPoints, checklistPhotos, sections,
  barchartItems, cubeItems, momItems, visitorPhotos,
}) {
  const PptxGenJS = window.PptxGenJS;
  if (!PptxGenJS) throw new Error('PptxGenJS not loaded');

  const logoDataUrl = await getLogoDataUrl();
  const pres = new PptxGenJS();
  let globalSlideNum = 0;

  pres.defineLayout({ name: 'WPR', width: 10, height: 7.5 });
  pres.layout = 'WPR';

  pres.title  = `WPR ${String(reportNum||1).padStart(2,'0')} | ${site}`;
  pres.author = engineer;

  const fd = {
    projectName:  site,
    reportDate:   reportDate,
    engineerName: engineer,
    reportNumber: reportNum,
    location,
    activities:           activities || [],
    graphicalImages:      graphicalImages || [],
    sitePhotos:           sitePhotos || [],
    titleSiteImage:       siteImage || null,
    nextWeekPlans:        plans || [],
    drawingRegisterHeaders: drawingHeaders || [],
    drawingRegisterData:  drawingData || [],
    officeActivityItems:  officeItems || [],
    visitorRegisterData:  visitors || [],
    visitorPhotos:        visitorPhotos || [],
    drawingDecisionData:  drawDecision || [],
    delayPoints:          delayPoints || [],
    weeklyChecklistPhotos: checklistPhotos || [],
    barchartRegisterItems: barchartItems || [],
    cubeRangeImages:      cubeItems || [],
    momRegisterImages:    momItems || [],
    momRangeImages:       momItems || [],
    reportSections:       sections || [],
    logoDataUrl,
  };

const activeSections = (sections || []).filter(sec => {
    if (!sec || !sec.title) return false;
    if (sec.hidden) return false;
    const title = sec.title.toLowerCase().trim();
    if (title === 'site photographs')
      return (sitePhotos||[]).some(itemHasContent);
    if (title === 'graphical report of work')
      return (graphicalImages||[]).some(itemHasContent);
    if (title === 'detailed status of activities')
      return (activities||[]).some(a => a.name);
    if (title === 'next week planning')
      return (plans||[]).filter(Boolean).length > 0;
    if (title === 'drawing register')
      return (drawingData||[]).length > 0;
    if (title === 'office activity')
      return (officeItems||[]).filter(Boolean).length > 0;
    if (title === 'visitor register')
      return (visitors||[]).some(v => v.name) || (visitorPhotos||[]).some(itemHasContent);
    if (title === 'drawing & decision pending')
      return (drawDecision||[]).some(d => d.drawingName);
    if (title === 'weekly site checklist')
      return (checklistPhotos||[]).some(itemHasContent);
    if (title === 'delay points / highlights / red flag')
      return (delayPoints||[]).filter(Boolean).length > 0;
    if (title === 'mom review')
      return (momItems||[]).some(itemHasContent);
    if (title === 'barchart & worksheet')
      return (barchartItems||[]).some(itemHasContent);
    if (title === 'cube testing register')
      return (cubeItems||[]).some(itemHasContent);
    return true;
  });

  // ── 1. Title ────────────────────────────────────────────────────────────────
  await buildTitleSlide(pres, fd);

  // ── 2. Contents ─────────────────────────────────────────────────────────────
  await buildContentsSlide(pres, fd, activeSections);

  // ── 3. Section slides ────────────────────────────────────────────────────────
for (const sec of activeSections) {
    if (!sec || !sec.title) continue;
    const slideHidden = !!sec.slideHidden;  // 🙈 = add slide but mark hidden
    const title = sec.title.trim().toLowerCase();

   if      (title === 'detailed status of activities')        await buildActivitiesSlide(pres, fd, slideHidden);
    else if (title === 'graphical report of work')             await buildGraphicalSlides(pres, fd, slideHidden);
    else if (title === 'site photographs')                     await buildPhotoSlides(pres, fd, sitePhotos.map(p => ({...p, label: p.label||p.caption})), 'Site Photographs', 3, slideHidden);
    else if (title === 'cube testing register')                await buildRangeCaptureSlides(pres, fd, cubeItems, 'Cube Testing Register', slideHidden);
    else if (title === 'next week planning')                   await buildNextWeekSlide(pres, fd, slideHidden);
    else if (title === 'drawing register')                     await buildDrawingRegisterSlide(pres, fd, slideHidden);
    else if (title === 'office activity')                      await buildOfficeActivitySlide(pres, fd, slideHidden);
    else if (title === 'visitor register')                     await buildVisitorRegisterSlide(pres, fd, slideHidden);
    else if (title === 'drawing & decision pending')           await buildDrawingDecisionSlide(pres, fd, slideHidden);
    else if (title === 'weekly site checklist')                await buildPhotoSlides(pres, fd, checklistPhotos.map(p => ({...p})), 'Weekly Site Checklist', 3, slideHidden);
    else if (title === 'delay points / highlights / red flag') await buildDelayPointsSlide(pres, fd, slideHidden);
    else if (title === 'mom review')                           await buildRangeCaptureSlides(pres, fd, momItems, 'MOM Review', slideHidden);
    else if (title === 'barchart & worksheet')                 await buildRangeCaptureSlides(pres, fd, barchartItems, 'Barchart & Worksheet', slideHidden);
  }

  // ── 4. Thank You ─────────────────────────────────────────────────────────────
  await buildThankYouSlide(pres, fd);

  // ── Export ───────────────────────────────────────────────────────────────────
  const base64 = await pres.write({ outputType: 'base64' });
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export default generatePPT;