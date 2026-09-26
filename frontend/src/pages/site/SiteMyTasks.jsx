import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { parseWeeklyPlanBuffer } from "../../lib/weeklyPlanExcel";
import { parseWeeklyPlanPdfBuffer } from "../../lib/weeklyPlanPdf";
import "./SiteMyTasks.css";

function fmtDate(value) {
  const s = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  try {
    return new Date(`${s}T12:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function weekLabel(week) {
  const start = fmtDate(week?.week_start);
  const end = week?.week_end ? fmtDate(week.week_end) : null;
  return end && end !== start ? `${start} – ${end}` : start;
}

function halfLabel(half) {
  const n = Number(half) || 0;
  if (n === 1) return "1st half";
  if (n === 2) return "2nd half";
  return "—";
}

function statusOf(task) {
  const s = String(task?.status || "Pending").trim();
  return s || "Pending";
}

function isPdfUrl(name, url) {
  const lower = String(name || url || "").toLowerCase();
  return lower.includes(".pdf") || lower.endsWith("pdf");
}

async function parsePlanFile(fileUrl, fileName) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Could not download ${fileName || "plan file"}`);
  const buf = await res.arrayBuffer();
  if (isPdfUrl(fileName, fileUrl)) {
    return parseWeeklyPlanPdfBuffer(buf);
  }
  return parseWeeklyPlanBuffer(buf);
}

async function ingestPlanAttachment(eaId, sourceFile, fileUrl, fileName) {
  if (!eaId || !fileUrl) return { inserted: 0 };

  const parsed = await parsePlanFile(fileUrl, fileName);
  if (!parsed?.tasks?.length) return { inserted: 0, skipped: true };

  const result = await api(`/ea-meeting/${eaId}/ingest`, {
    method: "POST",
    body: JSON.stringify({
      clientParsed: [
        {
          source_file: sourceFile,
          tasks: parsed.tasks.slice(0, 400),
          meta: parsed.meta || null,
        },
      ],
    }),
  });
  return {
    inserted: Number(result?.inserted) || 0,
    ok: Boolean(result?.ok),
    note: result?.note || result?.error || "",
  };
}

export default function SiteMyTasks() {
  const [tasks, setTasks] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [eaUploads, setEaUploads] = useState(0);
  const [busyId, setBusyId] = useState("");
  const [weekFilter, setWeekFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const applyPayload = useCallback((data) => {
    const nextTasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const nextWeeks = Array.isArray(data?.weeks) ? data.weeks : [];
    setTasks(nextTasks);
    setWeeks(nextWeeks);
    setNote(data?.note || "");
    setEaUploads(Number(data?.ea_uploads) || 0);
    setWeekFilter((prev) => {
      if (prev === "all") return prev;
      return nextWeeks.some((w) => w.week_start === prev) ? prev : "all";
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/ea-meeting/my-plan-tasks");
      applyPayload(data);
    } catch (err) {
      setError(err.message || "Could not load weekly plan tasks");
      setTasks([]);
      setWeeks([]);
      setEaUploads(0);
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  const syncFromPlans = useCallback(async () => {
    setSyncing(true);
    setError("");
    setNote("Syncing tasks from uploaded weekly plans…");
    try {
      // Prefer own uploads from my-plan-tasks (ea_meeting_attendance for this user only).
      const existing = await api("/ea-meeting/my-plan-tasks");
      let plans = Array.isArray(existing?.uploads) ? existing.uploads : [];

      if (!plans.length) {
        const eaRes = await api("/ea-meeting/my");
        const items = Array.isArray(eaRes?.items) ? eaRes.items : [];
        const myUser = String(
          items.find((r) => r?.employee_username)?.employee_username || ""
        )
          .trim()
          .toLowerCase();
        plans = items
          .filter(
            (row) =>
              row?.plan_submitted_at &&
              (row.attachment_1_url || row.attachment_2_url) &&
              (!myUser ||
                String(row.employee_username || "")
                  .trim()
                  .toLowerCase() === myUser)
          )
          .map((row) => ({
            ea_id: row.ea_id || String(row.id || "").replace(/^ea:/, ""),
            attachment_1_url: row.attachment_1_url,
            attachment_1_name: row.attachment_1_name,
            attachment_2_url: row.attachment_2_url,
            attachment_2_name: row.attachment_2_name,
          }));
      }

      if (!plans.length) {
        applyPayload(existing);
        setNote("No uploaded weekly plans found for your account yet.");
        return;
      }

      let inserted = 0;
      const errors = [];
      for (const row of plans.slice(0, 12)) {
        const eaId = row.ea_id || String(row.id || "").replace(/^ea:/, "");
        if (!eaId) continue;
        try {
          if (row.attachment_1_url) {
            const r1 = await ingestPlanAttachment(
              eaId,
              "attachment_1",
              row.attachment_1_url,
              row.attachment_1_name
            );
            inserted += Number(r1.inserted) || 0;
            if (r1.note && /supabase|missing|half/i.test(r1.note)) errors.push(r1.note);
          }
          if (row.attachment_2_url) {
            const r2 = await ingestPlanAttachment(
              eaId,
              "attachment_2",
              row.attachment_2_url,
              row.attachment_2_name
            );
            inserted += Number(r2.inserted) || 0;
            if (r2.note && /supabase|missing|half/i.test(r2.note)) errors.push(r2.note);
          }
        } catch (err) {
          errors.push(err.message || "Sync failed for one plan");
        }
      }

      const data = await api("/ea-meeting/my-plan-tasks");
      applyPayload(data);
      if (errors.length && !(data?.tasks || []).length) {
        setError(errors[0]);
      } else {
        setNote(
          inserted > 0
            ? `Synced ${inserted} new task${inserted === 1 ? "" : "s"} from weekly plans.`
            : (data?.tasks || []).length
              ? `Loaded ${(data.tasks || []).length} weekly plan tasks.`
              : "Plans found, but no tasks could be parsed from the files."
        );
      }
    } catch (err) {
      setError(err.message || "Could not sync weekly plan tasks");
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api("/ea-meeting/my-plan-tasks");
        if (cancelled) return;
        applyPayload(data);
        // Auto-sync once when uploads exist but no tasks are saved yet.
        if (!(data?.tasks || []).length && Number(data?.ea_uploads) > 0) {
          await syncFromPlans();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load weekly plan tasks");
          setTasks([]);
          setWeeks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPayload, syncFromPlans]);

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      const weekStart = String(task.week_start || "").slice(0, 10);
      if (weekFilter !== "all" && weekStart !== weekFilter) return false;
      const status = statusOf(task);
      if (statusFilter === "all") return true;
      if (statusFilter === "completed") return status === "Completed";
      if (statusFilter === "pending") return status !== "Completed" && status !== "Cancelled";
      return true;
    });
  }, [tasks, weekFilter, statusFilter]);

  const counts = useMemo(() => {
    const base =
      weekFilter === "all"
        ? tasks
        : tasks.filter((t) => String(t.week_start || "").slice(0, 10) === weekFilter);
    return {
      all: base.length,
      pending: base.filter((t) => {
        const s = statusOf(t);
        return s !== "Completed" && s !== "Cancelled";
      }).length,
      completed: base.filter((t) => statusOf(t) === "Completed").length,
    };
  }, [tasks, weekFilter]);

  const toggleStatus = async (task) => {
    if (!task?.id || busyId) return;
    const current = statusOf(task);
    if (current === "Cancelled") return;
    const wanted = current === "Completed" ? "Pending" : "Completed";
    const previous = { ...task };
    setBusyId(task.id);
    setError("");
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: wanted,
              completed_at: wanted === "Completed" ? new Date().toISOString() : null,
              completed_via: wanted === "Completed" ? "portal" : null,
            }
          : t
      )
    );
    try {
      const result = await api(`/ea-meeting/tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: wanted }),
      });
      if (result?.task?.id) {
        setTasks((prev) => prev.map((t) => (t.id === result.task.id ? { ...t, ...result.task } : t)));
      }
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? previous : t)));
      setError(err.message || `Could not mark task ${wanted}`);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="smt-page smt-page--wide">
      <div className="smt-head">
        <div>
          <h1 className="smt-title">My Tasks</h1>
          <p className="smt-sub">
            Weekly planning sheet tasks — filter by week and status, then toggle Pending / Completed.
          </p>
          {note ? (
            <p className="smt-sub" style={{ marginTop: 6 }}>
              {note}
            </p>
          ) : null}
        </div>
        <div className="smt-head-actions">
          <button
            type="button"
            className="smt-refresh"
            onClick={syncFromPlans}
            disabled={loading || syncing}
          >
            {syncing ? "Syncing…" : "Sync from plans"}
          </button>
          <button type="button" className="smt-refresh" onClick={load} disabled={loading || syncing}>
            Refresh
          </button>
        </div>
      </div>

      <div className="smt-filters">
        <label className="smt-filter">
          <span>Week</span>
          <select
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            disabled={loading || syncing}
          >
            <option value="all">All weeks ({tasks.length})</option>
            {weeks.map((w) => (
              <option key={w.week_start} value={w.week_start}>
                {weekLabel(w)} ({w.count})
              </option>
            ))}
          </select>
        </label>

        <label className="smt-filter">
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={loading || syncing}
          >
            <option value="all">All ({counts.all})</option>
            <option value="pending">Pending ({counts.pending})</option>
            <option value="completed">Completed ({counts.completed})</option>
          </select>
        </label>
      </div>

      {error ? <div className="smt-error">{error}</div> : null}

      {loading || syncing ? (
        <div className="smt-empty">
          {syncing ? "Syncing tasks from weekly plan files…" : "Loading weekly plan tasks…"}
        </div>
      ) : filtered.length === 0 ? (
        <div className="smt-empty">
          {tasks.length === 0 ? (
            <>
              <div>
                {eaUploads > 0
                  ? "Uploads found, but tasks are not saved yet."
                  : "No weekly plan tasks yet."}
              </div>
              <button
                type="button"
                className="smt-done-btn"
                style={{ marginTop: 12 }}
                onClick={syncFromPlans}
              >
                Sync from plans
              </button>
            </>
          ) : (
            "No tasks match these filters."
          )}
        </div>
      ) : (
        <div className="smt-table-wrap">
          <table className="smt-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Date</th>
                <th>Site</th>
                <th>Task / category</th>
                <th>Work / time</th>
                <th>Half</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => {
                const status = statusOf(task);
                const done = status === "Completed";
                const cancelled = status === "Cancelled";
                const busy = busyId === task.id;
                return (
                  <tr key={task.id} className={done ? "smt-table__row--done" : ""}>
                    <td>{weekLabel({ week_start: task.week_start, week_end: task.week_end })}</td>
                    <td>{fmtDate(task.task_date)}</td>
                    <td>{task.site_name || "—"}</td>
                    <td className="smt-table__task">{task.task_name || "—"}</td>
                    <td className="smt-table__slot">{task.time_slot || "—"}</td>
                    <td>{halfLabel(task.half)}</td>
                    <td>
                      <button
                        type="button"
                        className={`smt-status-toggle ${
                          done
                            ? "smt-status-toggle--done"
                            : cancelled
                              ? "smt-status-toggle--cancel"
                              : "smt-status-toggle--pending"
                        }`}
                        disabled={cancelled || Boolean(busyId)}
                        title={
                          cancelled
                            ? "Cancelled"
                            : done
                              ? "Click to mark Pending"
                              : "Click to mark Completed"
                        }
                        onClick={() => toggleStatus(task)}
                      >
                        {busy ? "…" : done ? "Completed" : cancelled ? "Cancelled" : "Pending"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
