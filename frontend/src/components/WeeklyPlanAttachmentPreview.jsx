import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  loadExcelSheetFromBuffer,
  omitStatusHeaderColumns,
  sheetHasContent,
} from "../lib/excelSheetPreview";
import {
  buildSheetTaskIndex,
  findDateForSheetColumn,
  findHalfForSheetColumn,
  findTaskForSheetCell,
  getCellStatusText,
  hasHalfPlanningLayout,
  isActionablePlanCell,
} from "../lib/weeklyPlanPreview";
import { parseWeeklyPlanBuffer } from "../lib/weeklyPlanExcel";
import { parseWeeklyPlanPdfBuffer } from "../lib/weeklyPlanPdf";
import { ExcelSheetTable } from "./ExcelSheetTable";

function isPdfAttachment(fileName, fileUrl) {
  const lower = String(fileName || fileUrl || "").toLowerCase();
  return lower.includes(".pdf") || lower.endsWith("pdf");
}

function statusClass(status) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "completed" || s === "complete" || s === "done") return "smt-excel-sheet__cell--done";
  if (s === "cancelled" || s === "canceled") return "smt-excel-sheet__cell--cancel";
  return "smt-excel-sheet__cell--pending";
}

function normalizeStatusLabel(status) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "completed" || s === "complete" || s === "done") return "Completed";
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  return "Pending";
}

function cellBusyKey(rowIdx, colIdx) {
  return `cell-${rowIdx}-${colIdx}`;
}

function preparePreviewSheet(sheet) {
  return omitStatusHeaderColumns(sheet || { matrix: [], merges: [], colWidths: [] });
}

function sheetCellText(matrix, r, c) {
  const cell = matrix?.[r]?.[c];
  if (cell == null) return "";
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  }
  if (typeof cell === "object") {
    const display = String(cell.display ?? "").trim();
    if (/GMT[+-]\d{4}/i.test(display) || /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.+\d{4}/i.test(display)) {
      const d = new Date(display);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
      }
    }
    return display;
  }
  return String(cell).trim();
}

function countActionableCells(matrix) {
  if (!Array.isArray(matrix)) return 0;
  let n = 0;
  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      if (isActionablePlanCell(matrix, r, c, sheetCellText(matrix, r, c))) n += 1;
    }
  }
  return n;
}

/**
 * Shows the submitted weekly-plan Excel as a same-layout sheet.
 * Each actionable cell is linked 1:1 to a saved weekly_plan_tasks row.
 * Click Pending/Completed always ensures a saved task first (ingest if needed).
 */
export function WeeklyPlanAttachmentPreview({
  eaId,
  sourceFile,
  fileUrl,
  fileName,
}) {
  const isPdf = isPdfAttachment(fileName, fileUrl);
  const [sheet, setSheet] = useState({ matrix: [], merges: [], colWidths: [] });
  const [tasks, setTasks] = useState([]);
  const [parsedTasks, setParsedTasks] = useState([]);
  const [loading, setLoading] = useState(Boolean(fileUrl || eaId));
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waNote, setWaNote] = useState("");
  const [fromPdf, setFromPdf] = useState(false);
  const [cellStatus, setCellStatus] = useState(() => ({}));
  const cancelledRef = useRef(false);
  const tasksRef = useRef([]);
  const parsedRef = useRef([]);
  const sheetRef = useRef({ matrix: [], merges: [], colWidths: [] });
  const indexRef = useRef(new Map());

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  useEffect(() => {
    parsedRef.current = parsedTasks;
  }, [parsedTasks]);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  const cellTaskIndex = useMemo(
    () => buildSheetTaskIndex(sheet.matrix, tasks),
    [sheet.matrix, tasks]
  );
  useEffect(() => {
    indexRef.current = cellTaskIndex;
  }, [cellTaskIndex]);

  const layoutHint = useMemo(
    () => (hasHalfPlanningLayout(sheet.matrix) ? "half" : "daily"),
    [sheet.matrix]
  );

  const linkedCount = cellTaskIndex.size;
  const actionableCount = useMemo(
    () => countActionableCells(sheet.matrix),
    [sheet.matrix]
  );

  const loadTasks = useCallback(async () => {
    if (!eaId) return [];
    const qs = sourceFile ? `?source=${encodeURIComponent(sourceFile)}` : "";
    const data = await api(`/ea-meeting/${eaId}/tasks${qs}`);
    const listed = Array.isArray(data?.tasks) ? data.tasks : [];
    if (listed.length || !sourceFile) return listed;
    const fallback = await api(`/ea-meeting/${eaId}/tasks`);
    return Array.isArray(fallback?.tasks) ? fallback.tasks : [];
  }, [eaId, sourceFile]);

  const ingestParsed = useCallback(
    async (parsed) => {
      if (!eaId || !parsed?.tasks?.length) return loadTasks();
      const result = await api(`/ea-meeting/${eaId}/ingest`, {
        method: "POST",
        body: {
          clientParsed: [
            {
              source_file: sourceFile || "attachment_1",
              tasks: parsed.tasks.slice(0, 400),
              meta: parsed.meta || null,
            },
          ],
        },
      });
      if (!result?.ok && !Number(result?.inserted) && result?.error) {
        throw new Error(
          result?.note || result?.error || "Could not save weekly-plan tasks."
        );
      }
      return loadTasks();
    },
    [eaId, loadTasks, sourceFile]
  );

  const sendWhatsAppList = useCallback(async () => {
    if (!eaId || waSending) return;
    setWaSending(true);
    setWaNote("");
    try {
      // Ensure cells are saved before messaging
      const parsed = parsedRef.current;
      if (parsed?.length) {
        try {
          const refreshed = await ingestParsed({ tasks: parsed });
          setTasks(refreshed);
        } catch (ingErr) {
          setWaNote(ingErr.message || "Could not save tasks before WhatsApp");
        }
      }

      // Pass the same client parse the grid uses so server ingest cannot overwrite with a divergent parse.
      const srcKey = sourceFile || "attachment_1";
      const data = await api(`/ea-meeting/${eaId}/send-day-list`, {
        method: "POST",
        body: {
          clientParsed: parsed?.length
            ? [{ source_file: srcKey, key: srcKey, tasks: parsed.slice(0, 400) }]
            : undefined,
        },
      });
      if (data?.ok) {
        setWaNote(
          data?.note ||
            `WhatsApp sent (${data?.whatsapp?.via || "ok"}) · ${data?.openCount ?? 0} open · to ${data?.to || "?"}`
        );
      } else {
        const wa = data?.whatsapp || {};
        setWaNote(
          data?.error ||
            data?.note ||
            wa?.templateError?.error ||
            wa?.textError?.error ||
            wa?.reason ||
            wa?.error ||
            "Could not send WhatsApp list"
        );
      }
    } catch (err) {
      setWaNote(err.message || "Could not send WhatsApp list");
    } finally {
      setWaSending(false);
    }
  }, [eaId, ingestParsed, sourceFile, waSending]);

  const load = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    setError("");
    setNote("");
    setFromPdf(false);
    setCellStatus({});
    try {
      const dbTasksPromise = loadTasks().catch(() => []);
      const [dbTasks, fileRes] = await Promise.all([
        dbTasksPromise,
        fileUrl ? fetch(fileUrl) : Promise.resolve(null),
      ]);
      if (cancelledRef.current) return;

      let nextSheet = { matrix: [], merges: [], colWidths: [] };
      let parsed = null;
      let convertedFromPdf = false;

      if (fileRes) {
        if (!fileRes.ok) throw new Error("Could not download plan file");
        const buf = await fileRes.arrayBuffer();
        if (cancelledRef.current) return;

        if (isPdf) {
          const pdfParsed = await parseWeeklyPlanPdfBuffer(buf);
          if (cancelledRef.current) return;
          convertedFromPdf = true;
          if (sheetHasContent(pdfParsed?.sheet)) {
            nextSheet = preparePreviewSheet(pdfParsed.sheet);
          } else if (pdfParsed?.excelBuffer) {
            try {
              nextSheet = preparePreviewSheet(
                await loadExcelSheetFromBuffer(
                  pdfParsed.excelBuffer,
                  "weekly-plan-from-pdf.xlsx"
                )
              );
            } catch {
              nextSheet = { matrix: [], merges: [], colWidths: [] };
            }
          }
          parsed = pdfParsed;
          if (!sheetHasContent(nextSheet) && !pdfParsed?.tasks?.length) {
            throw new Error(
              pdfParsed?.meta?.error
                ? `Could not convert PDF to Excel preview (${pdfParsed.meta.error}).`
                : "Could not convert this PDF into an Excel weekly-plan preview."
            );
          }
        } else {
          nextSheet = preparePreviewSheet(await loadExcelSheetFromBuffer(buf, fileName));
          try {
            parsed = parseWeeklyPlanBuffer(buf);
          } catch {
            parsed = null;
          }
        }
      }

      setFromPdf(convertedFromPdf);
      setSheet(nextSheet);
      setParsedTasks(Array.isArray(parsed?.tasks) ? parsed.tasks : []);

      let nextTasks = Array.isArray(dbTasks) ? dbTasks : [];
      // Always try ingest when we have a fresh parse — fills missing cells without wiping status.
      if (parsed?.tasks?.length) {
        try {
          nextTasks = await ingestParsed(parsed);
        } catch (err) {
          if (!cancelledRef.current) {
            setNote(err.message || "Could not save weekly-plan tasks for click-to-complete.");
          }
        }
      }

      if (!cancelledRef.current) {
        setTasks(nextTasks);
        const linked = buildSheetTaskIndex(nextSheet.matrix, nextTasks).size;
        const actionable = countActionableCells(nextSheet.matrix);
        if (actionable > 0 && linked === 0 && nextTasks.length > 0) {
          setNote(
            "Saved tasks did not match this sheet layout. Click Pending on a cell to create the missing link."
          );
        }
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err.message || "Could not load weekly plan file.");
        setSheet({ matrix: [], merges: [], colWidths: [] });
        setTasks([]);
        setFromPdf(false);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [fileName, fileUrl, ingestParsed, isPdf, loadTasks]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const setTaskStatus = async (task, nextStatus, busyKey) => {
    const wanted = nextStatus === "Pending" ? "Pending" : "Completed";
    if (!task?.id) return;
    if (normalizeStatusLabel(task.status) === "Cancelled") return;
    if (normalizeStatusLabel(task.status) === wanted) {
      if (busyKey) setCellStatus((prev) => ({ ...prev, [busyKey]: wanted }));
      setBusyId("");
      return;
    }

    if (busyKey) setBusyId(busyKey);
    setNote("");
    if (busyKey) setCellStatus((prev) => ({ ...prev, [busyKey]: wanted }));

    const at = new Date().toISOString();
    const taskId = String(task.id);
    const previous = { ...task };
    const optimistic =
      wanted === "Completed"
        ? { status: "Completed", completed_at: at, completed_via: "portal" }
        : { status: "Pending", completed_at: null, completed_via: null };

    setTasks((prev) =>
      prev.map((row) => (String(row.id) === taskId ? { ...row, ...optimistic } : row))
    );

    try {
      const result = await api(`/ea-meeting/tasks/${encodeURIComponent(taskId)}/status`, {
        method: "PATCH",
        body: { status: wanted },
      });
      const refreshed = await loadTasks().catch(() => []);
      setTasks((prev) => {
        const base = refreshed.length ? refreshed : prev;
        return base.map((row) => {
          if (String(row.id) !== taskId) return row;
          return { ...row, ...(result?.task || {}), status: wanted };
        });
      });
      if (busyKey) setCellStatus((prev) => ({ ...prev, [busyKey]: wanted }));
    } catch (err) {
      setTasks((prev) =>
        prev.map((row) => (String(row.id) === taskId ? previous : row))
      );
      if (busyKey) {
        setCellStatus((prev) => {
          const next = { ...prev };
          delete next[busyKey];
          return next;
        });
      }
      setNote(err.message || `Could not mark task ${wanted}.`);
      throw err;
    } finally {
      setBusyId("");
    }
  };

  const resolveTaskForCell = async (rowIdx, colIdx) => {
    const matrix = sheetRef.current.matrix;
    const key = `${rowIdx}:${colIdx}`;
    let task = indexRef.current.get(key) || null;
    if (task?.id) return task;

    const cellText = sheetCellText(matrix, rowIdx, colIdx);
    const rowTaskName =
      sheetCellText(matrix, rowIdx, 1) || sheetCellText(matrix, rowIdx, 0);
    const srRaw = sheetCellText(matrix, rowIdx, 0);
    const srNo = /^\d+$/.test(srRaw) ? Number(srRaw) : null;
    const taskDate = findDateForSheetColumn(matrix, colIdx);
    const half = findHalfForSheetColumn(matrix, colIdx);

    const rebuild = (list) => {
      const next = buildSheetTaskIndex(matrix, list);
      indexRef.current = next;
      return next.get(key) || findTaskForSheetCell(list, {
        cellText,
        rowTaskName,
        taskDate,
        half,
        colIdx,
        rowIdx,
        matrix,
      });
    };

    // 1) Ingest full parse (deduped) then rematch.
    const parsed = parsedRef.current;
    if (parsed.length) {
      const refreshed = await ingestParsed({ tasks: parsed });
      setTasks(refreshed);
      task = rebuild(refreshed);
      if (task?.id) return task;
    } else {
      const refreshed = await loadTasks();
      setTasks(refreshed);
      task = rebuild(refreshed);
      if (task?.id) return task;
    }

    // 2) Create exactly this cell as a saved task, then rematch.
    if (!taskDate || !rowTaskName || !cellText) return null;
    const synthetic = {
      task_date: taskDate,
      task_name: rowTaskName,
      time_slot: cellText,
      status: "Pending",
      sr_no: srNo,
      half: half || 0,
    };
    const after = await ingestParsed({ tasks: [synthetic, ...parsed] });
    setTasks(after);
    return rebuild(after);
  };

  const completeCell = async (rowIdx, colIdx) => {
    const busyKey = cellBusyKey(rowIdx, colIdx);
    if (!eaId) {
      setNote("Missing EM attendance id — cannot update task status.");
      return;
    }

    setBusyId(busyKey);
    setNote("");

    try {
      const task = await resolveTaskForCell(rowIdx, colIdx);
      if (!task?.id) {
        throw new Error(
          "Could not save a task for this cell. Re-upload the weekly plan, then try again."
        );
      }

      const live =
        tasksRef.current.find((row) => String(row.id) === String(task.id)) || task;
      const done = normalizeStatusLabel(live.status) === "Completed";
      await setTaskStatus(live, done ? "Pending" : "Completed", busyKey);
    } catch (err) {
      setNote(err.message || "Could not complete task.");
      setBusyId("");
    }
  };

  const renderCell = ({ style, rowIdx, colIdx }) => {
    const text = style.display || "";
    if (!isActionablePlanCell(sheet.matrix, rowIdx, colIdx, text)) {
      return text;
    }

    const busyKey = cellBusyKey(rowIdx, colIdx);
    const task = cellTaskIndex.get(`${rowIdx}:${colIdx}`) || null;
    const status = cellStatus[busyKey] || (task ? getCellStatusText(task) : "Pending");
    const statusCss = statusClass(status);
    const done = statusCss === "smt-excel-sheet__cell--done";
    const cancelled = statusCss === "smt-excel-sheet__cell--cancel";
    // Clickable even before link — click will ingest/create then toggle.
    const clickable = Boolean(eaId) && !cancelled;
    const busy = busyId === busyKey;

    return (
      <div className={`smt-excel-sheet__plan ${statusCss}`}>
        <div className="smt-excel-sheet__text">{text}</div>
        <button
          type="button"
          className={`smt-excel-sheet__status-btn ${statusCss}`}
          disabled={!clickable || busy}
          title={
            cancelled
              ? "Cancelled"
              : !task?.id
                ? "Click to save & complete this plan cell"
                : done
                  ? "Click Completed to mark Pending"
                  : "Click Pending to mark Completed"
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!clickable || busyId) return;
            completeCell(rowIdx, colIdx);
          }}
        >
          {busy ? "…" : done ? "Completed" : cancelled ? "Cancelled" : "Pending"}
        </button>
      </div>
    );
  };

  const hasSheet = sheetHasContent(sheet);

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
            disabled={loading}
            style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            Refresh
          </button>
          {eaId ? (
            <button
              type="button"
              className="smt-excel-preview__link"
              onClick={sendWhatsAppList}
              disabled={waSending || loading}
              style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: "#128C7E" }}
              title="Send today's open tasks + pending earlier days to WhatsApp"
            >
              {waSending ? "Sending WhatsApp…" : "Send WhatsApp list"}
            </button>
          ) : null}
          {fileUrl ? (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="smt-excel-preview__link">
              Open file
            </a>
          ) : null}
        </div>
      </div>

      {waNote ? (
        <div
          className="smt-excel-preview__msg"
          style={{ color: waNote.includes("sent") ? "#166534" : "#9a3412" }}
        >
          {waNote}
        </div>
      ) : null}

      {note ? <div className="smt-excel-preview__msg smt-excel-preview__msg--err">{note}</div> : null}

      {loading ? (
        <div className="smt-excel-preview__msg">
          {isPdf ? "Converting PDF to Excel preview…" : "Loading spreadsheet preview…"}
        </div>
      ) : error ? (
        <div className="smt-excel-preview__msg smt-excel-preview__msg--err">{error}</div>
      ) : !hasSheet ? (
        <div className="smt-excel-preview__msg">
          {fileUrl
            ? isPdf
              ? "Could not convert this PDF into an Excel weekly-plan preview. Open the original PDF instead."
              : "Could not read this file as a spreadsheet."
            : "No weekly plan file attached."}
        </div>
      ) : (
        <>
          <div className="smt-excel-preview__msg" style={{ paddingTop: 0 }}>
            {fromPdf ? "Rebuilt from PDF · " : ""}
            {layoutHint === "half"
              ? "Type 2 · click Pending on 1st/2nd half planning task cells"
              : "Type 1 · click Pending on plan cells"}
            {eaId
              ? ` · ${linkedCount}/${actionableCount} cells linked · ${tasks.length} saved tasks`
              : ""}
          </div>
          <div className="smt-excel-scroll smt-task-scroll">
            <ExcelSheetTable
              matrix={sheet.matrix}
              merges={sheet.merges}
              colWidths={sheet.colWidths}
              renderCell={renderCell}
            />
          </div>
        </>
      )}
    </div>
  );
}
