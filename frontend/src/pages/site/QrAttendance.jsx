import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import Navbar from "../../components/Navbar";
import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import {
  ensureSiteBucket,
  SITE_FILES_BUCKET,
  uploadViaApi,
} from "../../lib/ensureBucket";
import "./QrAttendance.css";

const POPUP_MS = 2600;
/** Monday EA meeting desk QR (not clock-in). */
export const EA_MEETING_QR_TOKEN = "DIP-EA-MEETING";
/** @deprecated old token — still accepted so existing printed QR keeps working */
export const DESK_QR_TOKEN = EA_MEETING_QR_TOKEN;
const EA_QR_TOKENS = new Set(["DIP-EA-MEETING", "DIP-DESK-ATTENDANCE"]);
const EA_TABLE = "ea_meeting_attendance";

function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: isoDate(monday), end: isoDate(sunday) };
}

function normalizeRole(role) {
  return String(role || "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Site Engineer → 2 Excel uploads (Site Work + Site Engineer). */
function isSiteEngineerRole(role) {
  const r = normalizeRole(role);
  return (
    r.includes("site engineer") ||
    r === "siteengineer" ||
    (r.includes("engineer") && r.includes("site") && !r.includes("head"))
  );
}

/** Head / Incharge / Coordinator / others → only weekly plan (1 file). */
function needsDualExcelUpload(role) {
  return isSiteEngineerRole(role);
}

function isExcelFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv"
  );
}

function isEaMeetingQr(raw) {
  const text = String(raw || "").trim();
  if (!text) return false;
  if (EA_QR_TOKENS.has(text)) return true;
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      (EA_QR_TOKENS.has(obj.code) ||
        obj.type === "ea_meeting" ||
        obj.type === "desk_attendance")
    ) {
      return true;
    }
  } catch {
    /* not json */
  }
  try {
    const url = new URL(text);
    const code = url.searchParams.get("code") || url.searchParams.get("desk") || url.searchParams.get("ea");
    if (EA_QR_TOKENS.has(code)) return true;
    if (url.pathname.replace(/\/+$/, "") === "/site/qr-scan" && url.searchParams.has("code")) {
      return EA_QR_TOKENS.has(url.searchParams.get("code"));
    }
  } catch {
    /* not a url */
  }
  return [...EA_QR_TOKENS].some((t) => text.includes(t));
}

function hasEaCodeInUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get("code");
    return EA_QR_TOKENS.has(code);
  } catch {
    return false;
  }
}

function siteUserFromAuth(authUser) {
  if (!authUser) return null;
  try {
    const cached = JSON.parse(localStorage.getItem("user") || "null");
    if (cached?.user_name || cached?.username) return cached;
  } catch {
    /* ignore */
  }
  return {
    id: authUser.id || null,
    username: authUser.username || authUser.user_name,
    user_name: authUser.username || authUser.user_name,
    name: authUser.full_name || authUser.name,
    role: authUser.designation || authUser.site_role || authUser.role,
    department: authUser.department,
    site_name: authUser.site_name,
    site_names: authUser.site_names,
    status: authUser.is_active === false ? "Inactive" : "Active",
  };
}

async function fetchLoggedInEmployee(user) {
  const select =
    "id, username, name, role, department, site_name, site_names, status";
  const username = user?.user_name || user?.username;
  if (username) {
    const { data } = await supabase
      .from("user_details")
      .select(select)
      .eq("username", username)
      .maybeSingle();
    if (data) return data;
  }
  if (username || user?.name) {
    return {
      id: user.id || null,
      username,
      name: user.name,
      role: user.role,
      department: user.department,
      site_name: user.site_name,
      site_names: user.site_names,
      status: user.status,
    };
  }
  return null;
}

function buildSiteDatePath(date) {
  const [year, month, day] = date.split("-");
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthName = monthNames[parseInt(month, 10) - 1];
  const dayFolder = `${day}-${month}-${year}`;
  return `${year}/${monthName}/${dayFolder}`;
}

function employeeSiteName(employee) {
  if (employee?.site_name) return employee.site_name;
  if (Array.isArray(employee?.site_names) && employee.site_names[0]) return employee.site_names[0];
  return "";
}

async function uploadPlanFile(file, employee, slot) {
  const site = employeeSiteName(employee);
  if (!site) throw new Error("No site is assigned to your account, so the file cannot be saved.");
  const { prefix } = await ensureSiteBucket(site);
  const datePath = buildSiteDatePath(todayIST());
  const userFolder = String(employee.username || "user").replace(/[^\w.\-]+/g, "_");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${prefix}/${datePath}/ea-meeting/${userFolder}/${slot}.${ext}`;

  const url = await uploadViaApi({
    path,
    blob: file,
    contentType: file.type || "application/octet-stream",
    bucket: SITE_FILES_BUCKET,
  });
  return { url: url ? `${url.split("?")[0]}?t=${Date.now()}` : null, name: file.name };
}

export default function QrAttendance() {
  const navigate = useNavigate();
  const { user: authUser, isAuthenticated } = useAuth();
  const user = siteUserFromAuth(authUser);

  const [phase, setPhase] = useState(hasEaCodeInUrl() ? "loading" : "scan");
  const [camError, setCamError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scannedEmployee, setScannedEmployee] = useState(null);
  const [attendanceRow, setAttendanceRow] = useState(null);
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const scannerRef = useRef(null);
  const handlingRef = useRef(false);
  const week = currentWeekBounds();
  const dualExcel = needsDualExcelUpload(scannedEmployee?.role);

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (!inst) return;
    try {
      if (inst.isScanning) await inst.stop();
    } catch {
      /* already stopped */
    }
    try {
      await inst.clear();
    } catch {
      /* ignore */
    }
  }, []);

  const markPresent = useCallback(async (employee) => {
    const bounds = currentWeekBounds();
    // Always prefer TaskFlow auth identity so My Tasks / WhatsApp can find the row
    const authUsername = authUser?.username || user?.username || user?.user_name || employee.username;
    const authId = authUser?.id != null ? String(authUser.id) : (employee.id != null ? String(employee.id) : null);
    const payload = {
      meeting_week_start: bounds.start,
      meeting_week_end: bounds.end,
      scanned_at: new Date().toISOString(),
      employee_id: authId,
      employee_username: authUsername,
      employee_name: employee.name || authUser?.full_name || null,
      employee_role: employee.role || authUser?.designation || authUser?.role || null,
      employee_department: employee.department || authUser?.department || null,
      employee_site_name:
        employee.site_name ||
        (Array.isArray(employee.site_names) ? employee.site_names[0] : null) ||
        authUser?.site_name ||
        null,
      attendance_status: "present",
      scanned_by_username: authUsername || null,
      scanned_by_name: employee.name || authUser?.full_name || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(EA_TABLE)
      .upsert(payload, { onConflict: "employee_username,meeting_week_start" })
      .select()
      .single();

    if (error) throw error;
    return data;
  }, [authUser, user]);

  const checkInCurrentUser = useCallback(async () => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!user) throw new Error("Please log in first, then scan the EA meeting QR.");
      const employee = await fetchLoggedInEmployee(user);
      if (!employee?.username) throw new Error("Could not load your employee details.");
      await stopScanner();
      const row = await markPresent(employee);
      setScannedEmployee(employee);
      setAttendanceRow(row);
      setPhase("popup");
      try {
        const wa = await api("/ea-meeting/notify", {
          method: "POST",
          body: JSON.stringify({ kind: "present", weekStart: currentWeekBounds().start }),
        });
        if (wa?.reason === "no_whatsapp") {
          console.warn("EA present saved but user has no whatsapp_number");
        }
      } catch (waErr) {
        console.warn("EA WhatsApp notify skip:", waErr.message);
      }
      const url = new URL(window.location.href);
      if (url.searchParams.has("code")) {
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch (err) {
      setMessage(err.message || "Could not mark EA meeting attendance.");
      handlingRef.current = false;
      setPhase("scan");
    } finally {
      setBusy(false);
    }
  }, [user, markPresent, stopScanner]);

  const handleDecoded = useCallback(
    async (decodedText) => {
      if (!isEaMeetingQr(decodedText)) {
        setMessage("Please scan the Monday EA meeting QR only.");
        handlingRef.current = false;
        return;
      }
      await checkInCurrentUser();
    },
    [checkInCurrentUser]
  );

  useEffect(() => {
    if (isAuthenticated) return;
    const next = `${window.location.pathname}${window.location.search || `?code=${EA_MEETING_QR_TOKEN}`}`;
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!user || !hasEaCodeInUrl()) return;
    checkInCurrentUser();
  }, [user, checkInCurrentUser]);

  useEffect(() => {
    if (phase !== "scan") return undefined;
    handlingRef.current = false;
    setCamError("");
    let cancelled = false;

    (async () => {
      try {
        const html5Qr = new Html5Qrcode("qr-reader", { verbose: false });
        if (cancelled) return;
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: { width: 220, height: 220 } },
          (text) => {
            handleDecoded(text);
          }
        );
      } catch {
        if (!cancelled) {
          setCamError("Camera could not start. Allow camera access and try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [phase, handleDecoded, stopScanner]);

  useEffect(() => {
    if (phase !== "popup") return undefined;
    const t = setTimeout(() => setPhase("plan"), POPUP_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const submitWeeklyPlan = async (e) => {
    e.preventDefault();
    if (!attendanceRow?.id) return;
    if (!file1) {
      setMessage(
        dualExcel
          ? "Please attach Site Work Excel (file 1)."
          : "Please attach your weekly plan file."
      );
      return;
    }
    if (dualExcel && !file2) {
      setMessage("Site Engineers must attach 2 Excel files (Site Work + Site Engineer).");
      return;
    }
    if (dualExcel && (!isExcelFile(file1) || !isExcelFile(file2))) {
      setMessage("Both attachments must be Excel files (.xlsx / .xls / .csv).");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const a1 = await uploadPlanFile(
        file1,
        scannedEmployee,
        dualExcel ? "site-work" : "weekly-plan"
      );
      let a2 = { url: null, name: null };
      if (dualExcel && file2) {
        a2 = await uploadPlanFile(file2, scannedEmployee, "site-engineer");
      }
      const { error } = await supabase
        .from(EA_TABLE)
        .update({
          attachment_1_url: a1.url,
          attachment_1_name: a1.name,
          attachment_2_url: a2.url,
          attachment_2_name: a2.name,
          plan_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", attendanceRow.id);
      if (error) throw error;
      try {
        await api("/ea-meeting/notify", {
          method: "POST",
          body: JSON.stringify({
            kind: "uploaded",
            weekStart: week.start,
            fileName: file1?.name || null,
          }),
        });
      } catch (waErr) {
        console.warn("EA upload WhatsApp skip:", waErr.message);
      }
      setPhase("done");
    } catch (err) {
      setMessage(err.message || "Could not save EA meeting uploads.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetScan = () => {
    setPhase("scan");
    setScannedEmployee(null);
    setAttendanceRow(null);
    setFile1(null);
    setFile2(null);
    setMessage("");
    handlingRef.current = false;
  };

  if (!isAuthenticated || !user) return null;

  return (
    <div className="qr-page">
      <Navbar showQrScanner qrActive />

      <div className="qr-wrap">
        <button className="qr-back" type="button" onClick={() => navigate("/site")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Site Portal
        </button>

        <div className="qr-card">
          {(phase === "scan" || phase === "loading") && (
            <div className="qr-scan-body">
              <div id="qr-reader" className="qr-reader" />
              {(busy || phase === "loading") && (
                <div className="qr-busy">Marking EA meeting present…</div>
              )}
              {camError && <div className="qr-note">{camError}</div>}
              {message && <div className="qr-error">{message}</div>}
              {!busy && phase === "scan" && !camError && (
                <div className="qr-note">
                  Monday EA meeting attendance (not clock-in). Scan the desk QR or open the EA link.
                </div>
              )}
            </div>
          )}

          {phase === "plan" && scannedEmployee && (
            <form className="qr-plan" onSubmit={submitWeeklyPlan}>
              <div className="qr-emp-chip">
                <div className="qr-emp-av">{(scannedEmployee.name || "?").charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{scannedEmployee.name}</strong>
                  <span>
                    {scannedEmployee.role || "—"} · EA meeting present · week {week.start}
                  </span>
                </div>
              </div>

              <label className="qr-label">
                {dualExcel
                  ? "Excel uploads (2 required for Site Engineer)"
                  : "EA weekly plan"}
                <span className="qr-week">
                  {week.start} → {week.end}
                </span>
              </label>
              <label className="qr-file">
                <input
                  type="file"
                  accept={dualExcel ? ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : undefined}
                  onChange={(e) => setFile1(e.target.files?.[0] || null)}
                />
                <span>
                  {file1
                    ? file1.name
                    : dualExcel
                      ? "1. Site Work Excel"
                      : "Choose EA weekly plan file"}
                </span>
              </label>
              {dualExcel && (
                <label className="qr-file">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setFile2(e.target.files?.[0] || null)}
                  />
                  <span>{file2 ? file2.name : "2. Site Engineer Excel"}</span>
                </label>
              )}

              {message && <div className="qr-error">{message}</div>}

              <div className="qr-plan-actions">
                <button type="button" className="qr-btn-secondary" onClick={resetScan} disabled={submitting}>
                  Scan again
                </button>
                <button type="submit" className="qr-btn-primary" disabled={submitting}>
                  {submitting
                    ? "Saving…"
                    : dualExcel
                      ? "Submit Excel uploads"
                      : "Submit EA weekly plan"}
                </button>
              </div>
            </form>
          )}

          {phase === "done" && (
            <div className="qr-done">
              <div className="qr-done-ico">✓</div>
              <h2>{dualExcel ? "Excel uploads submitted" : "EA weekly plan submitted"}</h2>
              <p>
                Saved in <strong>ea_meeting_attendance</strong>.
                Portal pe dikhne ke liye: <strong>Site → My Tasks → Done</strong> tab
                (upload complete hone ke baad Open empty ho sakta hai).
                WhatsApp tab aayega agar aapke account pe <strong>whatsapp_number</strong> set hai.
              </p>
              <div className="qr-plan-actions">
                <button type="button" className="qr-btn-primary" onClick={() => navigate("/site?tab=my-tasks")}>
                  Open My Tasks
                </button>
                <button type="button" className="qr-btn-secondary" onClick={() => navigate("/site")}>
                  Site Portal
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {phase === "popup" && scannedEmployee && (
        <div className="qr-popup-backdrop">
          <div className="qr-popup">
            <div className="qr-popup-check">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2>EA meeting · Present</h2>
            <p className="qr-popup-name">{scannedEmployee.name}</p>
            <p className="qr-popup-meta">
              {scannedEmployee.role || "Employee"}
              {scannedEmployee.department ? ` · ${scannedEmployee.department}` : ""}
            </p>
            <p className="qr-popup-hint">Opening plan upload…</p>
          </div>
        </div>
      )}
    </div>
  );
}
