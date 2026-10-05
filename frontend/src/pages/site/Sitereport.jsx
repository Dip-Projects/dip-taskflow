import { useState, useRef, useEffect } from "react";
import { generateSiteReportPDF } from "./generateSiteReportPDF";
import logoAsset from "../../assets/logo.png";
import { processImage } from "../../utils/imageUtils.js";
import './Sitereport.css';
import { supabase, supabaseUrl, supabaseAnonKey, fromMaybe } from '../../lib/supabase';
import { api } from '../../lib/api';
import { ensureSiteBucket, sanitizeBucketName, SITE_FILES_BUCKET, uploadViaApi } from '../../lib/ensureBucket';

const SUBMIT_STEPS = [
  { key: "saving",    label: "Saving report…" },
  { key: "pdf",       label: "Generating PDF…" },
  { key: "uploading", label: "Uploading PDF…" },
  { key: "done",      label: "Finalising…" },
];

// Add this component before SiteReport default export
function SubmitOverlay({ currentStep }) {
  const idx = SUBMIT_STEPS.findIndex(s => s.key === currentStep);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(240, 237,232,.96)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", zIndex: 9999, gap: 20, backdropFilter: "blur(4px)",
    }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #e2e8f0", borderTopColor: "#800000", animation: "spin .7s linear infinite" }} />
      <div style={{ fontSize: 18, fontWeight: 800, color: "#800000" }}>Generating Site Visit Report…</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 340 }}>
        {SUBMIT_STEPS.map((s, i) => {
          const isDone    = i < idx;
          const isActive  = i === idx;
          const isPending = i > idx;
          return (
            <div key={s.key} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
              background: isDone ? "#f0fdf4" : isActive ? "#eff6ff" : "#f8fafc",
              color:      isDone ? "#166534" : isActive ? "#1e3a5f" : "#94a3b8",
            }}>
              <span style={{ fontSize: 13, minWidth: 16 }}>
                {isDone ? "✓" : isActive ? "⟳" : "○"}
              </span>
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const _bucketEnsuredCache = new Set();

async function ensureBucketExists(bucketName, site) {
  if (_bucketEnsuredCache.has(bucketName)) return;
  await ensureSiteBucket(site);
  _bucketEnsuredCache.add(bucketName);
}

function buildSiteDatePath(date) {
  const [year, month, day] = date.split("-");
  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const monthName = monthNames[parseInt(month, 10) - 1];
  const dayFolder = `${day}-${month}-${year}`;
  return `${year}/${monthName}/${dayFolder}`;
}

async function uploadSvrPdfToSupabase(blob, fileName, site, date) {
  const { prefix } = await ensureSiteBucket(site);
  const datePath = buildSiteDatePath(date);
  const path = `${prefix}/svr/reports/${datePath}/${fileName}`;
  return uploadViaApi({
    path,
    blob,
    contentType: "application/pdf",
    bucket: SITE_FILES_BUCKET,
  });
}

function cleanSvrDraftPayload(payload) {
  const photos = (payload?.photos || []).map((p) => ({
    dataUrl: p?.dataUrl || "",
    caption: p?.caption || "",
  }));
  return JSON.parse(JSON.stringify({ ...payload, photos }));
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes(String(column).toLowerCase()) && (
    msg.includes("column") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
}

function isMissingColumnMsg(message) {
  return /column .+ does not exist/i.test(String(message || ""));
}

async function querySvrDraft(site_name, reporter) {
  const attempts = [
    { col: "reporter", order: "saved_at" },
    { col: "reporter", order: null },
    { col: "submitted_by", order: "updated_at" },
    { col: "submitted_by", order: null },
  ];
  let lastFatal = "";
  let queryWorked = false;
  for (const attempt of attempts) {
    let q = supabase.from("svr_drafts").select("*").eq("site_name", site_name).eq(attempt.col, reporter).limit(1);
    if (attempt.order) q = q.order(attempt.order, { ascending: false });
    const { data, error } = await q;
    if (error) {
      if (isMissingColumnMsg(error.message)) continue;
      lastFatal = error.message;
      continue;
    }
    queryWorked = true;
    if (data?.[0]) return { ok: true, draft: data[0] };
  }
  if (!queryWorked && lastFatal) return { ok: false, error: lastFatal, draft: null };
  return { ok: true, draft: null };
}

async function writeSvrDraftRow(existingId, rows) {
  let lastError = "";
  for (const row of rows) {
    const req = existingId
      ? supabase.from("svr_drafts").update(row).eq("id", existingId)
      : supabase.from("svr_drafts").insert(row);
    const { error } = await req;
    if (!error) return { ok: true };
    lastError = error.message;
    if (/payload|too large|bytes|json/i.test(lastError) && row.payload?.photos?.length) {
      const slim = { ...row, payload: { ...row.payload, photos: [] } };
      const retry = existingId
        ? supabase.from("svr_drafts").update(slim).eq("id", existingId)
        : supabase.from("svr_drafts").insert(slim);
      const { error: slimErr } = await retry;
      if (!slimErr) return { ok: true, warning: "Draft saved without photos (files were too large)." };
      lastError = slimErr.message;
    }
  }
  return { ok: false, error: lastError || "Failed to save draft." };
}

async function saveSvrDraft(payload) {
  const site = String(payload?.site_name || "").trim();
  const reporter = String(payload?.reporter_name || "").trim();
  if (!site || !reporter) {
    return { ok: false, error: "Site name and reporter name are required." };
  }

  let clean;
  try {
    clean = cleanSvrDraftPayload(payload);
  } catch (e) {
    return { ok: false, error: e.message || "Could not prepare draft data." };
  }

  const now = new Date().toISOString();
  const found = await querySvrDraft(site, reporter);
  if (!found.ok && found.error) return found;

  const result = await writeSvrDraftRow(found.draft?.id, [
    { site_name: site, reporter, payload: clean, saved_at: now },
    { site_name: site, reporter, payload: clean },
    { site_name: site, submitted_by: reporter, payload: clean, updated_at: now },
    { site_name: site, submitted_by: reporter, payload: clean },
  ]);
  if (!result.ok) console.error("saveSvrDraft error:", result.error);
  return result;
}

async function loadSvrDraft(site_name, reporter) {
  if (!site_name || !reporter) return { ok: true, draft: null };
  return querySvrDraft(site_name, reporter);
}

async function deleteSvrDraft(site_name, reporter) {
  if (!site_name || !reporter) return { ok: true };
  const found = await querySvrDraft(site_name, reporter);
  if (!found.ok) return found;
  if (found.draft?.id) {
    const { error } = await supabase.from("svr_drafts").delete().eq("id", found.draft.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  const attempts = [
    supabase.from("svr_drafts").delete().eq("site_name", site_name).eq("reporter", reporter),
    supabase.from("svr_drafts").delete().eq("site_name", site_name).eq("submitted_by", reporter),
  ];
  let lastError = "";
  for (const req of attempts) {
    const { error } = await req;
    if (!error) return { ok: true };
    lastError = error.message;
    if (isMissingColumnError({ message: lastError }, "reporter") || isMissingColumnError({ message: lastError }, "submitted_by")) {
      continue;
    }
  }
  return lastError ? { ok: false, error: lastError } : { ok: true };
}

// ─── Fetch all unique site names from user_details ────────────────────────────
async function fetchAllSiteNames() {
  const { data, error } = await supabase
    .from("site_user_details")
    .select("site_name, site_names")
    .eq("status", "Active");

  if (error) {
    console.warn("fetchAllSiteNames site_user_details:", error.message);
  }

  const siteMap = new Map(); // lowercase → display label

  const toTitleCase = (str) =>
    str
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const addSite = (raw) => {
    if (!raw || !raw.trim()) return;
    const key     = raw.trim().toLowerCase();
    const display = toTitleCase(raw);
    if (!siteMap.has(key)) {
      siteMap.set(key, display);
    }
  };

  (data || []).forEach((row) => {
    if (row.site_name) addSite(row.site_name);

    if (Array.isArray(row.site_names)) {
      row.site_names.forEach(addSite);
    }

    if (typeof row.site_names === "string") {
      try {
        const parsed = JSON.parse(row.site_names);
        if (Array.isArray(parsed)) parsed.forEach(addSite);
        else addSite(row.site_names);
      } catch (_) {
        addSite(row.site_names);
      }
    }
  });

  if (siteMap.size === 0) {
    try {
      const projects = await api("/sites");
      (projects || []).forEach((p) => addSite(p.name));
    } catch { /* ignore */ }
    const { data: users } = await fromMaybe("users", (q) =>
      q.select("site_name, site_names")
    );
    (users || []).forEach((row) => {
      addSite(row.site_name);
      if (Array.isArray(row.site_names)) row.site_names.forEach(addSite);
    });
  }

  // Sort by display label alphabetically
  return Array.from(siteMap.values()).sort((a, b) =>
    a.localeCompare(b)
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Section({ num, title, children, openSections, toggleSection }) {
  const open = !!openSections[num];
  const ref  = useRef(null);

  const handleToggle = () => {
    const opening = !open;
    toggleSection(num);
    if (opening) {
      setTimeout(() => {
        const el = ref.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top, behavior: "smooth" });
      }, 70);
    }
  };

  return (
    <div className="svr-section" ref={ref}>
      <button
        className={`svr-sec-header${open ? " open" : ""}`}
        onClick={handleToggle}
      >
        <span className="svr-sec-num">{num}</span>
        <span className="svr-sec-title">{title}</span>
        <svg
          className={`svr-chevron${open ? " open" : ""}`}
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="svr-sec-body">{children}</div>}
    </div>
  );
}

function Field({ label, required, children, hint, col2 }) {
  return (
    <div className={`svr-field${col2 ? " svr-col2" : ""}`}>
      <label className="svr-label">
        {label}
        {required && <span className="svr-req"> *</span>}
      </label>
      {children}
      {hint && <span className="svr-hint">{hint}</span>}
    </div>
  );
}

function TextArea({ value, onChange, placeholder }) {
  return (
    <textarea
      className="svr-textarea"
      placeholder={placeholder}
      value={value}
      rows={6}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const s   = e.target.selectionStart;
          const t   = e.target.value;
          // Check if current line is a sub-bullet (starts with spaces)
          const lineStart = t.lastIndexOf("\n", s - 1) + 1;
          const currentLine = t.slice(lineStart, s);
          const isSub = /^ {2,}/.test(currentLine);
          const bullet = isSub ? "\n  ◦ " : "\n• ";
          const newVal = t.slice(0, s) + bullet + t.slice(e.target.selectionEnd);
          onChange(newVal);
          setTimeout(() => {
            e.target.selectionStart = e.target.selectionEnd = s + bullet.length;
          }, 0);
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const s   = e.target.selectionStart;
          const t   = e.target.value;
          // Find start of current line
          const lineStart = t.lastIndexOf("\n", s - 1) + 1;
          const currentLine = t.slice(lineStart, s);
          const isSub = /^ {2,}/.test(currentLine);

          if (e.shiftKey) {
            // Shift+Tab: unindent — remove leading spaces if sub-bullet
            if (isSub) {
              const newVal = t.slice(0, lineStart) + currentLine.replace(/^ {2}/, "") + t.slice(s);
              onChange(newVal);
              setTimeout(() => {
                e.target.selectionStart = e.target.selectionEnd = s - 2;
              }, 0);
            }
          } else {
            // Tab: indent current line into sub-bullet
            if (!isSub) {
              // Replace leading "• " with "  ◦ " on the current line
              const dedotted = currentLine.replace(/^• ?/, "");
              const newLine  = "  ◦ " + dedotted;
              const newVal   = t.slice(0, lineStart) + newLine + t.slice(s);
              const diff     = newLine.length - currentLine.length;
              onChange(newVal);
              setTimeout(() => {
                e.target.selectionStart = e.target.selectionEnd = s + diff;
              }, 0);
            }
          }
        }
      }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SiteReport({ user }) {
  const [form, setForm] = useState({
    visit_date: new Date().toISOString().split("T")[0],
    visit_time: "",
    site_name: "",
    reporter_name: user?.name || user?.full_name || "",
    designation: "",
    designation_other: "",
    progress_of_work: "",
    quality_observations: "",
    safety_concerns: "",
    issues_concerns: "",
    site_visit_instructions: "",
    key_instructions: "",
  });

  // ── Site name dropdown state ──────────────────────────────────────────────
  const [siteOptions, setSiteOptions]         = useState([]);
  const [siteOptionsLoading, setSiteOptionsLoading] = useState(true);
  // "selected" tracks the dropdown value; "other" means user typed a custom name
  const [siteSelectValue, setSiteSelectValue] = useState("");
  const [customSiteName, setCustomSiteName]   = useState("");

  const [visitType, setVisitType] = useState("single");
  const [visitors, setVisitors] = useState([{ name: "", designation: "" }]);

const addVisitor = () => setVisitors(p => [...p, { name: "", designation: "" }]);
const removeVisitor = (i) => setVisitors(p => p.filter((_, idx) => idx !== i));
const updateVisitor = (i, k, v) => setVisitors(p => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);
useEffect(() => {
  const handler = () => setIsMobile(window.innerWidth <= 600);
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}, []);
  // Fetch site names once on mount
  useEffect(() => {
    setSiteOptionsLoading(true);
    fetchAllSiteNames().then((names) => {
      setSiteOptions(names);
      setSiteOptionsLoading(false);
    });
  }, []);

  // Sync form.site_name whenever dropdown or custom input changes
  const handleSiteSelectChange = (val) => {
    setSiteSelectValue(val);
    if (val === "__other__") {
      // Keep whatever the user typed in the custom box (or empty)
      setForm((p) => ({ ...p, site_name: customSiteName }));
    } else {
      setCustomSiteName("");
      setForm((p) => ({ ...p, site_name: val }));
    }
  };

  const handleCustomSiteChange = (val) => {
    setCustomSiteName(val);
    setForm((p) => ({ ...p, site_name: val }));
  };

  const [photosProcessing, setPhotosProcessing] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [photos, setPhotos] = useState([]);
// Replace existing state declarations
const [submitting, setSubmitting] = useState(false);
const [submitStage, setSubmitStage] = useState(""); // "saving" | "pdf" | "uploading" | "done"
  const [toast, setToast] = useState(null);
  const [openSections, setOpenSections] = useState({ 1: true });

  const [draftInfo,        setDraftInfo]        = useState(null);
  const [draftCheckStatus, setDraftCheckStatus] = useState("idle");
  const [savingDraft,      setSavingDraft]      = useState(false);
  const fileRef = useRef();

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    const site = form.site_name?.trim();
    const rep  = form.reporter_name?.trim();
    if (!site || !rep) { setDraftInfo(null); setDraftCheckStatus("idle"); return; }
    let cancelled = false;
    setDraftCheckStatus("checking");
    loadSvrDraft(site, rep).then(res => {
      if (cancelled) return;
      if (!res.ok) { setDraftInfo(null); setDraftCheckStatus("error"); return; }
      setDraftInfo(res.draft);
      setDraftCheckStatus(res.draft ? "found" : "none");
    });
    return () => { cancelled = true; };
  }, [form.site_name, form.reporter_name]);

  const toggleSection = (n) =>
    setOpenSections((p) => ({ ...p, [n]: !p[n] }));

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // ── Image handling ──────────────────────────────────────────────────────────
  const handleFiles = async (files) => {
    const fileArr = Array.from(files);
    setPhotosProcessing(true);
    for (const file of fileArr) {
      try {
        const processed = await processImage(file);
        setPhotos((p) => [...p, { dataUrl: processed.dataUrl, caption: "", file }]);
      } catch (err) {
        showToast("error", `Could not load ${file.name}: ${err.message}`);
      }
    }
    setPhotosProcessing(false);
  };

  const removePhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const updateCaption = (i, v) =>
    setPhotos((p) => p.map((ph, idx) => (idx === i ? { ...ph, caption: v } : ph)));

  // ── Draft handlers ──────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    
    const site = form.site_name?.trim();
    const rep  = form.reporter_name?.trim();
    if (!site || !rep) { showToast("error", "Site name and reporter name are required to save a draft."); return; }
    setSavingDraft(true);
    const res = await saveSvrDraft({ ...form, photos, visitType, visitors });
    setSavingDraft(false);
    if (res.ok) {
      showToast("success", res.warning || "✅ Draft saved successfully!");
      const loaded = await loadSvrDraft(site, rep);
      if (loaded.ok) { setDraftInfo(loaded.draft); setDraftCheckStatus(loaded.draft ? "found" : "none"); }
    } else {
      showToast("error", "Failed to save draft: " + res.error);
    }
  };

  const handleOpenDraft = () => {
    if (!draftInfo) { showToast("error", "No draft available."); return; }
    const d = draftInfo.payload || {};
    setVisitType(d.visitType || "single");
    setVisitors(d.visitors?.length ? d.visitors : [{ name: "", designation: "" }]);

    const restoredSite = d.site_name || "";

    setForm({
      visit_date:           d.visit_date           || new Date().toISOString().split("T")[0],
      visit_time:           d.visit_time           || "",
      site_name:            restoredSite,
      reporter_name:        d.reporter_name        || user?.name || "",
      designation:          d.designation          || "",
      designation_other:    d.designation_other    || "",
      progress_of_work:     d.progress_of_work     || "",
      quality_observations: d.quality_observations || "",
      safety_concerns:      d.safety_concerns      || "",
      issues_concerns:      d.issues_concerns      || "",
      site_visit_instructions: d.site_visit_instructions || "",
      key_instructions:     d.key_instructions     || "",
    });

    // Restore dropdown to the correct option
    if (restoredSite && siteOptions.includes(restoredSite)) {
      setSiteSelectValue(restoredSite);
      setCustomSiteName("");
    } else if (restoredSite) {
      setSiteSelectValue("__other__");
      setCustomSiteName(restoredSite);
    } else {
      setSiteSelectValue("");
      setCustomSiteName("");
    }

    setPhotos((d.photos || []).map((p) => ({ ...p, file: undefined })));
    showToast("success", "✅ Draft restored!");
  };

  const handleDeleteDraft = async () => {
    if (!window.confirm("Delete this draft?")) return;
    const res = await deleteSvrDraft(form.site_name?.trim(), form.reporter_name?.trim());
    if (res.ok) { setDraftInfo(null); setDraftCheckStatus("none"); showToast("success", "Draft deleted."); }
    else showToast("error", "Failed to delete draft: " + res.error);
  };
// Add inside SiteReport component, alongside other state
const [lightbox, setLightbox] = useState(null);
const openLightbox = (idx) => {
  const filtered = photos.filter(p => p.dataUrl);
  if (!filtered.length) return;
  setLightbox({ images: filtered, idx: Math.min(idx, filtered.length - 1) });
};
const closeLightbox = () => setLightbox(null);
const lbPrev = () => setLightbox(p => ({ ...p, idx: (p.idx - 1 + p.images.length) % p.images.length }));
const lbNext = () => setLightbox(p => ({ ...p, idx: (p.idx + 1) % p.images.length }));

// Add keyboard handler
useEffect(() => {
  const handler = (e) => {
    if (!lightbox) return;
    if (e.key === "ArrowRight") lbNext();
    if (e.key === "ArrowLeft")  lbPrev();
    if (e.key === "Escape")     closeLightbox();
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [lightbox]);
  // ── Submit ──────────────────────────────────────────────────────────────────
// Replace handleSubmit entirely:
const handleSubmit = async () => {
  if (!form.visit_date) return showToast("error", "Visit Date is required.");
  if (!form.site_name)  return showToast("error", "Site Name is required.");
  if (!form.reporter_name.trim()) return showToast("error", "Reporter Name is required.");
  if (!form.designation) return showToast("error", "Designation is required.");
  if (form.designation === "other" && !form.designation_other.trim())
    return showToast("error", "Please specify designation.");

  setSubmitting(true);
  setSubmitStage("saving");

  try {
    const designationValue =
      form.designation === "other" ? form.designation_other.trim() : form.designation;

    // Delete any existing report with same site+reporter+date (override old entry)
    await supabase
      .from("site_reports")
      .delete()
      .eq("site_name", form.site_name)
      .eq("reporter_name", form.reporter_name.trim())
      .eq("visit_date", form.visit_date);

    const { data: inserted, error: insertErr } = await supabase
      .from("site_reports")
      .insert([{
        visit_date:              form.visit_date,
        visit_time:              form.visit_time || null,
        site_name:               form.site_name,
        reporter_name:           form.reporter_name.trim(),
        designation:             designationValue,
        progress_of_work:        form.progress_of_work || null,
        quality_observations:    form.quality_observations || null,
        safety_concerns:         form.safety_concerns || null,
        issues_concerns:         form.issues_concerns || null,
        site_visit_instructions: form.site_visit_instructions || null,
        key_instructions:        form.key_instructions || null,
        submitted_by:            user?.user_name || user?.username || null,
        submitted_by_name:       user?.name || user?.full_name || null,
      }])
      .select()
      .single();

    if (insertErr) throw new Error("Report insert failed: " + insertErr.message);
    const reportId = inserted.id;

    setSubmitStage("pdf");
    const { blob: pdfBlob, fileName } = await generateSiteReportPDF(
      {
        visit_date:              form.visit_date,
        visit_time:              form.visit_time,
        site_name:               form.site_name,
        reporter_name:           form.reporter_name.trim(),
        designation:             designationValue,
        progress_of_work:        form.progress_of_work,
        quality_observations:    form.quality_observations,
        safety_concerns:         form.safety_concerns,
        issues_concerns:         form.issues_concerns,
        site_visit_instructions: form.site_visit_instructions,
        key_instructions:        form.key_instructions,
          visitType,
    visitors: visitType === "group" ? visitors.filter(v => v.name.trim()) : [],
      },
      photos,
      logoAsset
    );

    setSubmitStage("uploading");
    let pdfPublicUrl = null;
    try {
      pdfPublicUrl = await uploadSvrPdfToSupabase(pdfBlob, fileName, form.site_name, form.visit_date);
      await supabase.from("site_reports").update({ pdf_url: pdfPublicUrl }).eq("id", reportId);
    } catch (uploadErr) {
      console.error("PDF upload failed (non-fatal):", uploadErr);
      showToast("error", "PDF cloud upload failed: " + uploadErr.message);
    }

    setSubmitStage("done");

    // ── Download ONLY after all steps complete ──
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pdfBlob);
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);

    setSubmitResult({ type: "success", msg: "Report generated and downloaded successfully!" });
    showToast("success", "Site Visit Report submitted successfully!");

    // Reset form
    setForm({
      visit_date: new Date().toISOString().split("T")[0],
      visit_time: "", site_name: "", reporter_name: user?.name || "",
      designation: "", designation_other: "", progress_of_work: "",
      quality_observations: "", safety_concerns: "", issues_concerns: "",
      site_visit_instructions: "", key_instructions: "",
    });
    setSiteSelectValue(""); setCustomSiteName(""); setPhotos([]);setVisitType("single");
setVisitors([{ name: "", designation: "" }]);
    setOpenSections({ 1: true });

  } catch (err) {
    console.error("Submit error:", err);
    setSubmitResult({ type: "error", msg: "Submission failed: " + err.message });
    showToast("error", "Submission failed: " + err.message);
  } finally {
    setSubmitting(false);
    setSubmitStage("");
  }
};

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="svr-root">
        {toast && (
          <div className={`svr-toast svr-toast-${toast.type}`}>
            {toast.type === "success"
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            {toast.msg}
          </div>
        )}

        <div className="svr-info-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Fill in all sections below and attach site photos. On submit, the report is saved to the database, a PDF is generated and downloaded, then uploaded to cloud storage.
        </div>

        {/* ── Draft bar ── */}
        {draftCheckStatus === "checking" && (
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"10px 14px", fontSize:12.5, fontWeight:600,
            color:"#64748b", background:"#f8fafc",
            border:"1.5px solid #e2e8f0", borderRadius:7,
          }}>
            <div style={{
              width:14, height:14, borderRadius:"50%",
              border:"2px solid #e2e8f0", borderTopColor:"#800000",
              animation:"spin .7s linear infinite", flexShrink:0,
            }}/>
            Checking for a saved draft…
          </div>
        )}

        {draftCheckStatus === "error" && (
          <div style={{
            display:"flex", gap:8, alignItems:"flex-start",
            background:"#fef2f2", border:"1.5px solid #fecaca",
            color:"#dc2626", borderRadius:8, padding:"11px 14px", fontSize:13,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Couldn't check for a saved draft. Your work is safe — try saving again.
          </div>
        )}

        {draftCheckStatus === "found" && draftInfo && (
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={handleOpenDraft} style={{
              flex:1, padding:"10px 14px", fontFamily:"'DM Sans',sans-serif",
              fontSize:12.5, fontWeight:700, borderRadius:7, cursor:"pointer",
              background:"#fefce8", color:"#854d0e", border:"1.5px solid #fde68a", transition:"all .15s",
            }}>
              📂 Open Draft <span style={{fontWeight:400,fontSize:11}}>
                ({new Date(draftInfo.saved_at).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})})
              </span>
            </button>
            <button onClick={handleDeleteDraft} style={{
              flex:1, padding:"10px 14px", fontFamily:"'DM Sans',sans-serif",
              fontSize:12.5, fontWeight:700, borderRadius:7, cursor:"pointer",
              background:"#fef2f2", color:"#dc2626", border:"1.5px solid #fecaca", transition:"all .15s",
            }}>
              🗑️ Delete Draft
            </button>
          </div>
        )}

        {/* ── 1. Visit Details ── */}
        <Section num={1} title="Visit Details" openSections={openSections} toggleSection={toggleSection}>
          <div className="svr-grid">
            <Field label="Visit Date" required>
              <input className="svr-input" type="date" value={form.visit_date} onChange={e => set("visit_date", e.target.value)} />
            </Field>
            <Field label="Visit Time">
              <input className="svr-input" type="time" value={form.visit_time} onChange={e => set("visit_time", e.target.value)} />
            </Field>

            {/* ── Site / Project Name — dropdown + optional custom ── */}
            <Field label="Site / Project Name" required col2>
              <select
                className="svr-select"
                value={siteSelectValue}
                onChange={e => handleSiteSelectChange(e.target.value)}
                disabled={siteOptionsLoading}
                style={{ marginBottom: siteSelectValue === "__other__" ? 8 : 0 }}
              >
                <option value="">
                  {siteOptionsLoading ? "Loading sites…" : "— Select a site —"}
                </option>
                {siteOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="__other__">Other (not listed)…</option>
              </select>

              {siteSelectValue === "__other__" && (
                <input
                  className="svr-input"
                  placeholder="Type site / project name…"
                  value={customSiteName}
                  onChange={e => handleCustomSiteChange(e.target.value)}
                  autoFocus
                />
              )}
            </Field>

            <Field label="Designation" required>
              <select className="svr-select" value={form.designation} onChange={e => set("designation", e.target.value)}>
                <option value="">— Select —</option>
                <option value="Site Engineer">Site Engineer</option>
                <option value="Head">Head</option>
                <option value="Co-ordinator">Co-ordinator</option>
                <option value="other">Other…</option>
              </select>
            </Field>
            
            <Field label="Reporter Name" required>
              <input className="svr-input" placeholder="Full name…" value={form.reporter_name} onChange={e => set("reporter_name", e.target.value)} />
            </Field>
            {form.designation === "other" && (
              <Field label="Specify Designation" required col2>
                <input className="svr-input" placeholder="Enter designation…" value={form.designation_other} onChange={e => set("designation_other", e.target.value)} />
              </Field>
              
            )}
          </div>
          <Field label="Visit Type" col2>
  {(() => {
  const isMobile = window.innerWidth <= 600;
  const iconSize = isMobile ? 23 : 13;
  return (
    <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1.5px solid #e2e8f0", width: "fit-content" }}>
      {[
        ["single",
          <><svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Single Person</>
        ],
        ["group",
          <><svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> With Client / Contractor</>
        ]
      ].map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => setVisitType(val)}
          style={{
            display: "inline-flex", alignItems: "center", gap: isMobile ? 8 : 6,
            padding: isMobile ? "10px 18px" : "8px 16px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: isMobile ? 14 : 12.5, fontWeight: 700,
            border: "none", cursor: "pointer",
            transition: "all .15s",
            background: visitType === val ? "#800000" : "#f8fafc",
            color: visitType === val ? "#fff" : "#64748b",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
})()}
</Field>

{visitType === "group" && (
  <Field label="Visitors / Present Members" col2>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {visitors.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="svr-input"
            placeholder="Visitor name…"
            value={v.name}
            onChange={e => updateVisitor(i, "name", e.target.value)}
            style={{ flex: 2 }}
          />
          <input
            className="svr-input"
            placeholder="Designation / Company…"
            value={v.designation}
            onChange={e => updateVisitor(i, "designation", e.target.value)}
            style={{ flex: 2 }}
          />
          {visitors.length > 1 && (
            <button
              type="button"
              onClick={() => removeVisitor(i)}
              style={{
                width: 32, height: 32, borderRadius: 7, border: "1.5px solid #fecaca",
                background: "#fef2f2", color: "#dc2626", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: 16, fontWeight: 700,
              }}
            >×</button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addVisitor}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "7px 14px", borderRadius: 7, border: "1.5px solid #e2e8f0",
          background: "#f8fafc", color: "#475569",
          fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700,
          cursor: "pointer", width: "fit-content",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Visitor
      </button>
    </div>
  </Field>
)}
        </Section>

        <Section num={2} title="Progress of Work & Ongoing Activities" openSections={openSections} toggleSection={toggleSection}>
          <Field label="Details" hint="Press Enter to add bullet points automatically.">
            <TextArea placeholder={"• List ongoing activities\n• Progress updates\n• Work completed today"} value={form.progress_of_work} onChange={v => set("progress_of_work", v)} />
          </Field>
        </Section>

        <Section num={3} title="Quality Observations" openSections={openSections} toggleSection={toggleSection}>
          <Field label="Observations" hint="Include observations on line, level, material quality, testing etc.">
            <TextArea placeholder={"• Line & level checking\n• Material quality\n• Testing reports\n• Other QC observations"} value={form.quality_observations} onChange={v => set("quality_observations", v)} />
          </Field>
        </Section>

        <Section num={4} title="Safety Concerns" openSections={openSections} toggleSection={toggleSection}>
          <Field label="Concerns">
            <TextArea placeholder={"• PPE compliance\n• Scaffolding safety\n• Hazardous area marking\n• Other safety issues"} value={form.safety_concerns} onChange={v => set("safety_concerns", v)} />
          </Field>
        </Section>

        <Section num={5} title="Issues & Concerns" openSections={openSections} toggleSection={toggleSection}>
          <Field label="Issues" hint="Material / manpower shortage, drawing pending, payment delay, etc.">
            <TextArea placeholder={"• Material shortage\n• Manpower shortage\n• Drawing pending\n• Payment delay\n• Other issues"} value={form.issues_concerns} onChange={v => set("issues_concerns", v)} />
          </Field>
        </Section>

        <Section num={6} title="Site Visit Instructions" openSections={openSections} toggleSection={toggleSection}>
          <Field label="Instructions" hint="Point-wise instructions given during the site visit.">
            <TextArea placeholder={"• Instruction point 1\n• Instruction point 2\n• Instruction point 3"} value={form.site_visit_instructions} onChange={v => set("site_visit_instructions", v)} />
          </Field>
        </Section>

        <Section num={7} title="Key Instructions" openSections={openSections} toggleSection={toggleSection}>
          <Field label="Critical Instructions" hint="High-priority instructions that must be acted upon immediately.">
            <TextArea placeholder={"• Critical instruction 1\n• Critical instruction 2"} value={form.key_instructions} onChange={v => set("key_instructions", v)} />
          </Field>
        </Section>

        <Section num={8} title="Site Photos" openSections={openSections} toggleSection={toggleSection}>
          <div>
            {/* ── Drop Zone ── */}
            <div
              onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "true"); }}
              onDragEnter={e => { e.preventDefault(); e.currentTarget.setAttribute("data-drag", "true"); }}
              onDragLeave={e => { e.currentTarget.removeAttribute("data-drag"); }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.removeAttribute("data-drag");
                const files = e.dataTransfer.files;
                if (files?.length) handleFiles(files);
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: "2px dashed #cbd5e1",
                borderRadius: 12,
                padding: "28px 20px",
                textAlign: "center",
                cursor: "pointer",
                background: "#f8fafc",
                transition: "all .2s",
                marginBottom: photos.length > 0 ? 14 : 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#800000";
                e.currentTarget.style.background = "#fff5f5";
              }}
              onMouseLeave={e => {
                if (!e.currentTarget.hasAttribute("data-drag")) {
                  e.currentTarget.style.borderColor = "#cbd5e1";
                  e.currentTarget.style.background = "#f8fafc";
                }
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#475569", marginBottom: 4 }}>
                {photos.length > 0
                  ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added — Add more`
                  : "Add Photos"}
              </div>

            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              hidden
              onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
            />

            {photos.length > 0 && (
              <div className="svr-photo-grid">
                {photos.map((ph, i) => (
                  <div key={i} className="svr-photo-item">
                    <div className="svr-photo-thumb" style={{ position: "relative" }}>
                      <img
                        src={ph.dataUrl}
                        alt={`photo ${i + 1}`}
                        style={{ cursor: "zoom-in" }}
                        onClick={() => openLightbox(i)}
                      />
                      <button className="svr-photo-remove" onClick={() => removePhoto(i)}>×</button>
                    </div>
                    <textarea
                      className="svr-caption-input"
                      rows={2}
                      placeholder="Caption…"
                      value={ph.caption}
                      onChange={e => updateCaption(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Inline submit result */}
        {submitResult && (
          <div className={`svr-result svr-result-${submitResult.type}`}>
            {submitResult.type === "success"
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            }
            {submitResult.msg}
            <button
              onClick={() => setSubmitResult(null)}
              style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2, display: "flex" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        <button
          onClick={handleSaveDraft}
          disabled={submitting || savingDraft}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            width:"100%", marginTop:4, padding:"12px 24px",
            fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:700,
            borderRadius:9, border:"1.5px solid #e2e8f0", cursor: (submitting || savingDraft) ? "not-allowed" : "pointer",
            background:"#fff", color: savingDraft ? "#94a3b8" : "#475569",
            transition:"all .15s", opacity: (submitting || savingDraft) ? 0.7 : 1,
          }}
        >
          {savingDraft ? (
            <>
              <div style={{
                width:13, height:13, borderRadius:"10px",
                border:"2px solid #475569", borderColor:"#475569",
                animation:"spin .7s linear infinite", flexShrink:0,
              }}/>
              Saving Draft…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Draft
            </>
          )}
        </button>

        <button
          onClick={handleSubmit}
          disabled={photosProcessing || submitting}
          className="svr-submit"
        >
          {submitting ? "Generating PDF…" : "Generate Report"}
        </button>

        {submitting && submitStage && (
          <div className="svr-stage">{submitStage}</div>
        )}
      </div>

      {/* Photo processing indicator */}
      {photosProcessing && (
        <div style={{
          position: "fixed", bottom: 28, left: 28, zIndex: 9999,
          display: "flex", alignItems: "center", gap: 12,
          background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 12, padding: "14px 18px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
          fontSize: 13.5, fontWeight: 500, color: "#1e293b",
          animation: "slideUp .25s ease",
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            border: "2.5px solid #e2e8f0", borderTopColor: "#dc2626",
            animation: "spin .7s linear infinite", flexShrink: 0,
          }}/>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Processing images…</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Converting &amp; compressing, please wait</div>
          </div>
        </div>
      )}
      {/* Submit overlay */}
{submitting && submitStage && <SubmitOverlay currentStep={submitStage} />}

{/* Lightbox */}
{lightbox && (() => {
  const img = lightbox.images[lightbox.idx];
  return (
    <div onClick={closeLightbox} style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <button onClick={closeLightbox} style={{
        position: "absolute", top: 16, right: 16, width: 36, height: 36,
        borderRadius: "50%", background: "#dc2626", border: "none",
        color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
      }}>✕</button>
      <div style={{
        position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
        background: "rgba(255,255,255,0.1)", borderRadius: 20,
        padding: "4px 14px", fontSize: 12, fontWeight: 700, color: "#fff",
      }}>
        {lightbox.idx + 1} / {lightbox.images.length}
      </div>
      <button onClick={e => { e.stopPropagation(); lbPrev(); }} style={{
        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
        width: 44, height: 44, borderRadius: "50%",
        background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)",
        color: "#fff", fontSize: 22, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
      }}>‹</button>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: "90vw", maxHeight: "85vh",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      }}>
        <img src={img.dataUrl} alt="" style={{
          maxWidth: "90vw", maxHeight: "78vh", objectFit: "contain",
          borderRadius: 10, border: "1.5px solid rgba(200,100,26,0.4)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }} />
        {img.caption && (
          <div style={{
            background: "rgba(107,45,15,0.2)", border: "1px solid #c8641a",
            borderRadius: 8, padding: "6px 16px", fontSize: 13,
            fontWeight: 600, color: "#fbbf24", maxWidth: "80vw", textAlign: "center",
          }}>
            {img.caption}
          </div>
        )}
      </div>
      <button onClick={e => { e.stopPropagation(); lbNext(); }} style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        width: 44, height: 44, borderRadius: "50%",
        background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)",
        color: "#fff", fontSize: 22, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
      }}>›</button>
    </div>
  );
})()}
    </>
  );
}