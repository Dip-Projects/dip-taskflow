import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function TasksAll() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api('/tasks/all');
        setTasks(Array.isArray(data) ? data : data.tasks || []);
      } catch (e) {
        setError(e.message || 'Failed to load tasks (admin only)');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="tfr-empty">Loading all tasks…</div>;
  if (error) return <div className="tfr-error">{error}</div>;
  if (!tasks.length) return <div className="tfr-empty">No tasks found.</div>;

  return (
    <div className="tfr-table-wrap">
      <table className="tfr-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Assignee</th>
            <th>Project</th>
            <th>Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{t.description || '—'}</td>
              <td>{t.assigned_to_user?.full_name || '—'}</td>
              <td>{t.project?.name || '—'}</td>
              <td>{t.target_date || '—'}</td>
              <td>{t.status || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
