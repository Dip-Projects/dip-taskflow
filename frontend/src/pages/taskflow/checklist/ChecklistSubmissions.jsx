import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { checklistSectionStyle } from './checklistColors';
import { downloadChecklistPdf } from './checklistPdf';
import { fmtDate, fmtDateTime, groupRowsBySection } from './checklistFormat';

const DETAIL_ICONS = {
  task: 'M7 3h10l4 4v14H7z M17 3v5h5 M10 13h8 M10 17h8',
  type: 'M4 5h16v14H4z M8 9h8 M8 13h5',
  project: 'M3 7h7l2 2h9v10H3z M3 7V5h7l2 2',
  department: 'M3 21h18 M5 21V7l7-4 7 4v14 M9 21v-5h6v5 M9 9h.01 M15 9h.01 M9 12h.01 M15 12h.01',
  person: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  date: 'M8 3v4 M16 3v4 M4 9h16 M5 5h14v16H5z M8 13h.01 M12 13h.01 M16 13h.01',
  status: 'M12 3 20 7v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V7z M9 12l2 2 4-4',
  verified: 'M12 3 20 7v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V7z M8.5 12.5l2.2 2.2 4.8-5',
  submitted: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5 M15 19l2 2 4-4',
  note: 'M4 4h16v13H9l-5 4z M8 9h8 M8 13h5',
};

function DetailIcon({ name }) {
  return (
    <svg className="tfc-detail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={DETAIL_ICONS[name]} />
    </svg>
  );
}

export default function ChecklistSubmissions() {
  const [types, setTypes] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    api('/master/task-types')
      .then((data) => setTypes(Array.isArray(data) ? data : []))
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const qs = typeFilter ? `?task_type_id=${encodeURIComponent(typeFilter)}` : '';
    api(`/task-checklists/submissions${qs}`)
      .then((data) => {
        if (!cancelled) setList(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load checklists');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    api(`/task-checklists/submissions/${selectedId}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load this checklist');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      [s.task?.description, s.task?.project?.name, s.verifier_name, s.task?.assigned_to_user?.full_name, s.task_type?.name]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [list, search]);

  const handlePdf = async () => {
    if (!detail) return;
    setPdfBusy(true);
    try {
      await downloadChecklistPdf(detail);
    } catch (err) {
      setError(err.message || 'Could not create the PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  if (selectedId) {
    return (
      <div className="tfc-detail">
        <div className="tfc-toolbar">
          <button type="button" className="ghost-btn-text" onClick={() => setSelectedId(null)}>
            ← Back to list
          </button>
          <button type="button" className="primary-btn primary-btn-inline" onClick={handlePdf} disabled={!detail || pdfBusy}>
            {pdfBusy ? 'Creating PDF…' : 'Download PDF'}
          </button>
        </div>

        {detailLoading && <div className="tfc-empty">Loading checklist…</div>}
        {!detailLoading && error && <div className="tfc-error">{error}</div>}

        {detail && !detailLoading && (
          <>
            <div className="table-card tfc-info">
              <div className="tfc-info-header">
                <div>
                  <span className="tfc-eyebrow">SUBMISSION OVERVIEW</span>
                  <h3 className="subsection-title">Task details</h3>
                </div>
              </div>
              <div className="tfc-detail-cards">
                <section className="tfc-detail-card" style={checklistSectionStyle(1)}>
                  <h4>Task information</h4>
                  <dl className="tfc-detail-grid">
                    {[
                      ['task', 'Task', detail.task?.description || '—'],
                      ['project', 'Project', detail.task?.project?.name || '—'],
                      ['type', 'Task type', detail.task_type?.name || '—'],
                      ['department', 'Department', detail.task?.department?.name || '—'],
                    ].map(([icon, label, value, className = '']) => (
                      <div key={label} className={`tfc-detail-item ${className}`}>
                        <dt><DetailIcon name={icon} />{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="tfc-detail-card" style={checklistSectionStyle(2)}>
                  <h4>Assignment</h4>
                  <dl className="tfc-detail-grid">
                    {[
                      ['person', 'Assigned to', detail.task?.assigned_to_user?.full_name || '—'],
                      ['person', 'Assigned by', detail.task?.assigned_by_user?.full_name || '—'],
                      ['date', 'Target date', fmtDate(detail.task?.target_date)],
                      ['status', 'Task status', detail.task?.status || '—'],
                    ].map(([icon, label, value]) => (
                      <div key={label} className="tfc-detail-item">
                        <dt><DetailIcon name={icon} />{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="tfc-detail-card" style={checklistSectionStyle(3)}>
                  <h4>Verification</h4>
                  <dl className="tfc-detail-grid">
                    {[
                      ['verified', 'Verified by', detail.verifier_name || '—'],
                      ['date', 'Verified on', fmtDateTime(detail.task?.verified_at)],
                      ['submitted', 'Checklist submitted', fmtDateTime(detail.submitted_at)],
                      ...(detail.task?.verification_note
                        ? [['note', 'Verification note', detail.task.verification_note, 'tfc-detail-item--wide']]
                        : []),
                    ].map(([icon, label, value, className = '']) => (
                      <div key={label} className={`tfc-detail-item ${className}`}>
                        <dt><DetailIcon name={icon} />{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </div>
            </div>

            <div className="table-card tfc-submission-checklist">
              <div className="tfc-checklist-title">
                <div>
                  <span className="tfc-eyebrow">VERIFICATION RECORD</span>
                  <h3 className="subsection-title">Checklist responses</h3>
                </div>
                <span className="tfc-count">{detail.rows?.length || 0} checkpoints</span>
              </div>
              {!detail.rows?.length && <div className="empty-state">No checkpoints were recorded.</div>}
              {groupRowsBySection(detail.rows).map((group, groupIndex) => (
                <div
                  key={group.key}
                  className={`tfc-group${group.common ? ' tfc-group-common' : ''}`}
                  style={checklistSectionStyle(groupIndex + 4)}
                >
                  <div className="tfc-group-title">
                    {group.letter && <span className="tfc-letter">{group.letter}</span>} {group.title}
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="tfc-col-no">SR NO</th>
                        <th>Particular</th>
                        <th>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, ri) => (
                        <tr key={row.id}>
                          <td className="tfc-col-no">{ri + 1}</td>
                          <td>{row.checklist_item}</td>
                          <td className="tfc-comment-cell">{row.comments || <span className="media-none">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="tfc-filters">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by task type">
          <option value="">All task types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search task, project, verifier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="tfc-empty">Loading checklists…</div>}
      {!loading && error && <div className="tfc-error">{error}</div>}
      {!loading && !error && !filtered.length && (
        <div className="tfc-empty">No submitted checklists yet. They appear here once a verifier approves a task with a checklist.</div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Task</th>
                <th>Task type</th>
                <th>Project</th>
                <th>Verifier</th>
                <th>Assigned to</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDateTime(s.submitted_at)}</td>
                  <td>{s.task?.description || '—'}</td>
                  <td>{s.task_type?.name || '—'}</td>
                  <td>{s.task?.project?.name || '—'}</td>
                  <td>{s.verifier_name || '—'}</td>
                  <td>{s.task?.assigned_to_user?.full_name || '—'}</td>
                  <td>
                    <button type="button" className="ghost-btn-text" onClick={() => setSelectedId(s.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
