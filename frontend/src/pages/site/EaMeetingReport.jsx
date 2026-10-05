import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./SiteMyTasks.css";

function weekStartDefault() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + mondayOffset);
  return monday.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return String(ts);
  }
}

export default function EaMeetingReport() {
  const [from, setFrom] = useState(weekStartDefault);
  const [to, setTo] = useState(() => {
    const d = new Date(`${weekStartDefault()}T12:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const data = await api(`/ea-meeting/report?${q}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || "Could not load EA report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadCsv = () => {
    const header = [
      "Week start",
      "Week end",
      "Scanned at",
      "Name",
      "Username",
      "Role",
      "Site",
      "Status",
      "Plan uploaded",
      "File 1",
      "File 1 URL",
      "File 2",
      "File 2 URL",
    ];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const cells = [
        r.week_start,
        r.week_end,
        r.scanned_at,
        r.employee_name,
        r.employee_username,
        r.employee_role,
        r.site,
        r.status,
        r.plan_uploaded ? "Yes" : "No",
        r.file_1,
        r.file_1_url,
        r.file_2,
        r.file_2_url,
      ].map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ea-meeting-attendance_${from || "all"}_${to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="smt-page">
      <div className="smt-head">
        <div>
          <h1 className="smt-title">EA Meeting Attendance</h1>
          <p className="smt-sub">
            Beena / Process Controller — Site Engineer present + plan uploads (jaise attendance report).
          </p>
        </div>
        <button type="button" className="smt-refresh" onClick={downloadCsv} disabled={!rows.length}>
          Download CSV
        </button>
      </div>

      <div className="smt-tabs" style={{ flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 650 }}>
          From{" "}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 650 }}>
          To{" "}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="smt-refresh" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <div className="smt-error">{error}</div> : null}

      {loading ? (
        <div className="smt-empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="smt-empty">Is range mein koi EA attendance nahi.</div>
      ) : (
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th>Week</th>
                <th>Scanned</th>
                <th>Name</th>
                <th>Site</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.week_start}
                    {r.week_end ? ` → ${r.week_end}` : ""}
                  </td>
                  <td>{fmt(r.scanned_at)}</td>
                  <td>
                    <strong>{r.employee_name || "—"}</strong>
                    <div style={{ color: "#6b635b", fontSize: 11 }}>
                      {r.employee_role || r.employee_username || ""}
                    </div>
                  </td>
                  <td>{r.site || "—"}</td>
                  <td>{r.status || "present"}</td>
                  <td>{r.plan_uploaded ? "Uploaded" : "Pending"}</td>
                  <td>
                    {r.file_1_url ? (
                      <a href={r.file_1_url} target="_blank" rel="noreferrer">
                        {r.file_1 || "File 1"}
                      </a>
                    ) : (
                      "—"
                    )}
                    {r.file_2_url ? (
                      <>
                        {" · "}
                        <a href={r.file_2_url} target="_blank" rel="noreferrer">
                          {r.file_2 || "File 2"}
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
