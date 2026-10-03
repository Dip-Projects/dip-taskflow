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
import { parseWeeklyPlanFile } from "../../lib/weeklyPlanExcel";
import { parseWeeklyPlanPdfFile } from "../../lib/weeklyPlanPdf";
import "./QrAttendance.css";

const POPUP_MS = 2600;
/** Monday EM meeting desk QR (not clock-in). */
export const EA_MEETING_QR_TOKEN = "DIP-EA-MEETING";
/** @deprecated old token — still accepted so existing printed QR keeps working */
export const DESK_QR_TOKEN = EA_MEETING_QR_TOKEN;
const EA_QR_TOKENS = new Set(["DIP-EA-MEETING", "DIP-EM-MEETING", "DIP-DESK-ATTENDANCE"]);
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

/** Site Engineer (incl. Jr) — used only to decide the dual-Excel upload rule below,
 *  no longer used to gate who may scan the QR (see assertSiteEngineerMayScan). */
function isSiteEngineerRole(role) {
  const r = normalizeRole(role);
  if (!r) return false;
  if (r.includes("incharge") || r.includes("head") || r.includes("coordinator") || r.includes("co ordinator")) {
    return false;
  }
  return (
    r.includes("site engineer") ||
    r === "siteengineer" ||
    r.includes("jr site engineer") ||
    r.includes("junior site engineer") ||
    (r.includes("engineer") && r.includes("site"))
  );
}

/**
 * Any logged-in Site Portal user (Site Engineer, Co-ordinator, Site Head, etc.)
 * may scan the EM meeting QR and upload a plan. This used to hard-block anyone
 * whose role text wasn't literally "Site Engineer" (e.g. Co-ordinators), which
 * was the bug — Site Portal users of any role should be able to scan.
 */
function assertSiteEngineerMayScan(employee, authUser) {
  const hasIdentity = !!(employee?.username || authUser?.username || authUser?.user_name);
  if (!hasIdentity) {
    throw new Error("Could not identify your account. Please log in again and retry.");
  }
}

/** Site Engineer → 2 plan uploads (Site Work + Site Engineer): Excel or PDF. */
function needsDualExcelUpload(role) {
  return isSiteEngineerRole(role);
}

const PLAN_FILE_ACCEPT =
  ".xlsx,.xls,.csv,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

function isPdfFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return name.endsWith(".pdf") || type === "application/pdf" || type.includes("pdf");
}

function isAllowedPlanFile(file) {
  return isExcelFile(file) || isPdfFile(file);
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
  const [waNote, setWaNote] = useState("");

  const scannerRef = useRef(null);
  const handlingRef = useRef(false);
  const qrFileInputRef = useRef(null);
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
      if (!user) throw new Error("Please log in first, then scan the EM meeting QR.");
      const employee = await fetchLoggedInEmployee(user);
      if (!employee?.username) throw new Error("Could not load your employee details.");
      assertSiteEngineerMayScan(employee, authUser);
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
          console.warn("EM present saved but user has no whatsapp_number");
        }
      } catch (waErr) {
        console.warn("EM WhatsApp notify skip:", waErr.message);
      }
      const url = new URL(window.location.href);
      if (url.searchParams.has("code")) {
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch (err) {
      setMessage(err.message || "Could not mark EM meeting attendance.");
      handlingRef.current = false;
      setPhase("scan");
    } finally {
      setBusy(false);
    }
  }, [user, authUser, markPresent, stopScanner]);

  const handleDecoded = useCallback(
    async (decodedText) => {
      if (!isEaMeetingQr(decodedText)) {
        setMessage("Please scan the Monday EM meeting QR only.");
        handlingRef.current = false;
        return;
      }
      await checkInCurrentUser();
    },
    [checkInCurrentUser]
  );

  const handleQrImageUpload = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setMessage("");
      setBusy(true);
      setCamError("");
      try {
        await stopScanner();
        const html5Qr = new Html5Qrcode("qr-reader", { verbose: false });
        try {
          const decodedText = await html5Qr.scanFile(file, true);
          if (!isEaMeetingQr(decodedText)) {
            setMessage("This QR image is not the Monday EM meeting QR.");
            return;
          }
          await handleDecoded(decodedText);
        } finally {
          try {
            await html5Qr.clear();
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        setMessage("Could not read QR from the selected image. Please upload a clearer image.");
      } finally {
        setBusy(false);
        if (event.target) {
          event.target.value = "";
        }
      }
    },
    [handleDecoded, stopScanner]
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
      // Wait a tick so #qr-reader is in the DOM (React mount / StrictMode).
      await new Promise((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;
      if (!document.getElementById("qr-reader")) {
        setCamError("Scanner area missing. Refresh the page.");
        return;
      }

      const html5Qr = new Html5Qrcode("qr-reader", { verbose: false });
      if (cancelled) {
        try {
          await html5Qr.clear();
        } catch {
          /* ignore */
        }
        return;
      }
      scannerRef.current = html5Qr;

      const config = { fps: 12, qrbox: { width: 220, height: 220 } };
      const onScan = (text) => {
        handleDecoded(text);
      };

      // Prefer back camera; fall back to any listed device / front camera (desktop).
      const attempts = [{ facingMode: "environment" }, { facingMode: "user" }];
      try {
        const cams = await Html5Qrcode.getCameras();
        if (Array.isArray(cams) && cams.length) {
          for (const cam of cams) {
            if (cam?.id) attempts.push(cam.id);
          }
        }
      } catch {
        /* permissions may be granted only inside start() */
      }

      let lastErr = null;
      for (const camera of attempts) {
        if (cancelled) return;
        try {
          await html5Qr.start(camera, config, onScan);
          if (!cancelled) setCamError("");
          return;
        } catch (err) {
          lastErr = err;
          try {
            if (html5Qr.isScanning) await html5Qr.stop();
          } catch {
            /* ignore */
          }
        }
      }

      if (!cancelled) {
        const detail = lastErr?.message || lastErr?.name || "";
        setCamError(
          detail
            ? `Camera could not start (${detail}). Allow camera, or use Upload QR from device.`
            : "Camera could not start. Allow camera access, or use Upload QR from device."
        );
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
          ? "Please attach Site Work file (Excel or PDF)."
          : "Please attach your weekly plan file."
      );
      return;
    }
    if (dualExcel && !file2) {
      setMessage("Site Engineers must attach 2 files (Site Work + Site Engineer): Excel or PDF.");
      return;
    }
    if (dualExcel && (!isAllowedPlanFile(file1) || !isAllowedPlanFile(file2))) {
      setMessage("Both attachments must be Excel (.xlsx / .xls / .csv) or PDF.");
      return;
    }
    if (!dualExcel && !isAllowedPlanFile(file1)) {
      setMessage("Attachment must be Excel (.xlsx / .xls / .csv) or PDF.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    setWaNote("");
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

      const clientParsed = [];
      const parseOne = async (file, sourceFile) => {
        if (!file) return;
        try {
          const parsed = isPdfFile(file)
            ? await parseWeeklyPlanPdfFile(file)
            : isExcelFile(file)
              ? await parseWeeklyPlanFile(file)
              : null;
          if (!parsed) return;
          clientParsed.push({
            source_file: sourceFile,
            tasks: parsed.tasks || [],
            meta: parsed.meta || null,
          });
        } catch (parseErr) {
          console.warn(`Plan parse ${sourceFile}:`, parseErr.message);
        }
      };
      await parseOne(file1, "attachment_1");
      if (dualExcel && file2) await parseOne(file2, "attachment_2");

      try {
        const notifyRes = await api("/ea-meeting/notify", {
          method: "POST",
          body: JSON.stringify({
            kind: "uploaded",
            weekStart: week.start,
            fileName: file1?.name || null,
            eaId: attendanceRow.id,
            clientParsed,
          }),
        });
        const openCount = notifyRes?.weeklyPlan?.openCount;
        const waOk = notifyRes?.weeklyPlan?.whatsapp?.ok;
        const via = notifyRes?.weeklyPlan?.whatsapp?.via;
        const note = notifyRes?.weeklyPlan?.note;
        if (waOk) {
          setWaNote(
            `WhatsApp sent (${via || "ok"}) with ${openCount ?? 0} open task(s) Mon→today.`
          );
        } else if (notifyRes?.reason === "no_whatsapp" || notifyRes?.weeklyPlan?.whatsapp?.reason === "no_whatsapp") {
          setWaNote("No WhatsApp: set whatsapp_number on your user profile.");
        } else {
          const wa = notifyRes?.weeklyPlan?.whatsapp || {};
          const detail =
            wa?.error ||
            wa?.templateError?.error ||
            wa?.textError?.error ||
            note ||
            wa?.reason ||
            notifyRes?.error ||
            "check Meta / table setup";
          setWaNote(`WhatsApp issue: ${detail}`);
        }
      } catch (waErr) {
        console.warn("EM upload WhatsApp skip:", waErr.message);
        setWaNote(`WhatsApp notify failed: ${waErr.message}`);
      }
      setPhase("done");
    } catch (err) {
      setMessage(err.message || "Could not save EM meeting uploads.");
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
    setWaNote("");
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
                <div className="qr-busy">Marking EM meeting present…</div>
              )}
              {camError && (
                <div className="qr-error" style={{ marginTop: 12 }}>
                  {camError}
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="qr-btn-secondary"
                      onClick={() => {
                        setCamError("");
                        setPhase("loading");
                        requestAnimationFrame(() => setPhase("scan"));
                      }}
                    >
                      Retry camera
                    </button>
                  </div>
                </div>
              )}
              {message && <div className="qr-error">{message}</div>}
              {!busy && phase === "scan" && !camError && (
                <div className="qr-note">
                  Monday EM meeting. Scan desk QR, mark present, upload plan.
                  Beena (PC) + aapki site pe files dikhengi.
                </div>
              )}

              {!busy && phase === "scan" && (
                <div className="qr-actions-inline">
                  <button
                    type="button"
                    className="qr-btn-secondary qr-upload-btn"
                    onClick={() => qrFileInputRef.current?.click()}
                  >
                    Upload QR from device
                  </button>
                  <input
                    ref={qrFileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleQrImageUpload}
                  />
                </div>
              )}
              <div className="qr-build-stamp" aria-hidden>
                build qr-cam-fix · 2026-09-18
              </div>
            </div>
          )}

          {phase === "plan" && scannedEmployee && (
            <form className="qr-plan" onSubmit={submitWeeklyPlan}>
              <div className="qr-emp-chip">
                <div className="qr-emp-av">{(scannedEmployee.name || "?").charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{scannedEmployee.name}</strong>
                  <span>
                    {scannedEmployee.role || "—"} · EM meeting present · week {week.start}
                  </span>
                </div>
              </div>

              <label className="qr-label">
                {dualExcel
                  ? "Plan uploads (2 required — Excel or PDF)"
                  : "EM weekly plan (Excel or PDF)"}
                <span className="qr-week">
                  {week.start} → {week.end}
                </span>
              </label>
              <label className="qr-file">
                <input
                  type="file"
                  accept={PLAN_FILE_ACCEPT}
                  onChange={(e) => setFile1(e.target.files?.[0] || null)}
                />
                <span>
                  {file1
                    ? file1.name
                    : dualExcel
                      ? "1. Site Work (Excel or PDF)"
                      : "Choose EM weekly plan file"}
                </span>
              </label>
              {dualExcel && (
                <label className="qr-file">
                  <input
                    type="file"
                    accept={PLAN_FILE_ACCEPT}
                    onChange={(e) => setFile2(e.target.files?.[0] || null)}
                  />
                  <span>{file2 ? file2.name : "2. Site Engineer (Excel or PDF)"}</span>
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
                      ? "Submit plan uploads"
                      : "Submit EM weekly plan"}
                </button>
              </div>
            </form>
          )}

          {phase === "done" && (
            <div className="qr-done">
              <div className="qr-done-ico">✓</div>
              <h2>{dualExcel ? "Plan uploads submitted" : "EM weekly plan submitted"}</h2>
              <p>
                Saved in <strong>ea_meeting_attendance</strong>. Tasks go to{' '}
                <strong>weekly_plan_tasks</strong>; WhatsApp should list Mon→today open tasks.
                Reply <strong>1,3</strong> or <strong>ALL</strong> to mark done.
              </p>
              {waNote ? (
                <p style={{ marginTop: 10, fontSize: 13, color: waNote.includes("sent") ? "#166534" : "#9a3412" }}>
                  {waNote}
                </p>
              ) : null}
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
            <h2>EM meeting · Present</h2>
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