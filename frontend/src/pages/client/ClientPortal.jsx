import { useEffect, useState, useCallback, useMemo } from "react";
import Navbar from "../../components/Navbar";
import { api } from "../../lib/api";
import "./ClientPortal.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const fmtDateShort = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
};

function parseSiteNames(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    // Postgres array literal: {"Site A","Site B"}
    if (raw.startsWith("{") && raw.endsWith("}")) {
      return (
        raw
          .slice(1, -1)
          .match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
          ?.map((s) => s.replace(/^"|"$/g, "").trim())
          .filter(Boolean) || []
      );
    }
    return [raw.trim()].filter(Boolean);
  }
  return [];
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (
    ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() ||
    name[0].toUpperCase()
  );
}

// ─── Date grouping for Reports & Photos ──────────────────────────────────────
function groupKey(dateStr, mode) {
  if (!dateStr) return "Undated";
  const d = new Date(dateStr);
  if (mode === "day")
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  if (mode === "month")
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  if (mode === "year") return String(d.getFullYear());
  return "Recent";
}

function groupItems(items, mode) {
  if (mode === "recent" || mode === "range")
    return { Recent: mode === "range" ? items : items.slice(0, 25) };
  const groups = {};
  items.forEach((it) => {
    const k = groupKey(it.date, mode);
    if (!groups[k]) groups[k] = [];
    groups[k].push(it);
  });
  return groups;
}

// ─── Scroll helper ────────────────────────────────────────────────────────────
const scrollToTop = () => {
  if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const IcoCheck = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const IcoX = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IcoClock = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const IcoUser = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IcoBox = ({ w = 44, h = 44 }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.3 7 12 12 20.7 7" />
    <line x1="12" y1="22" x2="12" y2="12" />
  </svg>
);
const IcoImg = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const IcoDoc = ({ w = 12, h = 12 }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const IcoDocCalendar = ({ w = 12, h = 12 }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <rect x="7.5" y="12" width="9" height="7" rx="1" />
    <line x1="7.5" y1="15" x2="16.5" y2="15" />
    <line x1="10.5" y1="12" x2="10.5" y2="19" />
    <line x1="13.5" y1="12" x2="13.5" y2="19" />
  </svg>
);
const IcoDl = () => (
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
);
const IcoEye = () => (
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
);
const IcoHome = ({ w = 16, h = 16 }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);
const IcoBoxNav = ({ w = 16, h = 16 }) => (
  <svg
    width={w}
    height={h}
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
);
const IcoFolder = ({ w = 16, h = 16 }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const IcoRefresh = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);
const IcoArrow = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);
const IcoFilter = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const IcoPhone = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IcoLogout = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IcoSun = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const IcoMoon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const IcoLayers = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);
const IcoChart = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IcoDocBars = ({ w = 13, h = 13 }) => (
  <svg
    width={w}
    height={h}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IcoBluePrint = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 3v18" />
    <path d="M14 14l4 4" />
    <path d="M14 18h4v-4" />
  </svg>
);
// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending: { label: "Pending", icon: <IcoClock />, cls: "pending" },
  received: { label: "Accepted", icon: <IcoCheck />, cls: "accepted" }, // DB=received → show as Accepted
  rejected: { label: "Rejected", icon: <IcoX />, cls: "rejected" },
};

// ─── Confirm dialog ───────────────────────────────────────────────────────────
// action: "received" (client accepted) | "rejected"
function ConfirmDialog({ action, material, onConfirm, onCancel, loading }) {
  const isAccept = action === "received";
  return (
    <div
      className="cp-confirm-backdrop"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="cp-confirm-box">
        <div className="cp-confirm-title">
          {isAccept ? "Accept this request?" : "Reject this request?"}
        </div>
        <div className="cp-confirm-body">
          {isAccept ? (
            <>
              Approving <strong>{material}</strong> will allow the site team to
              proceed with procurement.
            </>
          ) : (
            <>
              Rejecting <strong>{material}</strong> will notify the site team
              this item won't be supplied. This cannot be undone.
            </>
          )}
        </div>
        <div className="cp-confirm-btns">
          <button
            className="cp-btn"
            style={{
              background: isAccept ? "#1f7a4d" : "#b3261e",
              color: "#fff",
              flex: 1,
            }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Saving…" : isAccept ? "Yes, Accept" : "Yes, Reject"}
          </button>
          <button
            className="cp-btn"
            style={{
              background: "#eef1f5",
              color: "#5c6b7a",
              border: "1.5px solid #e1e5eb",
              flex: 1,
            }}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single material card ─────────────────────────────────────────────────────
function MaterialCard({ r, onAction }) {
  const [actioning, setActioning] = useState(false);
  const [confirm, setConfirm] = useState(null); // "received" (accept) | "rejected"

  const status = r.status || "pending";
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;

  const handleAction = async () => {
    setActioning(true);
    await onAction(r.id, confirm, r.material_name);
    setActioning(false);
    setConfirm(null);
  };

  return (
    <>
      {confirm && (
        <ConfirmDialog
          action={confirm}
          material={r.material_name}
          onConfirm={handleAction}
          onCancel={() => setConfirm(null)}
          loading={actioning}
        />
      )}
      <div className={`cp-mcard status-${status}`}>
        <div className="cp-mcard-top">
          <div>
            <div className="cp-mcard-name">{r.material_name}</div>
            <div className="cp-mcard-qty">
              {r.quantity} {r.unit_name}
            </div>
          </div>
          <span className={`cp-status ${cfg.cls}`}>
            {cfg.icon} {cfg.label}
          </span>
        </div>

        <div className="cp-mcard-meta">
          <span>
            <IcoUser /> Requested by <strong>{r.requested_by || "—"}</strong>
          </span>
          {" · "}
          <span>
            <IcoClock /> {fmtDateTime(r.created_at)}
          </span>
          {status === "received" && r.actioned_at && (
            <>
              <br />
              Accepted by <strong>{r.actioned_by || "Client"}</strong> on{" "}
              {fmtDateTime(r.actioned_at)}
            </>
          )}
          {status === "rejected" && r.actioned_at && (
            <>
              <br />
              Rejected by <strong>{r.actioned_by || "Client"}</strong> on{" "}
              {fmtDateTime(r.actioned_at)}
            </>
          )}
        </div>

        {status === "pending" && (
          <div className="cp-mcard-actions">
            <button
              className="cp-btn cp-btn-accept"
              onClick={() => setConfirm("received")}
              disabled={actioning}
            >
              <IcoCheck /> Accept
            </button>
            <button
              className="cp-btn cp-btn-reject"
              onClick={() => setConfirm("rejected")}
              disabled={actioning}
            >
              <IcoX /> Reject
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const IcoChevron = ({ open }) => (
  <svg
    className={`cp-tree-chevron${open ? " open" : ""}`}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const MONTH_NAMES = [
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

function ymdKey(iso) {
  if (!iso) return "";
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftYmd(key, days) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function parseYmd(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function daysAgo(key, today) {
  return Math.round((parseYmd(today) - parseYmd(key)) / 86400000);
}

function buildDateTree(dates) {
  const years = {};
  const today = todayYmd();
  dates.filter(Boolean).forEach((iso) => {
    const dayKey = ymdKey(iso);
    if (!dayKey || dayKey > today) return;
    const [yStr, mStr] = dayKey.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    years[y] = years[y] || {};
    years[y][m] = years[y][m] || {};
    years[y][m][dayKey] = (years[y][m][dayKey] || 0) + 1;
  });

  return Object.keys(years)
    .map(Number)
    .sort((a, b) => b - a)
    .map((y) => ({
      key: `${y}`,
      label: `${y}`,
      total: Object.values(years[y]).reduce(
        (s, m) => s + Object.values(m).reduce((s2, c) => s2 + c, 0),
        0,
      ),
      months: Object.keys(years[y])
        .map(Number)
        .sort((a, b) => b - a)
        .map((m) => ({
          key: `${y}-${String(m + 1).padStart(2, "0")}`,
          label: MONTH_NAMES[m],
          total: Object.values(years[y][m]).reduce((s, c) => s + c, 0),
          days: Object.entries(years[y][m])
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dayKey, count]) => ({
              key: dayKey,
              count,
              label: parseYmd(dayKey).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              }),
            })),
        })),
    }));
}

function isDrawingRevised(revision) {
  const r = String(revision || "").trim().toUpperCase();
  if (!r) return false;
  if (r === "R0" || r === "0" || r === "REV0" || r === "REV 0" || r === "ORIGINAL") return false;
  return true;
}

const MEDIA_TYPE_META = [
  { key: "dpr", label: "DPR", Icon: IcoDoc },
  { key: "wpr", label: "WPR", Icon: IcoDocBars },
  { key: "graphical", label: "Drawings", Icon: IcoBluePrint },
  { key: "mpr", label: "Monthly Report", Icon: IcoDocCalendar },
  { key: "photo", label: "Photos", Icon: IcoImg },
];

/** Calendar week-of-month: days 1–7 → W1, 8–14 → W2, … */
function weekOfMonthNum(dayKey) {
  const day = Number(String(dayKey || "").slice(8, 10));
  if (!day) return 0;
  return Math.ceil(day / 7);
}

function weekKeyOf(dayKey) {
  const monthKey = String(dayKey || "").slice(0, 7);
  const w = weekOfMonthNum(dayKey);
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !w) return "";
  return `${monthKey}-W${w}`;
}

function weekRangeLabel(monthKey, weekNum) {
  const [yy, mm] = String(monthKey || "").split("-").map(Number);
  if (!yy || !mm || !weekNum) return `Week ${weekNum || ""}`;
  const dim = daysInMonth(yy, mm);
  const start = (weekNum - 1) * 7 + 1;
  const end = Math.min(weekNum * 7, dim);
  const mon = (MONTH_NAMES[(mm || 1) - 1] || "").slice(0, 3);
  return `${start}–${end} ${mon}`;
}

/** Type → Month → Week → Day; Drawings → Category only */
function buildBrowseTree(media) {
  const today = todayYmd();
  /** type → monthKey → weekKey → dayKey → count */
  const root = {};
  /** drawing category → count */
  const drawingCats = {};

  const bump = (dayKey, type, count = 1) => {
    if (!dayKey || dayKey > today || !type) return;
    const monthKey = dayKey.slice(0, 7);
    const wKey = weekKeyOf(dayKey);
    if (!monthKey || !wKey) return;
    root[type] = root[type] || {};
    root[type][monthKey] = root[type][monthKey] || {};
    root[type][monthKey][wKey] = root[type][monthKey][wKey] || {};
    root[type][monthKey][wKey][dayKey] =
      (root[type][monthKey][wKey][dayKey] || 0) + count;
  };

  (media.dprs || []).forEach((r) => bump(ymdKey(r.date || r.created_at), "dpr"));
  (media.wprs || []).forEach((r) =>
    bump(ymdKey(r.created_at || r.report_date), "wpr"),
  );
  (media.photos || [])
    .filter((p) => p.source !== "drawing" && p.image_type !== "graphical")
    .forEach((p) => bump(ymdKey(p.actual_created_at || p.created_at), "photo"));
  (media.monthlies || []).forEach((r) => {
    const y = Number(r.year);
    const m = Number(r.month);
    if (y && m) {
      bump(`${y}-${String(m).padStart(2, "0")}-01`, "mpr");
    } else {
      bump(ymdKey(r.created_at), "mpr");
    }
  });
  (media.drawings || []).forEach((d) => {
    const dayKey = ymdKey(d.drawing_date);
    if (!dayKey || dayKey > today) return;
    let files = d.file_urls;
    if (typeof files === "string") {
      try {
        files = JSON.parse(files);
      } catch {
        files = [files];
      }
    }
    if (!Array.isArray(files)) files = [];
    const n = Math.max(1, files.length);
    const cat = String(d.category || "General").trim() || "General";
    drawingCats[cat] = (drawingCats[cat] || 0) + n;
  });

  const toDayList = (dayMap) =>
    Object.entries(dayMap || {})
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dayKey, count]) => ({
        key: dayKey,
        count,
        label: parseYmd(dayKey).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        }),
      }));

  return MEDIA_TYPE_META.map((meta) => {
    if (meta.key === "graphical") {
      const categories = Object.keys(drawingCats)
        .sort((a, b) => a.localeCompare(b))
        .map((cat) => ({
          key: cat,
          label: cat,
          total: drawingCats[cat],
        }));
      return {
        ...meta,
        byCategory: true,
        total: categories.reduce((s, c) => s + c.total, 0),
        months: [],
        categories,
      };
    }

    const monthsMap = root[meta.key] || {};
    const months = Object.keys(monthsMap)
      .sort((a, b) => b.localeCompare(a))
      .map((monthKey) => {
        const [yy, mm] = monthKey.split("-").map(Number);
        const weeksMap = monthsMap[monthKey] || {};
        const weeks = Object.keys(weeksMap)
          .sort((a, b) => b.localeCompare(a))
          .map((wKey) => {
            const weekNum = Number(String(wKey).split("-W")[1]) || 0;
            const days = toDayList(weeksMap[wKey]);
            return {
              key: wKey,
              weekNum,
              label: `Week ${weekNum}`,
              range: weekRangeLabel(monthKey, weekNum),
              total: days.reduce((s, d) => s + d.count, 0),
              days,
            };
          })
          .filter((w) => w.total > 0);
        return {
          key: monthKey,
          label: `${MONTH_NAMES[(mm || 1) - 1] || monthKey} ${yy || ""}`.trim(),
          total: weeks.reduce((s, w) => s + w.total, 0),
          weeks,
        };
      })
      .filter((m) => m.total > 0);

    return {
      ...meta,
      byCategory: false,
      total: months.reduce((s, m) => s + m.total, 0),
      months,
      categories: [],
    };
  }).filter((t) => t.total > 0);
}

function MediaFolderTree({ siteName, browse, onBrowse }) {
  const [tree, setTree] = useState(null);
  const [openTypes, setOpenTypes] = useState({});
  const [openMonths, setOpenMonths] = useState({});
  const [openWeeks, setOpenWeeks] = useState({});

  useEffect(() => {
    if (!siteName) return;
    let cancelled = false;
    (async () => {
      try {
        const media = await api(
          `/client/media?site=${encodeURIComponent(siteName)}`,
        );
        if (cancelled) return;
        const t = buildBrowseTree(media || {});
        setTree(t);
        if (t[0]) {
          setOpenTypes({ [t[0].key]: true });
          if (!t[0].byCategory && t[0].months?.[0]) {
            const mk = `${t[0].key}::${t[0].months[0].key}`;
            setOpenMonths({ [mk]: true });
          }
        }
      } catch {
        if (!cancelled) setTree([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteName]);

  useEffect(() => {
    if (browse?.type === "graphical") {
      setOpenTypes((s) => ({ ...s, graphical: true }));
    }
  }, [browse?.type]);

  if (!tree) return <div className="cp-tree-empty">Loading…</div>;
  if (!tree.length)
    return <div className="cp-tree-empty">No dated activity yet</div>;

  const isAct = (sel) => {
    if (!browse || !sel) return false;
    return (
      browse.type === sel.type &&
      (browse.month || "") === (sel.month || "") &&
      (browse.week || "") === (sel.week || "") &&
      (browse.date || "") === (sel.date || "") &&
      (browse.drawingCategory || "") === (sel.drawingCategory || "")
    );
  };

  return (
    <div className="cp-tree">
      {tree.map((t) => {
        const Icon = t.Icon || IcoDoc;
        const typeOpen = !!openTypes[t.key];
        return (
          <div key={t.key}>
            <div
              className={`cp-tree-row cp-tree-year${isAct({ type: t.key }) && !browse?.month && !browse?.drawingCategory ? " act" : ""}`}
              onClick={() => {
                setOpenTypes((s) => ({ ...s, [t.key]: !s[t.key] }));
                onBrowse?.({
                  type: t.key,
                  month: null,
                  week: null,
                  date: null,
                  drawingCategory: null,
                });
              }}
            >
              <IcoChevron open={typeOpen} />
              <Icon />
              <span className="cp-tree-label">{t.label}</span>
              <span className="cp-tree-count">{t.total}</span>
            </div>
            {typeOpen && (
              <div className="cp-tree-children">
                {t.byCategory
                  ? (t.categories || []).map((cat) => (
                      <div
                        key={`${t.key}::cat::${cat.key}`}
                        className={`cp-tree-row${isAct({ type: t.key, drawingCategory: cat.key }) ? " act" : ""}`}
                        onClick={() =>
                          onBrowse?.({
                            type: t.key,
                            month: null,
                            week: null,
                            date: null,
                            drawingCategory: cat.key,
                          })
                        }
                      >
                        <span className="cp-tree-leaf-dot" />
                        <IcoFolder />
                        <span className="cp-tree-label">{cat.label}</span>
                        <span className="cp-tree-count">{cat.total}</span>
                      </div>
                    ))
                  : t.months.map((m) => {
                      const monthKey = `${t.key}::${m.key}`;
                      return (
                        <div key={monthKey}>
                          <div
                            className={`cp-tree-row${isAct({ type: t.key, month: m.key }) && !browse?.week && !browse?.date ? " act" : ""}`}
                            onClick={() => {
                              setOpenMonths((s) => ({
                                ...s,
                                [monthKey]: !s[monthKey],
                              }));
                              onBrowse?.({
                                type: t.key,
                                month: m.key,
                                week: null,
                                date: null,
                                drawingCategory: null,
                              });
                            }}
                          >
                            <IcoChevron open={!!openMonths[monthKey]} />
                            <IcoFolder />
                            <span className="cp-tree-label">{m.label}</span>
                            <span className="cp-tree-count">{m.total}</span>
                          </div>
                          {openMonths[monthKey] && (
                            <div className="cp-tree-children">
                              {m.weeks.map((w) => {
                                const weekNodeKey = `${monthKey}::${w.key}`;
                                return (
                                  <div key={weekNodeKey}>
                                    <div
                                      className={`cp-tree-row${isAct({ type: t.key, month: m.key, week: w.key }) && !browse?.date ? " act" : ""}`}
                                      onClick={() => {
                                        setOpenWeeks((s) => ({
                                          ...s,
                                          [weekNodeKey]: !s[weekNodeKey],
                                        }));
                                        onBrowse?.({
                                          type: t.key,
                                          month: m.key,
                                          week: w.key,
                                          date: null,
                                          drawingCategory: null,
                                        });
                                      }}
                                    >
                                      <IcoChevron open={!!openWeeks[weekNodeKey]} />
                                      <IcoFolder />
                                      <span className="cp-tree-label">
                                        {w.label}
                                        <span className="cp-tree-week-range">
                                          {" "}
                                          · {w.range}
                                        </span>
                                      </span>
                                      <span className="cp-tree-count">{w.total}</span>
                                    </div>
                                    {openWeeks[weekNodeKey] && (
                                      <div className="cp-tree-children">
                                        {w.days.map((d) => (
                                          <div
                                            key={d.key}
                                            className={`cp-tree-row${isAct({ type: t.key, month: m.key, week: w.key, date: d.key }) ? " act" : ""}`}
                                            onClick={() =>
                                              onBrowse?.({
                                                type: t.key,
                                                month: m.key,
                                                week: w.key,
                                                date: d.key,
                                                drawingCategory: null,
                                              })
                                            }
                                          >
                                            <span className="cp-tree-leaf-dot" />
                                            <span className="cp-tree-label">
                                              {d.label}
                                            </span>
                                            <span className="cp-tree-count">
                                              {d.count}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function StatSkeleton() {
  return (
    <div
      className="cp-skel"
      style={{ width: 40, height: 24, marginBottom: 5 }}
    />
  );
}
function FeedSkeletonRow() {
  return (
    <div className="cp-feed-row">
      <div
        className="cp-skel"
        style={{ width: 32, height: 32, borderRadius: "var(--r-md)" }}
      />
      <div
        className="cp-feed-main"
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <div className="cp-skel" style={{ width: "70%", height: 13 }} />
        <div className="cp-skel" style={{ width: "40%", height: 11 }} />
      </div>
    </div>
  );
}
// ─── Overview / dashboard panel ───────────────────────────────────────────────
function Overview({ siteName, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    dpr: 0,
    wpr: 0,
    photos: 0,
  });

  const load = useCallback(async () => {
    if (!siteName) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api(`/client/overview?site=${encodeURIComponent(siteName)}`);
      setStats({
        dpr: data.dpr || 0,
        wpr: data.wpr || 0,
        photos: data.photos || 0,
      });
    } catch (_) {
      setStats({ dpr: 0, wpr: 0, photos: 0 });
    }
    setLoading(false);
  }, [siteName]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="cp-hero">
        <div>
          <div className="cp-hero-label">Operational snapshot</div>
          <div className="cp-hero-title">
            Coordinate site decisions with a polished, focused portal.
          </div>
          <div className="cp-hero-sub">
            Review project documents and stay aligned with the latest site
            activity in one place.
          </div>
        </div>
      </div>

      <div className="cp-stats">
        <div className="cp-stat">
          <div className="cp-stat-num blue">
            {loading ? <StatSkeleton /> : stats.dpr}
          </div>
          <div className="cp-stat-label">Daily Reports</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-num" style={{ color: "var(--accent)" }}>
            {loading ? <StatSkeleton /> : stats.wpr}
          </div>
          <div className="cp-stat-label">Weekly Reports</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-num green">
            {loading ? <StatSkeleton /> : stats.photos}
          </div>
          <div className="cp-stat-label">Site Photos</div>
        </div>
      </div>

      <div className="cp-quick-grid">
        <button className="cp-quick-card" onClick={() => onNavigate("media")}>
          <div className="cp-quick-icon">
            <IcoFolder />
          </div>
          <div className="cp-quick-title">Files</div>
          <div className="cp-quick-sub">
            Browse DPR, WPR, monthly reports, drawings and photos.
          </div>
          <div className="cp-quick-arrow">
            Open <IcoArrow />
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Material requests panel ──────────────────────────────────────────────────
function MaterialRequests({ siteName, userName, onStatsChange }) {
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [toast, setToast] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const dbStatusForFilter = (f) => {
    if (f === "accepted") return "received";
    if (f === "rejected") return "rejected";
    if (f === "pending") return "pending";
    return null;
  };

  const load = useCallback(async () => {
    if (!siteName) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const dbStatus = dbStatusForFilter(filter);
      const qs = new URLSearchParams({ site: siteName });
      if (dbStatus) qs.set("status", dbStatus);
      const data = await api(`/client/materials?${qs.toString()}`);
      setRows(data || []);
    } catch (_) {
      setRows([]);
    }
    setLoading(false);
  }, [siteName, filter]);

  const loadStats = useCallback(async () => {
    if (!siteName) return;
    try {
      const data = await api(`/client/materials?site=${encodeURIComponent(siteName)}`);
      setAllRows(data || []);
      if (onStatsChange) {
        onStatsChange((data || []).filter((r) => r.status === "pending").length);
      }
    } catch (_) {
      setAllRows([]);
    }
  }, [siteName, onStatsChange]);

  useEffect(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  const handleAction = async (id, newStatus, materialName) => {
    try {
      await api(`/client/materials/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      showToast("err", "Update failed: " + (err.message || "try again"));
      return;
    }
    showToast(
      "ok",
      newStatus === "received"
        ? `"${materialName}" accepted.`
        : `"${materialName}" rejected.`,
    );
    load();
    loadStats();
  };

  const stats = {
    pending: allRows.filter((r) => r.status === "pending").length,
    accepted: allRows.filter((r) => r.status === "received").length,
    rejected: allRows.filter((r) => r.status === "rejected").length,
  };

  const FILTERS = [
    { key: "pending", label: `Pending (${stats.pending})`, cls: "act-amber" },
    {
      key: "accepted",
      label: `Accepted (${stats.accepted})`,
      cls: "act-green",
    },
    { key: "rejected", label: `Rejected (${stats.rejected})`, cls: "act-red" },
    { key: "all", label: `All (${allRows.length})`, cls: "act" },
  ];

  return (
    <div>
      <div className="cp-stats">
        <div className="cp-stat">
          <div className="cp-stat-num amber">{stats.pending}</div>
          <div className="cp-stat-label">Pending</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-num green">{stats.accepted}</div>
          <div className="cp-stat-label">Accepted</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-num red">{stats.rejected}</div>
          <div className="cp-stat-label">Rejected</div>
        </div>
      </div>

      <div className="cp-filter-bar" id="cp-filter-bar">
        <button
          type="button"
          className={`cp-filter-toggle${filterOpen ? " open" : ""}`}
          onClick={() => setFilterOpen((o) => !o)}
        >
          <IcoFilter />
          <span className="cp-filter-toggle-text">
            {FILTERS.find((f) => f.key === filter)?.label || "Filter"}
          </span>
          <span className="cp-filter-toggle-chevron">
            <IcoChevron open={filterOpen} />
          </span>
        </button>

        <div className={`cp-filter-panel${filterOpen ? " open" : ""}`}>
          <div className="cp-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`cp-chip${filter === f.key ? " " + f.cls : ""}`}
                onClick={() => {
                  setFilter(f.key);
                  setFilterOpen(false);
                  scrollToTop();
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cp-section-head">
        <button
          className="cp-refresh-btn"
          onClick={() => {
            load();
            loadStats();
          }}
        >
          <IcoRefresh /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="cp-loading">
          <div className="cp-spinner" /> Loading requests…
        </div>
      ) : !rows.length ? (
        <div className="cp-empty">
          <IcoBox />
          <div className="cp-empty-title">
            No {filter === "all" ? "" : filter + " "}requests
          </div>
          <div className="cp-empty-sub">
            {filter === "pending"
              ? "All caught up — no pending approvals."
              : `No ${filter} material requests found.`}
          </div>
        </div>
      ) : (
        rows.map((r) => (
          <MaterialCard key={r.id} r={r} onAction={handleAction} />
        ))
      )}

      {toast && (
        <div className={`cp-toast ${toast.type}`}>
          {toast.type === "ok" ? <IcoCheck /> : <IcoX />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
const isMobileDevice = () =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function officeViewerUrl(url) {
  if (!url) return url;
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
}

function officeEmbedPreviewUrl(url) {
  if (!url) return url;
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

function resolveViewUrl(url, isOffice) {
  if (!url) return url;
  if (isOffice || isOfficeFile(url)) {
    return isMobileDevice() ? officeViewerUrl(url) : officeEmbedPreviewUrl(url);
  }
  if (isPdfFile(url)) {
    return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
  }
  return url;
}
function ActivityTrendChart({ series, onSelectMonth, selectedMonth }) {
  const W = 960,
    H = 480,
    padL = 48,
    padR = 24,
    padT = 28,
    padB = 44;
  const innerW = W - padL - padR,
    innerH = H - padT - padB;
  const maxVal = Math.max(
    1,
    ...series.flatMap((s) => SERIES_CFG.map((c) => s[c.key])),
  );
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;
  const yFor = (v) => padT + innerH - (v / maxVal) * innerH;
  const xFor = (i) => padL + i * stepX;
  const yTicks = 4;

  return (
    <div className="cp-chart-wrap">
      <div className="cp-chart-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="cp-chart-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const v = Math.round((maxVal / yTicks) * i);
            const y = yFor(v);
            return (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="#eef1f5"
                  strokeWidth="1"
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  fontSize="12"
                  textAnchor="end"
                  fill="#94a3b8"
                >
                  {v}
                </text>
              </g>
            );
          })}
          {SERIES_CFG.map((cfg) => {
            const points = series
              .map((s, i) => `${xFor(i)},${yFor(s[cfg.key])}`)
              .join(" ");
            return (
              <polyline
                key={cfg.key}
                points={points}
                fill="none"
                stroke={cfg.color}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
          {series.map((s, i) => (
            <g
              key={s.key}
              onClick={() => onSelectMonth(s.key)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={xFor(i) - (stepX || innerW) / 2}
                y={padT}
                width={stepX || innerW}
                height={innerH}
                fill="transparent"
              />
              {SERIES_CFG.map((cfg) => (
                <circle
                  key={cfg.key}
                  cx={xFor(i)}
                  cy={yFor(s[cfg.key])}
                  r={selectedMonth === s.key ? 6 : 4}
                  fill={cfg.color}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              ))}
              {selectedMonth === s.key && (
                <line
                  x1={xFor(i)}
                  x2={xFor(i)}
                  y1={padT}
                  y2={padT + innerH}
                  stroke="#cbd5e1"
                  strokeDasharray="3,3"
                />
              )}
              <text
                x={xFor(i)}
                y={H - 12}
                fontSize="12"
                textAnchor="middle"
                fill={selectedMonth === s.key ? "#1e293b" : "#94a3b8"}
                fontWeight={selectedMonth === s.key ? 700 : 400}
              >
                {s.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="cp-chart-legend">
        {SERIES_CFG.map((cfg) => (
          <span key={cfg.key} className="cp-chart-legend-item">
            <span className="cp-chart-dot" style={{ background: cfg.color }} />{" "}
            {cfg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
function monthKeyOf(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabelOf(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
  });
}
function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function buildDailySeries(items, monthKey) {
  const [y, m] = monthKey.split("-").map(Number); // monthKey = "YYYY-MM", m is 1-indexed
  const numDays = daysInMonth(y, m);
  const days = [];
  for (let d = 1; d <= numDays; d++) {
    const dateObj = new Date(y, m - 1, d);
    days.push({
      day: d,
      label:
        dateObj.toLocaleDateString("en-IN", { weekday: "short" }) + " " + d,
      dpr: 0,
      wpr: 0,
      photo: 0,
      graphical: 0,
    });
  }
  items.forEach((it) => {
    const d = new Date(it.date);
    if (isNaN(d) || d.getFullYear() !== y || d.getMonth() !== m - 1) return;
    const bucket = days[d.getDate() - 1];
    if (bucket) bucket[it.type] = (bucket[it.type] || 0) + 1;
  });
  return days;
}

function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function buildMonthlySeries(items, monthsBack = 12) {
  const now = new Date();
  const keys = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const buckets = {};
  keys.forEach((k) => {
    buckets[k] = { dpr: 0, wpr: 0, photo: 0, graphical: 0 };
  });
  items.forEach((it) => {
    const k = monthKeyOf(it.date);
    if (k && buckets[k]) buckets[k][it.type] = (buckets[k][it.type] || 0) + 1;
  });
  return keys.map((k) => ({ key: k, label: monthLabelOf(k), ...buckets[k] }));
}

const SERIES_CFG = [
  { key: "dpr", label: "Daily Reports", color: "#2563eb" },
  { key: "wpr", label: "Weekly Reports", color: "#7c3aed" },
  { key: "photo", label: "Site Photos", color: "#16a34a" },
  { key: "graphical", label: "Graphical", color: "#d97706" },
];

function MonthDrilldown({ monthKey, items, onClose }) {
  const label = monthLabelOf(monthKey);
  const byType = SERIES_CFG.map((cfg) => ({
    ...cfg,
    count: items.filter((it) => it.type === cfg.key).length,
  }));
  const maxCount = Math.max(1, ...byType.map((t) => t.count));

  return (
    <div className="cp-drilldown">
      <div className="cp-drilldown-head">
        <div className="cp-drilldown-title">
          Breakdown — {label} ({items.length} total)
        </div>
        <button className="cp-drilldown-close" onClick={onClose}>
          <IcoX />
        </button>
      </div>
      <div className="cp-drilldown-bars">
        {byType.map((t) => (
          <div className="cp-drilldown-bar-row" key={t.key}>
            <span className="cp-drilldown-bar-label">{t.label}</span>
            <div className="cp-drilldown-bar-track">
              <div
                className="cp-drilldown-bar-fill"
                style={{
                  width: `${(t.count / maxCount) * 100}%`,
                  background: t.color,
                }}
              />
            </div>
            <span className="cp-drilldown-bar-count">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function MediaSkeletonGrid({ count = 8 }) {
  return (
    <div className="cp-media-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="cp-skel-card" key={i}>
          <div className="cp-skel cp-skel-photo" />
          <div className="cp-skel-body">
            <div className="cp-skel cp-skel-badge" />
            <div className="cp-skel cp-skel-title" />
            <div className="cp-skel cp-skel-meta" />
            <div className="cp-skel-actions">
              <div className="cp-skel cp-skel-action" />
              <div className="cp-skel cp-skel-action" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
function isImageFile(url) {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop().toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);
}
function isPdfFile(url) {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  return clean.toLowerCase().endsWith(".pdf");
}
function isOfficeFile(url) {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop().toLowerCase();
  return ["ppt", "pptx", "doc", "docx", "xls", "xlsx"].includes(ext);
}

const MONTHLY_FILE_RE = /\.(pdf|png|jpe?g|webp|gif|bmp|svg|ppt|pptx|doc|docx|xls|xlsx)$/i;

async function loadLatestMonthlyFiles(row) {
  if (!row?.folder_path) return [];
  try {
    let current = row.folder_path;
    let items = [];
    for (let i = 0; i < 6; i += 1) {
      const qs = new URLSearchParams({ path: current, bucket: "site-files" });
      const data = await api(`/storage/list?${qs.toString()}`);
      items = data.items || [];
      const folders = items.filter((it) => it.isFolder);
      const files = items.filter((it) => !it.isFolder);
      if (!files.length && folders.length === 1) {
        current = folders[0].path;
        continue;
      }
      break;
    }
    const useful = items.filter(
      (it) => !it.isFolder && it.publicUrl && MONTHLY_FILE_RE.test(it.name || ""),
    );
    return useful.slice(0, 24).map((it) => ({
      name: it.name,
      url: it.publicUrl,
      date: it.updatedAt || row.created_at,
    }));
  } catch {
    return [];
  }
}

function drawingTypeLabel(d) {
  const parts = [d.sub_cat_1, d.sub_cat_2, d.sub_cat_3]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return String(d.category || "Drawing").trim() || "Drawing";
}

function parseDrawingFiles(d) {
  let files = d.file_urls;
  if (typeof files === "string") {
    try {
      files = JSON.parse(files);
    } catch {
      files = [files];
    }
  }
  if (!Array.isArray(files)) files = [];
  return files
    .map((f, i) => {
      const url =
        typeof f === "string"
          ? f
          : f?.url || f?.publicUrl || f?.public_url || null;
      if (!url) return null;
      const name =
        typeof f === "string"
          ? f.split("/").pop()?.replace(/^\d+_/, "") || `File ${i + 1}`
          : f?.name || `File ${i + 1}`;
      return { url, name, index: i };
    })
    .filter(Boolean);
}

function formatDrawingDate(iso) {
  const key = ymdKey(iso);
  if (!key) return "—";
  return parseYmd(key).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function DrawingsBrowsePanel({ drawings, browse, onOpenCategory, siteName, onViewer }) {
  const [openCat, setOpenCat] = useState(browse?.drawingCategory || null);
  const [filterDate, setFilterDate] = useState("");
  const [filterRev, setFilterRev] = useState("");

  useEffect(() => {
    setOpenCat(browse?.drawingCategory || null);
  }, [browse?.drawingCategory, browse?.month, browse?.week, browse?.date]);

  useEffect(() => {
    setFilterDate("");
    setFilterRev("");
  }, [browse?.drawingCategory, openCat]);

  const filtered = useMemo(() => {
    let rows = (drawings || []).filter((d) => ymdKey(d.drawing_date));
    if (browse?.month) {
      rows = rows.filter(
        (d) => ymdKey(d.drawing_date).slice(0, 7) === browse.month,
      );
    }
    if (browse?.week) {
      rows = rows.filter((d) => weekKeyOf(ymdKey(d.drawing_date)) === browse.week);
    }
    if (browse?.date) {
      rows = rows.filter((d) => ymdKey(d.drawing_date) === browse.date);
    }
    if (browse?.drawingCategory) {
      rows = rows.filter(
        (d) =>
          String(d.category || "General").trim() === browse.drawingCategory,
      );
    }
    return rows;
  }, [
    drawings,
    browse?.month,
    browse?.week,
    browse?.date,
    browse?.drawingCategory,
  ]);

  const categories = useMemo(() => {
    const map = {};
    filtered.forEach((d) => {
      const cat = String(d.category || "General").trim() || "General";
      map[cat] = map[cat] || [];
      map[cat].push(d);
    });
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({
        key,
        label: key,
        count: map[key].length,
        rows: map[key]
          .slice()
          .sort((a, b) =>
            ymdKey(b.drawing_date).localeCompare(ymdKey(a.drawing_date)),
          ),
      }));
  }, [filtered]);

  const activeCat = openCat || browse?.drawingCategory || null;
  const activeGroup = categories.find((c) => c.key === activeCat) || null;
  const fromSidebarCat = Boolean(browse?.drawingCategory);

  const tableRows = useMemo(() => {
    if (!activeGroup) return [];
    let sr = 0;
    const out = [];
    const revQ = filterRev.trim().toLowerCase();
    activeGroup.rows.forEach((d) => {
      const day = ymdKey(d.drawing_date);
      if (filterDate && day !== filterDate) return;
      const revRaw = String(d.revision || "").trim();
      if (revQ && !revRaw.toLowerCase().includes(revQ)) return;
      const files = parseDrawingFiles(d);
      const cat = String(d.category || "General").trim() || "General";
      const rev = revRaw || "—";
      const revised = isDrawingRevised(d.revision);
      const fileList = files.length
        ? files
        : [{ index: 0, name: "—", url: null }];
      fileList.forEach((f) => {
        sr += 1;
        out.push({
          key: `${d.id || "d"}-${f.index}-${sr}`,
          sr,
          date: formatDrawingDate(d.drawing_date),
          cat,
          fileName: f.name || "—",
          rev,
          revised,
          url: f.url,
          downloadName: f.name || drawingTypeLabel(d),
        });
      });
    });
    return out;
  }, [activeGroup, filterDate, filterRev]);

  if (!filtered.length) {
    return (
      <div className="cp-empty">
        <IcoBluePrint />
        <div className="cp-empty-title">No drawings for {siteName}</div>
        <div className="cp-empty-sub">
          Upload from TaskFlow → Add Drawing. The Drawing Date you select there
          shows here and in the folder tree.
        </div>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className="cp-draw-folders">
        <div className="cp-group-hdr">Drawing categories</div>
        <div className="cp-draw-folder-grid">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className="cp-draw-folder-card"
              onClick={() => {
                setOpenCat(c.key);
                onOpenCategory?.(c.key);
              }}
            >
              <span className="cp-draw-folder-ico" aria-hidden>
                <IcoFolder />
              </span>
              <span className="cp-draw-folder-name">{c.label}</span>
              <span className="cp-draw-folder-count">
                {c.count} drawing{c.count === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="cp-draw-table-wrap">
      <div className="cp-draw-table-toolbar">
        {!fromSidebarCat && (
          <button
            type="button"
            className="cp-draw-back"
            onClick={() => {
              setOpenCat(null);
              onOpenCategory?.(null);
            }}
          >
            ← All categories
          </button>
        )}
        <div className="cp-draw-table-title">
          <span className="cp-draw-table-title-main">{activeGroup.label}</span>
          <span className="cp-draw-table-title-meta">
            {tableRows.length} file{tableRows.length === 1 ? "" : "s"}
            {browse?.date ? ` · ${formatDrawingDate(browse.date)}` : ""}
          </span>
        </div>
        <div className="cp-draw-filters">
          <label className="cp-draw-filter">
            <span>Date</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              aria-label="Filter by date"
            />
          </label>
          <label className="cp-draw-filter">
            <span>Rev No</span>
            <input
              type="search"
              value={filterRev}
              onChange={(e) => setFilterRev(e.target.value)}
              placeholder="Search revision…"
              aria-label="Search revision number"
            />
          </label>
          {(filterDate || filterRev) && (
            <button
              type="button"
              className="cp-draw-back"
              onClick={() => {
                setFilterDate("");
                setFilterRev("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      <div className="cp-draw-table-scroll">
        <table className="cp-draw-table">
          <colgroup>
            <col className="cp-draw-col-sr" />
            <col className="cp-draw-col-date" />
            <col className="cp-draw-col-cat" />
            <col className="cp-draw-col-file" />
            <col className="cp-draw-col-rev" />
            <col className="cp-draw-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Date</th>
              <th>Categories</th>
              <th>Filename</th>
              <th>Revision</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!tableRows.length ? (
              <tr>
                <td colSpan={6} className="cp-draw-empty-row">
                  No drawings match these filters.
                </td>
              </tr>
            ) : (
              tableRows.map((row) => (
                <tr key={row.key}>
                  <td className="cp-draw-sr">{row.sr}</td>
                  <td className="cp-draw-date">{row.date}</td>
                  <td className="cp-draw-cat">{row.cat}</td>
                  <td className="cp-draw-filename" title={row.fileName}>
                    {row.fileName}
                  </td>
                  <td className="cp-draw-rev">
                    <div className="cp-draw-rev-inner">
                      <span className="cp-draw-rev-text">{row.rev}</span>
                      {row.revised && (
                        <span className="cp-rev-pill">Revised</span>
                      )}
                    </div>
                  </td>
                  <td className="cp-draw-actions-cell">
                    {row.url ? (
                      <div className="cp-draw-btn-row">
                        <button
                          type="button"
                          className="cp-draw-btn cp-draw-btn--icon"
                          title="View"
                          aria-label="View"
                          onClick={() =>
                            openForView(row.url, {
                              isImage: isImageFile(row.url),
                              onViewer,
                            })
                          }
                        >
                          <IcoEye />
                        </button>
                        <button
                          type="button"
                          className="cp-draw-btn cp-draw-btn--dl cp-draw-btn--icon"
                          title="Download"
                          aria-label="Download"
                          onClick={() =>
                            forceDownload(row.url, row.downloadName)
                          }
                        >
                          <IcoDl />
                        </button>
                      </div>
                    ) : (
                      <span className="cp-draw-nofile">No file</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyFolderBrowsePanel({ monthlies, browse, siteName, onViewer }) {
  const [active, setActive] = useState(null);
  const [path, setPath] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const filtered = useMemo(() => {
    let rows = [...(monthlies || [])];
    if (browse?.month) {
      const [yy, mm] = browse.month.split("-").map(Number);
      rows = rows.filter(
        (r) => Number(r.year) === yy && Number(r.month) === mm,
      );
    }
    return rows.sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    );
  }, [monthlies, browse?.month]);

  async function openPath(folderPath) {
    if (!folderPath) return;
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({ path: folderPath, bucket: "site-files" });
      const data = await api(`/storage/list?${qs.toString()}`);
      setPath(data.path || folderPath);
      setItems(data.items || []);
    } catch (e) {
      setErr(e.message || "Could not open folder");
      setItems([]);
    }
    setLoading(false);
  }

  function openPack(row) {
    setActive(row);
    setPath(row.folder_path || "");
    setItems([]);
    if (row.folder_path) openPath(row.folder_path);
  }

  function goUp() {
    if (!active?.folder_path || !path) return;
    if (path === active.folder_path) {
      setActive(null);
      setPath("");
      setItems([]);
      return;
    }
    const parent = path.replace(/\/[^/]+$/, "");
    if (!parent || parent.length < active.folder_path.length) {
      openPath(active.folder_path);
      return;
    }
    openPath(parent);
  }

  if (!filtered.length) {
    return (
      <div className="cp-empty">
        <IcoFolder />
        <div className="cp-empty-title">No monthly reports for {siteName}</div>
        <div className="cp-empty-sub">Upload a monthly folder pack from Site portal.</div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="cp-draw-folders">
        <div className="cp-group-hdr">Monthly report packs</div>
        <div className="cp-draw-folder-grid">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              className="cp-draw-folder-card"
              onClick={() => openPack(r)}
            >
              <IcoFolder />
              <span className="cp-draw-folder-name">
                {MONTH_NAMES[(Number(r.month) || 1) - 1]} {r.year}
              </span>
              <span className="cp-draw-folder-count">
                {r.project_name || siteName}
                {r.file_count ? ` · ${r.file_count} files` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const rel =
    path.replace(active.folder_path || "", "").replace(/^\//, "") ||
    active.folder_path;

  return (
    <div className="cp-draw-table-wrap">
      <div className="cp-draw-table-toolbar">
        <button type="button" className="cp-draw-back" onClick={goUp}>
          ← Back
        </button>
        <div className="cp-group-hdr" style={{ margin: 0 }}>
          {MONTH_NAMES[(Number(active.month) || 1) - 1]} {active.year}
          {rel ? ` · ${rel}` : ""}
        </div>
      </div>
      {loading && <div className="cp-empty">Loading folder…</div>}
      {err && (
        <div className="cp-empty" style={{ color: "#dc2626" }}>
          {err}
        </div>
      )}
      {!loading && !err && (
        <div className="cp-draw-table-scroll">
          <table className="cp-draw-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map((it) => (
                <tr key={it.path}>
                  <td>
                    {it.isFolder ? (
                      <button
                        type="button"
                        className="cp-media-link"
                        style={{ justifyContent: "flex-start", border: "none", background: "transparent", height: "auto" }}
                        onClick={() => openPath(it.path)}
                      >
                        📁 {it.name}
                      </button>
                    ) : (
                      it.name
                    )}
                  </td>
                  <td>{it.isFolder ? "Folder" : (it.name.split(".").pop() || "file").toUpperCase()}</td>
                  <td>
                    {!it.isFolder && it.publicUrl ? (
                      <div className="cp-draw-file-actions">
                        <button
                          type="button"
                          className="cp-media-link"
                          onClick={() =>
                            openForView(it.publicUrl, {
                              isImage: isImageFile(it.publicUrl),
                              onViewer,
                            })
                          }
                        >
                          <IcoEye /> View
                        </button>
                        <button
                          type="button"
                          className="cp-media-link dl"
                          onClick={() => forceDownload(it.publicUrl, it.name)}
                        >
                          <IcoDl /> Download
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!items?.length && (
                <tr>
                  <td colSpan={3} style={{ color: "var(--ink-faint)" }}>
                    This folder is empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Reports & Photos panel ────────────────────────────────────────────────
function ReportsAndPhotos({ siteName, browse, onClearBrowse, onBrowse }) {
  const [dprs, setDprs] = useState([]);
  const [wprs, setWprs] = useState([]);
  const [monthlies, setMonthlies] = useState([]);
  const [monthlyFiles, setMonthlyFiles] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [officeDrawings, setOfficeDrawings] = useState([]);
  const [drawingRecords, setDrawingRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState("recent"); // recent | day | month | year
  const [typeFilter, setTypeFilter] = useState("photo");
  const [tabPicked, setTabPicked] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [viewer, setViewer] = useState(null); // { kind: 'image'|'pdf'|'iframe', src }

  const closeViewer = () => {
    setViewer((prev) => {
      if (prev?.src?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(prev.src);
        } catch (_) {}
      }
      return null;
    });
    setLightboxUrl(null);
  };

  const openViewer = (payload) => {
    if (!payload?.src) return;
    setViewer((prev) => {
      if (prev?.src?.startsWith("blob:") && prev.src !== payload.src) {
        try {
          URL.revokeObjectURL(prev.src);
        } catch (_) {}
      }
      return payload;
    });
  };
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    if (!browse?.type) return;
    setTypeFilter(browse.type);
    setTabPicked(true);
    setViewMode(
      browse.date ? "day" : browse.week || browse.month ? "month" : "recent",
    );
  }, [browse]);

  const load = useCallback(async () => {
    if (!siteName) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    setTabPicked(false);
    try {
      const data = await api(`/client/media?site=${encodeURIComponent(siteName)}`);
      const dprData = data.dprs || [];
      const wprData = data.wprs || [];
      const drawingData = data.drawings || [];
      setDprs(dprData);
      setWprs(wprData);
      setDrawingRecords(drawingData);
      const monthlyRows = [...(data.monthlies || [])].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      );
      setMonthlies(monthlyRows);
      setMonthlyFiles(await loadLatestMonthlyFiles(monthlyRows[0]));

      const drawingPhotoRows = drawingData
        .slice()
        .filter((d) => ymdKey(d.drawing_date))
        .sort((a, b) =>
          ymdKey(b.drawing_date).localeCompare(ymdKey(a.drawing_date)),
        )
        .flatMap((d) => {
        const files = parseDrawingFiles(d);
        const category = String(d.category || "General").trim() || "General";
        const revision = String(d.revision || "").trim();
        const revised = isDrawingRevised(revision);
        const day = ymdKey(d.drawing_date);
        if (!files.length) {
          return [{
            id: `drw-${d.id}`,
            public_url: null,
            caption: drawingTypeLabel(d),
            created_at: day,
            source: "drawing",
            image_type: "graphical",
            category,
            revision,
            revised,
            remarks: d.remarks || "",
            drawing_date: day,
            sub_cat_1: d.sub_cat_1,
            sub_cat_2: d.sub_cat_2,
            sub_cat_3: d.sub_cat_3,
          }];
        }
        return files.map((f) => ({
            id: `drw-${d.id}-${f.index}`,
            public_url: f.url,
            caption: drawingTypeLabel(d),
            created_at: day,
            source: "drawing",
            image_type: "graphical",
            category,
            revision,
            revised,
            remarks: d.remarks || "",
            drawing_date: day,
            sub_cat_1: d.sub_cat_1,
            sub_cat_2: d.sub_cat_2,
            sub_cat_3: d.sub_cat_3,
          }));
      });
      setOfficeDrawings(drawingPhotoRows);
      setPhotos((data.photos || []).filter((p) => p.source !== "drawing"));
    } catch (err) {
      console.error("client media:", err);
      setLoadError(err?.message || "Could not load reports");
      setDprs([]);
      setWprs([]);
      setMonthlies([]);
      setMonthlyFiles([]);
      setOfficeDrawings([]);
      setDrawingRecords([]);
      setPhotos([]);
    }
    setLoading(false);
  }, [siteName]);

  useEffect(() => {
    load();
  }, [load]);

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const unified = [
    ...dprs
      .map((r) => ({
        type: "dpr",
        date: r.date || r.created_at,
        title: `${capitalize(r.report_type) || "Daily"} Report`,
        meta: r.engineer,
        url: r.pdf_url,
        kind: "doc",
      })),
    ...wprs.map((r) => ({
      type: "wpr",
      date: r.created_at || r.report_date,
      displayDate: r.created_at || r.report_date,
      title: `Weekly Report #${r.report_number || ""}`,
      meta: r.engineer_name,
      url: r.presentation_url,
      kind: "doc",
      isOffice: isOfficeFile(r.presentation_url),
    })),
    ...monthlies.map((r) => ({
      type: "mpr",
      date:
        r.year && r.month
          ? `${r.year}-${String(r.month).padStart(2, "0")}-01`
          : r.created_at,
      displayDate: r.created_at,
      title: `Monthly Report — ${MONTH_NAMES[(Number(r.month) || 1) - 1] || ""} ${r.year || ""}`.trim(),
      meta: `${r.submitted_by_name || r.project_name || ""}${r.file_count ? ` · ${r.file_count} files` : ""}`,
      url: MONTHLY_FILE_RE.test(r.folder_url || "") ? r.folder_url : null,
      kind: "folder",
      fileCount: r.file_count,
    })),
    ...monthlyFiles.map((f) => ({
      type: "mpr",
      date: f.date,
      displayDate: f.date,
      title: f.name,
      meta: "Monthly Report",
      url: f.url,
      kind: isImageFile(f.url) ? "image" : "doc",
      isOffice: isOfficeFile(f.url),
      openOnly: true,
    })),
    ...officeDrawings.map((p) => ({
      type: "graphical",
      date: p.drawing_date || p.created_at,
      displayDate: p.drawing_date || p.created_at,
      title: p.caption || "Drawing",
      meta: p.category || "Office Drawing",
      url: p.public_url,
      kind: isImageFile(p.public_url) ? "image" : "doc",
      isOffice: isOfficeFile(p.public_url),
      category: p.category,
      revision: p.revision,
      revised: p.revised,
      remarks: p.remarks,
    })),
    ...photos.map((p) => ({
      type: "photo",
      date: p.created_at,
      displayDate: p.actual_created_at || p.created_at,
      title: p.caption || "Site Photo",
      meta: p.source === "dpr" ? "Daily Report" : "Weekly Report",
      url: p.public_url,
      kind: isImageFile(p.public_url) ? "image" : "doc",
      isOffice: isOfficeFile(p.public_url),
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const ofType = (type) => unified.filter((it) => it.type === type);

  const forType = (type) => {
    let rows = ofType(type);
    if (browse?.type) {
      if (browse.drawingCategory && type === "graphical") {
        rows = rows.filter(
          (it) =>
            String(it.category || "General").trim() === browse.drawingCategory,
        );
      }
      if (browse.date) {
        return rows.filter((it) => ymdKey(it.date) === browse.date);
      }
      if (browse.week) {
        return rows.filter(
          (it) => weekKeyOf(ymdKey(it.date)) === browse.week,
        );
      }
      if (browse.month) {
        return rows.filter(
          (it) => (ymdKey(it.date) || "").slice(0, 7) === browse.month,
        );
      }
      return rows;
    }
    const today = todayYmd();
    const yesterday = shiftYmd(today, -1);
    if (type === "photo") {
      const todayRows = rows.filter((it) => ymdKey(it.date) === today);
      if (todayRows.length) return todayRows;
      const yestRows = rows.filter((it) => ymdKey(it.date) === yesterday);
      if (yestRows.length) return yestRows;
      const latest = rows.map((it) => ymdKey(it.date)).filter(Boolean).sort().pop();
      return latest ? rows.filter((it) => ymdKey(it.date) === latest) : [];
    }
    if (type === "dpr") {
      return rows.filter((it) => {
        const k = ymdKey(it.date);
        return k && daysAgo(k, today) >= 0 && daysAgo(k, today) < 7;
      });
    }
    if (type === "wpr") {
      const month = today.slice(0, 7);
      return rows.filter((it) => (ymdKey(it.date) || "").slice(0, 7) === month);
    }
    return rows;
  };

  const counts = {
    dpr: forType("dpr").length,
    wpr: forType("wpr").length,
    mpr: forType("mpr").length,
    photo: forType("photo").length,
    graphical: forType("graphical").length,
  };

  useEffect(() => {
    if (loading || tabPicked) return;
    const order = ["photo", "dpr", "wpr", "mpr", "graphical"];
    if (counts[typeFilter] > 0) {
      setTabPicked(true);
      return;
    }
    const next = order.find((key) => counts[key] > 0);
    if (next) setTypeFilter(next);
    setTabPicked(true);
  }, [loading, tabPicked, typeFilter, counts.photo, counts.dpr, counts.wpr, counts.mpr, counts.graphical]);

  const scoped = forType(typeFilter).filter((it) => {
    if (viewMode !== "range") return true;
    const d = ymdKey(it.date);
    if (!d) return false;
    if (rangeStart && d < rangeStart) return false;
    if (rangeEnd && d > rangeEnd) return false;
    return true;
  });
  const grouped = groupItems(scoped, viewMode);
  const monthlySeries = buildMonthlySeries(unified);
  const monthItems = selectedMonth
    ? unified.filter((it) => monthKeyOf(it.date) === selectedMonth)
    : [];
  const groupLabels = Object.keys(grouped);

  const TYPE_FILTERS = [
    {
      key: "photo",
      label: ` Site Photos (${counts.photo})`,
      cls: "type-photo",
      icon: <IcoImg />,
    },
    {
      key: "dpr",
      label: ` Daily Reports (${counts.dpr})`,
      cls: "type-dpr",
      icon: <IcoDoc />,
    },
    {
      key: "wpr",
      label: ` Weekly Reports (${counts.wpr})`,
      cls: "type-wpr",
      icon: <IcoDocBars />,
    },
    {
      key: "mpr",
      label: ` Monthly Reports (${counts.mpr})`,
      cls: "type-mpr",
      icon: <IcoDocCalendar />,
    },
    {
      key: "graphical",
      label: ` Drawings (${counts.graphical})`,
      cls: "type-graphical",
      icon: <IcoBluePrint />,
    },
  ];

  const activeTypeLabel =
    TYPE_FILTERS.find((f) => f.key === typeFilter)?.label || "Site Photos";

  const browseLabel = (() => {
    if (!browse?.type) return null;
    const typeName =
      MEDIA_TYPE_META.find((t) => t.key === browse.type)?.label || browse.type;
    const parts = [typeName];
    if (browse.month) {
      const [yy, mm] = browse.month.split("-").map(Number);
      parts.push(`${MONTH_NAMES[(mm || 1) - 1] || ""} ${yy || ""}`.trim());
    }
    if (browse.week) {
      const weekNum = Number(String(browse.week).split("-W")[1]) || 0;
      parts.push(
        `Week ${weekNum}${browse.month ? ` (${weekRangeLabel(browse.month, weekNum)})` : ""}`,
      );
    }
    if (browse.drawingCategory) parts.push(browse.drawingCategory);
    if (browse.date) {
      parts.push(
        parseYmd(browse.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
      );
    }
    return parts.filter(Boolean).join(" · ");
  })();

  return (
    <div>
      {browseLabel && (
        <div className="cp-tree-jump-chip">
          Showing {browseLabel}
          <button onClick={onClearBrowse}>
            <IcoX />
          </button>
        </div>
      )}

      <div className="cp-filter-bar">
        <div className="cp-filter-panel open">
          <div className="cp-typefilters">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`cp-chip${typeFilter === f.key ? " act " + f.cls : ""}`}
                onClick={() => {
                  setTypeFilter(f.key);
                  setTabPicked(true);
                  if (browse) onClearBrowse?.();
                  scrollToTop();
                }}
              >
                {f.icon} {f.label}
              </button>
            ))}
            <button className="cp-refresh-btn" onClick={load}>
              <IcoRefresh /> Refresh
            </button>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="cp-empty" style={{ marginBottom: 16 }}>
          <div className="cp-empty-title">Could not load files</div>
          <div className="cp-empty-sub">{loadError}. Log out, log in again, then refresh.</div>
        </div>
      )}

      {loading ? (
        <MediaSkeletonGrid count={8} />
      ) : typeFilter === "graphical" ? (
        <DrawingsBrowsePanel
          drawings={drawingRecords}
          browse={
            browse?.type === "graphical"
              ? browse
              : { type: "graphical", month: null, week: null, date: null, drawingCategory: null }
          }
          siteName={siteName}
          onViewer={openViewer}
          onOpenCategory={(cat) => {
            if (onBrowse) {
              onBrowse({
                type: "graphical",
                month: browse?.month || null,
                week: browse?.week || null,
                date: browse?.date || null,
                drawingCategory: cat,
              });
            }
          }}
        />
      ) : typeFilter === "mpr" ? (
        <MonthlyFolderBrowsePanel
          monthlies={monthlies}
          browse={browse?.type === "mpr" ? browse : null}
          siteName={siteName}
          onViewer={openViewer}
        />
      ) : !scoped.length ? (
        <div className="cp-empty">
          <IcoBox />
          <div className="cp-empty-title">
            {`No ${activeTypeLabel.replace(/\s*\(\d+\)\s*$/, "").trim()} for ${siteName}`}
          </div>
          <div className="cp-empty-sub">
            {counts.graphical || counts.mpr || counts.dpr || counts.wpr || counts.photo
              ? "This site has files in another tab above."
              : "Nothing uploaded for this site yet."}
          </div>
        </div>
      ) : (
        groupLabels.map((label) => (
          <div key={label}>
            {viewMode !== "recent" && (
              <div className="cp-group-hdr">{label}</div>
            )}
            <div className="cp-media-grid">
              {grouped[label].map((it, i) => {
                const canViewDownload = !!(it.url && (it.kind === "doc" || it.kind === "folder" || it.kind === "image"));
                const isDrawingCard = it.type === "graphical";
                const openView = () =>
                  openForView(it.url, {
                    isOffice: !!it.isOffice,
                    isImage: it.kind === "image" || isImageFile(it.url),
                    onViewer: openViewer,
                    onImage: (u) => openViewer({ kind: "image", src: u }),
                  });
                return (
                <div key={i} className={`cp-media-card type-${it.type}`}>
                  {it.kind === "folder" ? (
                    <div
                      className="cp-media-photo"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        background: "#f3e8ff",
                        color: "#6d28d9",
                      }}
                    >
                      <IcoDocCalendar w={32} h={32} />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {it.fileCount ? `${it.fileCount} files` : "Monthly pack"}
                      </span>
                    </div>
                  ) : it.kind === "image" ? (
                    it.url ? (
                      <img
                        className="cp-media-photo"
                        src={it.url}
                        alt=""
                        onClick={openView}
                      />
                    ) : (
                      <div
                        className="cp-media-photo"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#ccc",
                        }}
                      >
                        <IcoImg />
                      </div>
                    )
                  ) : it.url ? (
                    it.openOnly || it.type === "mpr" ? (
                      <div
                        className="cp-media-photo"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          background: "#ecfdf5",
                          color: "#0f766e",
                          cursor: "pointer",
                        }}
                        onClick={openView}
                      >
                        <IcoDocCalendar w={32} h={32} />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>Open</span>
                      </div>
                    ) : it.isOffice ? (
                      <div
                        className="cp-media-photo"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          background: "#fdbca396",
                          color: "#af3404",
                          cursor: "pointer",
                        }}
                        onClick={openView}
                      >
                        <IcoDocBars w={32} h={32} />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          Open Presentation
                        </span>
                      </div>
                    ) : isDrawingCard || isPdfFile(it.url) ? (
                      <div
                        className="cp-media-photo"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          background: isDrawingCard ? "#fff7ed" : "#f1f5f9",
                          color: isDrawingCard ? "#c2410c" : "#475569",
                          cursor: "pointer",
                        }}
                        onClick={openView}
                      >
                        <IcoBluePrint />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          {isDrawingCard ? "View drawing" : "View PDF"}
                        </span>
                      </div>
                    ) : (
                      <div
                        className="cp-media-photo cp-media-doc-preview"
                        style={{
                          position: "relative",
                          overflow: "hidden",
                          cursor: "pointer",
                        }}
                        onClick={openView}
                      >
                        <iframe
                          src={`${it.url}#toolbar=0&navpanel=0&scrollbar=0&view=FitH`}
                          title={it.title}
                          loading="lazy"
                          scrolling="no"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: -20,
                            width: "calc(100% + 40px)",
                            height: "260%",
                            border: "none",
                            pointerEvents: "none",
                            transform: "scale(1)",
                            transformOrigin: "top center",
                          }}
                        />
                      </div>
                    )
                  ) : (
                    <div
                      className="cp-media-photo"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ccc",
                      }}
                    >
                      <IcoDoc />
                    </div>
                  )}
                  <div className="cp-media-body">
                    <span className={`cp-media-badge ${it.type}`}>
                      {it.type === "dpr" || it.type === "wpr" || it.type === "mpr" ? (
                        <IcoDoc />
                      ) : (
                        <IcoImg />
                      )}
                      {it.type === "dpr"
                        ? "Daily Report"
                        : it.type === "wpr"
                          ? "Weekly Report"
                          : it.type === "mpr"
                            ? "Monthly Report"
                            : it.type === "graphical"
                              ? "Drawing"
                              : "Site Photo"}
                    </span>
                    {it.revised && (
                      <span className="cp-rev-pill" title={it.revision || "Revised"}>
                        Revised{it.revision ? ` · ${it.revision}` : ""}
                      </span>
                    )}
                    <div className="cp-media-title">{it.title}</div>
                    <div className="cp-media-meta">
                      <IcoClock /> {fmtDateTime(it.displayDate || it.date)}
                      {it.category ? ` · ${it.category}` : ""}
                    </div>
                    {canViewDownload ? (
                        <div className="cp-media-actions">
                          <button
                            type="button"
                            className="cp-media-link"
                            onClick={openView}
                          >
                            <IcoEye /> View
                          </button>
                          {it.type !== "mpr" && !it.openOnly && (
                            <button
                              type="button"
                              className="cp-media-link dl"
                              onClick={() =>
                                forceDownload(it.url, it.title || "file")
                              }
                            >
                              <IcoDl /> Download
                            </button>
                          )}
                        </div>
                      ) : (it.kind === "doc" || it.kind === "folder") ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#bbb",
                            fontStyle: "italic",
                          }}
                        >
                          No file attached
                        </span>
                      ) : null}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        ))
      )}

      {(viewer || lightboxUrl) && (
        <div className="cp-lightbox" onClick={closeViewer}>
          <button
            className="cp-lightbox-close"
            onClick={closeViewer}
            type="button"
          >
            ✕
          </button>
          {(() => {
            const kind = viewer?.kind || "image";
            const src = viewer?.src || lightboxUrl;
            if (kind === "pdf" || kind === "iframe") {
              return (
                <iframe
                  className="cp-lightbox-frame"
                  src={src}
                  title="Document preview"
                  onClick={(e) => e.stopPropagation()}
                />
              );
            }
            return (
              <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────
const SECTIONS = {
  overview: { title: "Overview", sub: "" },
  media: {
    title: "Files",
    sub: "DPR, WPR, monthly reports, drawings and site photos.",
  },
  profile: { title: "My Profile", sub: "" },
};
const mimeToExt = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
};

function getExtensionFromUrl(url, fallback = "") {
  if (!url) return fallback;
  try {
    const clean = url.split("?")[0].split("#")[0];
    const ext = clean.split(".").pop().toLowerCase();
    if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) return ext;
  } catch (_) {}
  return fallback;
}

function guessMimeFromUrl(url) {
  const ext = getExtensionFromUrl(url, "");
  const map = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  return map[ext] || "";
}

function sanitizeDownloadName(name, url) {
  const base = String(name || "download")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "download";
  const ext = getExtensionFromUrl(url, "");
  if (!ext) return base;
  if (base.toLowerCase().endsWith(`.${ext}`)) return base;
  return `${base}.${ext}`;
}

function isCadOrArchive(url) {
  const ext = getExtensionFromUrl(url, "");
  return ["dwg", "dxf", "zip", "rar", "7z"].includes(ext);
}

/**
 * View only — never opens the raw storage URL (that often forces a download).
 * Prefer in-app viewer via onViewer({ kind, src }).
 */
async function openForView(url, { isOffice = false, isImage = false, onViewer, onImage } = {}) {
  if (!url) return;

  const show = (kind, src) => {
    if (typeof onViewer === "function") {
      onViewer({ kind, src });
      return;
    }
    // legacy image callback
    if (kind === "image" && typeof onImage === "function") {
      onImage(src);
      return;
    }
    // Never open raw file URLs here — only blob:/viewer URLs
    if (src && (src.startsWith("blob:") || src.includes("officeapps.live.com") || src.includes("docs.google.com"))) {
      window.open(src, "_blank", "noopener");
    }
  };

  if (isImage || isImageFile(url)) {
    show("image", url);
    return;
  }
  if (isOffice || isOfficeFile(url)) {
    show("iframe", officeViewerUrl(url));
    return;
  }
  if (isCadOrArchive(url)) {
    window.alert("This file type cannot be previewed in the browser. Please use Download.");
    return;
  }

  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    let mime =
      guessMimeFromUrl(url) ||
      (res.headers.get("content-type") || "").split(";")[0].trim() ||
      "application/octet-stream";
    if (isPdfFile(url) || /pdf/i.test(mime)) mime = "application/pdf";
    if (mime === "application/octet-stream" && isPdfFile(url)) mime = "application/pdf";

    const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));

    if (mime === "application/pdf") {
      show("pdf", blobUrl);
      return;
    }
    if (mime.startsWith("image/")) {
      show("image", blobUrl);
      return;
    }

    // Unknown binary — do not open (would download). Offer Google viewer only for PDFs.
    URL.revokeObjectURL(blobUrl);
    window.alert("Preview not available for this file. Please use Download.");
  } catch {
    if (isPdfFile(url)) {
      // CORS fallback: embedded Google viewer (view only, not download)
      show(
        "iframe",
        `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`,
      );
      return;
    }
    window.alert("Could not open preview. Please use Download.");
  }
}

/** Download only when user clicks Download. */
async function forceDownload(url, filename) {
  if (!url) return;
  const name = sanitizeDownloadName(filename, url);
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Download failed:", err);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
// ─── Profile panel ─────────────────────────────────────────────────────────
function ProfilePage({ siteName, onLogout, theme, onToggleTheme }) {
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false); // NEW

  const user = JSON.parse(localStorage.getItem("user") || "null"); // NEW — for the modal's name/role display

  useEffect(() => {
    if (!siteName) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const data = await api(`/client/site-profile?site=${encodeURIComponent(siteName)}`);
      setSite(data || null);
      setLoading(false);
    })();
  }, [siteName]);

  useEffect(() => {
    if (!siteName) {
      setActivityLoading(false);
      return;
    }
    (async () => {
      setActivityLoading(true);
      try {
      const media = await api(`/client/media?site=${encodeURIComponent(siteName)}`);
      const dprData = media.dprs || [];
      const wprData = media.wprs || [];
      const wprPhotoRows = (media.photos || []).filter((p) => p.source === "wpr");
      const dprPhotoRows = (media.photos || []).filter((p) => p.source === "dpr");

      const unified = [
        ...(dprData || [])
          .filter((r) => r.report_type !== "morning")
          .map((r) => ({ type: "dpr", date: r.date || r.created_at })),
        ...(wprData || []).map((r) => ({
          type: "wpr",
          date: r.report_date || r.created_at,
        })),
        ...wprPhotoRows.map((p) => ({
          type: p.image_type === "graphical" ? "graphical" : "photo",
          date: p.created_at,
        })),
        ...dprPhotoRows.map((p) => ({ type: "photo", date: p.created_at })),
      ];

      setActivity(unified);
      } catch (_) {
        setActivity([]);
      }
      setActivityLoading(false);
    })();
  }, [siteName]);

  const monthlySeries = buildMonthlySeries(activity, 6);
  const monthItems = selectedMonth
    ? activity.filter((it) => monthKeyOf(it.date) === selectedMonth)
    : [];

  if (loading) {
    return (
      <div className="cp-loading">
        <div className="cp-spinner" /> Loading profile…
      </div>
    );
  }
  if (!site) {
    return (
      <div className="cp-empty">
        <IcoBox />
        <div className="cp-empty-title">No profile data found</div>
        <div className="cp-empty-sub">
          Site details haven't been set up for {siteName} yet.
        </div>
      </div>
    );
  }

  const statusCfg = {
    active: { label: "Active", cls: "act-green" },
    completed: { label: "Completed", cls: "act-blue" },
    on_hold: { label: "On Hold", cls: "act-amber" },
  };
  const sCfg = statusCfg[(site.status || "active").toLowerCase()] || {
    label: site.status || "—",
    cls: "act",
  };

  const contacts = [
    { role: "Project Head", name: site.head_name, phone: site.head_contact_no },
    {
      role: "Coordinator",
      name: site.incharge_name,
      phone: site.incharge_contact_no,
    },
    {
      role: "Process Controller",
      name: site.pc_name,
      phone: site.pc_contact_no,
    },
  ].filter((c) => c.name || c.phone);

  return (
    <div className="cp-profile-outer">
      <div className="cp-profile">
        <div className="cp-profile-hero">
          <div className="cp-profile-avatar">
            {site.site_image_url ? (
              <img src={site.site_image_url} alt={site.site_name} />
            ) : (
              <span>{initials(site.site_name)}</span>
            )}
          </div>
          <span className={`cp-chip act ${sCfg.cls}`} style={{ marginTop: 12 }}>
            {sCfg.label}
          </span>
          <div className="cp-profile-site">{site.site_name}</div>
          {site.job_no && <div className="cp-profile-jobno">{site.job_no}</div>}
          {site.client_name && (
            <div className="cp-profile-client">
              <IcoUser /> {site.client_name}
            </div>
          )}
        </div>

        <div className="cp-profile-section-title">Site Contacts</div>
        {contacts.length === 0 ? (
          <div className="cp-empty-sub" style={{ textAlign: "center" }}>
            No contacts added for this site yet.
          </div>
        ) : (
          <div className="cp-profile-contacts">
            {contacts.map((c, i) => (
              <div className="cp-profile-contact-row" key={i}>
                <div className="cp-profile-contact-avatar">
                  {initials(c.name || c.role)}
                </div>
                <div className="cp-profile-contact-meta">
                  <div className="cp-profile-contact-name">{c.name || "—"}</div>
                  <div className="cp-profile-contact-role">{c.role}</div>
                </div>
                {c.phone && (
                  <a
                    className="cp-profile-contact-phone"
                    href={`tel:${c.phone}`}
                  >
                    <IcoPhone /> {c.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cp-profile-wide">
        <div className="cp-profile-section-title">Activity Trend</div>
        {activityLoading ? (
          <div className="cp-loading">
            <div className="cp-spinner" /> Loading activity…
          </div>
        ) : (
          <>
            <ActivityTrendChart
              series={monthlySeries}
              selectedMonth={selectedMonth}
              onSelectMonth={(k) =>
                setSelectedMonth((prev) => (prev === k ? null : k))
              }
            />
            {selectedMonth && (
              <MonthDrilldown
                monthKey={selectedMonth}
                items={monthItems}
                onClose={() => setSelectedMonth(null)}
              />
            )}
          </>
        )}
        <div
          className="cp-profile-section-title"
          style={{ alignSelf: "flex-start" }}
        >
          Account
        </div>
        <div className="cp-profile-logout-wrap">
          <button className="cp-theme-toggle" onClick={onToggleTheme}>
            {theme === "dark" ? <IcoSun /> : <IcoMoon />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <button
            className="cp-profile-logout"
            onClick={() => setShowLogoutModal(true)}
          >
            <IcoLogout /> Log out
          </button>

          {showLogoutModal && (
            <div
              className="logout-backdrop"
              onClick={() => setShowLogoutModal(false)}
            >
              <div
                className="logout-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="logout-modal-icon">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </div>

                <div className="logout-modal-title">Sign Out?</div>
                <div className="logout-modal-sub">
                  You'll be returned to the login screen. Any unsaved changes
                  will be lost.
                </div>

                {user && (
                  <div className="logout-modal-user">
                    <div className="logout-modal-avatar">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="logout-modal-uname">{user.name}</div>
                      <div className="logout-modal-urole">
                        {user.role || user.designation || ""}
                      </div>
                    </div>
                  </div>
                )}

                <div className="logout-modal-btns">
                  <button
                    className="logout-btn-cancel"
                    onClick={() => setShowLogoutModal(false)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Cancel
                  </button>
                  <button className="logout-btn-confirm" onClick={onLogout}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Yes, Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
function assignedSitesFromUser(u) {
  if (!u) return [];
  const sites = parseSiteNames(u.site_names);
  const primary = String(u.site_name || "").trim();
  const combined =
    primary && !sites.some((s) => s.toLowerCase() === primary.toLowerCase())
      ? [primary, ...sites]
      : sites.length
        ? sites
        : primary
          ? [primary]
          : [];
  const seen = new Set();
  return combined.filter((s) => {
    const key = String(s || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ClientPortal() {
  const [user, setUser] = useState(null);
  const [activeSite, setActiveSite] = useState("");
  const [allSites, setAllSites] = useState([]);
  const [section, setSection] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // state additions in ClientPortal
  const [theme, setTheme] = useState(
    () => localStorage.getItem("cp_theme") || "light",
  );
  useEffect(() => {
    localStorage.setItem("cp_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const [browse, setBrowse] = useState(null);
  const navigate = useNavigate();
  const { logout, user: authUser } = useAuth();

  const handleLogout = () => {
    logout();
    localStorage.removeItem("portalName");
    navigate("/login", { replace: true });
  };

  const goToSection = (key) => {
    setSection(key);
    scrollToTop();
  };

  const handleBrowse = (sel) => {
    setBrowse(sel);
    setSection("media");
    scrollToTop();
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const portal = await api("/client/portal");
        if (cancelled) return;
        const sites = assignedSitesFromUser({
          site_name: portal.user?.site_name,
          site_names: portal.sites || portal.user?.site_names,
        });
        const u = portal.user || {};
        setUser({
          name: u.full_name || authUser?.full_name || "Client",
          username: u.username || authUser?.username,
          role: "Client",
          designation: "Client",
          site_name: sites[0] || "",
          site_names: sites,
        });
        setAllSites(sites);
        setActiveSite(sites[0] || "");
      } catch (_) {
        if (cancelled) return;
        const stored = localStorage.getItem("user");
        if (stored) {
          try {
            const u = JSON.parse(stored);
            setUser({ ...u, role: "Client", designation: "Client", name: u.name || authUser?.full_name });
            const sites = assignedSitesFromUser(u);
            setAllSites(sites);
            setActiveSite(sites[0] || "");
            return;
          } catch (_) {}
        }
        if (authUser) {
          const sites = assignedSitesFromUser(authUser);
          setUser({
            name: authUser.full_name,
            username: authUser.username,
            role: "Client",
            designation: "Client",
            site_name: sites[0] || "",
            site_names: sites,
          });
          setAllSites(sites);
          setActiveSite(sites[0] || "");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) setMobileNavOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!user) {
    return (
      <>
        <Navbar />
        <div className="cp-loading" style={{ paddingTop: 80 }}>
          <div className="cp-spinner" /> Loading portal…
        </div>
      </>
    );
  }

  const displayName = user.name || user.username || "Client";
  const displayRole = user.role || user.department || "Client";

  const NAV_ITEMS = [
    { key: "overview", label: "Overview", icon: IcoHome },
    { key: "media", label: "Files", icon: IcoFolder },
  ];

  return (
    <>
      <Navbar
        onMenuToggle={() => setMobileNavOpen((v) => !v)}
        menuOpen={mobileNavOpen}
        onLogout={handleLogout}
      />
      <div className={`cp-wrap${theme === "dark" ? " theme-dark" : ""}`}>
        <div className="cp-shell">
          <div
            className={`cp-menu-backdrop${mobileNavOpen ? " open" : ""}`}
            onClick={() => setMobileNavOpen(false)}
          />

          <div className={`cp-mobile-drawer${mobileNavOpen ? " open" : ""}`}>
            <div className="cp-drawer-scroll">
              {allSites.length > 1 && (
                <div
                  className="cp-sidebar-section"
                  style={{ padding: "0 4px 8px" }}
                >
                  <div className="cp-sidebar-eyebrow">Site</div>
                  <div className="cp-site-list">
                    {allSites.map((s) => (
                      <button
                        key={s}
                        className={`cp-site-btn${activeSite === s ? " act" : ""}`}
                        onClick={() => {
                          setActiveSite(s);
                          setBrowse(null);
                          setMobileNavOpen(false);
                        }}
                      >
                        <span className="cp-site-dot" /> {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

                <nav className="cp-nav" style={{ padding: "8px 4px 10px" }}>
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      className={`cp-nav-item${section === item.key ? " act" : ""}`}
                      onClick={() => {
                        goToSection(item.key);
                        setMobileNavOpen(false);
                      }}
                    >
                      <Icon />
                      {item.label}
                    </button>
                  );
                })}

                <MediaFolderTree
                  siteName={activeSite}
                  browse={browse}
                  onBrowse={(sel) => {
                    handleBrowse(sel);
                    setMobileNavOpen(false);
                  }}
                />
              </nav>
            </div>

            <div className="cp-drawer-footer">
              <button
                className="cp-user-card cp-user-card-btn"
                onClick={() => {
                  setSection("profile");
                  setMobileNavOpen(false);
                  scrollToTop();
                }}
              >
                <div className="cp-user-avatar">{initials(displayName)}</div>
                <div className="cp-user-meta">
                  <div className="cp-user-name">{displayName}</div>
                  <div className="cp-user-role">{displayRole}</div>
                </div>
              </button>
            </div>
          </div>

          {activeSite && (
            <aside className="cp-sidebar">
              <div className="cp-sidebar-scroll">
                {allSites.length > 1 && (
                  <div className="cp-sidebar-section">
                    <div className="cp-sidebar-eyebrow">Site</div>
                    <div className="cp-site-list">
                      {allSites.map((s) => (
                        <button
                          key={s}
                          className={`cp-site-btn${activeSite === s ? " act" : ""}`}
                          onClick={() => {
                            setActiveSite(s);
                            setBrowse(null);
                          }}
                        >
                          <span className="cp-site-dot" /> {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <nav className="cp-nav">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        className={`cp-nav-item${section === item.key ? " act" : ""}`}
                        onClick={() => goToSection(item.key)}
                      >
                        <Icon />
                        {item.label}
                      </button>
                    );
                  })}

                  <MediaFolderTree
                    siteName={activeSite}
                    browse={browse}
                    onBrowse={handleBrowse}
                  />
                </nav>
              </div>

              <div className="cp-sidebar-footer">
                <button
                  className="cp-user-card cp-user-card-btn"
                  onClick={() => {
                    setSection("profile");
                    scrollToTop();
                  }}
                >
                  <div className="cp-user-avatar">{initials(displayName)}</div>
                  <div className="cp-user-meta">
                    <div className="cp-user-name">{displayName}</div>
                    <div className="cp-user-role">{displayRole}</div>
                  </div>
                </button>
              </div>
            </aside>
          )}

          <main className="cp-main">
            <div className="cp-main-inner">
              {activeSite ? (
                <>
                  <div className="cp-page-header">
                    <div>
                      <div className="cp-page-title">
                        {SECTIONS[section].title}
                      </div>
                      <div className="cp-page-sub">
                        Active Site: <strong>{activeSite}</strong>
                      </div>
                    </div>
                  </div>

                  {section === "overview" && (
                    <Overview
                      siteName={activeSite}
                      onNavigate={goToSection}
                    />
                  )}
                  {section === "media" && (
                    <ReportsAndPhotos
                      siteName={activeSite}
                      browse={browse}
                      onClearBrowse={() => setBrowse(null)}
                      onBrowse={handleBrowse}
                    />
                  )}
                  {section === "profile" && (
                    <ProfilePage
                      siteName={activeSite}
                      onLogout={handleLogout}
                      theme={theme}
                      onToggleTheme={toggleTheme}
                    />
                  )}
                </>
              ) : (
                <div className="cp-nosite-shell">
                  <div className="cp-empty">
                    <IcoBox />
                    <div className="cp-empty-title">No site assigned</div>
                    <div className="cp-empty-sub">
                      This client login has no project site yet. Ask admin to
                      open Employees, edit this client, and assign the site.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
