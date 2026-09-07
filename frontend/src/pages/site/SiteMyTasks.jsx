import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./SiteMyTasks.css";

function isOpenStatus(status) {
  const s = String(status || "");
  return s !== "Completed" && s !== "Rejected";
}

function dueLabel(task) {
  if (task.target_date) {
    try {
      return new Date(task.target_date + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return task.target_date;
    }
  }
  if (task.work_due_at) {
    try {
      return new Date(task.work_due_at).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      /* fall through */
    }
  }
  return "—";
}

export default function SiteMyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/tasks/my");
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Could not load tasks");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTasks = tasks.filter((t) => isOpenStatus(t.status));
  const doneTasks = tasks.filter((t) => !isOpenStatus(t.status));
  const visible = showDone ? doneTasks : openTasks;

  const markDone = async (task) => {
    if (!task?.id || busyId) return;
    setBusyId(task.id);
    setError("");
    try {
      await api(`/tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Completed" }),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "Completed" } : t))
      );
    } catch (err) {
      setError(err.message || "Could not mark complete");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="smt-page">
      <div className="smt-head">
        <div>
          <h1 className="smt-title">My Tasks</h1>
          <p className="smt-sub">
            Tick Done here or on WhatsApp — both mark the task complete.
          </p>
        </div>
        <button type="button" className="smt-refresh" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="smt-tabs">
        <button
          type="button"
          className={`smt-tab${!showDone ? " act" : ""}`}
          onClick={() => setShowDone(false)}
        >
          Open ({openTasks.length})
        </button>
        <button
          type="button"
          className={`smt-tab${showDone ? " act" : ""}`}
          onClick={() => setShowDone(true)}
        >
          Done ({doneTasks.length})
        </button>
      </div>

      {error && <div className="smt-error">{error}</div>}

      {loading ? (
        <div className="smt-empty">Loading tasks…</div>
      ) : visible.length === 0 ? (
        <div className="smt-empty">
          {showDone ? "No completed tasks yet." : "No open tasks. You’re all caught up."}
        </div>
      ) : (
        <ul className="smt-list">
          {visible.map((task) => {
            const open = isOpenStatus(task.status);
            const projectName = task.project?.name || task.projects?.name || "—";
            return (
              <li key={task.id} className={`smt-card${open ? "" : " done"}`}>
                <label className="smt-check-wrap">
                  <input
                    type="checkbox"
                    className="smt-check"
                    checked={!open}
                    disabled={!open || busyId === task.id}
                    onChange={() => open && markDone(task)}
                    aria-label="Mark task done"
                  />
                </label>
                <div className="smt-body">
                  <div className="smt-desc">{task.description || "Untitled task"}</div>
                  <div className="smt-meta">
                    <span>{projectName}</span>
                    <span>·</span>
                    <span>Due {dueLabel(task)}</span>
                    {task.priority ? (
                      <>
                        <span>·</span>
                        <span className="smt-pri">{task.priority}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="smt-status">{task.status}</div>
                </div>
                {open && (
                  <button
                    type="button"
                    className="smt-done-btn"
                    disabled={busyId === task.id}
                    onClick={() => markDone(task)}
                  >
                    {busyId === task.id ? "…" : "Done"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
