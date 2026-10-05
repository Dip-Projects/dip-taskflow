import { useState } from 'react';
import TasksMy from './TasksMy';
import TasksAll from './TasksAll';
import Employees from './Employees';
import Leaves from './Leaves';
import Tickets from './Tickets';
import Verifications from './Verifications';
import RescheduleRequests from './RescheduleRequests';
import Sites from './Sites';
import Drawings from './Drawings';
import MasterData from './MasterData';
import Recurring from './Recurring';
import './tfReact.css';

const NAV = [
  { key: 'my', label: 'My Tasks' },
  { key: 'all', label: 'All Tasks' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'verifications', label: 'Verifications' },
  { key: 'reschedule', label: 'Reschedule' },
  { key: 'leaves', label: 'Leaves' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'employees', label: 'Employees' },
  { key: 'sites', label: 'Sites' },
  { key: 'drawings', label: 'Drawings' },
  { key: 'master', label: 'Master Data' },
  { key: 'classic', label: 'Classic UI' },
];

const TITLES = {
  my: 'My Tasks',
  all: 'All Tasks',
  recurring: 'Recurring Tasks',
  verifications: 'Verifications',
  reschedule: 'Reschedule Requests',
  leaves: 'Leaves',
  tickets: 'Tickets',
  employees: 'Employees',
  sites: 'Sites / Projects',
  drawings: 'Drawings',
  master: 'Master Data',
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
          Full React Office UI. Classic UI remains for any edge-case screens.
        </p>
      </aside>
      <main className="tfr-main">
        <h1>{TITLES[tab] || 'TaskFlow'}</h1>
        {tab === 'my' && <TasksMy />}
        {tab === 'all' && <TasksAll />}
        {tab === 'recurring' && <Recurring />}
        {tab === 'verifications' && <Verifications />}
        {tab === 'reschedule' && <RescheduleRequests />}
        {tab === 'leaves' && <Leaves />}
        {tab === 'tickets' && <Tickets />}
        {tab === 'employees' && <Employees />}
        {tab === 'sites' && <Sites />}
        {tab === 'drawings' && <Drawings />}
        {tab === 'master' && <MasterData />}
      </main>
    </div>
  );
}
