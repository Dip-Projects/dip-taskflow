import { useEffect, useState } from "react";
import { api } from "../../lib/api";

const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const CARD = {
  background: "#fff",
  borderRadius: 12,
  width: "min(640px, 100%)",
  maxHeight: "85vh",
  overflow: "auto",
  padding: 20,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
  color: "#111827",
};

const ROW = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  marginTop: 10,
};

const BTN = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
};

const BTN_PRI = { ...BTN, background: "#1d4ed8", borderColor: "#1d4ed8", color: "#fff" };

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" (or ISO timestamp) -> "DD-MM-YYYY" without timezone shifts. */
function fmtDay(v) {
  const s = String(v || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s || "—";
}

/** Day after the leave ends, as "YYYY-MM-DD" (local time). */
function dayAfter(toDate) {
  const d = new Date(`${String(toDate || "").slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function canReschedule(t) {
  return (
    !!t.rescheduling_possible &&
    t.reschedule_status !== "Pending" &&
    !t.reschedule_requested_at &&
    t.status !== "Ticket Raised" &&
    t.verification_status !== "Pending Verification"
  );
}

/**
 * "Plan your tasks while on leave" popup for leave applied by the PC on behalf
 * of an employee. Same three choices as the office portal: assign to buddy,
 * keep on hold, or request a reschedule.
 */
export default function LeaveTaskPlanModal({ leave, onClose }) {
  const [tasks, setTasks] = useState(null);
  const [choices, setChoices] = useState({});
  const [loadErr, setLoadErr] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [busy, setBusy] = useState(false);

  const buddyName = leave?.buddy?.full_name || "the buddy";
  const defaultReschedule = dayAfter(leave?.to_date);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/leaves/${leave.id}/open-tasks`);
        if (cancelled) return;
        const list = data?.tasks || [];
        const initial = {};
        list.forEach((t) => {
          initial[t.id] = { action: "buddy", date: defaultReschedule };
        });
        setChoices(initial);
        setTasks(list);
      } catch (err) {
        if (!cancelled) {
          setLoadErr(err.message || "Could not load tasks");
          setTasks([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leave.id, defaultReschedule]);

  const setChoice = (taskId, patch) =>
    setChoices((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));

  const save = async () => {
    setSaveErr("");
    const actions = [];
    for (const t of tasks || []) {
      const c = choices[t.id];
      if (!c?.action) continue;
      if (c.action === "reschedule") {
        if (!c.date) {
          setSaveErr("Pick a new date for every reschedule choice");
          return;
        }
        actions.push({ task_id: t.id, action: "reschedule", requested_date: c.date });
      } else {
        actions.push({ task_id: t.id, action: c.action });
      }
    }
    if (!actions.length) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const res = await api(`/leaves/${leave.id}/task-actions`, {
        method: "POST",
        body: { actions },
      });
      const failed = (res?.results || []).filter((r) => !r.ok);
      if (failed.length) {
        setSaveErr(
          `${failed.length} task(s) could not be updated: ${failed.map((f) => f.error || "failed").join("; ")}`
        );
        setBusy(false);
        return;
      }
      onClose();
    } catch (err) {
      setSaveErr(err.message || "Could not save task choices");
      setBusy(false);
    }
  };

  return (
    <div style={OVERLAY} role="dialog" aria-modal="true">
      <div style={CARD}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Plan tasks while on leave</h3>
        <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
          Leave {fmtDay(leave.from_date)} → {fmtDay(leave.to_date)}. For each task pick: assign to{" "}
          {buddyName}, keep on hold, or request a reschedule. Tasks move to the buddy only after they accept.
        </p>

        {tasks === null && <div style={{ marginTop: 16, color: "#6b7280" }}>Loading tasks…</div>}
        {loadErr && <div style={{ marginTop: 12, color: "#b91c1c" }}>{loadErr}</div>}
        {tasks && !loadErr && !tasks.length && (
          <div style={{ marginTop: 16, color: "#6b7280" }}>No open tasks for this employee.</div>
        )}

        {(tasks || []).map((t) => {
          const c = choices[t.id] || { action: "buddy", date: defaultReschedule };
          const resched = canReschedule(t);
          const proj = t.project?.name ? ` · ${t.project.name}` : "";
          return (
            <div key={t.id} style={ROW}>
              <div style={{ fontWeight: 600 }}>
                {t.description || "Task"}
                {t.in_leave_window && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#92400e", background: "#fef3c7", borderRadius: 999, padding: "2px 8px" }}>
                    In leave window
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {t.status}
                {proj} · due {fmtDay(t.target_date)} · {t.priority || ""}
              </div>

              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
                <label>
                  <input
                    type="radio"
                    name={`leave-act-${t.id}`}
                    checked={c.action === "buddy"}
                    onChange={() => setChoice(t.id, { action: "buddy" })}
                  />{" "}
                  Plan for buddy ({buddyName}) — moves only after buddy Accepts
                </label>
                <label>
                  <input
                    type="radio"
                    name={`leave-act-${t.id}`}
                    checked={c.action === "hold"}
                    onChange={() => setChoice(t.id, { action: "hold" })}
                  />{" "}
                  Keep on hold with employee
                </label>
                <label style={{ opacity: resched ? 1 : 0.5 }}>
                  <input
                    type="radio"
                    name={`leave-act-${t.id}`}
                    disabled={!resched}
                    checked={c.action === "reschedule"}
                    onChange={() => setChoice(t.id, { action: "reschedule" })}
                  />{" "}
                  Reschedule request
                </label>
                {c.action === "reschedule" && (
                  <div style={{ marginLeft: 22 }}>
                    <span style={{ fontSize: 12, color: "#6b7280", marginRight: 8 }}>New target date</span>
                    <input
                      type="date"
                      value={c.date}
                      onChange={(e) => setChoice(t.id, { date: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {saveErr && <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 13 }}>{saveErr}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" style={BTN} onClick={onClose} disabled={busy}>
            Skip for now
          </button>
          {tasks && tasks.length > 0 && (
            <button type="button" style={BTN_PRI} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save choices"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
