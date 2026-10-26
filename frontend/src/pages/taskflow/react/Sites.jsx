import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

const empty = {
  name: '',
  client_name: '',
  project_type: 'Residential',
  location: '',
  start_date: '',
  expected_end_date: '',
  team_leader_id: '',
  coordinator_id: '',
  site_incharge_id: '',
  description: '',
};

export default function Sites() {
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [sites, emps] = await Promise.all([api('/sites'), api('/master/employees')]);
      setRows(Array.isArray(sites) ? sites : []);
      setPeople(Array.isArray(emps) ? emps : []);
    } catch (e) {
      setError(e.message || 'Failed to load sites');
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
      await api('/sites', { method: 'POST', body: JSON.stringify(form) });
      setForm(empty);
      setShowForm(false);
      await load();
    } catch (err) {
      alert(err.message || 'Could not add site');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this site/project?')) return;
    setBusy(true);
    try {
      await api(`/sites/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="tfr-toolbar">
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Add site'}
        </button>
        <span className="tfr-meta">{rows.length} sites</span>
      </div>

      {showForm && (
        <form className="tfr-form" onSubmit={submit}>
          <label>
            Site / Project name
            <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label>
            Client
            <input required value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
          </label>
          <label>
            Type
            <select value={form.project_type} onChange={(e) => set('project_type', e.target.value)}>
              <option>Residential</option>
              <option>Commercial</option>
              <option>Industrial</option>
              <option>Infrastructure</option>
            </select>
          </label>
          <label>
            Location
            <input required value={form.location} onChange={(e) => set('location', e.target.value)} />
          </label>
          <label>
            Start date
            <input type="date" required value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </label>
          <label>
            Expected end
            <input type="date" value={form.expected_end_date} onChange={(e) => set('expected_end_date', e.target.value)} />
          </label>
          <label>
            Team incharge
            <select required value={form.team_leader_id} onChange={(e) => set('team_leader_id', e.target.value)}>
              <option value="">Select…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Coordinator
            <select required value={form.coordinator_id} onChange={(e) => set('coordinator_id', e.target.value)}>
              <option value="">Select…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Head name
            <select required value={form.site_incharge_id} onChange={(e) => set('site_incharge_id', e.target.value)}>
              <option value="">Select…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save site'}</button>
        </form>
      )}

      {error && <div className="tfr-error">{error}</div>}
      {loading && <div className="tfr-empty">Loading sites…</div>}
      {!loading && !rows.length && <div className="tfr-empty">No sites yet.</div>}
      {!loading && !!rows.length && (
        <div className="tfr-table-wrap">
          <table className="tfr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Location</th>
                <th>Status</th>
                <th>Incharge</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.client_name}</td>
                  <td>{s.location}</td>
                  <td>{s.status}</td>
                  <td>{s.site_incharge?.full_name || '—'}</td>
                  <td>
                    <button type="button" className="ghost" disabled={busy} onClick={() => remove(s.id)}>
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
