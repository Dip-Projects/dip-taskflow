import { useState, useEffect, useCallback } from "react";

import { createPortal } from "react-dom";
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';





// ─── Helpers (mirrors Dpr.jsx conventions) ───────────────────────────────────
const titleCase = s => s
  ? s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  : "";

const fmtDateTime = iso => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

async function dbFetch(table, col = "name") {
  const { data } = await supabase.from(table).select(col).order(col);
  return (data || []).map(r => r[col]).filter(Boolean).map(titleCase);
}
async function dbInsert(table, payload) {
  const { error } = await supabase.from(table).insert(payload);
  return !error;
}

// ─── Seen-tracking for the Material Received badge ───────────────────────────
function lastSeenKey(user, site, status) {
  return `mreq_lastseen_${user?.id || user?.name || "anon"}__${site}__${status}`;
}
function getLastSeen(user, site, status) {
  try { return localStorage.getItem(lastSeenKey(user, site, status)) || "1970-01-01T00:00:00.000Z"; }
  catch { return "1970-01-01T00:00:00.000Z"; }
}
function markSeen(user, site, status, iso) {
  try { localStorage.setItem(lastSeenKey(user, site, status), iso); } catch {}
}
// ─── Shared unseen-count logic (importable from the sidebar too) ────────────
function getUserSites(user) {
  return Array.isArray(user?.site_names) && user.site_names.length
    ? user.site_names.map(s => titleCase(s))
    : user?.site_name ? [titleCase(user.site_name)] : [];
}

export function markMaterialSeen(user, statuses = ["received", "rejected"]) {
  const sites = getUserSites(user);
  const nowIso = new Date().toISOString();
  sites.forEach(s => statuses.forEach(st => markSeen(user, s, st, nowIso)));
}

// NEW — mark seen for just one site (used when a specific chip is viewed)
function markMaterialSeenForSite(user, site, statuses) {
  const nowIso = new Date().toISOString();
  statuses.forEach(st => markSeen(user, site, st, nowIso));
}

export function useMaterialUnseenCount(user) {
  const [breakdown, setBreakdown] = useState({ received: 0, rejected: 0 });
  const sites = getUserSites(user);
  const sitesKey = sites.join("|");

  const refresh = useCallback(async () => {
    if (!user || !sites.length) { setBreakdown({ received: 0, rejected: 0 }); return; }
    let received = 0, rejected = 0;
    for (const s of sites) {
      const lastSeenReceived = getLastSeen(user, s, "received");
      const lastSeenRejected = getLastSeen(user, s, "rejected");
      const { data, error } = await supabase
        .from("material_requirements")
        .select("status, created_at, received_at")
        .eq("site_name", s)
        .eq("requested_by", user.name)
        .in("status", ["received", "rejected"]);
      if (error) continue;
      (data || []).forEach((r) => {
        const changedAt = r.received_at || r.created_at;
        if (!changedAt) return;
        if (r.status === "received" && new Date(changedAt) > new Date(lastSeenReceived)) received++;
        else if (r.status === "rejected" && new Date(changedAt) > new Date(lastSeenRejected)) rejected++;
      });
    }
    setBreakdown({ received, rejected });
  }, [user, sitesKey]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t); }, [refresh]);

  return { received: breakdown.received, rejected: breakdown.rejected, total: breakdown.received + breakdown.rejected, refresh };
}
function canMarkReceived(user) {
  const role = (user?.role || "").toLowerCase().trim();
  return role === "project head" || role === "site incharge";
}

function getActiveSite(user) {
  if (Array.isArray(user?.site_names) && user.site_names.length) return user.site_names[0];
  if (user?.site_name) return user.site_name;
  return "";
}

// ─── CSS — extends Dpr.jsx's tokens, scoped to this component ───────────────
const CSS = `
.mreq-root{min-height:100vh;}
.mreq-inner{max-width:1100px;margin:0 auto;}

.mreq-tabs{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:20px;}
.mreq-tab-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 10px;border:none;background:transparent;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer;color:var(--ink3);transition:all .18s;}
.mreq-tab-btn.act{background:#fff;  border: 2px solid; color:#3d1200 !important; border-image: linear-gradient(135deg, #3d1200, #7a2e00, #c96a10) 1;color:black;}
.flabel{margin-top:20px}
.mreq-card{background:var(--card);}
.mreq-tab-btn{position:relative;}
.mreq-badge{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:18px;height:18px;padding:0 5px;border-radius:9px;
  background:#dc2626;color:#fff;font-size:10.5px;font-weight:800;
  line-height:1;margin-left:3px;
}
  .mreq-chip{position:relative;display:inline-flex;align-items:center;gap:6px;}
.mreq-badge-sm{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:16px;height:16px;padding:0 4px;border-radius:8px;
  background:#dc2626;color:#fff;font-size:9.5px;font-weight:800;line-height:1;
}
[data-theme="dark"] .mreq-badge-sm{background:#f87171;color:#1e1c19;}
[data-theme="dark"] .mreq-badge{background:#f87171;color:#1e1c19;}
.mreq-filter-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.mreq-chip{padding:7px 16px;border-radius:20px;border:1.5px solid var(--border);background:var(--card);font-family:var(--font);font-size:12px;font-weight:700;color:var(--ink3);cursor:pointer;transition:all .15s;}
.mreq-chip.act{background:#e8e2d8;border-color:var(--orange-line);color:var(--orange);}

.mreq-item-list{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
.mreq-staged-row{display:flex;align-items:center;gap:12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;padding:11px 14px;}
.mreq-staged-main{flex:1;min-width:0;}
.mreq-staged-name{font-size:13.5px;font-weight:700;color:var(--ink);}
.mreq-staged-meta{font-size:12px;color:var(--ink3);margin-top:1px;}
.mreq-staged-remove{background:none;border:none;color:var(--ink3);cursor:pointer;padding:5px;border-radius:6px;display:flex;align-items:center;justify-content:center;width:auto;}
.mreq-staged-remove:hover{color:var(--red);background:#fef2f2;}

.mreq-rcard{background:var(--card);border:1.5px solid var(--border);border-left:4px solid #d97706;border-radius:8px;padding:14px 16px;margin-bottom:10px;}
.mreq-rcard.received{border-left-color:var(--green);}
.mreq-rcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px;}
.mreq-rcard-name{font-size:14px;font-weight:800;color:var(--ink);}
.mreq-rcard-qty{font-size:12.5px;color:var(--ink2);margin-top:2px;font-weight:600;}
.mreq-rcard-meta{font-size:11.5px;color:var(--ink3);margin-top:8px;line-height:1.6;}
.mreq-rcard-meta strong{color:var(--ink2);}

.mreq-receive-btn{margin-top:10px;width:100%;}

.mreq-empty{display:flex;flex-direction:column;align-items:center;padding:48px 24px;text-align:center;gap:10px;color:var(--ink3);}
.mreq-empty svg{opacity:.3;}
.mreq-empty-title{font-size:13.5px;font-weight:700;color:var(--ink2);}
.mreq-empty-sub{font-size:12.5px;color:var(--ink3);}

.mreq-loading{display:flex;align-items:center;justify-content:center;padding:36px;color:var(--ink2);font-size:13px;gap:10px;}
@keyframes mreq-bulb {
  0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(22,163,74,0.7); }
  50% { transform: scale(1.3); opacity: 0.85; box-shadow: 0 0 0 5px rgba(22,163,74,0); }
}
.mreq-dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; display: inline-block; flex-shrink: 0; animation: mreq-bulb 1.4s ease-in-out infinite;}
.mreq-rcard.rejected { border-left-color: #dc2626; }

[data-theme="dark"] .mreq-rcard.rejected { border-left-color: #f87171 !important; }

[data-theme="dark"] .mreq-tabs{border-color:#3a3733;}
[data-theme="dark"] .mreq-tab-btn{color:#7a7368;background:#1e1c19;}
[data-theme="dark"] .mreq-tab-btn.act{color:#c96a10 !important}
[data-theme="dark"] .mreq-chip{background:#252320;border-color:#3a3733;color:#7a7368;}
[data-theme="dark"] .mreq-chip.act{background:rgba(107,45,15,.25);border-color:rgba(107,45,15,.5);color:#fbbf24;}
[data-theme="dark"] .mreq-staged-row{background:#252320;border-color:#3a3733;}
[data-theme="dark"] .mreq-staged-name{color:#f0ede8;}
[data-theme="dark"] .mreq-rcard { background: #1e1c19; border: 1.5px solid #3a3733; border-left: 4px solid #fbbf24;}

[data-theme="dark"] .mreq-rcard.received { border-left-color: #4ade80 !important;}
[data-theme="dark"] .mreq-rcard-name{color:#f0ede8;}
[data-theme="dark"] .mreq-rcard-qty{color:#c4bdb4;}
[data-theme="dark"] .mreq-rcard-meta{color:#7a7368;}
[data-theme="dark"] .mreq-rcard-meta strong{color:#c4bdb4;}

`;
// Inject popup styles into <head> so portal can access them
const POPUP_CSS = `
  .mreq-popup-backdrop {
    position: fixed !important;
    inset: 0 !important;
    background: rgba(0,0,0,.45) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 99999 !important;
    padding: 20px !important;
  }
  .mreq-popup-box {
    background: #fff;
    border-radius: 12px;
    width: 100%;
    max-width: 400px;
    padding: 22px;
    box-shadow: 0 16px 48px rgba(0,0,0,.25);
    font-family: 'DM Sans', sans-serif;
  }
  .mreq-popup-title {
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 14px;
    color: #1a1a1a;
  }
  .mreq-popup-btns {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }
  [data-theme="dark"] .mreq-popup-box {
    background: #1e1c19;
  }
  [data-theme="dark"] .mreq-popup-title {
    color: #f0ede8;
  }
@keyframes mreq-bulb {
  0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(22,163,74,0.7); }
  50% { transform: scale(1.3); opacity: 0.85; box-shadow: 0 0 0 5px rgba(22,163,74,0); }
}
  @keyframes mreq-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
.mreq-skel {
  background: linear-gradient(90deg, var(--border) 25%, var(--card) 37%, var(--border) 63%);
  background-size: 400px 100%;
  animation: mreq-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
.mreq-skel-card { background:var(--card);border:1.5px solid var(--border);border-left:4px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:10px; }
.mreq-skel-row { display:flex;align-items:center;gap:12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;padding:11px 14px;margin-bottom:8px; }
.mreq-skel-select { height:38px;border-radius:9px; }
[data-theme="dark"] .mreq-skel {
  background: linear-gradient(90deg, #2e2b27 25%, #3a3733 37%, #2e2b27 63%);
  background-size: 400px 100%;
}
`;

// Inject once into <head>
if (!document.getElementById("mreq-popup-styles")) {
  const tag = document.createElement("style");
  tag.id = "mreq-popup-styles";
  tag.textContent = POPUP_CSS;
  document.head.appendChild(tag);
}

// ─── Icons (inline SVG, matches Dpr.jsx's stroke-based icon style) ───────────
const Ico = {
  plus: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  send: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>,
  x: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  clock: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  box: <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>,
  pending: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  user: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() { return <div className="spinner" />; }

// Matches MatReqCard's layout — used for both history and received-list loading
function SkeletonReqCard() {
  return (
    <div className="mreq-skel-card">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, gap:10 }}>
        <div className="mreq-skel" style={{ width:"50%", height:15 }}/>
        <div className="mreq-skel" style={{ width:76, height:22, borderRadius:20, flexShrink:0 }}/>
      </div>
      <div className="mreq-skel" style={{ width:"30%", height:12, marginBottom:10 }}/>
      <div className="mreq-skel" style={{ width:"65%", height:11 }}/>
    </div>
  );
}

// Matches the material/unit SelectWithAdd dropdown while its lookup list loads
function SkeletonSelect() {
  return <div className="mreq-skel mreq-skel-select" />;
}

function SelectWithAdd({ value, onChange, options, placeholder, onAdd }) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const [showPopup, setShowPopup] = useState(false);
  const [newVal, setNewVal] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newVal.trim() || saving) return;
    setSaving(true);
    await onAdd(newVal.trim());
    setSaving(false);
    setNewVal("");
    setShowPopup(false);
  };

  return (
    <>
    
      <select className="finput" value={value} onChange={e => {
        if (e.target.value === "__add") { setShowPopup(true); }
        else onChange(e.target.value);
      }}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        <option value="__add">➕ Add New…</option>
      </select>

      {showPopup && createPortal(
  <div className="mreq-popup-backdrop" 
       onClick={e => e.target === e.currentTarget && setShowPopup(false)}>
    <div className="mreq-popup-box">
      <div className="mreq-popup-title">Add New {placeholder}</div>
      <div className="fg" style={{ marginBottom: 14 }}>
        <label style={{ 
          fontSize: 11.5, fontWeight: 700, 
          color: isDark ? "#c4bdb4" : "#3d3d3d",   // ← adapts
          display: "block", marginBottom: 5 
        }}>Name</label>

        <input
          style={{ 
            fontFamily: "DM Sans, sans-serif", 
            fontSize: 13.5, 
            color: isDark ? "#f0ede8" : "#1a1a1a",           
            background: isDark ? "#2e2b27" : "#f0ede8",  
            border: `1.5px solid ${isDark ? "#3a3733" : "rgba(0,0,0,.12)"}`,
            borderRadius: 8, 
            padding: "9px 12px", 
            outline: "none", 
            width: "100%", 
            boxSizing: "border-box" 
          }}
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          placeholder={`Enter ${placeholder.toLowerCase()}…`}
          autoFocus
          onKeyDown={e => e.key === "Enter" && handleSave()}
        />
      </div>
      <div className="mreq-popup-btns">
        <button
          style={{ flex: 1, background: "linear-gradient(135deg,#6b2d0f,#c8641a)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!newVal.trim() || saving) ? 0.5 : 1 }}
          disabled={!newVal.trim() || saving}
          onClick={handleSave}
        >
          {saving ? "Adding…" : "Add"}
        </button>
        <button
          style={{ 
            flex: 1, 
            background: isDark ? "#2e2b27" : "#fff",
            color: isDark ? "#f0ede8" : "#3d3d3d",            
            border: `1.5px solid ${isDark ? "#3a3733" : "rgba(0,0,0,.12)"}`,
            borderRadius: 8, 
            padding: "10px 18px", 
            fontFamily: "DM Sans, sans-serif", 
            fontSize: 13, fontWeight: 700, cursor: "pointer" 
          }}
          onClick={() => { setShowPopup(false); setNewVal(""); }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
    </>
  );
}
  
// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL REQUIRED
// ═══════════════════════════════════════════════════════════════════════════

function MaterialRequired({ user, showToast, onSubmitted, userSites, site, setSite }) {
  const [materials, setMaterials] = useState([]);
  const [units,     setUnits]     = useState([]);
  const [name, setName] = useState("");
  const [qty,  setQty]  = useState("");
  const [unit, setUnit] = useState("");
  const [staged, setStaged] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [lookupsLoading, setLookupsLoading] = useState(true);

useEffect(() => {
  setLookupsLoading(true);
  Promise.all([dbFetch("dpr_materials"), dbFetch("dpr_units")]).then(([m, u]) => {
    setMaterials(m);
    setUnits(u);
    setLookupsLoading(false);
  });
}, []);
  useEffect(() => {
    dbFetch("dpr_materials").then(setMaterials);
    dbFetch("dpr_units").then(setUnits);
  }, []);

  
  const loadHistory = useCallback(async () => {
    if (!site) { setLoadingHistory(false); return; }
    setLoadingHistory(true);
    const { data } = await supabase
      .from("material_requirements")
      .select("*")
      .eq("site_name", site)
      .order("created_at", { ascending: false })
      .limit(7);
    setHistory(data || []);
    setLoadingHistory(false);
  }, [site]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const addStagedRow = () => {
    if (!name || !qty || !unit || Number(qty) <= 0) return;
    setStaged(p => {
      const dupIdx = p.findIndex(r => r.material.toLowerCase() === name.toLowerCase() && r.unit.toLowerCase() === unit.toLowerCase());
      if (dupIdx >= 0) {
        return p.map((r, i) => i === dupIdx ? { ...r, qty: Number(r.qty) + Number(qty) } : r);
      }
      return [...p, { id: "tmp_" + Date.now(), material: name, qty: Number(qty), unit }];
    });
    setName(""); setQty(""); setUnit("");
  };

  const removeStagedRow = id => setStaged(p => p.filter(r => r.id !== id));
const handleSiteChange = (newSite) => {
  setSite(newSite);
  setStaged([]); 
  setHistory([]);  
};
  const submit = async () => {
    if (!user) { showToast("err", "Login required."); return; }
    if (!site) { showToast("err", "No site linked to your account."); return; }
    if (!staged.length) { showToast("err", "Add at least one material first."); return; }

    setSubmitting(true);
    const payload = staged.map(r => ({
      material_name: r.material,
      unit_name:     r.unit,
      quantity:      r.qty,
      site_name:     site,
      requested_by:  user.name,
      status:        "pending",
    }));

    const { error } = await supabase.from("material_requirements").insert(payload);
    setSubmitting(false);

    if (error) { showToast("err", error.message); return; }

    showToast("ok", "Material requirement submitted successfully.");
    setStaged([]);
    loadHistory();
    onSubmitted?.();
  };

  return (
    <div>
      <div className="grid3" style={{ marginBottom: 12 }}>
        {userSites.length > 1 && (
  <div className="fg" style={{ marginBottom: 16 }}>
    <label className="flabel">Site / Project <span className="req">*</span></label>
    <select
      className="finput"
      value={site}
      onChange={e => setSite(e.target.value)}
    >
      <option value="">Select Site</option>
      {userSites.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  </div>
)}
        <div className="fg">
          <label className="flabel">Material <span className="req">*</span></label>
          {lookupsLoading ? <SkeletonSelect /> : (
            <SelectWithAdd
              value={name}
              onChange={setName}
              options={materials}
              placeholder="Material"
              onAdd={async nm => {
                await dbInsert("dpr_materials", { name: nm });
                setMaterials(await dbFetch("dpr_materials"));
                setName(titleCase(nm));
              }}
            />
          )}
        </div>
        <div className="fg">
          <label className="flabel" >Quantity <span className="req">*</span></label>
          <input className="finput" type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" />
        </div>
        <div className="fg">
          <label className="flabel">Unit <span className="req">*</span></label>
          <SelectWithAdd
            value={unit}
            onChange={setUnit}
            options={units}
            placeholder="Unit"
            onAdd={async nm => {
              await dbInsert("dpr_units", { name: nm });
              setUnits(await dbFetch("dpr_units"));
              setUnit(titleCase(nm));
            }}
          />
        </div>
      </div>

      <button className="btn btn-green btn-sm" onClick={addStagedRow} disabled={!name || !qty || !unit}>
        {Ico.plus} Add to List
      </button>

      {staged.length > 0 && (
        <div className="mreq-item-list">
          {staged.map(r => (
            <div className="mreq-staged-row" key={r.id}>
              <div className="mreq-staged-main">
                <div className="mreq-staged-name">{r.material}</div>
                <div className="mreq-staged-meta">{r.qty} {r.unit}</div>
              </div>
              <button className="mreq-staged-remove" onClick={() => removeStagedRow(r.id)} title="Remove">
                {Ico.x}
              </button>
            </div>
          ))}
        </div>
      )}

      {staged.length > 0 && (
        <div className="act-row">
          <button className="btn btn-orange" onClick={submit} disabled={submitting}>
            {submitting ? <><Spinner /> Submitting…</> : <>{Ico.send} Submit Requirement</>}
          </button>
        </div>
      )}

      {/* Recent history for this site */}
      <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--border2)" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 10 }}>
          Recent Requests — {site || "No Site"}
        </div>

        {loadingHistory ? (
            <div className="mreq-item-list">
              <SkeletonReqCard />
              <SkeletonReqCard />
              <SkeletonReqCard />
            </div>
          ) : !history.length ? (
            <div className="mreq-empty" style={{ padding: "24px 12px" }}>
              {Ico.box}
              <div className="mreq-empty-title">No requests yet</div>
              <div className="mreq-empty-sub">Submitted requirements for this site will appear here.</div>
            </div>
          ) : (
            history.map(r => <MatReqCard key={r.id} r={r} />)
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL RECEIVED — filterable status list with receive action
// ═══════════════════════════════════════════════════════════════════════════
function MaterialReceived({ user, showToast, unseen, onDotSeen, userSites, site, setSite }) {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const allowReceive = canMarkReceived(user);

  const load = useCallback(async () => {
    if (!site) { setLoading(false); return; }
    setLoading(true);
    let q = supabase.from("material_requirements").select("*").eq("site_name", site);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q.order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);

    // Mark only the status(es) actually being viewed as seen — not the whole tab.
    if (site) {
      if (filter === "received") markMaterialSeenForSite(user, site, ["received"]);
      else if (filter === "rejected") markMaterialSeenForSite(user, site, ["rejected"]);
      else if (filter === "all") markMaterialSeenForSite(user, site, ["received", "rejected"]);
      // "pending" carries no badge, so nothing to mark there.
      unseen?.refresh?.();
      onDotSeen?.();
    }
  }, [site, filter]);

  useEffect(() => { load(); }, [load]);

  const markReceived = async id => {
    if (!window.confirm("Mark this material as received?")) return;
    const { error } = await supabase
      .from("material_requirements")
      .update({ status: "received", received_at: new Date().toISOString(), received_by: user.name })
      .eq("id", id);
    if (error) { showToast("err", error.message); return; }
    showToast("ok", "Marked as received.");
    load();
  };
  
   return (
    <div>
      <div className="mreq-filter-row">
        {userSites.length > 1 && (
          <div className="fg" style={{ marginBottom: 16 }}>
            <label className="flabel">Site / Project <span className="req">*</span></label>
            <select
              className="finput"
              value={site}
              onChange={e => setSite(e.target.value)}
            >
              <option value="">Select Site</option>
              {userSites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
               {[
          ["pending","Pending", 0],
          ["received","Received", unseen?.received || 0],
          ["rejected","Rejected", unseen?.rejected || 0],
          ["all","All", (unseen?.received || 0) + (unseen?.rejected || 0)],
        ].map(([key,label,count]) => (
          <button key={key} className={`mreq-chip${filter===key?" act":""}`}
           onClick={() => setFilter(key)}>
            {label}
            {count > 0 && <span className="mreq-badge-sm">{count > 99 ? "99+" : count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div>
          <SkeletonReqCard />
          <SkeletonReqCard />
          <SkeletonReqCard />
          <SkeletonReqCard />
        </div>
      ) : !site ? (
        <div className="mreq-empty">
          {Ico.box}
          <div className="mreq-empty-title">No site linked</div>
          <div className="mreq-empty-sub">Your account isn't assigned to a site yet.</div>
        </div>
      ) : !rows.length ? (
        <div className="mreq-empty">
          {Ico.box}
          <div className="mreq-empty-title">No {filter === "all" ? "" : filter + " "}materials found</div>
          <div className="mreq-empty-sub">Requirements raised for this site will appear here.</div>
        </div>
      ) : (
        rows.map(r => (
          <MatReqCard key={r.id} r={r} showReceiveBtn={allowReceive && r.status === "pending"} onReceive={markReceived} />
        ))
      )}
    </div>
  );
}

// ─── Shared card used in both tabs ───────────────────────────────────────────
function MatReqCard({ r, showReceiveBtn, onReceive }) {
  const status = (r.status || "pending").toLowerCase();
  const isPending  = status === "pending";
  const isRejected = status === "rejected";
  const isReceived = status === "received";

  return (
    <div className={`mreq-rcard${isReceived ? " received" : isRejected ? " rejected" : ""}`}>
      <div className="mreq-rcard-top">
        <div>
          <div className="mreq-rcard-name">{r.material_name}</div>
          <div className="mreq-rcard-qty">{r.quantity} {r.unit_name}</div>
        </div>
        <span className={`badge ${isPending ? "badge-amber" : isRejected ? "badge-red" : "badge-green"}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {isPending ? Ico.pending : isRejected ? Ico.x : Ico.check}
          {isPending ? "Pending" : isRejected ? "Rejected" : "Received"}
        </span>
      </div>
      <div className="mreq-rcard-meta">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{Ico.user} <strong>{r.requested_by}</strong></span>
        {" · "}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{Ico.clock} {fmtDateTime(r.created_at)}</span>
        {isReceived && r.received_at && (
          <><br />Received by <strong>{r.received_by || "—"}</strong> on {fmtDateTime(r.received_at)}</>
        )}
      </div>
      {showReceiveBtn && isPending && (
        <button className="btn btn-green btn-sm mreq-receive-btn" onClick={() => onReceive(r.id)}>
          {Ico.check} Mark as Received
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT 
// ═══════════════════════════════════════════════════════════════════════════
export default function MatRequirement({ user, onDotSeen, onUnseenCount }) {
  const [tab, setTab] = useState("required");
  const [toast, setToast] = useState(null);
  const unseen = useMaterialUnseenCount(user);

  const userSites = Array.isArray(user?.site_names) && user.site_names.length
    ? user.site_names.map(s => titleCase(s))
    : user?.site_name ? [titleCase(user.site_name)] : [];

  const [site, setSite] = useState(userSites[0] || "");

  useEffect(() => { onUnseenCount?.(unseen.total); }, [unseen.total, onUnseenCount]);

  const showToast = (type, msg, dur = 4500) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), dur);
  };

  const openReceivedTab = () => {
    setTab("received");
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="mreq-root">
        <div className="mreq-inner">
          <div className="mreq-tabs">
            <button className={`mreq-tab-btn${tab === "required" ? " act" : ""}`} onClick={() => setTab("required")}>
              {Ico.plus} Material Required
            </button>
            <button className={`mreq-tab-btn${tab === "received" ? " act" : ""}`} onClick={openReceivedTab}>
              {Ico.check} Material Received
              {unseen.total > 0 && <span className="mreq-badge">{unseen.total > 99 ? "99+" : unseen.total}</span>}
            </button>
          </div>

          <div className="mreq-card">
            {tab === "required"
              ? <MaterialRequired user={user} showToast={showToast} onSubmitted={unseen.refresh} userSites={userSites} site={site} setSite={setSite}/>
              : <MaterialReceived user={user} showToast={showToast} unseen={unseen} onDotSeen={onDotSeen} userSites={userSites} site={site} setSite={setSite}/>}
          </div>

          {toast && (
            <div className={`dpr-toast ${toast.type === "ok" ? "dpr-toast-ok" : "dpr-toast-err"}`}>
              {toast.type === "ok" ? Ico.check : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>
              )}
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}