import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function Verifications() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/tasks/verifications');
      setRows(Array.isArray(data) ? data : data.tasks || []);
    } catch (e) {
      setError(e.message || 'Failed to load verifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (id, action) => {
    setBusyId(id);
    try {
      await api(`/tasks/${id}/${action}`, { method: 'PATCH', body: '{}' });
      await load();
    } catch (e) {
      alert(e.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="tfr-empty">Loading verifications…</div>;
  if (error) return <div className="tfr-error">{error}</div>;
  if (!rows.length) return <div className="tfr-empty">Nothing pending verification.</div>;

  return (
    <div className="tfr-list">
      {rows.map((t) => (
        <article key={t.id} className="tfr-card">
          <div className="tfr-card-top">
            <span className="tfr-pill mid">{t.verification_status || t.status || 'Pending'}</span>
            <span className="tfr-meta">Due {t.target_date || '—'}</span>
          </div>
          <h3>{t.description || 'Task'}</h3>
          <p className="tfr-sub">
            {t.assigned_to_user?.full_name || '—'} · {t.project?.name || '—'}
          </p>
          <div className="tfr-actions">
            <button type="button" disabled={busyId === t.id} onClick={() => act(t.id, 'start-verification')}>
              Start
            </button>
            <button type="button" disabled={busyId === t.id} onClick={() => act(t.id, 'verify')}>
              Verify
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
