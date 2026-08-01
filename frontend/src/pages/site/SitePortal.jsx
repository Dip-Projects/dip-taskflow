import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Navbar from '../../components/Navbar';
import SiteReport from "./Sitereport";
import { ClockInOut, CalendarView, CLOCK_CSS } from "./Clockinout.jsx";
import MyReports from "./MyReports";
import DPR from "./Dpr.jsx";
import ManpowerReport from "./Manpowerreport.jsx";
import Profile from "./Profile";
import WprGenerator from "./Wprgenerator.jsx";
import MatRequirement from "./MatRequirement.jsx";
import { useMaterialUnseenCount } from "./MatRequirement"; // adjust path
import { canAccessPortal } from '../../access.js';
import "./SitePortal.css";
import { computeMonthlyLeaveBalance, isMonthlyLeaveRole } from "./leaveUtils.js";
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { syncSiteUser, isSiteHead } from '../../lib/api';
// ─── Supabase ────────────────────────────────────────────────────────────────




// ─── Helpers ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const fmtD = (d) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const fmtDT = (dt) =>
  dt
    ? new Date(dt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "—";
const pad = (n) => String(n).padStart(2, "0");

const MONTHS = [
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
const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const LEAVE_TYPES = [
  "Casual Leave",
  "Sick Leave",
  "Earned Leave",
  "Maternity Leave",
  "Paternity Leave",
  "Compensatory Leave",
  "Unpaid Leave",
];
// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Ico = {
  clock: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  cal: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2563eb"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  leave: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#7c3aed"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  ),
  apply: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#7c3aed"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  ),
  report: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#db2777"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 4 4 4-4" />
    </svg>
  ),
  weeklyPlan: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#db2777"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M7 12h2l2-4 2 8 2-4h2" />
    </svg>
  ),
  weekly: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#db2777"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="12" width="4" height="9" />
      <rect x="10" y="7" width="4" height="14" />
      <rect x="17" y="3" width="4" height="18" />
      <line x1="2" y1="21" x2="22" y2="21" />
    </svg>
  ),
  monthly: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#db2777"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  ),
  site: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#db2777"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  materialRequirement: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.3 7 12 12 20.7 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  ),
  myRpt: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#16a34a"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  manRpt: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#16a34a"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  send: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  ),
  plus: (
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
  ),
  dl: (
    <svg
      width="13"
      height="13"
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
  ),
  info: (
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
  ),
  menu: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  chev: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  home: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  in: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  ),
  out: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  settings: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#bd3c0a"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  profile: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  check: (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
};

// ─── Nav structure ────────────────────────────────────────────────────────────
/** Base Site Engineer menu + Head oversight items when isSiteHead */
function buildNav(user) {
  const leaveChildren = [
    { key: "apply-leave", label: "Apply Leave", icon: Ico.apply },
    { key: "my-leave", label: "My Leave", icon: Ico.leave },
  ];
  if (isSiteHead(user) || user?._isApprover) {
    leaveChildren.push({
      key: "leave-approvals",
      label: "Leave Approvals",
      icon: Ico.leave,
    });
  }

  const reportChildren = [
    { key: "daily-report", label: "Daily Report (DPR)", icon: Ico.report },
    { key: "wpr-generator", label: "Weekly Report (WPR)", icon: Ico.weekly },
    { key: "site-report", label: "Site Visit Report", icon: Ico.site },
    { key: "my-reports", label: "My Reports", icon: Ico.myRpt },
    { key: "manpower-reports", label: "Manpower Report", icon: Ico.manRpt },
  ];
  if (isSiteHead(user)) {
    reportChildren.push({
      key: "report-submissions",
      label: "Team Submissions",
      icon: Ico.myRpt,
    });
  }

  return [
    { key: "clock-in", label: "Clock In / Out", icon: Ico.clock },
    { key: "calendar", label: "Attendance", icon: Ico.cal },
    { section: "leave", label: "Leave", children: leaveChildren },
    { section: "reports", label: "Reports", children: reportChildren },
  ];
}

function buildAllItems(user) {
  return [
    ...buildNav(user).flatMap((n) => (n.children ? n.children : [n])),
    { key: "profile", label: "Profile & Settings", icon: Ico.profile },
  ];
}

function DateField({
  value,
  onChange,
  min,
  invalid,
  placeholder = "dd-mm-yyyy",
}) {
  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-GB")
    : "";

  return (
    <div style={{ position: "relative" }}>
      <input
        type="date"
        className="finput"
        value={value}
        onChange={onChange}
        min={min}
        style={{
          color: "transparent",
          caretColor: "transparent",
          position: "relative",
          zIndex: 1,
          background: "transparent",
          ...(invalid
            ? {
                borderColor: "var(--red)",
                boxShadow: "0 0 0 3px rgba(220,38,38,.12)",
              }
            : {}),
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 13,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 13.5,
          fontFamily: "var(--font)",
          color: value ? "var(--ink)" : "var(--ink3)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {value ? display : placeholder}
      </span>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
      <span>Loading…</span>
    </div>
  );
}

function MyLeave({ user, onApply }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_leaves")
        .select("*")
        .eq("user_name", user.user_name)
        .order("created_at", { ascending: false });
      setLeaves(data || []);
      setLoading(false);
    })();
  }, [user.user_name]);

  function computeLeaveStatus(leave) {
    if (leave.level_approved === false || leave.head_approved === false)
      return "rejected";
    if (leave.level_approved === true && leave.head_approved === true)
      return "approved";
    return "pending";
  }

  const canCancel = (l) => {
    if (computeLeaveStatus(l) !== "pending") return false;
    // Once either approver has responded, disallow self-cancel
    if (l.level_approved !== null || l.head_approved !== null) return false;
    return true;
  };

  const requestCancel = (l, e) => {
    e.stopPropagation();
    setConfirmLeave(l);
  };

  const confirmCancel = async () => {
    if (!confirmLeave) return;
    setCancellingId(confirmLeave.id);
    const { error } = await supabase
      .from("site_leaves")
      .delete()
      .eq("id", confirmLeave.id);
    setCancellingId(null);
    if (error) {
      alert("Failed to cancel leave: " + error.message);
      setConfirmLeave(null);
      return;
    }
    setLeaves((prev) => prev.filter((x) => x.id !== confirmLeave.id));
    setConfirmLeave(null);
  };

  const badgeCls = {
    approved: "badge-green",
    pending: "badge-amber",
    rejected: "badge-red",
  };

  const counts = { total: leaves.length, approved: 0, pending: 0, rejected: 0 };
  leaves.forEach((l) => {
    const s = computeLeaveStatus(l);
    if (counts[s] !== undefined) counts[s]++;
  });

  // Days between two date strings
  const dayCount = (from, to) => {
    if (!from || !to) return null;
    return Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1;
  };

  if (loading) return <Loading />;

  return (
    <div>
      {/* Summary stats */}
      <div className="stat-row">
        {[
          ["Total", counts.total, "var(--ink)"],
          ["Approved", counts.approved, "var(--green)"],
          ["Pending", counts.pending, "var(--amber)"],
          ["Rejected", counts.rejected, "var(--red)"],
        ].map(([l, v, c]) => (
          <div key={l} className="stat-card">
            <div className="stat-val" style={{ color: c }}>
              {v}
            </div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      {/* Leave cards */}
      <div className="lv-list">
        {leaves.length === 0 ? (
          <div className="empty-state">
            <div className="empty-ico">{Ico.leave}</div>
            <div className="empty-title">No leave applications yet</div>
            <div className="empty-sub">Apply for your first leave below.</div>
          </div>
        ) : (
          leaves.map((l) => {
            const status = computeLeaveStatus(l);
            const days = dayCount(l.from_date, l.to_date);
            const isOpen = expanded === l.id;
            const showCancel = canCancel(l);
            const isCancelling = cancellingId === l.id;
            return (
              <div
                key={l.id}
                className="lv-item"
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  cursor: "pointer",
                  gap: 0,
                }}
                onClick={() => setExpanded(isOpen ? null : l.id)}
              >
                {/* Main row */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="lv-left">
                    <div className="lv-type">{l.leave_type}</div>
                    <div className="lv-dates">
                      {fmtD(l.from_date)} → {fmtD(l.to_date)}
                      {days && (
                        <>
                          {" "}
                          ·{" "}
                          <strong>
                            {days} day{days > 1 ? "s" : ""}
                          </strong>
                        </>
                      )}
                    </div>
                    {l.reason && <div className="lv-reason">"{l.reason}"</div>}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {/* head indicator */}
                    <span className={`badge ${badgeCls[status]}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    {showCancel && (
                      <button
                        className="btn btn-red btn-sm"
                        onClick={(e) => requestCancel(l, e)}
                        disabled={isCancelling}
                        style={{
                          alignSelf: "flex-start",
                          marginTop: 8,
                          padding: "5px 10px",
                          fontSize: 10.5,
                          gap: 5,
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                        </svg>
                        {isCancelling ? "Cancelling…" : "Cancel Leave"}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Expanded detail */}
                {isOpen && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      fontSize: 12.5,
                      color: "var(--ink2)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "6px 16px",
                      }}
                    >
                      <span>
                        Site: <strong>{l.site_name || "—"}</strong>
                      </span>
                      <span>
                        Applied from: <strong>{fmtD(l.from_date)}</strong>
                      </span>
                      {l.level_approver_user_name && (
                        <span>
                          Level Approver: <strong>{l.level_approver_role || "Level"} — {l.level_approver_name || l.level_approver_user_name}</strong>
                        </span>
                      )}
                      {l.head_approver_user_name && (
                        <span>
                          Head Approver: <strong>{l.head_approver_role || "Head"} — {l.head_approver_name || l.head_approver_user_name}</strong>
                        </span>
                      )}

                      {l.level_approved === true && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--green)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                          {l.level_approver_role || "Level"} Approved
                        </span>
                      )}
                      {l.level_approved === false && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--red)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          {l.level_approver_role || "Level"} Rejected
                        </span>
                      )}
                      {l.level_approved === null && l.level_approver_user_name && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--amber2)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                          {l.level_approver_role || "Level"} Approval Pending
                        </span>
                      )}

                      {l.head_approved === true && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--green)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                          Head Approved
                        </span>
                      )}
                      {l.head_approved === false && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--red)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          Head Rejected
                        </span>
                      )}
                      {l.head_approved === null && l.head_approver_user_name && (
                        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--amber2)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                          Head Approval Pending
                        </span>
                      )}
                    </div>

                    {/* Rejection reasons — array of {slot, by, reason, at} */}
                    {Array.isArray(l.rejection_reason) && l.rejection_reason.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                        {l.rejection_reason.map((r) => (
                          <div
                            key={r.slot}
                            style={{
                              background: "#fef2f2",
                              border: "1px solid #fecaca",
                              borderRadius: 8,
                              padding: "8px 12px",
                              color: "var(--red)",
                            }}
                          >
                            <strong>{`${r.slot === "head" ? "Head" : (l.level_approver_role || "Level")} rejection`}</strong>{" "}({r.by}): {r.reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 16, display: "flex" }}>
        <button className="btn btn-pri" onClick={onApply}>
          {Ico.plus} Apply New Leave
        </button>
      </div>

      {/* Cancel confirmation modal */}
      {confirmLeave && (
        <div
          onClick={() => !cancellingId && setConfirmLeave(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15,13,10,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              borderRadius: 14,
              width: "100%",
              maxWidth: 380,
              padding: 24,
              boxShadow: "0 16px 48px rgba(0,0,0,.25)",
              border: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                width: 48,
                borderRadius: "50%",
                background: "#fef2f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            ></div>

            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "var(--ink)",
                marginBottom: 6,
              }}
            >
              Cancel this leave application?
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink2)",
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              <strong>{confirmLeave.leave_type}</strong> ·{" "}
              {fmtD(confirmLeave.from_date)} → {fmtD(confirmLeave.to_date)}
              <br />
              This action cannot be undone.
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-out"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setConfirmLeave(null)}
                disabled={!!cancellingId}
              >
                Keep It
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  justifyContent: "center",
                  background: "var(--red)",
                  color: "#fff",
                  opacity: cancellingId ? 0.6 : 1,
                }}
                onClick={confirmCancel}
                disabled={!!cancellingId}
              >
                {cancellingId ? "Cancelling…" : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function LeaveApprovals({ user }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("pending");
  const [rejectTarget, setRejectTarget] = useState(null); // { leave, isHead }
  const [rejectReason, setRejectReason] = useState("");

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    if (!user?.user_name) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("site_leaves")
      .select("*")
      .or(`level_approver_user_name.eq.${user.user_name},head_approver_user_name.eq.${user.user_name}`)
      .order("created_at", { ascending: false });
    if (!error) setLeaves(data || []);
    setLoading(false);
  }, [user?.user_name]);

  useEffect(() => { load(); }, [load]);

  const isMyLevelSlot = (l) => l.level_approver_user_name === user.user_name;
  const isMyHeadSlot  = (l) => l.head_approver_user_name  === user.user_name;
  const needsMyAction = (l) =>
    (isMyLevelSlot(l) && l.level_approved === null) || (isMyHeadSlot(l) && l.head_approved === null);

  const pending = leaves.filter(needsMyAction);
  const list = tab === "pending" ? pending : leaves;

  // Approve: no reason needed
  const approve = async (leave) => {
    setActioningId(leave.id);
    const isHead = isMyHeadSlot(leave);
    const field = isHead ? "head_approved" : "level_approved";
    const newLevel = isHead ? leave.level_approved : true;
    const newHead  = isHead ? true : leave.head_approved;

    const { error } = await supabase.from("site_leaves")
      .update({ [field]: true, status: deriveLeaveStatus(newLevel, newHead) })
      .eq("id", leave.id);
    setActioningId(null);
    if (error) { showToast("err", "Failed: " + error.message); return; }
    showToast("ok", "Leave approved.");
    load();
  };

  // Reject: opens modal to collect reason first
  const openReject = (leave) => {
    setRejectTarget({ leave, isHead: isMyHeadSlot(leave) });
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) return;
    const { leave, isHead } = rejectTarget;
    setActioningId(leave.id);

    const field = isHead ? "head_approved" : "level_approved";
    const newLevel = isHead ? leave.level_approved : false;
    const newHead  = isHead ? false : leave.head_approved;
    const slot = isHead ? "head" : "level";
    const merged = mergeRejectionReason(leave.rejection_reason, slot, user.name, rejectReason.trim());

    const { error } = await supabase.from("site_leaves")
      .update({ [field]: false, status: deriveLeaveStatus(newLevel, newHead), rejection_reason: merged })
      .eq("id", leave.id);

    setActioningId(null);
    setRejectTarget(null);
    if (error) { showToast("err", "Failed: " + error.message); return; }
    showToast("ok", "Leave rejected.");
    load();
  };

  if (loading) return <Loading/>;

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        <button className={`badge ${tab==="pending"?"badge-amber":"badge-gray"}`} style={{cursor:"pointer",border:"none"}} onClick={()=>setTab("pending")}>
          Pending my action ({pending.length})
        </button>
        <button className={`badge ${tab==="all"?"badge-blue":"badge-gray"}`} style={{cursor:"pointer",border:"none"}} onClick={()=>setTab("all")}>
          All ({leaves.length})
        </button>
      </div>

      {!list.length ? (
        <div className="empty-state">
          <div className="empty-ico">{Ico.leave}</div>
          <div className="empty-title">{tab==="pending" ? "Nothing pending your approval" : "No leave requests"}</div>
          <div className="empty-sub">{tab==="pending" ? "You're all caught up." : "Requests routed to you will show up here."}</div>
        </div>
      ) : (
        <div className="lv-list">
          {list.map(l => {
            const status = deriveLeaveStatus(l.level_approved, l.head_approved);
            const days = l.from_date && l.to_date ? Math.ceil((new Date(l.to_date)-new Date(l.from_date))/86400000)+1 : null;
            const myTurn = needsMyAction(l);
            const reasons = Array.isArray(l.rejection_reason) ? l.rejection_reason : [];
            return (
              <div key={l.id} className="lv-item" style={{flexDirection:"column",alignItems:"stretch",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div className="lv-left">
                    <div className="lv-type">{l.leave_type} — {l.name}</div>
                    <div className="lv-dates">
                      {fmtD(l.from_date)} → {fmtD(l.to_date)}
                      {days && <> · <strong>{days} day{days>1?"s":""}</strong></>}
                      {l.site_name && <> · {l.site_name}</>}
                    </div>
                    {l.reason && <div className="lv-reason">"{l.reason}"</div>}
                  </div>
                  <span className={`badge ${status==="approved"?"badge-green":status==="rejected"?"badge-red":"badge-amber"}`}>
                    {status.charAt(0).toUpperCase()+status.slice(1)}
                  </span>
                </div>

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {l.level_approver_user_name && (
                      <span className={`badge ${l.level_approved===true?"badge-green":l.level_approved===false?"badge-red":"badge-amber"}`} style={{fontSize:10}}>
                        {l.level_approver_role || "Level"} ({l.level_approver_name || l.level_approver_user_name}): {l.level_approved===true?"✓ Approved":l.level_approved===false?"✗ Rejected":"Pending"}
                      </span>
                    )}
                    {l.head_approver_user_name && (
                      <span className={`badge ${l.head_approved===true?"badge-green":l.head_approved===false?"badge-red":"badge-amber"}`} style={{fontSize:10}}>
                        {l.head_approver_role || "Head"} ({l.head_approver_name || l.head_approver_user_name}): {l.head_approved===true?"✓ Approved":l.head_approved===false?"✗ Rejected":"Pending"}
                      </span>
                    )}
                </div>

                {reasons.length > 0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {reasons.map(r => (
                      <div key={r.slot} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",fontSize:12,color:"var(--red)"}}>
                        <strong>{`${r.slot === "head" ? "Head" : (l.level_approver_role || "Level")} rejection`}</strong>{" "}({r.by}): {r.reason}
                      </div>
                    ))}
                  </div>
                )}

                {myTurn && (
                  <div style={{display:"flex",gap:10}}>
                    <button className="btn btn-green" disabled={actioningId===l.id} onClick={()=>approve(l)}>{Ico.check} Approve</button>
                    <button className="btn btn-red" disabled={actioningId===l.id} onClick={()=>openReject(l)}>Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, display:"flex", alignItems:"center", gap:9,
          padding:"12px 18px", borderRadius:10, fontSize:13, fontWeight:700,
          background: toast.type==="ok" ? "#f0fdf4" : "#fef2f2",
          color: toast.type==="ok" ? "var(--green)" : "var(--red)",
          border: toast.type==="ok" ? "1.5px solid #bbf7d0" : "1.5px solid #fecaca",
          boxShadow:"0 8px 24px rgba(0,0,0,.14)", maxWidth:340 }}>
          {toast.msg}
        </div>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <div onClick={() => setRejectTarget(null)} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(15,13,10,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:14,width:"100%",maxWidth:420,padding:24,border:"1px solid var(--line)",boxShadow:"0 16px 48px rgba(0,0,0,.25)"}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>Reject this leave application?</div>
            <div style={{fontSize:13,color:"var(--ink2)",marginBottom:14}}>
              <strong>{rejectTarget.leave.leave_type}</strong> · {fmtD(rejectTarget.leave.from_date)} → {fmtD(rejectTarget.leave.to_date)}
            </div>
            <label className="flabel">Reason for rejection <span className="req">*</span></label>
            <textarea
              className="finput" rows={3} placeholder="Explain why this leave is being rejected…"
              value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
              style={{marginBottom:18}}
            />
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-out" style={{flex:1,justifyContent:"center"}} onClick={()=>setRejectTarget(null)}>Cancel</button>
              <button
                className="btn"
                style={{flex:1,justifyContent:"center",background:"var(--red)",color:"#fff",opacity:rejectReason.trim()?1:0.6}}
                disabled={!rejectReason.trim() || actioningId===rejectTarget.leave.id}
                onClick={confirmReject}
              >
                {actioningId===rejectTarget.leave.id ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
// APPLY LEAVE
// ═══════════════════════════════════════════════════════════════════════════════

function ApplyLeave({ user }) {
  const empty = { leave_type: "", from_date: "", to_date: "", reason: "" };
  const [form, setForm] = useState(empty);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  const [chain, setChain] = useState(null);
  const [chainLoading, setChainLoading] = useState(true);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
const [monthlyBalance, setMonthlyBalance] = useState(null);
const [balanceLoading, setBalanceLoading] = useState(true);
const [balanceRefresh, setBalanceRefresh] = useState(0);
const monthlyScheme = isMonthlyLeaveRole(user);

useEffect(() => {
  if (!monthlyScheme) { setBalanceLoading(false); return; }
  setBalanceLoading(true);
  const thisMonth = new Date().toISOString().slice(0, 7);
  computeMonthlyLeaveBalance(supabase, user, thisMonth)
    .then(setMonthlyBalance)
    .finally(() => setBalanceLoading(false));
}, [user.user_name, monthlyScheme, balanceRefresh]);
  // all sites this user belongs to (for display only)
  const sites =
    Array.isArray(user.site_names) && user.site_names.length
      ? user.site_names
      : user.site_name
        ? [user.site_name]
        : [];

  const site = sites[0] || ""; // still used for approver chain + submission, unchanged

  const showToast = (msg, ms = 4500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  useEffect(() => {
    if (!site || !user.role) {
      setChainLoading(false);
      return;
    }
    setChainLoading(true);
    resolveApprovalChain(supabase, site, user.role, user.user_name)
      .then(setChain)
      .finally(() => setChainLoading(false));
  }, [site, user.role, user.user_name]); 
  const days =
    form.from_date &&
    form.to_date &&
    new Date(form.to_date) >= new Date(form.from_date)
      ? Math.ceil(
          (new Date(form.to_date) - new Date(form.from_date)) / 86400000,
        ) + 1
      : null;

const submit = async () => {
  const missing = [];
  if (!form.leave_type) missing.push("Leave Type");
  if (!form.from_date) missing.push("From Date");
  if (!form.to_date) missing.push("To Date");
  if (!form.reason.trim()) missing.push("Reason");
  if (!site) missing.push("Site");

  if (missing.length) {
    setInvalidFields(missing);
    showToast(`Please fill: ${missing.join(", ")}`);
    setErr("");
    return;
  }

  // NEW — block over-quota applications for monthly-scheme roles
  if (monthlyScheme && days) {
    if (balanceLoading) {
      showToast("Still checking your leave balance — try again in a moment.");
      return; 
    }
    if (monthlyBalance && days > monthlyBalance.remaining) {
      setErr(
        `You only have ${monthlyBalance.remaining} leave${monthlyBalance.remaining === 1 ? "" : "s"} available, but this request is for ${days} day${days > 1 ? "s" : ""}. Please shorten the range or apply for Unpaid Leave instead.`
      );
      showToast(`Insufficient leave balance: ${monthlyBalance.remaining} available, ${days} requested.`);
      return;
    }
  }

  setInvalidFields([]);
  setBusy(true);
  setErr("");

    const c =
      chain ||
      (await resolveApprovalChain(supabase, site, user.role, user.user_name));

    const initialLevel = c.levelApprover ? null : true;
    const initialHead = c.autoApproved ? true : c.headApprover ? null : true;

  const { error } = await supabase.from("site_leaves").insert({
    user_name: user.user_name,
    name: user.name,
    leave_type: form.leave_type,
    from_date: form.from_date,
    to_date: form.to_date,
    reason: form.reason || null,
    site_name: site,
    level_approver_user_name: c.levelApprover?.username || null,
    level_approver_role: c.levelApprover?.role || null,
    level_approver_name: c.levelApprover?.name || null,   // ← add
    level_approved: initialLevel,
    head_approver_user_name: c.headApprover?.username || null,
    head_approver_role: c.headApprover?.role || null,
    head_approver_name: c.headApprover?.name || null,     // ← add
    head_approved: initialHead,
    status: deriveLeaveStatus(initialLevel, initialHead),
  });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setBalanceRefresh((p) => p + 1);
    setSubmitted(true);
  };

  if (submitted)
    return (
      <div className="success-state">
        <div className="success-ico">{Ico.check}</div>
        <div className="success-title">Leave Application Submitted!</div>
        <div className="success-sub">
          Your request is pending approval. You'll be notified once reviewed.
        </div>
        <button
          className="btn btn-pri"
          onClick={() => {
            setSubmitted(false);
            setForm(empty);
          }}
        >
          Apply Another
        </button>
      </div>
    );

  return (
    <div>
      <div className="info-banner" style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 8, width: "100%", boxSizing: "border-box" }}>
        <span style={{ flexShrink: 0, marginTop: 2 }}>{Ico.info}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {chainLoading ? (
            "Finding your approvers…"
          ) : chain?.autoApproved ? (
            "You are the top of the approval chain for this site — your leave will be auto-approved."
          ) : (
            <>
              Your leave will be routed to{" "}
              {chain?.levelApprover && (
                <strong>
                  {chain.levelApprover.name || chain.levelApprover.username}
                </strong>
              )}
              {chain?.levelApprover && chain?.headApprover && " and "}
              {chain?.headApprover && (
                <strong>
                  {chain.headApprover.name || chain.headApprover.username} (Head)
                </strong>
              )}
              {!chain?.levelApprover &&
                !chain?.headApprover &&
                "your project head for approval."}{" "}
            </>
          )}
        </span>
      </div>
      {err && (
        <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>
          {Ico.info} {err}
        </div>
      )}

      <div
        style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}
      >
        <div
          style={{ background: "var(--paper)", border: "1px solid var(--line2)", borderRadius: 9, padding: "8px 14px", fontSize: 12.5,}}>
          <span style={{ color: "var(--ink3)", fontWeight: 600 }}>
            Site{sites.length > 1 ? "s" : ""}:{"  "}
          </span>
          <strong>{sites.length ? sites.join(", ") : "Not Assigned"}</strong>
        </div>
        {monthlyScheme && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: balanceLoading ? "var(--paper)" : (monthlyBalance?.remaining > 0 ? "#f0fdf4" : "#fef2f2"),
          border: `1px solid ${balanceLoading ? "var(--line2)" : (monthlyBalance?.remaining > 0 ? "#bbf7d0" : "#fecaca")}`,
          borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700,
          color: balanceLoading ? "var(--ink3)" : (monthlyBalance?.remaining > 0 ? "var(--green)" : "var(--red)"),
        }}>
          {Ico.clock}
          {balanceLoading
            ? "Checking leave balance…"
            : `${monthlyBalance.remaining} leave${monthlyBalance.remaining === 1 ? "" : "s"} available (${monthlyBalance.broughtForward} carried over + ${monthlyBalance.quotaPerMonth} this month − ${monthlyBalance.thisMonthUsed} used)`}
        </div>
      )}
      </div>

      <div className="grid2">
        <div className="fgroup col2">
          <label className="flabel">
            Leave Type <span className="req">*</span>
          </label>
          <select
            className="finput"
            value={form.leave_type}
            onChange={(e) => {
              set("leave_type", e.target.value);
              setInvalidFields((f) => f.filter((x) => x !== "Leave Type"));
            }}
            style={
              invalidFields.includes("Leave Type")
                ? {
                    borderColor: "var(--red)",
                    boxShadow: "0 0 0 3px rgba(220,38,38,.12)",
                  }
                : undefined
            }
          >
            <option value="">Select leave type…</option>
            {LEAVE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="fgroup">
          <label className="flabel">
            From Date <span className="req">*</span>
          </label>
          <DateField
            value={form.from_date}
            min={today()}
            invalid={invalidFields.includes("From Date")}
            onChange={(e) => {
              set("from_date", e.target.value);
              setInvalidFields((f) => f.filter((x) => x !== "From Date"));
            }}
          />
        </div>
        <div className="fgroup">
          <label className="flabel">
            To Date <span className="req">*</span>
          </label>
          <DateField
            value={form.to_date}
            min={form.from_date || today()}
            invalid={invalidFields.includes("To Date")}
            onChange={(e) => {
              set("to_date", e.target.value);
              setInvalidFields((f) => f.filter((x) => x !== "To Date"));
            }}
          />
        </div>
        {days && (
          <div
            className="col2"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 9,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--green)",
            }}
          >
            {Ico.clock} {days} day{days > 1 ? "s" : ""} of leave
          </div>
        )}
        <div className="fgroup col2">
          <label className="flabel">
            Reason <span className="req">*</span>
          </label>
          <textarea
            className="finput"
            rows={3}
            placeholder="Briefly describe the reason…"
            value={form.reason}
            onChange={(e) => {
              set("reason", e.target.value);
              setInvalidFields((f) => f.filter((x) => x !== "Reason"));
            }}
            style={
              invalidFields.includes("Reason")
                ? {
                    borderColor: "var(--red)",
                    boxShadow: "0 0 0 3px rgba(220,38,38,.12)",
                  }
                : undefined
            }
          />
        </div>
      </div>
      <div className="act-row">
        <button className="btn btn-out" onClick={() => setForm(empty)}>
          Reset
        </button>
        <button
          className="btn btn-pri"
          onClick={submit}
          disabled={busy || chainLoading}
        >
          {Ico.send} {busy ? "Submitting…" : "Submit Application"}
        </button>
      </div>
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            background: "#fef2f2",
            color: "var(--red)",
            border: "1.5px solid #fecaca",
            boxShadow: "0 8px 24px rgba(0,0,0,.14)",
            maxWidth: 340,
            animation: "slideUp .22s ease",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function WeeklyReport() {
  return (
    <div className="empty-state" style={{ padding: "80px 24px" }}>
      <div className="empty-ico" style={{ width: 64, height: 64 }}>
        {Ico.weeklyPlan}
      </div>
      <div className="empty-title" style={{ fontSize: 16 }}>
        Weekly Planning
      </div>
      <div className="empty-sub">
        This feature is coming soon. Weekly consolidated reports will appear
        here.
      </div>
    </div>
  );
}
 //
// ═══════════════════════════════════════════════════════════════════════════════
// MONTHLY REPORT
// ═══════════════════════════════════════════════════════════════════════════════
function MonthlyReport() {
  return (
    <div className="empty-state" style={{ padding: "80px 24px" }}>
      <div className="empty-ico" style={{ width: 64, height: 64 }}>
        {Ico.monthly}
      </div>
      <div className="empty-title" style={{ fontSize: 16 }}>
        Monthly Report
      </div>
      <div className="empty-sub">
        This feature is coming soon. Monthly consolidated reports will appear
        here.
      </div>
    </div>
  );
}
export const ROLE_LEVELS = [
  "Site Engineer",
  "Site Incharge",
  "Site Coordinator",
  "Project Head",
];
const normRole = (s) => (s || "").trim().toLowerCase();

async function findUserForRole(supabase, site, role) {
  const { data } = await supabase
    .from("site_user_details")
    .select("username, name, role")
    .ilike("role", role)
    .eq("status", "Active")
    .or(`site_name.eq.${site},site_names.cs.{${site}}`)
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function resolveApprovalChain(
  supabase,
  site,
  applicantRole,
  applicantUsername,
) {
  const idx = ROLE_LEVELS.findIndex(
    (r) => normRole(r) === normRole(applicantRole),
  );
  const headRole = ROLE_LEVELS[ROLE_LEVELS.length - 1];

  if (idx === -1)
    return { levelApprover: null, headApprover: null, autoApproved: false };
  if (idx === ROLE_LEVELS.length - 1)
    return { levelApprover: null, headApprover: null, autoApproved: true };

  let levelApprover = null;
  for (let i = idx + 1; i < ROLE_LEVELS.length - 1; i++) {
    const candidate = await findUserForRole(supabase, site, ROLE_LEVELS[i]);
    if (candidate && candidate.username !== applicantUsername) {
      levelApprover = candidate;
      break;
    }
  }

  const headApprover = await findUserForRole(supabase, site, headRole);

  if (
    levelApprover &&
    headApprover &&
    levelApprover.username === headApprover.username
  ) {
    levelApprover = null;
  }

  return { levelApprover, headApprover, autoApproved: false };
}
export function deriveLeaveStatus(levelApproved, headApproved) {
  if (levelApproved === false || headApproved === false) return "rejected";
  if (levelApproved === true && headApproved === true) return "approved";
  return "pending";
}

// Merge a new rejection entry into the existing rejection_reason array (max 2: one per slot)
export function mergeRejectionReason(existing, slot, by, reason) {
  const arr = Array.isArray(existing) ? existing.filter(r => r.slot !== slot) : [];
  arr.push({ slot, by, reason, at: new Date().toISOString() });
  return arr;
}
// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function SitePortal() {
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();
const [hoveredNavKey, setHoveredNavKey] = useState(null);

const NAV_COLORS = {
  "clock-in": "#2563eb",
  "calendar": "#2563eb",
  "apply-leave": "#7c3aed",
  "my-leave": "#7c3aed",
  "leave-approvals": "#7c3aed",
  "daily-report": "#db2777",
  "wpr-generator": "#db2777",
  "site-report": "#db2777",
  "my-reports": "#16a34a",
  "manpower-reports": "#16a34a",
  "report-submissions": "#0891b2",
  "profile": "#bd3c0a",
};

function SniButton({ itemKey, icon, label, isActive, isHovered, onEnter, onLeave, onClick, badge, style }) {
  const highlighted = isActive || isHovered;
  const color = NAV_COLORS[itemKey] || "var(--amber2)";
  return (
    <button
      className={`sni${isActive ? " act" : ""}`}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: highlighted ? `${color}18` : undefined,
        color: highlighted ? color : undefined,
        overflow: "visible",
        position: "relative",
        ...style,
      }}
    >
      {icon} {label}
      {badge != null && badge > 0 && (
        <span className="sni-badge">{badge > 9 ? "9+" : badge}</span>
      )}
    </button>
  );
}
  const [user, setUser] = useState(null);
  const [userReady, setUserReady] = useState(false);
  const [activeTab, setActiveTab] = useState("clock-in");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded, setExpanded] = useState({ leave: true, reports: true });
  const [siteReports, setSiteReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportTab, setReportTab] = useState("dpr");
  const [leaveBadgeCount, setLeaveBadgeCount] = useState(0);
  const [approvalsPendingCount, setApprovalsPendingCount] = useState(0);
  const [isApprover, setIsApprover] = useState(false);
  const canSwitchToAdmin = canAccessPortal(user, "admin");
  const checkIsApprover = useCallback(async (u) => {
    if (!u?.user_name) return;
    const { count, error } = await supabase
      .from("site_leaves")
      .select("id", { count: "exact", head: true })
      .or(
        `level_approver_user_name.eq.${u.user_name},head_approver_user_name.eq.${u.user_name}`,
      );
    if (error) {
      setIsApprover(false);
      return;
    }
    setIsApprover((count || 0) > 0);
  }, []);
  const checkApprovalsPending = useCallback(async (u) => {
    if (!u?.user_name) return;
    const { data, error } = await supabase
      .from("site_leaves")
      .select(
        "id, level_approver_user_name, level_approved, head_approver_user_name, head_approved",
      )
      .or(
        `level_approver_user_name.eq.${u.user_name},head_approver_user_name.eq.${u.user_name}`,
      );
    if (error || !data) {
      setApprovalsPendingCount(0);
      return;
    }
    const count = data.filter(
      (l) =>
        (l.level_approver_user_name === u.user_name &&
          l.level_approved === null) ||
        (l.head_approver_user_name === u.user_name && l.head_approved === null),
    ).length;
    setApprovalsPendingCount(count);
  }, []);

  const matUnseen = useMaterialUnseenCount(user);
  // Same status-normalization logic used inside MyLeave, kept in sync
  const leaveStatusKey = (l) => {
    if (l.level_approved === false || l.head_approved === false)
      return "rejected";
    if (l.level_approved === true && l.head_approved === true)
      return "approved";
    return "pending";
  };

const getSeenLeaveStatuses = async (u) => {
  if (!u?.user_name) return {};
  const { data, error } = await supabase
    .from("leave_seen_status")
    .select("snapshot")
    .eq("user_name", u.user_name)
    .maybeSingle();
  if (error || !data) return {};
  return data.snapshot || {};
};

const setSeenLeaveStatuses = async (u, map) => {
  if (!u?.user_name) return;
  await supabase
    .from("leave_seen_status")
    .upsert(
      { user_name: u.user_name, snapshot: map, updated_at: new Date().toISOString() },
      { onConflict: "user_name" }
    );
};

  // Compares live leave rows against the last-seen snapshot and counts changes
const checkLeaveUpdates = useCallback(async (u) => {
  if (!u?.user_name) return;
  const { data } = await supabase
    .from("site_leaves")
    .select("id, level_approved, head_approved")
    .eq("user_name", u.user_name);
  if (!data) return;

  const seen = await getSeenLeaveStatuses(u); // ← was sync
  let count = 0;
  data.forEach(l => {
    const key = leaveStatusKey(l);
    if (seen[l.id] === undefined) {
      if (key !== "pending") count++;
    } else if (seen[l.id] !== key) {
      count++;
    }
  });
  setLeaveBadgeCount(count);
}, []);

const markLeavesSeen = useCallback(async (u) => {
  if (!u?.user_name) return;
  const { data } = await supabase
    .from("site_leaves")
    .select("id, level_approved, head_approved")
    .eq("user_name", u.user_name);
  const snapshot = {};
  (data || []).forEach(l => { snapshot[l.id] = leaveStatusKey(l); });
  await setSeenLeaveStatuses(u, snapshot); // ← was sync
  setLeaveBadgeCount(0);
}, []);


  const [reportFilter, setReportFilter] = useState({
    type: "",
    site: "",
    month: "",
  });
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    return saved === "dark";
  });
  const mainRef = useRef(null);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    const val = next ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", val);
    localStorage.setItem("theme", val);
  };

  const handleLogout = () => {
    authLogout();
    navigate("/login", { replace: true });
  };
  const fetchSiteReports = useCallback(async (u) => {
    if (!u || !isSiteHead(u)) return;
    setLoadingReports(true);

    const sites =
      Array.isArray(u.site_names) && u.site_names.length
        ? u.site_names
        : u.site_name
          ? [u.site_name]
          : [];

    if (!sites.length) {
      setSiteReports([]);
      setLoadingReports(false);
      return;
    }

    // Use case-insensitive comparison by fetching all and filtering client-side
    const sitesLower = sites.map((s) => s.toLowerCase().trim());

    const { data: dprData } = await supabase
      .from("dpr_reports")
      .select(
        "id, site, engineer, report_type, date, pdf_url, payload, created_at",
      )
      .order("created_at", { ascending: false });

    const { data: svrData } = await supabase
      .from("site_reports")
      .select(
        "id, site_name, reporter_name, designation, visit_date, progress_of_work, quality_observations, safety_concerns, issues_concerns, site_visit_instructions, key_instructions, submitted_by_name, pdf_url, created_at",
      )
      .order("created_at", { ascending: false });

    const { data: wprData } = await supabase
      .from("wpr_reports")
      .select(
        "id, site_name, engineer_name, report_date, report_number, presentation_url, status, submitted_by, created_at",
      )
      .order("created_at", { ascending: false });

    const normalized = [
      ...(dprData || [])
        .filter(
          (r) =>
            sitesLower.includes((r.site || "").toLowerCase().trim()) &&
            r.report_type !== "morning",
        )
        .map((r) => ({ ...r, source: "dpr" })),
      ...(svrData || [])
        .filter((r) =>
          sitesLower.includes((r.site_name || "").toLowerCase().trim()),
        )
        .map((r) => ({
          id: r.id,
          site: r.site_name,
          engineer: r.reporter_name || r.submitted_by_name,
          report_type: "site_visit",
          date: r.visit_date,
          pdf_url: r.pdf_url,
          created_at: r.created_at,
          source: "svr",
          progress_of_work: r.progress_of_work,
        })),
      ...(wprData || [])
        .filter((r) =>
          sitesLower.includes((r.site_name || "").toLowerCase().trim()),
        )
        .map((r) => ({
          id: r.id,
          site: r.site_name,
          engineer: r.engineer_name || r.submitted_by,
          report_type: "wpr",
          date: r.report_date,
          pdf_url: r.presentation_url,
          created_at: r.created_at,
          source: "wpr",
          report_number: r.report_number,
        })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    setSiteReports(normalized);
    setLoadingReports(false);
  }, []);

  useEffect(() => {
    if (sidebarOpen && window.innerWidth <= 768) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [sidebarOpen]);
useEffect(() => {
    // Prefer unified TaskFlow session (tf_user), then legacy site `user` key
    let parsed = null;
    try {
      const tf = localStorage.getItem("tf_user");
      if (tf) {
        const u = JSON.parse(tf);
        syncSiteUser(u);
        parsed = JSON.parse(localStorage.getItem("user") || "null");
      }
    } catch { /* ignore */ }
    if (!parsed) {
      try {
        const stored = localStorage.getItem("user");
        if (stored) parsed = JSON.parse(stored);
      } catch { /* ignore */ }
    }
    if (!parsed) {
      setUser(null);
      setUserReady(true);
      return;
    }
    setUser(parsed);
    setUserReady(true);
      // Re-fetch fresh site data from user_details
      (async () => {
        try {
        const { data, error } = await supabase
          .from("site_user_details")
          .select("site_name, site_names, department")
          .eq("id", parsed.id)
          .maybeSingle();
        if (error) {
          console.warn("site_user_details refresh failed", error.message);
          fetchSiteReports(parsed);
          checkLeaveUpdates(parsed);
          checkApprovalsPending(parsed);
          checkIsApprover(parsed);
          return;
        }
        if (data) {
          const updated = {
            ...parsed,
            site_name: data.site_name ?? parsed.site_name,
            site_names:
              data.site_names ?? (parsed.site_name ? [parsed.site_name] : []),
            department: data.department ?? parsed.department,
            is_head: parsed.is_head,
          };
          setUser(updated);
          localStorage.setItem("user", JSON.stringify(updated)); // keep localStorage fresh
          fetchSiteReports(updated);
          checkLeaveUpdates(updated);
          checkApprovalsPending(updated);
          checkIsApprover(updated);

          const site = updated.site_names?.[0] || updated.site_name || "";
          if (site) {
            try {
              await supabase
                .from("material_requirements")
                .select("id", { count: "exact", head: true })
                .eq("site_name", site)
                .eq("status", "received");
            } catch { /* table optional */ }
          }
        } else {
          fetchSiteReports(parsed);
          checkLeaveUpdates(parsed);
          checkApprovalsPending(parsed);
          checkIsApprover(parsed);
        }
        } catch (err) {
          console.warn("site user refresh error", err);
        }
      })();
    const onResize = () => {
      if (window.innerWidth <= 768) setSidebarOpen(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fetchSiteReports]);

  useEffect(() => {
    if (!user?.user_name) return;
    const t = setInterval(() => {
      checkLeaveUpdates(user);
      checkApprovalsPending(user);
    }, 60000);
    return () => clearInterval(t);
  }, [user, checkLeaveUpdates, checkApprovalsPending]);

  const nav = (key) => {
    setActiveTab(key);
    if (key === "my-leave") markLeavesSeen(user);
    if (window.innerWidth <= 999) setSidebarOpen(false);

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
      document.body.scrollTo({ top: 0, behavior: "smooth" });
      if (mainRef.current)
        mainRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  };

  if (!userReady)
    return (
      <div className="loading" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
        <span>Loading user…</span>
      </div>
    );

  if (!user) return <Navigate to="/login" replace />;

  const navUser = { ...user, _isApprover: isApprover };
  const NAV = buildNav(navUser);
  const ALL_ITEMS = buildAllItems(navUser);
  const activeItem = ALL_ITEMS.find((i) => i.key === activeTab);

  const renderContent = () => {
    switch (activeTab) {
      case "clock-in":
        return <ClockInOut user={user} supabase={supabase} />;
      case "calendar":
        return <CalendarView user={user} supabase={supabase} />;
      case "my-leave":
        return <MyLeave user={user} onApply={() => nav("apply-leave")} />;
      case "apply-leave":
        return <ApplyLeave user={user} />;
      case "leave-approvals":
        return <LeaveApprovals user={user} />;
      case "daily-report":
        return <DPR user={user} />;
      // case "weekly-planning":  return <WeeklyReport user={user}/>;
      // case "weekly-planning":
      //   return <WeeklyReport user={user} />;

      case "wpr-generator":
        return <WprGenerator user={user} supabase={supabase} />;
      // case "monthly-report":
      //   return <MonthlyReport />;
      case "site-report":
        return <SiteReport user={user} />;
      // case "material-requirement":
      //   return (
      //     <MatRequirement user={user} onDotSeen={() => matUnseen.refresh()} />
      //   );
      case "my-reports":
        return <MyReports user={user} />;
      case "manpower-reports":
        return <ManpowerReport user={user} />;
      case "profile":
        return (
          <Profile
            user={user}
            onLogout={handleLogout}
            onThemeToggle={toggleTheme}
            isDark={isDark}
          />
        );
      case "report-submissions": {
        if (!isSiteHead(user)) return null;

        const fmtD = (d) =>
          d
            ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "—";
        const fmtDT = (dt) =>
          dt
            ? new Date(dt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "—";

        // Filter by tab
        const tabFiltered = siteReports.filter((r) => {
          if (reportTab === "dpr")
            return r.source === "dpr" && r.report_type !== "morning";
          if (reportTab === "svr") return r.source === "svr";
          if (reportTab === "wpr") return r.source === "wpr";
          return true;
        });

        // Further filter by month + site
        const monthFiltered = tabFiltered.filter((r) => {
          if (reportFilter.site && r.site !== reportFilter.site) return false;
          if (
            reportFilter.month &&
            !(r.date || "").startsWith(reportFilter.month)
          )
            return false;
          return true;
        });

        const reportSites = [
          ...new Set(siteReports.map((r) => r.site).filter(Boolean)),
        ].sort();
        const withPdf = monthFiltered.filter((r) => r.pdf_url).length;

        // Group by date
        const grouped = {};
        monthFiltered.forEach((r) => {
          const d = r.date || r.created_at?.slice(0, 10) || "—";
          if (!grouped[d]) grouped[d] = [];
          grouped[d].push(r);
        });
        const sortedDates = Object.keys(grouped).sort((a, b) =>
          b.localeCompare(a),
        );

        const TAB_CONFIG = [
          {
            key: "dpr",
            label: "DPR",
            color: "#2563eb",
            bg: "#eff6ff",
            border: "#bfdbfe",
          },
          {
            key: "wpr",
            label: "WPR",
            color: "#7c3aed",
            bg: "#f5f3ff",
            border: "#e0e7ff",
          },
          {
            key: "svr",
            label: "SVR",
            color: "#16a34a",
            bg: "#f0fdf4",
            border: "#bbf7d0",
          },
        ];

        const DPR_TYPE_COLOR = {
          morning: { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
          evening: { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
          weekly: { bg: "#f5f3ff", color: "#7c3aed", border: "#e0e7ff" },
        };

        return (
          <div>
            {/* ── Professional overview banner ── */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 20,
                padding: "18px 22px",
                borderRadius: 14,
                background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",
                color: "#fff",
              }}
            >
              <div style={{ minWidth: 200 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: "#93c5fd",
                    marginBottom: 6,
                  }}
                >
                  Project Head Overview
                </div>
                <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 5 }}>
                  Report Submissions
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink3)",
                    lineHeight: 1.6,
                    maxWidth: 480,
                  }}
                >
                  Daily, weekly and site visit reports submitted across{" "}
                  <strong style={{ color: "#fff" }}>
                    {(user?.site_names?.length
                      ? user.site_names
                      : user?.site_name
                        ? [user.site_name]
                        : []
                    ).join(", ") || "your sites"}
                  </strong>
                  .
                </div>
              </div>

              {/* Quick stat chips */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  {
                    label: "DPR",
                    count: siteReports.filter((r) => r.source === "dpr").length,
                    color: "#60a5fa",
                  },
                  {
                    label: "WPR",
                    count: siteReports.filter((r) => r.source === "wpr").length,
                    color: "#c4b5fd",
                  },
                  {
                    label: "SVR",
                    count: siteReports.filter((r) => r.source === "svr").length,
                    color: "#86efac",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 64,
                      padding: "8px 14px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        fontFamily: "'DM Mono',monospace",
                        color: s.color,
                      }}
                    >
                      {s.count}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        color: "var(--ink3)",
                        marginTop: 2,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Tab bar ── */}
            <div
              style={{
                display: "inline-flex",
                gap: 4,
                padding: 4,
                borderRadius: 10,
                background: "var(--paper)",
                border: "1px solid var(--line)",
                marginBottom: 20,
              }}
            >
              {TAB_CONFIG.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setReportTab(t.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 16px",
                    borderRadius: 7,
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12.5,
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                    transition: "all .15s",
                    color: reportTab === t.key ? t.color : "#64748b",
                    background:
                      reportTab === t.key ? "var(--surface)" : "transparent",
                    boxShadow:
                      reportTab === t.key
                        ? "0 1px 6px rgba(0,0,0,.08)"
                        : "none",
                  }}
                >
                  {t.label}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 20,
                      background: reportTab === t.key ? t.bg : "#e2e8f0",
                      color: reportTab === t.key ? t.color : "#94a3b8",
                    }}
                  >
                    {siteReports.filter((r) => r.source === t.key).length}
                  </span>
                </button>
              ))}
            </div>

            {/* ── WPR coming soon ── */}
            {reportTab === "wpr" &&
              siteReports.filter((r) => r.source === "wpr").length === 0 && (
                <div
                  className="op-empty-state"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignContent: "center",
                    gap: "10px",
                  }}
                >
                  <svg
                    width="44"
                    height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.3 }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4l3 3" />
                  </svg>
                  <p
                    className="op-empty-text"
                    style={{ fontWeight: 700, color: "gray" }}
                  >
                    No weekly reports yet
                  </p>
                  <p
                    className="op-empty-text"
                    style={{ fontSize: 12, marginTop: -4, color: "gray" }}
                  >
                    Weekly reports from your site(s) will appear here once
                    submitted.
                  </p>
                </div>
              )}

            {reportTab !== "wpr" ||
            siteReports.filter((r) => r.source === "wpr").length > 0 ? (
              <>
                {/* ── Filters ── */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginBottom: 18,
                    padding: "10px 14px",
                    background: "var(--paper)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                  }}
                >
                  <input
                    type="month"
                    style={{
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: 12.5,
                      color: "#1e293b",
                      background: "var(--surface)",
                      border: "1px solid var(--line2)",
                      color: "var(--ink)",
                      borderRadius: 6,
                      padding: "5px 9px",
                      height: 32,
                      cursor: "pointer",
                      outline: "none",
                    }}
                    value={reportFilter.month}
                    onChange={(e) =>
                      setReportFilter((p) => ({ ...p, month: e.target.value }))
                    }
                  />
                  {reportSites.length > 1 && (
                    <select
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 12.5,
                        color: "#1e293b",
                        background: "var(--surface)",
                        border: "1px solid var(--line2)",
                        color: "var(--ink)",
                        borderRadius: 6,
                        padding: "5px 9px",
                        height: 32,
                        cursor: "pointer",
                        outline: "none",
                      }}
                      value={reportFilter.site}
                      onChange={(e) =>
                        setReportFilter((p) => ({ ...p, site: e.target.value }))
                      }
                    >
                      <option value="">All Sites</option>
                      {reportSites.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                  {Object.values(reportFilter).some((v) => v) && (
                    <button
                      onClick={() =>
                        setReportFilter({ type: "", site: "", month: "" })
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#dc2626",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 6,
                        padding: "5px 11px",
                        height: 32,
                        cursor: "pointer",
                      }}
                    >
                      ✕ Clear
                    </button>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "var(--ink3)",
                      alignSelf: "center",
                    }}
                  >
                    {monthFiltered.length} of {tabFiltered.length} reports
                  </span>
                </div>
                {/* ── Content ── */}
                {loadingReports ? (
                  <div className="op-empty-state">
                    <div className="op-spinner" />
                    <p className="op-empty-text" style={{ color: "gray" }}>
                      Loading reports…
                    </p>
                  </div>
                ) : monthFiltered.length === 0 ? (
                  <div className="op-empty-state">
                    <svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.3 }}
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </svg>
                    <p className="op-empty-text" style={{ color: "gray" }}>
                      No {reportTab.toUpperCase()} reports found
                      {reportFilter.month ? " for this month" : ""}.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 20,
                    }}
                  >
                    {sortedDates.map((date) => (
                      <div key={date}>
                        {/* Date header */}
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: ".08em",
                            textTransform: "uppercase",
                            color: "var(--ink3)",
                            marginBottom: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span>
                            {new Date(date + "T00:00:00").toLocaleDateString(
                              "en-IN",
                              {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              },
                            )}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 1,
                              background: "var(--line)",
                            }}
                          />
                          <span>
                            {grouped[date].length} report
                            {grouped[date].length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill,minmax(280px,1fr))",
                            gap: 12,
                          }}
                        >
                          {grouped[date].map((r) => {
                            // Pick card accent color
                            const accent =
                              r.source === "svr"
                                ? "#16a34a"
                                : r.source === "wpr"
                                  ? "#7c3aed"
                                  : DPR_TYPE_COLOR[r.report_type]?.color ||
                                    "#2563eb";

                            const typeBadge =
                              r.source === "svr"
                                ? {
                                    bg: "#f0fdf4",
                                    color: "#16a34a",
                                    border: "#bbf7d0",
                                    label: "Site Visit",
                                  }
                                : r.source === "wpr"
                                  ? {
                                      bg: "#f5f3ff",
                                      color: "#7c3aed",
                                      border: "#e0e7ff",
                                      label: "Weekly Report",
                                    }
                                  : r.report_type === "morning"
                                    ? {
                                        bg: "#fffbeb",
                                        color: "#d97706",
                                        border: "#fde68a",
                                        label: "Morning DPR",
                                      }
                                    : r.report_type === "evening"
                                      ? {
                                          bg: "#eff6ff",
                                          color: "#2563eb",
                                          border: "#bfdbfe",
                                          label: "Evening DPR",
                                        }
                                      : {
                                          bg: "#f8fafc",
                                          color: "var(--ink2)",
                                          border: "#e8edf3",
                                          label: r.report_type || "Report",
                                        };

                            return (
                              <div
                                key={r.id}
                                style={{
                                  background: "var(--surface)",
                                  border: "1px solid var(--line)",
                                  borderLeft: `4px solid ${accent}`,
                                  borderRadius: 10,
                                  padding: "14px 16px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    justifyContent: "space-between",
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: "3px 9px",
                                      borderRadius: 20,
                                      background: typeBadge.bg,
                                      color: typeBadge.color,
                                      border: `1px solid ${typeBadge.border}`,
                                    }}
                                  >
                                    {typeBadge.label}
                                  </span>
                                  {r.site && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: "var(--ink3)",
                                        fontWeight: 600,
                                        textAlign: "right",
                                      }}
                                    >
                                      {r.site}
                                    </span>
                                  )}
                                </div>

                                {/* Engineer */}
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#94a3b8"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                  </svg>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: "var(--ink)",
                                    }}
                                  >
                                    {r.engineer}
                                  </span>
                                </div>

                                {/* WPR: show week range */}
                                {r.source === "wpr" && r.week_end && (
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: "var(--ink2)",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 5,
                                    }}
                                  >
                                    <svg
                                      width="11"
                                      height="11"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                    >
                                      <rect
                                        x="3"
                                        y="4"
                                        width="18"
                                        height="18"
                                        rx="2"
                                      />
                                      <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                    {fmtD(r.week_start)} → {fmtD(r.week_end)}
                                  </div>
                                )}

                                {/* SVR: key fields inline */}
                                {r.source === "svr" && r.progress_of_work && (
                                  <p
                                    style={{
                                      fontSize: 12,
                                      color: "var(--ink2)",
                                      lineHeight: 1.5,
                                      margin: 0,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {r.progress_of_work}
                                  </p>
                                )}

                                {/* DPR: payload preview */}
                                {r.source === "dpr" && r.payload?.work_done && (
                                  <p
                                    style={{
                                      fontSize: 12,
                                      color: "var(--ink2)",
                                      lineHeight: 1.5,
                                      margin: 0,
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {r.payload.work_done}
                                  </p>
                                )}

                                <div
                                  style={{ fontSize: 11, color: "var(--ink3)" }}
                                >
                                  Submitted{" "}
                                  {new Date(r.created_at).toLocaleTimeString(
                                    "en-IN",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: true,
                                    },
                                  )}
                                </div>

                                {r.pdf_url ? (
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <a
                                      href={r.pdf_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "var(--ink2)",
                                        background: "var(--paper)",
                                        border: "1px solid var(--line2)",
                                        borderRadius: 7,
                                        padding: "6px 12px",
                                        textDecoration: "none",
                                      }}
                                    >
                                      <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                      </svg>
                                      View
                                    </a>

                                    <a
                                      href={r.pdf_url}
                                      download
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#2563eb",
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        borderRadius: 7,
                                        padding: "6px 12px",
                                        textDecoration: "none",
                                      }}
                                    >
                                      <svg
                                        width="12"
                                        height="12"
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
                                      Download
                                    </a>
                                  </div>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: "var(--ink3)",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    No PDF attached
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        );
      }

      default:
        return null;
    }
  };
  return (
    <>
      <style>
        { CLOCK_CSS }
      </style>
      <div>
        <Navbar
          onMenuToggle={() => setSidebarOpen((p) => !p)}
          menuOpen={sidebarOpen}
          onLogout={handleLogout}
        />

        <div className="body">
          {sidebarOpen && window.innerWidth <= 999 && (
            <button
              className="sb-backdrop"
              onClick={() => setSidebarOpen(false)}
              onTouchMove={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label="Close sidebar"
            />
          )}

          {/* Sidebar */}
          <aside
            className={`site-sidebar${sidebarOpen ? " open" : " closed"}`}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {canSwitchToAdmin && (
              <div style={{ padding: "14px 14px 0" }}>
                <button
                  onClick={() => window.location.assign("/admin")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 700, color: "#eb2525",
                    background: "#fef2f2", border: "1px solid #f88a8abe",
                    borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                    width: "100%", justifyContent: "center",
                  }}
                  title="Switch to Admin view"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3L4 7l4 4" /><path d="M4 7h16" />
                    <path d="M16 21l4-4-4-4" /><path d="M20 17H4" />
                  </svg>
                  Switch to Admin
                </button>
              </div>
            )}

            <nav className="snav">
              {NAV.map((n) => {
                if (!n.section)
                  return (
                    <SniButton
                      key={n.key}
                      itemKey={n.key}
                      icon={n.icon}
                      label={n.label}
                      isActive={activeTab === n.key}
                      isHovered={hoveredNavKey === n.key}
                      onEnter={() => setHoveredNavKey(n.key)}
                      onLeave={() => setHoveredNavKey(null)}
                      onClick={() => nav(n.key)}
                    />
                  );
                return (
                  <div key={n.section}>
                    <div
                      className="sgroup-hdr"
                      onClick={() =>
                        setExpanded((p) => ({ ...p, [n.section]: !p[n.section] }))
                      }
                    >
                      <span className="sgroup-lbl">{n.label}</span>
                      <span className={`sgroup-chev${expanded[n.section] ? " open" : ""}`}>
                        {Ico.chev}
                      </span>
                    </div>
                    <div className={`sgroup-kids${expanded[n.section] ? "" : " shut"}`}>
                      {n.children.map((c) => (
                          <SniButton
                            key={c.key}
                            itemKey={c.key}
                            icon={c.icon}
                            label={c.label}
                            isActive={activeTab === c.key}
                            isHovered={hoveredNavKey === c.key}
                            onEnter={() => setHoveredNavKey(c.key)}
                            onLeave={() => setHoveredNavKey(null)}
                            onClick={() => nav(c.key)}
                            badge={c.key === "my-leave" ? leaveBadgeCount : undefined}
                          />
                        ))}
                    </div>
                  </div>
                );
              })}

              {/* Head: Team Submissions + Leave Approvals are in buildNav() */}
            </nav>

            {/* Settings pinned to bottom */}
            <div className="sb-bottom">
              <SniButton
                itemKey="profile"
                icon={Ico.settings}
                label="Settings & Profile"
                isActive={activeTab === "profile"}
                isHovered={hoveredNavKey === "profile"}
                onEnter={() => setHoveredNavKey("profile")}
                onLeave={() => setHoveredNavKey(null)}
                onClick={() => nav("profile")}
                style={{ width: "100%", borderRadius: 9 }}
              />
            </div>
          </aside>

          {/* Main */}
          <main className="main" ref={mainRef}>
            <div className="card">
              <div className="card-hdr">
                <div className="card-ico">{activeItem?.icon}</div>
                <span className="card-title">{activeItem?.label}</span>
              </div>
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
