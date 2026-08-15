import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, supabaseUrl, supabaseAnonKey, fromMaybe } from '../../lib/supabase';
import { uploadViaApi } from '../../lib/ensureBucket';
import { computeMonthlyLeaveBalance, isMonthlyLeaveRole } from "./leaveUtils.js";
// ─── Config: expected shift times ────────────────────────────────────────────
const SHIFT_START = "09:00"; // HH:MM — on-time threshold for clock-in
const SHIFT_END   = "19:00"; // HH:MM — on-time threshold for clock-out

// ─── Extra CSS — append to your existing CSS string ──────────────────────────
export const CLOCK_CSS = `
@layer dip-site {
.site-shell, .site-theme {
/* ── Camera Modal ── */
.cam-modal-bg{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:16px;}
.cam-modal{background:#1a1a1a;border-radius:20px;overflow:hidden;width:100%;max-width:480px;display:flex;flex-direction:column;gap:0;}
.cam-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #333;}
.cam-title{font-size:14px;font-weight:700;color:#fff;}
.cam-close{width:30px;height:30px;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#aaa;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.cam-close:hover{background:#333;color:#fff;}
.cam-video-wrap{position:relative;background:#000;aspect-ratio:4/3;overflow:hidden;}
.cam-video{width:100%;height:100%;object-fit:cover;display:block;}
.cam-canvas{display:none;}
.cam-preview{width:100%;height:100%;object-fit:cover;display:block;}
.cam-overlay{position:absolute;inset:0;border:3px solid rgba(217,119,6,.5);pointer-events:none;border-radius:0;}
.cam-overlay-corner{position:absolute;width:20px;height:20px;border-color:var(--amber);border-style:solid;}
.cam-overlay-corner.tl{top:12px;left:12px;border-width:3px 0 0 3px;}
.cam-overlay-corner.tr{top:12px;right:12px;border-width:3px 3px 0 0;}
.cam-overlay-corner.bl{bottom:12px;left:12px;border-width:0 0 3px 3px;}
.cam-overlay-corner.br{bottom:12px;right:12px;border-width:0 3px 3px 0;}
.cam-footer{padding:16px 20px;display:flex;flex-direction:column;gap:12px;background:#1a1a1a;}
.cam-loc{display:flex;align-items:center;gap:8px;font-size:12px;color:#888;background:#2a2a2a;border-radius:8px;padding:10px 14px;}
.cam-loc svg{flex-shrink:0;color:var(--amber);}
.cam-loc strong{color:#ccc;}
.cam-btns{display:flex;gap:10px;}
.cam-btn-capture{flex:1;height:44px;border-radius:10px;border:none;background:var(--amber);color:#fff;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background .15s;}
.cam-btn-capture:hover{background:var(--amber2);}
.cam-btn-capture:disabled{opacity:.5;cursor:not-allowed;}
.cam-btn-retake{height:44px;padding:0 18px;border-radius:10px;border:1.5px solid #444;background:#2a2a2a;color:#ccc;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;}
.cam-btn-retake:hover{background:#333;}
.cam-btn-submit{flex:1;height:44px;border-radius:10px;border:none;background:#16a34a;color:#fff;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background .15s;}
.cam-btn-submit:hover{background:#15803d;}
.cam-btn-submit:disabled{opacity:.5;cursor:not-allowed;}

/* ── Status pill ── */
.punch-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:5px 12px;border-radius:20px;}
.punch-ontime{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;}
.punch-late{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}
.punch-early{background:#fffbeb;color:#d97706;border:1px solid #fde68a;}
.punch-overtime{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;}

/* ── Task panel (clock-out) ── */
.task-panel{width:100%;max-width:480px;background:#1a1a1a;border-radius:20px;overflow:hidden;}
.task-panel-hdr{padding:16px 20px;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between;}
.task-panel-title{font-size:14px;font-weight:700;color:#fff;}
.task-list-modal{display:flex;flex-direction:column;gap:10px;padding:16px 20px;max-height:340px;overflow-y:auto;}
.task-item-modal{background:#2a2a2a;border:1px solid #3a3a3a;border-radius:12px;padding:14px;}
.task-item-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;}
.task-item-meta{font-size:11px;color:#888;margin-bottom:10px;}
.task-item-row{display:flex;align-items:center;gap:8px;margin-top:8px;}
.task-status-sel{flex:1;font-family:var(--font);font-size:12px;background:#1a1a1a;color:#ccc;border:1px solid #444;border-radius:7px;padding:6px 10px;cursor:pointer;}
.task-doc-btn{height:32px;padding:0 12px;border-radius:7px;border:1.5px solid #444;background:#1e1e1e;color:#aaa;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:5px;}
.task-doc-btn.attached{border-color:var(--amber);color:var(--amber);background:rgba(217,119,6,.1);}
.task-notes{width:100%;font-family:var(--font);font-size:12px;color:#ccc;background:#1e1e1e;border:1px solid #3a3a3a;border-radius:7px;padding:7px 10px;margin-top:8px;resize:none;min-height:56px;}
.task-notes::placeholder{color:#555;}
.task-panel-footer{padding:14px 20px;border-top:1px solid #333;display:flex;gap:10px;}

/* ── Calendar updates ── */
.cal-cell{min-height:46px;padding:5px 2px 3px;border-radius:8px;}
.cal-cell.on-time{background:#f0fdf4;border-color:#86efac;}
.cal-cell.on-time .cal-dn{color:#15803d;}
.cal-cell.late-in{background:#fef9c3;border-color:#fde047;}
.cal-cell.late-in .cal-dn{color:#854d0e;}
.cal-cell.absent-day{background:#fef2f2;border-color:#fca5a5;}
.cal-cell.absent-day .cal-dn{color:#b91c1c;}
.cal-cell.leave-day{background:#f5f3ff;border-color:#c4b5fd;}
.cal-cell.leave-day .cal-dn{color:#6d28d9;}
.cal-cell.half-day{background:#fffbeb;border-color:#fde68a;}
.cal-cell.future{opacity:.38;cursor:not-allowed;background:#f8fafc;pointer-events:none;}
.cal-nav-btn:disabled{opacity:.35;cursor:not-allowed;}
.cal-dn{font-size:11.5px;font-weight:700;color:var(--ink);line-height:1;}
.att-dot-row{display:flex;gap:2px;margin-top:3px;flex-wrap:wrap;justify-content:center;}
.att-dot{width:6px;height:6px;border-radius:50%;}
.cal-cell.leave-day.today,
.cal-cell.leave-day.sel {background: #f5f3ff !important;border-color: #c4b5fd !important;}
.cal-cell.leave-day.today .cal-dn,
.cal-cell.leave-day.sel .cal-dn {color: #6d28d9 !important;}

/* Clock panel tweaks */
.clock-panel{padding:24px 12px;}
.punch-row{display:flex;gap:12px;width:100%;max-width:420px;flex-wrap:wrap;justify-content:center;}
.punch-card{flex:1;min-width:130px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;}
.punch-card-lbl{font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.07em;}
.punch-card-val{font-size:13px;font-weight:700;color:var(--ink);}
.punch-card-status{margin-top:4px;}

/* ── Task checkpoint items ── */
.task-item-modal{border-radius:12px;padding:14px;transition:all .2s ease;}
.task-item-title{font-size:13px;font-weight:700;margin-bottom:4px;transition:all .2s;}
.task-item-meta{font-size:11px;color:#888;}
.task-notes{width:100%;box-sizing:border-box;font-family:var(--font);font-size:12px;color:#ccc;background:#1e1e1e;border:1px solid #3a3a3a;border-radius:7px;padding:7px 10px;resize:none;min-height:52px;}
.task-notes::placeholder{color:#555;}
.task-notes:focus{outline:none;border-color:#555;}
.task-doc-btn{height:30px;padding:0 12px;border-radius:7px;border:1.5px solid #444;background:#1e1e1e;color:#aaa;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;transition:all .15s;}
.task-doc-btn:hover{border-color:#666;color:#ccc;}
.task-doc-btn.attached{border-color:var(--amber);color:var(--amber);background:rgba(217,119,6,.1);}

/* ── Scrollbar styling ── */
.task-list-modal::-webkit-scrollbar {width: 4px;}
.task-list-modal::-webkit-scrollbar-track {background: transparent;}
.task-list-modal::-webkit-scrollbar-thumb {background: #444;border-radius: 4px;}
.task-list-modal::-webkit-scrollbar-thumb:hover {background: #555;}

} /* .site-shell / .site-theme nest */

/* ── Light theme overrides ── */
[data-theme="light"] .cam-modal,
[data-theme="light"] .task-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
[data-theme="light"] .cam-header,
[data-theme="light"] .task-panel-hdr,
[data-theme="light"] .task-panel-footer {
  background: #ffffff;
  border-color: #e5e7eb;
}
[data-theme="light"] .cam-title,
[data-theme="light"] .task-panel-title {
  color: #111827;
}
[data-theme="light"] .cam-close {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #6b7280;
}
[data-theme="light"] .cam-close:hover {
  background: #e5e7eb;
  color: #111827;
}
[data-theme="light"] .task-list-modal::-webkit-scrollbar-thumb {background: #d1d5db;}
[data-theme="light"] .task-list-modal::-webkit-scrollbar-thumb:hover {background: #9ca3af;}

/* ── Light theme: checkpoint items ── */
[data-theme="light"] .cp-item-default {
  background: #f9fafb !important;
  border-color: #e5e7eb !important;
}
[data-theme="light"] .cp-item-checked {
  background: #f0fdf4 !important;
  border-color: #86efac !important;
}
[data-theme="light"] .cp-item-title {color: #111827 !important;}
[data-theme="light"] .cp-item-title.done {color: #9ca3af !important;}
[data-theme="light"] .task-notes {
  background: #f9fafb;
  border-color: #e5e7eb;
  color: #111827;
}
[data-theme="light"] .task-notes::placeholder {color: #9ca3af;}
[data-theme="light"] .task-notes:focus {border-color: #d1d5db;}
[data-theme="light"] .task-doc-btn {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #374151;
}
[data-theme="light"] .task-doc-btn:hover {
  background: #e5e7eb;
  border-color: #9ca3af;
}
[data-theme="light"] .task-doc-btn.attached {
  background: rgba(217,119,6,.08);
  border-color: var(--amber);
  color: var(--amber);
}

/* ── Light theme: group header ── */
[data-theme="light"] .cp-group-divider {background: #e5e7eb !important;}
[data-theme="light"] .cp-group-count {color: #9ca3af !important;}

/* ── Light theme: cam footer / loc bar ── */
[data-theme="light"] .cam-footer {background: #ffffff;}
[data-theme="light"] .cam-loc {background: #f3f4f6;color: #6b7280;}
[data-theme="light"] .cam-loc strong {color: #374151;}

/* ── Light theme: cam modal bg ── */
[data-theme="light"] .cam-modal-bg {background: rgba(0,0,0,.5);}

/* ── Light theme: retake/skip button ── */
[data-theme="light"] .cam-btn-retake {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #374151;
}
[data-theme="light"] .cam-btn-retake:hover {background: #e5e7eb;}
/* in CLOCK_CSS */
.select-all-label{color:#aaa;}  
[data-theme="light"] .select-all-label{color:#374151;}
} /* @layer dip-site */
`;

async function uploadClockPhoto(supabaseClient, base64, userName, type) {
  try {
    const path = `${userName}/${new Date().toISOString().split("T")[0]}/${type}_${Date.now()}.jpg`;
    return await uploadViaApi({
      path,
      dataUrl: base64,
      contentType: "image/jpeg",
      bucket: "attendance-photos",
    });
  } catch (e) {
    console.warn("clock photo upload failed", e);
    return null;
  }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getShiftMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function diffLabel(diffMins) {
  const h = Math.floor(Math.abs(diffMins) / 60);
  const m = Math.abs(diffMins) % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function calcClockInStatus(clockInISO) {
  const ci = new Date(clockInISO);
  const ciMins = ci.getHours() * 60 + ci.getMinutes();
  const shiftMins = getShiftMinutes(SHIFT_START);
  const diff = ciMins - shiftMins;
  if (diff <= 0) return { label: "On Time", type: "ontime", diff: 0 };
  return { label: `Late by ${diffLabel(diff)}`, type: "late", diff };
}
function calcClockOutStatus(clockOutISO) {
  const co = new Date(clockOutISO);
  const coMins = co.getHours() * 60 + co.getMinutes();
  const shiftMins = getShiftMinutes(SHIFT_END);
  const diff = coMins - shiftMins;
  if (diff >= 0) return { label: diff > 0 ? `Overtime ${diffLabel(diff)}` : "On Time", type: diff > 0 ? "overtime" : "ontime", diff };
  return { label: `Early by ${diffLabel(diff)}`, type: "early", diff };
}

// ─── Camera + Location Modal ──────────────────────────────────────────────────
function CameraModal({ title, onSubmit, onClose, busy }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const fileRef    = useRef(null);
  const [captured, setCaptured]   = useState(null); // base64
  const [location, setLocation]   = useState(null);
  const [locError, setLocError]   = useState("");
  const [camError, setCamError]   = useState("");
  const [locating, setLocating]   = useState(true);

  useEffect(() => {
    // Start camera
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCamError("Camera not available. Please upload a photo instead."));

    // Get location
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy) });
        setLocating(false);
      },
      () => { setLocError("Location unavailable"); setLocating(false); },
      { timeout: 10000 }
    );

    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const capture = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setCaptured(canvas.toDataURL("image/jpeg", 0.7));
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const retake = () => {
    setCaptured(null);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(stream => { streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(() => setCamError("Camera not available."));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCaptured(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    onSubmit({ image: captured, location });
  };

  return (
    <div className="cam-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cam-modal">
        <div className="cam-header">
          <span className="cam-title">{title}</span>
          <button className="cam-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="cam-video-wrap">
          {!captured ? (
            <>
              {camError ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", minHeight:220, gap:12, padding:24 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span style={{ color:"#888", fontSize:12, textAlign:"center" }}>{camError}</span>
                  <button className="cam-btn-retake" onClick={() => fileRef.current?.click()}>
                    Upload Photo Instead
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFileUpload} />
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="cam-video" autoPlay playsInline muted />
                  <div className="cam-overlay">
                    {["tl","tr","bl","br"].map(c => <div key={c} className={`cam-overlay-corner ${c}`}/>)}
                  </div>
                </>
              )}
            </>
          ) : (
            <img src={captured} alt="Captured" className="cam-preview" />
          )}
          <canvas ref={canvasRef} className="cam-canvas" />
        </div>

        <div className="cam-footer">
          <div className="cam-loc">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {locating ? <span>Fetching location…</span>
              : locError ? <span style={{ color:"#f87171" }}>{locError}</span>
              : <span><strong>{location?.lat}, {location?.lng}</strong> ±{location?.acc}m</span>
            }
          </div>

          <div className="cam-btns">
            {!captured ? (
              <>
                <button className="cam-btn-capture" onClick={capture} disabled={!!camError && !captured}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Capture Photo
                </button>
              </>
            ) : (
              <>
                <button className="cam-btn-retake" onClick={retake}>Retake</button>
                <button className="cam-btn-submit" onClick={handleSubmit} disabled={busy || locating}>
                  {busy
                    ? <><div className="spinner" style={{ width:14, height:14, borderWidth:2 }}/> Saving…</>
                    : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg> Confirm</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// ─── Clock-Out Tasks Modal (Checkpoint Style) ─────────────────────────────────

// ─── Clock-Out Tasks Modal (Checkpoint Style) ─────────────────────────────────
function ClockOutTasksModal({ user, attendanceId, clockOutData, onDone, onClose, supabase }) {
  const [checkpoints, setCheckpoints] = useState([]); // raw rows from checkpoints table
  const [tasks,       setTasks]       = useState([]); // pending tasks
  const [loading,     setLoading]     = useState(true);
  // subs keyed by checkpoint id: { checked, notes, file, fileName, uploading }
  const [subs,        setSubs]        = useState({});
  const [busy,        setBusy]        = useState(false);
  const fileRefs = useRef({});

  useEffect(() => {
  (async () => {
    // Step 1: Fetch user's pending/in-progress tasks
    const { data: taskData } = await supabase
      .from("tasks")
      .select("id, title, description, due_date, status, site_name")
      .eq("assigned_to", user.user_name)
      .in("status", ["pending", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(15);

    const allTasks = taskData || [];

    // Step 2: Extract unique task titles to match against checkpoint task_types
    const taskTypes = [...new Set(allTasks.map(t => t.title))];

    // Step 3: Fetch only checkpoints whose task_type matches user's task titles
    let allCps = [];
    if (taskTypes.length > 0) {
      const { data: cpData } = await supabase
        .from("checkpoints")
        .select("id, task_type, checkpoint, created_at")
        .in("task_type", taskTypes)
        .order("task_type", { ascending: true })
        .order("id",        { ascending: true });

      allCps = cpData || [];
    }

    setCheckpoints(allCps);
    setTasks(allTasks);

    // Step 4: Init subs for checkpoints + tasks
    const init = {};
    allCps.forEach(cp => {
      init[`cp_${cp.id}`] = { checked: false, notes: "", file: null, fileName: "", uploading: false };
    });
    allTasks.forEach(t => {
      init[`task_${t.id}`] = { checked: false, notes: "", file: null, fileName: "", uploading: false };
    });
    setSubs(init);
    setLoading(false);
  })();
}, [user.user_name, supabase]);

  const setSub = (key, field, val) =>
    setSubs(p => ({ ...p, [key]: { ...p[key], [field]: val } }));
  const toggleAll = (checked) => {
  setSubs(prev => {
    const next = { ...prev };
    Object.keys(next).forEach(key => {
      next[key] = { ...next[key], checked };
    });
    return next;
  });
};
const totalItems    = checkpoints.length + tasks.length;            // ← but declared down here
const checkedCount  = Object.entries(subs).filter(([, s]) => s.checked).length;
const allChecked = totalItems > 0 && checkedCount === totalItems;

  const handleFile = (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSub(key, "file", file);
    setSub(key, "fileName", file.name);
  };

  const uploadFile = async (file, label) => {
    const ext  = file.name.split(".").pop();
    const path = `task_docs/${user.user_name}/${label}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("documents")
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
    return urlData?.publicUrl || null;
  };

  const handleSubmit = async () => {
    setBusy(true);

    // Submit checkpoint completions
    for (const cp of checkpoints) {
      const key = `cp_${cp.id}`;
      const sub = subs[key] || {};
      const hasActivity = sub.checked || sub.notes?.trim() || sub.file;
      if (!hasActivity) continue;

      let docUrl = null;
      if (sub.file) {
        setSub(key, "uploading", true);
        docUrl = await uploadFile(sub.file, `cp_${cp.id}`);
        setSub(key, "uploading", false);
      }

      await supabase.from("task_submissions").insert({
        attendance_id:  attendanceId || null,
        submitted_at:   new Date().toISOString(),
        location:       clockOutData.location
          ? `${clockOutData.location.lat},${clockOutData.location.lng}`
          : null,
        notes:          sub.notes || null,
        document_url:   docUrl,
        // store checkpoint reference in notes if no dedicated column
        // adjust column names to match your task_submissions schema:
        task_id:        null, // no task_id for pure checkpoints
      });
    }

    // Submit task completions
    for (const task of tasks) {
      const key = `task_${task.id}`;
      const sub = subs[key] || {};
      const hasActivity = sub.checked || sub.notes?.trim() || sub.file;
      if (!hasActivity) continue;

      let docUrl = null;
      if (sub.file) {
        setSub(key, "uploading", true);
        docUrl = await uploadFile(sub.file, `task_${task.id}`);
        setSub(key, "uploading", false);
      }

      await supabase
        .from("tasks")
        .update({ status: sub.checked ? "completed" : "in_progress" })
        .eq("id", task.id);

      await supabase.from("task_submissions").insert({
        task_id:        task.id,
        attendance_id:  attendanceId || null,
        submitted_at:   new Date().toISOString(),
        location:       clockOutData.location
          ? `${clockOutData.location.lat},${clockOutData.location.lng}`
          : null,
        notes:          sub.notes || null,
        document_url:   docUrl,
      });
    }

    setBusy(false);
    onDone();
  };

  // Group checkpoints by task_type
  const groupedCps = checkpoints.reduce((acc, cp) => {
    if (!acc[cp.task_type]) acc[cp.task_type] = [];
    acc[cp.task_type].push(cp);
    return acc;
  }, {});


  // ── Reusable item renderer ────────────────────────────────────────────────
  const renderItem = (key, label, subLabel) => {
    const sub = subs[key] || {};
    return (
     <div
        key={key}
        className={sub.checked ? "cp-item-checked" : "cp-item-default"}
        style={{
          border:     sub.checked ? "1px solid #166534" : "1px solid #3a3a3a",
          background: sub.checked ? "rgba(22,101,52,.15)" : "#2a2a2a",
          borderRadius: 10,
          padding: "12px 14px",
          transition: "all .2s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Green left stripe when checked */}
        {sub.checked && (
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: 3, background: "#16a34a", borderRadius: "3px 0 0 3px",
          }}/>
        )}

        {/* Checkbox + label row */}
        <div
          style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
          onClick={() => setSub(key, "checked", !sub.checked)}
        >
          {/* Custom checkbox */}
          <div style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
            border:      sub.checked ? "2px solid #16a34a" : "2px solid #555",
            background:  sub.checked ? "#16a34a" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s ease",
          }}>
            {sub.checked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div
              className={`cp-item-title${sub.checked ? " done" : ""}`}
              style={{
                fontSize: 13, fontWeight: 600,
                color: sub.checked ? "#666" : "#fff",
                textDecoration: sub.checked ? "line-through" : "none",
                transition: "all .2s",
              }}
            >
              {label}
            </div>
            {subLabel && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{subLabel}</div>
            )}
          </div>

          {/* Status badge */}
          <div style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
            background: sub.checked ? "rgba(22,163,74,.2)" : "rgba(217,119,6,.15)",
            color:      sub.checked ? "#4ade80"             : "#fbbf24",
            border:     sub.checked ? "1px solid rgba(74,222,128,.3)" : "1px solid rgba(251,191,36,.3)",
            marginTop: 2,
          }}>
            {sub.checked ? "Done" : "Pending"}
          </div>
        </div>

        {/* Notes + attach */}
        <div style={{ marginTop: 10, paddingLeft: 28, display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            className="task-notes"
            rows={2}
            placeholder="Add notes or remarks… (optional)"
            value={sub.notes || ""}
            onChange={e => setSub(key, "notes", e.target.value)}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className={`task-doc-btn${sub.fileName ? " attached" : ""}`}
              onClick={e => { e.stopPropagation(); fileRefs.current[key]?.click(); }}
            >
              {sub.uploading ? (
                <><div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }}/> Uploading…</>
              ) : sub.fileName ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  {sub.fileName.length > 16 ? sub.fileName.slice(0, 16) + "…" : sub.fileName}
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Attach Proof
                </>
              )}
            </button>
            {sub.fileName && (
              <button
                style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, padding: 0 }}
                onClick={e => { e.stopPropagation(); setSub(key, "file", null); setSub(key, "fileName", ""); }}
              >
                ✕ Remove
              </button>
            )}
          </div>
          <input
            type="file"
            style={{ display: "none" }}
            ref={el => fileRefs.current[key] = el}
            onChange={e => handleFile(key, e)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="cam-modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="task-panel" style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

{/* Header */}
<div className="task-panel-hdr">
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <span className="task-panel-title">
      {loading ? "Loading…" : "End-of-Day Checkpoints"}
    </span>
    {!loading && totalItems > 0 && (
      <span style={{ fontSize: 11, color: "#888" }}>
        {checkedCount} of {totalItems} completed
      </span>
    )}
  </div>

  {/* Select All toggle */}
  {!loading && totalItems > 0 && (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6,
        cursor: "pointer", flexShrink: 0,
      }}
      onClick={() => toggleAll(!allChecked)}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border:     allChecked ? "2px solid #16a34a" : "2px solid #555",
        background: allChecked ? "#16a34a" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all .15s ease",
      }}>
        {allChecked && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        )}
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "#aaa", whiteSpace: "nowrap" }}>
        Select All
      </span>
    </div>
  )}

  {/* Progress bar */}
  {!loading && totalItems > 0 && (
    <div style={{ width: 60, height: 4, background: "#333", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
      <div style={{
        height: "100%",
        width: `${(checkedCount / totalItems) * 100}%`,
        background: "#16a34a",
        borderRadius: 4,
        transition: "width .3s ease",
      }}/>
    </div>
  )}
  <button className="cam-close" onClick={onClose}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>
</div>

        {/* Body */}
        <div className="task-list-modal" style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#888", padding: "24px 0" }}>
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}/> Loading…
            </div>
          ) : (totalItems === 0) ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 10 }}>
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              <div style={{ color: "#888", fontSize: 13 }}>No checkpoints or tasks — all clear!</div>
            </div>
          ) : (
            <>
              {/* ── Checkpoints grouped by task_type ── */}
              {Object.entries(groupedCps).map(([taskType, cps]) => (
                <div key={taskType} style={{ marginBottom: 18 }}>
                  {/* Group header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: ".07em", color: "#fbbf24",
                      background: "rgba(217,119,6,.12)",
                      border: "1px solid rgba(217,119,6,.25)",
                      borderRadius: 6, padding: "3px 10px",
                    }}>
                      {taskType}
                    </div>
                      <div className="cp-group-divider" style={{ flex: 1, height: 1, background: "#333" }}/>
                      <span className="cp-group-count" style={{ fontSize: 10, color: "#555" }}>
                      {cps.filter(cp => subs[`cp_${cp.id}`]?.checked).length}/{cps.length}
                    </span>
                  </div>

                  {/* Checkpoint items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {cps.map(cp => renderItem(`cp_${cp.id}`, cp.checkpoint, null))}
                  </div>
                </div>
              ))}

              {/* ── Pending Tasks section ── */}
              {tasks.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: ".07em", color: "#60a5fa",
                      background: "rgba(37,99,235,.12)",
                      border: "1px solid rgba(37,99,235,.25)",
                      borderRadius: 6, padding: "3px 10px",
                    }}>
                      Assigned Tasks
                    </div>
                      <div className="cp-group-divider" style={{ flex: 1, height: 1, background: "#333" }}/>
                      <span className="cp-group-count" style={{ fontSize: 10, color: "#555" }}>
                      {tasks.filter(t => subs[`task_${t.id}`]?.checked).length}/{tasks.length}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tasks.map(task => renderItem(
                      `task_${task.id}`,
                      task.title,
                      [task.site_name && `📍 ${task.site_name}`, task.due_date && `Due ${new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`].filter(Boolean).join(" · ")
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="task-panel-footer">
          <button className="cam-btn-retake" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
            Skip
          </button>
          <button
            className="cam-btn-submit"
            style={{ flex: 2 }}
            onClick={handleSubmit}
            disabled={busy || loading}
          >
            {busy ? (
              <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}/> Submitting…</>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Submit & Clock Out
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
// CLOCK IN / OUT (main component)
// ═══════════════════════════════════════════════════════════════════════════════
export function ClockInOut({ user, supabase }) {
  const [now,          setNow]          = useState(new Date());
  const [todayRecord,  setTodayRecord]  = useState(null);
  const [recentLogs,   setRecentLogs]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showCam,      setShowCam]      = useState(null); // "in" | "out"
  const [showTasks,    setShowTasks]    = useState(false);
  const [clockOutData, setClockOutData] = useState(null); // {image, location, time}
  const [busy,         setBusy]         = useState(false);
  const [msg,          setMsg]          = useState(null); // {type, text}

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

const fetchData = useCallback(async () => {
  setLoading(true);
  const dateStr = new Date().toISOString().split("T")[0];

  const { data: todayData } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_name", user.user_name)
    .eq("date", dateStr)
    .maybeSingle();
  setTodayRecord(todayData);

  const { data: logs } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_name", user.user_name)  
    .order("date", { ascending: false })
    .limit(7);
  setRecentLogs(logs || []);
  setLoading(false);
}, [user.user_name, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showMsg = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // ── Clock In ────────────────────────────────────────────────────────────────
  const handleClockIn = async ({ image, location }) => {
    setBusy(true);
    const now_iso  = new Date().toISOString();
    const ciStatus = calcClockInStatus(now_iso);

// Upload photo first
let clock_in_image_url = null;
if (image) {
  clock_in_image_url = await uploadClockPhoto(
    supabase, image, user.user_name, "clockin"
  );
}

const { data, error } = await supabase.from("attendance").insert({
  user_name:         user.user_name,
  date:              new Date().toISOString().split("T")[0],
  clock_in:          now_iso,
  status:            "present",
  clock_in_image:    clock_in_image_url,   // ← now a URL, not base64
  clock_in_location: location ? `${location.lat},${location.lng}` : null,
  clock_in_status:   ciStatus.type,
}).select().single();

    setBusy(false);
    setShowCam(null);

    if (error) { showMsg("error", "Clock-in failed: " + error.message); return; }

    showMsg(
      ciStatus.type === "ontime" ? "success" : "warn",
      ciStatus.type === "ontime"
        ? "✓ Clocked in — On Time!"
        : `⚠ Clocked in — ${ciStatus.label}`
    );
    await fetchData();
  };

  // ── Clock Out ───────────────────────────────────────────────────────────────
  // Site Engineer scope: selfie + attendance only (no task/verification modal)
  const handleClockOutCapture = ({ image, location }) => {
    const data = { image, location, time: new Date().toISOString() };
    setClockOutData(data);
    setShowCam(null);
    void finaliseClockOut(data);
  };

  const finaliseClockOut = async (overrideData) => {
    const data = overrideData || clockOutData;
    if (!data || !todayRecord) return;
    setBusy(true);
    const coStatus = calcClockOutStatus(data.time);

// Upload clock-out photo first
let clock_out_image_url = null;
if (data.image) {
  clock_out_image_url = await uploadClockPhoto(
    supabase, data.image, user.user_name, "clockout"
  );
}

const { error } = await supabase.from("attendance").update({
  clock_out:          data.time,
  clock_out_image:    clock_out_image_url,   // ← now a URL, not base64
  clock_out_location: data.location
      ? `${data.location.lat},${data.location.lng}`
      : null,
  clock_out_status:   coStatus.type,
}).eq("user_name", user.user_name)
  .eq("date", new Date().toISOString().split("T")[0]);

    setBusy(false);
    setShowTasks(false);
    setClockOutData(null);

    if (error) { showMsg("error", "Clock-out failed: " + error.message); return; }

    showMsg(
      coStatus.type === "ontime" || coStatus.type === "overtime" ? "success" : "warn",
      coStatus.type === "ontime"   ? "✓ Clocked out — On Time!"
      : coStatus.type === "overtime" ? `✓ Clocked out — ${coStatus.label}`
      : `⚠ Clocked out — ${coStatus.label}`
    );
    await fetchData();
  };

  const isClockedIn  = todayRecord?.clock_in && !todayRecord?.clock_out;
  const isClockedOut = todayRecord?.clock_in && todayRecord?.clock_out;

  const ciStatus = todayRecord?.clock_in   ? calcClockInStatus(todayRecord.clock_in)   : null;
  const coStatus = todayRecord?.clock_out  ? calcClockOutStatus(todayRecord.clock_out) : null;

  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true }) : "—";

  if (loading) return (
    <div className="loading"><div className="spinner"/><span>Loading…</span></div>
  );

  return (
    <>
      <div className="clock-panel">
        {/* Live clock */}
        <div>
          <div className="clock-time">
            {now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false })}
          </div>
          <div className="clock-date" style={{ textAlign:"center", marginTop:4 }}>
            {now.toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </div>
          <div style={{ textAlign:"center", marginTop:8, fontSize:11.5, color:"var(--ink3)" }}>
            Shift: {SHIFT_START} – {SHIFT_END}
          </div>
        </div>

        {/* Status message */}
        {msg && (
          <div className="info-banner" style={{
            maxWidth:400, width:"100%",
            background: msg.type === "success" ? "#f0fdf4" : msg.type === "warn" ? "#fffbeb" : "#fef2f2",
            borderColor: msg.type === "success" ? "#bbf7d0" : msg.type === "warn" ? "#fde68a" : "#fecaca",
            color: msg.type === "success" ? "#15803d" : msg.type === "warn" ? "#92400e" : "#b91c1c",
          }}>
            {msg.text}
          </div>
        )}

        {/* Punch cards */}
        {(isClockedIn || isClockedOut) && (
          <div className="punch-row">
            <div className="punch-card">
              <div className="punch-card-lbl">Clock In</div>
              <div className="punch-card-val">{fmtTime(todayRecord.clock_in)}</div>
              {ciStatus && (
                <div className="punch-card-status">
                  <span className={`punch-status punch-${ciStatus.type}`}>
                    {ciStatus.type === "ontime"
                      ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                      : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    }
                    {ciStatus.label}
                  </span>
                </div>
              )}
            </div>
            {isClockedOut && (
              <div className="punch-card">
                <div className="punch-card-lbl">Clock Out</div>
                <div className="punch-card-val">{fmtTime(todayRecord.clock_out)}</div>
                {coStatus && (
                  <div className="punch-card-status">
                    <span className={`punch-status punch-${coStatus.type}`}>
                      {coStatus.type === "ontime" || coStatus.type === "overtime"
                        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      }
                      {coStatus.label}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No record yet */}
        {!todayRecord && (
          <div className="clock-status">You haven't clocked in today.</div>
        )}

        {/* Action buttons */}
        <div className="clock-btns">
          {!todayRecord && (
            <button className="btn btn-amber" onClick={() => setShowCam("in")} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Clock In
            </button>
          )}
          {isClockedIn && (
            <button className="btn btn-red" onClick={() => setShowCam("out")} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Clock Out
            </button>
          )}
          {isClockedOut && (
            <div className="badge badge-green" style={{ fontSize:13, padding:"8px 16px" }}>
              ✓ Day Complete
            </div>
          )}
        </div>

        {/* Recent attendance */}
        {recentLogs.length > 0 && (
          <div className="clock-log">
            <div className="clock-log-title">Recent Attendance</div>
            {recentLogs.map(r => {
              const ci = r.clock_in  ? calcClockInStatus(r.clock_in)   : null;
              const co = r.clock_out ? calcClockOutStatus(r.clock_out) : null;
              return (
                <div key={r.id} className="clock-row" style={{ flexWrap:"wrap", gap:8 }}>
                  <div className="clock-row-date">
                    {new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                  </div>
                  <div className="clock-row-times" style={{ flexWrap:"wrap" }}>
                    <span>In: {fmtTime(r.clock_in)}</span>
                    <span>Out: {fmtTime(r.clock_out)}</span>
                  </div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {ci && <span className={`punch-status punch-${ci.type}`} style={{ fontSize:10 }}>{ci.label}</span>}
                    {co && <span className={`punch-status punch-${co.type}`} style={{ fontSize:10 }}>{co.label}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Camera Modal */}
      {showCam === "in" && (
        <CameraModal
          title="Clock In — Take a Selfie"
          onSubmit={handleClockIn}
          onClose={() => setShowCam(null)}
          busy={busy}
        />
      )}
      {showCam === "out" && (
        <CameraModal
          title="Clock Out — Take a Selfie"
          onSubmit={handleClockOutCapture}
          onClose={() => setShowCam(null)}
          busy={busy}
        />
      )}

      {/* Tasks Modal (clock-out flow) */}
      {showTasks && clockOutData && (
        <ClockOutTasksModal
          user={user}
          attendanceId={todayRecord?.id}
          clockOutData={clockOutData}
          supabase={supabase}
          onDone={finaliseClockOut}
          onClose={() => { setShowTasks(false); setClockOutData(null); }}
        />
      )}
    </>
  );
}

export function CalendarView({ user, supabase }) {
  const t = new Date();
  const [cur, setCur]  = useState({ y: t.getFullYear(), m: t.getMonth() });
  const [sel, setSel]  = useState(new Date().toISOString().split("T")[0]);
  const [att, setAtt]  = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
const [monthlyBalance, setMonthlyBalance] = useState(null);
const monthlyScheme = isMonthlyLeaveRole(user);

useEffect(() => {
  if (!monthlyScheme) return;
  const monthStr = `${cur.y}-${pad(cur.m + 1)}`;
  computeMonthlyLeaveBalance(supabase, user, monthStr).then(setMonthlyBalance);
}, [cur, user.user_name, monthlyScheme]);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WDAYS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const pad    = n => String(n).padStart(2,"0");

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    const from = `${cur.y}-${pad(cur.m+1)}-01`;
    const lastDay = new Date(cur.y, cur.m+1, 0).getDate();
    const to = `${cur.y}-${pad(cur.m+1)}-${pad(lastDay)}`;

    const { data: attData } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_name", user.user_name)
      .gte("date", from)
      .lte("date", to);

   const { data: leaveData } = await fromMaybe('site_leaves', (q) =>
    q
      .select('*')
      .eq('user_name', user.user_name)
      .in('status', ['approved', 'Approved'])
      .lte('from_date', to)
      .gte('to_date', from)
  );

    setAtt(attData || []);
    setLeaves(leaveData || []);
    setLoading(false);
  }, [cur, user.user_name, supabase]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  const attMap = {};
  att.forEach(a => { attMap[a.date] = a; });

const leaveMap = {};
leaves.forEach(lv => {
  // Parse date parts directly to avoid timezone shifts
  const [sy, sm, sd] = lv.from_date.split("-").map(Number);
  const [ey, em, ed] = lv.to_date.split("-").map(Number);
  
  const start = new Date(sy, sm - 1, sd); // local midnight, no timezone issue
  const end   = new Date(ey, em - 1, ed);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // Format as YYYY-MM-DD using local date parts, not UTC
    const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    leaveMap[ds] = lv;
  }
});

  const selRecord = attMap[sel];

  const firstDay    = new Date(cur.y, cur.m, 1).getDay();
  const daysInMonth = new Date(cur.y, cur.m+1, 0).getDate();
  const nowLocal = new Date();
  const todayStr = `${nowLocal.getFullYear()}-${pad(nowLocal.getMonth() + 1)}-${pad(nowLocal.getDate())}`;
  const canGoNext =
    cur.y < nowLocal.getFullYear() ||
    (cur.y === nowLocal.getFullYear() && cur.m < nowLocal.getMonth());
  const dateStr     = d => `${cur.y}-${pad(cur.m+1)}-${pad(d)}`;
  const cells       = [...Array(firstDay).fill(null), ...Array(daysInMonth).keys()].map((v,i) => i < firstDay ? null : v+1);

  const isAbsent = (ds) => {
    if (ds >= todayStr) return false;
    const dayOfWeek = new Date(ds + "T00:00:00").getDay();
    if (leaveMap[ds]) return false;
    return !attMap[ds];
  };

  const getCellClass = (rec, ds) => {
    if (leaveMap[ds])                   return "leave-day";
    if (!rec)                           return isAbsent(ds) ? "absent-day" : "";
    if (rec.status === "absent")        return "absent-day";
    if (rec.clock_in_status === "late") return "late-in";
    if (rec.clock_in && rec.clock_out)  return "on-time";
    if (rec.clock_in && !rec.clock_out) return "half-day";
    return "";
  };

  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  att.forEach(a => {
    if (a.clock_in_status === "late") counts.late++;
    else if (a.status === "present")  counts.present++;
    else if (a.status === "absent")   counts.absent++;
  });
  counts.leave = Object.keys(leaveMap).filter(ds => {
    const from = `${cur.y}-${pad(cur.m+1)}-01`;
    const to   = `${cur.y}-${pad(cur.m+1)}-${pad(new Date(cur.y, cur.m+1, 0).getDate())}`;
    return ds >= from && ds <= to;
  }).length;
  Array.from({ length: new Date(cur.y, cur.m+1, 0).getDate() }, (_, i) => {
    const ds = `${cur.y}-${pad(cur.m+1)}-${pad(i+1)}`;
    if (isAbsent(ds)) counts.absent++;
  });

  const fmtTime = iso => iso
    ? new Date(iso).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:true })
    : "—";

  return (
    <div>
      {/* Stats */}
      <div className="stat-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))", gap: 8 }}>
        {[
          ["On Time", counts.present, "#16a34a"],
          ["Late",    counts.late,    "#d97706"],
          ["Absent",  counts.absent,  "#dc2626"],
          ["Leave",   counts.leave,   "#7c3aed"],
          ...(monthlyScheme ? [["Leaves Left", monthlyBalance?.remaining ?? "—", "#0284c7"]] : []),
        ].map(([l, v, c]) => (
          <div key={l} className="stat-card">
            <div className="stat-val" style={{ color: c }}>{v}</div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={() => setCur(p => p.m===0 ? {y:p.y-1,m:11} : {y:p.y,m:p.m-1})}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="cal-nav-title">{MONTHS[cur.m]} {cur.y}</div>
        <button
          className="cal-nav-btn"
          disabled={!canGoNext}
          onClick={() => {
            if (!canGoNext) return;
            setCur((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }));
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {loading ? <div className="loading"><div className="spinner"/></div> : (
        <div className="cal-grid">
          {WDAYS.map(d => <div key={d} className="cal-dh">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="cal-cell emp"/>;
            const ds     = dateStr(d);
            const rec    = attMap[ds];
            const cls    = getCellClass(rec, ds);
            const isToday = ds === todayStr;
            const isFuture = ds > todayStr;
            const isSel   = ds === sel;
            return (
              <div
                key={ds}
                className={`cal-cell${isToday ? " today" : ""}${isSel ? " sel" : ""}${isFuture ? " future" : ""}${cls ? " " + cls : ""}`}
                onClick={() => { if (!isFuture) setSel(ds); }}
                title={
                  leaveMap[ds] ? `On Leave · ${leaveMap[ds].leave_type || ""}` :
                  rec ? `${rec.status}${rec.clock_in_status ? " · " + rec.clock_in_status : ""}` :
                  isAbsent(ds) ? "Absent" : ""
                }
              >
                <div className="cal-dn">{d}</div>
                {leaveMap[ds] && (
                  <div className="att-dot-row">
                    <div className="att-dot" style={{ background: "#7c3aed" }}/>
                  </div>
                )}
                {!leaveMap[ds] && rec && (
                  <div className="att-dot-row">
                    {rec.clock_in  && <div className="att-dot" style={{ background: rec.clock_in_status === "late" ? "#d97706" : "#16a34a" }}/>}
                    {rec.clock_out && <div className="att-dot" style={{ background: rec.clock_out_status === "early" ? "#f59e0b" : rec.clock_out_status === "overtime" ? "#2563eb" : "#16a34a" }}/>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="cal-legend">
        {[
          ["On Time", "#16a34a"],
          ["Late In", "#d97706"],
          ["Absent",  "#dc2626"],
          ["Leave",   "#7c3aed"],
          ["Partial", "#f59e0b"],
        ].map(([l,c]) => (
          <div key={l} className="cal-leg-item">
            <div className="cal-leg-dot" style={{ background:c }}/>
            {l}
          </div>
        ))}
      </div>

      {/* Selected day detail */}
      <div className="att-summary">
        <div className="att-sum-title">
          {new Date(sel + "T00:00:00").toLocaleDateString("en-IN", {
            weekday:"long", day:"numeric", month:"long", year:"numeric"
          })}
        </div>
        <div className="att-sum-info">
          {leaveMap[sel] ? (
            <>
              <span>Status: <strong style={{ color:"#7c3aed" }}>On Leave</strong></span>
              <span>Type: <strong>{leaveMap[sel].leave_type || "—"}</strong></span>
              <span>Period: <strong>
                {new Date(leaveMap[sel].from_date + "T00:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
                {" – "}
                {new Date(leaveMap[sel].to_date + "T00:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short" })}
              </strong></span>
              {leaveMap[sel].reason && (
                <span>Reason: <strong>{leaveMap[sel].reason}</strong></span>
              )}
            </>
          ) : !selRecord ? (
            <span style={{ color:"var(--ink3)" }}>No attendance record.</span>
          ) : (
            <>
              <span>Status: <strong style={{ color: selRecord.status === "present" ? "#16a34a" : "#dc2626" }}>
                {selRecord.status?.charAt(0).toUpperCase() + selRecord.status?.slice(1)}
              </strong></span>
              <span>Clock In: <strong>{fmtTime(selRecord.clock_in)}</strong>
                {selRecord.clock_in_status && (
                  <span className={`punch-status punch-${selRecord.clock_in_status}`} style={{ marginLeft:8, fontSize:10 }}>
                    {selRecord.clock_in_status === "late" ? "Late" : "On Time"}
                  </span>
                )}
              </span>
              <span>Clock Out: <strong>{fmtTime(selRecord.clock_out)}</strong>
                {selRecord.clock_out_status && (
                  <span className={`punch-status punch-${selRecord.clock_out_status}`} style={{ marginLeft:8, fontSize:10 }}>
                    {selRecord.clock_out_status}
                  </span>
                )}
              </span>
              {selRecord.clock_in_location && (
                <span style={{ fontSize:11.5, color:"var(--ink3)" }}>
                  📍 In: {selRecord.clock_in_location}
                </span>
              )}
              {selRecord.clock_out_location && (
                <span style={{ fontSize:11.5, color:"var(--ink3)" }}>
                  📍 Out: {selRecord.clock_out_location}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}