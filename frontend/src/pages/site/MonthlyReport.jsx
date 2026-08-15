import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";
import { ensureSiteBucket, sanitizeBucketName, SITE_FILES_BUCKET, uploadViaApi } from "../../lib/ensureBucket";
import "./MonthlyReport.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MAX_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_FILE = 40 * 1024 * 1024;

function fmtBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function FolderIco({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M8 20c0-3.3 2.7-6 6-6h12l4 5h20c3.3 0 6 2.7 6 6v23c0 3.3-2.7 6-6 6H14c-3.3 0-6-2.7-6-6V20z" fill="#FBBF24"/>
      <path d="M8 28h48v20c0 3.3-2.7 6-6 6H14c-3.3 0-6-2.7-6-6V28z" fill="#F59E0B"/>
    </svg>
  );
}

function ChartIco() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="12" width="4" height="8" rx="1" fill="#F2C49A"/>
      <rect x="10" y="8" width="4" height="12" rx="1" fill="#DC6900"/>
      <rect x="17" y="4" width="4" height="16" rx="1" fill="#561501"/>
    </svg>
  );
}

export default function MonthlyReport({ user }) {
  const now = new Date();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [project, setProject] = useState("");
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [formErr, setFormErr] = useState("");
  const inputRef = useRef(null);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);
  const canSubmit = month && year && project && files.length > 0 && !uploading;

  async function loadRows() {
    setLoading(true);
    setErr("");
    const { data, error } = await supabase
      .from("monthly_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      setErr(error.message.includes("monthly_reports")
        ? "Monthly reports table is missing. Run backend/sql/add_monthly_reports.sql in Supabase."
        : error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  useEffect(() => { loadRows(); }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const names = new Set();
      const add = (v) => { const s = String(v || "").trim(); if (s) names.add(s); };
      add(user?.site_name);
      const arr = user?.site_names;
      if (Array.isArray(arr)) arr.forEach(add);
      try {
        const sites = await api("/sites");
        (sites || []).forEach((p) => add(p.name || p.site_name));
      } catch { /* optional */ }
      try {
        const { data } = await supabase.from("projects").select("name").order("name");
        (data || []).forEach((p) => add(p.name));
      } catch { /* optional */ }
      setProjects([...names].sort((a, b) => a.localeCompare(b)));
    })();
  }, [open, user]);

  function takeFileList(list) {
    const next = Array.from(list || []).filter((f) => f && f.size > 0);
    setFiles(next);
    setFormErr("");
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer?.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      const collected = [];
      const walk = (entry, prefix) => new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((f) => {
            Object.defineProperty(f, "webkitRelativePath", { value: `${prefix}${f.name}` });
            collected.push(f);
            resolve();
          }, () => resolve());
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(async (ents) => {
            for (const ent of ents) await walk(ent, `${prefix}${entry.name}/`);
            resolve();
          }, () => resolve());
        } else resolve();
      });
      Promise.all(Array.from(items).map((it) => {
        const ent = it.webkitGetAsEntry?.();
        return ent ? walk(ent, "") : Promise.resolve();
      })).then(() => takeFileList(collected));
      return;
    }
    takeFileList(e.dataTransfer.files);
  }

  async function submit() {
    if (!canSubmit) return;
    if (totalBytes > MAX_BYTES) {
      setFormErr("Folder is larger than 5 GB.");
      return;
    }
    const tooBig = files.filter((f) => f.size > MAX_FILE);
    if (tooBig.length) {
      setFormErr(`${tooBig.length} file(s) over 40 MB — remove them and try again.`);
      return;
    }
    setUploading(true);
    setPct(0);
    setFormErr("");
    try {
      const site = project;
      const { prefix } = await ensureSiteBucket(site);
      const stamp = Date.now();
      const folderPath = `${prefix}/monthly/${year}/${String(month).padStart(2, "0")}/${sanitizeBucketName(project)}/${stamp}`;
      let done = 0;
      let firstUrl = "";
      for (const file of files) {
        const rel = (file.webkitRelativePath || file.name).replace(/^\/+/, "");
        const url = await uploadViaApi({
          path: `${folderPath}/${rel}`,
          blob: file,
          contentType: file.type || "application/octet-stream",
          bucket: SITE_FILES_BUCKET,
        });
        if (!firstUrl) firstUrl = url;
        done += file.size;
        setPct(Math.round((done / Math.max(totalBytes, 1)) * 100));
      }
      const { error } = await supabase.from("monthly_reports").insert({
        month: Number(month),
        year: Number(year),
        project_name: project,
        site_name: site,
        submitted_by: user?.user_name || user?.username || null,
        submitted_by_name: user?.name || user?.full_name || null,
        folder_path: folderPath,
        folder_url: firstUrl || null,
        file_count: files.length,
        total_bytes: totalBytes,
      });
      if (error) throw error;
      setOpen(false);
      setFiles([]);
      setMonth("");
      setProject("");
      setPct(0);
      await loadRows();
    } catch (e) {
      setFormErr(e.message || "Upload failed");
    }
    setUploading(false);
  }

  const folderUrl = (r) => {
    if (!r.folder_path) return r.folder_url;
    const base = import.meta.env.VITE_SUPABASE_URL || "";
    if (!base) return r.folder_url;
    return `${base}/storage/v1/object/public/${SITE_FILES_BUCKET}/${r.folder_path}`;
  };

  return (
    <div className="mr-page">
      <div className="mr-head">
        <div>
          <h2>Monthly Reports</h2>
          <p>Every monthly pack submitted so far. Add a new folder upload when ready.</p>
        </div>
        <button type="button" className="mr-add-btn" onClick={() => { setFormErr(""); setOpen(true); }}>
          + Add Monthly Report
        </button>
      </div>

      {loading && <div className="mr-empty">Loading reports…</div>}
      {err && <div className="mr-empty" style={{ color: "#dc2626" }}>{err}</div>}
      {!loading && !err && rows.length === 0 && (
        <div className="mr-empty">No monthly reports yet. Click Add Monthly Report to upload the first folder.</div>
      )}
      {!loading && rows.length > 0 && (
        <div className="mr-list">
          {rows.map((r) => (
            <div key={r.id} className="mr-card">
              <div className="mr-card-ico"><ChartIco /></div>
              <div className="mr-card-body">
                <div className="mr-card-title">{r.project_name} · {MONTHS[(r.month || 1) - 1]} {r.year}</div>
                <div className="mr-card-meta">
                  {r.submitted_by_name || r.submitted_by || "—"} · {r.file_count || 0} files · {fmtBytes(r.total_bytes)}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </div>
              </div>
              {(r.folder_url || r.folder_path) && (
                <a className="mr-open" href={folderUrl(r)} target="_blank" rel="noreferrer">Open</a>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mr-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !uploading) setOpen(false); }}>
          <div className="mr-modal" role="dialog" aria-label="Monthly Report Upload">
            <div className="mr-modal-hdr">
              <div className="mr-modal-title"><ChartIco /> Monthly Report Upload</div>
              <button type="button" className="mr-x" onClick={() => !uploading && setOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="mr-modal-body">
              <div className="mr-grid2">
                <div className="mr-field">
                  <label className="mr-label">Month <span className="mr-req">*</span></label>
                  <select className="mr-select" value={month} onChange={(e) => setMonth(e.target.value)}>
                    <option value="">Select Month</option>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="mr-field">
                  <label className="mr-label">Year <span className="mr-req">*</span></label>
                  <select className="mr-select" value={year} onChange={(e) => setYear(e.target.value)}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div className="mr-field">
                <label className="mr-label">Project Name <span className="mr-req">*</span></label>
                <select className="mr-select" value={project} onChange={(e) => setProject(e.target.value)}>
                  <option value="">Select Project</option>
                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="mr-field">
                <label className="mr-label">Upload Folder <span className="mr-req">*</span> <FolderIco size={16} /></label>
                <div
                  className={`mr-drop${dragOver ? " is-over" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                >
                  <FolderIco />
                  <div className="mr-drop-title">Drag &amp; Drop folder here</div>
                  <div className="mr-drop-sub">Or click to browse folder</div>
                  <div className="mr-drop-limit">Max total size: 5 GB</div>
                  {files.length > 0 && (
                    <div className="mr-file-summary">{files.length} files · {fmtBytes(totalBytes)}</div>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  webkitdirectory="true"
                  directory="true"
                  hidden
                  onChange={(e) => takeFileList(e.target.files)}
                />
              </div>
              {(uploading || files.length > 0) && (
                <div className="mr-progress-wrap">
                  <div className="mr-progress-row">
                    <span>{uploading ? "Uploading…" : "Folder ready"}</span>
                    <span>{uploading ? `${pct}%` : `${files.length} files`}</span>
                  </div>
                  <div className="mr-bar"><i style={{ width: uploading ? `${pct}%` : "100%" }} /></div>
                </div>
              )}
            </div>
            {formErr && <p className="mr-err">{formErr}</p>}
            <div className="mr-footer">
              <button type="button" className="mr-btn mr-btn-cancel" disabled={uploading} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="mr-btn mr-btn-go" disabled={!canSubmit} onClick={submit}>
                {uploading ? "Uploading…" : "Upload Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
