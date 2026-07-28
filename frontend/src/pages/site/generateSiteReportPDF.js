import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
// ─── generateSiteReportPDF.js ─────────────────────────────────────────────────
// Mirrors DPR.jsx's generateEveningPdf approach:
//   • chunk-by-chunk rendering via html2canvas
//   • logo watermark on every page (skip thank-you page)
//   • smart pre-check pagination (no mid-section splits)
//   • large photos (340px, 2-per-row) identical to DPR
//   • dark-orange section headers (#6b2d0f → #c8641a gradient)

const SVR_PDF_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.7;color:#0f172a;background:#fff;}

/* ── COVER ── */
.cover{margin-bottom:24px;page-break-inside:avoid;break-inside:avoid;}
.cover-top-bar{display:flex;justify-content:space-between;align-items:center;
  padding-bottom:14px;border-bottom:2px solid #0f172a;margin-bottom:20px;}
.brand-name{font-size:18px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0f172a;}
.brand-sub{font-size:13px;color:#64748b;margin-top:2px;}
.doc-site{font-size:18px;font-weight:800;color:#0f172a;text-align:right;}
.doc-sub{font-size:13px;color:#64748b;margin-top:3px;text-align:right;}
.cover-doc-type{font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;
  color:#64748b;margin-bottom:6px;}
.cover-main-title{font-size:34px;font-weight:900;letter-spacing:-0.5px;color:#0f172a;
  line-height:1.1;margin-bottom:8px;}
.cover-subtitle{font-size:14px;color:#64748b;border-left:3px solid #800000;
  padding-left:10px;margin-bottom:20px;}
.meta-bar{display:table;width:100%;border-collapse:collapse;border:1.5px solid #cbd5e1;}
.meta-cell{display:table-cell;padding:11px 16px;border-right:1.5px solid #cbd5e1;vertical-align:top;}
.meta-cell:last-child{border-right:none;}
.meta-key{display:block;font-size:11px;font-weight:700;letter-spacing:1.8px;
  text-transform:uppercase;color:#64748b;margin-bottom:4px;}
.meta-val{display:block;font-size:16px;font-weight:800;color:#0f172a;}

/* ── SECTION ── */
.section-wrap{margin-bottom:14px;border:1.5px solid #cbd5e1;
  page-break-inside:avoid;break-inside:avoid;}
.sec-header{display:flex;justify-content:space-between;align-items:center;
  background:linear-gradient(135deg,#800000,#b22222);padding:10px 14px;}
.sec-left{display:flex;align-items:center;gap:10px;}
.sec-num{font-size:18px;font-weight:900;color:#fff;}
.sec-title{font-size:17px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:#fff;}
.sec-body{background:#fff;}

/* ── BULLET LIST ── */
.bullet-list{padding:8px 16px;}
.bullet-item{display:flex;align-items:flex-start;gap:8px;padding:6px 0;
  border-bottom:1px solid #f1f5f9;}
.bullet-item:last-child{border-bottom:none;}
.bullet-arrow{color:#800000;font-weight:700;font-size:12px;margin-top:4px;flex-shrink:0;}
.bullet-text{font-size:15px;color:#0f172a;line-height:1.5;}

/* ── INFO ROWS (visit details) ── */
.info-row{display:flex;gap:20px;padding:10px 16px;border-bottom:1px solid #cbd5e1;}
.info-row:last-child{border-bottom:none;}
.info-key{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
  color:#64748b;min-width:160px;flex-shrink:0;padding-top:2px;}
.info-val{font-size:15px;color:#0f172a;}

/* ── PHOTOS ── */
.photo-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;
  margin-bottom:16px;page-break-inside:avoid;break-inside:avoid;}
.photo-card{border:1px solid #cbd5e1;overflow:hidden;}
.photo-card-img{width:100%;height:340px;background:#f1f5f9;
  display:flex;align-items:center;justify-content:center;}
.photo-card-img img{width:auto;height:auto;max-width:100%;max-height:100%;
  object-fit:contain;display:block;}
.photo-caption{padding:8px 12px;font-size:13px;font-weight:600;text-align:center;
  color:#334155;background:#f8fafc;border-top:1px solid #cbd5e1;}

/* ── THANK YOU ── */
.ty-page{display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:120px 40px;min-height:100vh;background:#fff;
  page-break-before:always;break-before:always;}
.ty-logo{width:110px;height:110px;object-fit:contain;margin-bottom:28px;}
.ty-line{width:80px;height:5px;background:linear-gradient(135deg,#800000,#b22222);margin:0 auto 28px;}
.ty-title{font-size:52px;font-weight:900;color:#0f172a;margin-bottom:16px;letter-spacing:-1px;}
.ty-sub{font-size:18px;color:#64748b;max-width:480px;margin:0 auto 32px;line-height:1.8;}
.ty-badge{display:inline-block;background:linear-gradient(135deg,#800000,#b22222);color:#fff;
  font-size:15px;font-weight:700;letter-spacing:3px;text-transform:uppercase;padding:14px 36px;}
.ty-meta{margin-top:36px;font-size:13px;color:#94a3b8;letter-spacing:.5px;}
`;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// Bullet list from multiline text
function bulletBlock(txt) {
  if (!txt?.trim()) return "";
  const lines = txt.split("\n").filter(l => l.trim());
  if (!lines.length) return "";

  return `<div class="bullet-list">${lines.map(l => {
    const isSub = /^ {2,}/.test(l);
    const text  = esc(l.replace(/^[\s•◦\-*]+/, "").trim());

    if (isSub) {
      return `<div class="bullet-item" style="padding-left:32px;border-bottom:1px solid #f8fafc;">
        <span class="bullet-arrow" style="color:#b45309;font-size:10px;margin-top:5px;">&#9656;</span>
        <span class="bullet-text" style="font-size:13.5px;color:#475569;">${text}</span>
      </div>`;
    }
    return `<div class="bullet-item">
      <span class="bullet-arrow">&#9658;</span>
      <span class="bullet-text">${text}</span>
    </div>`;
  }).join("")}</div>`;
}
// ── Script loader ──────────────────────────────────────────────────────────────
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function ensurePdfDeps() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
}

// ── Logo → base64 ─────────────────────────────────────────────────────────────
let _SVR_LOGO_B64 = null;
async function getSvrLogoBase64(logoSrc) {
  if (_SVR_LOGO_B64) return _SVR_LOGO_B64;
  return new Promise(resolve => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth  || 200;
      canvas.height = img.naturalHeight || 200;
      canvas.getContext("2d").drawImage(img, 0, 0);
      _SVR_LOGO_B64 = canvas.toDataURL("image/png");
      resolve(_SVR_LOGO_B64);
    };
    img.onerror = () => resolve(null);
    img.src = logoSrc;
  });
}

// ── Render one HTML chunk → canvas ───────────────────────────────────────────
async function renderChunk(html) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position:   "fixed",
    top:        "0",
    left:       "-9999px",
    width:      "794px",
    background: "#fff",
    zIndex:     "-1",
    fontFamily: "'Segoe UI',Arial,sans-serif",
    overflow:   "hidden",
  });

  const style = document.createElement("style");
  style.textContent = SVR_PDF_CSS;
  wrap.appendChild(style);

  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.zIndex   = "1";
  inner.innerHTML = html;
  wrap.appendChild(inner);

  document.body.appendChild(wrap);

  const imgs = Array.from(wrap.querySelectorAll("img"));
  await Promise.all(imgs.map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise(res => { img.onload = res; img.onerror = res; })
  ));
  await new Promise(r => setTimeout(r, 150));

  const canvas = await window.html2canvas(wrap, {
    scale:           2,
    useCORS:         true,
    allowTaint:      true,
    backgroundColor: "#ffffff",
    windowWidth:     794,
    scrollX:         0,
    scrollY:         0,
  });
  document.body.removeChild(wrap);
  return canvas;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateSiteReportPDF(formData, photos, logoSrc) {
  await ensurePdfDeps();
  const logoBase64 = await getSvrLogoBase64(logoSrc);

  const { jsPDF } = window.jspdf;
  const A4_W = 210, A4_H = 297, MARGIN = 10;
  const CONTENT_W = A4_W - MARGIN * 2;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // ── Watermark helper (logo, low opacity) ──
  function addWatermark() {
    if (!logoBase64) return;
    const SIZE = 130;
    const x = (A4_W - SIZE) / 2;
    const y = (A4_H - SIZE) / 2;
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity: 0.06 }));
    pdf.addImage(logoBase64, "PNG", x, y, SIZE, SIZE);
    pdf.restoreGraphicsState();
  }

  let cursorY = MARGIN;
  let pageNum  = 1;

  // Page 1 footer
  pdf.setFontSize(8); pdf.setTextColor(100);
  pdf.text(`Page 1  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, { align: "center" });

  // ── Add canvas to PDF, slicing across pages as needed ──
  async function addCanvasToPdf(canvas) {
    const PX_PER_MM = canvas.width / CONTENT_W;
    let srcY = 0;

    while (srcY < canvas.height) {
      const remainingPageMM = (A4_H - MARGIN) - cursorY;

      if (remainingPageMM < 20) {
        addWatermark();
        pdf.addPage();
        pageNum++;
        pdf.setFontSize(8); pdf.setTextColor(100);
        pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, { align: "center" });
        cursorY = MARGIN;
      }

      const slicePX  = Math.min(canvas.height - srcY, ((A4_H - MARGIN) - cursorY) * PX_PER_MM);
      const sliceMM  = slicePX / PX_PER_MM;

      const slice = document.createElement("canvas");
      slice.width  = canvas.width;
      slice.height = Math.ceil(slicePX);
      slice.getContext("2d").drawImage(
        canvas, 0, srcY, canvas.width, Math.ceil(slicePX),
        0, 0, canvas.width, Math.ceil(slicePX)
      );

      pdf.addImage(slice.toDataURL("image/jpeg", 0.93), "JPEG",
        MARGIN, cursorY, CONTENT_W, sliceMM);

      cursorY += sliceMM + 4;
      srcY    += Math.ceil(slicePX);

      if (srcY < canvas.height) {
        addWatermark();
        pdf.addPage();
        pageNum++;
        pdf.setFontSize(8); pdf.setTextColor(100);
        pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, { align: "center" });
        cursorY = MARGIN;
      }
    }
  }

  // ── Pre-check: if chunk won't fit, start a fresh page first ──
  async function addChunk(html) {
    const canvas = await renderChunk(html);
    const PX_PER_MM  = canvas.width / CONTENT_W;
    const heightMM   = canvas.height / PX_PER_MM;
    if (cursorY + heightMM > A4_H - MARGIN - 10) {
      addWatermark();
      pdf.addPage();
      pageNum++;
      pdf.setFontSize(8); pdf.setTextColor(100);
      pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, { align: "center" });
      cursorY = MARGIN;
    }
    await addCanvasToPdf(canvas);
  }

  // ── Section counter ──
  let secNum = 0;
  function secHeader(title) {
    secNum++;
    return `<div class="sec-header">
      <div class="sec-left">
        <span class="sec-num">${secNum}</span>
        <span class="sec-title">${title}</span>
      </div>
    </div>`;
  }
  function section(title, bodyHtml) {
    if (!bodyHtml?.trim()) return null;
    return `<div class="section-wrap">${secHeader(title)}<div class="sec-body">${bodyHtml}</div></div>`;
  }

  const dispDate = fmtDate(formData.visit_date);
  const dispTime = fmtTime(formData.visit_time);
  const genTime  = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const safeSite = (formData.site_name || "site").replace(/[\s/\\:*?"<>|]/g, "_");
  const fileName = `SVR_${safeSite}_${formData.visit_date}.pdf`;

  // ── 1. COVER ──────────────────────────────────────────────────────────────
  const coverHtml = `
    <div class="cover">
      <div class="cover-top-bar">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${logoBase64 || ""}"
            style="width:48px;height:48px;object-fit:contain;flex-shrink:0;${!logoBase64 ? "display:none;" : ""}"
            crossorigin="anonymous">
          <div>
            <div class="brand-name">DIP Projects</div>
            <div class="brand-sub">Civil Project Management Consultants</div>
          </div>
        </div>
        <div>
          <div class="doc-site">${esc(formData.site_name)}</div>
          <div class="doc-sub">${esc(formData.reporter_name)} · ${esc(dispDate)}</div>
        </div>
      </div>
      <div class="cover-doc-type">O F F I C I A L &nbsp; S I T E &nbsp; V I S I T &nbsp; R E P O R T</div>
      <div class="cover-main-title">SITE VISIT REPORT</div>
      <div class="cover-subtitle">An official site visit report prepared by the Project Management Consultant.</div>
      <div class="meta-bar">
        <div class="meta-cell">
          <span class="meta-key">P R O J E C T &nbsp; S I T E</span>
          <span class="meta-val">${esc(formData.site_name)}</span>
        </div>
        <div class="meta-cell">
          <span class="meta-key">R E P O R T E D &nbsp; B Y</span>
           <span class="meta-val">${esc(formData.reporter_name)}${formData.designation ? ` <span style="font-size:13px;font-weight:600;color:#64748b;">(${esc(formData.designation)})</span>` : ""}</span>
        </div>
        ${formData.visit_time?.trim() ? `
        <div class="meta-cell">
          <span class="meta-key">V I S I T &nbsp; T I M E</span>
          <span class="meta-val">${esc(dispTime)}</span>
        </div>` : ""}
        <div class="meta-cell">
          <span class="meta-key">V I S I T &nbsp; D A T E</span>
          <span class="meta-val">${esc(dispDate)}</span>
        </div>
      </div>
    </div>`;
  await addChunk(coverHtml);
// ── 1b. PRESENT MEMBERS (only if group visit) ────────────────────────────
  if (formData.visitType === "group" && formData.visitors?.length) {
    const filteredVisitors = formData.visitors.filter(v => v.name?.trim());
    if (filteredVisitors.length) {
    const rowsHtml = filteredVisitors.map((v, i) => `
      <div class="info-row" style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};">
        <span class="info-key" style="min-width:40px;font-size:13px;color:#64748b;">${i + 1}.</span>
        <span class="info-val" style="font-weight:700;">
          ${esc(v.name)}${v.designation?.trim()
            ? ` <span style="font-size:13px;font-weight:500;color:#64748b;">— ${esc(v.designation.trim())}</span>`
            : ""}
        </span>
      </div>`).join("");

      const membersHtml = `
        <div class="section-wrap">
          <div class="sec-header">
            <div class="sec-left">
              <span class="sec-num">—</span>
              <span class="sec-title">PRESENT MEMBERS</span>
              <span class="sec-num">—</span>
            </div>
          </div>
          <div class="sec-body">
            ${rowsHtml}
          </div>
        </div>`;
      await addChunk(membersHtml);
    }
  }
 

  // ── 3. TEXT SECTIONS ──────────────────────────────────────────────────────
  const textSections = [
    ["PROGRESS OF WORK & ONGOING ACTIVITIES", formData.progress_of_work],
    ["QUALITY OBSERVATIONS",                   formData.quality_observations],
    ["SAFETY CONCERNS",                        formData.safety_concerns],
    ["ISSUES & CONCERNS",                      formData.issues_concerns],
    ["SITE VISIT INSTRUCTIONS",                formData.site_visit_instructions],
    ["KEY INSTRUCTIONS",                       formData.key_instructions],
  ];
  for (const [title, txt] of textSections) {
    const body = bulletBlock(txt);
    const sec  = section(title, body);
    if (sec) await addChunk(sec);
  }

  // ── 4. PHOTOS (2-per-row, 340px tall, like DPR) ────────────────────────
  const validPhotos = (photos || []).filter(p => p.dataUrl || p.supabaseUrl);
  if (validPhotos.length) {
    secNum++;
    const sectionHeaderHtml = `
      <div class="sec-header" style="border:1.5px solid #cbd5e1;">
        <div class="sec-left">
          <span class="sec-num">${secNum}</span>
          <span class="sec-title">SITE PHOTOS</span>
        </div>
      </div>`;

    for (let i = 0; i < validPhotos.length; i += 2) {
      const pair = validPhotos.slice(i, i + 2);

      const makePh = ph => {
        const src = ph.supabaseUrl || ph.dataUrl;
        return `<div class="photo-card">
          <div class="photo-card-img">
            <img src="${src}" crossorigin="anonymous">
          </div>
          <div class="photo-caption">${ph.caption ? esc(ph.caption) : "&nbsp;"}</div>
        </div>`;
      };

      const pairBody = `
        <div style="padding:12px;border:1.5px solid #cbd5e1;border-top:none;background:#f8fafc;">
          <div class="photo-pair">
            ${makePh(pair[0])}
            ${pair[1] ? makePh(pair[1]) : `<div style="border:1px solid transparent;"></div>`}
          </div>
        </div>`;

      // First pair: glue section header on top
      const chunkHtml = i === 0
        ? `<div>${sectionHeaderHtml}${pairBody}</div>`
        : `<div>${pairBody}</div>`;

      await addChunk(chunkHtml);
    }
  }

  // ── 5. THANK YOU PAGE (no watermark) ─────────────────────────────────────
  addWatermark();
  pdf.addPage();
  pageNum++;
  const tyHtml = `
    <div class="ty-page" style="min-height:900px;">
      <img src="${logoBase64 || ""}" class="ty-logo"
        style="${!logoBase64 ? "display:none;" : ""}" crossorigin="anonymous">
      <div class="ty-line"></div>
      <div class="ty-title">Thank You</div>
      <div class="ty-sub">This report has been prepared to ensure transparency, quality, and continuous improvement at the project site.</div>
      <div class="ty-badge">DIP PROJECTS</div>
      <div class="ty-meta">Generated ${esc(genTime)} · Site Visit Report · ${esc(formData.site_name)}</div>
    </div>`;
  const tyCanvas = await renderChunk(tyHtml);
  const tyPxPerMm  = tyCanvas.width / CONTENT_W;
  const tyHeightMM = Math.min(tyCanvas.height / tyPxPerMm, A4_H - MARGIN * 2);
  const tyY        = (A4_H - tyHeightMM) / 2;
  pdf.addImage(
    tyCanvas.toDataURL("image/jpeg", 0.93), "JPEG",
    MARGIN, tyY, CONTENT_W, tyHeightMM
  );
  // No footer, no watermark on thank-you page
  // ── Save & return blob ────────────────────────────────────────────────────
  const pdfBlob = pdf.output("blob");
  return { blob: pdfBlob, fileName };
}