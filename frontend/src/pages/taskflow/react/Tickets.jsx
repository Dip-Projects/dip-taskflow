import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function Tickets() {
  const [filter, setFilter] = useState('open'); // open | resolved | all
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: 'Technical', description: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/tickets');
      const list = Array.isArray(data) ? data : data.tickets || [];
      setRows(list);
    } catch (e) {
      setError(e.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visible = rows.filter((t) => {
    const st = String(t.status || '').toLowerCase();
    if (filter === 'open') return st !== 'resolved' && st !== 'solved' && st !== 'closed';
    if (filter === 'resolved') return st === 'resolved' || st === 'solved' || st === 'closed';
    return true;
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/tickets', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ category: 'Technical', description: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      alert(err.message || 'Could not raise ticket');
    } finally {
      setBusy(false);
    }
  };

  const solve = async (id) => {
    setBusy(true);
    try {
      await api(`/tickets/${id}/solve`, { method: 'PATCH', body: '{}' });
      await load();
    } catch (err) {
      alert(err.message || 'Solve failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="tfr-toolbar">
        <button type="button" className={filter === 'open' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setFilter('open')}>
          Open
        </button>
        <button type="button" className={filter === 'resolved' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setFilter('resolved')}>
          Resolved
        </button>
        <button type="button" className={filter === 'all' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setFilter('all')}>
          All
        </button>
        <button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close form' : '+ Raise ticket'}
        </button>
      </div>

      {showForm && (
        <form className="tfr-form" onSubmit={submit}>
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option>Technical</option>
              <option>Access</option>
              <option>Process</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Description
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Submit ticket'}
          </button>
        </form>
      )}

      {error && <div className="tfr-error">{error}</div>}
      {loading && <div className="tfr-empty">Loading tickets…</div>}
      {!loading && !visible.length && <div className="tfr-empty">No tickets here.</div>}
      {!loading && !!visible.length && (
        <div className="tfr-list">
          {visible.map((t) => (
            <article key={t.id} className="tfr-card">
              <div className="tfr-card-top">
                <span className="tfr-pill mid">{t.category || 'Ticket'}</span>
                <span className="tfr-meta">{t.status || 'Open'}</span>
              </div>
              <h3>#{t.id} — {t.description || '—'}</h3>
              <p className="tfr-sub">
                Raised by {t.raised_by_user?.full_name || t.raised_by_name || '—'} ·{' '}
                {t.created_at ? new Date(t.created_at).toLocaleString() : ''}
              </p>
              {String(t.status || '').toLowerCase() !== 'resolved' &&
                String(t.status || '').toLowerCase() !== 'solved' && (
                  <div className="tfr-actions">
                    <button type="button" disabled={busy} onClick={() => solve(t.id)}>
                      Mark solved
                    </button>
                  </div>
                )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
