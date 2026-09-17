import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { parseDateFromText, ymdRangeInclusive, parseWeeklyPlanBuffer } from "../lib/weeklyPlanExcel";

const MAX_DAY_COLS = 7;

function isPdfAttachment(fileName, fileUrl) {
  const lower = String(fileName || fileUrl || "").toLowerCase();
  return lower.includes(".pdf") || lower.endsWith("pdf");
}

function fmtDayHeader(ymd) {
  try {
    const dt = new Date(`${ymd}T12:00:00`);
    return `${String(dt.getDate()).padStart(2, "0")} ${dt.toLocaleString("en", { month: "short" })}`;
  } catch {
    return ymd;
  }
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "smt-task-cell--done";
  if (s === "cancelled") return "smt-task-cell--cancel";
  return "smt-task-cell--pending";
}

function weekRangeFromName(fileName) {
  const s = String(fileName || "");
  const m = s.match(
    /(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})\s*(?:to|-|–|—)\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/i
  );
  if (!m) return [];
  const from = parseDateFromText(m[1]);
  const to = parseDateFromText(m[2]);
  return ymdRangeInclusive(from, to, MAX_DAY_COLS);
}

function clampDates(dates, preferredStart, preferredEnd) {
  const unique = [...new Set((dates || []).filter(Boolean))].sort();
  if (!unique.length) {
    return ymdRangeInclusive(preferredStart, preferredEnd, MAX_DAY_COLS);
  }
  const span = ymdRangeInclusive(unique[0], unique[unique.length - 1], MAX_DAY_COLS);
  if (span.length && span.length <= MAX_DAY_COLS) return span;
  const week = ymdRangeInclusive(preferredStart, preferredEnd, MAX_DAY_COLS);
  if (week.length) return week;
  return unique.slice(0, MAX_DAY_COLS);
}

/** Split "TO CALL · 1st half" → { base, half: 1|2|0 } */
function splitTaskHalf(taskName) {
  const raw = String(taskName || "").trim();
  const m = raw.match(/^(.*?)\s*·\s*(1st half|2nd half)\s*$/i);
  if (m) {
    return { base: m[1].trim(), half: /1st/i.test(m[2]) ? 1 : 2 };
  }
  return { base: raw, half: 0 };
}

function dayName(ymd) {
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  } catch {
    return "";
  }
}

/**
 * Shows weekly_plan_tasks as an Excel-like grid (1st half | 2nd half per day).
 * Heavy PDF/Excel re-parse is ONLY on explicit button click — never on mount.
 */
export function WeeklyPlanAttachmentPreview({
  eaId,
  sourceFile,
  fileUrl,
  fileName,
  weekStart,
  weekEnd,
}) {
  const isPdf = isPdfAttachment(fileName, fileUrl);
  const [tasks, setTasks] = useState([]);
  const [extraDates, setExtraDates] = useState(() => weekRangeFromName(fileName));
  const [loading, setLoading] = useState(Boolean(eaId));
  const [reparsing, setReparsing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");
  const cancelledRef = useRef(false);

  const loadTasks = useCallback(async () => {
    if (!eaId) return [];
    const qs = sourceFile ? `?source=${encodeURIComponent(sourceFile)}` : "";
    const data = await api(`/ea-meeting/${eaId}/tasks${qs}`);
    return Array.isArray(data?.tasks) ? data.tasks : [];
  }, [eaId, sourceFile]);

  /** Fast path: DB only — keeps the page responsive. */
  const load = useCallback(async () => {
    if (!eaId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    cancelledRef.current = false;
    setLoading(true);
    setError("");
    try {
      const list = await loadTasks();
      if (cancelledRef.current) return;
      setTasks(list);
      setExtraDates(weekRangeFromName(fileName));
      const hasHalves = list.some((t) => /·\s*(1st|2nd)\s*half/i.test(String(t.task_name || "")));
      if (list.length && !hasHalves && fileUrl) {
        setNote('Click "Re-parse file" once to split 1st half / 2nd half columns.');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err.message || "Could not load plan tasks.");
        setTasks([]);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [eaId, fileName, fileUrl, loadTasks]);

  /** Heavy path: user-triggered only. */
  const reparseFile = useCallback(async () => {
    if (!eaId || !fileUrl || reparsing) return;
    setReparsing(true);
    setNote(isPdf ? "Parsing PDF… (may take a few seconds)" : "Parsing Excel…");
    setError("");
    try {
      // Dynamic import so PDF code is not loaded until needed.
      let parsed;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("Could not download plan file");
      const buf = await res.arrayBuffer();

      // Yield so the browser can paint the "Parsing…" note.
      await new Promise((r) => setTimeout(r, 50));

      if (isPdf) {
        const { parseWeeklyPlanPdfBuffer } = await import("../lib/weeklyPlanPdf");
        parsed = await parseWeeklyPlanPdfBuffer(buf);
      } else {
        parsed = parseWeeklyPlanBuffer(buf);
      }

      const parsedTasks = (parsed.tasks || []).slice(0, 400);
      const parsedDays = (Array.isArray(parsed?.meta?.days) ? parsed.meta.days : []).slice(
        0,
        MAX_DAY_COLS
      );
      setExtraDates([...new Set([...parsedDays, ...weekRangeFromName(fileName)])].sort());

      if (!parsedTasks.length) {
        setNote("No tasks found in file. Check the plan layout (dates + 1st/2nd half columns).");
        return;
      }

      await api(`/ea-meeting/${eaId}/ingest`, {
        method: "POST",
        body: JSON.stringify({
          clientParsed: [
            {
              source_file: sourceFile || "attachment_1",
              tasks: parsedTasks,
              meta: parsed.meta || null,
            },
          ],
        }),
      });
      const refreshed = await loadTasks();
      setTasks(refreshed);
      setNote(`Loaded ${refreshed.length} cells (1st & 2nd half).`);
    } catch (err) {
      setNote(err.message || "Re-parse failed.");
    } finally {
      setReparsing(false);
    }
  }, [eaId, fileUrl, fileName, isPdf, loadTasks, reparsing, sourceFile]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const { dates, rows, useHalves } = useMemo(() => {
    const seed = [];
    ymdRangeInclusive(weekStart, weekEnd, MAX_DAY_COLS).forEach((d) => seed.push(d));
    extraDates.forEach((d) => seed.push(d));
    weekRangeFromName(fileName).forEach((d) => seed.push(d));
    tasks.forEach((t) => {
      if (t.task_date) seed.push(t.task_date);
    });

    const datesSorted = clampDates(seed, weekStart, weekEnd);
    const halvesPresent = tasks.some((t) => splitTaskHalf(t.task_name).half > 0);

    const byKey = new Map();
    tasks.forEach((t) => {
      const { base, half } = splitTaskHalf(t.task_name);
      const key = `${t.sr_no ?? ""}::${base.toLowerCase()}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          sr_no: t.sr_no,
          task_name: base,
          cells: {},
        });
      }
      const bucket = byKey.get(key).cells;
      if (!bucket[t.task_date]) bucket[t.task_date] = {};
      const h = half || 0;
      bucket[t.task_date][h] = t;
      if (h === 0) bucket[t.task_date][1] = t;
    });

    const rowsSorted = [...byKey.values()]
      .sort((a, b) => {
        const sa = a.sr_no == null ? 9999 : Number(a.sr_no);
        const sb = b.sr_no == null ? 9999 : Number(b.sr_no);
        if (sa !== sb) return sa - sb;
        return String(a.task_name || "").localeCompare(String(b.task_name || ""));
      })
      .slice(0, 80);

    return { dates: datesSorted, rows: rowsSorted, useHalves: halvesPresent || true };
  }, [tasks, extraDates, weekStart, weekEnd, fileName]);

  const completeTask = async (task) => {
    if (!task?.id) return;
    if (String(task.status) === "Completed" || String(task.status) === "Cancelled") return;
    setBusyId(task.id);
    setNote("");
    try {
      await api(`/ea-meeting/tasks/${task.id}/complete`, { method: "PATCH" });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, status: "Completed", completed_at: new Date().toISOString(), completed_via: "portal" }
            : t
        )
      );
      setNote(`Marked done: ${splitTaskHalf(task.task_name).base}`);
    } catch (err) {
      setNote(err.message || "Could not complete task.");
    } finally {
      setBusyId("");
    }
  };

  const renderHalfCell = (cell, dateKey, half) => {
    if (!cell) {
      return (
        <td key={`${dateKey}-${half}`} className="smt-task-cell smt-task-cell--empty">
          —
        </td>
      );
    }
    const done = String(cell.status) === "Completed";
    const cancelled = String(cell.status) === "Cancelled";
    const clickable = !done && !cancelled;
    return (
      <td key={`${dateKey}-${half}`} className={`smt-task-cell ${statusClass(cell.status)}`}>
        <button
          type="button"
          className="smt-task-cell__btn"
          disabled={!clickable || busyId === cell.id}
          title={clickable ? "Click to mark Completed" : done ? "Already completed" : "Cancelled"}
          onClick={() => completeTask(cell)}
        >
          <span className="smt-task-cell__time">{cell.time_slot || "—"}</span>
          <span className="smt-task-cell__status">
            {busyId === cell.id ? "…" : cell.status || "Pending"}
          </span>
        </button>
      </td>
    );
  };

  return (
    <div className="smt-excel-preview">
      <div className="smt-excel-preview__head">
        <strong className="smt-excel-preview__name">
          {fileName || (isPdf ? "PDF plan" : "Weekly plan")}
        </strong>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="smt-excel-preview__link"
            onClick={load}
            disabled={loading || reparsing}
            style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            Refresh
          </button>
          {fileUrl ? (
            <button
              type="button"
              className="smt-excel-preview__link"
              onClick={reparseFile}
              disabled={loading || reparsing}
              style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
            >
              {reparsing ? "Parsing…" : "Re-parse file"}
            </button>
          ) : null}
          {fileUrl ? (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="smt-excel-preview__link">
              Open file
            </a>
          ) : null}
        </div>
      </div>

      {note ? <div className="smt-excel-preview__msg">{note}</div> : null}

      {loading ? (
        <div className="smt-excel-preview__msg">Loading plan table…</div>
      ) : error ? (
        <div className="smt-excel-preview__msg smt-excel-preview__msg--err">{error}</div>
      ) : !rows.length ? (
        <div className="smt-excel-preview__msg">
          No parsed tasks yet.
          {fileUrl ? (
            <>
              {" "}
              Click <strong>Re-parse file</strong> to build 1st/2nd half columns from the upload.
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="smt-excel-preview__msg" style={{ paddingTop: 0 }}>
            <strong>1st half (8AM–1PM)</strong> · <strong>2nd half (2PM–7PM)</strong> — click Pending to complete
            {dates.length ? ` · ${fmtDayHeader(dates[0])} → ${fmtDayHeader(dates[dates.length - 1])}` : ""}.
          </div>
          <div className="smt-excel-scroll smt-task-scroll">
            <table className="smt-task-sheet">
              <thead>
                <tr>
                  <th className="smt-task-sheet__sticky-sr" rowSpan={useHalves ? 2 : 1}>
                    SR
                  </th>
                  <th className="smt-task-sheet__sticky-name" rowSpan={useHalves ? 2 : 1}>
                    Task
                  </th>
                  {dates.map((d) => (
                    <th key={`d-${d}`} colSpan={useHalves ? 2 : 1} className="smt-task-sheet__day">
                      <div>{fmtDayHeader(d)}</div>
                      <div className="smt-task-sheet__weekday">{dayName(d)}</div>
                    </th>
                  ))}
                </tr>
                {useHalves ? (
                  <tr>
                    {dates.flatMap((d) => [
                      <th key={`${d}-h1`} className="smt-task-sheet__half">
                        1st half
                        <div className="smt-task-sheet__half-sub">8AM–1PM</div>
                      </th>,
                      <th key={`${d}-h2`} className="smt-task-sheet__half">
                        2nd half
                        <div className="smt-task-sheet__half-sub">2PM–7PM</div>
                      </th>,
                    ])}
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.sr_no}-${row.task_name}`}>
                    <td className="smt-task-sheet__sr smt-task-sheet__sticky-sr">{row.sr_no ?? "—"}</td>
                    <td className="smt-task-sheet__name smt-task-sheet__sticky-name">{row.task_name}</td>
                    {dates.flatMap((d) => {
                      const halves = row.cells[d] || {};
                      if (!useHalves) {
                        return [renderHalfCell(halves[0] || halves[1] || halves[2], d, 0)];
                      }
                      return [renderHalfCell(halves[1], d, 1), renderHalfCell(halves[2], d, 2)];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
