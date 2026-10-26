import { useEffect, useState } from 'react';
import ChecklistSubmissions from './ChecklistSubmissions';
import ChecklistSetup from './ChecklistSetup';
import { TASK_CHECKLIST_OPEN_EVENT } from './checklistBus';
import './checklist.css';

const TABS = [
  { key: 'records', label: 'Submitted checklists' },
  { key: 'setup', label: 'Sections & checkpoints' },
];

/** Admin portal → Task checklist. Records are read-only; setup is where sections and checkpoints are added. */
export default function TaskChecklistAdmin() {
  const [tab, setTab] = useState('records');
  // Bumped each time the menu opens so the screen reloads its data.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onOpen = () => setVersion((v) => v + 1);
    window.addEventListener(TASK_CHECKLIST_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TASK_CHECKLIST_OPEN_EVENT, onOpen);
  }, []);

  return (
    <div className="tfc-admin">
      <div className="tfc-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tfc-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'records' ? (
        <ChecklistSubmissions key={`records-${version}`} />
      ) : (
        <ChecklistSetup key={`setup-${version}`} />
      )}
    </div>
  );
}
