import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import Navbar from "../../components/Navbar";
import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  ensureSiteBucket,
  SITE_FILES_BUCKET,
  uploadViaApi,
} from "../../lib/ensureBucket";
import "./QrAttendance.css";

const POPUP_MS = 2600;
export const DESK_QR_TOKEN = "DIP-DESK-ATTENDANCE";

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

function isCoordinatorRole(role) {
  const r = String(role || "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
  return r.includes("coordinator") || r.includes("co ordinator");
}

function isDeskAttendanceQr(raw) {
  const text = String(raw || "").trim();
  if (!text) return false;
  if (text === DESK_QR_TOKEN) return true;
  try {
    const obj = JSON.parse(text);
    if (obj && (obj.code === DESK_QR_TOKEN || obj.type === "desk_attendance")) return true;
  } catch {
    /* not json */
  }
  try {
    const url = new URL(text);
    const code = url.searchParams.get("code") || url.searchParams.get("desk");
    if (code === DESK_QR_TOKEN) return true;
    if (url.pathname.replace(/\/+$/, "") === "/site/qr-scan" && url.searchParams.has("code")) {
      return url.searchParams.get("code") === DESK_QR_TOKEN;
    }
  } catch {
    /* not a url */
  }
  return text.includes(DESK_QR_TOKEN);
}

function hasDeskCodeInUrl() {
  try {
    return new URLSearchParams(window.location.search).get("code") === DESK_QR_TOKEN;
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
  const path = `${prefix}/${datePath}/weekly plan/${userFolder}/${slot}.${ext}`;

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

  const [phase, setPhase] = useState(hasDeskCodeInUrl() ? "loading" : "scan");
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
  const coordinator = isCoordinatorRole(scannedEmployee?.role);

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
    const payload = {
      scan_date: todayIST(),
      scanned_at: new Date().toISOString(),
      employee_id: employee.id != null ? String(employee.id) : null,
      employee_username: employee.username,
      employee_name: employee.name || null,
      employee_role: employee.role || null,
      employee_department: employee.department || null,
      employee_site_name:
        employee.site_name ||
        (Array.isArray(employee.site_names) ? employee.site_names[0] : null) ||
        null,
      attendance_status: "present",
      scanned_by_username: employee.username || null,
      scanned_by_name: employee.name || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("qr_site_attendance")
      .upsert(payload, { onConflict: "employee_username,scan_date" })
      .select()
      .single();

    if (error) throw error;
    return data;
  }, []);

  const checkInCurrentUser = useCallback(async () => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!user) throw new Error("Please log in first, then scan the desk QR.");
      const employee = await fetchLoggedInEmployee(user);
      if (!employee?.username) throw new Error("Could not load your employee details.");
      await stopScanner();
      const row = await markPresent(employee);
      setScannedEmployee(employee);
      setAttendanceRow(row);
      setPhase("popup");
      const url = new URL(window.location.href);
      if (url.searchParams.has("code")) {
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch (err) {
      setMessage(err.message || "Could not mark attendance.");
      handlingRef.current = false;
      setPhase("scan");
    } finally {
      setBusy(false);
    }
  }, [user, markPresent, stopScanner]);

  const handleDecoded = useCallback(
    async (decodedText) => {
      if (!isDeskAttendanceQr(decodedText)) {
        setMessage("Please scan the desk attendance QR only.");
        handlingRef.current = false;
        return;
      }
      await checkInCurrentUser();
    },
    [checkInCurrentUser]
  );

  useEffect(() => {
    if (isAuthenticated) return;
    const next = `${window.location.pathname}${window.location.search || `?code=${DESK_QR_TOKEN}`}`;
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!user || !hasDeskCodeInUrl()) return;
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
      setMessage("Please attach at least one file.");
      return;
    }
    if (coordinator && !file2) {
      setMessage("Co-ordinators must attach two files.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const a1 = await uploadPlanFile(file1, scannedEmployee, "file1");
      let a2 = { url: null, name: null };
      if (coordinator && file2) {
        a2 = await uploadPlanFile(file2, scannedEmployee, "file2");
      }
      const { error } = await supabase
        .from("qr_site_attendance")
        .update({
          week_start: week.start,
          week_end: week.end,
          attachment_1_url: a1.url,
          attachment_1_name: a1.name,
          attachment_2_url: a2.url,
          attachment_2_name: a2.name,
          plan_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", attendanceRow.id);
      if (error) throw error;
      setPhase("done");
    } catch (err) {
      setMessage(err.message || "Could not save weekly plan.");
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
                <div className="qr-busy">Marking you present…</div>
              )}
              {camError && <div className="qr-note">{camError}</div>}
              {message && <div className="qr-error">{message}</div>}
            </div>
          )}

          {phase === "plan" && scannedEmployee && (
            <form className="qr-plan" onSubmit={submitWeeklyPlan}>
              <div className="qr-emp-chip">
                <div className="qr-emp-av">{(scannedEmployee.name || "?").charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{scannedEmployee.name}</strong>
                  <span>
                    {scannedEmployee.role || "—"} · Present for {todayIST()}
                  </span>
                </div>
              </div>

              <label className="qr-label">
                {coordinator ? "Report attachments (2 required for Co-ordinator)" : "Report attachment"}
                <span className="qr-week">
                  {week.start} → {week.end}
                </span>
              </label>
              <label className="qr-file">
                <input type="file" onChange={(e) => setFile1(e.target.files?.[0] || null)} />
                <span>{file1 ? file1.name : coordinator ? "Choose file 1" : "Choose file"}</span>
              </label>
              {coordinator && (
                <label className="qr-file">
                  <input type="file" onChange={(e) => setFile2(e.target.files?.[0] || null)} />
                  <span>{file2 ? file2.name : "Choose file 2"}</span>
                </label>
              )}

              {message && <div className="qr-error">{message}</div>}

              <div className="qr-plan-actions">
                <button type="button" className="qr-btn-secondary" onClick={resetScan} disabled={submitting}>
                  Scan again
                </button>
                <button type="submit" className="qr-btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : "Submit weekly plan"}
                </button>
              </div>
            </form>
          )}

          {phase === "done" && (
            <div className="qr-done">
              <div className="qr-done-ico">✓</div>
              <h2>Weekly plan submitted</h2>
              <p>
                Attendance and weekly plan for <strong>{scannedEmployee?.name}</strong> are saved in the QR
                attendance table only.
              </p>
              <div className="qr-plan-actions">
                <button type="button" className="qr-btn-primary" onClick={() => navigate("/site")}>
                  Back to Site Portal
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
            <h2>Marked present</h2>
            <p className="qr-popup-name">{scannedEmployee.name}</p>
            <p className="qr-popup-meta">
              {scannedEmployee.role || "Employee"}
              {scannedEmployee.department ? ` · ${scannedEmployee.department}` : ""}
            </p>
            <p className="qr-popup-hint">Opening report submission…</p>
          </div>
        </div>
      )}
    </div>
  );
}
