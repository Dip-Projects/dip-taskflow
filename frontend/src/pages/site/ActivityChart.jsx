
import { useState,useRef,useEffect } from "react";
import { supabase } from '../../lib/supabase';





function spline(pts) {
  if (!pts.length) return "";
  const p = pts.map(s => s.split(",").map(Number));
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1];
    const cpx = (x0 + x1) / 2;
    d += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}
function calcScores(chartData) {
  const totalDpr     = chartData.reduce((s, m) => s + (m.dpr  || 0), 0);
  const totalWpr     = chartData.reduce((s, m) => s + (m.wpr  || 0), 0);

  // Working days: use _workDays if present, else approximate (26/month)
  const totalWorkDays = chartData.reduce((s, m) => s + (m._workDays ?? 26), 0);

  // Attendance: use _present/_half if present, else reconstruct from attendPct
  let presentDays = 0, halfDays = 0;
  chartData.forEach(m => {
    if (m._present !== undefined) {
      presentDays += m._present || 0;
      halfDays    += m._half    || 0;
    } else if (m.attendPct !== null && m.attendPct !== undefined) {
      const wd = m._workDays ?? 26;
      presentDays += Math.round((m.attendPct / 100) * wd);
    }
  });

  // ~26 weeks in 6 months
  const totalWeeks = Math.round(chartData.length * 4.33);

  const dpr = Math.min(100, totalWorkDays > 0
    ? Math.round((totalDpr / totalWorkDays) * 100) : 0);
  const wpr = Math.min(100, totalWeeks > 0
    ? Math.round((totalWpr / totalWeeks) * 100) : 0);
  const att = Math.min(100, totalWorkDays > 0
    ? Math.round(((presentDays + halfDays * 0.5) / totalWorkDays) * 100) : 0);
  const total = Math.round(dpr * 0.3 + wpr * 0.2 + att * 0.5);

  return { dpr, wpr, att, total, totalDpr, totalWpr, presentDays, halfDays, totalWorkDays, totalWeeks };
}

function scoreColor(s) {
  if (s >= 80) return "#16a34a";
  if (s >= 60) return "#d97706";
  return "#dc2626";
}
function scoreLabel(s) {
  if (s >= 90) return "Excellent";
  if (s >= 80) return "Good";
  if (s >= 60) return "Average";
  if (s >= 40) return "Below Avg";
  return "Poor";
}

// ── Ring SVG ──────────────────────────────────────────────────────────────────
function Ring({ score, size = 72, stroke = 7, color, label, sub, isMain = false }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track */}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}/>
        {/* progress */}
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray .6s ease" }}/>
        {/* score text */}
        <text x={size/2} y={size/2 - (isMain ? 5 : 3)} textAnchor="middle"
          fontSize={isMain ? 22 : 16} fontWeight={800}
          fill={color} fontFamily="'DM Sans',sans-serif">{score}</text>
        <text x={size/2} y={size/2 + (isMain ? 12 : 9)} textAnchor="middle"
          fontSize={isMain ? 8.5 : 7.5} fill="#94a3b8"
          fontFamily="'DM Sans',sans-serif">/ 100</text>
      </svg>
      {label && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: isMain ? 11 : 10, fontWeight: 700, color: "var(--ink2,#475569)" }}>
            {label}
          </div>
          {sub && (
            <div style={{ fontSize: isMain ? 10 : 9, color, fontWeight: 700 }}>{sub}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PerformanceScore ──────────────────────────────────────────────────────────
export function PerformanceScore({ chartData }) {
  if (!chartData || !chartData.length) return null;
  const sc = calcScores(chartData);
  const tc = scoreColor(sc.total);

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 14,
      height: "100%",
    }}>
      {/* Section label */}
      <div style={{
        fontSize: 10, fontWeight: 800, color: "var(--ink3,#94a3b8)",
        textTransform: "uppercase", letterSpacing: ".1em",
      }}>
        Performance Score
      </div>

      {/* Main ring */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Ring score={sc.total} size={100} stroke={9} color={tc}
          label="Overall Score" sub={scoreLabel(sc.total)} isMain />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--line,#e2e8f0)" }}/>

      {/* Three individual rings */}
      <div style={{ display: "flex", justifyContent: "space-around", gap: 4 }}>
        <Ring score={sc.dpr} size={68} stroke={6} color="#d97706"
          label="DPR" sub={scoreLabel(sc.dpr)}/>
        <Ring score={sc.wpr} size={68} stroke={6} color="#7c3aed"
          label="WPR" sub={scoreLabel(sc.wpr)}/>
        <Ring score={sc.att} size={68} stroke={6} color="#0284c7"
          label="Attendance" sub={scoreLabel(sc.att)}/>
      </div>

      {/* Detail rows */}
      <div style={{
        background: "linear-gradient(135deg,rgba(61,18,0,0.03),rgba(201,106,16,0.05))",
        border: "1px solid var(--amber-line,rgba(201,106,16,0.2))",
        borderRadius: 10, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 5,
        fontSize: 10.5, color: "var(--ink2,#475569)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#d97706", fontWeight: 700 }}>DPR</span>
          <span>{sc.totalDpr} reports / {sc.totalWorkDays} working days</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#7c3aed", fontWeight: 700 }}>WPR</span>
          <span>{sc.totalWpr} reports / ~{sc.totalWeeks} weeks</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#0284c7", fontWeight: 700 }}>Att.</span>
          <span>{sc.presentDays}P + {sc.halfDays}½ / {sc.totalWorkDays} days</span>
        </div>
        {/* <div style={{
          marginTop: 4, paddingTop: 6,
          borderTop: "1px solid rgba(201,106,16,0.15)",
          fontSize: 9.5, color: "#94a3b8", lineHeight: 1.5,
        }}>
          DPR×30% + WPR×20% + Att×50%
        </div> */}
      </div>
    </div>
  );
}

// ── ActivityChart ─────────────────────────────────────────────────────────────
export function ActivityChart({ data, user }) {
  const [hovered,      setHovered]      = useState(null);
  const [drillMonth,   setDrillMonth]   = useState(null);
  const [drillData,    setDrillData]    = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillHovered, setDrillHovered] = useState(null);
  const [cw,           setCw]           = useState(320);
  const rootRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width));
    ro.observe(el);
    setCw(el.getBoundingClientRect().width || 320);
    return () => ro.disconnect();
  }, []);

  if (!data.length) return null;

  // ── All sizes derived from real container width ──────────────────────────
  const mob  = cw < 400;
  const W    = 500;                          // viewBox is always 500 wide
  const SCALE = cw / W;                     // how much SVG is actually scaled
  // We compensate font/dot sizes by dividing by SCALE so they stay readable
  const fs   = (px) => Math.round(px / Math.max(SCALE, 0.55));

  const H    = mob ? 150 : 130;
  const PAD  = { top: 14, right: mob ? 50 : 42, bottom: mob ? 32 : 26, left: mob ? 40 : 32 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;
  

  const DOT    = mob ? 3.5 : 3;
  const DOTH   = mob ? 5   : 4.5;
  const LW     = mob ? 2.2 : 1.8;

  // ── Drill fetch ──────────────────────────────────────────────────────────
  const openDrill = async (d, idx) => {
    const n  = data.length;
    const mo = new Date();
    mo.setDate(1);
    mo.setMonth(mo.getMonth() - (n - 1 - idx));
    const yearMonth = mo.toISOString().slice(0, 7);
    const [y, m]    = yearMonth.split("-").map(Number);
    const lastDay   = new Date(y, m, 0).getDate();
    const from      = `${yearMonth}-01`;
    const to        = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;

    setDrillMonth({ label: d.label, yearMonth });
    setDrillData([]); setDrillLoading(true); setHovered(null);

    const [dprRes, wprRes, attRes] = await Promise.all([
      supabase.from("dpr_reports").select("date")
        .eq("engineer", user.name).eq("report_type", "evening")
        .gte("date", from).lte("date", to),
      supabase.from("wpr_reports").select("created_at")
        .or(`engineer_name.eq.${user.user_name},engineer_name.eq.${user.name}`)
        .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59`),
      supabase.from("attendance").select("date, status")
        .eq("user_name", user.user_name).gte("date", from).lte("date", to),
    ]);

    const days = [];
    for (let dd = 1; dd <= lastDay; dd++) {
      const dateStr   = `${yearMonth}-${String(dd).padStart(2, "0")}`;
      const dayLabel  = new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", weekday: "short" });
      const hasDpr    = (dprRes.data || []).some(r => r.date === dateStr);
      const hasWpr    = (wprRes.data || []).some(r => (r.created_at || "").startsWith(dateStr));
      const attRow    = (attRes.data || []).find(r => r.date === dateStr);
      const attStatus = attRow?.status?.toLowerCase() || null;
      const attVal    = attStatus === "present" ? 1
                      : attStatus === "half day" ? 0.5
                      : attStatus === "absent"   ? 0 : null;
      days.push({ dateStr, dayLabel, hasDpr, hasWpr, attStatus, attVal });
    }
    setDrillData(days); setDrillLoading(false);
  };
  
  const closeDrill = () => { setDrillMonth(null); setDrillData([]); setDrillHovered(null); };
 
  // ── Shared SVG wrapper ───────────────────────────────────────────────────
  const Svg = ({ children, onLeave }) => (
    <svg viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", display: "block", overflow: "visible" }}
      onMouseLeave={onLeave} onTouchEnd={() => setTimeout(onLeave, 1200)}>
      <defs>
        <linearGradient id="acDprG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7a2e00"/>
          <stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
        <linearGradient id="acDprFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d97706" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#d97706" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {children}
    </svg>
  );

  // ── Tooltip box shared ───────────────────────────────────────────────────
  const Tip = ({ cx, by, lines }) => {
    const TW  = mob ? 150 : 116;
    const ROW = mob ? 18  : 14;
    const TH  = ROW * (lines.length + 1) + 8;
    const bx  = Math.min(Math.max(cx - TW / 2, PAD.left), W - PAD.right - TW);
    const fss = fs(mob ? 11 : 9);
    return (
      <g style={{ pointerEvents: "none" }}>
        <rect x={bx} y={by} width={TW} height={TH} rx={7}
          fill="var(--surface,#fff)" stroke="#c96a10" strokeWidth={1.2}
          style={{ filter: "drop-shadow(0 3px 10px rgba(61,18,0,.18))" }}/>
        {lines.map((l, i) => (
          <g key={i}>
            <circle cx={bx + 10} cy={by + ROW * i + ROW + 2} r={mob ? 5 : 3.5} fill={l.color}/>
            <text x={bx + 20} y={by + ROW * i + ROW + 6} fontSize={fss}
              fill="var(--ink2,#475569)" fontFamily="'DM Sans',sans-serif">
              {l.label} <tspan fontWeight={800} fill={l.color}>{l.value}</tspan>
            </text>
          </g>
        ))}
      </g>
    );
  };

  // ── MONTH VIEW ───────────────────────────────────────────────────────────
  const MonthChart = () => {
    const n         = data.length;
    const sharedMax = Math.max(...data.map(d => Math.max(d.dpr || 0, d.wpr || 0)), 1);
    const yTicks = [...new Set([0, Math.round(sharedMax / 2), sharedMax])];
    const xPos = (i) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yPos = (v, max) => PAD.top + innerH - Math.min((v || 0) / max, 1) * innerH;

    const dprPts = data.map((d, i) => `${xPos(i)},${yPos(d.dpr, sharedMax)}`).join(" ");
    const wprPts = data.map((d, i) => `${xPos(i)},${yPos(d.wpr, sharedMax)}`).join(" ");
    const attPts = data.filter(d => d.attendPct !== null)
                       .map(d => `${xPos(data.indexOf(d))},${yPos(d.attendPct, 100)}`).join(" ");

    // Area fill path under DPR line
    const dprAreaPoints = data.map((d, i) => `${xPos(i)},${yPos(d.dpr, sharedMax)}`);
const dprArea = dprAreaPoints.length
  ? `M ${dprAreaPoints[0]} L ${dprAreaPoints.slice(1).join(" L ")} L ${xPos(n - 1)},${PAD.top + innerH} L ${xPos(0)},${PAD.top + innerH} Z`
  : "";

    return (
      <Svg onLeave={() => setHovered(null)}>
        {/* Y grid left */}
        {yTicks.map((t, ti) => {
          const y = yPos(t, sharedMax);
          return (
            <g key={`ytick-${ti}`}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="#e2e8f0" strokeWidth={t === 0 ? 1.2 : 0.6}
                strokeDasharray={t === 0 ? "none" : "3 3"}/>
              <text x={PAD.left - 5} y={y + fs(3.5)} fontSize={fs(mob ? 11 : 8)}
                fill="#94a3b8" textAnchor="end" fontFamily="monospace">{t}</text>
            </g>
          );
        })} 
        {/* Y right (att %) */}
        {[0, 50, 100].map(t => (
          <text key={t} x={W - PAD.right + 5} y={yPos(t, 100) + fs(3.5)}
            fontSize={fs(mob ? 11 : 8)} fill="#c96a10" fontFamily="monospace">{t}%</text>
        ))}

        {/* Lines + fill */}
        {attPts && <polyline points={attPts} fill="none" stroke="#c96a10"
          strokeWidth={LW - 0.3} strokeDasharray="5 3"
          strokeLinecap="round" strokeLinejoin="round"/>}
        <polyline points={wprPts} fill="none" stroke="#a78bfa"
          strokeWidth={LW} strokeLinecap="round" strokeLinejoin="round"/>
        <path d={dprArea} fill="url(#acDprFill)" stroke="none"/>
        <polyline points={dprPts} fill="none" stroke="url(#acDprG)"
          strokeWidth={LW + 0.2} strokeLinecap="round" strokeLinejoin="round"/>

        {/* Dots + hit areas */}
        {data.map((d, i) => {
          const cx  = xPos(i);
          const isH = hovered === i;
          const hitW = innerW / Math.max(n, 1);
          return (

            <g key={i} style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(i)}
              onClick={() => openDrill(d, i)}>
              {/* Wide transparent hit zone */}
              <rect x={cx - hitW / 2} y={PAD.top - 8}
                width={hitW} height={innerH + 28} fill="transparent"/>
              {isH && <line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + innerH}
                stroke="#c96a10" strokeWidth={1.2} strokeDasharray="3 2" strokeOpacity={0.5}/>}

              <circle cx={cx} cy={yPos(d.dpr, sharedMax)} r={isH ? DOTH : DOT}
                fill={isH ? "#d97706" : "#fff"} stroke="#d97706" strokeWidth={mob ? 2.5 : 2}
                style={{ transition: "all .15s" }}/>
              <circle cx={cx} cy={yPos(d.wpr, sharedMax)} r={isH ? DOTH : DOT}
                fill={isH ? "#a78bfa" : "#fff"} stroke="#a78bfa" strokeWidth={mob ? 2.5 : 2}
                style={{ transition: "all .15s" }}/>
              {d.attendPct !== null && (
                <circle cx={cx} cy={yPos(d.attendPct, 100)} r={isH ? DOTH - 1.5 : DOT - 1}
                  fill={isH ? "#c96a10" : "#fff"} stroke="#c96a10" strokeWidth={mob ? 2 : 1.5}
                  style={{ transition: "all .15s" }}/>
              )}

              {/* X-axis label */}
              <text x={cx} y={H - (mob ? 8 : 5)} fontSize={fs(mob ? 12 : 8.5)}
                textAnchor="middle"
                fill={isH ? "#c96a10" : "#94a3b8"}
                fontWeight={isH ? 800 : 500}
                fontFamily="'DM Sans',sans-serif"
                style={{ transition: "fill .15s" }}>
                {d.label}
              </text>

              {/* Tooltip */}
              {isH && (
                <Tip cx={cx} by={PAD.top - (mob ? 6 : 2)} lines={[
                  { color: "#d97706", label: "DPR", value: d.dpr },
                  { color: "#a78bfa", label: "WPR", value: d.wpr },
                  ...(d.attendPct !== null
                    ? [{ color: "#c96a10", label: "Att.", value: `${d.attendPct}%` }]
                    : []),
                ]}/>
              )}
            </g>
          );
        })}
      </Svg>
    );
  };

  // ── DAY VIEW ─────────────────────────────────────────────────────────────
  // const DayChart = () => {
  //   if (drillLoading) return (
  //     <div style={{ height: H, display: "flex", alignItems: "center",
  //       justifyContent: "center", gap: 8, fontSize: 13, color: "#94a3b8" }}>
  //       <div style={{ width: 15, height: 15, borderRadius: "50%",
  //         border: "2px solid #e2e8f0", borderTopColor: "#c96a10",
  //         animation: "spin .7s linear infinite" }}/>
  //       Loading {drillMonth?.label}…
  //     </div>
  //   );
  //   if (!drillData.length) return (
  //     <div style={{ height: H, display: "flex", alignItems: "center",
  //       justifyContent: "center", fontSize: 13, color: "#94a3b8" }}>
  //       No data for this month.
  //     </div>
  //   );

  //   const nd   = drillData.length;
  //   const xPos = (i) => PAD.left + (nd === 1 ? innerW / 2 : (i / (nd - 1)) * innerW);
  //   const yBin = (v) => PAD.top + innerH - v * innerH;
  //   const yAtt = (v) => PAD.top + innerH - v * innerH;

  //   const dprPts = drillData.map((d, i) => `${xPos(i)},${yBin(d.hasDpr ? 1 : 0)}`).join(" ");
  //   const wprPts = drillData.map((d, i) => `${xPos(i)},${yBin(d.hasWpr ? 1 : 0)}`).join(" ");
  //   const attPts = drillData.filter(d => d.attVal !== null)
  //     .map(d => `${xPos(drillData.indexOf(d))},${yAtt(d.attVal)}`).join(" ");

  //   const labelStep = nd <= 8 ? 1 : nd <= 16 ? 2 : mob ? 4 : 3;
  //   const attColor  = (v) => v === 1 ? "#16a34a" : v === 0.5 ? "#d97706" : "#dc2626";

  //   return (
  //     <Svg onLeave={() => setDrillHovered(null)}>
  //       {/* Y left ✓/✗ */}
  //       {[{ v: 1, l: "✓" }, { v: 0, l: "✗" }].map(({ v, l }) => (
  //         <g key={v}>
  //           <line x1={PAD.left} y1={yBin(v)} x2={W - PAD.right} y2={yBin(v)}
  //             stroke="#e2e8f0" strokeWidth={v === 0 ? 1.2 : 0.6}
  //             strokeDasharray={v === 0 ? "none" : "3 3"}/>
  //           <text x={PAD.left - 5} y={yBin(v) + fs(3.5)} fontSize={fs(mob ? 13 : 9)}
  //             fill="#94a3b8" textAnchor="end" fontFamily="monospace">{l}</text>
  //         </g>
  //       ))}
  //       {/* Y right P/½/A */}
  //       {[{ v: 1, l: "P" }, { v: 0.5, l: "½" }, { v: 0, l: "A" }].map(({ v, l }) => (
  //         <text key={l} x={W - PAD.right + 5} y={yAtt(v) + fs(3.5)}
  //           fontSize={fs(mob ? 12 : 8)} fill="#c96a10" fontFamily="monospace">{l}</text>
  //       ))}

  //       {/* Lines */}
  //       {attPts && <polyline points={attPts} fill="none" stroke="#c96a10"
  //         strokeWidth={LW - 0.3} strokeDasharray="5 3"
  //         strokeLinecap="round" strokeLinejoin="round"/>}
  //       <polyline points={wprPts} fill="none" stroke="#a78bfa"
  //         strokeWidth={LW} strokeLinecap="round" strokeLinejoin="round"/>
  //       <polyline points={dprPts} fill="none" stroke="#d97706"
  //         strokeWidth={LW + 0.2} strokeLinecap="round" strokeLinejoin="round"/>

  //       {/* Dots */}
  //       {drillData.map((d, i) => {
  //         const cx   = xPos(i);
  //         const isH  = drillHovered === i;
  //         const dprY = yBin(d.hasDpr ? 1 : 0);
  //         const wprY = yBin(d.hasWpr ? 1 : 0);
  //         const attY = d.attVal !== null ? yAtt(d.attVal) : null;
  //         const hitW = innerW / Math.max(nd, 1);
  //         return (

  //           <g key={i}
  //             onMouseEnter={() => setDrillHovered(i)}
  //             style={{ cursor: "default" }}>
  //             <rect x={cx - hitW / 2} y={PAD.top - 8}
  //               width={hitW} height={innerH + 28} fill="transparent"/>
  //             {isH && <line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + innerH}
  //               stroke="#c96a10" strokeWidth={1.2} strokeDasharray="3 2" strokeOpacity={0.4}/>}

  //             <circle cx={cx} cy={dprY} r={isH ? DOTH : DOT}
  //               fill={d.hasDpr ? "#d97706" : "#fff"} stroke="#d97706"
  //               strokeWidth={mob ? 2.5 : 2} style={{ transition: "all .12s" }}/>
  //             <circle cx={cx} cy={wprY} r={isH ? DOTH : DOT}
  //               fill={d.hasWpr ? "#a78bfa" : "#fff"} stroke="#a78bfa"
  //               strokeWidth={mob ? 2.5 : 2} style={{ transition: "all .12s" }}/>
  //             {attY !== null && (
  //               <circle cx={cx} cy={attY} r={isH ? DOTH - 1.5 : DOT - 1}
  //                 fill={attColor(d.attVal)} stroke="none"
  //                 style={{ transition: "all .12s" }}/>
  //             )}

  //             {i % labelStep === 0 && (
  //               <text x={cx} y={H - (mob ? 8 : 5)} fontSize={fs(mob ? 11 : 8)}
  //                 textAnchor="middle"
  //                 fill={isH ? "#c96a10" : "#94a3b8"}
  //                 fontWeight={isH ? 700 : 400}
  //                 fontFamily="'DM Sans',sans-serif">
  //                 {d.dayLabel}
  //               </text>
  //             )}

  //             {isH && (
  //               <Tip cx={cx} by={PAD.top - (mob ? 6 : 2)} lines={[
  //                 { color: "#d97706", label: "DPR", value: d.hasDpr ? "✓" : "—" },
  //                 { color: "#a78bfa", label: "WPR", value: d.hasWpr ? "✓" : "—" },
  //                 {
  //                   color: d.attVal !== null ? attColor(d.attVal) : "#94a3b8",
  //                   label: "Att.",
  //                   value: d.attStatus
  //                     ? d.attStatus.charAt(0).toUpperCase() + d.attStatus.slice(1)
  //                     : "—",
  //                 },
  //               ]}/>
  //             )}
  //           </g>
  //         );
  //       })}
  //     </Svg>
  //   );
  // };
// ── DAY VIEW ─────────────────────────────────────────────────────────────
  const DayChart = () => {
    const scrollRef = useRef(null);

    if (drillLoading) return (
      <div style={{ height: H, display: "flex", alignItems: "center",
        justifyContent: "center", gap: 8, fontSize: 13, color: "#94a3b8" }}>
        <div style={{ width: 15, height: 15, borderRadius: "50%",
          border: "2px solid #e2e8f0", borderTopColor: "#c96a10",
          animation: "spin .7s linear infinite" }}/>
        Loading {drillMonth?.label}…
      </div>
    );
    if (!drillData.length) return (
      <div style={{ height: H, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 13, color: "#94a3b8" }}>
        No data for this month.
      </div>
    );

    const nd = drillData.length;
    // Each day gets a fixed column — no squishing
    const COL   = mob ? 28 : 22;   // was 36 / 30
    const LPAD  = mob ? 34 : 28;   // was 38 / 32
    const RPAD  = mob ? 24 : 18;   // was 28 / 22
    const TOTAL_W = LPAD + nd * COL + RPAD;

    const xPos  = (i) => LPAD + i * COL + COL / 2;
    const yBin  = (v) => PAD.top + innerH - v * innerH;
    const yAtt  = (v) => PAD.top + innerH - v * innerH;

    const dprPts = drillData.map((d, i) => `${xPos(i)},${yBin(d.hasDpr ? 1 : 0)}`).join(" ");
    const wprPts = drillData.map((d, i) => `${xPos(i)},${yBin(d.hasWpr ? 1 : 0)}`).join(" ");
    const attPts = drillData.filter(d => d.attVal !== null)
      .map(d => `${xPos(drillData.indexOf(d))},${yAtt(d.attVal)}`).join(" ");

    const attColor = (v) => v === 1 ? "#16a34a" : v === 0.5 ? "#d97706" : "#dc2626";

    return (
      <div style={{ position: "relative" }}>
        {/* Fixed left Y-axis — sits above the scroll area */}
        <div style={{ position: "absolute", top: 0, left: 0, zIndex: 2, pointerEvents: "none" }}>
          <svg width={LPAD + 2} height={H} style={{ display: "block" }}>
            {[{ v: 1, l: "✓" }, { v: 0, l: "✗" }].map(({ v, l }) => (
              <text key={v} x={LPAD - 5} y={yBin(v) + 4}
                fontSize={mob ? 13 : 9} fill="#94a3b8"
                textAnchor="end" fontFamily="monospace">{l}</text>
            ))}
          </svg>
        </div>

        {/* Fixed right Y-axis */}
        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 2, pointerEvents: "none" }}>
          <svg width={RPAD + 2} height={H} style={{ display: "block" }}>
            {[{ v: 1, l: "P" }, { v: 0.5, l: "½" }, { v: 0, l: "A" }].map(({ v, l }) => (
              <text key={l} x={4} y={yAtt(v) + 4}
                fontSize={mob ? 12 : 8} fill="#c96a10"
                fontFamily="monospace">{l}</text>
            ))}
          </svg>
        </div>

        {/* Scrollable chart body */}
        <div
          ref={scrollRef}
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            marginLeft: LPAD,
            marginRight: RPAD,
            // hide scrollbar visually on webkit but keep it functional
            scrollbarWidth: "thin",
            scrollbarColor: "#c96a1044 transparent",
            WebkitOverflowScrolling: "touch",
            cursor: "grab",
          }}
          onMouseDown={e => {
            const el = scrollRef.current;
            if (!el) return;
            const startX = e.pageX - el.offsetLeft;
            const scrollL = el.scrollLeft;
            const onMove = (ev) => {
              el.scrollLeft = scrollL - (ev.pageX - el.offsetLeft - startX);
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
              el.style.cursor = "grab";
            };
            el.style.cursor = "grabbing";
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          <svg
            width={TOTAL_W - LPAD - RPAD}
            height={H}
            viewBox={`0 0 ${TOTAL_W - LPAD - RPAD} ${H}`}
            style={{ display: "block", overflow: "visible", minWidth: TOTAL_W - LPAD - RPAD }}
            onMouseLeave={() => setDrillHovered(null)}
          >
            {/* Grid lines */}
            {[{ v: 1, label: "" }, { v: 0, label: "" }].map(({ v }) => (
              <line key={v}
                x1={0} y1={yBin(v)}
                x2={TOTAL_W - LPAD - RPAD} y2={yBin(v)}
                stroke="#e2e8f0"
                strokeWidth={v === 0 ? 1.2 : 0.6}
                strokeDasharray={v === 0 ? "none" : "3 3"}/>
            ))}
            {/* Half-day grid line */}
            <line x1={0} y1={yBin(0.5)} x2={TOTAL_W - LPAD - RPAD} y2={yBin(0.5)}
              stroke="#e2e8f0" strokeWidth={0.4} strokeDasharray="2 4"/>

            {/* Lines */}
            {attPts && <polyline points={attPts} fill="none" stroke="#c96a10"
              strokeWidth={LW - 0.3} strokeDasharray="5 3"
              strokeLinecap="round" strokeLinejoin="round"/>}
            <polyline points={wprPts} fill="none" stroke="#a78bfa"
              strokeWidth={LW} strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points={dprPts} fill="none" stroke="#d97706"
              strokeWidth={LW + 0.2} strokeLinecap="round" strokeLinejoin="round"/>

            {/* Dots + labels + tooltips */}
            {drillData.map((d, i) => {
              const cx   = xPos(i);
              const isH  = drillHovered === i;
              const dprY = yBin(d.hasDpr ? 1 : 0);
              const wprY = yBin(d.hasWpr ? 1 : 0);
              const attY = d.attVal !== null ? yAtt(d.attVal) : null;
              const hitW = COL;
              const TW   = mob ? 140 : 110;
              const ROW  = mob ? 17 : 13;
              const TH   = ROW * 3 + 10;
              // keep tooltip inside svg bounds
              const tipX = Math.min(Math.max(cx - TW / 2, 0), TOTAL_W - LPAD - RPAD - TW);

              return (
                <g key={i}
                  onMouseEnter={() => setDrillHovered(i)}
                  style={{ cursor: "default" }}>

                  {/* Hit zone */}
                  <rect x={cx - hitW / 2} y={PAD.top - 8}
                    width={hitW} height={innerH + 28} fill="transparent"/>

                  {/* Crosshair */}
                  {isH && <line x1={cx} y1={PAD.top} x2={cx} y2={PAD.top + innerH}
                    stroke="#c96a10" strokeWidth={1.2} strokeDasharray="3 2" strokeOpacity={0.4}/>}

                  {/* DPR dot */}
                  <circle cx={cx} cy={dprY} r={isH ? DOTH : DOT}
                    fill={d.hasDpr ? "#d97706" : "#fff"} stroke="#d97706"
                    strokeWidth={mob ? 2.5 : 2} style={{ transition: "all .12s" }}/>

                  {/* WPR dot */}
                  <circle cx={cx} cy={wprY} r={isH ? DOTH : DOT}
                    fill={d.hasWpr ? "#a78bfa" : "#fff"} stroke="#a78bfa"
                    strokeWidth={mob ? 2.5 : 2} style={{ transition: "all .12s" }}/>

                  {/* Attendance dot */}
                  {attY !== null && (
                    <circle cx={cx} cy={attY} r={isH ? DOTH - 1.5 : DOT - 1}
                      fill={attColor(d.attVal)} stroke="none"
                      style={{ transition: "all .12s" }}/>
                  )}

                  {/* Day label — every day, rotated 45° so nothing overlaps */}
                  <text
                    x={cx} y={PAD.top + innerH + (mob ? 16 : 13)}   // was H - (mob ? 4 : 3)
                    fontSize={mob ? 9 : 7.5}                         // slightly smaller too
                    textAnchor="end"
                    fill={isH ? "#c96a10" : "#94a3b8"}
                    fontWeight={isH ? 700 : 400}
                    fontFamily="'DM Sans',sans-serif"
                    transform={`rotate(-40, ${cx}, ${PAD.top + innerH + (mob ? 16 : 13)})`}
                    style={{ transition: "fill .15s" }}>
                    {d.dayLabel}
                  </text>

                  {/* Tooltip */}
                  {isH && (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={tipX} y={PAD.top - 4} width={TW} height={TH} rx={7}
                        fill="var(--surface,#fff)" stroke="#c96a10" strokeWidth={1.2}
                        style={{ filter: "drop-shadow(0 3px 8px rgba(61,18,0,.15))" }}/>
                      {[
                        { color: "#d97706", label: "DPR", value: d.hasDpr ? "✓" : "—" },
                        { color: "#a78bfa", label: "WPR", value: d.hasWpr ? "✓" : "—" },
                        {
                          color: d.attVal !== null ? attColor(d.attVal) : "#94a3b8",
                          label: "Att.",
                          value: d.attStatus
                            ? d.attStatus.charAt(0).toUpperCase() + d.attStatus.slice(1)
                            : "—",
                        },
                      ].map((l, li) => (
                        <g key={li}>
                          <circle cx={tipX + 10} cy={PAD.top + ROW * li + ROW - 2} r={mob ? 4 : 3}
                            fill={l.color}/>
                          <text x={tipX + 20} y={PAD.top + ROW * li + ROW + 2}
                            fontSize={mob ? 11 : 9}
                            fill="var(--ink2,#475569)"
                            fontFamily="'DM Sans',sans-serif">
                            {l.label} <tspan fontWeight={800} fill={l.color}>{l.value}</tspan>
                          </text>
                        </g>
                      ))}
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Scroll hint — fades after first interaction */}
        <div style={{
          textAlign: "center", fontSize: mob ? 11 : 10,
          color: "#c96a1099", marginTop: 2, letterSpacing: ".02em",
        }}>
          ← scroll to see all days →
        </div>
      </div>
    );
  };
  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 26 }}>
        {drillMonth ? (
          <>
            <button onClick={closeDrill} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "none", border: "1px solid var(--line,#e2e8f0)",
              borderRadius: 6, padding: mob ? "5px 12px" : "3px 10px",
              cursor: "pointer", fontSize: mob ? 13 : 11,
              fontWeight: 700, color: "#7a2e00",
              fontFamily: "'DM Sans',sans-serif",
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              6 Months
            </button>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span style={{ fontSize: mob ? 13 : 11.5, fontWeight: 700, color: "#c96a10" }}>
              {drillMonth.label}
            </span>
          </>
        ) : (
          <span style={{ fontSize: mob ? 12 : 10.5, fontWeight: 600, color: "#94a3b8" }}>
            {mob ? "Tap a month to drill down ↓" : "Click a month · see day-wise breakdown"}
          </span>
        )}
      </div>

      {/* Chart card */}
      {drillMonth ? <DayChart /> : <MonthChart />}

      {/* Chart Layout */}
      
      {/* Legend */}
      <div style={{ display: "flex", gap: mob ? 12 : 14,
        justifyContent: "center", flexWrap: "wrap" }}>
        {[
          { color: "#d97706", label: "DPR",   dash: false },
          { color: "#a78bfa", label: "WPR",   dash: false },
          { color: "#c96a10", label: drillMonth ? "Att. (P/½/A)" : "Attendance %", dash: true },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5,
            fontSize: mob ? 12.5 : 11, fontWeight: 600, color: "var(--ink2,#475569)" }}>
            <svg width={22} height={9}>
              <line x1={0} y1={4.5} x2={22} y2={4.5} stroke={l.color} strokeWidth={2.2}
                strokeDasharray={l.dash ? "5 2" : "none"} strokeLinecap="round"/>
            </svg>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}