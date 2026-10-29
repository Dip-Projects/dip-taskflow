import { useEffect, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { api } from "../../lib/api";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function monthStartIst() {
  return `${todayIst().slice(0, 8)}01`;
}

function fmtDMonYYYY(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`;
}

export default function SvrReport() {
  // Draft filters: what the user is editing. Nothing is fetched until Generate.
  const [from, setFrom] = useState(monthStartIst);
  const [to, setTo] = useState(todayIst);
  const [employee, setEmployee] = useState("");

  const [employees, setEmployees] = useState([]);
  // The last generated report. Null until the user clicks Generate.
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api("/svr-report/engineers")
      .then((data) => {
        if (!alive) return;
        setEmployees(Array.isArray(data?.employees) ? data.employees : []);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Could not load engineer list");
      });
    return () => {
      alive = false;
    };
  }, []);

  const generate = async (e) => {
    e?.preventDefault();
    if (from && to && from > to) {
      setError("'From' date must be on or before 'To' date.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      if (employee) q.set("employee", employee);
      const data = await api(`/svr-report?${q}`);
      setReport({
        from,
        to,
        employee,
        rows: Array.isArray(data?.rows) ? data.rows : [],
      });
    } catch (err) {
      setError(err.message || "Could not generate SVR report");
      setReport(null);
    } finally {
      setBusy(false);
    }
  };

  const downloadExcel = () => {
    if (!report) return;
    const header = ["Engineer Name", "Visited Site", "Date of Visit", "Designation", "Report"];
    const data = report.rows.map((r) => [
      r.engineer || "—",
      r.site || "—",
      r.visit_date || "",
      r.designation || "",
      r.pdf_url ? "View report" : "—",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

    // Make the "Report" column clickable in Excel.
    report.rows.forEach((r, i) => {
      if (!r.pdf_url) return;
      const ref = XLSX.utils.encode_cell({ r: i + 1, c: 4 });
      ws[ref].l = { Target: r.pdf_url, Tooltip: "Open SVR report" };
    });

    ws["!cols"] = [{ wch: 24 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SVR Report");
    const safeEmp = report.employee ? report.employee.replace(/[^\w-]+/g, "_") : "all";
    XLSX.writeFile(wb, `SVR_Report_${safeEmp}_${report.from || "all"}_to_${report.to || "all"}.xlsx`);
  };

  const rows = report?.rows || [];

  // Keep the selected engineer visible even if the list did not load it.
  const engineerOptions =
    employee && !employees.includes(employee) ? [...employees, employee].sort() : employees;

  return (
    <div>
      <form onSubmit={generate} className="grid2" style={{ marginBottom: 20 }}>
        <div className="fgroup">
          <label className="flabel" htmlFor="svr-from">From Date <span className="req">*</span></label>
          <input
            id="svr-from"
            type="date"
            className="finput"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="fgroup">
          <label className="flabel" htmlFor="svr-to">To Date <span className="req">*</span></label>
          <input
            id="svr-to"
            type="date"
            className="finput"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="fgroup col2">
          <label className="flabel" htmlFor="svr-engineer">Engineer</label>
          <select
            id="svr-engineer"
            className="finput"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
          >
            <option value="">All engineers</option>
            {engineerOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="col2 act-row" style={{ marginTop: 0 }}>
          <button type="submit" className="btn btn-pri" disabled={!from || !to || busy}>
            {busy ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </form>

      {error && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {!report && !busy && (
        <div className="empty-state">
          <div className="empty-title">No report generated yet</div>
          <div className="empty-sub">Choose the date range and engineer, then click Generate Report.</div>
        </div>
      )}

      {report && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
              Duration: {fmtDMonYYYY(report.from)} to {fmtDMonYYYY(report.to)} · {rows.length} report{rows.length !== 1 ? "s" : ""}
            </div>
            <button
              type="button"
              className="btn btn-out"
              onClick={downloadExcel}
              disabled={!rows.length}
              title="All reports on one sheet"
            >
              Download Excel
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink2)", marginBottom: 12 }}>
            Site Visit Reports submitted by site engineers. Use "View report" to open the PDF.
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No reports found</div>
              <div className="empty-sub">No site visit reports match the selected dates or engineer.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#1f4e79", color: "#fff" }}>
                    <th style={{ padding: "8px 8px", textAlign: "center", width: 48 }}>#</th>
                    <th style={{ padding: "8px 8px", textAlign: "left" }}>Engineer Name</th>
                    <th style={{ padding: "8px 8px", textAlign: "left" }}>Visited Site</th>
                    <th style={{ padding: "8px 8px", textAlign: "center" }}>Date of Visit</th>
                    <th style={{ padding: "8px 8px", textAlign: "center" }}>Report</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>{i + 1}</td>
                      <td style={{ padding: "7px 8px", textAlign: "left", fontWeight: 600 }}>
                        {r.engineer || "—"}
                        {r.designation ? (
                          <div style={{ color: "var(--ink2)", fontSize: 11, fontWeight: 400 }}>{r.designation}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: "7px 8px", textAlign: "left" }}>{r.site || "—"}</td>
                      <td style={{ padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{fmtDMonYYYY(r.visit_date)}</td>
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        {r.pdf_url ? (
                          <a href={r.pdf_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue, #0563c1)", fontWeight: 600 }}>
                            View report
                          </a>
                        ) : (
                          <span style={{ color: "var(--ink2)" }}>Not available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
