import { useState, useEffect } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { isOfficeSiteViewer } from '../../lib/api';

function identitySet(user) {
  return new Set(
    [user?.user_name, user?.username, user?.name, user?.full_name, user?.id]
      .map((s) => String(s || "").toLowerCase().trim())
      .filter(Boolean)
  );
}

function isMine(row, user, fields) {
  const ids = identitySet(user);
  if (!ids.size) return false;
  return fields.some((f) => ids.has(String(f || "").toLowerCase().trim()));
}






const fmtD  = (d)  => d  ? new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "—";
const fmtDT = (dt) => dt ? new Date(dt).toLocaleString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}) : "—";
const isMobileDevice = () =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function officeViewerUrl(url) {
  if (!url) return url;
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
}

function resolveViewUrl(url, isOffice) {
  if (!isOffice) return url;
  return officeViewerUrl(url);
}
async function downloadPdf(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const filename = url.split("/").pop().split("?")[0] || "report.pdf";
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (e) {
    window.open(url, "_blank");
  } 
}

const TAB_CONFIG = [
  { key:"dpr", label:"DPR", color:"#7a2e00", bg:"#eff6ff", border:"#bfdbfe" },
  { key:"wpr", label:"WPR", color:"#a55622", bg:"#f5f3ff", border:"#e0e7ff" },
  { key:"svr", label:"SVR", color:"#c96a10", bg:"#f0fdf4", border:"#bbf7d0" },
];

const getBadge = (r) => {
  if (r._source === "svr") return { bg:"#f0fdf4", color:"#c96a10", border:"#bbf7d0", label:"Site Visit"   };
  if (r._source === "wpr") return { bg:"#f5f3ff", color:"#a55622", border:"#e0e7ff", label:"Weekly Report" };
  if (r.report_type === "morning") return { bg:"#fffbeb", color:"#d97706", border:"#fde68a", label:"Morning DPR" };
  if (r.report_type === "evening") return { bg:"#eff6ff", color:"#7a2e00", border:"#bfdbfe", label:"Evening DPR" };
  return { bg:"#f8fafc", color:"#64748b", border:"#e8edf3", label: r.report_type || "DPR" };
};

const getAccent = (r) => {
  if (r._source === "svr") return "#c96a10";
  if (r._source === "wpr") return "#a55622";
  if (r.report_type === "morning") return "#d97706";
  return "#7a2e00";
};

// ── Expanded detail panels ────────────────────────────────────────────────────
function DprDetail({ r }) {
  const p = r.payload || {};
  const fields = [
    { label:"Weather",        value:p.weather,        span:false },
    { label:"Workers on Site",value:p.workers_count,  span:false },
    { label:"Work Done",      value:p.work_done,      span:true  },
    { label:"Materials Used", value:p.materials_used, span:false },
    { label:"Equipment Used", value:p.equipment_used, span:false },
    { label:"Issues / Delays",value:p.issues,         span:true, red:true },
    { label:"Next Day Plan",  value:p.next_day_plan,  span:true  },
    { label:"Remarks",        value:p.remarks,        span:true  },
    { label:"Submitted At",   value:fmtDT(r.created_at), span:false },
  ].filter(f => f.value !== undefined && f.value !== null && f.value !== "");

  return (
    <div className="rs-detail-panel" style={{
      borderTop:"1px solid #e8edf3", padding:"14px 16px",
      background:"#fafaf8", display:"flex", flexDirection:"column", gap:12,
    }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:".09em", textTransform:"uppercase", color:"#94a3b8" }}>
        Report Details
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px" }}>
        {fields.map(f => (
          <div key={f.label} style={{ display:"flex", flexDirection:"column", gap:2, gridColumn: f.span ? "span 2" : "span 1" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em" }}>{f.label}</div>
            <div className={f.red ? "" : "rs-detail-value"} style={{ fontSize:12.5, color: f.red ? "#dc2626" : "#334155", lineHeight:1.55 }}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SvrDetail({ r }) {
  const fields = [
    { label:"Progress of Work",        value:r.progress_of_work,       span:true  },
    { label:"Quality Observations",    value:r.quality_observations,   span:true  },
    { label:"Safety Concerns",         value:r.safety_concerns,        span:true, red:true },
    { label:"Issues / Concerns",       value:r.issues_concerns,        span:true  },
    { label:"Site Visit Instructions", value:r.site_visit_instructions,span:true  },
    { label:"Key Instructions",        value:r.key_instructions,       span:true  },
    { label:"Submitted By",            value:r.submitted_by_name,      span:false },
    { label:"Submitted At",            value:fmtDT(r.created_at),      span:false },
  ].filter(f => f.value);

  return (
    <div className="rs-detail-panel" style={{
      borderTop:"1px solid #e8edf3", padding:"14px 16px",
      background:"#fafaf8", display:"flex", flexDirection:"column", gap:12,
    }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:".09em", textTransform:"uppercase", color:"#94a3b8" }}>
        Visit Details
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px" }}>
        {fields.map(f => (
          <div key={f.label} style={{ display:"flex", flexDirection:"column", gap:2, gridColumn: f.span ? "span 2" : "span 1" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".06em" }}>{f.label}</div>
            <div className={f.red ? "" : "rs-detail-value"} style={{ fontSize:12.5, color: f.red ? "#dc2626" : "#334155", lineHeight:1.55 }}>{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Single report card ────────────────────────────────────────────────────────
function ReportCard({ r }) {
  const [open, setOpen] = useState(false);
  const badge  = getBadge(r);
  const accent = getAccent(r);
const isOfficeDoc = (url) => /\.(pptx|ppt|docx|doc|xlsx|xls)(\?|$)/i.test(url || "");
  const displayDate  = r._source === "svr" ? r.visit_date : r.date;
  const displayName  = r._source === "svr" ? r.reporter_name : r.engineer;
  const displaySite  = r._source === "svr" ? r.site_name : r._source === "wpr" ? r.site_name : r.site;
  const previewText  = r._source === "svr"
    ? r.progress_of_work
    : r._source === "wpr"
    ? `WPR — ${String(r.report_number || 1).padStart(2,"0")}  •  ${r.status === "uploaded" ? "Uploaded" : "Generated"}`
    : r.payload?.work_done;
  return (
    <div className="rs-card" style={{
      background:"#fff", border:"1px solid #e8edf3",
      borderLeft:`4px solid ${accent}`, borderRadius:10,
      display:"flex", flexDirection:"column",
    }}>
      {/* ── Card header ── */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:10, cursor:"pointer" }}
      >
        {/* Badge + site */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:4,
            fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20,
            background:badge.bg, color:badge.color, border:`1px solid ${badge.border}`,
          }}>
            {badge.label}
          </span>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {displaySite && (
              <span className="rs-site-name" style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>{displaySite}</span>
            )}
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
              style={{ transition:"transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)", flexShrink:0 }}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>

        {/* Engineer row */}
        {displayName && (
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span className="rs-engineer-name" style={{ fontSize:13, fontWeight:600, color:"#334155" }}>{displayName}</span>
            {r._source === "svr" && r.designation && (
              <span className="rs-preview-text" style={{ fontSize:11, color:"#94a3b8" }}>· {r.designation}</span>
            )}
          </div>
        )}

        {/* Preview text */}
        {!open && previewText && (
          <p className="rs-preview-text" style={{
            fontSize:12, color:"#64748b", lineHeight:1.5, margin:0,
            display:"-webkit-box", WebkitLineClamp:2,
            WebkitBoxOrient:"vertical", overflow:"hidden",
          }}>
            {previewText}
          </p>
        )}

        {/* Submission time */}
        <div className="rs-submitted-time" style={{ fontSize:11, color:"#cbd5e1" }}>
          Submitted {new Date(r.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true})}
        </div>

        {/* PDF buttons */}
        {r.pdf_url ? (
        <div style={{ display:"flex", gap:8 }} onClick={e => e.stopPropagation()}>
      
        <a href={resolveViewUrl(r.pdf_url, r._source === "wpr" && isOfficeDoc(r.pdf_url))}
          target="_blank"
          rel="noopener noreferrer"
          className="rs-btn-view"
          style={{
            display:"inline-flex", alignItems:"center", gap:6,
            fontSize:12, fontWeight:600, color:"#475569",
            background:"#f8fafc", border:"1px solid #e2e8f0",
            borderRadius:7, padding:"6px 12px", textDecoration:"none",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          View
        </a>
        <button onClick={() => downloadPdf(r.pdf_url)} className="rs-btn-download" style={{
            display:"inline-flex", alignItems:"center", gap:6,
            fontSize:12, fontWeight:600, color:"#7a2e00",
            background:"#eff6ff", border:"1px solid #bfdbfe",
            borderRadius:7, padding:"6px 12px", cursor:"pointer", fontFamily:"inherit",
          }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
    </button>
  </div>
) : (
  <span className="rs-no-pdf" style={{ fontSize:11, color:"#94a3b8", fontStyle:"italic" }}>No PDF attached</span>
)}
      </div>

      {/* ── Expanded detail ── */}
      {open && (
        r._source === "svr"
          ? <SvrDetail r={r}/>
          : <DprDetail r={r}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function MyReports({ user }) {
  const [tab,        setTab]        = useState(() => (isOfficeSiteViewer(user) ? "svr" : "dpr"));
  const [month,      setMonth]      = useState(new Date().toISOString().slice(0,7));
  const [siteFilter, setSiteFilter] = useState("");
  const [data,       setData]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");
  const [counts, setCounts] = useState({ dpr: null, wpr: null, svr: null });
    const [page, setPage] = useState(1);
  const PER_PAGE = 10;
  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setSiteFilter("");
    setData([]); setErr("");
    setLoading(true);

    (async () => {
      try {
        const [y, m] = month.split("-").map(Number);
        const lastDay    = new Date(y, m, 0).getDate();
        const monthStart = `${month}-01`;
        const monthEnd   = `${month}-${String(lastDay).padStart(2,"0")}`;

        if (tab === "dpr") {
          const { data: rows, error } = await supabase
            .from("dpr_reports")
            .select("id, site, engineer, report_type, date, pdf_url, payload, created_at")
            .gte("date", monthStart)
            .lte("date", monthEnd)
            .order("date", { ascending: false })
            .limit(200);

          if (error) { setErr(error.message); setLoading(false); return; }

          const mine = (rows || []).filter(r =>
            isMine(r, user, [r.engineer]) &&
            r.report_type !== "morning"
          ).map(r => ({ ...r, _source:"dpr" }));

          setData(mine);

        } else if (tab === "svr") {
          const { data: rows, error } = await supabase
            .from("site_reports")
            .select("*")
            .gte("visit_date", monthStart)
            .lte("visit_date", monthEnd)
            .order("visit_date", { ascending: false })
            .limit(200);

          if (error) { setErr(error.message); setLoading(false); return; }

          const mine = (rows || []).filter(r =>
            isMine(r, user, [r.submitted_by, r.submitted_by_name, r.reporter_name])
          ).map(r => ({ ...r, _source:"svr" }));

          setData(mine);

        } else if (tab === "wpr") {
          const { data: rows, error } = await supabase
            .from("wpr_reports")
            .select("id, site_name, engineer_name, report_date, report_number, presentation_url, status, created_at")
            .gte("created_at", `${monthStart}T00:00:00`)
            .lte("created_at", `${monthEnd}T23:59:59`)
            .order("created_at", { ascending: false })
            .limit(200);

          if (error) { setErr(error.message); setLoading(false); return; }

          const mine = (rows || []).filter(r =>
            isMine(r, user, [r.engineer_name])
          ).map(r => ({
            ...r,
            _source:  "wpr",
            site:     r.site_name,
            engineer: r.engineer_name,
            date:     r.created_at?.slice(0, 10),
            pdf_url:  r.presentation_url,
          }));

          setData(mine);
        }

      } catch(e) {
        setErr(e.message);
      }
      setLoading(false);
    })();
  }, [tab, month, user.user_name, user.username, user.name, user.full_name, user.id]);
  // Fetch total counts for all tabs (for the banner chips)
useEffect(() => {
  (async () => {
    // DPR count
    const { data: dprRows } = await supabase
      .from("dpr_reports")
      .select("id, engineer, report_type")
      .limit(1000);
    const dprCount = (dprRows || []).filter(r =>
      isMine(r, user, [r.engineer]) &&
      r.report_type !== "morning"
    ).length;

    // SVR count
    const { data: svrRows } = await supabase
      .from("site_reports")
      .select("id, submitted_by, submitted_by_name, reporter_name")
      .limit(1000);
    const svrCount = (svrRows || []).filter(r =>
      isMine(r, user, [r.submitted_by, r.submitted_by_name, r.reporter_name])
    ).length;

    // WPR count
    const { data: wprRows } = await supabase
      .from("wpr_reports")
      .select("id, engineer_name")
      .limit(1000);
    const wprCount = (wprRows || []).filter(r =>
      isMine(r, user, [r.engineer_name])
    ).length;

    setCounts({ dpr: dprCount, wpr: wprCount, svr: svrCount });
  })();
}, [user.user_name, user.username, user.name, user.full_name, user.id]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const siteKey = (r) => r._source === "svr" ? r.site_name : r._source === "wpr" ? r.site_name : r.site;
  const siteOptions = [...new Set(data.map(siteKey).filter(Boolean))].sort();
  const filtered    = siteFilter ? data.filter(r => siteKey(r) === siteFilter) : data;

  const grouped = {};
  filtered.forEach(r => {
    const d = (r._source === "svr" ? r.visit_date : r.date) || r.created_at?.slice(0,10) || "—";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(r);
  });
  const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a));

// Pagination — slice by dates, not individual reports
// Pagination — strict 10 reports per page, can split within a date
const totalReports = filtered.length;
const limit = page * PER_PAGE;

const paginatedGrouped = {};
let countSoFar = 0;
for (const date of sortedDates) {
  if (countSoFar >= limit) break;
  const remaining = limit - countSoFar;
  const reportsForDate = grouped[date].slice(0, remaining);
  paginatedGrouped[date] = reportsForDate;
  countSoFar += reportsForDate.length;
}
const paginatedDates = Object.keys(paginatedGrouped);
const paginated = paginatedDates.flatMap(d => paginatedGrouped[d]);
const hasMore = paginated.length < totalReports;

  return (
    <div>

      {/* ── Gradient banner ── */}
      <div className="rs-banner" style={{
        display:"flex", alignItems:"flex-start", justifyContent:"space-between",
        gap:16, flexWrap:"wrap", marginBottom:20, padding:"18px 22px", borderRadius:14,
        background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", color:"#fff",
      }}>
        <div style={{ minWidth:200 }}>
          <div style={{ fontSize:10.5, fontWeight:800, letterSpacing:".12em", textTransform:"uppercase", color:"#93c5fd", marginBottom:6 }}>
            My Submissions
          </div>
          <div style={{ fontSize:19, fontWeight:700, marginBottom:5 }}>My Reports</div>
          <div style={{ fontSize:12.5, color:"#cbd5e1", lineHeight:1.6, maxWidth:480 }}>
            Reports submitted by <strong style={{ color:"#fff" }}>{user.name}</strong> for{" "}
            <strong style={{ color:"#fff" }}>
              {(user.site_names?.length ? user.site_names : user.site_name ? [user.site_name] : []).join(", ") || "your sites"}
            </strong>.
          </div>
        </div>

        {/* Stat chips */}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {[
            { label:"DPR", color:"#60a5fa", active: tab === "dpr" },
            { label:"WPR", color:"#c4b5fd", active: tab === "wpr" },
            { label:"SVR", color:"#86efac", active: tab === "svr" },
          ].map(s => (
            <div key={s.label} style={{
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              minWidth:56, padding:"8px 14px", borderRadius:10, cursor:"pointer",
              background: s.active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
              border: s.active ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(255,255,255,0.12)",
            }}
              onClick={() => { setTab(s.label.toLowerCase()); setPage(1); }}
            >
              <div style={{ fontSize:18, fontWeight:800, fontFamily:"monospace", color:s.color }}>
                {s.active
                  ? filtered.length
                  : counts[s.label.toLowerCase()] !== null
                    ? counts[s.label.toLowerCase()]
                    : "…"}
              </div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", color:"#94a3b8", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="rs-tab-bar" style={{
        display:"inline-flex", gap:4, padding:4, borderRadius:10,
        background:"#f1f5f9", border:"1px solid #e8edf3", marginBottom:20, flexWrap:"wrap",
      }}>
        {TAB_CONFIG.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`rs-tab-btn${tab === t.key ? " active" : ""}`}
            style={{
              display:"flex", alignItems:"center", gap:6, padding:"7px 16px", borderRadius:7,
              fontFamily:"inherit", fontSize:12.5, fontWeight:700,
              border:"none", cursor:"pointer", transition:"all .15s",
              color:      tab === t.key ? t.color  : "#64748b",
              background: tab === t.key ? "#fff"   : "transparent",
              boxShadow:  tab === t.key ? "0 1px 6px rgba(0,0,0,.08)" : "none",
            }}
          >
            {t.label}
            <span style={{
              fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:20,
              background: tab === t.key ? t.bg    : "#e2e8f0",
              color:      tab === t.key ? t.color : "#94a3b8",
            }}>
              {tab === t.key ? filtered.length : "—"}
            </span>
          </button>
        ))}
      </div>

{/* WPR is handled by the shared tab !== "wpr" block below — nothing needed here */}  

      {(tab !== "wpr" || true) && (
        <>
          {/* ── Filter row ── */}
          <div className="rs-filter-row" style={{
            display:"flex", gap:10, flexWrap:"wrap", marginBottom:18,
            padding:"10px 14px", background:"var(--paper,#f5f2ee)",
            border:"1px solid var(--line,#e8e2d8)", borderRadius:10,
          }}>
            <input
              type="month"
              style={{
                fontFamily:"inherit", fontSize:12.5, color:"#1e293b",
                background:"#fff", border:"1px solid #e2e8f0", borderRadius:6,
                padding:"5px 9px", height:32, cursor:"pointer", outline:"none",
              }}
              value={month}
              onChange={e => { setMonth(e.target.value); setSiteFilter(""); setPage(1); }}
            />
            {siteOptions.length > 1 && (
              <select
                style={{
                  fontFamily:"inherit", fontSize:12.5, color:"#1e293b",
                  background:"#fff", border:"1px solid #e2e8f0", borderRadius:6,
                  padding:"5px 9px", height:32, cursor:"pointer", outline:"none",
                }}
                value={siteFilter}
                onChange={e => { setSiteFilter(e.target.value); setPage(1); }}
              >
                <option value="">All Sites</option>
                {siteOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {siteFilter && (
              <button
                onClick={() => { setSiteFilter(""); setPage(1); }}
                style={{
                  display:"inline-flex", alignItems:"center", gap:5,
                  fontSize:12, fontWeight:600, color:"#dc2626",
                  background:"#fef2f2", border:"1px solid #fecaca",
                  borderRadius:6, padding:"5px 11px", height:32, cursor:"pointer",
                }}
              >
                ✕ Clear
              </button>
            )}
            <span style={{ marginLeft:"auto", fontSize:12, color:"#94a3b8", alignSelf:"center" }}>
              {filtered.length} report{filtered.length !== 1 ? "s" : ""} this month
            </span>
          </div>

          {/* ── Error ── */}
          {err && (
            <div style={{
              display:"flex", alignItems:"flex-start", gap:8,
              background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10,
              padding:"12px 14px", fontSize:12.5, color:"#dc2626", marginBottom:16, lineHeight:1.5,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div><strong>Error:</strong> {err}</div>
            </div>
          )}

          {/* ── Loading ── */}
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:48, color:"#94a3b8", fontSize:13 }}>
              <div style={{
                width:18, height:18, border:"2.5px solid #e2e8f0",
                borderTopColor:"#d97706", borderRadius:"50%",
                animation:"mr-spin .7s linear infinite",
              }}/>
              Loading…
              <style>{`@keyframes mr-spin{to{transform:rotate(360deg);}}`}</style>
            </div>
          ) : filtered.length === 0 ? (
            /* ── Empty state ── */
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"52px 24px", color:"#94a3b8" }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.3 }}>
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
              <p style={{ fontWeight:700, color:"#64748b", margin:0 }}>
                No {tab.toUpperCase()} reports found{siteFilter ? ` for "${siteFilter}"` : ""} this month
              </p>
              <p style={{ fontSize:12, color:"#94a3b8", margin:0 }}>Try selecting a different month above.</p>
            </div>
          ) : (
            /* ── Date-grouped card grid ── */
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {paginatedDates.map(date => (
                  <div key={date}>
                  {/* Date section header */}
                  <div style={{
                    fontSize:11, fontWeight:800, letterSpacing:".08em", textTransform:"uppercase",
                    color:"#94a3b8", marginBottom:10, display:"flex", alignItems:"center", gap:10,
                  }}>
                    <span className="rs-date-label">
                      {new Date(date+"T00:00:00").toLocaleDateString("en-IN",{
                        weekday:"long", day:"numeric", month:"long", year:"numeric",
                      })}
                    </span>
                    <div className="rs-date-divider" style={{ flex:1, height:1, background:"#e8edf3" }}/>
                    <span className="rs-date-label">{grouped[date].length} report{grouped[date].length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Card grid */}
                  <div style={{
                    display:"grid",
                    gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",
                    gap:12,
                  }}>
                    {paginatedGrouped[date].map(r => <ReportCard key={r.id} r={r}/>)}
                  </div>
                </div>
              ))}

            {/* ── Load More ── */}
            {hasMore && (
              <div style={{
                display:"flex", flexDirection:"column",
                alignItems:"center", gap:8, marginTop:24,
              }}>
                <div style={{ fontSize:12, color:"#94a3b8", fontWeight:600 }}>
                  Showing {paginated.length} of {totalReports} reports
                </div>
                <button
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "11px 28px",
                    borderRadius: 10,
                    background: "#f5f5f5",
                    border: "1px solid #d1d5db",
                    color: "#374151",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    transition: "all .2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#e5e7eb";
                    e.currentTarget.style.borderColor = "#9ca3af";
                    e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.12)";
                  }}

                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#f5f5f5";
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
                  }}
                > 
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  Load More ({totalReports - paginated.length} remaining)
                </button>
              </div>
            )}

            {!hasMore && totalReports > PER_PAGE && (
              <div style={{
                textAlign:"center", marginTop:20,
                fontSize:12, color:"#94a3b8", fontWeight:600,
              }}>
                All {totalReports} reports loaded
              </div>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}