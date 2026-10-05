import { useEffect, useState } from 'react';
import { api, getToken } from '../../../lib/api';
import './tfReact.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function Drawings() {
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [verifiers, setVerifiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    category: 'Architectural',
    drawing_date: '',
    head_id: '',
    revision: 'R0',
    remarks: '',
  });
  const [files, setFiles] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [drawings, projs, heads] = await Promise.all([
        api('/drawings'),
        api('/master/projects'),
        api('/master/verifiers'),
      ]);
      setRows(Array.isArray(drawings) ? drawings : []);
      setProjects(Array.isArray(projs) ? projs : []);
      setVerifiers(Array.isArray(heads) ? heads : []);
    } catch (e) {
      setError(e.message || 'Failed to load drawings (admin)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      [...files].forEach((f) => fd.append('files', f));
      const res = await fetch(`${API_BASE}/drawings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setShowForm(false);
      setFiles([]);
      await load();
    } catch (err) {
      alert(err.message || 'Could not add drawing');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this drawing?')) return;
    setBusy(true);
    try {
      await api(`/drawings/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="tfr-toolbar">
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Add drawing'}
        </button>
      </div>

      {showForm && (
        <form className="tfr-form" onSubmit={submit}>
          <label>
            Project
            <select required value={form.project_id} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}>
              <option value="">Select…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <input required value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </label>
          <label>
            Drawing date
            <input type="date" required value={form.drawing_date} onChange={(e) => setForm((f) => ({ ...f, drawing_date: e.target.value }))} />
          </label>
          <label>
            Head
            <select required value={form.head_id} onChange={(e) => setForm((f) => ({ ...f, head_id: e.target.value }))}>
              <option value="">Select…</option>
              {verifiers.map((v) => (
                <option key={v.id} value={v.id}>{v.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Revision
            <input value={form.revision} onChange={(e) => setForm((f) => ({ ...f, revision: e.target.value }))} />
          </label>
          <label>
            Files
            <input type="file" multiple onChange={(e) => setFiles(e.target.files || [])} />
          </label>
          <label>
            Remarks
            <textarea rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Save drawing'}</button>
        </form>
      )}

      {error && <div className="tfr-error">{error}</div>}
      {loading && <div className="tfr-empty">Loading drawings…</div>}
      {!loading && !rows.length && <div className="tfr-empty">No drawings.</div>}
      {!loading && !!rows.length && (
        <div className="tfr-table-wrap">
          <table className="tfr-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Category</th>
                <th>Date</th>
                <th>Rev</th>
                <th>Files</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.project?.name || '—'}</td>
                  <td>{d.category}</td>
                  <td>{d.drawing_date}</td>
                  <td>{d.revision || '—'}</td>
                  <td>
                    {(d.file_urls || []).slice(0, 2).map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer">file{i + 1}</a>
                    ))}
                  </td>
                  <td>
                    <button type="button" className="ghost" disabled={busy} onClick={() => remove(d.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
