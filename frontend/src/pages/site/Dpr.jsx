import { useState, useEffect, useRef } from "react";

import LOGO_URL from "../../assets/logo.png";
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { ensureSiteBucket, sanitizeBucketName, SITE_FILES_BUCKET, uploadViaApi } from '../../lib/ensureBucket';




const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const cap = (s) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";

// NEW — Title Case: capitalises first letter of every word
const titleCase = (s) =>
  s
    ? s.replace(
        /\w\S*/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
      )
    : "";

// REPLACE the existing compressImage function with:
async function compressImage(file) {
  // Convert HEIC/HEIF to JPEG first if needed
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    (file.type === "" && /\.(heic|heif)$/i.test(file.name));

  let sourceFile = file;

  if (isHeic) {
    try {
      // Dynamically load heic2any
      if (!window.heic2any) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src =
            "https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const converted = await window.heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85,
      });
      sourceFile = Array.isArray(converted) ? converted[0] : converted;
    } catch (e) {
      console.warn("HEIC conversion failed, trying anyway:", e);
      sourceFile = file;
    }
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1000,
          QUALITY = 0.65;
        const scale = Math.min(1, MAX_W / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.onerror = () => resolve(null); // graceful failure
      img.src = e.target.result;
    };
    reader.readAsDataURL(sourceFile);
  });
}
// ─── Bucket helpers (shared site-files bucket via TaskFlow API) ───────────────
async function ensureBucketExists(_bucketName, site) {
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
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// ─── App CSS ─────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
*,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
:root {
  --ink:#1a1a1a; --ink2:#3d3d3d; --ink3:#7a7a7a;
  --bg:#f0ede8; --card:#ffffff;
  --border:rgba(0,0,0,.12); --border2:rgba(0,0,0,.07);
  --maroon:#800000; --maroon-light:rgba(128,0,0,.08);
  --orange:#6b2d0f; --orange3:#c8641a;
  --orange-bg:rgba(107,45,15,.07); --orange-line:rgba(107,45,15,.25);
  --green:#16a34a; --red:#dc2626; --blue:#2563eb;
  --grad:linear-gradient(135deg,#6b2d0f,#c8641a);
  --grad-eve:linear-gradient(135deg,#1e3a5f,#2563eb);
  --radius:10px; --font:'DM Sans',sans-serif; --mono:'DM Mono',monospace;
  --shadow:0 2px 16px rgba(0,0,0,.07);
}
body { background:var(--bg); font-family:var(--font); color:var(--ink); }
.dpr-root { min-height:100vh; padding:24px 16px 48px; }
.dpr-inner { max-width:1500px; margin:0 auto; }
.rtype-row { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1.5px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:22px; }
.rtype-btn { lineHeight:1;  flex:1; padding:11px 8px; border:none; background:transparent; font-family:var(--font); font-size:15px; font-weight:700; cursor:pointer; color:var(--ink3); transition:all .18s; white-space:nowrap; line-height:1.2; }.rtype-btn.morning.act { background:var(--grad); color:#fff; }
.rtype-btn.evening.act { background:var(--grad); color:#fff; }

.fg { display:flex; flex-direction:column; gap:5px; }
.flabel { font-size:11.5px; font-weight:700; color:var(--ink2); letter-spacing:.3px; }
.req { color:var(--red); }
.opt { font-size:10px; font-weight:500; color:var(--ink3); background:var(--bg); border-radius:4px; padding:1px 6px; margin-left:5px; }
.finput { font-family:var(--font); font-size:13.5px; color:var(--ink); background:var(--bg); border:1.5px solid var(--border); border-radius:8px; padding:9px 12px; outline:none; width:100%; transition:all .15s; }
.finput:focus { border-color:var(--orange3); box-shadow:0 0 0 3px rgba(107,45,15,.1); background:#fff; }
textarea.finput { resize:vertical; min-height:80px; }
select.finput { cursor:pointer; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
.col2 { grid-column:span 2; }
.col3 { grid-column:span 3; }
@media(max-width:640px) { .grid2,.grid3 { grid-template-columns:1fr; } .col2,.col3 { grid-column:span 1; } }

.sec-block { border-radius:8px; overflow:hidden; margin-bottom:14px; }
.sec-collapser{
display:flex;
align-items:center;
justify-content:space-between;
padding:12px 16px;
background:
        linear-gradient(#fff,#fff) padding-box,
        var(--grad) border-box;
border:2px solid transparent;border-radius:12px;color:#6b2d0f;cursor:pointer;font-family:var(--font);font-size:13.5px;font-weight:700;letter-spacing:.3px;width:100%;text-align:left;transition:all .15s ease;
}
.sec-collapser:hover{
    box-shadow:0 4px 12px rgba(200,100,26,.15);
    transform:translateY(-1px);
}
.sec-collapser .chevron { transition:transform .2s; }
.sec-collapser .chevron.open { transform:rotate(180deg); }
.sec-body { padding:16px 0px 16px 0px; background: linear-gradient(
    to bottom,
    #ffffff,
    #ffffff,
    rgba(0,0,0,0.05)
); }

.btn { display:inline-flex; align-items:center; gap:7px; font-family:var(--font); font-size:13px; font-weight:700; padding:10px 18px; border-radius:8px; border:none; cursor:pointer; transition:all .15s; }
.btn-orange { background:var(--grad); color:#fff; box-shadow:0 3px 10px rgba(107,45,15,.25); }
.btn-orange:hover { filter:brightness(1.08); transform:translateY(-1px); }
.btn-orange:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.btn-out { background:var(--card); color:var(--ink2); border:1.5px solid var(--border); }
.btn-out:hover { background:var(--bg); }
.btn-red { background:#fef2f2; color:var(--red); border:1.5px solid #fecaca; }
.btn-red:hover { background:#fee2e2; }
.btn-green { background:#f0fdf4; color:var(--green); border:1.5px solid #bbf7d0; }
.btn-whatsapp { background:#25d366;color:#fff; box-shadow:0 3px 10px rgba(37,211,102,.3); }
.btn-whatsapp:hover { filter:brightness(1.08); transform:translateY(-1px); }
.btn-whatsapp:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.btn-sm { padding:6px 12px; font-size:12px; border-radius:6px; }
.btn-icon { width:32px; height:32px; padding:0; justify-content:center; border-radius:6px; }
.act-row { display:flex; gap:10px; justify-content:flex-end; padding-top:18px; border-top:1px solid var(--border2); margin-top:16px; flex-wrap:wrap; }

.tbl-wrap { overflow-x:auto; border-radius:8px; border:1.5px solid var(--border); margin-top:12px; }
.tbl { width:100%; border-collapse:collapse; min-width:500px; }
.tbl th { font-size:10.5px; font-weight:800; color:var(--ink2); background:var(--bg); padding:9px 12px; text-align:left; border-bottom:1.5px solid var(--border); letter-spacing:.06em; text-transform:uppercase; }
.tbl td { padding:9px 12px; font-size:13px; border-bottom:1px solid var(--border2); color:var(--ink2); }
.tbl tr:last-child td { border-bottom:none; }
.tbl tr:hover td { background:#faf9f7; }

.photo-grid { display:flex; flex-wrap:wrap; gap:12px; margin-top:12px; }
.photo-item { position:relative; width:120px; flex-shrink:0; }
.photo-thumb { width:120px; height:120px; object-fit:cover; border-radius:6px; border:1.5px solid var(--border); display:block; }
.photo-caption { width:120px; font-size:11px; font-family:var(--font); color:var(--ink); background:var(--bg); border:1.5px solid var(--border); border-top:none; border-radius:0 0 6px 6px; padding:4px 6px; resize:none; min-height:30px; outline:none; }
.photo-remove { position:absolute; top:4px; right:4px; width:20px; height:20px; background:rgba(0,0,0,.55); color:#fff; border:none; border-radius:50%; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; }
.photo-remove:hover { background:var(--red); }
.photo-add-btn { width:120px; height:120px; border:2px dashed var(--border); border-radius:6px; background:var(--bg); cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:var(--ink3); font-size:12px; font-weight:600; transition:all .15s; }
.photo-add-btn:hover { border-color:var(--orange3); color:var(--orange); background:var(--orange-bg); }

.visitor-card-hdr{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:10px;
}

.visitor-num{
    width:28px;
    height:28px;
    min-width:28px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:11px;
    font-weight:800;
    color:#fff;
    background:var(--grad);
}

.visitor-card-hdr .finput{
    flex:1;
    min-width:0;
}

.visitor-card-hdr .btn-red{
    width:32px;
    height:32px;
    min-width:32px;
    padding:0;
    margin-left:0 !important;

    display:flex;
    align-items:center;
    justify-content:center;

    font-size:14px;
    font-weight:700;
    border-radius:8px;
}
    @media (max-width:600px){

  .visitor-card{
      padding:12px;
  }

  .visitor-card-hdr{
      gap:6px;
  }

  .visitor-num{
      width:26px;
      height:26px;
      min-width:26px;
      font-size:10px;
  }

  .visitor-card-hdr .btn-red{
      width:30px;
      height:30px;
      min-width:30px;
      font-size:13px;
  }
}
.custom-field-wrap { border:2px dashed var(--orange-line); border-radius:8px; padding:14px; background:var(--orange-bg); margin-bottom:10px; }

.info-banner { display:flex; align-items:flex-start; gap:9px; border-radius:8px; padding:11px 14px; font-size:13px; line-height:1.5; margin-bottom:16px; }
.info-blue { background:#eff6ff; border:1px solid #bfdbfe; color:var(--blue); }

.draft-bar { display:flex; gap:10px; margin-bottom:14px; }
.draft-btn { flex:1; padding:10px 14px; font-family:var(--font); font-size:12.5px; font-weight:700; border-radius:7px; cursor:pointer; transition:all .15s; }
.draft-open { background:#fefce8; color:#854d0e; border:1.5px solid #fde68a; }
.draft-open:hover { background:#fef9c3; }
.draft-del { background:#fef2f2; color:var(--red); border:1.5px solid #fecaca; }
.draft-del:hover { background:#fee2e2; }

.cement-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

.dpr-loading { display:flex; align-items:center; justify-content:center; padding:48px; gap:12px; color:var(--ink3); }
.spinner { width:22px; height:22px; border:2.5px solid var(--border); border-top-color:var(--orange3); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
@keyframes spin { to { transform:rotate(360deg); } }

.success-state { display:flex; flex-direction:column; align-items:center; padding:56px 24px; text-align:center; gap:14px; }
.success-ico { width:60px; height:60px; border-radius:50%; background:#f0fdf4; display:flex; align-items:center; justify-content:center; }
.success-title { font-size:18px; font-weight:800; }
.success-sub { font-size:13px; color:var(--ink2); max-width:360px; line-height:1.6; }

.pdf-overlay { position:fixed; inset:0; background:rgba(240,237,232,.96); display:flex; align-items:center; justify-content:center; flex-direction:column; z-index:9999; gap:20px; backdrop-filter:blur(4px); }
.pdf-overlay-title { font-size:18px; font-weight:800; color:var(--orange); }
.pdf-overlay-sub { font-size:13px; color:var(--ink2); max-width:360px; text-align:center; }

.popup-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px; }
.popup-box { background:#fff; border-radius:12px; width:100%; max-width:400px; padding:22px; box-shadow:0 16px 48px rgba(0,0,0,.18); }
.popup-title { font-size:16px; font-weight:800; margin-bottom:14px; }
.popup-btns { display:flex; gap:10px; margin-top:16px; }

.dpr-toast { position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; align-items:center; gap:9px; padding:11px 16px; border-radius:9px; font-size:13px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,.14); animation:slideUp .22s ease; max-width:420px; }
.dpr-toast-ok  { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
.dpr-toast-err { background:#fef2f2; color:var(--red); border:1px solid #fecaca; }
@keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }

.mp-type-popup-grid { display:flex; flex-direction:column; gap:10px; }
.progress-steps { display:flex; flex-direction:column; gap:8px; width:100%; max-width:340px; }
.progress-step { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:7px; font-size:12.5px; font-weight:600; }
.step-done { background:#f0fdf4; color:#166534; }
.step-active { background:#eff6ff; color:#1e3a5f; }
.step-pending { background:#f8fafc; color:#94a3b8; }

@media(max-width:600px) {
  .dpr-root { padding:8px 6px 40px; }
  .cement-row { grid-template-columns:1fr; }
  .act-row { flex-direction:column-reverse; }
  .act-row .btn { width:100%; justify-content:center; }
  .grid2 { grid-template-columns:1fr; }
  .grid3 { grid-template-columns:1fr; }
  .col2,.col3 { grid-column:span 1; }
  .rtype-btn { font-size:14px; padding:11px 6px; }
}

//-----DARK THEME CSS---------
[data-theme="dark"] .dpr-root {
  background:#141210;
}
[data-theme="dark"] .finput {
  background:#252320;
  border-color:#3a3733;
  color:#f0ede8;
}
[data-theme="dark"] .finput:focus {
  background:#2e2b27;
  border-color:#f59e0b;
}
[data-theme="dark"] textarea.finput {
  background:#252320;
  color:#f0ede8;
}
[data-theme="dark"] select.finput option {
  background:#252320;
  color:#f0ede8;
}
[data-theme="dark"] .flabel {
  color:#c4bdb4;
}
[data-theme="dark"] .sec-collapser {
  background:linear-gradient(#252320,#252320) padding-box, var(--grad) border-box;
  color:#fbbf24;
}
[data-theme="dark"] .sec-body {
  background:linear-gradient(to bottom,#1e1c19,#1e1c19,rgba(0,0,0,0.15));
}
[data-theme="dark"] .tbl th {
  background:#252320;
  color:#c4bdb4;
  border-color:#3a3733;
}
[data-theme="dark"] .tbl td {
  border-color:#2e2b27;
  color:#c4bdb4;
}
[data-theme="dark"] .tbl tr:hover td {
  background:#2a2724;
}
[data-theme="dark"] .tbl-wrap {
  border-color:#3a3733;
}
[data-theme="dark"] .tbl tr:last-child td {
  border-bottom:none;
}
[data-theme="dark"] .btn-out {
  background:#252320;
  color:#c4bdb4;
  border-color:#3a3733;
}
[data-theme="dark"] .btn-out:hover {
  background:#2e2b27;
}
[data-theme="dark"] .btn-red {
  background:#2d0a0a;
  color:#f87171;
  border-color:#7f1d1d;
}
[data-theme="dark"] .btn-green {
  background:#052e16;
  color:#4ade80;
  border-color:#166534;
}
[data-theme="dark"] .visitor-card {
  background:#252320;
  border-color:#3a3733;
}
[data-theme="dark"] .custom-field-wrap {
  background:rgba(107,45,15,.15);
  border-color:rgba(107,45,15,.4);
}
[data-theme="dark"] .info-banner.info-blue {
  background:#0c1d38;
  border-color:#1e3a5f;
  color:#60a5fa;
}
[data-theme="dark"] .draft-btn.draft-open {
  background:#2a1f08;
  color:#fbbf24;
  border-color:#4a3210;
}
[data-theme="dark"] .draft-btn.draft-del {
  background:#2d0a0a;
  color:#f87171;
  border-color:#7f1d1d;
}
[data-theme="dark"] .act-row {
  border-color:#2e2b27;
}
[data-theme="dark"] .rtype-btn {
  color:#7a7368;
  background:#1e1c19;
}
[data-theme="dark"] .rtype-row {
  border-color:#3a3733;
}
[data-theme="dark"] .popup-box {
  background:#1e1c19;
  color:#f0ede8;
}
[data-theme="dark"] .popup-title {
  color:#f0ede8;
}
[data-theme="dark"] .popup-backdrop {
  background:rgba(0,0,0,.6);
}
[data-theme="dark"] .photo-caption {
  background:#252320;
  border-color:#3a3733;
  color:#f0ede8;
}
[data-theme="dark"] .photo-add-btn {
  background:#252320;
  border-color:#3a3733;
  color:#7a7368;
}
[data-theme="dark"] .photo-add-btn:hover {
  border-color:#f59e0b;
  color:#fbbf24;
  background:#2a1f08;
}
[data-theme="dark"] .photo-thumb {
  border-color:#3a3733;
}
[data-theme="dark"] .success-state {
  background:#1e1c19;
}
[data-theme="dark"] .success-title {
  color:#f0ede8;
}
[data-theme="dark"] .success-sub {
  color:#c4bdb4;
}
[data-theme="dark"] .dpr-toast-ok {
  background:#052e16;
  color:#4ade80;
  border-color:#166534;
}
[data-theme="dark"] .dpr-toast-err {
  background:#2d0a0a;
  color:#f87171;
  border-color:#7f1d1d;
}
[data-theme="dark"] .step-done {
  background:#052e16;
  color:#4ade80;
}
[data-theme="dark"] .step-active {
  background:#0c1d38;
  color:#60a5fa;
}
[data-theme="dark"] .step-pending {
  background:#252320;
  color:#7a7368;
}
[data-theme="dark"] .pdf-overlay {
  background:rgba(20,18,16,.97);
}
[data-theme="dark"] .pdf-overlay-title {
  color:#fbbf24;
}
.mreq-item-list{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
.mreq-staged-row{display:flex;align-items:center;gap:12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;padding:11px 14px;}
.mreq-staged-main{flex:1;min-width:0;}
.mreq-staged-name{font-size:13.5px;font-weight:700;color:var(--ink);}
.mreq-staged-meta{font-size:12px;color:var(--ink3);margin-top:1px;}
.mreq-staged-remove{background:none;border:none;color:var(--ink3);cursor:pointer;padding:5px;border-radius:6px;display:flex;align-items:center;justify-content:center;}
.mreq-staged-remove:hover{color:var(--red);background:#fef2f2;}
.mreq-rcard{background:var(--card);border:1.5px solid var(--border);border-left:4px solid #d97706;border-radius:8px;padding:14px 16px;margin-bottom:10px;}
.mreq-rcard.received{border-left-color:var(--green);}
.mreq-rcard.rejected{border-left-color:var(--red);}
.mreq-rcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;}
.mreq-rcard-name{font-size:14px;font-weight:800;color:var(--ink);}
.mreq-rcard-qty{font-size:12.5px;color:var(--ink2);margin-top:2px;font-weight:600;}
.mreq-rcard-meta{font-size:11.5px;color:var(--ink3);margin-top:8px;line-height:1.6;}
.mreq-rcard-meta strong{color:var(--ink2);}
.mreq-empty{display:flex;flex-direction:column;align-items:center;padding:24px 12px;text-align:center;gap:8px;color:var(--ink3);}
.mreq-empty-title{font-size:13px;font-weight:700;color:var(--ink2);}
.mreq-empty-sub{font-size:12px;color:var(--ink3);}
.badge{display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;}
.badge-amber{background:#fffbeb;color:#d97706;border:1px solid #fde68a;}
.badge-red{background:#fef2f2;color:var(--red);border:1px solid #fecaca;}
.badge-green{background:#f0fdf4;color:var(--green);border:1px solid #bbf7d0;}
[data-theme="dark"] .mreq-staged-row{background:#252320;border-color:#3a3733;}
[data-theme="dark"] .mreq-staged-name{color:#f0ede8;}
[data-theme="dark"] .mreq-rcard{background:#1e1c19;border-color:#3a3733;}
[data-theme="dark"] .mreq-rcard-name{color:#f0ede8;}
[data-theme="dark"] .mreq-rcard-qty{color:#c4bdb4;}
[data-theme="dark"] .mreq-rcard-meta{color:#7a7368;}
[data-theme="dark"] .mreq-rcard-meta strong{color:#c4bdb4;}
[data-theme="dark"] .badge-amber{background:#2a1f08;color:#fbbf24;border-color:#4a3210;}
[data-theme="dark"] .badge-red{background:#2d0a0a;color:#f87171;border-color:#7f1d1d;}
[data-theme="dark"] .badge-green{background:#052e16;color:#4ade80;border-color:#166534;}
`;

// ─── PDF CSS (exact match to Google Apps Script style) ───────────────────────
const PDF_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.7;color:#0f172a;background:#fff;}

/* COVER */
.cover{margin-bottom:24px;}
.cover-top-bar{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:2px solid #0f172a;margin-bottom:20px;}
.brand-name{font-size:18px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#0f172a;}
.brand-sub{font-size:13px;color:#64748b;margin-top:2px;}
.doc-site{font-size:18px;font-weight:800;color:#0f172a;text-align:right;}
.doc-sub{font-size:13px;color:#64748b;margin-top:3px;text-align:right;}
.cover-doc-type{font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#64748b;margin-bottom:6px;}
.cover-main-title{font-size:34px;font-weight:900;letter-spacing:-0.5px;color:#0f172a;line-height:1.1;margin-bottom:8px;}
.cover-subtitle{font-size:14px;color:#64748b;border-left:3px solid #c8641a;padding-left:10px;margin-bottom:20px;}
.meta-bar{display:table;width:100%;border-collapse:collapse;border:1.5px solid #cbd5e1;}
.meta-cell{display:table-cell;padding:11px 16px;border-right:1.5px solid #cbd5e1;vertical-align:top;}
.meta-cell:last-child{border-right:none;}
.meta-key{display:block;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#64748b;margin-bottom:4px;}
.meta-val{display:block;font-size:16px;font-weight:800;color:#0f172a;}

/* SECTION */
.section-wrap{margin-bottom:18px;border:1.5px solid #cbd5e1;}
.sec-header{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#6b2d0f,#c8641a);padding:10px 14px;}
.sec-left{display:flex;align-items:center;gap:10px;}
.sec-num{font-size:18px;font-weight:900;color:#fff;}
.sec-title{font-size:17px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:#fff;}
.sec-tag{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.7);}
.pdf-sec-body{background:#fff !important;color:#0f172a;} 

/* UNIVERSAL TABLE */
table{width:100%;border-collapse:collapse;font-size:14px;}
table thead th{background:#000;color:#fff;border:1px solid #333;font-size:14px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:9px 14px;text-align:center;vertical-align:middle;}
table th,table td{border:1px solid #cbd5e1;padding:10px 14px;vertical-align:middle;text-align:center;}
table tbody tr:nth-child(even) td{background:#f8fafc;}
.td-left{text-align:left!important;}
.td-main{font-weight:600;color:#0f172a;text-align:left!important;}

/* MANPOWER */
.mp-group{border-bottom:1.5px solid #cbd5e1;}
.mp-group:last-of-type{border-bottom:none;}
.mp-group-header{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#f8fafc;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;}
.mp-group-name{font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#2c3e50;}
.mp-source-tag{font-size:14px;font-weight:700;color:#1d4ed8;}
.mp-total{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#374151;}
.mp-total-label{font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;}
.mp-total-val{font-size:24px;font-weight:900;color:#fff;}

/* BADGES */
.badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:13px;font-weight:700;}
.badge-m{background:#dbeafe;color:#1d4ed8;}
.badge-f{background:#fce7f3;color:#be185d;}
.badge-sk{background:#dcfce7;color:#15803d;}
.badge-ss{background:#fef3c7;color:#b45309;}
.badge-un{background:#fee2e2;color:#b91c1c;}
.unit-tag{display:inline-block;padding:3px 8px;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;font-size:13px;font-weight:700;border-radius:4px;}

/* CEMENT STOCK TABLE */
.stock-tbl{width:100%;border-collapse:collapse;font-size:14px;}
.stock-tbl td{padding:11px 16px;border-bottom:1px solid #cbd5e1;}
.stock-tbl tr:last-child td{border-bottom:none;}
.stock-tbl .s-key{text-align:left;font-weight:700;color:#334155;text-transform:uppercase;font-size:12px;letter-spacing:.8px;}
.stock-tbl .s-val{text-align:right;font-weight:800;font-size:16px;color:#0f172a;}
.stock-tbl .s-bal{color:#166534;}

/* CONCRETE */
.concrete-grid{display:table;width:100%;border-collapse:collapse;}
.concrete-cell{display:table-cell;width:33.3%;padding:20px 18px;text-align:center;border-right:1.5px solid #cbd5e1;vertical-align:top;}
.concrete-cell:last-child{border-right:none;}
.concrete-val{font-size:24px;font-weight:900;color:#0f172a;margin-bottom:5px;}
.concrete-label{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;margin-bottom:4px;}
.concrete-sub{font-size:13px;color:#64748b;}

/* VISITORS */
.visitor-row{padding:10px 16px;border-bottom:1px solid #cbd5e1;}
.visitor-row:last-child{border-bottom:none;}
.visitor-name{font-weight:800;font-size:15px;color:#0f172a;margin-bottom:5px;}
.visitor-instr{font-size:14px;color:#334155;line-height:1.7;}

/* PLAN LIST */
.plan-item{display:flex;align-items:baseline;gap:14px;padding:10px 16px;border-bottom:1px solid #cbd5e1;}
.plan-item:last-child{border-bottom:none;}
.plan-num{font-size:15px;font-weight:800;color:#800000;min-width:18px;flex-shrink:0;}
.plan-text{font-size:15px;color:#0f172a;}

/* BULLET LIST */
.bullet-list{padding:8px 16px;}
.bullet-item{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9;}
.bullet-item:last-child{border-bottom:none;}
.bullet-arrow{color:#800000;font-weight:700;font-size:12px;margin-top:4px;flex-shrink:0;}
.bullet-item.bullet-sub{padding-left:26px;}
.bullet-arrow-sub{color:#c8641a;font-size:9px;}
.bullet-item.bullet-sub .bullet-text{font-size:14px;color:#334155;}
.bullet-text{font-size:15px;color:#0f172a;line-height:1.45;}
.summary-cat-body{border:1.5px solid #cbd5e1;border-top:none;border-radius:0 0 4px 4px;padding:8px 16px;background:#fff;margin-bottom:10px;}
.section-wrap{margin-bottom:14px;border:1.5px solid #cbd5e1;page-break-inside:avoid;break-inside:avoid;}

/* SUMMARY with categories */
.summary-cat{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#fff;background:#800000;padding:7px 14px;border-radius:4px 4px 0 0;}
.summary-cat-body{border:1.5px solid #cbd5e1;border-top:none;border-radius:0 0 4px 4px;padding:12px 16px;background:#fff;margin-bottom:14px;}

/* PHOTOS */
.pdf-photo-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;padding:14px;background:#f8fafc;}
.photo-card{background:#fff;border:1px solid #cbd5e1;overflow:hidden;}
.photo-card img{width:100%;height:340px;object-fit:cover;display:block;}
.photo-card img{width:100%;height:280px;object-fit:cover;display:block;}
.pdf-photo-caption{padding:7px 10px;font-size:13px;font-weight:600;text-align:center;color:#64748b;background:#f8fafc;border-top:1px solid #cbd5e1;}

/* CUSTOM FIELDS */
.cf-row{display:flex;gap:20px;padding:10px 16px;border-bottom:1px solid #cbd5e1;}
.cf-row:last-child{border-bottom:none;}
.cf-key{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;min-width:160px;flex-shrink:0;padding-top:2px;}
.cf-val{font-size:15px;color:#0f172a;}

/* THANK YOU */
/* ADD to .section-wrap rule */
.section-wrap { margin-bottom:18px; border:1.5px solid #cbd5e1; page-break-inside:avoid; break-inside:avoid; }

/* ADD to .cover rule */
.cover { margin-bottom:24px; page-break-inside:avoid; break-inside:avoid; }

.ty-page {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; padding:120px 40px; min-height:100vh;
  background:#fff;
  page-break-before:always; break-before:always;
}
.ty-line { width:80px; height:5px; background:linear-gradient(135deg,#6b2d0f,#c8641a); margin:0 auto 28px; }
.ty-title { font-size:52px; font-weight:900; color:#0f172a; margin-bottom:16px; letter-spacing:-1px; }
.ty-sub { font-size:18px; color:#64748b; max-width:480px; margin:0 auto 32px; line-height:1.8; }
.ty-badge {display:inline-block; background:linear-gradient(135deg,#6b2d0f,#c8641a); color:#fff;
  font-size:15px; font-weight:700; letter-spacing:3px;
  text-transform:uppercase; padding:14px 36px;
}

.ty-meta { margin-top:36px; font-size:13px; color:#94a3b8; letter-spacing:.5px; }
.ty-logo { width:120px; height:120px; object-fit:contain; margin-bottom:28px; }
/* INFO ROWS */
.info-row{display:flex;gap:20px;padding:10px 16px;border-bottom:1px solid #cbd5e1;}
.info-row:last-child{border-bottom:none;}
.info-key{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;min-width:160px;flex-shrink:0;padding-top:2px;}
.info-val{font-size:15px;color:#0f172a;}

/* ── PENDING MATERIALS — HIGH-URGENCY SECTION ───────────────────────────── */
.pm-section-wrap{margin-bottom:18px;border:2.5px solid #dc2626;page-break-inside:avoid;break-inside:avoid;box-shadow:0 0 0 4px rgba(220,38,38,.1);}
.pm-header{display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#6b2d0f,#c8641a);padding:13px 16px;position:relative;overflow:hidden;}
.pm-header::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:repeating-linear-gradient(45deg,#fca5a5,#fca5a5 10px,#7f1d1d 10px,#7f1d1d 20px);}
.pm-header-left{display:flex;align-items:center;gap:10px;}
.pm-icon{width:26px;height:26px;flex-shrink:0;}
.pm-title{font-size:18px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:#fff;}
.pm-badge{background:#fbbf24;color:#7c2d12;font-size:11px;font-weight:900;letter-spacing:1px;text-transform:uppercase;padding:5px 12px;border-radius:20px;white-space:nowrap;}
.pm-subtitle{background:#fef2f2;border-bottom:2px solid #dc2626;padding:9px 16px;font-size:12.5px;color:#991b1b;font-weight:600;}
.pm-body{background:#fff;}
.pm-table{width:100%;border-collapse:collapse;font-size:14px;}
.pm-table thead th{background:#5b6470;color:#fff;border:1px solid #334155;font-size:12.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:10px 14px;text-align:left;}
.pm-table thead th.center{text-align:center;}
.pm-table td{border:1px solid #fecaca;padding:11px 14px;vertical-align:middle;}
.pm-table tbody tr:nth-child(even) td{background:#fef2f2;}
.pm-table tbody tr:nth-child(odd) td{background:#fff;}
.pm-mat-name{font-weight:800;color:#0f172a;font-size:14.5px;}
.pm-qty{font-weight:900;color:#800000;font-size:16px;text-align:center;}
.pm-unit{display:inline-block;padding:3px 10px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:12.5px;font-weight:700;border-radius:4px;}
.pm-empty{padding:24px 16px;text-align:center;color:#64748b;font-size:14px;font-style:italic;}

`;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── PDF section builder (only renders if content) ───────────────────────────
let _secNum = 0;
function pdfSection(title, bodyHtml) {
  if (!bodyHtml || !bodyHtml.trim()) return "";
  _secNum++;
  return `<div class="section-wrap">
    <div class="sec-header">
      <div class="sec-left">
        <span class="sec-num">${_secNum}</span>
        <span class="sec-title">${title}</span>
      </div>
    </div>
    <div class="pdf-sec-body">${bodyHtml}</div>
  </div>`;
}

function bulletBlock(txt) {
  if (!txt?.trim()) return "";
  const lines = txt.split("\n").filter((l) => l.trim());
  if (!lines.length) return "";
  return `<div class="bullet-list">${lines
    .map(
      (l) =>
        `<div class="bullet-item">
      <span class="bullet-arrow">&#9658;</span>
      <span class="bullet-text">${esc(l.replace(/^[•\-*]\s*/, "").trim())}</span>
    </div>`,
    )
    .join("")}</div>`;
}

function buildSummaryHtml(summary) {
  if (!summary?.trim()) return "";
  const lines = summary.replace(/\n{2,}/g, "\n").split("\n").filter((l) => l.trim());
  let html = "";
  let currentCat = "";
  let bullets = []; // { text, sub }

  function flush() {
    if (!currentCat && !bullets.length) return;
    const bHtml = bullets
      .map((b) =>
        b.sub
          ? `<div class="bullet-item bullet-sub">
              <span class="bullet-arrow bullet-arrow-sub">&#8226;</span>
              <span class="bullet-text">${esc(b.text)}</span>
            </div>`
          : `<div class="bullet-item">
              <span class="bullet-arrow">&#9658;</span>
              <span class="bullet-text">${esc(b.text)}</span>
            </div>`,
      )
      .join("");
    if (currentCat) {
      html += `<div class="summary-cat">${esc(currentCat.replace(/\*/g, "").trim())}</div>
               <div class="summary-cat-body">${bHtml}</div>`;
    } else {
      html += `<div class="bullet-list">${bHtml}</div>`;
    }
    bullets = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") && trimmed.endsWith("*") && trimmed.length > 2) {
      flush();
      currentCat = trimmed;
    } else {
      const isSub = /^\s*◦/.test(line) || /^ {2,}/.test(line);
      const cleanText = line.replace(/^\s*[•◦]\s*/, "").trim();
      bullets.push({ text: cleanText, sub: isSub });
    }
  });
  flush();
  return html ? `<div style="padding:14px 18px;">${html}</div>` : "";
}

function buildManpowerHtml(manpower) {
  if (!manpower?.length) return "";
  const grouped = {};
  let total = 0;
  manpower.forEach((m) => {
    const key = (m.labour || "—") + "|||" + (m.scope || "");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
    total += Number(m.count) || 0;
  });

  let html = "";
  Object.keys(grouped).forEach((key) => {
    const [labourType, scope] = key.split("|||");
    const items = grouped[key];
    html += `<div class="mp-group">
      <div class="mp-group-header">
        <span class="mp-group-name">${esc(labourType)}</span>
        ${scope ? `<span class="mp-source-tag">Source: ${esc(scope)}</span>` : ""}
      </div>
      <table><thead><tr><th>Category of Work</th><th>Gender</th><th>Skill Level</th><th>Count</th></tr></thead><tbody>`;
    items.forEach((item) => {
      const gClass =
        (item.gender || "").toUpperCase() === "FEMALE" ? "badge-f" : "badge-m";
      const sUp = (item.skill || "").toUpperCase();
      const sClass =
        sUp === "SKILLED"
          ? "badge-sk"
          : sUp === "SEMISKILLED"
            ? "badge-ss"
            : "badge-un";
      html += `<tr>
        <td class="td-left">${esc(item.category || "—")}</td>
        <td>${item.gender ? `<span class="badge ${gClass}">${esc(cap(item.gender))}</span>` : `<span style="color:#64748b;">—</span>`}</td>
        <td>${item.skill ? `<span class="badge ${sClass}">${esc(cap(item.skill))}</span>` : `<span style="color:#64748b;">—</span>`}</td>
        <td style="font-weight:800;font-size:16px;color:#0f172a;">${item.count || 0}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });

  html += `<div class="mp-total">
    <span class="mp-total-label">TOTAL MANPOWER ON SITE</span>
    <span class="mp-total-val">${total}</span>
  </div>`;
  return html;
}

function buildEquipmentHtml(equipment) {
  if (!equipment?.length) return "";
  const rows = equipment
    .map((eq) => {
      const srcClass =
        (eq.source || "").toLowerCase() === "client" ? "badge-m" : "badge-sk";
      return `<tr>
      <td><span class="badge ${srcClass}" style="font-size:13px;font-weight:800;padding:5px 12px;">${esc(cap(eq.source))}</span></td>
      <td class="td-left" style="font-weight:600;color:#0f172a;">${esc(eq.name)}</td>
      <td>${esc(String(eq.qty))}</td>
      <td><span class="unit-tag">${esc(eq.unit)}</span></td>
    </tr>`;
    })
    .join("");
  return `<table><thead><tr><th>Source</th><th>Equipment</th><th>Quantity</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildCementHtml(p) {
  const avail = Number(p.cementAvailable) || 0;
  const rcvd = Number(p.cementReceived) || 0;
  const used = Number(p.cementUsed) || 0;
  const bal = Number(p.cementBalance) || 0;
  // Only include rows that have non-zero values
  const rows = [];
  if (avail) rows.push(["On-site Available", avail + " bags", false]);
  if (rcvd) rows.push(["New Bags Received", rcvd + " bags", false]);
  if (used) rows.push(["Cement Used", used + " bags", false]);
  rows.push(["Balance", bal + " bags", true]);
  if (!avail && !rcvd && !used && !p.cementUsedDesc) return "";

  let html = `<table class="stock-tbl"><tbody>`;
  rows.forEach(([k, v, isBalance]) => {
    html += `<tr>
      <td class="s-key">${k}</td>
      <td class="s-val ${isBalance ? "s-bal" : ""}">${esc(v)}</td>
    </tr>`;
  });
  if (p.cementUsedDesc?.trim()) {
    html += `<tr><td class="s-key">Usage Description</td><td style="text-align:left;font-size:14px;color:#334155;">${esc(p.cementUsedDesc)}</td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function buildConcreteHtml(p) {
  const theo = parseFloat(p.concreteTheoretical) || 0;
  const actual = parseFloat(p.concreteOnsite) || 0;
  if (!theo && !actual) return "";
  const diff = (actual - theo).toFixed(3);
  const sign = parseFloat(diff) >= 0 ? "+" : "";
  const varColor =
    parseFloat(diff) > 0
      ? "#78350f"
      : parseFloat(diff) < 0
        ? "#991b1b"
        : "#065f46";
  let html = `<div class="concrete-grid">
    <div class="concrete-cell">
      <div class="concrete-val">${theo.toFixed(3)} m³</div>
      <div class="concrete-label">THEORETICAL QTY</div>
      <div class="concrete-sub">As per structural design</div>
    </div>
    <div class="concrete-cell" style="background:#eff6ff;">
      <div class="concrete-val" style="color:#1d4ed8;">${actual.toFixed(3)} m³</div>
      <div class="concrete-label">ON-SITE CONSUMPTION</div>
      <div class="concrete-sub">Actual poured on site</div>
    </div>
    <div class="concrete-cell">
      <div class="concrete-val" style="color:${varColor};">${sign}${diff} m³</div>
      <div class="concrete-label">VARIANCE</div>
      <div class="concrete-sub">Within acceptable range</div>
    </div>
  </div>`;
  if (p.concreteDescription?.trim()) {
    html += `<div style="padding:10px 16px;font-size:14px;color:#334155;border-top:1px solid #cbd5e1;">${esc(p.concreteDescription)}</div>`;
  }
  return html;
}

function buildMaterialHtml(list, showDesc = false) {
  if (!list?.length) return "";
  const rows = list
    .map(
      (m) =>
        `<tr>
      <td class="td-main">${esc(m.name)}</td>
      <td>${esc(String(m.qty))}</td>
      <td><span class="unit-tag">${esc(m.unit)}</span></td>
      ${showDesc ? `<td class="td-left" style="color:#475569;">${esc(m.desc || "—")}</td>` : ""}
    </tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Material</th><th>Qty</th><th>Unit</th>${showDesc ? "<th>Description</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`;
}

function buildCubeHtml(cube) {
  return bulletBlock(cube);
}

function buildVisitorsHtml(visitors) {
  const valid = (visitors || []).filter((v) => v.name);
  if (!valid.length) return "";
  return valid
    .map(
      (v) => `
    <div class="visitor-row">
      <div class="visitor-name">👤 ${esc(v.name)}</div>
      ${v.instruction ? `<div class="visitor-instr">${esc(v.instruction)}</div>` : ""}
    </div>`,
    )
    .join("");
}

function buildPlanningHtml(planning) {
  if (!planning?.trim()) return "";
  const lines = planning.split("\n").filter((l) => l.trim());
  if (!lines.length) return "";
  let num = 0;
  return lines
    .map((line) => {
      const clean = line.replace(/^\d+[\.\)]\s*|^[•\-*]\s*/, "").trim();
      if (!clean) return "";
      num++;
      return `<div class="plan-item">
      <span class="plan-num">${num}</span>
      <span class="plan-text">${esc(clean)}</span>
    </div>`;
    })
    .join("");
}

function buildCustomFieldsHtml(fields) {
  const valid = (fields || []).filter((f) => f.title && f.value);
  if (!valid.length) return "";
  return valid
    .map(
      (f) =>
        `<div class="cf-row"><span class="cf-key">${esc(f.title)}</span><span class="cf-val">${esc(f.value)}</span></div>`,
    )
    .join("");
}

function buildPhotosHtml(photos) {
  const valid = (photos || []).filter((p) => p.supabaseUrl || p.data);
  if (!valid.length) return "";

  let html = "";
  for (let i = 0; i < valid.length; i += 2) {
    const pair = valid.slice(i, i + 2);
    html += `<div class="photo-pair" style="
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:16px;
      margin-bottom:16px;
      page-break-inside:avoid;
      break-inside:avoid;
    ">`;

    const ph1 = pair[0];
    html += `
      <div style="border:1px solid #cbd5e1;overflow:hidden;">
        <div style="width:100%;height:340px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;">
          <img src="${ph1.supabaseUrl || ph1.data}"
            style="width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;display:block;"
            crossorigin="anonymous">
        </div>
        <div style="
          padding:8px 12px;font-size:13px;font-weight:600;
          text-align:center;color:#334155;background:#f8fafc;
          border-top:1px solid #cbd5e1;width:100%;box-sizing:border-box;
        ">${ph1.caption ? esc(ph1.caption) : "&nbsp;"}</div>
      </div>`;

    if (pair[1]) {
      const ph2 = pair[1];
      html += `
        <div style="border:1px solid #cbd5e1;overflow:hidden;">
          <div style="width:100%;height:340px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;">
            <img src="${ph2.supabaseUrl || ph2.data}"
              style="width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;display:block;"
              crossorigin="anonymous">
          </div>
          <div style="
            padding:8px 12px;font-size:13px;font-weight:600;
            text-align:center;color:#334155;background:#f8fafc;
            border-top:1px solid #cbd5e1;width:100%;box-sizing:border-box;
          ">${ph2.caption ? esc(ph2.caption) : "&nbsp;"}</div>
        </div>`;
    } else {
      html += `<div style="border:1px solid transparent;"></div>`;
    }

    html += `</div>`;
  }
  return html;
}

// ─── Pending materials (live, from Supabase material_requirements) ──────────
async function fetchPendingMaterials(site) {
  if (!site) return [];
  const { data, error } = await supabase
    .from("material_requirements")
    .select("material_name, quantity, unit_name, requested_by, created_at")
    .eq("site_name", site)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchPendingMaterials error:", error.message);
    return [];
  }
  // Only real rows count — blank/placeholder rows must not force the PDF section
  return (data || []).filter(
    (r) => r && String(r.material_name || "").trim() && String(r.quantity ?? "").trim() !== "",
  );
}

// Pending materials section — ONLY when there are real pending rows.
// Empty → "" so PDF generation skips this section completely (no header, no empty table).
function buildPendingMaterialsHtml(rows) {
  const list = (rows || []).filter(
    (r) => r && String(r.material_name || "").trim(),
  );
  if (!list.length) return "";

  const rowsHtml = list
    .map(
      (r) => `
      <tr>
        <td class="pm-mat-name">${esc(r.material_name)}</td>
        <td class="pm-qty">${esc(String(r.quantity))}</td>
        <td><span class="pm-unit">${esc(r.unit_name)}</span></td>
        <td class="td-left">${esc(r.requested_by || "—")}</td>
        <td class="td-left">${esc(fmtDate((r.created_at || "").slice(0, 10)))}</td>
      </tr>`,
    )
    .join("");

  return `<div class="pm-section-wrap">
    <div class="pm-header" style="background:linear-gradient(135deg,#7f1d1d,#b91c1c,#dc2626);">
      <div class="pm-header-left">
        <svg class="pm-icon" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span class="pm-title">Pending Material Requirements</span>
      </div>
      <span class="pm-badge">Action Required</span>
    </div>
    <div class="pm-subtitle">Materials requested for this site that have not yet been received. Please take action at the earliest.</div>
    <div class="pm-body">
      <table class="pm-table">
        <thead>
          <tr>
            <th>Material</th>
            <th class="center">Qty</th>
            <th>Unit</th>
            <th>Requested By</th>
            <th>Date Requested</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>`;
}

// ─── Full PDF HTML builder (preview/legacy, non-paginated) ──────────────────
function buildEveningPdfHtml(payload, pendingMaterials) {
  _secNum = 0;
  const dispDate = fmtDate(payload.date);

  let sections = "";
  sections += pdfSection(
    "TODAY'S WORK SUMMARY",
    buildSummaryHtml(payload.summary),
  );
  sections += pdfSection(
    "MANPOWER REPORT",
    buildManpowerHtml(payload.manpower),
  );
  sections += pdfSection(
    "EQUIPMENT ON SITE",
    buildEquipmentHtml(payload.equipment),
  );
  sections += pdfSection("CEMENT STOCK", buildCementHtml(payload));
  sections += pdfSection("CONCRETE CONSUMPTION", buildConcreteHtml(payload));
  sections += pdfSection(
    "MATERIAL USED / RECEIVED",
    buildMaterialHtml(payload.material),
  );
  sections += pdfSection("CUBE TEST RESULTS", buildCubeHtml(payload.cube));
  sections += pdfSection(
    "SITE VISIT & INSTRUCTIONS",
    buildVisitorsHtml(payload.visitors),
  );
  sections += pdfSection(
    "ADDITIONAL INFORMATION",
    buildCustomFieldsHtml(payload.customFields),
  );
  sections += pdfSection(
    "WORK PROGRESS PHOTOS",
    buildPhotosHtml(payload.photos),
  );
  sections += pdfSection(
    "TOMORROW'S PLANNING",
    buildPlanningHtml(payload.planning),
  );

  const pendingMaterialsHtml = buildPendingMaterialsHtml(pendingMaterials);

  const genTime = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>${PDF_CSS}</style></head><body>

<div class="cover">
  <div class="cover-top-bar">
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="{LOGO_URL}"
        style="width:48px;height:48px;object-fit:contain;flex-shrink:0;"
        crossorigin="anonymous">
      <div>
        <div class="brand-name">DIP Projects</div>
        <div class="brand-sub">Civil Project Management Consultants</div>
      </div>
    </div>
    <div>
      <div class="doc-site">${esc(payload.site)}</div>
      <div class="doc-sub">${esc(payload.employeeName)} · ${esc(dispDate)}</div>
    </div>
  </div>
  <div class="cover-doc-type">O F F I C I A L &nbsp; S I T E &nbsp; P R O G R E S S &nbsp; U P D A T E</div>
  <div class="cover-main-title">DAILY PROGRESS REPORT</div>
  <div class="cover-subtitle">An official site progress update prepared by the Project Management Consultant.</div>
  <div class="meta-bar">
    <div class="meta-cell"><span class="meta-key">P R O J E C T &nbsp; S I T E</span><span class="meta-val">${esc(payload.site)}</span></div>
    <div class="meta-cell"><span class="meta-key">R E P O R T E D &nbsp; B Y</span><span class="meta-val">${esc(payload.employeeName)}</span></div>
    <div class="meta-cell"><span class="meta-key">D A T E</span><span class="meta-val">${esc(dispDate)}</span></div>
  </div>
</div>

${sections}

${pendingMaterialsHtml}

<div style="page-break-before:always;">
  <div class="ty-page">
    <div class="ty-line"></div>
    <div class="ty-title">Thank You</div>
    <div class="ty-sub">This report has been prepared to ensure transparency, quality, and continuous improvement at the project site.</div>
    <div class="ty-badge">DIP PROJECTS</div>
    <div class="ty-meta">Generated ${esc(genTime)} · Evening DPR · ${esc(payload.site)}</div>
  </div>
</div>
</body></html>`;
}

// ─── PDF rendering via html2canvas + jsPDF ───────────────────────────────────
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function ensurePdfDeps() {
  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  );
  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  );
}

async function mountHidden(html) {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "fixed",
    top: "0",
    left: "-9999px",
    width: "794px",
    background: "#fff",
    zIndex: "-1",
  });
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const imgs = Array.from(wrap.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = res;
            img.onerror = res;
          }),
    ),
  );
  await new Promise((r) => setTimeout(r, 300));
  return wrap;
}
async function getLogoAsBase64(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 200;
      canvas.height = img.naturalHeight || 200;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(url); // fallback to original url if conversion fails
    img.src = url;
  });
}
let LOGO_BASE64 = null;
async function getLogoBase64() {
  if (LOGO_BASE64) return LOGO_BASE64;
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 200;
      canvas.height = img.naturalHeight || 200;
      canvas.getContext("2d").drawImage(img, 0, 0);
      LOGO_BASE64 = canvas.toDataURL("image/png");
      resolve(LOGO_BASE64);
    };
    img.onerror = () => resolve(null);
    img.src = LOGO_URL; // ← uses the imported local asset
  });
}

async function generateEveningPdf(payload, onProgress) {
  await ensurePdfDeps();
  const logoBase64 = await getLogoBase64();
  const { jsPDF } = window.jspdf;
  const A4_W = 210,
    A4_H = 297,
    MARGIN = 10;
  const CONTENT_W = A4_W - MARGIN * 2;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  function addWatermark(pdf, logo) {
    if (!logo) return;
    const A4_W = 210,
      A4_H = 297;
    const SIZE = 130; // mm
    const x = (A4_W - SIZE) / 2;
    const y = (A4_H - SIZE) / 2;
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity: 0.06 }));
    pdf.addImage(logo, "PNG", x, y, SIZE, SIZE);
    pdf.restoreGraphicsState();
  }

  // Build the full HTML but we'll render section by section
  _secNum = 0;

  // ── helper: render one HTML chunk, return canvas ──────────────────────────
  async function renderChunk(html) {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "relative",
      top: "0",
      left: "-9999px",
      width: "794px",
      background: "#fff",
      zIndex: "-1",
      fontFamily: "'Segoe UI',Arial,sans-serif",
      overflow: "hidden",
      colorScheme: "light",
    });
    wrap.setAttribute("data-theme", "light");
    wrap.style.position = "fixed"; // keep off-screen

    // CSS
    const style = document.createElement("style");
    style.textContent = PDF_CSS;
    wrap.appendChild(style);

    // Content
    const inner = document.createElement("div");
    inner.style.position = "relative";
    inner.style.zIndex = "1";
    inner.innerHTML = html;
    wrap.appendChild(inner);

    document.body.appendChild(wrap);

    // Wait for ALL images including watermark
    const imgs = Array.from(wrap.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((res) => {
              img.onload = res;
              img.onerror = res;
            }),
      ),
    );
    await new Promise((r) => setTimeout(r, 150));

    const canvas = await window.html2canvas(wrap, {
      scale: 1.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
    });
    document.body.removeChild(wrap);
    return canvas;
  }

  // ── helper: add one canvas to PDF, paginating if too tall ─────────────────
  let cursorY = MARGIN; // current Y position on current page
  let pageNum = 1;

  async function addCanvasToPdf(canvas, label) {
    const PX_PER_MM = canvas.width / CONTENT_W;
    const totalHeightMM = canvas.height / PX_PER_MM;
    const MAX_H = A4_H - MARGIN * 2;

    let srcY = 0;

    while (srcY < canvas.height) {
      const remainingPageMM = MAX_H - cursorY;
      const remainingPagePX = remainingPageMM * PX_PER_MM;

      // If less than 20mm left on page, start new page
      if (remainingPageMM < 20) {
        addWatermark(pdf, logoBase64);
        pdf.addPage();
        pageNum++;
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, {
          align: "center",
        });
        cursorY = MARGIN;
      }

      const sliceHeightPX = Math.min(
        canvas.height - srcY,
        (A4_H - cursorY - MARGIN) * PX_PER_MM,
      );
      const sliceHeightMM = sliceHeightPX / PX_PER_MM;

      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.ceil(sliceHeightPX);
      slice
        .getContext("2d")
        .drawImage(
          canvas,
          0,
          srcY,
          canvas.width,
          Math.ceil(sliceHeightPX),
          0,
          0,
          canvas.width,
          Math.ceil(sliceHeightPX),
        );

      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.78),
        "JPEG",
        MARGIN,
        cursorY,
        CONTENT_W,
        sliceHeightMM,
      );

      cursorY += sliceHeightMM + 4; // 4mm gap between sections
      srcY += Math.ceil(sliceHeightPX);

      // If content continues and not enough room, new page
      if (srcY < canvas.height) {
        addWatermark(pdf, logoBase64);
        pdf.addPage();
        pageNum++;
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, {
          align: "center",
        });
        cursorY = MARGIN;
      }
    }
  }

  // ── page footer for page 1 ─────────────────────────────────────────────────
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(`Page 1  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, {
    align: "center",
  });

  // ── BUILD SECTIONS ─────────────────────────────────────────────────────────
  const dispDate = fmtDate(payload.date);
  const genTime = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Then build coverHtml AFTER, using logoBase64:
  const coverHtml = `
  <div class="cover">
    <div class="cover-top-bar">
      <div style="display:flex;align-items:center;gap:14px;">
        <img src="${logoBase64 || ""}"
  style="width:48px;height:48px;object-fit:contain;flex-shrink:0;${!logoBase64 ? "display:none" : ""}"
  crossorigin="anonymous">
        <div>
          <div class="brand-name">DIP Projects</div>
          <div class="brand-sub">Civil Project Management Consultants</div>
        </div>
      </div>
      <div>
        <div class="doc-site">${esc(payload.site)}</div>
        <div class="doc-sub">${esc(payload.employeeName)} · ${esc(dispDate)}</div>
      </div>
    </div>
    <div class="cover-doc-type">O F F I C I A L &nbsp; S I T E &nbsp; P R O G R E S S &nbsp; U P D A T E</div>
    <div class="cover-main-title">DAILY PROGRESS REPORT</div>
    <div class="cover-subtitle">An official site progress update prepared by the Project Management Consultant.</div>
    <div class="meta-bar">
      <div class="meta-cell"><span class="meta-key">P R O J E C T &nbsp; S I T E</span><span class="meta-val">${esc(payload.site)}</span></div>
      <div class="meta-cell"><span class="meta-key">R E P O R T E D &nbsp; B Y</span><span class="meta-val">${esc(payload.employeeName)}</span></div>
      <div class="meta-cell"><span class="meta-key">D A T E</span><span class="meta-val">${esc(dispDate)}</span></div>
    </div>
  </div>`;

  onProgress("Fetching pending materials…");
  const pendingMaterials = await fetchPendingMaterials(payload.site);
  const pmHtml = buildPendingMaterialsHtml(pendingMaterials);

  const sectionDefs = [
    ["TODAY'S WORK SUMMARY", buildSummaryHtml(payload.summary)],
    ["MANPOWER REPORT", buildManpowerHtml(payload.manpower)],
    ["EQUIPMENT ON SITE", buildEquipmentHtml(payload.equipment)],
    ["CEMENT STOCK", buildCementHtml(payload)],
    ["CONCRETE CONSUMPTION", buildConcreteHtml(payload)],
    // Only include when there is real pending material data (never an empty placeholder page)
    ...(pmHtml ? [["MATERIAL REQUIREMENT", pmHtml]] : []),
    ["MATERIAL USED / RECEIVED", buildMaterialHtml(payload.material)],
    ["CUBE TEST RESULTS", buildCubeHtml(payload.cube)],
    ["SITE VISIT & INSTRUCTIONS", buildVisitorsHtml(payload.visitors)],
    ["ADDITIONAL INFORMATION", buildCustomFieldsHtml(payload.customFields)],
    ["CHECKLIST PHOTOS", buildPhotosHtml(payload.checklistPhotos)], // NEW
    ["WORK PROGRESS PHOTOS", buildPhotosHtml(payload.photos)],
    ["TOMORROW'S PLANNING", buildPlanningHtml(payload.planning)],
  ];

  // Render cover
  onProgress("Rendering cover…");
  const coverCanvas = await renderChunk(coverHtml);
  await addCanvasToPdf(coverCanvas, "cover");

  // Render each section
  for (const [title, body] of sectionDefs) {
    if (!body?.trim()) continue;

    const isPhotos =
      title === "WORK PROGRESS PHOTOS" || title === "CHECKLIST PHOTOS"; // widened
    const isManpower = title === "MANPOWER REPORT";
    const isPendingMaterials = title === "MATERIAL REQUIREMENT";

    if (isPendingMaterials) {
      onProgress("Rendering material requirement…");
      const pmCanvas = await renderChunk(body);
      const PX_PER_MM = pmCanvas.width / CONTENT_W;
      const pmHeightMM = pmCanvas.height / PX_PER_MM;
      if (cursorY + pmHeightMM > A4_H - MARGIN - 10) {
        addWatermark(pdf, logoBase64);
        pdf.addPage();
        pageNum++;
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, {
          align: "center",
        });
        cursorY = MARGIN;
      }
      await addCanvasToPdf(pmCanvas, "material requirement");
      continue;
    }

    _secNum++;

    if (isPhotos) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${body}</div>`, "text/html");
      const pairs = Array.from(doc.querySelectorAll(".photo-pair"));

      const sectionHeaderHtml = `
    <div class="sec-header" style="border:1.5px solid #cbd5e1;">
      <div class="sec-left">
        <span class="sec-num">${_secNum}</span>
        <span class="sec-title">${title}</span>
      </div>
    </div>`;

      for (let pi = 0; pi < pairs.length; pi++) {
        onProgress(`Rendering photo ${pi * 2 + 1}–${pi * 2 + 2}…`);

        const pairBody = `
      <div style="padding:12px;border:1.5px solid #cbd5e1;border-top:none;background:#f8fafc;">
        ${pairs[pi].outerHTML}
      </div>`;

        // First pair: include section header in same canvas so they're glued together
        const chunkHtml =
          pi === 0
            ? `<div>${sectionHeaderHtml}${pairBody}</div>`
            : `<div>${pairBody}</div>`;

        const pairCanvas = await renderChunk(chunkHtml);

        // Pre-check: if this chunk won't fit, start a new page first
        const PX_PER_MM = pairCanvas.width / (A4_W - MARGIN * 2);
        const pairHeightMM = pairCanvas.height / PX_PER_MM;
        if (cursorY + pairHeightMM > A4_H - MARGIN - 10) {
          addWatermark(pdf, logoBase64);
          pdf.addPage();
          pageNum++;
          pdf.setFontSize(8);
          pdf.setTextColor(100);
          pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, {
            align: "center",
          });
          cursorY = MARGIN;
        }

        await addCanvasToPdf(pairCanvas, `photo pair ${pi + 1}`);
      }
    } else if (isManpower) {
      // Parse out each manpower group + the trailing total bar, and render/paginate
      // them as independent chunks — exactly like photo pairs — so a group's
      // header table is never split across a page boundary.
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${body}</div>`, "text/html");
      const groups = Array.from(doc.querySelectorAll(".mp-group"));
      const totalBar = doc.querySelector(".mp-total");

      const sectionHeaderHtml = `
    <div class="sec-header" style="border:1.5px solid #cbd5e1;">
      <div class="sec-left">
        <span class="sec-num">${_secNum}</span>
        <span class="sec-title">${title}</span>
      </div>
    </div>`;

      for (let gi = 0; gi < groups.length; gi++) {
        onProgress(`Rendering manpower group ${gi + 1} of ${groups.length}…`);

        const isLastGroup = gi === groups.length - 1;
        const groupBody = `
      <div style="border:1.5px solid #cbd5e1;border-top:none;background:#fff;">
        ${groups[gi].outerHTML}
        ${isLastGroup && totalBar ? totalBar.outerHTML : ""}
      </div>`;

        // First group: glue the section header to it, same as photos
        const chunkHtml =
          gi === 0
            ? `<div>${sectionHeaderHtml}${groupBody}</div>`
            : `<div>${groupBody}</div>`;

        const groupCanvas = await renderChunk(chunkHtml);

        // Pre-check: if this whole group won't fit on the current page,
        // start a fresh page first rather than slicing mid-group.
        const PX_PER_MM = groupCanvas.width / (A4_W - MARGIN * 2);
        const groupHeightMM = groupCanvas.height / PX_PER_MM;
        if (cursorY + groupHeightMM > A4_H - MARGIN - 10) {
          addWatermark(pdf, logoBase64);
          pdf.addPage();
          pageNum++;
          pdf.setFontSize(8);
          pdf.setTextColor(100);
          pdf.text(`Page ${pageNum}  ·  DIP Projects  ·`, A4_W / 2, A4_H - 5, {
            align: "center",
          });
          cursorY = MARGIN;
        }

        await addCanvasToPdf(groupCanvas, `manpower group ${gi + 1}`);
      }
    } else {
      // ── All other sections: render as one chunk ──────────────────────────────
      const secHtml = `
      <div class="section-wrap">
        <div class="sec-header">
          <div class="sec-left">
            <span class="sec-num">${_secNum}</span>
            <span class="sec-title">${title}</span>
          </div>
        </div>
        <div class="pdf-sec-body">${body}</div>
    </div>`;
      onProgress(`Rendering: ${title}…`);
      const canvas = await renderChunk(secHtml);
      await addCanvasToPdf(canvas, title);
    }
  }

  // Thank you page — always starts on a new page
  addWatermark(pdf, logoBase64);
  pdf.addPage();
  pageNum++;
  onProgress("Building thank you page…");
  const tyHtml = `
  <div class="ty-page" style="min-height:900px;">
    <img src="${logoBase64 || ""}" class="ty-logo"
      style="${!logoBase64 ? "display:none;" : ""}"
      crossorigin="anonymous">
    <div class="ty-line"></div>
    <div class="ty-title">Thank You</div>
    <div class="ty-sub">This report has been prepared to ensure transparency, quality, and continuous improvement at the project site.</div>
    <div class="ty-badge">DIP PROJECTS</div>
    <div class="ty-meta">Generated ${esc(genTime)} · Evening DPR · ${esc(payload.site)}</div>
  </div>`;
  const tyCanvas = await renderChunk(tyHtml);
  // Center thank-you on the page
  const PX_PER_MM = tyCanvas.width / CONTENT_W;
  const tyHeightMM = Math.min(tyCanvas.height / PX_PER_MM, A4_H - MARGIN * 2);
  const tyY = (A4_H - tyHeightMM) / 2;
  pdf.addImage(
    tyCanvas.toDataURL("image/jpeg", 0.78),
    "JPEG",
    MARGIN,
    tyY,
    CONTENT_W,
    tyHeightMM,
  );

  // Save
  const safeSite = (payload.site || "site").replace(/[\s/\\:*?"<>|]/g, "_");
  const fileName = `DPR_Evening_${safeSite}_${payload.date}.pdf`;
  const pdfBlob = pdf.output("blob");
  // ── DO NOT download here — caller will download after all uploads complete ──
  return { blob: pdfBlob, fileName };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function dbFetch(table, col = "name") {
  const { data } = await supabase.from(table).select(col).order(col);
  return (data || [])
    .map((r) => r[col])
    .filter(Boolean)
    .map(titleCase);
}
async function dbInsert(table, payload) {
  const { error } = await supabase.from(table).insert(payload);
  return !error;
}
async function submitMaterialRequirements(list, site, engineer) {
  if (!list?.length) return;
  const payload = list.map((r) => ({
    material_name: r.name,
    unit_name: r.unit,
    quantity: Number(r.qty),
    site_name: site,
    requested_by: engineer,
    status: "pending",
  }));
  const { error } = await supabase
    .from("material_requirements")
    .insert(payload);
  if (error)
    throw new Error(`Material requirement submission failed: ${error.message}`);
}

// async function getManpowerTypes(scope, workCat) {
//   let q = supabase.from("dpr_manpower_types").select("name,scope,work_category").order("name");
//   if (scope) q = q.eq("scope", scope.toUpperCase());
//   const { data } = await q;
//   const all = (data||[]).map(r => r.name);
//   if (workCat && workCat !== "__other") {
//     const { data: f } = await supabase.from("dpr_manpower_types").select("name").eq("scope", scope?.toUpperCase()||"").eq("work_category", workCat).order("name");
//     const pri = (f||[]).map(r => r.name);
//     return { priority: pri, others: all.filter(n => !pri.includes(n)) };
//   }
//   return { priority:[], others: all };
// }
// REPLACE the existing getManpowerTypes with this:
// DELETE the old getManpowerTypes function entirely and replace with:

// Resolves which scope key to use in the `manpower` table
function resolveScope(rawScope) {
  const s = (rawScope || "").toUpperCase();
  if (s === "CLIENT") return "client";
  if (s === "PMC") return "pmc";
  return "contractor"; // everything else → contractor
}

// REPLACE getManpowerTypesForScope
async function getManpowerTypesForScope(rawScope) {
  const scope = resolveScope(rawScope);
  const { data } = await supabase
    .from("manpower")
    .select("manpowertype")
    .eq("scope", scope)
    .order("manpowertype");
  return [
    ...new Set(
      (data || [])
        .map((r) => r.manpowertype)
        .filter(Boolean)
        .map(titleCase),
    ),
  ];
}

// REPLACE getManpowerTypesByCategory
async function getManpowerTypesByCategory(category) {
  if (!category) return [];
  const { data } = await supabase
    .from("man_type")
    .select("manpowertype")
    .eq("category", category)
    .order("manpowertype");
  return (data || [])
    .map((r) => r.manpowertype)
    .filter(Boolean)
    .map(titleCase);
}

// REPLACE getAllCategories
async function getAllCategories() {
  const { data } = await supabase
    .from("workcategory")
    .select("category")
    .order("category");
  return (data || [])
    .map((r) => r.category)
    .filter(Boolean)
    .map(titleCase);
}

// REPLACE getEngineersForSite
async function getEngineersForSite(site) {
  if (!site) return [];
  try {
    const { data, error } = await supabase
      .from("user_site_assignments")
      .select("user_name, full_name")
      .eq("site_name", site);
    if (!error && data?.length) {
      return data
        .map((r) => titleCase(r.full_name || r.user_name || ""))
        .filter(Boolean)
        .sort();
    }
  } catch {
    /* table optional */
  }
  return [];
}
async function checkExists(table, col, val) {
  const { data } = await supabase
    .from(table)
    .select("id")
    .ilike(col, val)
    .limit(1);
  return data?.length > 0;
}
// ── Draft persistence ─────────────────────────────────────────────────────
// NOTE: saveDraft() relies on a UNIQUE constraint on (site, engineer) in the
// dpr_drafts table for the upsert's onConflict to work as a true "replace".
// If that constraint is missing, upsert silently behaves like insert and
// creates duplicate rows per site+engineer — which then makes loadDraft()
// look like the draft "disappeared" after refresh (the wrong row gets
// returned, or .maybeSingle() errors out on multiple matches). The functions
// below are defensive against that: loadDraft never throws, always returns
// the MOST RECENT matching row (by saved_at), and surfaces real errors
// instead of silently returning null.
async function saveDraft(payload) {
  const { error } = await supabase
    .from("dpr_drafts")
    .upsert(
      {
        site: payload.site,
        engineer: payload.engineer,
        payload,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "site,engineer" },
    );
  if (error) {
    console.error("saveDraft error:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function loadDraft(site, engineer) {
  if (!site || !engineer) return { ok: true, draft: null };
  // Deliberately NOT using .maybeSingle() — if duplicate rows ever exist
  // for this site+engineer (e.g. from a missing unique constraint), single()
  // / maybeSingle() throws on >1 row. order+limit(1) always returns the
  // newest draft safely instead of erroring out.
  const { data, error } = await supabase
    .from("dpr_drafts")
    .select("*")
    .eq("site", site)
    .eq("engineer", engineer)
    .order("saved_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("loadDraft error:", error.message);
    return { ok: false, error: error.message, draft: null };
  }
  return { ok: true, draft: (data && data[0]) || null };
}

async function deleteDraft(site, engineer) {
  if (!site || !engineer) return { ok: true };
  // Delete ALL matching rows, not just one — cleans up any duplicates left
  // behind by a broken upsert from before this fix.
  const { error } = await supabase
    .from("dpr_drafts")
    .delete()
    .eq("site", site)
    .eq("engineer", engineer);
  if (error) {
    console.error("deleteDraft error:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
async function uploadPdfToSupabase(blob, fileName, site, date) {
  const { prefix } = await ensureSiteBucket(site);
  const datePath = buildSiteDatePath(date);
  const path = `${prefix}/dpr/reports/${datePath}/${fileName}`;
  return uploadViaApi({
    path,
    blob,
    contentType: "application/pdf",
    bucket: SITE_FILES_BUCKET,
  });
}
async function uploadPhotoToSupabase(dataUrl, site, storagePath) {
  const { prefix } = await ensureSiteBucket(site);
  const path = `${prefix}/${storagePath}`.replace(/\/+/g, "/");
  const blob = await dataUrlToBlob(dataUrl);
  return uploadViaApi({
    path,
    blob,
    contentType: "image/jpeg",
    bucket: SITE_FILES_BUCKET,
  });
}
// ─── UI helpers ───────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="spinner" />;
}

function AddPopup({
  title,
  onSave,
  onClose,
  placeholder = "Enter name…",
  extraFields,
}) {
  const [val, setVal] = useState("");
  const [extra, setExtra] = useState({});
  return (
    <div
      className="popup-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="popup-box">
        <div className="popup-title">{title}</div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="flabel">Name</label>
          <input
            className="finput"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) =>
              e.key === "Enter" && val.trim() && onSave(val.trim(), extra)
            }
            autoFocus
          />
        </div>
        {extraFields?.map((f) => (
          <div className="fg" key={f.key} style={{ marginBottom: 10 }}>
            <label className="flabel">
              {f.label}
              {f.required && <span className="req"> *</span>}
            </label>
            {f.type === "select" ? (
              <select
                className="finput"
                value={extra[f.key] || ""}
                onChange={(e) =>
                  setExtra((p) => ({ ...p, [f.key]: e.target.value }))
                }
              >
                <option value="">-- Select --</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="finput"
                value={extra[f.key] || ""}
                onChange={(e) =>
                  setExtra((p) => ({ ...p, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder || ""}
              />
            )}
          </div>
        ))}
        <div className="popup-btns">
          <button
            className="btn btn-orange"
            style={{ flex: 1 }}
            disabled={!val.trim()}
            onClick={() => onSave(val.trim(), extra)}
          >
            Add
          </button>
          <button className="btn btn-out" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectWithAdd({ value, onChange, options, placeholder, onAdd }) {
  const [showPopup, setShowPopup] = useState(false);
  return (
    <>
      <select
        className="finput"
        value={value}
        onChange={(e) => {
          if (e.target.value === "__add") setShowPopup(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__add">➕ Add New…</option>
      </select>
      {showPopup && onAdd && (
        <AddPopup
          title={`Add New ${placeholder}`}
          placeholder={`Enter ${placeholder.toLowerCase()}…`}
          onSave={async (name) => {
            await onAdd(name);
            setShowPopup(false);
          }}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  );
}

function SectionBlock({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);

  const handleToggle = () => {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      setTimeout(() => {
        const el = ref.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 80; // 80px offset for sticky header
        window.scrollTo({ top, behavior: "smooth" });
      }, 50);
    }
  };

  return (
    <div className="sec-block" ref={ref}>
      <button className="sec-collapser" onClick={handleToggle}>
        <span>{title}</span>
        <svg
          className={`chevron${open ? " open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

function AddManpowerTypePopup({
  rawScope,
  categories,
  onSave,
  onClose,
  refreshCategories,
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCat, setNewCat] = useState("");
  const [saving, setSaving] = useState(false);
  const isContractor = resolveScope(rawScope) === "contractor";

  const showNewCatInput = category === "__newcat";
  const finalCategory = showNewCatInput ? newCat.trim() : category;
  const canSave = name.trim() && (!showNewCatInput || newCat.trim());

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);

    // If new category entered, insert into workcategory first
    if (isContractor && showNewCatInput && newCat.trim()) {
      const { error } = await supabase
        .from("workcategory")
        .insert({ category: newCat.trim() })
        .select()
        .single();
      if (!error) await refreshCategories();
    }

    // Save to manpower table
    const scope = resolveScope(rawScope);
    await supabase
      .from("manpower")
      .insert({ scope, manpowertype: name.trim() });

    // If contractor + category chosen, also save to man_type
    if (isContractor && finalCategory) {
      await supabase.from("man_type").insert({
        category: finalCategory,
        manpowertype: name.trim(),
      });
    }

    setSaving(false);
    onSave(name.trim(), finalCategory || null);
  };

  return (
    <div
      className="popup-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="popup-box">
        <div className="popup-title">Add New Manpower Type</div>

        {/* Type name */}
        <div className="fg" style={{ marginBottom: 12 }}>
          <label className="flabel">
            Type Name <span className="req">*</span>
          </label>
          <input
            className="finput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mason, Bar Bender…"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && canSave && handleSave()}
          />
        </div>

        {/* Work Category — contractor only */}
        {/* Inside AddManpowerTypePopup — replace the category select block with: */}
        {isContractor && (
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="flabel">
              Work Category <span className="opt">optional</span>
            </label>
            <select
              className="finput"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">-- None / General --</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="popup-btns" style={{ marginTop: 16 }}>
          <button
            className="btn btn-orange"
            style={{ flex: 1 }}
            disabled={!canSave || saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 13, height: 13, borderWidth: 2 }}
                />{" "}
                Saving…
              </>
            ) : (
              "Add Type"
            )}
          </button>
          <button className="btn btn-out" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ManpowerSection({ list, setList, showToast }) {
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allTypes, setAllTypes] = useState([]); // all types for current scope
  const [catTypes, setCatTypes] = useState([]); // types filtered by selected category
  const [scope, setScope] = useState("");
  const [workCat, setWorkCat] = useState("");
  const [mpType, setMpType] = useState("");
  const [gender, setGender] = useState("");
  const [skill, setSkill] = useState("");
  const [count, setCount] = useState("");
  const [skills, setSkills] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editRow, setEditRow] = useState(null);

  const isClientOrPMC = ["CLIENT", "PMC"].includes((scope || "").toUpperCase());

  // Load scopes list (for the dropdown)
  useEffect(() => {
    dbFetch("dpr_scopes").then(setScopes);
  }, []);
  useEffect(() => {
    dbFetch("dpr_skills").then(setSkills);
  }, []);

  // Load categories from workcategory table
  const refreshCategories = async () => {
    const cats = await getAllCategories();
    setCategories(cats);
  };
  useEffect(() => {
    refreshCategories();
  }, []);

  // Load manpower types when scope changes
  useEffect(() => {
    if (!scope) {
      setAllTypes([]);
      setCatTypes([]);
      setMpType("");
      return;
    }
    setLoadingTypes(true);
    getManpowerTypesForScope(scope).then((types) => {
      setAllTypes(types);
      setLoadingTypes(false);
    });
    setWorkCat("");
    setMpType("");
    setCatTypes([]);
  }, [scope]);

  // Filter types by category when workCat changes (contractor only)
  useEffect(() => {
    if (!workCat || isClientOrPMC) {
      setCatTypes([]);
      return;
    }
    getManpowerTypesByCategory(workCat).then(setCatTypes);
  }, [workCat]);

  // Displayed types: if category selected → catTypes first, then remaining allTypes
  const priorityTypes = catTypes.filter((t) => allTypes.includes(t));
  const otherTypes = allTypes.filter((t) => !priorityTypes.includes(t));

  const addRow = () => {
    if (!scope || !mpType || !count) return;
    const dbScope = resolveScope(scope);

    // Check for exact duplicate (same scope+type+category+gender+skill)
    const dupIdx = list.findIndex(
      (r) =>
        r.scope === dbScope &&
        r.labour === mpType &&
        (r.category || "—") === (workCat || "—") &&
        (r.gender || "") === gender &&
        (r.skill || "") === skill,
    );

    if (dupIdx >= 0) {
      // Already exists → just add to count
      setList((p) =>
        p.map((r, i) =>
          i === dupIdx ? { ...r, count: Number(r.count) + Number(count) } : r,
        ),
      );
    } else {
      setList((p) => [
        ...p,
        {
          id: "tmp_" + Date.now(),
          scope: dbScope,
          displayScope: scope,
          category: workCat || "—",
          labour: mpType,
          gender: gender,
          skill: skill,
          count: Number(count),
        },
      ]);
    }
    setCount(""); // only reset count — keep type/gender/skill for fast repeat entry
  };

  return (
    <div>
      <div className="grid2" style={{ marginBottom: 12 }}>
        {/* Scope */}
        <div className="fg">
          <label className="flabel">
            Scope <span className="req">*</span>
          </label>
          <SelectWithAdd
            value={scope}
            onChange={(v) => {
              setScope(v);
              setMpType("");
              setWorkCat("");
            }}
            options={scopes}
            placeholder="Select Scope"
            onAdd={async (name) => {
              await dbInsert("dpr_scopes", { name: name.toUpperCase() });
              setScopes(await dbFetch("dpr_scopes"));
              setScope(titleCase(name));
            }}
          />
        </div>

        {/* Work Category — all scopes */}
        <div className="fg">
          <label className="flabel">Work Category</label>
          <select
            className="finput"
            value={workCat}
            onChange={(e) => {
              if (e.target.value === "__addcat") {
                setShowAddCat(true);
              } else {
                setWorkCat(e.target.value);
                setMpType("");
              }
            }}
          >
            <option value="">-- All Types --</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__addcat">➕ Add New Category…</option>
          </select>
        </div>

        {/* Manpower Type */}
        <div className="fg">
          <label className="flabel">
            Manpower Type <span className="req">*</span>
          </label>
          <select
            className="finput"
            value={mpType}
            onChange={(e) => {
              if (e.target.value === "__add") setShowAddType(true);
              else setMpType(e.target.value);
            }}
          >
            <option value="">
              {loadingTypes
                ? "Loading…"
                : scope
                  ? "Select Type"
                  : "Select scope first"}
            </option>
            {priorityTypes.length > 0 && (
              <optgroup label={`── ${workCat.toUpperCase()} ──`}>
                {priorityTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            )}
            {otherTypes.length > 0 && (
              <optgroup
                label={
                  priorityTypes.length > 0
                    ? "── OTHER TYPES ──"
                    : "── ALL TYPES ──"
                }
              >
                {otherTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            )}
            {!loadingTypes && <option value="__add">➕ Add New Type…</option>}
          </select>
        </div>

        {/* Gender */}
        <div className="fg">
          <label className="flabel">Gender</label>
          <select
            className="finput"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
          >
            <option value="">-- Select --</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </div>

        {/* Skill */}
        <div className="fg">
          <label className="flabel">Skill</label>
          <SelectWithAdd
            value={skill}
            onChange={setSkill}
            options={skills}
            placeholder="Select Skill"
            onAdd={async (name) => {
              await dbInsert("dpr_skills", { name });
              setSkills(await dbFetch("dpr_skills"));
              setSkill(name);
            }}
          />
        </div>

        {/* Count */}
        <div className="fg">
          <label className="flabel">
            Count <span className="req">*</span>
          </label>
          <input
            className="finput"
            type="number"
            min="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <button
        className="btn btn-green btn-sm"
        onClick={addRow}
        disabled={!scope || !mpType || !count}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Manpower
      </button>

      {list.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Type</th>
                <th>Category</th>
                <th>Gender</th>
                <th>Skill</th>
                <th>Count</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row, i) =>
                editIdx === i ? (
                  // ── EDIT ROW ──────────────────────────────────────────
                  <tr
                    key={row.id || i}
                    style={{ background: "var(--edit-row-bg, #fffbf5)" }}
                  >
                    <td
                      style={{
                        fontSize: 12,
                        color: "var(--ink3)",
                        textTransform: "capitalize",
                      }}
                    >
                      {row.displayScope || row.scope}
                    </td>
                    <td>{row.labour}</td>
                    <td>
                      <input
                        className="finput"
                        style={{
                          padding: "5px 8px",
                          fontSize: 12,
                          minWidth: 100,
                        }}
                        value={editRow.category}
                        onChange={(e) =>
                          setEditRow((p) => ({
                            ...p,
                            category: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={editRow.gender}
                        onChange={(e) =>
                          setEditRow((p) => ({ ...p, gender: e.target.value }))
                        }
                      >
                        <option value="">—</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={editRow.skill}
                        onChange={(e) =>
                          setEditRow((p) => ({ ...p, skill: e.target.value }))
                        }
                      >
                        <option value="">—</option>
                        {skills.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="finput"
                        type="number"
                        min="1"
                        style={{ padding: "5px 8px", fontSize: 12, width: 64 }}
                        value={editRow.count}
                        onChange={(e) =>
                          setEditRow((p) => ({ ...p, count: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-orange btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setList((p) =>
                              p.map((r, j) =>
                                j === i
                                  ? {
                                      ...r,
                                      ...editRow,
                                      count: Number(editRow.count),
                                    }
                                  : r,
                              ),
                            );
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-out btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  // ── DISPLAY ROW ───────────────────────────────────────
                  <tr key={row.id || i}>
                    <td>{titleCase(row.displayScope || row.scope || "")}</td>
                    <td>{row.labour}</td>
                    <td>{row.category || "—"}</td>
                    <td>{row.gender || "—"}</td>
                    <td>{row.skill || "—"}</td>
                    <td style={{ fontWeight: 700 }}>{row.count}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-out btn-sm btn-icon"
                          title="Edit"
                          onClick={() => {
                            setEditIdx(i);
                            setEditRow({ ...row });
                          }}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn btn-red btn-sm btn-icon"
                          title="Remove"
                          onClick={() =>
                            setList((p) => p.filter((_, j) => j !== i))
                          }
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              <tr style={{ background: "#f8fafc" }}>
                <td colSpan={5} style={{ fontWeight: 700, fontSize: 12.5 }}>
                  Total
                </td>
                <td colSpan={2} style={{ fontWeight: 800, color: "#1e3a5f" }}>
                  {list.reduce((s, r) => s + Number(r.count), 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showAddType && (
        <AddManpowerTypePopup
          rawScope={scope}
          categories={categories}
          refreshCategories={refreshCategories}
          onSave={async (name, cat) => {
            setShowAddType(false);
            // Reload types for current scope
            const types = await getManpowerTypesForScope(scope);
            setAllTypes(types);
            if (cat) {
              const ct = await getManpowerTypesByCategory(cat);
              setCatTypes(ct);
              setWorkCat(cat);
            }
            setMpType(name);
          }}
          onClose={() => setShowAddType(false)}
        />
      )}
      {showAddCat && (
        <AddCategoryPopup
          onSave={async (name) => {
            const { error } = await supabase
              .from("workcategory")
              .insert({ category: name.trim() });
            if (error) {
              showToast("err", "Category may already exist.");
            } else {
              await refreshCategories();
              setWorkCat(name.trim());
              setShowAddCat(false);
              showToast("ok", `Category "${name.trim()}" added!`);
            }
          }}
          onClose={() => setShowAddCat(false)}
        />
      )}
    </div>
  );
}
function AddCategoryPopup({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onSave(name.trim());
    setSaving(false);
  };

  return (
    <div
      className="popup-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="popup-box">
        <div className="popup-title">Add New Work Category</div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink3)",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          New categories are saved for future use across all manpower entries.
        </p>
        <div className="fg" style={{ marginBottom: 16 }}>
          <label className="flabel">
            Category Name <span className="req">*</span>
          </label>
          <input
            className="finput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Electrical Work, PEB Erection…"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <div
          style={{
            background: "var(--orange-bg)",
            border: "1.5px dashed var(--orange-line)",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 12,
            color: "var(--orange)",
            marginBottom: 16,
            display: "flex",
            gap: 7,
            alignItems: "flex-start",
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
            style={{ marginTop: 1, flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          This category will also appear in the Work Category dropdown for all
          future reports.
        </div>
        <div className="popup-btns">
          <button
            className="btn btn-orange"
            style={{ flex: 1 }}
            disabled={!name.trim() || saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 13, height: 13, borderWidth: 2 }}
                />{" "}
                Saving…
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Category
              </>
            )}
          </button>
          <button className="btn btn-out" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
function EquipmentSection({ list, setList }) {
  const [master, setMaster] = useState({ client: [], contractor: [] });
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    supabase
      .from("dpr_equipment")
      .select("*")
      .order("name")
      .then(({ data }) => {
        const grp = { client: [], contractor: [] };
        (data || []).forEach((e) => {
          if (grp[e.source]) grp[e.source].push(e);
        });
        setMaster(grp);
      });
    dbFetch("dpr_equipment_units").then(setUnits);
  }, []);

  // Equipment names for selected source
  const srcOpts =
    source && master[source]
      ? [...new Set(master[source].map((e) => e.name))]
      : [];

  // When equipment name changes, auto-fill unit from master
  const handleNameChange = (val) => {
    if (val === "__add") {
      setShowAdd(true);
      return;
    }
    setName(val);
  };

  const add = () => {
    if (!source || !name || !qty || !unit) return;
    const n = (v) => (v || "").toString().trim().toLowerCase();
    const dupIdx = list.findIndex(
      (r) =>
        n(r.source) === n(source) &&
        n(r.name) === n(name) &&
        n(r.unit) === n(unit),
    );
    if (dupIdx >= 0) {
      setList((p) =>
        p.map((r, i) =>
          i === dupIdx ? { ...r, qty: Number(r.qty) + Number(qty) } : r,
        ),
      );
    } else {
      setList((p) => [...p, { source, name, qty, unit }]);
    }
    setName("");
    setQty("");
    setUnit("");
  };

  return (
    <div>
      <div className="grid3" style={{ marginBottom: 12 }}>
        <div className="fg">
          <label className="flabel">Source</label>
          <select
            className="finput"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setName("");
              setUnit("");
            }}
          >
            <option value="">Select Source</option>
            <option value="client">Client</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>
        <div className="fg">
          <label className="flabel">Equipment</label>
          <select
            className="finput"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          >
            <option value="">
              {source ? "Select Equipment" : "Select source first"}
            </option>
            {srcOpts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="__add">➕ Add New…</option>
          </select>
        </div>
        <div className="fg">
          <label className="flabel">Qty</label>
          <input
            className="finput"
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="fg">
          <label className="flabel">Unit</label>
          <SelectWithAdd
            value={unit}
            onChange={setUnit}
            options={units}
            placeholder="Select Unit"
            onAdd={async (nm) => {
              await dbInsert("dpr_equipment_units", { name: nm });
              setUnits(await dbFetch("dpr_equipment_units"));
              setUnit(nm);
            }}
          />
        </div>
      </div>

      <button
        className="btn btn-green btn-sm"
        onClick={add}
        disabled={!source || !name || !qty || !unit}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Equipment
      </button>

      {list.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Source</th>
                <th>Equipment</th>
                <th>Qty</th>
                <th>Unit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) =>
                editIdx === i ? (
                  <tr key={i} style={{ background: "#fffbf5" }}>
                    <td>
                      <select
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={editRow.source}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, source: ev.target.value }))
                        }
                      >
                        <option value="client">Client</option>
                        <option value="contractor">Contractor</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={editRow.name}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, name: ev.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="finput"
                        type="number"
                        min="0"
                        style={{ padding: "5px 8px", fontSize: 12, width: 70 }}
                        value={editRow.qty}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, qty: ev.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12, width: 80 }}
                        value={editRow.unit}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, unit: ev.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-orange btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setList((p) =>
                              p.map((r, j) => (j === i ? { ...editRow } : r)),
                            );
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-out btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td>{titleCase(e.source || "")}</td>
                    <td>{e.name}</td>
                    <td>{e.qty}</td>
                    <td>{e.unit}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-out btn-sm btn-icon"
                          title="Edit"
                          onClick={() => {
                            setEditIdx(i);
                            setEditRow({ ...e });
                          }}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn btn-red btn-sm btn-icon"
                          title="Remove"
                          onClick={() =>
                            setList((p) => p.filter((_, j) => j !== i))
                          }
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddPopup
          title="Add New Equipment"
          placeholder="Equipment name"
          extraFields={[
            { key: "unit", label: "Unit", placeholder: "e.g. HRS, TRIP, NOS" },
          ]}
          onSave={async (nm, extra) => {
            if (!source || !extra.unit) return;
            await dbInsert("dpr_equipment", {
              name: nm,
              unit: extra.unit,
              source,
            });
            const { data } = await supabase
              .from("dpr_equipment")
              .select("*")
              .order("name");
            const grp = { client: [], contractor: [] };
            (data || []).forEach((e) => {
              if (grp[e.source]) grp[e.source].push(e);
            });
            setMaster(grp);
            setName(nm);
            setUnit(extra.unit);
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function MaterialRequirementSection({ list, setList }) {
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editRow, setEditRow] = useState(null);

  useEffect(() => {
    dbFetch("dpr_materials").then(setMaterials);
    dbFetch("dpr_units").then(setUnits);
  }, []);

  const add = () => {
    if (!name || !qty || !unit) return;
    const n = (v) => (v || "").toString().trim().toLowerCase();
    const dupIdx = list.findIndex(
      (r) => n(r.name) === n(name) && n(r.unit) === n(unit),
    );
    if (dupIdx >= 0) {
      setList((p) =>
        p.map((r, i) =>
          i === dupIdx ? { ...r, qty: Number(r.qty) + Number(qty) } : r,
        ),
      );
    } else {
      setList((p) => [
        ...p,
        { id: "mreq_" + Date.now(), name, qty: Number(qty), unit },
      ]);
    }
    setName("");
    setQty("");
    setUnit("");
  };

  return (
    <div>
      <div className="grid3" style={{ marginBottom: 12 }}>
        <div className="fg">
          <label className="flabel">
            Material <span className="req">*</span>
          </label>
          <SelectWithAdd
            value={name}
            onChange={setName}
            options={materials}
            placeholder="Select Material"
            onAdd={async (nm) => {
              await dbInsert("dpr_materials", { name: nm });
              setMaterials(await dbFetch("dpr_materials"));
              setName(nm);
            }}
          />
        </div>
        <div className="fg">
          <label className="flabel">
            Quantity <span className="req">*</span>
          </label>
          <input
            className="finput"
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="fg">
          <label className="flabel">
            Unit <span className="req">*</span>
          </label>
          <SelectWithAdd
            value={unit}
            onChange={setUnit}
            options={units}
            placeholder="Select Unit"
            onAdd={async (nm) => {
              await dbInsert("dpr_units", { name: nm });
              setUnits(await dbFetch("dpr_units"));
              setUnit(nm);
            }}
          />
        </div>
      </div>

      <button
        className="btn btn-green btn-sm"
        onClick={add}
        disabled={!name || !qty || !unit}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Material
      </button>

      {list.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Material</th>
                <th>Qty</th>
                <th>Unit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m, i) =>
                editIdx === i ? (
                  <tr key={m.id || i} style={{ background: "#fffbf5" }}>
                    <td>
                      <input
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={editRow.name}
                        onChange={(e) =>
                          setEditRow((p) => ({ ...p, name: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="finput"
                        type="number"
                        min="0"
                        style={{ padding: "5px 8px", fontSize: 12, width: 80 }}
                        value={editRow.qty}
                        onChange={(e) =>
                          setEditRow((p) => ({ ...p, qty: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12, width: 80 }}
                        value={editRow.unit}
                        onChange={(e) =>
                          setEditRow((p) => ({ ...p, unit: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-orange btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setList((p) =>
                              p.map((r, j) =>
                                j === i
                                  ? {
                                      ...r,
                                      ...editRow,
                                      qty: Number(editRow.qty),
                                    }
                                  : r,
                              ),
                            );
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-out btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id || i}>
                    <td>{m.name}</td>
                    <td>{m.qty}</td>
                    <td>{m.unit}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-out btn-sm btn-icon"
                          title="Edit"
                          onClick={() => {
                            setEditIdx(i);
                            setEditRow({ ...m });
                          }}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn btn-red btn-sm btn-icon"
                          title="Remove"
                          onClick={() =>
                            setList((p) => p.filter((_, j) => j !== i))
                          }
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function MaterialSection({
  list,
  setList,
  showDesc = false,
  label = "Material",
}) {
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [desc, setDesc] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editRow, setEditRow] = useState(null);

  useEffect(() => {
    dbFetch("dpr_materials").then(setMaterials);
    dbFetch("dpr_units").then(setUnits);
  }, []);
  const add = () => {
    if (!name || !qty || !unit) return;
    const n = (v) => (v || "").toString().trim().toLowerCase();

    const dupIdx = list.findIndex(
      (r) => n(r.name) === n(name) && n(r.unit) === n(unit),
    );

    if (dupIdx >= 0) {
      setList((p) =>
        p.map((r, i) =>
          i === dupIdx ? { ...r, qty: Number(r.qty) + Number(qty) } : r,
        ),
      );
    } else {
      setList((p) => [
        ...p,
        { name, qty, unit, ...(showDesc ? { desc } : {}) },
      ]);
    }
    setName("");
    setQty("");
    setUnit("");
    setDesc("");
  };

  return (
    <div>
      <div className="grid3" style={{ marginBottom: 12 }}>
        <div className="fg">
          <label className="flabel">{label}</label>
          <SelectWithAdd
            value={name}
            onChange={setName}
            options={materials}
            placeholder={`Select ${label}`}
            onAdd={async (nm) => {
              await dbInsert("dpr_materials", { name: nm });
              setMaterials(await dbFetch("dpr_materials"));
              setName(nm);
            }}
          />
        </div>
        <div className="fg">
          <label className="flabel">Quantity</label>
          <input
            className="finput"
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="fg">
          <label className="flabel">Unit</label>
          <SelectWithAdd
            value={unit}
            onChange={setUnit}
            options={units}
            placeholder="Select Unit"
            onAdd={async (nm) => {
              await dbInsert("dpr_units", { name: nm });
              setUnits(await dbFetch("dpr_units"));
              setUnit(nm);
            }}
          />
        </div>
        {showDesc && (
          <div className="fg col3">
            <label className="flabel">
              Description <span className="opt">optional</span>
            </label>
            <textarea
              className="finput"
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Describe material requirements…"
            />
          </div>
        )}
      </div>
      <button
        className="btn btn-green btn-sm"
        onClick={add}
        disabled={!name || !qty || !unit}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add {label}
      </button>
      {list.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{label}</th>
                <th>Qty</th>
                <th>Unit</th>
                {showDesc && <th>Description</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m, i) =>
                editIdx === i ? (
                  <tr key={i} style={{ background: "#fffbf5" }}>
                    <td>
                      <input
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={editRow.name}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, name: ev.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="finput"
                        type="number"
                        min="0"
                        style={{ padding: "5px 8px", fontSize: 12, width: 80 }}
                        value={editRow.qty}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, qty: ev.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="finput"
                        style={{ padding: "5px 8px", fontSize: 12, width: 80 }}
                        value={editRow.unit}
                        onChange={(ev) =>
                          setEditRow((p) => ({ ...p, unit: ev.target.value }))
                        }
                      />
                    </td>
                    {showDesc && (
                      <td>
                        <textarea
                          className="finput"
                          rows={2}
                          style={{
                            padding: "5px 8px",
                            fontSize: 12,
                            minWidth: 140,
                          }}
                          value={editRow.desc || ""}
                          onChange={(ev) =>
                            setEditRow((p) => ({ ...p, desc: ev.target.value }))
                          }
                        />
                      </td>
                    )}
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-orange btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setList((p) =>
                              p.map((r, j) => (j === i ? { ...editRow } : r)),
                            );
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-out btn-sm"
                          style={{ padding: "5px 10px", fontSize: 11 }}
                          onClick={() => {
                            setEditIdx(null);
                            setEditRow(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td>{m.name}</td>
                    <td>{m.qty}</td>
                    <td>{m.unit}</td>
                    {showDesc && <td>{m.desc || "—"}</td>}
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-out btn-sm btn-icon"
                          title="Edit"
                          onClick={() => {
                            setEditIdx(i);
                            setEditRow({ ...m });
                          }}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn btn-red btn-sm btn-icon"
                          title="Remove"
                          onClick={() =>
                            setList((p) => p.filter((_, j) => j !== i))
                          }
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VisitorsSection({ visitors, setVisitors }) {
  const add = () =>
    setVisitors((p) => [
      ...p,
      { id: "v_" + Date.now(), name: "", instruction: "" },
    ]);
  const upd = (id, k, v) =>
    setVisitors((p) => p.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const rem = (id) => setVisitors((p) => p.filter((x) => x.id !== id));
  return (
    <div>
      {visitors.map((v, idx) => (
        <div className="visitor-card" key={v.id}>
          <div className="visitor-card-hdr">
            <div className="visitor-num">{idx + 1}</div>
            <input
              className="finput"
              style={{ flex: 1, minWidth: 0 }}
              value={v.name}
              onChange={(e) => upd(v.id, "name", e.target.value)}
              placeholder="Visitor name…"
            />
            <button className="btn btn-red btn-sm" onClick={() => rem(v.id)}>
              ✕
            </button>
          </div>
          <div className="fg">
            <label className="flabel">Instructions / Observations</label>
            <textarea
              className="finput"
              rows={2}
              value={v.instruction}
              onChange={(e) => upd(v.id, "instruction", e.target.value)}
              placeholder="Enter instructions or observations…"
            />
          </div>
        </div>
      ))}
      <button
        className="btn btn-out btn-sm"
        onClick={add}
        style={{ marginTop: 4 }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Visitor
      </button>
    </div>
  );
}

function CustomFieldsSection({ fields, setFields }) {
  const add = () =>
    setFields((p) => [...p, { id: "cf_" + Date.now(), title: "", value: "" }]);
  const upd = (id, k, v) =>
    setFields((p) => p.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  const rem = (id) => setFields((p) => p.filter((x) => x.id !== id));
  return (
    <div>
      {fields.map((f) => (
        <div className="custom-field-wrap" key={f.id}>
          <div className="grid2" style={{ marginBottom: 10 }}>
            <div className="fg">
              <label className="flabel">Field Title</label>
              <input
                className="finput"
                value={f.title}
                onChange={(e) => upd(f.id, "title", e.target.value)}
                placeholder="e.g. Remarks"
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-red btn-sm" onClick={() => rem(f.id)}>
                Remove
              </button>
            </div>
          </div>
          <div className="fg">
            <label className="flabel">Field Value</label>
            <textarea
              className="finput"
              rows={2}
              value={f.value}
              onChange={(e) => upd(f.id, "value", e.target.value)}
            />
          </div>
        </div>
      ))}
      <button className="btn btn-out btn-sm" onClick={add}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Custom Field
      </button>
    </div>
  );
}

// REPLACE the entire PhotosSection component with:
function PhotosSection({ photos, setPhotos, onLightbox, showToast, onConvertingChange }) {
  const fileRef = useRef();
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState({ done: 0, total: 0 });

  const addFiles = async (files) => {
    const validFiles = files.filter((f) => {
      const type = f.type.toLowerCase();
      const name = f.name.toLowerCase();
      return (
        type.startsWith("image/") ||
        (type === "" && /\.(heic|heif|jpg|jpeg|png|gif|webp|bmp)$/i.test(name))
      );
    });

    const rejectedCount = files.length - validFiles.length;
    if (rejectedCount > 0 && showToast) {
      showToast("err", `${rejectedCount} file${rejectedCount > 1 ? "s were" : " was"} skipped — only image files are allowed.`);
    }
    if (!validFiles.length) return;

    setConverting(true);
    onConvertingChange?.(true);          // ← tell the parent we've started
    setConvertProgress({ done: 0, total: validFiles.length });

    let done = 0;
    const results = await Promise.all(
      validFiles.map(async (f) => {
        try {
          const data = await compressImage(f);
          done++;
          setConvertProgress({ done, total: validFiles.length });
          return data;
        } catch (e) {
          console.error("Failed to process image:", f.name, e);
          done++;
          setConvertProgress({ done, total: validFiles.length });
          return null;
        }
      })
    );

    const newPhotos = results
      .filter(Boolean)
      .map((data) => ({ id: "ph_" + Date.now() + Math.random(), data, caption: "" }));
    setPhotos((p) => [...p, ...newPhotos]);

    setConverting(false);
    onConvertingChange?.(false); 
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <div className="photo-grid">
        {photos.map((ph) => (
          <div className="photo-item" key={ph.id}>
            <img
              className="photo-thumb"
              src={ph.data}
              alt=""
              style={{ cursor: "zoom-in" }}
              onClick={() => onLightbox?.(photos, photos.indexOf(ph))}
            />
            <button
              className="photo-remove"
              onClick={() => setPhotos((p) => p.filter((x) => x.id !== ph.id))}
            >
              ×
            </button>
            <textarea
              className="photo-caption"
              rows={2}
              value={ph.caption}
              onChange={(e) =>
                setPhotos((p) =>
                  p.map((x) =>
                    x.id === ph.id ? { ...x, caption: e.target.value } : x,
                  ),
                )
              }
              placeholder="Caption…"
            />
          </div>
        ))}
        <button
          className="photo-add-btn"
          onClick={() => fileRef.current?.click()}
          disabled={converting}
          style={converting ? { opacity: 0.6, cursor: "not-allowed" } : {}}
        >
          {converting ? (
            <>
              <div
                className="spinner"
                style={{
                  width: 18,
                  height: 18,
                  borderTopColor: "var(--orange3)",
                }}
              />
              <span>Converting {convertProgress.done}/{convertProgress.total}…</span>
            </>
          ) : (
            <>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Add Photos
            </>
          )}
        </button>
      </div>
      {photos.length > 0 && (
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
          {photos.length} photo{photos.length !== 1 ? "s" : ""} added
        </p>
      )}
    </div>
  );
}

const SUBMIT_STEPS = [
  { key: "photos", label: "Uploading photos..." },
  { key: "pdf", label: "Generating PDF..." },
  { key: "pdfup", label: "Uploading PDF..." },
  { key: "db", label: "Saving report record..." },
];

function SubmitOverlay({ currentStep, detail }) {
  const idx = SUBMIT_STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="pdf-overlay">
      <div
        className="spinner"
        style={{ width: 44, height: 44, borderWidth: 4 }}
      />
      <div className="pdf-overlay-title">Generating Evening DPR…</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
          maxWidth: 340,
        }}
      >
        {SUBMIT_STEPS.map((s, i) => {
          const cls =
            i < idx ? "step-done" : i === idx ? "step-active" : "step-pending";
          const icon = i < idx ? "✓" : i === idx ? "⟳" : "○";
          return (
            <div key={s.key} className={`progress-step ${cls}`}>
              <span style={{ fontSize: 13, minWidth: 16 }}>{icon}</span>
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
      {detail && (
        <div
          style={{ fontSize: 11, color: "#7a7a7a", fontFamily: "monospace" }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

// ─── MAIN FORM ────────────────────────────────────────────────────────────────
function DprForm({ user }) {
  const [reportType, setReportType] = useState("morning");
  const [date, setDate] = useState(todayStr());
  const [site, setSite] = useState("");
  const [engineer, setEngineer] = useState("");
  const [userSites, setUserSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [sites, setSites] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [loadingEng, setLoadingEng] = useState(false);
  
  // Add near the top of DprForm, alongside other refs
  const draftOpenedRef = useRef(false);
  const autoSaveTimerRef = useRef(null);
  const summaryRef = useRef(null);

  const [summary, setSummary] = useState("");
  const [manpower, setManpower] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [cementAvail, setCementAvail] = useState("");
  const [cementRcvd, setCementRcvd] = useState("");
  const [cementUsed, setCementUsed] = useState("");
  const [cementUsedDesc, setCementUsedDesc] = useState("");
  const [concreteTh, setConcreteTh] = useState("");
  const [concreteOn, setConcreteOn] = useState("");
  const [concreteDesc, setConcreteDesc] = useState("");
  const [material, setMaterial] = useState([]);
  const [materialReq, setMaterialReq] = useState([]);
  const [cube, setCube] = useState("");
  const [visitors, setVisitors] = useState([
    { id: "v_init", name: "", instruction: "" },
  ]);
  const [customFields, setCustomFields] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [checklistPhotos, setChecklistPhotos] = useState([]);
  const [planning, setPlanning] = useState("");

  const [draftInfo, setDraftInfo] = useState(null);
  const [draftCheckStatus, setDraftCheckStatus] = useState("idle"); // idle | checking | found | none | error
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState("");
  const [submitDetail, setSubmitDetail] = useState("");
  const [toast, setToast] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  // ── Lightbox ──────────────────────────────────────────────────────────────
  const [lightbox, setLightbox] = useState(null);
  const [checklistConverting, setChecklistConverting] = useState(false);
  const [photosConverting, setPhotosConverting] = useState(false);
  const anyConverting = checklistConverting || photosConverting;
  const openLightbox = (photos, idx) => {
    const filtered = photos.filter((p) => p.data || p.supabaseUrl);
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

  const cementBalance = Math.max(
    0,
    (Number(cementAvail) || 0) +
      (Number(cementRcvd) || 0) -
      (Number(cementUsed) || 0),
  );
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
  const showToast = (type, msg, dur = 5000) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), dur);
  };

  useEffect(() => {
    dbFetch("dpr_sites").then(setSites);
  }, []);

  useEffect(() => {
    if (!site) {
      setEngineers([]);
      return;
    }
    setLoadingEng(true);
    getEngineersForSite(site).then((list) => {
      setEngineers(list);
      setLoadingEng(false);
    });
  }, [site]);

  useEffect(() => {
    if (!site || !engineer) {
      setDraftInfo(null);
      setDraftCheckStatus("idle");
      return;
    }
    let cancelled = false;
    setDraftCheckStatus("checking");
    loadDraft(site, engineer).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setDraftInfo(null);
        setDraftCheckStatus("error");
        return;
      }
      setDraftInfo(res.draft);
      setDraftCheckStatus(res.draft ? "found" : "none");
    });
    return () => {
      cancelled = true;
    };
  }, [site, engineer]);

  // Pre-fill from this morning's report — independent of draft lookup above,
  // only relevant once the user is on the evening tab.
  useEffect(() => {
    if (!site || !engineer || reportType !== "evening") return;
    getLastMorningPayload(site, engineer).then((mp) => {
      if (!mp) return;
      if (mp.summary) setSummary(mp.summary);
      if (mp.manpower?.length) setManpower(mp.manpower);
      if (mp.equipment?.length) setEquipment(mp.equipment);
      showToast("ok", "Fields pre-filled from today's morning report.");
    });
  }, [site, engineer, reportType]);

  useEffect(() => {
    (async () => {
      setLoadingSites(true);
      setEngineer(user?.name || "");

      let sites = [];

      if (user?.id) {
        // Primary source: fetch site_name and site_names fresh from user_details
        const { data: udData } = await supabase
          .from("site_user_details")
          .select("site_name, site_names")
          .eq("id", user.id)
          .single();

        if (udData?.site_names?.length) {
          // Multi-site array takes priority
          sites = udData.site_names.filter(Boolean).map(titleCase);
        } else if (udData?.site_name) {
          // Single site fallback
          sites = [titleCase(udData.site_name)];
        }
      }

      // Final fallback: use whatever is in localStorage user object
      if (sites.length === 0) {
        if (user?.site_names?.length) {
          sites = user.site_names.filter(Boolean).map(titleCase);
        } else if (user?.site_name) {
          sites = [titleCase(user.site_name)];
        }
      }

      if (sites.length === 1) {
        setSite(sites[0]);
      }

      setUserSites(sites);
      setLoadingSites(false);
    })();
  }, [user]);

  const handleSummaryKeyDown = (e) => {
    const textarea = e.target;
    const { selectionStart, selectionEnd, value } = textarea;

    // Enter, then Space right after a fresh bullet marker → demote to sub-bullet
    if (e.key === " ") {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      if (currentLine === "• " && selectionStart === selectionEnd) {
        e.preventDefault();
        const newValue =
          value.slice(0, lineStart) + "    ◦ " + value.slice(selectionStart);
        setSummary(newValue);
        const newPos = lineStart + "    ◦ ".length;
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = newPos;
        });
      }
      return;
    }

    if (e.key !== "Enter") return;

    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);
    const bulletMatch = currentLine.match(/^(\s*)(•|◦)\s?/);
    e.preventDefault();

    if (bulletMatch && currentLine.slice(bulletMatch[0].length).trim() === "") {
      // empty bullet/sub-bullet → remove it and exit the list
      const newValue = value.slice(0, lineStart) + value.slice(selectionEnd);
      setSummary(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = lineStart;
      });
      return;
    }

    const isSub = /^\s*◦/.test(currentLine);
    const insertion = isSub ? "\n    ◦ " : "\n• ";
    const newValue =
      value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
    setSummary(newValue);
    const newPos = selectionStart + insertion.length;
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = newPos;
    });
  };

  const handleSummaryFocus = (e) => {
    if (!summary) {
      setSummary("• ");
      requestAnimationFrame(() => {
        e.target.selectionStart = e.target.selectionEnd = 2;
      });
    }
  };

  const collectPayload = () => ({
    site,
    engineer,
    employeeName: engineer,
    reportType,
    date,
    summary,
    manpower,
    equipment,
    cementAvailable: cementAvail,
    cementReceived: cementRcvd,
    cementUsed,
    cementBalance: String(cementBalance),
    cementUsedDesc,
    concreteTheoretical: concreteTh,
    concreteOnsite: concreteOn,
    concreteDescription: concreteDesc,
    material,
    materialRequirement: materialReq,
    cube, // ← added materialRequirement
    visitors: visitors.filter((v) => v.name),
    customFields: customFields.filter((f) => f.title || f.value),
    photos,
    checklistPhotos,
    planning,
  });

  const handleSaveDraft = async () => {
    if (!site || !engineer) {
      showToast("err", "Select site and engineer first.");
      return;
    }
    const res = await saveDraft(collectPayload());
    if (res.ok) {
      showToast("ok", "Draft saved!");
      const loaded = await loadDraft(site, engineer);
      if (loaded.ok) {
        setDraftInfo(loaded.draft);
        setDraftCheckStatus(loaded.draft ? "found" : "none");
      }
    } else {
      showToast(
        "err",
        "Failed to save draft: " + (res.error || "unknown error"),
        8000,
      );
    }
  };

  const handleOpenDraft = () => {
    if (!draftInfo) {
      showToast("err", "No draft available to open.");
      return;
    }
    const d = draftInfo.payload || {};
    setReportType(d.reportType || "morning");
    setSummary(d.summary || "");
    setManpower(d.manpower || []);
    setEquipment(d.equipment || []);
    setCementAvail(d.cementAvailable || "");
    setCementRcvd(d.cementReceived || "");
    setCementUsed(d.cementUsed || "");
    setCementUsedDesc(d.cementUsedDesc || "");
    setConcreteTh(d.concreteTheoretical || "");
    setConcreteOn(d.concreteOnsite || "");
    setConcreteDesc(d.concreteDescription || "");
    setMaterial(d.material || []);
    setMaterialReq(d.materialRequirement || []);
    setCube(d.cube || "");
    setVisitors(
      d.visitors?.length
        ? d.visitors.map((v, i) => ({ ...v, id: "dr_v_" + i }))
        : [{ id: "v_init", name: "", instruction: "" }],
    );
    setCustomFields(d.customFields || []);
    setPhotos(d.photos || []);
    setChecklistPhotos(d.checklistPhotos || []);
    setPlanning(d.planning || "");
    draftOpenedRef.current = true; // ← mark as opened
    showToast("ok", "Draft restored.");
  };

  const handleDeleteDraft = async () => {
    if (!window.confirm("Delete draft?")) return;
    const res = await deleteDraft(site, engineer);
    if (res.ok) {
      setDraftInfo(null);
      setDraftCheckStatus("none");
      showToast("ok", "Draft deleted.");
    } else {
      showToast(
        "err",
        "Failed to delete draft: " + (res.error || "unknown error"),
        8000,
      );
    }
  };

  // Morning report: just save to DB (no PDF)
  const handleMorningSave = async () => {
    if (!site || !engineer || !summary.trim()) {
      showToast("err", "Site, engineer and work summary are required.");
      return;
    }
    setSubmitting(true);
    draftOpenedRef.current = false;
    const payload = collectPayload();
    try {
      // Delete any existing report with same site+engineer+date+type (override old entry)
      await supabase
        .from("dpr_reports")
        .delete()
        .eq("site", site)
        .eq("engineer", engineer)
        .eq("report_type", "morning")
        .eq("date", date);

      const { error } = await supabase.from("dpr_reports").insert({
        site,
        engineer,
        report_type: "morning",
        date,
        payload,
        pdf_url: null,
        photo_folder: null,
        created_at: new Date().toISOString(),
      });

      if (error) throw new Error(`DB insert failed: ${error.message}`);
      setSubmitted(true);
      draftOpenedRef.current = false;
    } catch (err) {
      showToast("err", err.message, 10000);
    }
    setSubmitting(false);
  };
async function uploadBatch(items, uploadFn, concurrency = 2) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await uploadFn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
  // Evening DPR: upload photos → generate PDF → upload PDF → save DB
  const handleEveningSubmit = async () => {
    if (!site || !engineer || !summary.trim()) {
      showToast("err", "Site, engineer and work summary are required.");
      return;
    }
    if (!photos.length) {
      showToast("err", "Please add at least one photo for the Evening DPR.");
      return;
    }
    setSubmitting(true);
    const payload = collectPayload();
    try {
      const photoFolder = `${buildSiteDatePath(date)}/dpr`;

      setSubmitStep("photos");
      setSubmitDetail(`Uploading ${photos.length} photos…`);
      const uploadedPhotos = await uploadBatch(photos, async (ph, i) => {
        const cap = (ph.caption || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
        const fname = `photo_${i + 1}${cap ? "_" + cap : ""}.jpg`;
        const path = `${photoFolder}/photos/${fname}`;
        const url = await uploadPhotoToSupabase(ph.data, site, path);
        return { ...ph, supabaseUrl: url, storagePath: path };
      });
      payload.photos = uploadedPhotos;

      setSubmitDetail(`Uploading ${checklistPhotos.length} checklist photos…`);
      const uploadedChecklistPhotos = await uploadBatch(checklistPhotos, async (ph, i) => {
        const cap = (ph.caption || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
        const fname = `checklist_${i + 1}${cap ? "_" + cap : ""}.jpg`;
        const path = `${photoFolder}/checklist/${fname}`;
        const url = await uploadPhotoToSupabase(ph.data, site, path);
        return { ...ph, supabaseUrl: url, storagePath: path };
      });
      payload.checklistPhotos = uploadedChecklistPhotos;

      if (materialReq.length) {
        setSubmitDetail("Submitting material requirements…");
        await submitMaterialRequirements(materialReq, site, engineer);
      }

      setSubmitStep("pdf");
      setSubmitDetail("Building document…");
      const { blob, fileName } = await generateEveningPdf(payload, (msg) =>
        setSubmitDetail(msg),
      );

      setSubmitStep("pdfup");
      setSubmitDetail(fileName);
      const pdfPublicUrl = await uploadPdfToSupabase(blob, fileName, site, date);

      setSubmitStep("db");
      setSubmitDetail("Writing to dpr_reports…");
      const photosForDb = uploadedPhotos.map((p) => ({
        supabaseUrl: p.supabaseUrl,
        storagePath: p.storagePath,
        caption: p.caption || "",
      }));
      const checklistPhotosForDb = uploadedChecklistPhotos.map((p) => ({
        supabaseUrl: p.supabaseUrl,
        storagePath: p.storagePath,
        caption: p.caption || "",
      }));

      await supabase
        .from("dpr_reports")
        .delete()
        .eq("site", site)
        .eq("engineer", engineer)
        .eq("report_type", "evening")
        .eq("date", date);

      const { error: insertErr } = await supabase.from("dpr_reports").insert({
        site,
        engineer,
        report_type: "evening",
        date,
        payload: {
          ...payload,
          photos: photosForDb,
          checklistPhotos: checklistPhotosForDb,
        },
        pdf_url: pdfPublicUrl,
        photo_folder: photoFolder,
        created_at: new Date().toISOString(),
      });
      if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);

      setPdfUrl(pdfPublicUrl);
      setMaterialReq([]);
      setSubmitted(true);
      draftOpenedRef.current = false;
    } catch (err) {
      console.error(err);
      showToast("err", err.message, 10000);
    }
    setSubmitting(false);
    draftOpenedRef.current = false;
    setSubmitStep("");
    setSubmitDetail("");
  };

  function buildWhatsAppText(payload) {
    const LINE = "─".repeat(10);
    const RULE = "━".repeat(10);

    let msg = "";

    // ── Header ──────────────────────────────────────────────
    msg += "🌅 *MORNING REPORT*\n";
    msg += "🏗️ _DIP Projects · Site Progress Update_\n";
    msg += `${RULE}\n`;
    msg += `📍 *Site*      : ${payload.site}\n`;
    msg += `👷 *Engineer*  : ${payload.employeeName}\n`;
    msg += `📅 *Date*      : ${fmtDate(payload.date)}\n`;
    msg += `${RULE}\n`;

    // ── Work summary ────────────────────────────────────────
    if (payload.summary?.trim()) {
      msg += "\n📋 *WORK SUMMARY*\n";
      msg += `${LINE}\n`;
      payload.summary
        .split("\n")
        .filter((l) => l.trim())
        .forEach((l) => {
          const isSub = /^\s*◦/.test(l) || /^ {2,}/.test(l);
          const clean = l.replace(/^\s*[•◦]\s*/, "").trim();
          msg += isSub ? `    ◦ ${clean}\n` : `• ${clean}\n`;
        });
    }

    // ── Manpower ────────────────────────────────────────────
    if (payload.manpower?.length) {
      msg += "\n👥 *MANPOWER*\n";
      msg += `${LINE}\n`;

      let total = 0;
      const scopeGroups = {};
      payload.manpower.forEach((mp) => {
        const scope = (mp.displayScope || mp.scope || "").trim();
        const labour = (mp.labour || "").trim();
        const category = (mp.category || "").trim();
        const gender = (mp.gender || "").trim();
        const skill = (mp.skill && mp.skill !== "—" ? mp.skill : "").trim();
        const count = Number(mp.count) || 0;
        total += count;
        if (!scopeGroups[scope]) scopeGroups[scope] = {};
        const labourKey = labour || "—";
        if (!scopeGroups[scope][labourKey]) scopeGroups[scope][labourKey] = [];
        scopeGroups[scope][labourKey].push({ category, gender, skill, count });
      });

      Object.keys(scopeGroups).forEach((scope) => {
        msg += `\n🏢 _${scope.toUpperCase()}_\n`;
        Object.keys(scopeGroups[scope]).forEach((labour) => {
          scopeGroups[scope][labour].forEach((row) => {
            const details = [
              row.category && row.category !== "—" ? row.category : null,
              row.gender,
              row.skill,
            ].filter(Boolean);
            const label =
              labour && labour !== "—" ? labour : row.category || "Workers";
            const detailStr = details.length ? ` (${details.join(" · ")})` : "";
            msg += `   ▪ ${label}${detailStr}  →  *${row.count}*\n`;
          });
        });
      });

      msg += `${LINE}\n`;
      msg += `👥 *Total Manpower* : *${total}*\n`;
      msg += `${LINE}\n`;
    }

    // ── Equipment ───────────────────────────────────────────
    if (payload.equipment?.length) {
      msg += "\n🚜 *EQUIPMENT ON SITE*\n";
      msg += `${LINE}\n`;

      const clientEq = payload.equipment.filter((e) => e.source === "client");
      const contractorEq = payload.equipment.filter(
        (e) => e.source === "contractor",
      );

      if (clientEq.length) {
        msg += "\n👔 _CLIENT_\n";
        clientEq.forEach((e) => {
          msg += `   ▪ ${e.name}  →  *${e.qty} ${e.unit}*\n`;
        });
      }
      if (contractorEq.length) {
        msg += "\n🔨 _CONTRACTOR_\n";
        contractorEq.forEach((e) => {
          msg += `   ▪ ${e.name}  →  *${e.qty} ${e.unit}*\n`;
        });
      }
      msg += `${LINE}\n`;
    }

    // ── Footer ──────────────────────────────────────────────
    msg += `\n${RULE}\n`;
    msg += `🕒 _${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}_`;

    return msg;
  }
  async function getLastMorningPayload(site, engineer) {
    const { data } = await supabase
      .from("dpr_reports")
      .select("payload")
      .eq("site", site)
      .eq("engineer", engineer)
      .eq("report_type", "morning")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.payload || null;
  }
  const handleSharePdfWhatsApp = async () => {
    if (!pdfUrl) {
      showToast("err", "Generate the Evening DPR first.");
      return;
    }

    try {
      // Fetch the PDF blob
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const safeSite = (site || "site").replace(/[\s/\\:*?"<>|]/g, "_");
      const fileName = `DPR_Evening_${safeSite}_${date}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      // Use Web Share API if available (mobile browsers)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Evening DPR - ${site} - ${fmtDate(date)}`,
          text: `Please find attached the Evening DPR for ${site} dated ${fmtDate(date)}.`,
          files: [file],
        });
      } else {
        // Desktop fallback: open WhatsApp Web with a message, user attaches manually
        showToast(
          "ok",
          "PDF downloaded. Please attach it manually in WhatsApp.",
        );
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => {
          window.open("https://web.whatsapp.com", "_blank");
        }, 1000);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        showToast("err", "Could not share: " + err.message);
      }
    }
  };
  const handleWhatsApp = async () => {
    if (!site || !engineer || !summary.trim()) {
      showToast("err", "Site, engineer and work summary are required.");
      return;
    }
    setSubmitting(true);
    const payload = collectPayload();
    try {
      // Save to DB first
      // Delete any existing report with same site+engineer+date+type (override old entry)
      await supabase
        .from("dpr_reports")
        .delete()
        .eq("site", site)
        .eq("engineer", engineer)
        .eq("report_type", "morning")
        .eq("date", date);

      const { error } = await supabase.from("dpr_reports").insert({
        site,
        engineer,
        report_type: "morning",
        date,
        payload,
        pdf_url: null,
        photo_folder: null,
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error(`DB insert failed: ${error.message}`);

      // Build WhatsApp text and open

      // Build WhatsApp text and open
      const text = buildWhatsAppText(payload);
      const encoded = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encoded}`, "_blank");

      setSubmitted(true);
    } catch (err) {
      showToast("err", err.message, 10000);
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    draftOpenedRef.current = false;
    setSubmitted(false);
    setSummary("");
    setManpower([]);
    setPhotos([]);
    setChecklistPhotos([]);
    setPlanning("");
    setEquipment([]);
    setMaterial([]);
    setCementAvail("");
    setCementRcvd("");
    setCementUsed("");
    setCementUsedDesc("");
    setConcreteTh("");
    setConcreteOn("");
    setConcreteDesc("");
    setCube("");
    setVisitors([{ id: "v_init", name: "", instruction: "" }]);
    setCustomFields([]);
    setPdfUrl(null);
    setMaterialReq([]);
  };

  if (submitted)
    return (
      <div className="success-state">
        <div className="success-ico">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16a34a"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="success-title">
          {reportType === "morning"
            ? "Morning Report Saved!"
            : "Evening DPR Generated!"}
        </div>
        <div className="success-sub">
          {reportType === "morning"
            ? "Morning report saved to database successfully."
            : "Download a PDF copy of this report or share it instantly via WhatsApp."}
        </div>

        {pdfUrl && (
          <>
            <a
              className="btn btn-orange"
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </a>

            <button
              className="btn btn-whatsapp"
              onClick={handleSharePdfWhatsApp}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Share to WhatsApp
            </button>
          </>
        )}
        <button className="btn btn-out" onClick={resetForm}>
          Submit Another Report
        </button>
      </div>
    );

  return (
    <div>
      {/* Report type toggle — no emojis */}
      <div className="rtype-row">
        <button
          className={`rtype-btn morning${reportType === "morning" ? " act" : ""}`}
          onClick={() => setReportType("morning")}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          &nbsp;&nbsp;&nbsp;Morning Report
        </button>
        <button
          className={`rtype-btn evening${reportType === "evening" ? " act" : ""}`}
          onClick={() => setReportType("evening")}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          &nbsp;&nbsp;&nbsp;Evening DPR
        </button>
      </div>

      <div className="grid3" style={{ marginBottom: 18 }}>
        <div className="fg">
          <label className="flabel">
            Date <span className="req">*</span>
          </label>
          <input
            className="finput"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="fg">
          <label className="flabel">
            Site / Project <span className="req">*</span>
          </label>
          {loadingSites ? (
            <input className="finput" value="Loading…" readOnly />
          ) : userSites.length > 1 ? (
            <select
              className="finput"
              value={site}
              onChange={(e) => setSite(e.target.value)}
            >
              <option value="">Select Site</option>
              {userSites.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="finput"
              value={site}
              readOnly
              style={{
                background: "#f0fdf4",
                color: "#166534",
                fontWeight: 700,
              }}
            />
          )}
        </div>

        <div className="fg">
          <label className="flabel">Engineer</label>
          <input
            className="finput"
            value={engineer}
            readOnly
            style={{ background: "#f0fdf4", color: "#166534", fontWeight: 700 }}
          />
        </div>
      </div>

      {draftCheckStatus === "checking" && (
        <div className="draft-bar">
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--ink3)",
              background: "var(--bg)",
              border: "1.5px solid var(--border)",
              borderRadius: 7,
            }}
          >
            <div
              className="spinner"
              style={{ width: 14, height: 14, borderWidth: 2 }}
            />
            Checking for a saved draft…
          </div>
        </div>
      )}

      {draftCheckStatus === "error" && (
        <div
          className="info-banner"
          style={{
            background: "#fef2f2",
            border: "1.5px solid #fecaca",
            color: "var(--red)",
          }}
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Couldn't check for a saved draft (connection issue). Your work below
          is safe — try Save Draft again, or refresh once your connection is
          back.
        </div>
      )}

      {draftCheckStatus === "found" && draftInfo && (
        <div className="draft-bar">
          <button className="draft-btn draft-open" onClick={handleOpenDraft}>
            📂 Open Draft{" "}
            <span style={{ fontWeight: 400, fontSize: 11 }}>
              (
              {new Date(draftInfo.saved_at).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              )
            </span>
          </button>
          <button className="draft-btn draft-del" onClick={handleDeleteDraft}>
            🗑️ Delete Draft
          </button>
        </div>
      )}

      <SectionBlock title="1. Today's Work Summary" defaultOpen>
        <textarea
          ref={summaryRef}
          className="finput"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={handleSummaryKeyDown}
          onFocus={handleSummaryFocus}
          placeholder="Describe completed work activities…"
        />
      </SectionBlock>

      <SectionBlock title="2. Manpower Report">
        <ManpowerSection
          list={manpower}
          setList={setManpower}
          showToast={showToast}
        />
      </SectionBlock>

      <SectionBlock title="3. Equipment (Client / Contractor)">
        <EquipmentSection list={equipment} setList={setEquipment} />
      </SectionBlock>

      {reportType === "evening" && (
        <>
          <SectionBlock title="4. Cement Stock">
            <div className="cement-row" style={{ marginBottom: 12 }}>
              <div className="fg">
                <label className="flabel">Available on Site</label>
                <input
                  className="finput"
                  type="number"
                  value={cementAvail}
                  onChange={(e) => setCementAvail(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="fg">
                <label className="flabel">New Received</label>
                <input
                  className="finput"
                  type="number"
                  value={cementRcvd}
                  onChange={(e) => setCementRcvd(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="fg">
                <label className="flabel">Used Today</label>
                <input
                  className="finput"
                  type="number"
                  value={cementUsed}
                  onChange={(e) => setCementUsed(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="fg">
                <label className="flabel">Balance (auto)</label>
                <input
                  className="finput"
                  value={cementBalance}
                  readOnly
                  style={{
                    background: "#f0fdf4",
                    color: "#166534",
                    fontWeight: 700,
                  }}
                />
              </div>
            </div>
            <div className="fg">
              <label className="flabel">Usage Description</label>
              <textarea
                className="finput"
                rows={2}
                value={cementUsedDesc}
                onChange={(e) => setCementUsedDesc(e.target.value)}
                placeholder="Describe where cement was used…"
              />
            </div>
          </SectionBlock>

          <SectionBlock title="5. Concrete Consumption">
            <div className="cement-row" style={{ marginBottom: 12 }}>
              <div className="fg">
                <label className="flabel">Theoretical Qty</label>
                <input
                  className="finput"
                  type="number"
                  value={concreteTh}
                  onChange={(e) => setConcreteTh(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="fg">
                <label className="flabel">On-Site Consumption</label>
                <input
                  className="finput"
                  type="number"
                  value={concreteOn}
                  onChange={(e) => setConcreteOn(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="fg">
              <label className="flabel">Description</label>
              <textarea
                className="finput"
                rows={2}
                value={concreteDesc}
                onChange={(e) => setConcreteDesc(e.target.value)}
                placeholder="Describe on-site concrete consumption…"
              />
            </div>
          </SectionBlock>

          <SectionBlock title="6. Material Requirement">
            <MaterialRequirementSection
              list={materialReq}
              setList={setMaterialReq}
            />
          </SectionBlock>

          <SectionBlock title="7. Material Received">
            <MaterialSection list={material} setList={setMaterial} />
          </SectionBlock>

          <SectionBlock title="8. Cube Test Results">
            <textarea
              className="finput"
              rows={3}
              value={cube}
              onChange={(e) => setCube(e.target.value)}
              placeholder="Enter cube test results…"
            />
          </SectionBlock>

          <SectionBlock title="9. Site Visit &amp; Instructions">
            <VisitorsSection visitors={visitors} setVisitors={setVisitors} />
          </SectionBlock>

          <SectionBlock title="10. Additional Custom Fields">
            <CustomFieldsSection
              fields={customFields}
              setFields={setCustomFields}
            />
          </SectionBlock>

          <SectionBlock title="11. Checklist Photos">
            <div className="info-banner info-blue" style={{ marginBottom: 12 }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Upload photos for checklist.
            </div>
            <PhotosSection
              photos={checklistPhotos}
              setPhotos={setChecklistPhotos}
              onLightbox={openLightbox}
              showToast={showToast}
              onConvertingChange={setChecklistConverting}
            />
          </SectionBlock>

          <SectionBlock title="12. Work Progress Photos">
            <div className="info-banner info-blue" style={{ marginBottom: 12 }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Photos are required for Evening DPR.
            </div>
            <PhotosSection
              photos={photos}
              setPhotos={setPhotos}
              onLightbox={openLightbox}
              showToast={showToast}
              onConvertingChange={setPhotosConverting}
            />
          </SectionBlock>

          <SectionBlock title="13. Tomorrow's Planning">
            <textarea
              className="finput"
              rows={4}
              value={planning}
              onChange={(e) => setPlanning(e.target.value)}
              placeholder="Plan for tomorrow's activities…"
            />
          </SectionBlock>
        </>
      )}

      <div className="act-row">
        {reportType === "morning" ? (
          <button
            className="btn btn-whatsapp"
            onClick={handleWhatsApp}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send via WhatsApp
              </>
            )}
          </button>
        ) : ( 
          <button
            className="btn btn-orange"
            onClick={handleEveningSubmit}
            disabled={submitting || anyConverting}
          >
            {submitting ? (
              <>
                <Spinner /> Generating…
              </>
            ) : anyConverting ? (
              <>Waiting for photos to finish converting…</>
            ) : (
              <>Generate Evening DPR</>
            )}
          </button>
        )}
        <button
          className="btn btn-out"
          onClick={handleSaveDraft}
          disabled={submitting}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          Save Draft
        </button>
      </div>

      {submitting && reportType === "evening" && (
        <SubmitOverlay currentStep={submitStep} detail={submitDetail} />
      )}
      {/* ── Lightbox ── */}
      {lightbox &&
        (() => {
          const img = lightbox.images[lightbox.idx];
          const src = img.data || img.supabaseUrl;
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
                  src={src}
                  alt=""
                  style={{
                    maxWidth: "90vw",
                    maxHeight: "78vh",
                    objectFit: "contain",
                    borderRadius: 10,
                    border: "1.5px solid rgba(200,100,26,0.4)",
                    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                  }}
                />
                {img.caption && (
                  <div
                    style={{
                      background: "rgba(107,45,15,0.2)",
                      border: "1px solid #c8641a",
                      borderRadius: 8,
                      padding: "6px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#fbbf24",
                      maxWidth: "80vw",
                      textAlign: "center",
                    }}
                  >
                    {img.caption}
                  </div>
                )}
              </div>
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
                ›
              </button>
            </div>
          );
        })()}

      {toast && (
        <div
          className={`dpr-toast ${toast.type === "ok" ? "dpr-toast-ok" : "dpr-toast-err"}`}
        >
          {toast.type === "ok" ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function DPR({ user }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="dpr-root">
        <div className="dpr-inner">
          <DprForm user={user} />
        </div>
      </div>
    </>
  );
}
