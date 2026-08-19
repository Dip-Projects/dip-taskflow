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
  const [viewer, setViewer] = useState(null);
  const [viewerItems, setViewerItems] = useState([]);
  const [viewerPath, setViewerPath] = useState("");
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerErr, setViewerErr] = useState("");
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
      let next = 0;
      const queue = files.slice();
      const worker = async () => {
        for (;;) {
          const i = next;
          next += 1;
          const file = queue[i];
          if (!file) return;
          const rel = (file.webkitRelativePath || file.name).replace(/^\/+/, "");
          let url;
          try {
            url = await uploadViaApi({
              path: `${folderPath}/${rel}`,
              blob: file,
              contentType: file.type || "application/octet-stream",
              bucket: SITE_FILES_BUCKET,
            });
          } catch (e) {
            throw new Error(`${rel}: ${e.message || "upload failed"}`);
          }
          if (!firstUrl) firstUrl = url;
          done += file.size;
          setPct(Math.round((done / Math.max(totalBytes, 1)) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
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

  async function loadFolder(path, { skipNest = false } = {}) {
    setViewerLoading(true);
    setViewerErr("");
    try {
      let current = path;
      let items = [];
      for (let i = 0; i < 8; i += 1) {
        const q = new URLSearchParams({ path: current, bucket: SITE_FILES_BUCKET });
        const data = await api(`/storage/list?${q.toString()}`);
        items = data.items || [];
        current = data.path || current;
        const folders = items.filter((it) => it.isFolder);
        const files = items.filter((it) => !it.isFolder);
        if (!skipNest && files.length === 0 && folders.length === 1) {
          current = folders[0].path;
          continue;
        }
        break;
      }
      setViewerPath(current);
      setViewerItems(items);
    } catch (e) {
      setViewerErr(e.message || "Could not open folder");
      setViewerItems([]);
    }
    setViewerLoading(false);
  }

  function openReport(r) {
    if (!r.folder_path) {
      if (r.folder_url) window.open(r.folder_url, "_blank", "noopener");
      return;
    }
    setViewer(r);
    setViewerPath(r.folder_path);
    setViewerItems([]);
    loadFolder(r.folder_path);
  }

  function viewerUp() {
    if (!viewer?.folder_path) return;
    if (viewerPath === viewer.folder_path) return;
    const parent = viewerPath.replace(/\/[^/]+$/, "");
    if (!parent || parent.length < viewer.folder_path.length) {
      loadFolder(viewer.folder_path);
      return;
    }
    loadFolder(parent);
  }

  return (
    <div className={`mr-page${viewer ? " is-viewing" : ""}`}>
      {!viewer && (
        <>
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
                <button type="button" className="mr-open" onClick={() => openReport(r)}>Open</button>
              )}
            </div>
          ))}
        </div>
      )}
        </>
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

      {viewer && (
        <div className="mr-viewer">
          <div className="mr-viewer-bar">
            <div className="mr-viewer-title">
              <FolderIco size={22} />
              <div>
                <strong>{viewer.project_name} · {MONTHS[(viewer.month || 1) - 1]} {viewer.year}</strong>
                <span>
                  {viewerPath.replace(`${viewer.folder_path}`, "").replace(/^\//, "") || viewer.folder_path}
                  {viewerItems.length ? ` · ${viewerItems.length} items` : ""}
                </span>
              </div>
            </div>
            <div className="mr-viewer-actions">
              {viewerPath !== viewer.folder_path && (
                <button type="button" className="mr-open" onClick={viewerUp}>← Back</button>
              )}
              <button type="button" className="mr-x mr-viewer-x" onClick={() => setViewer(null)} aria-label="Close">×</button>
            </div>
          </div>
          <div className="mr-viewer-body">
            {viewerLoading && <div className="mr-empty">Loading folder…</div>}
            {viewerErr && <div className="mr-empty" style={{ color: "#dc2626" }}>{viewerErr}</div>}
            {!viewerLoading && !viewerErr && viewerItems.length === 0 && (
              <div className="mr-empty">This folder is empty.</div>
            )}
            {!viewerLoading && viewerItems.length > 0 && (
              <table className="mr-file-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {viewerItems.map((it) => (
                    <tr key={it.path}>
                      <td>
                        {it.isFolder ? (
                          <button type="button" className="mr-file-link" onClick={() => loadFolder(it.path, { skipNest: true })}>
                            📁 {it.name}
                          </button>
                        ) : (
                          <a className="mr-file-link" href={it.publicUrl} target="_blank" rel="noreferrer">
                            📄 {it.name}
                          </a>
                        )}
                      </td>
                      <td>{it.isFolder ? "Folder" : (it.name.split(".").pop() || "file").toUpperCase()}</td>
                      <td>{it.isFolder ? "—" : fmtBytes(it.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
