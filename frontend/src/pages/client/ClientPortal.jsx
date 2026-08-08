import { useEffect, useState, useCallback } from "react";
import Navbar from "../../components/Navbar";
import { supabase } from "../../lib/supabase";
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

function buildDateTree(dates) {
  const years = {};
  dates.filter(Boolean).forEach((iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return;
    const y = d.getFullYear(),
      m = d.getMonth();
    const dayKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
          key: `${y}-${m}`,
          label: MONTH_NAMES[m],
          total: Object.values(years[y][m]).reduce((s, c) => s + c, 0),
          days: Object.entries(years[y][m])
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dayKey, count]) => ({
              key: dayKey,
              count,
              label: new Date(dayKey).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              }),
            })),
        })),
    }));
}

function MediaFolderTree({ siteName, activeDate, onSelectDate }) {
  const [tree, setTree] = useState(null);
  const [openYears, setOpenYears] = useState({});
  const [openMonths, setOpenMonths] = useState({});

  useEffect(() => {
    if (!siteName) return;
    (async () => {
      const [{ data: dprRows }, { data: wprRows }, { data: drawingRows }] = await Promise.all([
        supabase
          .from("dpr_reports")
          .select("id, date, payload")
          .ilike("site", siteName),
        supabase
          .from("wpr_reports")
          .select("id, report_date")
          .ilike("site_name", siteName),
        supabase
          .from("drawings")
          .select("id, date, file_urls")
          .ilike("site_name", siteName),
      ]);
      const wprIds = (wprRows || []).map((w) => w.id);

      let imgDates = [];
      if (wprIds.length) {
        const { data } = await supabase
          .from("wpr_images")
          .select("created_at")
          .in("wpr_report_id", wprIds)
          .in("image_type", ["site_photo", "site_photos", "graphical"]);
        imgDates = (data || []).map((r) => r.created_at);
      }

      // DPR photos now live in payload.photos, not a separate table
      const dprPhotoDates = (dprRows || []).flatMap((r) => {
        const photos = Array.isArray(r?.payload?.photos)
          ? r.payload.photos
          : [];
        return photos.length ? photos.map(() => r.date) : [];
      });

      const drawingDates = (drawingRows || []).flatMap((d) => {
        const files = Array.isArray(d.file_urls) ? d.file_urls : [];
        return files.length ? files.map(() => d.date) : [];
      });

      const allDates = [
        ...(dprRows || []).map((r) => r.date),
        ...(wprRows || []).map((r) => r.report_date),
        ...imgDates,
        ...dprPhotoDates,
        ...drawingDates,
      ];
      const t = buildDateTree(allDates);
      setTree(t);
      if (t[0]) {
        setOpenYears({ [t[0].key]: true });
        if (t[0].months[0]) setOpenMonths({ [t[0].months[0].key]: true });
      }
    })();
  }, [siteName]);

  if (!tree) return <div className="cp-tree-empty">Loading…</div>;
  if (!tree.length)
    return <div className="cp-tree-empty">No dated activity yet</div>;

  return (
    <div className="cp-tree">
      {tree.map((y) => (
        <div key={y.key}>
          <div
            className="cp-tree-row"
            onClick={() => setOpenYears((s) => ({ ...s, [y.key]: !s[y.key] }))}
          >
            <IcoChevron open={!!openYears[y.key]} />
            <span className="cp-tree-label">{y.label}</span>
            <span className="cp-tree-count">{y.total}</span>
          </div>
          {openYears[y.key] && (
            <div className="cp-tree-children">
              {y.months.map((m) => (
                <div key={m.key}>
                  <div
                    className="cp-tree-row"
                    onClick={() =>
                      setOpenMonths((s) => ({ ...s, [m.key]: !s[m.key] }))
                    }
                  >
                    <IcoChevron open={!!openMonths[m.key]} />
                    <span className="cp-tree-label">{m.label}</span>
                    <span className="cp-tree-count">{m.total}</span>
                  </div>
                  {openMonths[m.key] && (
                    <div className="cp-tree-children">
                      {m.days.map((d) => (
                        <div
                          key={d.key}
                          className={`cp-tree-row${activeDate === d.key ? " act" : ""}`}
                          onClick={() => onSelectDate(d.key)}
                        >
                          <span className="cp-tree-leaf-dot" />
                          <span className="cp-tree-label">{d.label}</span>
                          <span className="cp-tree-count">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
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
function Overview({ siteName, onNavigate, newRequestCount }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    accepted: 0,
    rejected: 0,
    dpr: 0,
    wpr: 0,
    photos: 0,
  });
  const [recent, setRecent] = useState([]);

  const load = useCallback(async () => {
    if (!siteName) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: matRows } = await supabase
      .from("material_requirements")
      .select(
        "id, status, material_name, quantity, unit_name, created_at, actioned_at",
      )
      .ilike("site_name", siteName)
      .order("created_at", { ascending: false });

    const { count: dprCount } = await supabase
      .from("dpr_reports")
      .select("id", { count: "exact", head: true })
      .ilike("site", siteName);

    const { data: wprRows } = await supabase
      .from("wpr_reports")
      .select("id")
      .ilike("site_name", siteName);
    const wprIds = (wprRows || []).map((w) => w.id);

    let photoCount = 0;
    if (wprIds.length) {
      const { count } = await supabase
        .from("wpr_images")
        .select("id", { count: "exact", head: true })
        .in("wpr_report_id", wprIds);
      photoCount = count || 0;
    }

    const rows = matRows || [];
    setStats({
      pending: rows.filter((r) => r.status === "pending").length,
      accepted: rows.filter((r) => r.status === "received").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      dpr: dprCount || 0,
      wpr: wprIds.length,
      photos: photoCount,
    });
    setRecent(rows.slice(0, 6));
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
            Track procurement approvals, review project documents, and stay
            aligned with the latest site activity in one place.
          </div>
        </div>
        <div className="cp-hero-pill">
          <span>{stats.pending}</span>
          <small>pending</small>
        </div>
      </div>

      <div className="cp-stats cols-6">
        <div className="cp-stat">
          <div className="cp-stat-num amber">
            {loading ? <StatSkeleton /> : stats.pending}
          </div>
          <div className="cp-stat-label">Pending</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-num green">
            {loading ? <StatSkeleton /> : stats.accepted}
          </div>
          <div className="cp-stat-label">Accepted</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat-num red">
            {loading ? <StatSkeleton /> : stats.rejected}
          </div>
          <div className="cp-stat-label">Rejected</div>
        </div>
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
        <button
          className="cp-quick-card"
          onClick={() => onNavigate("materials")}
        >
          {!!newRequestCount && (
            <span className="cp-quick-badge">{newRequestCount}</span>
          )}
          <div className="cp-quick-icon">
            <IcoBoxNav />
          </div>
          <div className="cp-quick-title">Material Requests</div>
          <div className="cp-quick-sub">
            Review and action pending procurement requests from site.
          </div>
          <div className="cp-quick-arrow">
            Open <IcoArrow />
          </div>
        </button>
        <button className="cp-quick-card" onClick={() => onNavigate("media")}>
          <div className="cp-quick-icon">
            <IcoFolder />
          </div>
          <div className="cp-quick-title">Reports &amp; Photos</div>
          <div className="cp-quick-sub">
            Browse daily reports, weekly reports and site photos.
          </div>
          <div className="cp-quick-arrow">
            Open <IcoArrow />
          </div>
        </button>
      </div>

      <div
        className="cp-section-head"
        style={{ justifyContent: "space-between" }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "var(--ink)",
            fontFamily: "var(--font-display)",
          }}
        >
          Recent Activity
        </div>
      </div>

      {loading ? (
        <div className="cp-loading">
          <div className="cp-spinner" /> Loading activity…
        </div>
      ) : !recent.length ? (
        <div className="cp-empty">
          <IcoBox />
          <div className="cp-empty-title">No activity yet</div>
          <div className="cp-empty-sub">
            Material requests from the site team will show up here.
          </div>
        </div>
      ) : (
        <div className="cp-feed">
          {recent.map((r) => (
            <div className="cp-feed-row" key={r.id}>
              <div className={`cp-feed-icon ${r.status}`}>
                {r.status === "pending" ? (
                  <IcoClock />
                ) : r.status === "received" ? (
                  <IcoCheck />
                ) : (
                  <IcoX />
                )}
              </div>
              <div className="cp-feed-main">
                <div className="cp-feed-title">
                  {r.material_name} — {r.quantity} {r.unit_name}
                </div>
                <div className="cp-feed-meta">
                  {r.status === "pending"
                    ? "Awaiting your review"
                    : r.status === "received"
                      ? "Accepted"
                      : "Rejected"}
                </div>
              </div>
              <div className="cp-feed-time">
                {fmtDateShort(r.actioned_at || r.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
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
    let q = supabase
      .from("material_requirements")
      .select("*")
      .ilike("site_name", siteName);
    const dbStatus = dbStatusForFilter(filter);
    if (dbStatus) q = q.eq("status", dbStatus);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }, [siteName, filter]);

  const loadStats = useCallback(async () => {
    if (!siteName) return;
    const { data } = await supabase
      .from("material_requirements")
      .select("id, status")
      .ilike("site_name", siteName);
    setAllRows(data || []);
    if (onStatsChange) {
      onStatsChange((data || []).filter((r) => r.status === "pending").length);
    }
  }, [siteName, onStatsChange]);

  useEffect(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  const handleAction = async (id, newStatus, materialName) => {
    const { error } = await supabase
      .from("material_requirements")
      .update({
        status: newStatus,
        actioned_at: new Date().toISOString(),
        actioned_by: userName || "Client",
      })
      .eq("id", id);

    if (error) {
      showToast("err", "Update failed: " + error.message);
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
  if (!isOffice) return url;
  // Desktop embed preview; mobile full Office viewer
  return isMobileDevice() ? officeViewerUrl(url) : officeEmbedPreviewUrl(url);
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
function isOfficeFile(url) {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop().toLowerCase();
  return ["ppt", "pptx", "doc", "docx", "xls", "xlsx"].includes(ext);
}
// ─── Reports & Photos panel ────────────────────────────────────────────────
function ReportsAndPhotos({ siteName, jumpDate, onClearJump }) {
  const [dprs, setDprs] = useState([]);
  const [wprs, setWprs] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("recent"); // recent | day | month | year
  const [typeFilter, setTypeFilter] = useState("all"); // all | dpr | wpr | photo
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
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
  useEffect(() => {
    if (jumpDate) setViewMode("day");
  }, [jumpDate]);

  const load = useCallback(async () => {
    if (!siteName) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: dprData, error: dprErr } = await supabase
      .from("dpr_reports")
      .select(
        "id, site, engineer, report_type, date, pdf_url, created_at, payload",
      )
      .ilike("site", siteName)
      .order("date", { ascending: false });
    if (dprErr) console.error("dpr_reports error:", dprErr);
    setDprs(dprData || []);

    const { data: wprData, error: wprErr } = await supabase
      .from("wpr_reports")
      .select(
        "id, site_name, engineer_name, report_date, report_number, presentation_url, created_at",
      )
      .ilike("site_name", siteName)
      .order("report_date", { ascending: false });
    if (wprErr) console.error("wpr_reports error:", wprErr);
    setWprs(wprData || []);

    const wprIds = (wprData || []).map((w) => w.id);

    let wprPhotoRows = [];
    if (wprIds.length) {
      const { data: imgData, error: imgErr } = await supabase
        .from("wpr_images")
        .select(
          "id, wpr_report_id, image_type, public_url, storage_path, caption, created_at",
        )
        .in("wpr_report_id", wprIds)
        .in("image_type", ["site_photo", "site_photos", "graphical"]);
      if (imgErr) console.error("wpr_images error:", imgErr);
      wprPhotoRows = (imgData || []).map((p) => ({
        ...p,
        source: "wpr",
        public_url: p.public_url || p.supabaseUrl || null,
      }));
    }

    const dprPhotoRows = (dprData || []).flatMap((report, reportIndex) => {
      const photos = Array.isArray(report?.payload?.photos)
        ? report.payload.photos
        : [];
      return photos.filter(Boolean).map((photo, photoIndex) => ({
        id: `${report.id}-${photoIndex}`,
        dpr_report_id: report.id,
        public_url: photo.supabaseUrl || photo.publicUrl || photo.url || null,
        storage_path: photo.storagePath || photo.storage_path || null,
        caption: photo.caption || "",
        created_at: report.date || report.created_at,
        actual_created_at: report.created_at || report.date,
        source: "dpr",
        image_type: "photos",
      }));
    });

    const { data: drawingData, error: drawErr } = await supabase
      .from("drawings")
      .select("id, site_name, date, file_urls, uploaded_by, created_at")
      .ilike("site_name", siteName)
      .order("date", { ascending: false });
    if (drawErr) console.error("drawings error:", drawErr);

    const drawingPhotoRows = (drawingData || []).flatMap((d) => {
      const files = Array.isArray(d.file_urls) ? d.file_urls : [];
      return files.map((f, i) => ({
        id: `drw-${d.id}-${i}`,
        public_url: f.url || f.publicUrl || null,
        caption: f.name || "Drawing",
        created_at: d.date || d.created_at,
        source: "drawing",
        image_type: "graphical",
      }));
    });

    setPhotos([...wprPhotoRows, ...dprPhotoRows, ...drawingPhotoRows]);

    setLoading(false);
  }, [siteName]);

  useEffect(() => {
    load();
  }, [load]);

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const unified = [
    ...dprs
      .filter((r) => r.report_type !== "morning")
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
  date: r.report_date || r.created_at,       // used for sorting/grouping by report period
  displayDate: r.created_at || r.report_date, // used for showing actual time
  title: `Weekly Report #${r.report_number || ""}`,
  meta: r.engineer_name,
  url: r.presentation_url,
  kind: "doc",
  isOffice: isOfficeFile(r.presentation_url),
})),
    ...photos.map((p) => {
      const isGraphical = p.image_type === "graphical";
      const isActualImage = !isGraphical || isImageFile(p.public_url);
      return {
        type: isGraphical ? "graphical" : "photo",
        date: p.created_at,
        displayDate: p.actual_created_at || p.created_at,
        title:
          p.caption ||
          (isGraphical ? "Graphical Drawing" : "Site Photo"),
        meta:
          isGraphical
            ? "Weekly Report"
            : p.source === "dpr"
              ? "Daily Report"
              : "Weekly Report",
        url: p.public_url,
        kind: isActualImage ? "image" : "doc",
        isOffice: isOfficeFile(p.public_url),
      };
    }),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const dateScoped = jumpDate
    ? unified.filter((it) => it.date && it.date.slice(0, 10) === jumpDate)
    : unified;

  const counts = {
    all: dateScoped.length,
    dpr: dateScoped.filter((it) => it.type === "dpr").length,
    wpr: dateScoped.filter((it) => it.type === "wpr").length,
    photo: dateScoped.filter((it) => it.type === "photo").length,
    graphical: dateScoped.filter((it) => it.type === "graphical").length,
  };

  const scoped = dateScoped
    .filter((it) => typeFilter === "all" || it.type === typeFilter)
    .filter((it) => {
      if (viewMode !== "range") return true;
      if (!it.date) return false;
      const d = it.date.slice(0, 10);
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

  const VIEW_MODES = [
    { key: "recent", label: "Recent" },
    { key: "day", label: "By Day" },
    { key: "month", label: "By Month" },
    { key: "year", label: "By Year" },
    { key: "range", label: "Date Range" },
  ];

  const TYPE_FILTERS = [
    {
      key: "all",
      label: `All (${counts.all})`,
      cls: "type-all",
      icon: <IcoLayers />,
    },
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
      label: ` Monthly Reports (${counts.wpr})`,
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

  const activeViewLabel =
    VIEW_MODES.find((v) => v.key === viewMode)?.label || "Recent";
  const activeTypeLabel =
    TYPE_FILTERS.find((f) => f.key === typeFilter)?.label || "All";
  return (
    <div>
      {jumpDate && (
        <div className="cp-tree-jump-chip">
          Showing{" "}
          {new Date(jumpDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
          <button onClick={onClearJump}>
            <IcoX />
          </button>
        </div>
      )}

      <div className="cp-filter-bar">
        <button
          type="button"
          className={`cp-filter-toggle${filterOpen ? " open" : ""}`}
          onClick={() => setFilterOpen((o) => !o)}
        >
          <IcoFilter />
          <span className="cp-filter-toggle-text">
            {activeViewLabel} · {activeTypeLabel}
          </span>
          <span className="cp-filter-toggle-chevron">
            <IcoChevron open={filterOpen} />
          </span>
        </button>

        <div className={`cp-filter-panel${filterOpen ? " open" : ""}`}>
          <div className="cp-viewmodes">
            {VIEW_MODES.map((v) => (
              <button
                key={v.key}
                className={`cp-chip${viewMode === v.key ? " act" : ""}`}
                onClick={() => {
                  setViewMode(v.key);
                  if (jumpDate && onClearJump) onClearJump();
                  scrollToTop();
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          {viewMode === "range" && (
            <div className="cp-range-picker">
              <div className="cp-range-field">
                <label>From</label>
                <div className="cp-date-wrap">
                  <input
                    type="date"
                    value={rangeStart}
                    max={rangeEnd || undefined}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                  {!rangeStart && (
                    <span className="cp-date-placeholder">dd-mm-yyyy</span>
                  )}
                </div>
              </div>
              <span className="cp-range-sep">→</span>
              <div className="cp-range-field">
                <label>To</label>
                <div className="cp-date-wrap">
                  <input
                    type="date"
                    value={rangeEnd}
                    min={rangeStart || undefined}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                  {!rangeEnd && (
                    <span className="cp-date-placeholder">dd-mm-yyyy</span>
                  )}
                </div>
              </div>
              {(rangeStart || rangeEnd) && (
                <button
                  className="cp-range-clear"
                  onClick={() => {
                    setRangeStart("");
                    setRangeEnd("");
                  }}
                >
                  <IcoX /> Clear
                </button>
              )}
            </div>
          )}

          <div className="cp-typefilters">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`cp-chip${typeFilter === f.key ? " act " + f.cls : ""}`}
                onClick={() => {
                  setTypeFilter(f.key);
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

      {loading ? (
        <MediaSkeletonGrid count={8} />
      ) : !scoped.length ? (
        <div className="cp-empty">
          <IcoBox />
          <div className="cp-empty-title">
            {viewMode === "range" && (rangeStart || rangeEnd)
              ? "No results in this range"
              : "Nothing here yet"}
          </div>
          <div className="cp-empty-sub">
            {viewMode === "range" && (rangeStart || rangeEnd)
              ? "Try widening the date range or clearing a filter."
              : "Daily reports, weekly reports and site photos will appear here once submitted."}
          </div>
        </div>
      ) : (
        groupLabels.map((label) => (
          <div key={label}>
            {viewMode !== "recent" && (
              <div className="cp-group-hdr">{label}</div>
            )}
            <div className="cp-media-grid">
              {grouped[label].map((it, i) => (
                <div key={i} className={`cp-media-card type-${it.type}`}>
                  {it.kind === "image" ? (
                    it.url ? (
                      <img
                        className="cp-media-photo"
                        src={it.url}
                        alt=""
                        onClick={() => setLightboxUrl(it.url)}
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
                    it.isOffice ? (
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
                        onClick={() =>
                          window.open(
                            resolveViewUrl(it.url, it.isOffice),
                            "_blank",
                          )
                        }
                      >
                        <IcoDocBars w={32} h={32} />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          Open Presentation
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
                        onClick={() =>
                          window.open(
                            resolveViewUrl(it.url, it.isOffice),
                            "_blank",
                          )
                        }
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
                      {it.type === "dpr" ? (
                        <IcoDoc />
                      ) : it.type === "wpr" ? (
                        <IcoDoc />
                      ) : (
                        <IcoImg />
                      )}
                      {it.type === "dpr"
                        ? "Daily Report"
                        : it.type === "wpr"
                          ? "Weekly Report"
                          : it.type === "graphical"
                            ? "Graphical Drawing"
                            : "Site Photo"}
                    </span>
                    <div className="cp-media-title">{it.title}</div>
                    <div className="cp-media-meta">
                      <IcoClock /> {fmtDateTime(it.displayDate || it.date)}
                    </div>
                    {it.kind === "doc" &&
                      (it.url ? (
                        <div className="cp-media-actions">
                          <a
                            className="cp-media-link"
                            href={resolveViewUrl(it.url, it.isOffice)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <IcoEye /> View
                          </a>
                         <button
  type="button"
  className="cp-media-link dl"
  onClick={() => forceDownload(it.url, it.title || "file")}
>
  <IcoDl /> Download
</button>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#bbb",
                            fontStyle: "italic",
                          }}
                        >
                          No file attached
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {lightboxUrl && (
        <div className="cp-lightbox" onClick={() => setLightboxUrl(null)}>
          <button
            className="cp-lightbox-close"
            onClick={() => setLightboxUrl(null)}
          >
            ✕
          </button>
          <img src={lightboxUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────
const SECTIONS = {
  overview: { title: "Overview", sub: "" },
  materials: {
    title: "Material Requests",
    sub: "Review and action procurement requests from site.",
  },
  media: {
    title: "Reports & Photos",
    sub: "Daily reports, weekly reports and site photos.",
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

async function forceDownload(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Download failed:", err);
    // fallback: open in new tab if fetch/blob fails (e.g. CORS)
    window.open(url, "_blank");
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
      const { data, error } = await supabase
        .from("site_details")
        .select(
          "site_name, client_name, head_name, head_contact_no, incharge_name, incharge_contact_no, pc_name, pc_contact_no, status, site_image_url, job_no",
        )
        .eq("site_name", siteName)
        .maybeSingle();
      if (error) console.error("site_details error:", error);
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

      const { data: dprData } = await supabase
        .from("dpr_reports")
        .select("id, date, created_at, report_type, payload")
        .ilike("site", siteName);

      const { data: wprData } = await supabase
        .from("wpr_reports")
        .select("id, report_date, created_at")
        .ilike("site_name", siteName);

      const wprIds = (wprData || []).map((w) => w.id);
      let wprPhotoRows = [];
      if (wprIds.length) {
        const { data: imgData } = await supabase
          .from("wpr_images")
          .select("id, image_type, created_at")
          .in("wpr_report_id", wprIds)
          .in("image_type", ["site_photo", "site_photos", "graphical"]);
        wprPhotoRows = imgData || [];
      }

      const dprPhotoRows = (dprData || []).flatMap((r) => {
        const photos = Array.isArray(r?.payload?.photos)
          ? r.payload.photos
          : [];
        return photos.map(() => ({ created_at: r.date || r.created_at }));
      });

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
      role: "Site Incharge",
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
export default function ClientPortal() {
  const [user, setUser] = useState(null);
  const [activeSite, setActiveSite] = useState("");
  const [allSites, setAllSites] = useState([]);
  const [section, setSection] = useState("overview");
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // state additions in ClientPortal
  const [theme, setTheme] = useState(
    () => localStorage.getItem("cp_theme") || "light",
  );
  const loadPendingCount = useCallback(async () => {
    if (!activeSite) return;
    const { count } = await supabase
      .from("material_requirements")
      .select("id", { count: "exact", head: true })
      .ilike("site_name", activeSite)
      .eq("status", "pending");
    setPendingCount(count || 0);
  }, [activeSite]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);
  useEffect(() => {
    localStorage.setItem("cp_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const [jumpDate, setJumpDate] = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    localStorage.removeItem("portalName");
    navigate("/login", { replace: true });
  };

  const goToSection = (key) => {
    setSection(key);
    scrollToTop();
  };

  const handleSelectDate = (dayKey) => {
    setJumpDate(dayKey);
    setSection("media");
    scrollToTop();
  };
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) return;
    try {
      const u = JSON.parse(stored);
      setUser(u);

      const sites = parseSiteNames(u.site_names);
      const primary = (u.site_name || "").trim();
      const combined =
        primary && !sites.some((s) => s.toLowerCase() === primary.toLowerCase())
          ? [primary, ...sites]
          : sites.length
            ? sites
            : primary
              ? [primary]
              : [];

      setAllSites(combined);
      setActiveSite(combined[0] || "");
    } catch (_) {}
  }, []);

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
    {
      key: "materials",
      label: "Material Requests",
      icon: IcoBoxNav,
      badge: pendingCount,
    },
    { key: "media", label: "Reports & Photos", icon: IcoFolder },
  ];

  return (
    <>
      <Navbar
        onMenuToggle={() => setMobileNavOpen((v) => !v)}
        menuOpen={mobileNavOpen}
      />
      <div className={`cp-wrap${theme === "dark" ? " theme-dark" : ""}`}>
        <div className="cp-shell">
          <div
            className={`cp-menu-backdrop${mobileNavOpen ? " open" : ""}`}
            onClick={() => setMobileNavOpen(false)}
          />

          <div className={`cp-mobile-drawer${mobileNavOpen ? " open" : ""}`}>
            <div className="cp-drawer-head">
              <button
                className="cp-drawer-close"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
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
                      {!!item.badge && (
                        <span className="cp-nav-badge">{item.badge}</span>
                      )}
                    </button>
                  );
                })}

                {section === "media" && (
                  <MediaFolderTree
                    siteName={activeSite}
                    activeDate={jumpDate}
                    onSelectDate={(d) => {
                      handleSelectDate(d);
                      setMobileNavOpen(false);
                    }}
                  />
                )}
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
                          onClick={() => setActiveSite(s)}
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
                        {!!item.badge && (
                          <span className="cp-nav-badge">{item.badge}</span>
                        )}
                      </button>
                    );
                  })}

                  {section === "media" && (
                    <MediaFolderTree
                      siteName={activeSite}
                      activeDate={jumpDate}
                      onSelectDate={handleSelectDate}
                    />
                  )}
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
                      newRequestCount={pendingCount}
                    />
                  )}
                  {section === "materials" && (
                    <MaterialRequests
                      siteName={activeSite}
                      userName={displayName}
                      onStatsChange={setPendingCount}
                    />
                  )}
                  {section === "media" && (
                    <ReportsAndPhotos
                      siteName={activeSite}
                      jumpDate={jumpDate}
                      onClearJump={() => setJumpDate(null)}
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
                      Your account isn't linked to a project site yet. Contact
                      your project manager.
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
