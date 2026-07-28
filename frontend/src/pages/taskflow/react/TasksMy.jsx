import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

function statusClass(s) {
  const v = (s || '').toLowerCase();
  if (v.includes('verif') || v === 'completed') return 'ok';
  if (v.includes('overdue') || v.includes('reject')) return 'bad';
  if (v.includes('progress') || v.includes('accepted')) return 'mid';
  return 'muted';
}

export default function TasksMy() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/tasks/my');
      setTasks(Array.isArray(data) ? data : data.tasks || []);
    } catch (e) {
      setError(e.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patch = async (id, action) => {
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

  if (loading) return <div className="tfr-empty">Loading your tasks…</div>;
  if (error) return <div className="tfr-error">{error}</div>;
  if (!tasks.length) return <div className="tfr-empty">No tasks assigned to you.</div>;

  return (
    <div className="tfr-list">
      {tasks.map((t) => (
        <article key={t.id} className="tfr-card">
          <div className="tfr-card-top">
            <span className={`tfr-pill ${statusClass(t.status)}`}>{t.status || '—'}</span>
            <span className="tfr-meta">Due {t.target_date || '—'}</span>
          </div>
          <h3>{t.description || 'Untitled task'}</h3>
          <p className="tfr-sub">
            {t.project?.name || '—'} · {t.task_type?.name || '—'} · by{' '}
            {t.assigned_by_user?.full_name || '—'}
          </p>
          <div className="tfr-actions">
            {String(t.status).toLowerCase() === 'pending' && (
              <>
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => patch(t.id, 'accept')}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busyId === t.id}
                  onClick={() => patch(t.id, 'reject')}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
