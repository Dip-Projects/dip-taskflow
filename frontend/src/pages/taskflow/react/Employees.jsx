import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api('/employees');
        setRows(Array.isArray(data) ? data : data.employees || data.users || []);
      } catch (e) {
        setError(e.message || 'Failed to load employees');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = rows.filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      (u.full_name || '').toLowerCase().includes(s) ||
      (u.username || '').toLowerCase().includes(s) ||
      (u.department || '').toLowerCase().includes(s) ||
      (u.site_name || '').toLowerCase().includes(s)
    );
  });

  if (loading) return <div className="tfr-empty">Loading employees…</div>;
  if (error) return <div className="tfr-error">{error}</div>;

  return (
    <div>
      <div className="tfr-toolbar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, username, dept, site…"
        />
        <span className="tfr-meta">{filtered.length} people</span>
      </div>
      <div className="tfr-table-wrap">
        <table className="tfr-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Department</th>
              <th>Site</th>
              <th>Head</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || '—'}</td>
                <td>{u.username || '—'}</td>
                <td>{u.department || '—'}</td>
                <td>{u.site_name || (u.site_names || []).join(', ') || '—'}</td>
                <td>{u.is_head ? 'Yes' : '—'}</td>
                <td>{u.is_active === false ? 'No' : 'Yes'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
