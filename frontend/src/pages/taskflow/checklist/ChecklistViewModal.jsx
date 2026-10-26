import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { CHECKLIST_VIEW_EVENT } from './checklistBus';
import { fmtDate, fmtDateTime, groupRowsBySection } from './checklistFormat';
import { downloadChecklistPdf } from './checklistPdf';
import './checklist.css';

/**
 * Read-only checklist from task history, laid out like the PDF (details, title,
 * then the checklist table), with a Download PDF button.
 */
export default function ChecklistViewModal() {
  const [view, setView] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const onOpen = (e) => {
      setView(e.detail);
      setSubmissions([]);
      setSelectedId('');
      setDetail(null);
      setError('');
    };
    window.addEventListener(CHECKLIST_VIEW_EVENT, onOpen);
    return () => window.removeEventListener(CHECKLIST_VIEW_EVENT, onOpen);
  }, []);

  // Load the task's submissions (newest first) and show the latest one.
  useEffect(() => {
    if (!view) return undefined;
    let cancelled = false;
    setLoading(true);
    api(`/task-checklists/task/${view.taskId}/submissions`)
      .then((list) => {
        if (cancelled) return;
        const rows = Array.isArray(list) ? list : [];
        setSubmissions(rows);
        setSelectedId(rows[0]?.id || '');
        if (!rows.length) setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Could not load the checklist');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Load the chosen submission in full.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    setError('');
    api(`/task-checklists/submissions/${selectedId}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
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
  }, [selectedId]);

  if (!view) return null;

  const close = () => setView(null);

  const download = async () => {
    setPdfBusy(true);
    setError('');
    try {
      await downloadChecklistPdf(detail);
    } catch (err) {
      setError(err.message || 'Could not create the PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const groups = detail ? groupRowsBySection(detail.rows) : [];

  // Same rows as the PDF: common checks first with no heading or SR number, then each section.
  const tableRows = groups.flatMap((group) => {
    const rows = group.rows.map((row, ri) => (
      <tr key={row.id}>
        <td className="tfc-col-no">{group.common ? '' : ri + 1}</td>
        <td>{row.checklist_item}</td>
        <td className="tfc-comment-cell">{row.comments || <span className="media-none">—</span>}</td>
      </tr>
    ));
    if (group.common) return rows;
    return [
      <tr key={group.key} className="tfc-group-row">
        <td colSpan={3}>
          {group.letter} &nbsp; {group.title}
        </td>
      </tr>,
      ...rows,
    ];
  });

  return (
    <div className="modal-backdrop">
      <div className="modal tfc-modal" role="dialog" aria-modal="true" aria-labelledby="tfc-view-title">
        <div className="modal-header">
          <h3 id="tfc-view-title">Checklist</h3>
          <button type="button" className="modal-close" aria-label="Close" onClick={close}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {view.taskLabel && <p className="tfc-task-label">{view.taskLabel}</p>}

          {submissions.length > 1 && (
            <div className="tfc-filters">
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} aria-label="Submission">
                {submissions.map((s) => (
                  <option key={s.id} value={s.id}>Sent {fmtDateTime(s.submitted_at)}</option>
                ))}
              </select>
            </div>
          )}

          {loading && <p className="form-note">Loading checklist…</p>}
          {!loading && !error && !submissions.length && (
            <p className="form-note">No checklist was recorded for this task.</p>
          )}
          {error && <p className="form-error">{error}</p>}

          {detail && (
            <>
              <table className="data-table tfc-pdf-details">
                <tbody>
                  <tr><th>Project</th><td>{detail.task?.project?.name || '—'}</td></tr>
                  <tr><th>Date</th><td>{fmtDate(detail.submitted_at)}</td></tr>
                  <tr><th>Pre. By</th><td>{detail.task?.assigned_to_user?.full_name || '—'}</td></tr>
                </tbody>
              </table>

              <h3 className="tfc-pdf-title">{(detail.task_type?.name || 'Task').toUpperCase()} CHECK LIST</h3>

              <table className="data-table">
                <thead>
                  <tr>
                    <th className="tfc-col-no">SR NO</th>
                    <th>Particular</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length
                    ? tableRows
                    : <tr><td colSpan={3} className="empty-state">No checkpoints were recorded.</td></tr>}
                </tbody>
              </table>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="ghost-btn-text" onClick={close}>
              Close
            </button>
            <button
              type="button"
              className="primary-btn primary-btn-inline"
              onClick={download}
              disabled={!detail || pdfBusy}
            >
              {pdfBusy ? 'Creating PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
