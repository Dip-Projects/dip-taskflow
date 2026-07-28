import { useState } from 'react';
import TasksMy from './TasksMy';
import TasksAll from './TasksAll';
import Employees from './Employees';
import Leaves from './Leaves';
import Tickets from './Tickets';
import Verifications from './Verifications';
import RescheduleRequests from './RescheduleRequests';
import './tfReact.css';

const NAV = [
  { key: 'my', label: 'My Tasks' },
  { key: 'all', label: 'All Tasks' },
  { key: 'verifications', label: 'Verifications' },
  { key: 'reschedule', label: 'Reschedule' },
  { key: 'leaves', label: 'Leaves' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'employees', label: 'Employees' },
  { key: 'classic', label: 'Classic TaskFlow' },
];

const TITLES = {
  my: 'My Tasks',
  all: 'All Tasks',
  verifications: 'Verifications',
  reschedule: 'Reschedule Requests',
  leaves: 'Leaves',
  tickets: 'Tickets',
  employees: 'Employees',
};

export default function TaskflowReactShell({ onOpenClassic }) {
  const [tab, setTab] = useState('my');

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
          React TaskFlow — more modules still available in Classic (sites, drawings,
          master data, recurring…).
        </p>
      </aside>
      <main className="tfr-main">
        <h1>{TITLES[tab] || 'TaskFlow'}</h1>
        {tab === 'my' && <TasksMy />}
        {tab === 'all' && <TasksAll />}
        {tab === 'verifications' && <Verifications />}
        {tab === 'reschedule' && <RescheduleRequests />}
        {tab === 'leaves' && <Leaves />}
        {tab === 'tickets' && <Tickets />}
        {tab === 'employees' && <Employees />}
      </main>
    </div>
  );
}
