import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function Leaves() {
  const [tab, setTab] = useState('my'); // my | all | apply
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    from_date: '',
    to_date: '',
    half_day_period: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);

  const load = async (which = tab) => {
    if (which === 'apply') return;
    setLoading(true);
    setError('');
    try {
      const path = which === 'all' ? '/leaves/all' : '/leaves/my';
      const data = await api(path);
      setRows(Array.isArray(data) ? data : data.leaves || []);
    } catch (e) {
      setError(e.message || 'Failed to load leaves');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/leaves', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          is_half_day: !!form.half_day_period,
          half_day_period: form.half_day_period || null,
        }),
      });
      setForm({ from_date: '', to_date: '', half_day_period: '', reason: '' });
      setTab('my');
    } catch (err) {
      setError(err.message || 'Apply failed');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id, decision) => {
    setBusy(true);
    try {
      await api(`/leaves/${id}/${decision}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      await load('all');
    } catch (err) {
      alert(err.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    if (!confirm('Cancel this leave request?')) return;
    setBusy(true);
    try {
      await api(`/leaves/${id}`, { method: 'DELETE' });
      await load('my');
    } catch (err) {
      alert(err.message || 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="tfr-toolbar">
        <button type="button" className={tab === 'my' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setTab('my')}>
          My Leaves
        </button>
        <button type="button" className={tab === 'all' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setTab('all')}>
          Approvals
        </button>
        <button type="button" className={tab === 'apply' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setTab('apply')}>
          Apply
        </button>
      </div>

      {error && <div className="tfr-error" style={{ marginBottom: 12 }}>{error}</div>}

      {tab === 'apply' && (
        <form className="tfr-form" onSubmit={submit}>
          <label>
            From
            <input
              type="date"
              required
              value={form.from_date}
              onChange={(e) => setForm((f) => ({
                ...f,
                from_date: e.target.value,
                to_date: f.half_day_period ? e.target.value : f.to_date,
              }))}
            />
          </label>
          <label>
            To
            <input
              type="date"
              required
              value={form.to_date}
              min={form.from_date || undefined}
              disabled={!!form.half_day_period}
              onChange={(e) => setForm((f) => ({ ...f, to_date: e.target.value }))}
            />
          </label>
          <label>
            Day part
            <select
              value={form.half_day_period}
              onChange={(e) => setForm((f) => ({
                ...f,
                half_day_period: e.target.value,
                to_date: e.target.value ? f.from_date : f.to_date,
              }))}
            >
              <option value="">Full day</option>
              <option value="first_half">1st Half</option>
              <option value="second_half">2nd Half</option>
            </select>
          </label>
          <label>
            Reason
            <textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit leave'}
          </button>
        </form>
      )}

      {tab !== 'apply' && loading && <div className="tfr-empty">Loading…</div>}
      {tab !== 'apply' && !loading && !rows.length && (
        <div className="tfr-empty">No leave records.</div>
      )}
      {tab !== 'apply' && !loading && !!rows.length && (
        <div className="tfr-table-wrap">
          <table className="tfr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>{l.user?.full_name || 'You'}</td>
                  <td>{l.from_date}</td>
                  <td>{l.to_date}{l.is_half_day
                    ? ` (${l.half_day_period === 'first_half' ? '1st Half' : l.half_day_period === 'second_half' ? '2nd Half' : '½'})`
                    : ''}</td>
                  <td>{l.reason}</td>
                  <td>{l.status}</td>
                  <td>
                    {tab === 'all' && String(l.status).toLowerCase() === 'pending' && (
                      <span className="tfr-actions">
                        <button type="button" disabled={busy} onClick={() => decide(l.id, 'approve')}>
                          Approve
                        </button>
                        <button type="button" className="ghost" disabled={busy} onClick={() => decide(l.id, 'reject')}>
                          Reject
                        </button>
                      </span>
                    )}
                    {tab === 'my' && String(l.status).toLowerCase() === 'pending' && (
                      <button type="button" className="ghost" disabled={busy} onClick={() => cancel(l.id)}>
                        Cancel
                      </button>
                    )}
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
