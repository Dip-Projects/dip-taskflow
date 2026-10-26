import { useState, useEffect } from "react";

import { ActivityChart, PerformanceScore } from "./ActivityChart";
import { computeMonthlyLeaveBalance, isMonthlyLeaveRole } from "./leaveUtils.js";
import "./Profile.css";
import { supabase, supabaseUrl, supabaseAnonKey, fromMaybe } from '../../lib/supabase';



const fmtD = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

function getInitials(name = "") {
  return name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["#d97706","#7c3aed","#0284c7","#16a34a","#dc2626","#0891b2"];
function avatarColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Leave type colours ──────────────────────────────────────────────────────
const LEAVE_COLORS = {
  "Casual Leave":       { bg:"#fffbeb", border:"#fde68a", color:"#b45309" },
  "Sick Leave":         { bg:"#fef2f2", border:"#fecaca", color:"#dc2626" },
  "Earned Leave":       { bg:"#f0fdf4", border:"#bbf7d0", color:"#15803d" },
  "Maternity Leave":    { bg:"#fdf4ff", border:"#e9d5ff", color:"#7e22ce" },
  "Paternity Leave":    { bg:"#eff6ff", border:"#bfdbfe", color:"#1d4ed8" },
  "Compensatory Leave": { bg:"#fff7ed", border:"#fed7aa", color:"#c2410c" },
  "Unpaid Leave":       { bg:"#f8fafc", border:"#e2e8f0", color:"#475569" },
};
function leaveColor(type) {
  return LEAVE_COLORS[type] || { bg:"#f8fafc", border:"#e2e8f0", color:"#475569" };
}

// ── Leave type quota defaults ───────────────────────────────────────────────
const LEAVE_QUOTA = {
  "Casual Leave": 12,
  "Sick Leave": 8,
  "Earned Leave": 15,
  "Maternity Leave": 90,
  "Paternity Leave": 5,
  "Compensatory Leave": 5,
  "Unpaid Leave": 999,
};

export default function Profile({ user, onLogout, onThemeToggle, isDark }) {
  const [stats, setStats] = useState({ dpr: 0, wpr: 0, svr: 0, thisMonth: 0, lastDate: null });
  const [loading, setLoading] = useState(true);
  const [freshRole, setFreshRole] = useState(user?.role || "");
  const [freshName, setFreshName] = useState(user?.name || "");
  const [freshDepartment, setFreshDepartment] = useState(user?.department || "");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [chartData, setChartData] = useState([]);
const [monthlyBalance, setMonthlyBalance] = useState(null);
  // ── New state ──────────────────────────────────────────────────────────────
  const [streak, setStreak]           = useState({ current: 0, longest: 0 });
  const [bestMonth, setBestMonth]     = useState(null);   // { label, count }
  const [leaveBalance, setLeaveBalance] = useState([]);   // [{ type, used, quota }]
  const [upcomingLeaves, setUpcomingLeaves] = useState([]); // approved future leaves

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // Fetch fresh user details
      const { data: freshUser } = await supabase
        .from("site_user_details")
        .select("site_name, site_names, role, name, department")
        .eq("id", user.id)
        .single();
      if (freshUser) {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        const updated = {
          ...stored,
          site_name:  freshUser.site_name  ?? stored.site_name,
          site_names: freshUser.site_names ?? (stored.site_name ? [stored.site_name] : []),
          role:       freshUser.role       ?? stored.role,
          name:       freshUser.name       ?? stored.name,
          department: freshUser.department ?? stored.department,
        };
        localStorage.setItem("user", JSON.stringify(updated));
        setFreshRole(freshUser.role || user?.role || "");
        setFreshName(freshUser.name || user?.name || "");
        setFreshDepartment(freshUser.department || user?.department || ""); 
        user = { ...user, ...updated };
      }

      const thisMonthStr = new Date().toISOString().slice(0, 7);

      // ── DPR ──
      const { data: dprData } = await supabase
        .from("dpr_reports")
        .select("id, report_type, date, created_at")
        .eq("engineer", user.name)
        .in("report_type", ["evening", "morning"])
        .order("date", { ascending: false });

      const dprRows   = dprData || [];
      const dpr       = dprRows.length;
      const thisMonth = dprRows.filter(r => (r.date || "").startsWith(thisMonthStr)).length;
      const lastDate  = dprRows[0]?.date || null;

      // ── WPR ──
      const { data: wprData } = await supabase
        .from("wpr_reports")
        .select("id")
        .or(`engineer_name.eq.${user.user_name},engineer_name.eq.${user.name}`);
      const wpr = (wprData || []).length;

      // ── SVR ──
      const { data: svrData } = await supabase
        .from("site_reports")
        .select("id")
        .or(`submitted_by.eq.${user.user_name},submitted_by_name.eq.${user.name}`);
      const svr = (svrData || []).length;

      setStats({ dpr, wpr, svr, thisMonth, lastDate });

      // ────────────────────────────────────────────────────────────────────────
      // ── STREAK CALCULATION ──────────────────────────────────────────────────
      // Use evening reports only; get unique dates, sorted descending
      const eveningDates = [
        ...new Set(
          dprRows
            .filter(r => r.report_type === "evening")
            .map(r => r.date)
            .filter(Boolean)
        ),
      ].sort((a, b) => b.localeCompare(a));

      const dateSet = new Set(eveningDates);

      // Helper: is a date string a working day (Mon–Sat)?
      const isWorkDay = (dateStr) => {
        const day = new Date(dateStr + "T00:00:00").getDay();
        return day !== 0; // exclude Sunday
      };

      // Current streak: walk backwards from today
      let currentStreak = 0;
      const todayStr = new Date().toISOString().slice(0, 10);
      let cursor = new Date(todayStr + "T00:00:00");

      // If today's report not submitted yet, start from yesterday
      if (!dateSet.has(todayStr)) cursor.setDate(cursor.getDate() - 1);

      while (true) {
        const ds = cursor.toISOString().slice(0, 10);
        if (!isWorkDay(ds)) { cursor.setDate(cursor.getDate() - 1); continue; }
        if (dateSet.has(ds)) { currentStreak++; cursor.setDate(cursor.getDate() - 1); }
        else break;
        if (currentStreak > 365) break; // safety cap
      }

      // Longest streak: iterate through all dates
      let longest = 0, run = 0;
      let prev = null;
      [...eveningDates].reverse().forEach(ds => {
        if (!isWorkDay(ds)) return;
        if (!prev) { run = 1; }
        else {
          // Check if prev and ds are consecutive working days
          const a = new Date(prev + "T00:00:00");
          const b = new Date(ds + "T00:00:00");
          const diff = Math.round((b - a) / 86400000);
          // Allow 1-day gaps for Sundays (Sat→Mon = 2 days)
          if (diff === 1 || (diff === 2 && new Date(prev + "T00:00:00").getDay() === 6)) {
            run++;
          } else {
            run = 1;
          }
        }
        prev = ds;
        if (run > longest) longest = run;
      });
      setStreak({ current: currentStreak, longest });
 
      // ────────────────────────────────────────────────────────────────────────
      // ── BEST MONTH ──────────────────────────────────────────────────────────
      const monthMap = {};
      dprRows
        .filter(r => r.report_type === "evening")
        .forEach(r => {
          const mo = (r.date || "").slice(0, 7);
          if (!mo) return;
          monthMap[mo] = (monthMap[mo] || 0) + 1;
        });
      if (Object.keys(monthMap).length > 0) {
        const bestMo = Object.entries(monthMap).sort((a, b) => b[1] - a[1])[0];
        const label = new Date(bestMo[0] + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        setBestMonth({ label, count: bestMo[1], month: bestMo[0] });
      }

      // ────────────────────────────────────────────────────────────────────────
      // ── LEAVE BALANCE + UPCOMING APPROVED LEAVES ────────────────────────────
      const { data: allLeaves } = await fromMaybe('site_leaves', (q) =>
        q
          .select('*')
          .eq('user_name', user.user_name)
          .order('from_date', { ascending: true })
      );

      const leaves = allLeaves || [];
      const todayDate = new Date().toISOString().slice(0, 10);

      // Upcoming: approved leaves starting today or later
      const upcoming = leaves.filter(l => {
        const approved =
          l.proxy_approved === true ||
          (l.status || "").toLowerCase() === "approved";
        return approved && l.from_date >= todayDate;
      });
      setUpcomingLeaves(upcoming);

      // Leave balance: group approved + pending leaves by type
      const usedMap = {};
      leaves
        .filter(l => {
          const s = (l.status || "").toLowerCase();
          return s === "approved" || s === "pending" || l.proxy_approved === true;
        })
        .forEach(l => {
          const days =
            l.from_date && l.to_date
              ? Math.ceil((new Date(l.to_date) - new Date(l.from_date)) / 86400000) + 1
              : 1;
          usedMap[l.leave_type] = (usedMap[l.leave_type] || 0) + days;
        });

      const balance = Object.entries(LEAVE_QUOTA)
        .filter(([type]) => type !== "Unpaid Leave")
        .map(([type, quota]) => ({
          type,
          used: usedMap[type] || 0,
          quota,
          remaining: Math.max(0, quota - (usedMap[type] || 0)),
        }))
        .filter(b => b.used > 0 || b.quota <= 15); // show used or common ones
      setLeaveBalance(balance);
      if (isMonthlyLeaveRole(user)) {
        const thisMonth = new Date().toISOString().slice(0, 7);
        const mb = await computeMonthlyLeaveBalance(supabase, user, thisMonth);
        setMonthlyBalance(mb);
      }
      // ── Chart (6 months) ──
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        months.push(d.toISOString().slice(0, 7));
      }

      function monthRange(yearMonth) {
        const [y, m] = yearMonth.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, "0")}` };
      }

      const firstMonth = months[0];
      const lastMonth  = months[5];
      const { from: rangeFrom } = monthRange(firstMonth);
      const { to:   rangeTo   } = monthRange(lastMonth);

      const [dprMonthly, wprMonthly, attendMonthly] = await Promise.all([
        supabase.from("dpr_reports").select("date, report_type").eq("engineer", user.name).eq("report_type", "evening").gte("date", rangeFrom).lte("date", rangeTo),
        supabase.from("wpr_reports").select("created_at").or(`engineer_name.eq.${user.user_name},engineer_name.eq.${user.name}`).gte("created_at", `${rangeFrom}T00:00:00`).lte("created_at", `${rangeTo}T23:59:59`),
        supabase.from("attendance").select("date, status").eq("user_name", user.user_name).gte("date", rangeFrom).lte("date", rangeTo),
      ]);

      function workingDaysInMonth(yearMonth) {
        const [y, m] = yearMonth.split("-").map(Number);
        const days = new Date(y, m, 0).getDate();
        let count = 0;
        for (let d = 1; d <= days; d++) {
          if (new Date(y, m - 1, d).getDay() !== 0) count++;
        }
        return count;
      }

      const chart = months.map(mo => {
        const label = new Date(mo + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        const dprCount = (dprMonthly.data || []).filter(r => (r.date || "").startsWith(mo)).length;
        const wprCount = (wprMonthly.data || []).filter(r => (r.created_at || "").slice(0, 7) === mo).length;
        const attendRows  = (attendMonthly.data || []).filter(r => (r.date || "").startsWith(mo));
        const presentDays = attendRows.filter(r => (r.status || "").toLowerCase() === "present").length;
        const halfDays    = attendRows.filter(r => (r.status || "").toLowerCase() === "half day").length;
        const totalWorkDays = workingDaysInMonth(mo);
        const attendPct = attendRows.length > 0
          ? Math.round(((presentDays + halfDays * 0.5) / totalWorkDays) * 100)
          : null;
        return { label, dpr: dprCount, wpr: wprCount, attendPct, _workDays: totalWorkDays, _present: presentDays, _half: halfDays };
      });

      setChartData(chart);
      setLoading(false);
    })();
  }, [user]);

  const initials = getInitials(freshName || user?.name || "");
  const bgColor  = avatarColor(freshName || user?.name || "");
  
  // ── Streak badge colour ──────────────────────────────────────────────────
  const streakColor =
    streak.current >= 14 ? "#15803d" :
    streak.current >= 7  ? "#d97706" :
    streak.current >= 3  ? "#2563eb" : "#64748b";

  const streakBg =
    streak.current >= 14 ? "#f0fdf4" :
    streak.current >= 7  ? "#fffbeb" :
    streak.current >= 3  ? "#eff6ff" : "#f8fafc";

  return (
    
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Top: Avatar + Identity ── */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 14, padding: "28px 20px 24px",
        background: "var(--paper)", borderRadius: 14,
        border: "1px solid var(--line)"
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: bgColor, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 28, fontWeight: 800,
          color: "#fff", letterSpacing: 1, flexShrink: 0,
          boxShadow: `0 0 0 4px ${bgColor}33`
        }}>
          {initials}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>{freshName || user?.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
            {freshRole || user?.role || "Site Engineer"}
          </div>
          <div style={{
            marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--amber-bg)", border: "1px solid var(--amber-line)",
            borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 700, color: "var(--amber2)"
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            {user?.site_names?.length ? user.site_names.join("  |  ").toUpperCase() : (user?.site_name || "No Site Assigned").toUpperCase()}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
          {user?.user_name && (
            <span style={{ fontSize: 11.5, background: "var(--surface)", border: "1px solid var(--line2)", borderRadius: 8, padding: "4px 10px", color: "var(--ink2)", fontWeight: 600 }}>
              @{user.user_name}
            </span>
          )}
          {user?.email && (
            <span style={{ fontSize: 11.5, background: "var(--surface)", border: "1px solid var(--line2)", borderRadius: 8, padding: "4px 10px", color: "var(--ink2)", fontWeight: 600 }}>
              {user.email}
            </span>
          )}
        </div>
      </div>

      {/* ── Report Stats ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Report Statistics
        </div>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink3)", fontSize: 13 }}>
            <div className="spinner" /> Loading stats…
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 10 }}>
              {[
                { label: "DPR Reports",    value: stats.dpr, bg: "#fffbeb", border: "#fde68a", valColor: "#b45309", lblColor: "#92400e" },
                { label: "Weekly Reports", value: stats.wpr, bg: "#f5f3ff", border: "#ddd6fe", valColor: "#6d28d9", lblColor: "#5b21b6" },
                { label: "Site Visit",     value: stats.svr, bg: "#eff6ff", border: "#bfdbfe", valColor: "#1d4ed8", lblColor: "#1e40af" },
              ].map(s => (
                <div key={s.label} style={{
                  background: s.bg, border: `1px solid ${s.border}`,
                  borderRadius: 12, padding: "14px 10px", textAlign: "center"
                }}>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--mono)", color: s.valColor, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: s.lblColor, marginTop: 5, letterSpacing: ".02em" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--mono)", color: "#15803d", lineHeight: 1 }}>{stats.thisMonth}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#166534", marginTop: 5 }}>This Month</div>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", lineHeight: 1.3 }}>
                  {stats.lastDate ? fmtD(stats.lastDate) : "—"}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", marginTop: 5 }}>Last Submitted</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Streak + Best Month ── */}
      {!loading && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
            DPR Consistency
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

            {/* Current streak */}
            <div style={{
              background: streakBg,
              border: `2px solid ${streakColor}55`,
              borderRadius: 14, padding: "16px 14px",
              display: "flex", flexDirection: "column", gap: 6,
              position: "relative", overflow: "hidden",
              animation: "flameGlow 2.2s ease-in-out infinite",
            }}>
              {/* bg fire shimmer */}
              <div style={{ position: "absolute", right: -4, top: -4, fontSize: 52, userSelect: "none", animation: "bgShimmer 2.2s ease-in-out infinite" }}>🔥</div>

              {/* rising sparks */}
              {[
                { top: 18, left: 38, size: 13, color: streakColor, delay: "0.1s", dur: "1.8s", char: "✦" },
                { top: 10, left: 60, size: 10, color: "#f59e0b",   delay: "0.7s", dur: "2s",   char: "★" },
                { top: 22, right: 42, size: 11, color: "#fbbf24",  delay: "0.3s", dur: "1.6s", char: "✦" },
                { top:  8, right: 64, size:  9, color: "#f97316",  delay: "1.1s", dur: "2.2s", char: "●" },
                { top: 30, left: 22, size:  8, color: "#ef4444",   delay: "0.5s", dur: "1.4s", char: "▲" },
              ].map((s, i) => (
                <span key={i} style={{
                  position: "absolute",
                  top: s.top, left: s.left, right: s.right,
                  fontSize: s.size, color: s.color,
                  animation: `sparkRise ${s.dur} ease-in-out infinite ${s.delay}`,
                  pointerEvents: "none",
                }}>{s.char}</span>
              ))}

              <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 18, display: "inline-block", animation: "flameSway 1.4s ease-in-out infinite", transformOrigin: "bottom center" }}>🔥</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: streakColor, textTransform: "uppercase", letterSpacing: ".06em" }}>Current Streak</span>
              </div>

              <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "var(--mono)", color: streakColor, lineHeight: 1, animation: "floatBob 3s ease-in-out infinite", position: "relative", zIndex: 1 }}>
                {streak.current}
                <span style={{ fontSize: 14, fontWeight: 600, color: streakColor, opacity: 0.7 }}> days</span>
              </div>

              <div style={{ fontSize: 11, color: streakColor, fontWeight: 600, position: "relative", zIndex: 1 }}>
                Best: <strong style={{ color: streakColor }}>{streak.longest} days</strong>
              </div>
            </div>

            {/* Best month */}
            <div style={{
              background: "#fdf4ff",
              border: "2px solid #e9d5ff",
              borderRadius: 14, padding: "16px 14px",
              display: "flex", flexDirection: "column", gap: 6,
              position: "relative", overflow: "hidden",
              animation: "trophyGlow 2.5s ease-in-out infinite 0.4s",
            }}>
              {/* bg trophy shimmer */}
              <div style={{ position: "absolute", right: -4, top: -4, fontSize: 52, userSelect: "none", animation: "bgShimmer 2.5s ease-in-out infinite 0.4s" }}>🏆</div>

              {/* confetti */}
              {[
                { top:  6, left: 18,  size: 9, color: "#a855f7", delay: "0.2s", dur: "2.1s", char: "■" },
                { top:  4, left: 40,  size: 7, color: "#ec4899", delay: "0.8s", dur: "1.9s", char: "●" },
                { top:  8, left: 62,  size: 8, color: "#8b5cf6", delay: "0.1s", dur: "2.4s", char: "▲" },
                { top:  5, right: 50, size: 7, color: "#c026d3", delay: "0.6s", dur: "2.0s", char: "■" },
                { top:  3, right: 30, size: 9, color: "#7c3aed", delay: "1.2s", dur: "1.8s", char: "●" },
                { top: 10, right: 72, size: 8, color: "#a21caf", delay: "0.4s", dur: "2.2s", char: "★" },
              ].map((c, i) => (
                <span key={i} style={{
                  position: "absolute",
                  top: c.top, left: c.left, right: c.right,
                  fontSize: c.size, color: c.color,
                  animation: `confettiFall ${c.dur} ease-in infinite ${c.delay}`,
                  pointerEvents: "none",
                }}>{c.char}</span>
              ))}

              {/* star pops */}
              <span style={{ position: "absolute", top: 20, left: 28, fontSize: 12, color: "#a855f7", animation: "starPop 2.4s ease-in-out infinite 0.3s", pointerEvents: "none" }}>✦</span>
              <span style={{ position: "absolute", top: 14, right: 38, fontSize: 10, color: "#c026d3", animation: "starPop 2s ease-in-out infinite 1s", pointerEvents: "none" }}>★</span>

              <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 18, display: "inline-block", animation: "floatBob 2.8s ease-in-out infinite" }}>🏆</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: "#7e22ce", textTransform: "uppercase", letterSpacing: ".06em" }}>Best Month</span>
              </div>

              {bestMonth ? (
                <>
                  <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "var(--mono)", color: "#7e22ce", lineHeight: 1, animation: "floatBob 3.2s ease-in-out infinite 0.4s", position: "relative", zIndex: 1 }}>
                    {bestMonth.count}
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#7e22ce", opacity: 0.7 }}> DPRs</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9333ea", fontWeight: 600, position: "relative", zIndex: 1 }}>{bestMonth.label}</div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ink3)", fontWeight: 500, marginTop: 6 }}>No data yet</div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Activity Chart ── */}
      {chartData.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
            Activity — Last 6 Months
          </div>
          <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" }}>
            <div style={{ flex: "1 1 55%", minWidth: "min(100%, 260px)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 12px 12px", boxSizing: "border-box" }}>
              <ActivityChart data={chartData} user={user} />
            </div>
            {/* <div style={{ flex: "1 1 35%", minWidth: "min(100%, 200px)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "16px 14px", boxSizing: "border-box" }}>
              <PerformanceScore chartData={chartData} />
            </div> */}
          </div>
        </div>
      )}

      {/* ── Monthly Leave Balance (Site Engineer) ── */}
  {!loading && isMonthlyLeaveRole({ role: freshRole || user?.role, department: freshDepartment || user?.department }) && monthlyBalance && (
  <div>
    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
      Monthly Leave Balance
    </div>
    <div style={{
      background: monthlyBalance.remaining > 0 ? "#f0fdf4" : "#fef2f2",
      border: `1px solid ${monthlyBalance.remaining > 0 ? "#bbf7d0" : "#fecaca"}`,
      borderRadius: 12, padding: "14px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#000000" }}>Available this month</div>
        {/* ← REPLACED sub-text goes here */}
        <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 2 }}>
          {monthlyBalance.broughtForward} carried over + {monthlyBalance.quotaPerMonth} this month − {monthlyBalance.thisMonthUsed} used · unused days roll over
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--mono)", color: monthlyBalance.remaining > 0 ? "#15803d" : "#dc2626" }}>
        {monthlyBalance.remaining}
      </div>
    </div>
  </div>
)}

      {/* ── Upcoming Leaves ── */}
      {!loading && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
            Upcoming Approved Leaves
          </div>
          {upcomingLeaves.length === 0 ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "var(--paper)", border: "1px solid var(--line)",
              borderRadius: 12, padding: "14px 16px",
              fontSize: 13, color: "var(--ink3)", fontWeight: 500
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              No upcoming approved leaves
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {upcomingLeaves.map(l => {
                const c = leaveColor(l.leave_type);
                const days = l.from_date && l.to_date
                  ? Math.ceil((new Date(l.to_date) - new Date(l.from_date)) / 86400000) + 1
                  : 1;
                // Days until leave
                const daysUntil = Math.ceil(
                  (new Date(l.from_date + "T00:00:00") - new Date()) / 86400000
                );
                return (
                  <div key={l.id} style={{
                    background: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: 12, padding: "14px 16px",
                    display: "flex", alignItems: "center", gap: 14
                  }}>
                    {/* Date block */}
                    <div style={{
                      flexShrink: 0, width: 48, height: 48, borderRadius: 10,
                      background: c.color, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", color: "#fff"
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>
                        {new Date(l.from_date + "T00:00:00").getDate()}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
                        {new Date(l.from_date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: c.color }}>{l.leave_type}</div>
                      <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 2 }}>
                        {fmtD(l.from_date)} → {fmtD(l.to_date)}
                        <span style={{ marginLeft: 6, fontWeight: 700 }}>· {days} day{days > 1 ? "s" : ""}</span>
                      </div>
                      {l.reason && (
                        <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 3, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          "{l.reason}"
                        </div>
                      )}
                    </div>

                    {/* Countdown chip */}
                    <div style={{
                      flexShrink: 0, textAlign: "center",
                      background: "#fff", border: `1px solid ${c.border}`,
                      borderRadius: 10, padding: "6px 10px"
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "var(--mono)", color: c.color, lineHeight: 1 }}>
                        {daysUntil <= 0 ? "Today" : daysUntil}
                      </div>
                      {daysUntil > 0 && (
                        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".04em", marginTop: 2 }}>days away</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Account Actions ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Account
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>

          {/* Theme toggle */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", background: "var(--paper)", border: "1px solid var(--line)",
            borderRadius: 10, cursor: "pointer"
          }} onClick={onThemeToggle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, color: "var(--ink2)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {isDark
                  ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
                  : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                }
              </svg>
              {isDark ? "Light Mode" : "Dark Mode"}
            </div>
            <div style={{
              width: 38, height: 21, borderRadius: 11, background: isDark ? "var(--amber)" : "var(--line2)",
              position: "relative", transition: "background .25s", flexShrink: 0
            }}>
              <div style={{
                width: 15, height: 15, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: isDark ? 20 : 3,
                transition: "left .25s", boxShadow: "0 1px 3px rgba(0,0,0,.25)"
              }}/>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => setShowLogoutModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", background: "#fef2f2",
              border: "1px solid #fecaca", borderRadius: 10,
              cursor: "pointer", fontSize: 13.5, fontWeight: 700,
              color: "#dc2626", width: "100%", textAlign: "left"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </div>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutModal && (
        <div
          onClick={() => setShowLogoutModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(15,10,5,0.65)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, animation: "nbFadeIn .18s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              border: "1.5px solid #c96a10",
              borderRadius: 18, padding: "32px 28px 24px",
              maxWidth: 360, width: "100%",
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 10, textAlign: "center",
              boxShadow: "0 16px 48px rgba(61,18,0,0.25)",
              animation: "nbSlideUp .2s ease",
            }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>Sign Out?</div>
            <div style={{ fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.6 }}>
              You'll be returned to the login screen. Any unsaved changes will be lost.
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", width: "100%", margin: "4px 0",
              background: "linear-gradient(135deg,rgba(61,18,0,0.06),rgba(201,106,16,0.08))",
              border: "1px solid #c96a10", borderRadius: 10,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
                color: "#fff", fontSize: 14, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {(freshName || user?.name || "").charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{freshName || user?.name}</div>
                <div style={{ fontSize: 11, color: "#7a2e00", fontWeight: 500 }}>{freshRole || user?.role || ""}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 6 }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  flex: 1, height: 44, borderRadius: 10,
                  border: "1.5px solid #c96a10", background: "var(--surface)",
                  color: "#7a2e00", fontFamily: "var(--font)",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Cancel
              </button>
              <button
                onClick={onLogout}
                style={{
                  flex: 1, height: 44, borderRadius: 10, border: "none",
                  background: "linear-gradient(135deg,#3d1200,#7a2e00,#c96a10)",
                  color: "#fff", fontFamily: "var(--font)",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  boxShadow: "0 3px 12px rgba(61,18,0,0.3)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}