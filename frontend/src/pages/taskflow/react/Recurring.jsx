import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function Recurring() {
  const [tab, setTab] = useState('my'); // my | all | create
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({ depts: [], projects: [], types: [], people: [] });
  const [form, setForm] = useState({
    description: '',
    assigned_to: '',
    department_id: '',
    project_id: '',
    task_type_id: '',
    priority: 'Medium',
    frequency: 'Daily',
    start_date: '',
    end_date: '',
    checkpoints: '',
  });

  const load = async (which = tab) => {
    if (which === 'create') return;
    setLoading(true);
    setError('');
    try {
      const path = which === 'all' ? '/recurring-tasks/all' : '/recurring-tasks/my';
      const data = await api(path);
      setRows(Array.isArray(data) ? data : data.tasks || []);
    } catch (e) {
      setError(e.message || 'Failed to load recurring tasks');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  useEffect(() => {
    (async () => {
      try {
        const [depts, projects, types, people] = await Promise.all([
          api('/master/departments'),
          api('/master/projects'),
          api('/master/task-types'),
          api('/master/employees'),
        ]);
        setMeta({
          depts: depts || [],
          projects: projects || [],
          types: types || [],
          people: people || [],
        });
      } catch {
        /* optional for list tabs */
      }
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const checkpoints = form.checkpoints
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await api('/recurring-tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          department_id: form.department_id || null,
          project_id: form.project_id || null,
          task_type_id: form.task_type_id || null,
          end_date: form.end_date || null,
          checkpoints,
        }),
      });
      setTab('all');
    } catch (err) {
      alert(err.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const completeInstance = async (instanceId) => {
    setBusy(true);
    try {
      await api(`/recurring-tasks/instances/${instanceId}/complete`, {
        method: 'POST',
        body: '{}',
      });
      await load('my');
    } catch (err) {
      alert(err.message || 'Complete failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this recurring task?')) return;
    setBusy(true);
    try {
      await api(`/recurring-tasks/${id}`, { method: 'DELETE' });
      await load('all');
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
        <button type="button" className={tab === 'my' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setTab('my')}>
          My recurring
        </button>
        <button type="button" className={tab === 'all' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setTab('all')}>
          All (admin)
        </button>
        <button type="button" className={tab === 'create' ? 'tfr-tab on' : 'tfr-tab'} onClick={() => setTab('create')}>
          Create
        </button>
      </div>

      {error && <div className="tfr-error" style={{ marginBottom: 12 }}>{error}</div>}

      {tab === 'create' && (
        <form className="tfr-form" onSubmit={submit}>
          <label>
            Description
            <textarea required rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <label>
            Assign to
            <select required value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
              <option value="">Select…</option>
              {meta.people.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
              <option>Yearly</option>
            </select>
          </label>
          <label>
            Start date
            <input type="date" required value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </label>
          <label>
            Project
            <select value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">Optional…</option>
              {meta.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Task type
            <select value={form.task_type_id} onChange={(e) => set('task_type_id', e.target.value)}>
              <option value="">Optional…</option>
              {meta.types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Checkpoints (one per line)
            <textarea rows={3} value={form.checkpoints} onChange={(e) => set('checkpoints', e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create recurring task'}</button>
        </form>
      )}

      {tab !== 'create' && loading && <div className="tfr-empty">Loading…</div>}
      {tab !== 'create' && !loading && !rows.length && <div className="tfr-empty">No recurring tasks.</div>}
      {tab !== 'create' && !loading && !!rows.length && (
        <div className="tfr-list">
          {rows.map((t) => {
            const instance = t.instance || t.today_instance || t.pending_instance;
            const rowKey = `${t.id}-${t.due_date || instance?.id || 'x'}`;
            return (
              <article key={rowKey} className="tfr-card">
                <div className="tfr-card-top">
                  <span className="tfr-pill mid">{t.frequency || 'Recurring'}</span>
                  <span className="tfr-meta">
                    {t.due_date || '—'}
                    {t.assigned_to_user?.full_name ? ` · ${t.assigned_to_user.full_name}` : ''}
                    {t.overdue_days ? ` · ${t.overdue_days}d overdue` : ''}
                  </span>
                </div>
                <h3>{t.description || 'Recurring task'}</h3>
                <p className="tfr-sub">
                  {t.project?.name || '—'} · {t.task_type?.name || '—'} ·{' '}
                  {instance?.status || (t.is_active === false ? 'Inactive' : 'Active')}
                </p>
                <div className="tfr-actions">
                  {tab === 'my' && instance?.id && instance.status !== 'Completed' && (
                    <button type="button" disabled={busy} onClick={() => completeInstance(instance.id)}>
                      Mark complete
                    </button>
                  )}
                  {tab === 'all' && (
                    <button type="button" className="ghost" disabled={busy} onClick={() => remove(t.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
