// The legacy DOM views (mountTaskflowApp.js) and the React checklist screens
// talk through window events, so neither has to import the other.

export const CHECKLIST_EVENT = 'tf:checklist';
export const TASK_CHECKLIST_OPEN_EVENT = 'tf:task-checklist-open';
export const CHECKLIST_VIEW_EVENT = 'tf:checklist-view';

/**
 * Opens the checklist popup shown when a task is sent for verification.
 * Resolves { checklist } (checklist = [{ item_id, comments }]) when confirmed,
 * or null when closed. The caller saves; the popup itself saves nothing.
 */
export function requestChecklist({ taskId, taskLabel = '' }) {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(CHECKLIST_EVENT, { detail: { taskId, taskLabel, resolve } })
    );
  });
}

/** Opens the read-only checklist view (with Download PDF) for a task. */
export function openChecklistView({ taskId, taskLabel = '' }) {
  window.dispatchEvent(new CustomEvent(CHECKLIST_VIEW_EVENT, { detail: { taskId, taskLabel } }));
}
