import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import './tfReact.css';

export default function MasterData() {
  const [departments, setDepartments] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deptName, setDeptName] = useState('');
  const [typeName, setTypeName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [d, t] = await Promise.all([
        api('/master/departments'),
        api('/master/task-types'),
      ]);
      setDepartments(Array.isArray(d) ? d : []);
      setTaskTypes(Array.isArray(t) ? t : []);
    } catch (e) {
      setError(e.message || 'Failed to load master data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addDept = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/master/departments', { method: 'POST', body: JSON.stringify({ name: deptName }) });
      setDeptName('');
      await load();
    } catch (err) {
      alert(err.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const addType = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/master/task-types', { method: 'POST', body: JSON.stringify({ name: typeName }) });
      setTypeName('');
      await load();
    } catch (err) {
      alert(err.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="tfr-empty">Loading master data…</div>;
  if (error) return <div className="tfr-error">{error}</div>;

  return (
    <div className="tfr-master-grid">
      <section className="tfr-card">
        <h3>Departments</h3>
        <form className="tfr-inline" onSubmit={addDept}>
          <input
            required
            placeholder="New department"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
          />
          <button type="submit" disabled={busy}>Add</button>
        </form>
        <ul className="tfr-plain-list">
          {departments.map((d) => (
            <li key={d.id}>{d.name}</li>
          ))}
        </ul>
      </section>
      <section className="tfr-card">
        <h3>Task types</h3>
        <form className="tfr-inline" onSubmit={addType}>
          <input
            required
            placeholder="New task type"
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
          />
          <button type="submit" disabled={busy}>Add</button>
        </form>
        <ul className="tfr-plain-list">
          {taskTypes.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
