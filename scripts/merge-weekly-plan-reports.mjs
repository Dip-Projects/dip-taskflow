import fs from 'fs';

function replaceFunction(file, startRe, endRe, newBody) {
  let s = fs.readFileSync(file, 'utf8');
  const start = s.search(startRe);
  if (start < 0) throw new Error(`start not found in ${file}`);
  const after = s.slice(start + 1);
  const endRel = after.search(endRe);
  if (endRel < 0) throw new Error(`end not found in ${file}`);
  const end = start + 1 + endRel;
  const before = s.slice(0, start);
  const afterEnd = s.slice(end);
  s = before + newBody.trimEnd() + '\n\n' + afterEnd.replace(/^\r?\n*/, '');
  fs.writeFileSync(file, s);
  console.log('updated', file);
}

const siteFn = `function WeeklyPlanReport({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/ea-meeting/my");
      const items = Array.isArray(data?.items) ? data.items : [];
      const weekly = items
        .filter((row) => row?.plan_submitted_at && row?.source === "ea_meeting")
        .map((row) => ({
          id: row.ea_id || String(row.id || "").replace(/^ea:/, ""),
          week: row.meeting_week_start || row.target_date || "—",
          week_start: row.meeting_week_start || null,
          week_end: row.meeting_week_end || row.target_date || null,
          employee_name: row.employee_name || row.employee_username || "—",
          employee_username: row.employee_username || "—",
          employee_role: row.employee_role || row.priority || "—",
          site: row.employee_site_name || user?.site_name || "—",
          submitted_at: row.plan_submitted_at,
          file_1_name: row.attachment_1_name || "File 1",
          file_1_url: row.attachment_1_url || "",
          file_2_name: row.attachment_2_name || "File 2",
          file_2_url: row.attachment_2_url || "",
        }))
        .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
      setRows(weekly);
    } catch (err) {
      setError(err.message || "Could not load weekly plan submissions.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const weekOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!row.week_start) return;
      map.set(row.week_start, {
        value: row.week_start,
        label: formatWeekDate(row.week_start) + " to " + formatWeekDate(row.week_end || row.week_start),
      });
    });
    return [...map.values()].sort((a, b) => b.value.localeCompare(a.value));
  }, [rows]);

  const selectedRows = selectedWeek ? rows.filter((row) => row.week_start === selectedWeek) : [];

  const fmt = (ts) => {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="smt-page smt-page--wide">
      <div className="smt-head">
        <div>
          <h1 className="smt-title">Weekly Plan</h1>
          <p className="smt-sub">
            Submitted weekly EM plan files for your site and your own uploads. The table matches the uploaded Excel; click a plan cell to mark it completed.
          </p>
        </div>
        <button type="button" className="smt-refresh" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <div className="smt-error">{error}</div> : null}

      <div className="fgroup" style={{ maxWidth: 360, marginBottom: 18 }}>
        <label className="flabel">Week</label>
        <select className="finput" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
          <option value="">Select week</option>
          {weekOptions.map((week) => (
            <option key={week.value} value={week.value}>{week.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="smt-empty">Loading weekly plan submissions…</div>
      ) : rows.length === 0 ? (
        <div className="smt-empty">No submitted weekly plans yet for this site.</div>
      ) : !selectedWeek ? (
        <div className="smt-empty">Select a week to view the weekly plan.</div>
      ) : selectedRows.length === 0 ? (
        <div className="smt-empty">No submitted weekly plans found for this week.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", minWidth: 0 }}>
          {selectedRows.map((r) => (
            <div key={r.id} className="smt-excel-card">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>Week: <strong>{r.week}</strong></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{r.employee_name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{r.employee_role} · {r.site}</div>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Submitted {fmt(r.submitted_at)}</div>
              </div>

              {r.file_1_url ? (
                <WeeklyPlanAttachmentPreview
                  eaId={r.id}
                  sourceFile="attachment_1"
                  fileUrl={r.file_1_url}
                  fileName={r.file_1_name}
                  weekStart={r.week_start}
                  weekEnd={r.week_end}
                />
              ) : null}

              {r.file_2_url ? (
                <div style={{ marginTop: 16 }}>
                  <WeeklyPlanAttachmentPreview
                    eaId={r.id}
                    sourceFile="attachment_2"
                    fileUrl={r.file_2_url}
                    fileName={r.file_2_name}
                    weekStart={r.week_start}
                    weekEnd={r.week_end}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`;

replaceFunction(
  'frontend/src/pages/site/SitePortal.jsx',
  /^function WeeklyPlanReport\(\{ user \}\)/m,
  /^export function mergeRejectionReason/m,
  siteFn
);

let site = fs.readFileSync('frontend/src/pages/site/SitePortal.jsx', 'utf8');
if (!site.includes('formatWeekDate')) {
  site = site.replace(
    "import { WeeklyPlanAttachmentPreview } from '../../components/WeeklyPlanAttachmentPreview';",
    "import { WeeklyPlanAttachmentPreview } from '../../components/WeeklyPlanAttachmentPreview';\nimport { formatWeekDate } from '../../lib/weeklyPlanPreview';"
  );
  fs.writeFileSync('frontend/src/pages/site/SitePortal.jsx', site);
  console.log('added formatWeekDate import to SitePortal');
}

const mdoFn = `function WeeklyPlanReportMdo({ user, sites }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [engineerKey, setEngineerKey] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("/ea-meeting/my");
      const items = Array.isArray(data?.items) ? data.items : [];
      const weekly = items
        .filter((row) => row?.plan_submitted_at && row?.source === "ea_meeting")
        .map((row) => ({
          id: row.ea_id || String(row.id || "").replace(/^ea:/, ""),
          week: row.meeting_week_start || row.target_date || "—",
          week_start: row.meeting_week_start || null,
          week_end: row.meeting_week_end || row.target_date || null,
          employee_name: row.employee_name || row.employee_username || "—",
          employee_username: row.employee_username || "—",
          employee_role: row.employee_role || row.priority || "—",
          site: row.employee_site_name || user?.site_name || "—",
          submitted_at: row.plan_submitted_at,
          file_1_name: row.attachment_1_name || "File 1",
          file_1_url: row.attachment_1_url || "",
          file_2_name: row.attachment_2_name || "File 2",
          file_2_url: row.attachment_2_url || "",
        }))
        .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
      setRows(weekly);
    } catch (err) {
      setError(err.message || "Could not load weekly plan submissions.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const engineerOptions = useMemo(() => {
    const map = new Map();
    (rows || []).forEach((row) => {
      const name = String(row.employee_name || "").trim();
      const username = String(row.employee_username || "").trim();
      const key = normKey(username) || normKey(name);
      if (!key) return;
      if (!map.has(key)) map.set(key, { key, name: name || username, username });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const weekOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!engineerKey) return;
      const key = normKey(engineerKey);
      const same =
        normKey(row.employee_username) === key || normKey(row.employee_name) === key;
      if (!same || !row.week_start) return;
      map.set(row.week_start, {
        value: row.week_start,
        label: formatWeekDate(row.week_start) + " to " + formatWeekDate(row.week_end || row.week_start),
      });
    });
    return [...map.values()].sort((a, b) => b.value.localeCompare(a.value));
  }, [engineerKey, rows]);

  const selectedRows = useMemo(() => {
    if (!engineerKey || !selectedWeek) return [];
    return rows.filter((row) => {
      const key = normKey(engineerKey);
      const sameEngineer =
        normKey(row.employee_username) === key || normKey(row.employee_name) === key;
      return sameEngineer && row.week_start === selectedWeek;
    });
  }, [engineerKey, rows, selectedWeek]);

  const fmt = (ts) => {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="smt-page smt-page--wide">
      <div className="smt-head">
        <div>
          <h1 className="smt-title">Weekly Plan</h1>
          <p className="smt-sub">Select an engineer and week to load the submitted weekly sheet.</p>
        </div>
        <button type="button" className="smt-refresh" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div className="fgroup" style={{ maxWidth: 280, flex: "1 1 220px" }}>
          <label className="flabel">Engineer</label>
          <select
            className="finput"
            value={engineerKey}
            onChange={(e) => {
              setEngineerKey(e.target.value);
              setSelectedWeek("");
            }}
          >
            <option value="">Select engineer</option>
            {engineerOptions.map((eng) => (
              <option key={eng.key} value={eng.key}>{eng.name}</option>
            ))}
          </select>
        </div>
        <div className="fgroup" style={{ maxWidth: 320, flex: "1 1 220px" }}>
          <label className="flabel">Week</label>
          <select
            className="finput"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            disabled={!engineerKey}
          >
            <option value="">Select week</option>
            {weekOptions.map((week) => (
              <option key={week.value} value={week.value}>{week.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="smt-error">{error}</div> : null}

      {loading ? (
        <div className="smt-empty">Loading weekly plan submissions…</div>
      ) : !engineerKey ? (
        <div className="smt-empty">Select an engineer from the filter to load the weekly plan sheet.</div>
      ) : !selectedWeek ? (
        <div className="smt-empty">Select a week to view the weekly plan.</div>
      ) : selectedRows.length === 0 ? (
        <div className="smt-empty">No submitted weekly plans found for this engineer/week.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", minWidth: 0 }}>
          {selectedRows.map((r) => (
            <div key={r.id} className="smt-excel-card">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>Week: <strong>{r.week}</strong></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{r.employee_name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{r.employee_role} · {r.site}</div>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Submitted {fmt(r.submitted_at)}</div>
              </div>

              {r.file_1_url ? (
                <WeeklyPlanAttachmentPreview
                  eaId={r.id}
                  sourceFile="attachment_1"
                  fileUrl={r.file_1_url}
                  fileName={r.file_1_name}
                  weekStart={r.week_start}
                  weekEnd={r.week_end}
                />
              ) : null}
              {r.file_2_url ? (
                <div style={{ marginTop: 16 }}>
                  <WeeklyPlanAttachmentPreview
                    eaId={r.id}
                    sourceFile="attachment_2"
                    fileUrl={r.file_2_url}
                    fileName={r.file_2_name}
                    weekStart={r.week_start}
                    weekEnd={r.week_end}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`;

replaceFunction(
  'frontend/src/pages/mdo/MDOPortal.jsx',
  /^function WeeklyPlanReportMdo\(\{ user, sites \}\)/m,
  /^\/\/ MAIN MDO PORTAL/m,
  mdoFn
);

let mdo = fs.readFileSync('frontend/src/pages/mdo/MDOPortal.jsx', 'utf8');
if (!mdo.includes('formatWeekDate')) {
  mdo = mdo.replace(
    'import { WeeklyPlanAttachmentPreview } from "../../components/WeeklyPlanAttachmentPreview";',
    'import { WeeklyPlanAttachmentPreview } from "../../components/WeeklyPlanAttachmentPreview";\nimport { formatWeekDate } from "../../lib/weeklyPlanPreview";'
  );
  fs.writeFileSync('frontend/src/pages/mdo/MDOPortal.jsx', mdo);
  console.log('added formatWeekDate import to MDOPortal');
}

console.log('done');
