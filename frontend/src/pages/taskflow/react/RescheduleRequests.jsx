import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function RescheduleRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/tasks/reschedule-requests');
      setRows(Array.isArray(data) ? data : data.tasks || data.requests || []);
    } catch (e) {
      setError(e.message || 'Failed to load reschedule requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      await api(`/tasks/${id}/reschedule-request/${decision}`, {
        method: 'PATCH',
        body: '{}',
      });
      await load();
    } catch (e) {
      alert(e.message || 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="tfr-empty">Loading requests…</div>;
  if (error) return <div className="tfr-error">{error}</div>;
  if (!rows.length) return <div className="tfr-empty">No pending reschedule requests.</div>;

  return (
    <div className="tfr-list">
      {rows.map((t) => (
        <article key={t.id} className="tfr-card">
          <div className="tfr-card-top">
            <span className="tfr-pill mid">{t.reschedule_status || 'Requested'}</span>
            <span className="tfr-meta">
              {t.target_date || '—'} → {t.reschedule_requested_date || '—'}
            </span>
          </div>
          <h3>{t.description || 'Task'}</h3>
          <p className="tfr-sub">
            {t.assigned_to_user?.full_name || '—'} · {t.reschedule_reason || 'No reason'}
          </p>
          <div className="tfr-actions">
            <button type="button" disabled={busyId === t.id} onClick={() => decide(t.id, 'approve')}>
              Approve
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busyId === t.id}
              onClick={() => decide(t.id, 'reject')}
            >
              Reject
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
