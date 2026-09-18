import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import { supabaseUrl, supabaseAnonKey } from '../../lib/supabase';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
  
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};
const fmtMonth = (monthKey) => {
  const [y, m] = monthKey.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

function colKey(scope, category, labour, gender, skill) {
  return [
    (scope    || "").toUpperCase(),
    (category || "").trim().toLowerCase(),
    (labour   || "").trim().toLowerCase(),
    (gender   || "").trim().toLowerCase(),
    (skill    || "").trim().toLowerCase(),
  ].join("|");
}

function colLabel(scope, category, labour, gender, skill) {
  return {
    scope:    (scope    || "").toUpperCase(),
    category: (category || "—"),
    labour:   (labour   || "—"),
    skill:    (skill    || "—"),
    gender:   (gender   || "—"),
  };
}

const LABOUR_ALIASES = {
  "carpenter work": "Carpenter",
  carpenter: "Carpenter",
  "steel fitter": "Steel Fitter",
  steelfitter: "Steel Fitter",
  helper: "Helper",
  mason: "Mason",
  "casting & department work": "Casting Work",
  "casting and department work": "Casting Work",
};

const SKILL_WORDS = /^(skilled|unskilled)$/i;
const LABOUR_WORDS =
  /^(helper|carpenter|carpenter\s*work|mason|steel\s*fitter|fitter|painter|electrician|plumber|welder|bar\s*bender|casting(\s*&\s*|\s+and\s+)?department\s*work)$/i;

/** Clean messy DPR manpower rows so columns align (skill≠labour, aliases). */
function normalizeMp(mp) {
  let scope = String(mp.displayScope || mp.scope || "").trim();
  let category = String(mp.category || "").trim();
  let labour = String(mp.labour || "").trim();
  let skill = String(mp.skill || "").trim();
  let gender = String(mp.gender || "").trim();

  // skill field sometimes filled with labour type (e.g. Carpenter | Helper | MALE)
  if (skill && LABOUR_WORDS.test(skill) && !SKILL_WORDS.test(skill)) {
    if (!labour || LABOUR_WORDS.test(labour) === false) labour = skill;
    else if (/^carpenter$/i.test(labour) && /^helper$/i.test(skill)) {
      labour = "Helper";
    }
    skill = "";
  }

  // labour aliases
  const labKey = labour.toLowerCase().replace(/\s+/g, " ").trim();
  if (LABOUR_ALIASES[labKey]) labour = LABOUR_ALIASES[labKey];

  // gender stuck in skill or vice-versa
  if (/^(male|female)$/i.test(skill) && !gender) {
    gender = skill;
    skill = "";
  }
  if (SKILL_WORDS.test(gender) && !skill) {
    skill = gender;
    gender = "";
  }

  // "Mason" duplicated as skill
  if (skill && labour && skill.toLowerCase() === labour.toLowerCase()) {
    skill = "Skilled";
  }

  if (SKILL_WORDS.test(skill)) {
    skill = skill.charAt(0).toUpperCase() + skill.slice(1).toLowerCase();
  } else if (!skill) {
    skill = "—";
  }

  const g = gender.toUpperCase();
  if (g === "MALE" || g === "M") gender = "Male";
  else if (g === "FEMALE" || g === "F") gender = "Female";
  else if (!gender) gender = "—";
  else gender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();

  if (!category) category = "—";
  if (!labour) labour = "—";

  return {
    scope,
    category,
    labour,
    skill,
    gender,
    count: Number(mp.count) || 0,
  };
}

function leafLabel(skill, gender) {
  const s = skill && skill !== "—" ? skill : "";
  const g = gender && gender !== "—" ? gender : "";
  if (s && g) return `${s} · ${g}`;
  return g || s || "—";
}

const SCOPE_COLORS = {
  CLIENT:     { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  PMC:        { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" },
  CONTRACTOR: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
};

function scopeStyle(scope) {
  return SCOPE_COLORS[(scope || "").toUpperCase()] || { bg: "#f8fafc", text: "#64748b", border: "#e2e8f0" };
}

// Pre-compute spans for a header row level
function getSpans(cols, keyFn) {
  const spans = [];
  let i = 0;
  while (i < cols.length) {
    let span = 1;
    while (i + span < cols.length && keyFn(cols[i + span]) === keyFn(cols[i])) span++;
    spans.push({ col: cols[i], span, idx: i });
    i += span;
  }
  return spans;
}

const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;background:#f0ede8;}
  .mp-root{padding:20px 12px 48px;min-height:100vh;}
  .mp-inner{max-width:1600px;margin:0 auto;}
  .mp-card{background:#fff;border-radius:10px;border:1.5px solid rgba(0,0,0,.1);padding:20px;margin-bottom:16px;}
  .mp-title{font-size:17px;font-weight:800;color:#1a1a1a;margin-bottom:4px;}
  .mp-sub{font-size:12.5px;color:#7a7a7a;margin-bottom:18px;}
  .filter-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:18px;  padding:20px; border-radius:5px;}
  .filter-fg{display:flex;flex-direction:column;gap:4px;}
  .filter-label{font-size:11px;font-weight:700;color:#3d3d3d;letter-spacing:.3px;text-transform:uppercase;}
  .finput{font-family:'DM Sans',sans-serif;font-size:13px;color:#1a1a1a;background:#f0ede8;border:1.5px solid rgba(0,0,0,.12);border-radius:7px;padding:8px 10px;outline:none;cursor:pointer;}
  .finput:focus{border-color:#c8641a;box-shadow:0 0 0 3px rgba(107,45,15,.1);background:#fff;}
  .btn{display:inline-flex;align-items:center;gap:6px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:8px;border:none;cursor:pointer;transition:all .15s;}
  .btn-primary{background:linear-gradient(135deg,#6b2d0f,#c8641a);color:#fff;box-shadow:0 3px 10px rgba(107,45,15,.25);}
  .btn-primary:hover{filter:brightness(1.08);transform:translateY(-1px);}
  .btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none;}
  .btn-out{background:#fff;color:#3d3d3d;border:1.5px solid rgba(0,0,0,.15);}
  .btn-out:hover{background:#f0ede8;}
  .spinner{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
  .tbl-outer{overflow-x:auto;border-radius:8px;border:1.5px solid rgba(0,0,0,.1);scrollbar-width:thin;scrollbar-color:#fbbf7a #fef3c7;max-height:min(70vh,820px);overflow-y:auto;}
  .tbl-outer::-webkit-scrollbar{height:10px;width:10px;}
  .tbl-outer::-webkit-scrollbar-track{background:#fef3c7;border-radius:8px;}
  .tbl-outer::-webkit-scrollbar-thumb{background:#fbbf7a;border-radius:8px;}
  .tbl-outer::-webkit-scrollbar-thumb:hover{background:#f59e0b;}
  .mp-tbl{border-collapse:separate;border-spacing:0;min-width:700px;font-size:12.5px;width:max-content;}
  .mp-tbl th,.mp-tbl td{border:1px solid rgba(0,0,0,.1);padding:8px 10px;vertical-align:middle;}
  .mp-tbl thead th{position:sticky;z-index:3;background:#fef3c7;color:#78350f;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;text-align:center;white-space:nowrap;}
  .mp-tbl thead tr:nth-child(1) th{top:0;}
  .mp-tbl thead tr:nth-child(2) th{top:34px;}
  .mp-tbl thead tr:nth-child(3) th{top:68px;}
  .mp-tbl thead tr:nth-child(4) th{top:102px;}
  .mp-tbl .th-sticky-date,.mp-tbl .td-date{position:sticky;left:0;z-index:4;min-width:96px;max-width:110px;}
  .mp-tbl .th-sticky-sum,.mp-tbl .td-summary{position:sticky;left:96px;z-index:4;min-width:220px;max-width:280px;}
  .mp-tbl .th-sticky-total,.mp-tbl .td-daily-total{position:sticky;right:0;z-index:4;}
  .mp-tbl thead .th-sticky-date,.mp-tbl thead .th-sticky-sum,.mp-tbl thead .th-sticky-total{z-index:5;}
  .mp-tbl tbody tr:hover td{background:#faf9f7;}
  .mp-tbl .td-date{font-weight:700;font-size:12px;white-space:nowrap;background:#fffbeb;color:#78350f;text-align:left;}
  .mp-tbl .td-summary{font-size:11px;color:#92400e;line-height:1.45;background:#fffbeb;white-space:normal;text-align:left;}
  .mp-tbl .td-summary ul{margin:0;padding-left:16px;}
  .mp-tbl .td-summary li{margin:0 0 2px;}
  .mp-tbl .td-count{text-align:center;font-weight:700;color:#1e3a5f;font-size:13px;background:#fff;min-width:52px;}
  .mp-tbl .td-zero{text-align:center;color:#cbd5e1;font-size:12px;background:#fff;min-width:52px;}
  .mp-tbl .td-daily-total{text-align:center;font-weight:800;background:#dbeafe;color:#1e3a5f;min-width:64px;}
  .mp-tbl .tr-month-total td{background:#dbeafe;color:#1e3a5f;font-weight:800;text-align:center;font-size:12.5px;border-top:2px solid #93c5fd;}
  .mp-tbl .tr-month-total .td-month-label{text-align:left;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#1d4ed8;white-space:nowrap;}
  .mp-tbl .tr-month-total .td-month-count{color:#1e3a5f;font-weight:800;}
  .mp-tbl .tr-month-total .td-month-zero{color:#93c5fd;}
  .mp-tbl .tr-month-total .td-month-row-total{background:#bfdbfe;color:#1e3a5f;font-weight:900;font-size:14px;}
  .mp-tbl .tr-month-header td{background:#fde68a;color:#78350f;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:6px 10px;border-top:2.5px solid #f59e0b;}
  .mp-tbl .tr-grand-total td{background:#fee2e2;color:#7f1d1d;font-weight:900;text-align:center;font-size:13px;border-top:3px solid #f87171;}
  .mp-tbl .tr-grand-total .td-grand-label{text-align:left;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#991b1b;}
  .mp-tbl .tr-grand-total .td-grand-total-val{background:#fca5a5;color:#7f1d1d;font-size:15px;}
  .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 24px;gap:10px;text-align:center;width:100%;min-height:calc(100dvh - 240px);box-sizing:border-box;}
  .empty-ico{font-size:36px;opacity:.4;}
  .empty-title{font-size:15px;font-weight:700;color:#3d3d3d;}
  .empty-sub{font-size:12.5px;color:#7a7a7a;max-width:320px;line-height:1.6;}
  .stats-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
  .stat-card{flex:1;min-width:100px;border:1.5px solid rgba(0,0,0,.08);border-radius:8px;padding:10px 14px;}
  .stat-val{font-size:22px;font-weight:800;color:#0f172a;}
  .stat-lbl{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
  //-------DARK THEME CSS------------
  [data-theme="dark"] .mp-root {
    background:#141210;
  }
  [data-theme="dark"] .mp-card {
    background:#1e1c19;
    border-color:#3a3733;
  }
  [data-theme="dark"] .mp-title {
    color:#f0ede8;
  }
  [data-theme="dark"] .mp-sub {
    color:#7a7368;
  }
  [data-theme="dark"] .filter-label {
    color:#c4bdb4;
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
  [data-theme="dark"] select.finput option {
    background:#252320;
    color:#f0ede8;
  }
  [data-theme="dark"] .btn-out {
    background:#252320;
    color:#c4bdb4;
    border-color:#3a3733;
  }
  [data-theme="dark"] .btn-out:hover {
    background:#2e2b27;
  }
  [data-theme="dark"] .tbl-outer {
    border-color:#3a3733;
  }
  [data-theme="dark"] .mp-tbl thead th {
    background:#2a1f08;
    color:#fbbf24;
  }
  [data-theme="dark"] .mp-tbl th,
  [data-theme="dark"] .mp-tbl td {
    border-color:#3a3733;
  }
  [data-theme="dark"] .mp-tbl tbody tr:hover td {
    background:#252320;
  }
  [data-theme="dark"] .mp-tbl .td-date,
  [data-theme="dark"] .mp-tbl .td-summary {
    background:#2a1f08;
  }
  [data-theme="dark"] .mp-tbl .td-daily-total {
    background:#0c1d38;
    color:#93c5fd;
  }
  [data-theme="dark"] .mp-tbl .td-count,
  [data-theme="dark"] .mp-tbl .td-zero {
    background:#1e1c19;
  }
  [data-theme="dark"] .mp-tbl .tr-month-total td {
    background:#0c1d38;
    color:#93c5fd;
    border-color:#1e3a5f;
  }
  [data-theme="dark"] .mp-tbl .tr-month-total .td-month-label {
    color:#60a5fa;
  }
  [data-theme="dark"] .mp-tbl .tr-month-total .td-month-count {
    color:#93c5fd;
  }
  [data-theme="dark"] .mp-tbl .tr-month-total .td-month-zero {
    color:#1e3a5f;
  }
  [data-theme="dark"] .mp-tbl .tr-month-total .td-month-row-total {
    background:#1e3a5f;
    color:#bfdbfe;
  }
  [data-theme="dark"] .mp-tbl .tr-month-header td {
    background:#2a1f08;
    color:#fbbf24;
    border-color:#4a3210;
  }
  [data-theme="dark"] .mp-tbl .tr-grand-total td {
    background:#2d0a0a;
    color:#fca5a5;
    border-color:#7f1d1d;
  }
  [data-theme="dark"] .mp-tbl .tr-grand-total .td-grand-label {
    color:#f87171;
  }
  [data-theme="dark"] .mp-tbl .tr-grand-total .td-grand-total-val {
    background:#7f1d1d;
    color:#fff;
  }
  [data-theme="dark"] .stat-card {
    background:#252320;
    border-color:#3a3733;
  }
  [data-theme="dark"] .stat-val {
    color:#f0ede8;
  }
  [data-theme="dark"] .stat-lbl {
    color:#7a7368;
  }
  [data-theme="dark"] .empty-state .empty-ico {
    color:#7a7368;
  }
  [data-theme="dark"] .empty-title {
    color:#c4bdb4;
  }
  [data-theme="dark"] .empty-sub {
    color:#7a7368;
  }
  [data-theme="dark"] .tbl-outer::-webkit-scrollbar-track{background:#2a1f08;}
  [data-theme="dark"] .tbl-outer::-webkit-scrollbar-thumb{background:#c8641a;}
  [data-theme="dark"] .tbl-outer{scrollbar-color:#c8641a #2a1f08;}
`;

export default function ManpowerReport({ user }) {
  const [sites, setSites]             = useState([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [fromDate, setFromDate]       = useState("");
  const [toDate, setToDate]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [reportData, setReportData]   = useState(null);
  const [error, setError]             = useState("");
  const printRef = useRef();

  useEffect(() => {
  // Build site list from user's assigned sites; if empty (admin/head), load from recent DPRs
  const userSites = Array.isArray(user?.site_names) && user.site_names.length
    ? user.site_names
    : user?.site_name ? [user.site_name] : [];

  setSites(userSites);
  if (userSites.length === 1) setSelectedSite(userSites[0]);

  if (!userSites.length) {
    sbFetch("dpr_reports?select=site&order=date.desc&limit=200")
      .then((rows) => {
        const uniq = [...new Set((rows || []).map((r) => r.site).filter(Boolean))].sort();
        if (uniq.length) {
          setSites(uniq);
          if (uniq.length === 1) setSelectedSite(uniq[0]);
        }
      })
      .catch(() => {});
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  setFromDate(`${y}-${m}-01`);
  setToDate(`${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`);
}, [user]);

  const generateReport = async () => {
    if (!selectedSite) { setError("Please select a site."); return; }
    setError("");
    setLoading(true);
    setReportData(null);
    try {
      // Prefer `site` column; also match payload.site (older rows)
      const sitePat = encodeURIComponent(`*${selectedSite}*`);
      let query =
        `dpr_reports?select=id,date,report_type,payload,engineer,site` +
        `&or=(site.ilike.${sitePat},payload->>site.ilike.${sitePat})` +
        `&order=date.asc`;
      if (fromDate) query += `&date=gte.${fromDate}`;
      if (toDate)   query += `&date=lte.${toDate}`;

      let rows = await sbFetch(query);
      // Fallback: exact site column match if or-filter returns nothing
      if (!rows?.length) {
        let q2 =
          `dpr_reports?select=id,date,report_type,payload,engineer,site` +
          `&site=eq.${encodeURIComponent(selectedSite)}&order=date.asc`;
        if (fromDate) q2 += `&date=gte.${fromDate}`;
        if (toDate)   q2 += `&date=lte.${toDate}`;
        rows = await sbFetch(q2);
      }

      const colMap  = new Map();
      const dateMap = new Map();

      // Morning first, evening last — evening manpower replaces morning for that day
      const sortedRows = [...(rows || [])].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const order = { morning: 0, evening: 1 };
        return (order[a.report_type] ?? 0) - (order[b.report_type] ?? 0);
      });

      for (const row of sortedRows) {
        const p      = row.payload || {};
        const date   = row.date;
        const mpList = Array.isArray(p.manpower) ? p.manpower : [];
        const rowSite = String(row.site || p.site || "").trim();
        // Extra client-side site filter (handles punctuation / case)
        if (
          selectedSite &&
          rowSite &&
          !rowSite.toLowerCase().includes(selectedSite.toLowerCase()) &&
          !selectedSite.toLowerCase().includes(rowSite.toLowerCase())
        ) {
          continue;
        }

        if (!dateMap.has(date)) {
          dateMap.set(date, {
            date,
            summary: p.summary || "",
            reportType: row.report_type,
            counts: new Map(),
            source: row.report_type || "morning",
          });
        }

        const dateEntry = dateMap.get(date);
        const isEvening = row.report_type === "evening";
        const hadMorningOnly = dateEntry.source !== "evening";

        // Evening DPR replaces that day's manpower snapshot (not double-count morning+evening)
        if (isEvening && hadMorningOnly && mpList.length) {
          dateEntry.counts = new Map();
          dateEntry.source = "evening";
          dateEntry.summary = p.summary || dateEntry.summary;
          dateEntry.reportType = "evening";
        } else if (isEvening || !dateEntry.summary) {
          dateEntry.summary = p.summary || dateEntry.summary;
          dateEntry.reportType = row.report_type || dateEntry.reportType;
        }

        for (const mp of mpList) {
          const n = normalizeMp(mp);
          const key = colKey(n.scope, n.category, n.labour, n.gender, n.skill);
          if (!colMap.has(key)) {
            colMap.set(key, {
              key,
              scope:    (n.scope || "").toUpperCase(),
              category: n.category  || "",
              labour:   n.labour    || "",
              gender:   n.gender    || "",
              skill:    n.skill     || "",
              label:    colLabel(n.scope, n.category, n.labour, n.gender, n.skill),
              leaf:     leafLabel(n.skill, n.gender),
            });
          }
          // Same report type / same day: sum duplicate labour lines
          dateEntry.counts.set(key, (dateEntry.counts.get(key) || 0) + n.count);
        }
      }

      // ── Sort columns: scope → category → labour → skill → gender ──
      const scopeOrder = { CLIENT: 0, PMC: 1, CONTRACTOR: 2 };
      const cols = [...colMap.values()].sort((a, b) => {
        const so = (scopeOrder[a.scope] ?? 3) - (scopeOrder[b.scope] ?? 3);
        if (so !== 0) return so;
        const cat = a.label.category.localeCompare(b.label.category);
        if (cat !== 0) return cat;
        const lab = a.label.labour.localeCompare(b.label.labour);
        if (lab !== 0) return lab;
        const sk = a.label.skill.localeCompare(b.label.skill);
        if (sk !== 0) return sk;
        return a.label.gender.localeCompare(b.label.gender);
      });

      const dates = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));

      const monthMap = new Map();
      for (const de of dates) {
        const mk = de.date.slice(0, 7);
        if (!monthMap.has(mk)) monthMap.set(mk, []);
        monthMap.get(mk).push(de);
      }

      const colTotals = {};
      for (const col of cols) colTotals[col.key] = 0;
      for (const de of dates) {
        for (const col of cols) {
          colTotals[col.key] = (colTotals[col.key] || 0) + (de.counts.get(col.key) || 0);
        }
      }

      const monthTotals = {};
      for (const [mk, mDates] of monthMap) {
        monthTotals[mk] = {};
        for (const col of cols) {
          monthTotals[mk][col.key] = mDates.reduce((s, de) => s + (de.counts.get(col.key) || 0), 0);
        }
      }

      setReportData({ cols, dates, dateMap, monthMap, colTotals, monthTotals, site: selectedSite, from: fromDate, to: toDate });
    } catch (e) {
      setError("Error loading data: " + e.message);
    }
    setLoading(false);
  };

  const downloadExcel = () => {
    if (!reportData) return;
    const rd = reportData;
    const grand = rd.cols.reduce((s, c) => s + (rd.colTotals[c.key] || 0), 0);

    const addr  = (r, c) => XLSX.utils.encode_cell({ r, c });
    const nCols = rd.cols.length;
    const totalCol = nCols + 2;

    const CLR = {
      title:            { bg: "FF1E3A5F", fg: "FFFFFFFF" },
      meta:             { bg: "FFE0F2FE", fg: "FF0F172A" },
      scope_client:     { bg: "FFEFF6FF", fg: "FF1D4ED8" },
      scope_pmc:        { bg: "FFFEF9C3", fg: "FF854D0E" },
      scope_contractor: { bg: "FFFFF7ED", fg: "FFC2410C" },
      scope_other:      { bg: "FFF8FAFC", fg: "FF64748B" },
      category:         { bg: "FFBFDBFE", fg: "FF1E3A5F" },
      labour:           { bg: "FFFDE68A", fg: "FF78350F" },
      skill:            { bg: "FFFED7AA", fg: "FF92400E" },
      gender:           { bg: "FFFEF9C3", fg: "FF713F12" },
      fixed:            { bg: "FF1E3A5F", fg: "FFE0F2FE" },
      daily_total_hdr:  { bg: "FFB45309", fg: "FFFEF3C7" },
      date_cell:        { bg: "FFFFFBEB", fg: "FF78350F" },
      summary_cell:     { bg: "FFFFFBEB", fg: "FF92400E" },
      count_cell:       { bg: "FFFFFFFF", fg: "FF1E3A5F" },
      zero_cell:        { bg: "FFF8FAFC", fg: "FF94A3B8" },
      row_total_cell:   { bg: "FFDBEAFE", fg: "FF1E3A5F" },
      month_sep:        { bg: "FFFDE68A", fg: "FF78350F" },
      month_sub:        { bg: "FFDBEAFE", fg: "FF1E3A5F" },
      month_sub_total:  { bg: "FFBFDBFE", fg: "FF1E3A5F" },
      grand:            { bg: "FFFEE2E2", fg: "FF7F1D1D" },
      grand_val:        { bg: "FFFCA5A5", fg: "FF7F1D1D" },
    };

    const scopeClr = (scope) => {
      const s = (scope || "").toUpperCase();
      if (s === "CLIENT") return CLR.scope_client;
      if (s === "PMC") return CLR.scope_pmc;
      if (s === "CONTRACTOR") return CLR.scope_contractor;
      return CLR.scope_other;
    };

    const style = ({ bg, fg }, extra = {}) => ({
      fill: { patternType: "solid", fgColor: { rgb: bg } },
      font: { color: { rgb: fg }, bold: true, sz: 10, name: "Calibri", ...(extra.font || {}) },
      alignment: { horizontal: "center", vertical: "center", wrapText: true, ...(extra.align || {}) },
      border: {
        top: { style: "thin", color: { rgb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { rgb: "FFCBD5E1" } },
        left: { style: "thin", color: { rgb: "FFCBD5E1" } },
        right: { style: "thin", color: { rgb: "FFCBD5E1" } },
      },
      ...extra.raw,
    });

    const ws = {};
    const merg = [];
    let R = 0;

    const setCell = (r, c, v, st, type) => {
      const a = addr(r, c);
      const t = type || (typeof v === "number" ? "n" : "s");
      ws[a] = { v: v == null ? "" : v, t, s: st };
      if (t === "n") ws[a].z = "0";
    };

    const mergeRange = (r1, c1, r2, c2) => {
      if (r1 === r2 && c1 === c2) return;
      merg.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    };

    const fillRow = (r, fromC, toC, st) => {
      for (let c = fromC; c <= toC; c += 1) {
        if (!ws[addr(r, c)]) setCell(r, c, "", st);
      }
    };

    // ── Title + meta ──
    setCell(R, 0, "DIP PROJECTS — MANPOWER REPORT", style(CLR.title, { font: { sz: 14, bold: true }, align: { horizontal: "left" } }));
    mergeRange(R, 0, R, totalCol);
    fillRow(R, 1, totalCol, style(CLR.title));
    R++;
    const meta =
      `Site: ${rd.site}   |   Period: ${rd.from ? fmtDate(rd.from) : "All"} → ${rd.to ? fmtDate(rd.to) : "All"}` +
      `   |   Days: ${rd.dates.length}   |   Labour types: ${rd.cols.length}   |   Grand total: ${grand}`;
    setCell(R, 0, meta, style(CLR.meta, { font: { sz: 10, bold: false }, align: { horizontal: "left" } }));
    mergeRange(R, 0, R, totalCol);
    fillRow(R, 1, totalCol, style(CLR.meta, { font: { bold: false } }));
    R++;
    R++; // blank spacer row

    const headerStart = R;
    const scopeSpans_xl = getSpans(rd.cols, (c) => c.scope);
    const categorySpans_xl = getSpans(rd.cols, (c) => `${c.scope}||${c.label.category}`);
    const labourSpans_xl = getSpans(rd.cols, (c) => `${c.scope}||${c.label.category}||${c.label.labour}`);

    // Row: Scope (+ Date/Summary/Daily Total vertical merge across 4 header rows)
    setCell(R, 0, "Date", style(CLR.fixed, { align: { horizontal: "left" } }));
    setCell(R, 1, "Work Summary", style(CLR.fixed, { align: { horizontal: "left" } }));
    mergeRange(R, 0, R + 3, 0);
    mergeRange(R, 1, R + 3, 1);
    for (const { col, span, idx } of scopeSpans_xl) {
      const c = idx + 2;
      setCell(R, c, col.scope || "—", style(scopeClr(col.scope), { font: { sz: 11, bold: true } }));
      mergeRange(R, c, R, c + span - 1);
      fillRow(R, c + 1, c + span - 1, style(scopeClr(col.scope)));
    }
    setCell(R, totalCol, "Daily Total", style(CLR.daily_total_hdr));
    mergeRange(R, totalCol, R + 3, totalCol);
    R++;

    for (const { col, span, idx } of categorySpans_xl) {
      const c = idx + 2;
      setCell(R, c, col.label.category || "—", style(CLR.category));
      mergeRange(R, c, R, c + span - 1);
      fillRow(R, c + 1, c + span - 1, style(CLR.category));
    }
    setCell(R, 0, "", style(CLR.fixed));
    setCell(R, 1, "", style(CLR.fixed));
    setCell(R, totalCol, "", style(CLR.daily_total_hdr));
    R++;

    for (const { col, span, idx } of labourSpans_xl) {
      const c = idx + 2;
      setCell(R, c, col.label.labour || "—", style(CLR.labour));
      mergeRange(R, c, R, c + span - 1);
      fillRow(R, c + 1, c + span - 1, style(CLR.labour));
    }
    setCell(R, 0, "", style(CLR.fixed));
    setCell(R, 1, "", style(CLR.fixed));
    setCell(R, totalCol, "", style(CLR.daily_total_hdr));
    R++;

    rd.cols.forEach((col, i) => {
      const leaf = col.leaf || leafLabel(col.label.skill, col.label.gender);
      setCell(R, i + 2, leaf, style(CLR.gender, { font: { sz: 9, bold: false } }));
    });
    setCell(R, 0, "", style(CLR.fixed));
    setCell(R, 1, "", style(CLR.fixed));
    setCell(R, totalCol, "", style(CLR.daily_total_hdr));
    R++;
    const headerEnd = R - 1;

    // Body
    for (const [mk, mDates] of rd.monthMap.entries()) {
      const monthRowTotal = rd.cols.reduce((s, c) => s + (rd.monthTotals[mk][c.key] || 0), 0);

      setCell(
        R,
        0,
        `${fmtMonth(mk).toUpperCase()}`,
        style(CLR.month_sep, { align: { horizontal: "left" }, font: { sz: 11, bold: true } })
      );
      mergeRange(R, 0, R, totalCol);
      fillRow(R, 1, totalCol, style(CLR.month_sep));
      R++;

      for (const de of mDates) {
        const rowTotal = rd.cols.reduce((s, c) => s + (de.counts.get(c.key) || 0), 0);
        const summaryLines = (de.summary || "")
          .split("\n")
          .map((l) => l.replace(/^[•\-]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 6)
          .join(" | ")
          .slice(0, 400);

        setCell(
          R,
          0,
          fmtDate(de.date),
          style(CLR.date_cell, { align: { horizontal: "left" }, font: { bold: true, sz: 10 } })
        );
        setCell(
          R,
          1,
          summaryLines || "—",
          style(CLR.summary_cell, {
            align: { horizontal: "left", wrapText: true },
            font: { bold: false, sz: 9 },
          })
        );

        rd.cols.forEach((col, i) => {
          const cnt = de.counts.get(col.key) || 0;
          if (cnt > 0) {
            setCell(R, i + 2, cnt, style(CLR.count_cell, { font: { bold: true, sz: 11 } }), "n");
          } else {
            setCell(R, i + 2, "", style(CLR.zero_cell, { font: { bold: false } }));
          }
        });

        if (rowTotal > 0) {
          setCell(R, totalCol, rowTotal, style(CLR.row_total_cell, { font: { bold: true, sz: 11 } }), "n");
        } else {
          setCell(R, totalCol, "", style(CLR.row_total_cell, { font: { bold: false } }));
        }
        R++;
      }

      setCell(
        R,
        0,
        `${fmtMonth(mk).toUpperCase()} — TOTAL`,
        style(CLR.month_sub, { align: { horizontal: "left" }, font: { bold: true, sz: 10 } })
      );
      mergeRange(R, 0, R, 1);
      setCell(R, 1, "", style(CLR.month_sub));

      rd.cols.forEach((col, i) => {
        const cnt = rd.monthTotals[mk][col.key] || 0;
        if (cnt > 0) setCell(R, i + 2, cnt, style(CLR.month_sub, { font: { bold: true, sz: 11 } }), "n");
        else setCell(R, i + 2, "", style(CLR.month_sub, { font: { bold: false } }));
      });
      if (monthRowTotal > 0) {
        setCell(R, totalCol, monthRowTotal, style(CLR.month_sub_total, { font: { bold: true, sz: 12 } }), "n");
      } else {
        setCell(R, totalCol, "", style(CLR.month_sub_total));
      }
      R++;
      R++; // spacer
    }

    setCell(
      R,
      0,
      "GRAND TOTAL — ALL MONTHS",
      style(CLR.grand, { align: { horizontal: "left" }, font: { bold: true, sz: 11 } })
    );
    mergeRange(R, 0, R, 1);
    setCell(R, 1, "", style(CLR.grand));
    rd.cols.forEach((col, i) => {
      const cnt = rd.colTotals[col.key] || 0;
      if (cnt > 0) setCell(R, i + 2, cnt, style(CLR.grand, { font: { bold: true, sz: 11 } }), "n");
      else setCell(R, i + 2, "", style(CLR.grand));
    });
    setCell(R, totalCol, grand, style(CLR.grand_val, { font: { bold: true, sz: 14 } }), "n");

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: R, c: totalCol } });
    ws["!merges"] = merg;
    ws["!cols"] = [
      { wch: 14 },
      { wch: 42 },
      ...rd.cols.map((col) => ({
        wch: Math.min(18, Math.max(10, String(col.label.labour || col.label.category || "x").length + 2)),
      })),
      { wch: 12 },
    ];
    ws["!rows"] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 8 }];
    ws["!freeze"] = { xSplit: 2, ySplit: headerEnd + 1, topLeftCell: addr(headerEnd + 1, 2), activePane: "bottomRight", state: "frozen" };

    // Summary sheet
    const sumRows = [
      ["DIP PROJECTS — MANPOWER SUMMARY"],
      [`Site: ${rd.site}`],
      [`Period: ${rd.from || "All"} to ${rd.to || "All"}`],
      [],
      ["Scope", "Category", "Labour", "Skill", "Gender", "Total Count"],
    ];
    const scopeSum = { CLIENT: 0, PMC: 0, CONTRACTOR: 0, OTHER: 0 };
    for (const col of rd.cols) {
      const tot = rd.colTotals[col.key] || 0;
      sumRows.push([
        col.scope || "—",
        col.label.category || "—",
        col.label.labour || "—",
        col.label.skill || "—",
        col.label.gender || "—",
        tot,
      ]);
      const sk = ["CLIENT", "PMC", "CONTRACTOR"].includes(col.scope) ? col.scope : "OTHER";
      scopeSum[sk] += tot;
    }
    sumRows.push([]);
    sumRows.push(["Scope totals"]);
    sumRows.push(["CLIENT", scopeSum.CLIENT]);
    sumRows.push(["PMC", scopeSum.PMC]);
    sumRows.push(["CONTRACTOR", scopeSum.CONTRACTOR]);
    if (scopeSum.OTHER) sumRows.push(["OTHER", scopeSum.OTHER]);
    sumRows.push(["GRAND TOTAL", grand]);

    const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
    wsSum["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Manpower Report");
    XLSX.utils.book_append_sheet(wb, wsSum, "Summary");
    const safeSite = String(rd.site || "site").replace(/[^\w\-]+/g, "_");
    XLSX.writeFile(wb, `Manpower_${safeSite}_${rd.from || "all"}_to_${rd.to || "all"}.xlsx`);
  };

  const rd         = reportData;
  const grandTotal = rd ? rd.cols.reduce((s, c) => s + (rd.colTotals[c.key] || 0), 0) : 0;
  const activeDays = rd ? rd.dates.filter(de => rd.cols.some(c => de.counts.get(c.key) > 0)).length : 0;

  // ── Pre-compute header spans (only when rd exists) ──────────────
  const scopeSpans    = rd ? getSpans(rd.cols, c => c.scope) : [];
  const categorySpans = rd ? getSpans(rd.cols, c => `${c.scope}||${c.label.category}`) : [];
  const labourSpans   = rd ? getSpans(rd.cols, c => `${c.scope}||${c.label.category}||${c.label.labour}`) : [];

  const formatSummaryHtml = (summary) => {
    const lines = String(summary || "")
      .split(/\n|(?=\d+\.\s)/)
      .map((l) => l.replace(/^[•\-\d.]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!lines.length) return "—";
    return (
      <ul>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="mp-root">
        <div className="mp-inner">
          <div className="mp-card">
            <div className="mp-title">Manpower Report</div>
            <div className="mp-sub">Cross-tab view of daily manpower across all labour types for a site and date range.</div>

            {/* ── Filters ── */}
            <div className="filter-row">
              <div className="filter-fg">
                <div className="filter-label">Site</div>
                <select className="finput" value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ minWidth: 180 }}>
                  <option value="">— Select Site —</option>
                  {sites.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="filter-fg">
                <div className="filter-label">From</div>
                <input className="finput" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="filter-fg">
                <div className="filter-label">To</div>
                <input className="finput" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={generateReport} disabled={loading || !selectedSite}>
                {loading
                  ? <><div className="spinner" />&nbsp;Loading…</>
                  : <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                      </svg>
                      Generate Manpower Report
                    </>
                }
              </button>
              {rd && (
                <button className="btn btn-out" onClick={downloadExcel}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download Excel
                </button>
              )}
            </div>

            {error && (
              <div style={{ color:"#dc2626", fontSize:13, marginBottom:12, background:"#fef2f2", border:"1.5px solid #fecaca", borderRadius:7, padding:"9px 12px" }}>
                {error}
              </div>
            )}

            {/* ── Report ── */}
            {rd && (
              <>
                {/* Stats */}
                <div className="stats-row">
                  <div className="stat-card"><div className="stat-val">{rd.dates.length}</div><div className="stat-lbl">Report Days</div></div>
                  <div className="stat-card"><div className="stat-val">{activeDays}</div><div className="stat-lbl">Active Days</div></div>
                  <div className="stat-card"><div className="stat-val">{rd.monthMap.size}</div><div className="stat-lbl">Months</div></div>
                  <div className="stat-card"><div className="stat-val">{rd.cols.length}</div><div className="stat-lbl">Labour Types</div></div>
                  <div className="stat-card"><div className="stat-val">{grandTotal}</div><div className="stat-lbl">Total Manpower</div></div>
                  <div className="stat-card">
                    <div className="stat-val" style={{ fontSize:14 }}>{rd.site}</div>
                    <div className="stat-lbl">{rd.from ? fmtDate(rd.from) : "All"} — {rd.to ? fmtDate(rd.to) : "All"}</div>
                  </div>
                </div>

                {rd.dates.length === 0 || rd.cols.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-ico">📋</div>
                    <div className="empty-title">No manpower data found</div>
                    <div className="empty-sub">No DPR reports with manpower entries found for {rd.site} in the selected date range.</div>
                  </div>
                ) : (
                  <div className="tbl-outer" ref={printRef}>
                    <table className="mp-tbl">

                      {/* ══ THEAD — 4 rows: Scope → Category → Labour → Skill·Gender ══ */}
                      <thead>

                        {/* Row 1 — Scope */}
                        <tr>
                          <th rowSpan={4} className="th-sticky-date" style={{ background:"#1e3a5f", textAlign:"left", color:"#e0f2fe", verticalAlign:"middle" }}>Date</th>
                          <th rowSpan={4} className="th-sticky-sum" style={{ background:"#1e3a5f", textAlign:"left", color:"#e0f2fe", verticalAlign:"middle" }}>Work Summary</th>
                          {scopeSpans.map(({ col, span, idx }) => {
                            const s = scopeStyle(col.scope);
                            return (
                              <th key={`scope-${idx}`} colSpan={span}
                                style={{ background:s.bg, color:s.text, border:`1.5px solid ${s.border}`,
                                  fontSize:11, fontWeight:800, letterSpacing:1, textAlign:"center", padding:"6px 8px" }}>
                                {col.scope || "—"}
                              </th>
                            );
                          })}
                          <th rowSpan={4} className="th-sticky-total" style={{ background:"#b45309", color:"#fef3c7", verticalAlign:"middle" }}>Daily Total</th>
                        </tr>

                        {/* Row 2 — Category */}
                        <tr>
                          {categorySpans.map(({ col, span, idx }) => (
                            <th key={`cat-${idx}`} colSpan={span}
                              style={{ background:"#bfdbfe", color:"#1e3a5f", fontSize:10.5,
                                fontWeight:700, textAlign:"center", padding:"5px 8px", whiteSpace:"nowrap" }}>
                              {col.label.category || "—"}
                            </th>
                          ))}
                        </tr>

                        {/* Row 3 — Labour type */}
                        <tr>
                          {labourSpans.map(({ col, span, idx }) => (
                            <th key={`lab-${idx}`} colSpan={span}
                              style={{ background:"#fde68a", color:"#78350f", fontSize:11,
                                fontWeight:700, textAlign:"center", padding:"5px 8px", whiteSpace:"nowrap" }}>
                              {col.label.labour || "—"}
                            </th>
                          ))}
                        </tr>

                        {/* Row 4 — Skill · Gender (leaf) */}
                        <tr>
                          {rd.cols.map((col, i) => (
                            <th key={`leaf-${i}`}
                              style={{ background:"#fef9c3", color:"#713f12", fontSize:10,
                                fontWeight:600, textAlign:"center", padding:"5px 6px",
                                whiteSpace:"nowrap", minWidth:72, borderTop:"1.5px solid #fde68a" }}>
                              {col.leaf || leafLabel(col.label.skill, col.label.gender)}
                            </th>
                          ))}
                        </tr>

                      </thead>

                      {/* ══ TBODY ══ */}
                      <tbody>
                        {[...rd.monthMap.entries()].map(([mk, mDates]) => {
                          const monthRowTotal = rd.cols.reduce((s, c) => s + (rd.monthTotals[mk][c.key] || 0), 0);
                          return [
                            /* ── Month separator ── */
                            <tr key={`mh-${mk}`} className="tr-month-header">
                              <td colSpan={rd.cols.length + 3} style={{ padding:"6px 12px" }}>
                                📅 {fmtMonth(mk)}
                              </td>
                            </tr>,

                            /* ── Daily rows ── */
                            ...mDates.map((de) => {
                              const rowTotal = rd.cols.reduce((s, c) => s + (de.counts.get(c.key) || 0), 0);
                              return (
                                <tr key={`day-${de.date}`}>
                                  <td className="td-date">{fmtDate(de.date)}</td>
                                  <td className="td-summary">{formatSummaryHtml(de.summary)}</td>
                                  {rd.cols.map((col, ci) => {
                                    const cnt = de.counts.get(col.key) || 0;
                                    return cnt > 0
                                      ? <td key={`c-${ci}`} className="td-count">{cnt}</td>
                                      : <td key={`c-${ci}`} className="td-zero">—</td>;
                                  })}
                                  <td className="td-daily-total">
                                    {rowTotal > 0 ? rowTotal : "—"}
                                  </td>
                                </tr>
                              );
                            }),

                            /* ── Monthly subtotal ── */
                            <tr key={`mt-${mk}`} className="tr-month-total">
                              <td className="td-month-label" colSpan={2}>{fmtMonth(mk)} — Total</td>
                              {rd.cols.map((col, i) => {
                                const cnt = rd.monthTotals[mk][col.key] || 0;
                                return cnt > 0
                                  ? <td key={`mt-c-${i}`} className="td-month-count">{cnt}</td>
                                  : <td key={`mt-c-${i}`} className="td-month-zero">—</td>;
                              })}
                              <td className="td-month-row-total">{monthRowTotal > 0 ? monthRowTotal : "—"}</td>
                            </tr>,
                          ];
                        })}

                        {/* ── Grand total ── */}
                        <tr className="tr-grand-total">
                          <td className="td-grand-label" colSpan={2}>GRAND TOTAL — ALL MONTHS</td>
                          {rd.cols.map((col, i) => (
                            <td key={`gt-${i}`}>{rd.colTotals[col.key] || "—"}</td>
                          ))}
                          <td className="td-grand-total-val">{grandTotal}</td>
                        </tr>
                      </tbody>

                    </table>
                  </div>
                )}
              </>
            )}

            {!rd && !loading && (
              <div className="empty-state">
                <div className="empty-ico">
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div className="empty-title">Select a site and generate the report</div>
                <div className="empty-sub">Choose a site and date range, then click "Generate Manpower Report" to view the cross-tab manpower summary.</div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}