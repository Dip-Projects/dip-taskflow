import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { checklistSectionStyle } from './checklistColors';
import { sectionLetter } from './checklistFormat';

const COMMON_PATH = '/task-checklists/common-items';
const SECTIONS_PATH = '/task-checklists/sections';
const ITEMS_PATH = '/task-checklists/items';

export default function ChecklistSetup() {
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState('');
  const [common, setCommon] = useState([]);
  const [sections, setSections] = useState([]);
  const [includeCommonChecks, setIncludeCommonChecks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newCommon, setNewCommon] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newItems, setNewItems] = useState({});
  const [busy, setBusy] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  useEffect(() => {
    api('/master/task-types')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setTypes(list);
        if (list.length) setTypeId((cur) => cur || list[0].id);
      })
      .catch((err) => setError(err.message || 'Could not load task types'));
  }, []);

  /** Loads the common checkpoints and, when a task type is picked, its sections. */
  const load = async (id = typeId) => {
    setLoading(true);
    setError('');
    try {
      const [commonRows, data] = await Promise.all([
        api(COMMON_PATH),
        id ? api(`/task-checklists/types/${id}`) : Promise.resolve({ sections: [] }),
      ]);
      setCommon(Array.isArray(commonRows) ? commonRows : []);
      setSections(data?.sections || []);
      setIncludeCommonChecks(data?.include_common_checks !== false);
    } catch (err) {
      setError(err.message || 'Could not load the checklist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(typeId);
    setNewItems({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId]);

  /**
   * Runs one change. The screen is updated from each server response, so nothing
   * reloads. Only a failed change reloads the list, to show what is really saved.
   */
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      await load();
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  
  // A "scope" says where a list lives: its API path, its current rows, and how to update them.
  const commonScope = { path: COMMON_PATH, list: common, setList: setCommon };
  const sectionScope = { path: SECTIONS_PATH, list: sections, setList: setSections };
  const itemScope = (section) => ({
    path: ITEMS_PATH,
    list: section.items,
    setList: (fn) =>
      setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, items: fn(s.items) } : s))),
  });

  const addRow = async (scope, body, decorate = (row) => row) => {
    const row = await api(scope.path, { method: 'POST', body });
    scope.setList((rows) => [...rows, decorate(row)]);
  };

  const patchRow = async (scope, id, body) => {
    const row = await api(`${scope.path}/${id}`, { method: 'PATCH', body });
    scope.setList((rows) => rows.map((r) => (r.id === id ? { ...r, ...row } : r)));
  };

  const removeRow = async (scope, id) => {
    await api(`${scope.path}/${id}`, { method: 'DELETE' });
    scope.setList((rows) => rows.filter((r) => r.id !== id));
  };

  /** Reorders one list and persists only rows whose positions changed. */
  const reorderRows = async (scope, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
        fromIndex >= scope.list.length || toIndex >= scope.list.length) return;
    const before = new Map(scope.list.map((r) => [r.id, r.sort_order]));
    const next = [...scope.list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const ordered = next.map((row, pos) => ({ ...row, sort_order: pos }));
    scope.setList(() => ordered);
    await Promise.all(
      ordered
        .filter((row) => before.get(row.id) !== row.sort_order)
        .map((row) => api(`${scope.path}/${row.id}`, { method: 'PATCH', body: { sort_order: row.sort_order } }))
    );
  };

  const moveRow = async (scope, index, dir) => reorderRows(scope, index, index + dir);

  const startDrag = (e, itemId) => {
    if (!e.target.closest('.tfc-drag-handle')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(itemId));
    setDraggingId(itemId);
  };

  const dropRow = (e, scope, targetId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    const fromIndex = scope.list.findIndex((row) => String(row.id) === sourceId);
    const toIndex = scope.list.findIndex((row) => row.id === targetId);
    setDraggingId(null);
    setDropTargetId(null);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      run(() => reorderRows(scope, fromIndex, toIndex));
    }
  };

  const addCommon = (e) => {
    e.preventDefault();
    const text = newCommon.trim();
    if (!text) return;
    run(async () => {
      await addRow(commonScope, { item_text: text });
      setNewCommon('');
    });
  };

  const addSection = (e) => {
    e.preventDefault();
    const title = newSection.trim();
    if (!title) return;
    run(async () => {
      await addRow(sectionScope, { task_type_id: typeId, title }, (row) => ({ ...row, items: [] }));
      setNewSection('');
    });
  };

  const addItem = (e, section) => {
    e.preventDefault();
    const text = String(newItems[section.id] || '').trim();
    if (!text) return;
    run(async () => {
      await addRow(itemScope(section), { section_id: section.id, item_text: text });
      setNewItems((prev) => ({ ...prev, [section.id]: '' }));
    });
  };

  const toggleCommonChecks = (enabled) => {
    if (!typeId) return;
    const previousValue = includeCommonChecks;
    setIncludeCommonChecks(enabled);
    setBusy(true);
    setError('');
    api(`/task-checklists/types/${typeId}/settings`, {
      method: 'PATCH',
      body: { include_common_checks: enabled },
    }).then((result) => {
      setIncludeCommonChecks(result.include_common_checks);
    }).catch((err) => {
      setIncludeCommonChecks(previousValue);
      setError(err.message || 'Could not update the common-check setting');
    }).finally(() => {
      setBusy(false);
    });
  };

  /** Shared actions for one checkpoint, used by the common card and by every section. */
  const checkpointActions = (scope, index, item, label) => ({
    number: index + 1,
    isFirst: index === 0,
    isLast: index === scope.list.length - 1,
    busy,
    dragging: draggingId === item.id,
    dropTarget: dropTargetId === item.id,
    onDragStart: (e) => startDrag(e, item.id),
    onDragOver: (e) => {
      if (draggingId === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetId(item.id);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDropTargetId(null);
    },
    onDrop: (e) => dropRow(e, scope, item.id),
    onDragEnd: () => {
      setDraggingId(null);
      setDropTargetId(null);
    },
    onSave: (item_text) => run(() => patchRow(scope, item.id, { item_text })),
    onMove: (dir) => run(() => moveRow(scope, index, dir)),
    onToggle: () => run(() => patchRow(scope, item.id, { is_active: !item.is_active })),
    onDelete: () => {
      if (window.confirm(`Delete this ${label}?`)) run(() => removeRow(scope, item.id));
    },
  });

  const selectedType = types.find((t) => t.id === typeId);

  return (
    <div className="tfc-setup">
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="tfc-setup-section tfc-common" style={checklistSectionStyle(0)}>
        <div className="tfc-setup-head">
          <div>
            <span className="tfc-eyebrow">GLOBAL TEMPLATE</span>
            <strong>Common checkpoints</strong>
          </div>
          <span className="tfc-count">{common.length} {common.length === 1 ? 'item' : 'items'}</span>
        </div>
        <p className="form-note">
          These appear at the top of every checklist, above the sections. Verifiers answer them for every task.
        </p>
        <ol className="tfc-setup-items">
          {common.map((item, ii) => (
            <CheckpointRow
              key={item.id}
              item={item}
              style={checklistSectionStyle(0)}
              {...checkpointActions(commonScope, ii, item, 'common checkpoint')}
            />
          ))}
          {!loading && !common.length && <li className="tfc-empty">No common checkpoints yet. Add one below to include a check on every task.</li>}
        </ol>
        <form className="tfc-add-stack" onSubmit={addCommon}>
          <textarea
            rows={2}
            className="tfc-big-text"
            placeholder="New common checkpoint, e.g. To Check Project Name"
            value={newCommon}
            onChange={(e) => setNewCommon(e.target.value)}
            disabled={busy}
            aria-label="New common checkpoint"
          />
          <button type="submit" className="ghost-btn-text" disabled={busy || !newCommon.trim()}>
            Add common checkpoint
          </button>
        </form>
      </div>

      <div className="tfc-filters">
        <label className="tfc-type-picker">
          <span>Configure task type</span>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Task type">
            {!types.length && <option value="">No task types</option>}
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="tfc-common-toggle">
          <span className="tfc-common-toggle-copy">
            <strong>Include common checks</strong>
            <small>{includeCommonChecks ? 'Included in verification and PDFs' : 'Hidden from verification and new PDFs'}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={includeCommonChecks}
            onChange={(e) => toggleCommonChecks(e.target.checked)}
            disabled={!typeId || busy || loading}
            aria-label="Include common checks in this task type checklist"
          />
        </label>
        <span className="form-note">
          Sections and checkpoints below apply to every {selectedType ? `"${selectedType.name}"` : 'task'} verification.
          Hidden checkpoints are kept for old records but no longer asked.
        </span>
      </div>

      <form className="tfc-add-row" onSubmit={addSection}>
        <input
          type="text"
          placeholder="New section heading, e.g. General Information & Setup"
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          disabled={!typeId || busy}
          aria-label="New section heading"
        />
        <button type="submit" className="primary-btn primary-btn-inline" disabled={!typeId || busy || !newSection.trim()}>
          Add section
        </button>
      </form>

      {loading && <div className="tfc-empty" role="status">Loading checklist…</div>}
      {!loading && typeId && !sections.length && (
        <div className="tfc-empty">No sections yet. Add the first section above, then its checkpoints.</div>
      )}

      {!loading && sections.map((section, si) => (
        <div
          key={section.id}
          className={`tfc-setup-section${section.is_active ? '' : ' is-hidden'}`}
          style={checklistSectionStyle(si + 1)}
        >
          <div className="tfc-setup-head">
            <div className="tfc-section-heading">
              <span className="tfc-letter">{sectionLetter(si)}</span>
              <EditableText
                value={section.title}
                disabled={busy}
                onSave={(title) => run(() => patchRow(sectionScope, section.id, { title }))}
              />
              <span className="tfc-count">{section.items.length} {section.items.length === 1 ? 'checkpoint' : 'checkpoints'}</span>
            </div>
            <div className="tfc-row-actions">
              <button type="button" className="ghost-btn-text" disabled={busy || si === 0}
                onClick={() => run(() => moveRow(sectionScope, si, -1))} aria-label="Move section up">↑</button>
              <button type="button" className="ghost-btn-text" disabled={busy || si === sections.length - 1}
                onClick={() => run(() => moveRow(sectionScope, si, 1))} aria-label="Move section down">↓</button>
              <button type="button" className="ghost-btn-text" disabled={busy}
                onClick={() => run(() => patchRow(sectionScope, section.id, { is_active: !section.is_active }))}>
                {section.is_active ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="ghost-btn-text tfc-danger" disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete section "${section.title}" and all its checkpoints?`)) {
                    run(() => removeRow(sectionScope, section.id));
                  }
                }}>
                Delete
              </button>
            </div>
          </div>

          <ol className="tfc-setup-items">
            {section.items.map((item, ii) => (
              <CheckpointRow
                key={item.id}
                item={item}
                style={checklistSectionStyle(si + 1)}
                {...checkpointActions(itemScope(section), ii, item, 'checkpoint')}
              />
            ))}
          </ol>

          <form className="tfc-add-stack" onSubmit={(e) => addItem(e, section)}>
            <textarea
              rows={2}
              className="tfc-big-text"
              placeholder="New checkpoint, e.g. Project Details: to check project name, location and client name"
              value={newItems[section.id] || ''}
              onChange={(e) => setNewItems((prev) => ({ ...prev, [section.id]: e.target.value }))}
              disabled={busy}
              aria-label={`New checkpoint for section ${sectionLetter(si)}`}
            />
            <button type="submit" className="ghost-btn-text" disabled={busy || !(newItems[section.id] || '').trim()}>
              Add checkpoint
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

/** One checkpoint line with its reorder, hide and delete actions. */
function CheckpointRow({
  item, number, isFirst, isLast, busy, dragging, dropTarget,
  style,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onSave, onMove, onToggle, onDelete,
}) {
  return (
    <li
      className={`${item.is_active ? '' : 'is-hidden'}${dragging ? ' is-dragging' : ''}${dropTarget ? ' is-drop-target' : ''}`}
      style={style}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="tfc-drag-handle"
        aria-label={`Drag to reorder checkpoint ${number}`}
        title="Drag to reorder"
        draggable={!busy}
        disabled={busy}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="tfc-no">{number}</span>
      <EditableText value={item.item_text} disabled={busy} onSave={onSave} />
      <div className="tfc-row-actions">
        <button type="button" className="ghost-btn-text" disabled={busy || isFirst}
          onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button type="button" className="ghost-btn-text" disabled={busy || isLast}
          onClick={() => onMove(1)} aria-label="Move down">↓</button>
        <button type="button" className="ghost-btn-text" disabled={busy} onClick={onToggle}>
          {item.is_active ? 'Hide' : 'Show'}
        </button>
        <button type="button" className="ghost-btn-text tfc-danger" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

/** Text that opens into a large text area on Edit. Save only fires when the text actually changed. */
function EditableText({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span className="tfc-editable">
        <span className="tfc-editable-text">{value}</span>
        <button
          type="button"
          className="ghost-btn-text"
          disabled={disabled}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          Edit
        </button>
      </span>
    );
  }

  const save = (e) => {
    e.preventDefault();
    const text = draft.trim();
    setEditing(false);
    if (text && text !== value) onSave(text);
  };

  return (
    <form className="tfc-editable tfc-editing" onSubmit={save}>
      <textarea
        className="tfc-big-text"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
        aria-label="Edit text"
      />
      <div className="tfc-edit-actions">
        <button type="submit" className="primary-btn primary-btn-inline" disabled={!draft.trim()}>
          Save
        </button>
        <button type="button" className="ghost-btn-text" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
