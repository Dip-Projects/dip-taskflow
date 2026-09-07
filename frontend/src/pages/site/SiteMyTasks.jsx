import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import "./SiteMyTasks.css";

function isOpenStatus(status) {
  const s = String(status || "");
  return s !== "Completed" && s !== "Rejected";
}

function istYmd(d = new Date()) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function taskDueYmd(task) {
  const raw = task?.target_date || task?.meeting_week_start;
  if (!raw) return null;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    return istYmd(new Date(s));
  } catch {
    return null;
  }
}

/** Monday of the week containing ymd (local / IST phones) */
function weekMonday(ymd) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const d = new Date(Y, M - 1, D);
  const wd = d.getDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDaysYmd(ymd, n) {
  const [Y, M, D] = ymd.split("-").map(Number);
  const d = new Date(Y, M - 1, D);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildWeekDays(anchorYmd) {
  const mon = weekMonday(anchorYmd);
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return names.map((label, i) => {
    const ymd = addDaysYmd(mon, i);
    const d = new Date(`${ymd}T12:00:00+05:30`);
    return {
      label,
      ymd,
      dayNum: d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }),
    };
  });
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

function matchesDay(task, dayYmd, todayYmd) {
  if (task.source === "ea_meeting") {
    // EA weekly plan shows on Monday of that meeting week
    const weekStart = task.meeting_week_start || taskDueYmd(task);
    return weekStart === dayYmd;
  }
  const due = taskDueYmd(task);
  if (!due) return dayYmd === todayYmd;
  if (isOpenStatus(task.status)) {
    // Open: show on due day; also on today if overdue
    if (due === dayYmd) return true;
    if (dayYmd === todayYmd && due < todayYmd) return true;
    return false;
  }
  // Done: show on due day, or completed on this day
  if (due === dayYmd) return true;
  if (task.completed_at && istYmd(task.completed_at) === dayYmd) return true;
  if (task.plan_submitted_at && istYmd(task.plan_submitted_at) === dayYmd) return true;
  return false;
}

export default function SiteMyTasks() {
  const navigate = useNavigate();
  const todayYmd = istYmd();
  const weekDays = useMemo(() => buildWeekDays(todayYmd), [todayYmd]);

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [dayYmd, setDayYmd] = useState(todayYmd);
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
        "Monday tasks Mon pe, Tuesday Tue pe. WhatsApp pe din ka list picker aata hai — Select se Done; reply LIST."
      );
      const office = Array.isArray(officeTasks) ? officeTasks : [];
      setTasks([...office, ...eaItems]);
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

  const dayTasks = useMemo(
    () => tasks.filter((t) => matchesDay(t, dayYmd, todayYmd)),
    [tasks, dayYmd, todayYmd]
  );

  const openTasks = dayTasks.filter((t) => isOpenStatus(t.status));
  const doneTasks = dayTasks.filter((t) => !isOpenStatus(t.status));
  const visible = showDone ? doneTasks : openTasks;

  const dayCounts = useMemo(() => {
    const map = {};
    for (const d of weekDays) {
      const list = tasks.filter((t) => matchesDay(t, d.ymd, todayYmd));
      map[d.ymd] = {
        open: list.filter((t) => isOpenStatus(t.status)).length,
        done: list.filter((t) => !isOpenStatus(t.status)).length,
      };
    }
    return map;
  }, [tasks, weekDays, todayYmd]);

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
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: "Completed", completed_at: new Date().toISOString() }
            : t
        )
      );
    } catch (err) {
      setError(err.message || "Could not mark complete");
    } finally {
      setBusyId(null);
    }
  };

  const selectedDay = weekDays.find((d) => d.ymd === dayYmd);

  return (
    <div className="smt-page">
      <div className="smt-head">
        <div>
          <h1 className="smt-title">My Tasks</h1>
          <p className="smt-sub">
            {selectedDay
              ? `${selectedDay.label} ${selectedDay.dayNum} — aaj ke / us din ke tasks`
              : "Day-wise tasks"}
          </p>
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

      <div className="smt-day-row" role="tablist" aria-label="Week days">
        {weekDays.map((d) => {
          const c = dayCounts[d.ymd] || { open: 0, done: 0 };
          const isToday = d.ymd === todayYmd;
          const act = d.ymd === dayYmd;
          return (
            <button
              key={d.ymd}
              type="button"
              role="tab"
              aria-selected={act}
              className={`smt-day${act ? " act" : ""}${isToday ? " today" : ""}`}
              onClick={() => {
                setDayYmd(d.ymd);
                setShowDone(false);
              }}
            >
              <span className="smt-day-name">{d.label}</span>
              <span className="smt-day-num">{d.dayNum}</span>
              <span className="smt-day-count">
                {c.open ? `${c.open} open` : c.done ? `${c.done} done` : "—"}
              </span>
            </button>
          );
        })}
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
          {showDone
            ? `No completed tasks for ${selectedDay?.label || "this day"}.`
            : `No open tasks for ${selectedDay?.label || "this day"}.${
                doneTasks.length
                  ? " Done tab check karo."
                  : dayYmd === todayYmd
                    ? " You’re all caught up for today."
                    : ""
              }`}
        </div>
      ) : (
        <ul className="smt-list">
          {visible.map((task) => {
            const open = isOpenStatus(task.status);
            const isEa = task.source === "ea_meeting";
            const projectName = task.project?.name || task.projects?.name || "—";
            const due = taskDueYmd(task);
            const late = open && due && due < todayYmd;
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
                    {late ? (
                      <>
                        <span>·</span>
                        <span className="smt-late">LATE</span>
                      </>
                    ) : null}
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
