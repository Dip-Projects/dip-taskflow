import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

function fmtHrs(h) {
  if (h == null || Number.isNaN(Number(h))) return '—';
  const n = Number(h);
  if (n < 1) return `${Math.round(n * 60)}m`;
  const hrs = Math.floor(n);
  const mins = Math.round((n - hrs) * 60);
  return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function hoursSummary(task) {
  const assigned = Number(task?.original_hours_to_complete ?? task?.hours_to_complete) || 0;
  let done = 0;
  let remaining = Number(task?.hours_to_complete) || assigned;
  if (task?.is_on_hold) {
    remaining = Number(task.hold_remaining_hours != null ? task.hold_remaining_hours : remaining) || 0;
    done = Math.max(0, Math.round((assigned - remaining) * 100) / 100);
  }
  return { assigned, done, remaining };
}

export default function RescheduleRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [approveTask, setApproveTask] = useState(null);
  const [useEmp, setUseEmp] = useState(true);
  const [customDt, setCustomDt] = useState('');
  const [formMsg, setFormMsg] = useState('');

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

  const openApprove = (t) => {
    setApproveTask(t);
    setUseEmp(true);
    setFormMsg('');
    const req = String(t.reschedule_requested_date || '').slice(0, 10);
    setCustomDt(req ? `${req}T18:30` : '');
  };

  const confirmApprove = async () => {
    if (!approveTask?.id) return;
    if (!useEmp && !customDt) {
      setFormMsg('Please pick date and time for the new deadline.');
      return;
    }
    setBusyId(approveTask.id);
    try {
      const body = useEmp
        ? { use_employee_date: true }
        : { use_employee_date: false, target_date: new Date(customDt).toISOString() };
      await api(`/tasks/${approveTask.id}/reschedule-request/approve`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setApproveTask(null);
      await load();
    } catch (e) {
      setFormMsg(e.message || 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  const decideReject = async (id) => {
    setBusyId(id);
    try {
      await api(`/tasks/${id}/reschedule-request/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: '' }),
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

  const sum = approveTask ? hoursSummary(approveTask) : null;

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
            <button type="button" disabled={busyId === t.id} onClick={() => openApprove(t)}>
              Approve
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busyId === t.id}
              onClick={() => decideReject(t.id)}
            >
              Reject
            </button>
          </div>
        </article>
      ))}

      {approveTask && (
        <div
          className="tfr-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            background: 'rgba(10,12,25,.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="tfr-modal"
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 480,
              width: '100%',
              padding: 16,
            }}
          >
            <h3 style={{ margin: '0 0 8px' }}>Approve reschedule</h3>
            <p style={{ margin: '0 0 10px', fontSize: 13 }}>
              {approveTask.assigned_to_user?.full_name || 'Employee'} — {approveTask.description || 'Task'}
            </p>
            <div style={{ background: '#F7F3EC', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
              <div><strong>Assigned hours:</strong> {fmtHrs(sum.assigned)}</div>
              <div><strong>Hours done:</strong> {fmtHrs(sum.done)}</div>
              <div><strong>Hours remaining:</strong> {fmtHrs(sum.remaining)}</div>
              <div style={{ marginTop: 6 }}>
                <strong>Employee requested date:</strong> {String(approveTask.reschedule_requested_date || '—').slice(0, 10)}
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <input type="radio" checked={useEmp} onChange={() => setUseEmp(true)} /> Yes — use employee requested date
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <input type="radio" checked={!useEmp} onChange={() => setUseEmp(false)} /> No — I will set date &amp; time
            </label>
            {!useEmp && (
              <input
                type="datetime-local"
                value={customDt}
                onChange={(e) => setCustomDt(e.target.value)}
                style={{ width: '100%', marginBottom: 10 }}
              />
            )}
            {formMsg && <p style={{ color: '#b91c1c', fontSize: 13 }}>{formMsg}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="ghost" onClick={() => setApproveTask(null)}>Cancel</button>
              <button type="button" disabled={busyId === approveTask.id} onClick={confirmApprove}>
                Confirm approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
