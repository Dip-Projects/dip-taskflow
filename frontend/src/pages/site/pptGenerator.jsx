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

// ── Professional table header row ─────────────────────────────────────────────
function drawTableHeader(slide, colX, colWidths, headers, y, hdrH, fontSize) {
  // Full-width navy background
  rect(slide, colX[0], y, colWidths.reduce((a, b) => a + b, 0), hdrH, TBL_HDR_BG);
  headers.forEach((h, ci) => {
    if (ci > 0) rect(slide, colX[ci], y, pt(0.5), hdrH, '4A6A8A');  // subtle divider
    tx(slide, h, colX[ci] + pt(4), y, colWidths[ci] - pt(8), hdrH,
      { bold: true, size: fontSize, color: TBL_HDR_FG, align: 'center', vAlign: 'middle', font: FONT });
  });
  // Bottom accent line
  rect(slide, colX[0], y + hdrH - pt(1.5), colWidths.reduce((a, b) => a + b, 0), pt(1.5), ORG);
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
// ── Professional table row ────────────────────────────────────────────────────
function drawTableRow(slide, colX, colWidths, vals, y, rowH, rowIdx, alignments, fontSize) {
  const bg = rowIdx % 2 === 0 ? WHT : TBL_ALT_BG;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  rect(slide, colX[0], y, totalW, rowH, bg);
  vals.forEach((val, ci) => {
    if (ci > 0) rect(slide, colX[ci], y, pt(0.3), rowH, TBL_BORDER);
    tx(slide, val, colX[ci] + pt(5), y + pt(2), colWidths[ci] - pt(10), rowH - pt(4),
      { size: fontSize, color: '1A2E42', align: (alignments && alignments[ci]) || (ci === 0 ? 'center' : 'left'),
        vAlign: 'middle', font: FONT, wrap: true });
  });
  // Row bottom border
  rect(slide, colX[0], y + rowH - pt(0.6), totalW, pt(0.6), TBL_BORDER);
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
  const LINE_H = pt(32);
  const GAP    = pt(5);

  const s = makeSlide(pres, hidden);
  s.background = { color: WHT };
  const contentY = addHeader(s, fd, 'Report Contents');

  let y = contentY + pt(8);
  let slideNo = 2;

  sections.forEach((sec, idx) => {
    if (y + LINE_H > SAFE_BOTTOM - pt(4)) return;
    // Subtle alternating row
    const bg = idx % 2 === 0 ? WHT : 'F5F8FF';
    rect(s, SAFE_LEFT, y, SAFE_WIDTH, LINE_H, bg);
    rect(s, SAFE_LEFT, y + LINE_H - pt(0.3), SAFE_WIDTH, pt(0.3), TBL_BORDER);

    // Number badge
    rect(s, SAFE_LEFT + pt(2), y + pt(4), pt(22), pt(22), NAVY);
    tx(s, (idx+1)+'', SAFE_LEFT + pt(2), y + pt(4), pt(22), pt(22),
      { bold: true, size: 9, color: WHT, align: 'center', vAlign: 'middle', font: FONT });

    tx(s, sec.title || '', SAFE_LEFT + pt(34), y, SAFE_WIDTH - pt(38), LINE_H,
      { bold: true, size: 11, color: '1A2E42', align: 'left', vAlign: 'middle', font: FONT });
    y += LINE_H + GAP;
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
  const HDR_H    = pt(28);
  // Taller rows to avoid content overflow
  const ROW_FONT = 9;
  const HDR_FONT = 10;
  const MIN_ROW = pt(24), MAX_ROW = pt(80), ROW_FONT_OA = 10;

  let i = 0, slideNo = 1;
  while (i < acts.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY = addHeader(s, fd, 'Detailed Status of Activities') + pt(6);
    let y = startY;
    const SAFE_BTM = SAFE_BOTTOM - pt(20);

    // Header row — professional navy
    const colX = [SAFE_LEFT, SAFE_LEFT + COL_SR, SAFE_LEFT + COL_SR + COL_NAME];
    const colW = [COL_SR, COL_NAME, COL_NOTE];
    drawTableHeader(s, colX, colW, ['SR', 'ACTIVITY NAME', 'STATUS / NOTE'], y, HDR_H, HDR_FONT);
    y += HDR_H;

    let rowIdx = 0;
    while (i < acts.length) {
      const act  = acts[i];
      // Estimate row height based on text length
      const statusLen = (act.status || '').length;
      const nameLen   = (act.name || '').length;
      // Approx chars per line at ROW_FONT
      const noteCharsPerLine  = Math.floor(COL_NOTE   / (ROW_FONT * 0.55 / 72));
      const nameCharsPerLine  = Math.floor(COL_NAME   / (ROW_FONT * 0.55 / 72));
      const noteLines  = Math.ceil(statusLen / Math.max(noteCharsPerLine, 1));
      const nameLines  = Math.ceil(nameLen   / Math.max(nameCharsPerLine, 1));
      const textLines  = Math.max(noteLines, nameLines, 1);
      const lineH      = (ROW_FONT + 2) / 72;
      const rowH = Math.min(MAX_ROW, Math.max(MIN_ROW, textLines * lineH + pt(10)));

      if (y + rowH > SAFE_BTM) break;

      drawTableRow(s, colX, colW,
        [String(i+1), (act.name || '').toUpperCase(), act.status || ''],
        y, rowH, rowIdx, ['center', 'left', 'left'], ROW_FONT);

      y += rowH; i++; rowIdx++;
    }

    // Outer border
    outerBorder(s, SAFE_LEFT, startY, SAFE_WIDTH, y - startY);
    addSlideNum(s, pres);
  }
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

  const MIN_ROW = pt(30), MAX_ROW = pt(80);
  let i = 0;

  while (i < plans.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY = addHeader(s, fd, 'Next Week Planning');
    let y = startY + pt(10);

    while (i < plans.length) {
      const rowH = calcRowHeight(
        [pt(40), SAFE_WIDTH - pt(56)],
        [String(i + 1), plans[i]],
        10, MIN_ROW, MAX_ROW
      );
      if (y + rowH > SAFE_BOTTOM) break;

      const bg = i % 2 ? 'F5F8FF' : WHT;
      rect(s, SAFE_LEFT, y, SAFE_WIDTH, rowH, bg);
      rect(s, SAFE_LEFT, y + rowH - pt(0.4), SAFE_WIDTH, pt(0.4), TBL_BORDER);

      // SR badge — navy
      rect(s, SAFE_LEFT, y, pt(40), rowH, NAVY);
      tx(s, String(i + 1), SAFE_LEFT, y, pt(40), rowH,
        { color: WHT, bold: true, size: 10, align: 'center', vAlign: 'middle', font: FONT });

      tx(s, plans[i], SAFE_LEFT + pt(52), y, SAFE_WIDTH - pt(56), rowH,
        { size: 10, color: '1A2E42', vAlign: 'middle', font: FONT });

      y += rowH;
      i++;
    }

    addSlideNum(s, pres);
  }
}

// ── Drawing Register ─────────────────────────────────────────────────────────
async function buildDrawingRegisterSlide(pres, fd, hidden = false) {
  const rows = (fd.drawingRegisterData || []).filter(r => {
    const hdrs = fd.drawingRegisterHeaders || [];
    return hdrs.some((_, hi) => r['col'+hi]);
  });
  if (!rows.length) return;

  const hdrs     = fd.drawingRegisterHeaders || ['Architect GFC Drawing','Structure GFC Drawing','MEPF GFC Drawing'];
  const headers  = ['SR.NO.', ...hdrs];
  const HDR_H    = pt(32);
  const ROWS_H    = pt(26);
  const TABLE_W  = SAFE_WIDTH;
  const SR_W     = TABLE_W * 0.06;
  const COL_W    = (TABLE_W - SR_W) / hdrs.length;
  const colWidths = [SR_W, ...hdrs.map((_, i) => i === hdrs.length-1 ? TABLE_W - SR_W - COL_W*(hdrs.length-1) : COL_W)];
  const colX = colWidths.reduce((acc, w, i) => { acc.push(i===0 ? SAFE_LEFT : acc[i-1]+colWidths[i-1]); return acc; }, []);
const ROW_FONT = 9;
const MIN_ROW  = pt(26);
const MAX_ROW  = pt(90);    
  const maxPerSlide = Math.floor((SAFE_BOTTOM - SAFE_TOP - HDR_H - pt(8)) / ROWS_H) || 1;
  let idx = 0, slideNo = 1;

  while (idx < rows.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    addHeader(s, fd, 'Drawing Register');
    let y = SAFE_TOP + pt(10);

    drawTableHeader(s, colX, colWidths, headers.map(h => h.toUpperCase()), y, HDR_H, 9);
    y += HDR_H;

    let placed = 0;
while (idx < rows.length && placed < maxPerSlide) {
  const row = rows[idx];
  const vals = [String(idx+1), ...hdrs.map((_, hi) => row['col'+hi] || '')];
  const rowH = calcRowHeight(colWidths, vals, ROW_FONT, MIN_ROW, MAX_ROW);
  if (y + rowH > SAFE_BOTTOM - pt(8)) break;
  drawTableRow(s, colX, colWidths, vals, y, rowH, placed, null, ROW_FONT);
  y += rowH; idx++; placed++;
}

    outerBorder(s, SAFE_LEFT, SAFE_TOP+pt(10), TABLE_W, y - SAFE_TOP - pt(10));
    addSlideNum(s, pres);
  }
}

// ── Office Activity ───────────────────────────────────────────────────────────
async function buildOfficeActivitySlide(pres, fd, hidden = false) {
  const items = (fd.officeActivityItems || []).filter(Boolean);
  if (!items.length) return;

  const CAT_H   = pt(24);
  const HDR_H   = pt(28);
  const MIN_ROW = pt(24);
  const MAX_ROW = pt(80);
  const ROW_FONT = 10;

  const SR_W  = SAFE_WIDTH * 0.07;
  const DET_W = SAFE_WIDTH - SR_W;
  const colX  = [SAFE_LEFT, SAFE_LEFT + SR_W];
  const colW  = [SR_W, DET_W];

  let idx = 0;

  while (idx < items.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    addHeader(s, fd, 'Office Activity');
    let y = SAFE_TOP + pt(10);

    // Category banner
    rect(s, SAFE_LEFT, y, SAFE_WIDTH, CAT_H, '2C4A6E');
    tx(s, 'BACK OFFICE WORK', SAFE_LEFT + pt(10), y, SAFE_WIDTH - pt(20), CAT_H,
      { bold: true, size: 9, color: WHT, align: 'center', vAlign: 'middle', font: FONT });
    y += CAT_H;

    drawTableHeader(s, colX, colW, ['SR.NO.', 'DETAILS'], y, HDR_H, ROW_FONT);
    y += HDR_H;

    let placed = 0;
    while (idx < items.length) {
      const vals = [String(idx + 1), items[idx]];
      const rowH = calcRowHeight(colW, vals, ROW_FONT, MIN_ROW, MAX_ROW);
      if (y + rowH > SAFE_BOTTOM - pt(8)) break;

      drawTableRow(s, colX, colW, vals, y, rowH, placed, ['center', 'left'], ROW_FONT);
      y += rowH;
      idx++;
      placed++;
    }

    outerBorder(s, SAFE_LEFT, SAFE_TOP + pt(10), SAFE_WIDTH, y - SAFE_TOP - pt(10));
    addSlideNum(s, pres);
  }
}

// ── Visitor Register ──────────────────────────────────────────────────────────
async function buildVisitorRegisterSlide(pres, fd, hidden = false) {
  const photos = (fd.visitorPhotos || []).filter(p => p && p.dataUrl);

  // Photo mode — render like MOM/Cube/Barchart range-captured images
  if (photos.length) {
    await buildRangeCaptureSlides(pres, fd, photos, 'Visitor Register', hidden);
    return;
  }

  // Manual mode — existing typed-table rendering
  const rows = (fd.visitorRegisterData || []).filter(r => r.name || r.type);
  if (!rows.length) return;

  const HDR_H   = pt(28);
  const MIN_ROW = pt(28);
  const MAX_ROW = pt(100);
  const ROW_FONT = 9;

  const SR_W    = SAFE_WIDTH * 0.06;
  const TYPE_W  = SAFE_WIDTH * 0.20;
  const NAME_W  = SAFE_WIDTH * 0.24;
  const INSTR_W = SAFE_WIDTH - SR_W - TYPE_W - NAME_W;
  const colWidths = [SR_W, TYPE_W, NAME_W, INSTR_W];
  const colX = colWidths.reduce((acc, w, i) => {
    acc.push(i === 0 ? SAFE_LEFT : acc[i-1] + colWidths[i-1]); return acc;
  }, []);
  const headers = ['SR.NO.', 'VISITOR TYPE', 'NAME / COMPANY', 'INSTRUCTIONS'];

  let idx = 0;
  while (idx < rows.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    addHeader(s, fd, 'Visitor Register');
    let y = SAFE_TOP + pt(10);

    drawTableHeader(s, colX, colWidths, headers, y, HDR_H, ROW_FONT);
    y += HDR_H;

    let placed = 0;
    while (idx < rows.length) {
      const row = rows[idx];
      const typeLabel = row.type === '__other__' ? (row.typeOther || 'Other') : (row.type || '');
      const vals = [String(idx+1), typeLabel, row.name||'', row.instruction||''];
      const rowH = calcRowHeight(colWidths, vals, ROW_FONT, MIN_ROW, MAX_ROW);
      if (y + rowH > SAFE_BOTTOM - pt(8)) break;
      drawTableRow(s, colX, colWidths, vals, y, rowH, placed, null, ROW_FONT);
      y += rowH; idx++; placed++;
    }

    outerBorder(s, SAFE_LEFT, SAFE_TOP+pt(10), SAFE_WIDTH, y - SAFE_TOP - pt(10));
    addSlideNum(s, pres);
  }
}

// ── Drawing & Decision Pending ────────────────────────────────────────────────
async function buildDrawingDecisionSlide(pres, fd, hidden = false) {
  const rows = (fd.drawingDecisionData || []).filter(r => r.drawingName);
  if (!rows.length) return;

  const HDR_H   = pt(28);
  const MIN_ROW = pt(26);
  const MAX_ROW = pt(80);
  const ROW_FONT = 9;

  const SR_W   = SAFE_WIDTH * 0.06;
  const DATE_W = SAFE_WIDTH * 0.18;
  const DWG_W  = SAFE_WIDTH - SR_W - DATE_W;
  const colWidths = [SR_W, DWG_W, DATE_W];
  const colX = colWidths.reduce((acc, w, i) => {
    acc.push(i === 0 ? SAFE_LEFT : acc[i - 1] + colWidths[i - 1]);
    return acc;
  }, []);
  const headers = ['SR.', 'DRAWING / DECISION NAME', 'REQUIRED DATE'];

  let idx = 0;

  while (idx < rows.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    addHeader(s, fd, 'Drawing & Decision Pending');
    let y = SAFE_TOP + pt(10);

    drawTableHeader(s, colX, colWidths, headers, y, HDR_H, ROW_FONT);
    y += HDR_H;

    let placed = 0;
    while (idx < rows.length) {
      const row = rows[idx];
      let dateDisp = row.requiredDate || '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateDisp)) {
        const [yr, mo, da] = dateDisp.split('-');
        dateDisp = `${da}/${mo}/${yr}`;
      }
      const vals = [String(idx + 1), row.drawingName || '', dateDisp];
      const rowH = calcRowHeight(colWidths, vals, ROW_FONT, MIN_ROW, MAX_ROW);
      if (y + rowH > SAFE_BOTTOM - pt(8)) break;

      drawTableRow(s, colX, colWidths, vals, y, rowH, placed, null, ROW_FONT);
      y += rowH;
      idx++;
      placed++;
    }

    outerBorder(s, SAFE_LEFT, SAFE_TOP + pt(10), SAFE_WIDTH, y - SAFE_TOP - pt(10));
    addSlideNum(s, pres);
  }
}

// ── Delay Points ──────────────────────────────────────────────────────────────
async function buildDelayPointsSlide(pres, fd, hidden = false) {
  const points = (fd.delayPoints || []).filter(Boolean);
  if (!points.length) return;

  const MIN_ROW = pt(30);
  const MAX_ROW = pt(90);
  const ROW_FONT = 10;
  const BADGE_W = pt(40);

  let idx = 0;

  while (idx < points.length) {
    const s = makeSlide(pres, hidden);
    s.background = { color: WHT };
    const startY = addHeader(s, fd, 'Delay Points / Highlights / Red Flag');
    let y = startY + pt(6);

    let placed = 0;
    while (idx < points.length) {
      const textColW = SAFE_WIDTH - pt(52);
      const rowH = calcRowHeight(
        [BADGE_W, textColW],
        [String(idx + 1), points[idx]],
        ROW_FONT, MIN_ROW, MAX_ROW
      );
      if (y + rowH > SAFE_BOTTOM - pt(8)) break;

      const bg = placed % 2 ? 'FFF5F5' : WHT;
      rect(s, SAFE_LEFT, y, SAFE_WIDTH, rowH, bg);
      rect(s, SAFE_LEFT, y + rowH - pt(0.5), SAFE_WIDTH, pt(0.5), 'FCA5A5');

      // Red badge
      rect(s, SAFE_LEFT, y, BADGE_W, rowH, 'DC2626');
      tx(s, String(idx + 1), SAFE_LEFT, y, BADGE_W, rowH,
        { color: WHT, bold: true, size: ROW_FONT, align: 'center', vAlign: 'middle', font: FONT });

      tx(s, points[idx], SAFE_LEFT + pt(52), y, textColW, rowH,
        { size: ROW_FONT, color: '1A2E42', vAlign: 'middle', font: FONT });

      y += rowH;
      idx++;
      placed++;
    }

    addSlideNum(s, pres);
  }
}

// ── MOM / Barchart / Cube (range-captured images) ────────────────────────────
async function buildRangeCaptureSlides(pres, fd, items, sectionTitle, hidden = false) {
  const filtered = (items || []).filter(i => i && i.dataUrl);
  if (!filtered.length) return;

  const CAPTION_H   = pt(26);
  const CAPTION_GAP = pt(6);

  for (let slideNo = 0; slideNo < filtered.length; slideNo++) {
    const item = filtered[slideNo];
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
      return (sitePhotos||[]).some(p => p.dataUrl);
    if (title === 'graphical report of work')
      return (graphicalImages||[]).some(i => i.dataUrl);
    if (title === 'detailed status of activities')
      return (activities||[]).some(a => a.name);
    if (title === 'next week planning')
      return (plans||[]).filter(Boolean).length > 0;
    if (title === 'drawing register')
      return (drawingData||[]).length > 0;
    if (title === 'office activity')
      return (officeItems||[]).filter(Boolean).length > 0;
    if (title === 'visitor register')
      return (visitors||[]).some(v => v.name) || (visitorPhotos||[]).some(p => p.dataUrl);
    if (title === 'drawing & decision pending')
      return (drawDecision||[]).some(d => d.drawingName);
    if (title === 'weekly site checklist')
      return (checklistPhotos||[]).some(p => p.dataUrl);
    if (title === 'delay points / highlights / red flag')
      return (delayPoints||[]).filter(Boolean).length > 0;
    if (title === 'mom review')
      return (momItems||[]).some(i => i.dataUrl);
    if (title === 'barchart & worksheet')
      return (barchartItems||[]).some(i => i.dataUrl);
    if (title === 'cube testing register')
      return (cubeItems||[]).some(i => i.dataUrl);
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