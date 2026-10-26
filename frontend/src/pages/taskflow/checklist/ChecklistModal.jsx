import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { CHECKLIST_EVENT } from './checklistBus';
import { sectionLetter } from './checklistFormat';
import './checklist.css';

/**
 * Checklist popup shown when a task is sent for verification: common checkpoints
 * first, then each section with its checkpoints, and a comment box beside each.
 * It never saves anything itself; it resolves with the answers and the caller
 * sends them along with the verification request.
 */
export default function ChecklistModal() {
  const [request, setRequest] = useState(null);
  const [common, setCommon] = useState([]);
  const [sections, setSections] = useState([]);
  const [answers, setAnswers] = useState({});
  const [choices, setChoices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onOpen = (e) => {
      setRequest(e.detail);
      setCommon([]);
      setSections([]);
      setAnswers({});
      setChoices({});
      setError('');
    };
    window.addEventListener(CHECKLIST_EVENT, onOpen);
    return () => window.removeEventListener(CHECKLIST_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    let cancelled = false;
    setLoading(true);
    api(`/task-checklists/task/${request.taskId}/template`)
      .then((data) => {
        if (cancelled) return;
        setCommon(data?.common || []);
        setSections(data?.sections || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the checklist');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  if (!request) return null;

  const items = [...common, ...sections.flatMap((s) => s.items)];

  const close = (result) => {
    request.resolve(result);
    setRequest(null);
  };

  // A typed comment wins; otherwise the checkbox decides Yes (ticked) or No (not ticked).
  const commentFor = (id) => (answers[id] || '').trim() || (choices[id] ? 'Yes' : 'No');

  const toggleChoice = (id) => {
    setChoices((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const confirm = (e) => {
    e.preventDefault();
    close({ checklist: items.map((i) => ({ item_id: i.id, comments: commentFor(i.id) })) });
  };

  const renderRow = (item, ii) => (
    <div key={item.id} className="tfc-row">
      <div className="tfc-row-text">
        <span className="tfc-no">{ii + 1}</span>
        <span>{item.item_text}</span>
      </div>
      <div className="tfc-answer">
        <label className="tfc-choice">
          <input
            type="checkbox"
            checked={!!choices[item.id]}
            onChange={() => toggleChoice(item.id)}
          />
          Yes
        </label>
        <textarea
          className="tfc-comment"
          rows={2}
          placeholder="Comments"
          aria-label={`Comments for ${item.item_text}`}
          value={answers[item.id] || ''}
          onChange={(e) => setAnswers((prev) => ({ ...prev, [item.id]: e.target.value }))}
        />
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop">
      <div className="modal tfc-modal" role="dialog" aria-modal="true" aria-labelledby="tfc-checklist-title">
        <div className="modal-header">
          <h3 id="tfc-checklist-title">Checklist for verification</h3>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => close(null)}>
            &times;
          </button>
        </div>
        <form className="modal-body tfc-verify-form" onSubmit={confirm}>
          {request.taskLabel && <p className="tfc-task-label">{request.taskLabel}</p>}

          {loading && <p className="form-note">Loading checklist…</p>}
          {!loading && !error && items.length === 0 && (
            <p className="form-note">
              No checklist is set up for this task type yet. Confirm to send the task for verification.
            </p>
          )}

          {common.length > 0 && (
            <section className="tfc-section">
              <h4 className="tfc-section-title">Common checks</h4>
              {common.map(renderRow)}
            </section>
          )}

          {sections.map((section, si) => (
            <section key={section.id} className="tfc-section">
              <h4 className="tfc-section-title">
                <span className="tfc-letter">{sectionLetter(si)}</span> {section.title}
              </h4>
              {section.items.map(renderRow)}
            </section>
          ))}

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="ghost-btn-text" onClick={() => close(null)}>
              Cancel
            </button>
            <button type="submit" className="primary-btn primary-btn-inline" disabled={loading || !!error}>
              Send for verification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
