import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  return "—";
}

export default function SiteMyTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [dataNote, setDataNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [officeTasks, eaRes] = await Promise.all([
        api("/tasks/my").catch(() => []),
        api("/ea-meeting/my").catch(() => ({ items: [], note: "" })),
      ]);
      const eaItems = Array.isArray(eaRes?.items) ? eaRes.items : [];
      setDataNote(
        eaRes?.note ||
          "EA files: Beena + same site. Site Engineer QR only."
      );
      const office = Array.isArray(officeTasks) ? officeTasks : [];
      const merged = [...office, ...eaItems];
      setTasks(merged);
      const hasOpen = merged.some((t) => isOpenStatus(t.status));
      const hasEaDone = eaItems.some((t) => !isOpenStatus(t.status));
      if (!hasOpen && hasEaDone) setShowDone(true);
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
    if (task.source === "ea_meeting") {
      if (!task.plan_submitted_at) {
        navigate(task.upload_path || "/site/qr-scan");
        return;
      }
      return;
    }
    setBusyId(task.id);
    setError("");
    try {
      await api(`/tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Completed" }),
      });
      // Completed office tasks leave My Tasks; admin still sees them in All delegated
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
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
          <p className="smt-sub">Office tasks + EA meeting uploads (Site Engineer).</p>
          {dataNote ? (
            <p className="smt-sub" style={{ marginTop: 6 }}>
              {dataNote}
            </p>
          ) : null}
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
          {showDone ? "No completed tasks yet." : "No open tasks."}
        </div>
      ) : (
        <ul className="smt-list">
          {visible.map((task) => {
            const open = isOpenStatus(task.status);
            const isEa = task.source === "ea_meeting";
            const projectName = task.project?.name || task.projects?.name || "—";
            return (
              <li key={task.id} className={`smt-card${open ? "" : " done"}`}>
                <label className="smt-check-wrap">
                  <input
                    type="checkbox"
                    className="smt-check"
                    checked={!open}
                    disabled={!open || busyId === task.id || (isEa && !task.plan_submitted_at)}
                    onChange={() => open && !isEa && markDone(task)}
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
                  <div className="smt-status">
                    {isEa ? (open ? "EA pending upload" : "EA uploaded") : task.status}
                  </div>
                  {!open && isEa && (task.attachment_1_url || task.attachment_2_url) ? (
                    <div className="smt-meta" style={{ marginTop: 6 }}>
                      {task.attachment_1_url ? (
                        <a href={task.attachment_1_url} target="_blank" rel="noreferrer">
                          {task.attachment_1_name || "File 1"}
                        </a>
                      ) : null}
                      {task.attachment_2_url ? (
                        <>
                          <span>·</span>
                          <a href={task.attachment_2_url} target="_blank" rel="noreferrer">
                            {task.attachment_2_name || "File 2"}
                          </a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {open && (
                  <button
                    type="button"
                    className="smt-done-btn"
                    disabled={busyId === task.id}
                    onClick={() => markDone(task)}
                  >
                    {busyId === task.id ? "…" : isEa ? "Upload" : "Done"}
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
