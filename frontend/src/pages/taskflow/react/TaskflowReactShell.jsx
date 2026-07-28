import { useState } from 'react';
import TasksMy from './TasksMy';
import TasksAll from './TasksAll';
import Employees from './Employees';
import './tfReact.css';

const NAV = [
  { key: 'my', label: 'My Tasks' },
  { key: 'all', label: 'All Tasks' },
  { key: 'employees', label: 'Employees' },
  { key: 'classic', label: 'Classic TaskFlow' },
];

/**
 * Phase-1 React TaskFlow shell.
 * Full feature parity still uses Classic (legacy mount) via onOpenClassic.
 */
export default function TaskflowReactShell({ onOpenClassic }) {
  const [tab, setTab] = useState('my');

  const title =
    tab === 'my'
      ? 'My Tasks'
      : tab === 'all'
        ? 'All Tasks'
        : tab === 'employees'
          ? 'Employees'
          : 'TaskFlow';

  return (
    <div className="tfr-shell">
      <aside className="tfr-side">
        <h2>TaskFlow</h2>
        {NAV.map((n) => (
          <button
            key={n.key}
            type="button"
            className={tab === n.key ? 'active' : ''}
            onClick={() => {
              if (n.key === 'classic') {
                onOpenClassic?.();
                return;
              }
              setTab(n.key);
            }}
          >
            {n.label}
          </button>
        ))}
        <p className="tfr-note">
          React phase 1: My Tasks, All Tasks, Employees. Other modules → Classic
          TaskFlow.
        </p>
      </aside>
      <main className="tfr-main">
        <h1>{title}</h1>
        {tab === 'my' && <TasksMy />}
        {tab === 'all' && <TasksAll />}
        {tab === 'employees' && <Employees />}
      </main>
    </div>
  );
}
