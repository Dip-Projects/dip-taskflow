import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "../../lib/supabase";
import { reportDateToISO } from "../../lib/wprDates";

function fmtDMonYYYY(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

function safePresentationUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

async function fetchAllWprReports() {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error: queryError } = await supabase
      .from("wpr_reports")
      .select("id, site_name, engineer_name, report_number, report_date, presentation_url, created_at")
      .order("report_date", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (queryError) throw queryError;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchWprEngineerNames() {
  const names = new Set();
  const pageSize = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error: queryError } = await supabase
      .from("wpr_reports")
      .select("engineer_name")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (queryError) throw queryError;
    (data || []).forEach((row) => {
      const name = String(row.engineer_name || "").trim();
      if (name) names.add(name);
    });
    if (!data || data.length < pageSize) break;
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

const cellStyle = { padding: "7px 8px", verticalAlign: "top" };

export default function WprReport() {
  // Draft filters: what the user is editing. Nothing is fetched until Generate.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employee, setEmployee] = useState("");

  const [engineers, setEngineers] = useState([]);
  // The last generated report. Null until the user clicks Generate.
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchWprEngineerNames()
      .then((names) => {
        if (alive) setEngineers(names);
      })
      .catch((err) => {
        if (alive) setError(err.message || "Could not load engineer list.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const rangeInvalid = Boolean(from && to && from > to);

  const generate = async (event) => {
    event?.preventDefault();
    if (rangeInvalid) return;
    setLoading(true);
    setError("");
    try {
      const rows = await fetchAllWprReports();
      setGenerated({ from, to, employee, reports: rows });
    } catch (loadError) {
      setError(loadError.message || "Could not load WPR submissions.");
      setGenerated(null);
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = useMemo(() => {
    if (!generated) return [];
    const range = generated;
    return generated.reports.filter((report) => {
      if (range.employee) {
        const name = String(report.engineer_name || "").trim();
        if (name !== range.employee) return false;
      }
      const date = reportDateToISO(report.report_date);
      if (!range.from && !range.to) return true;
      if (!date) return false;
      return (!range.from || date >= range.from) && (!range.to || date <= range.to);
    });
  }, [generated]);

  const latestReports = useMemo(() => {
    const latestBySiteAndDate = new Map();
    filteredReports.forEach((report) => {
      const site = String(report.site_name || "").trim().toLowerCase();
      const date = reportDateToISO(report.report_date) ||
        String(report.report_date || "").trim().toLowerCase();
      if (!site || !date) {
        latestBySiteAndDate.set(`row:${report.id}`, report);
        return;
      }

      const key = `${site}\u0000${date}`;
      const current = latestBySiteAndDate.get(key);
      const currentTime = Date.parse(current?.created_at || "") || 0;
      const reportTime = Date.parse(report.created_at || "") || 0;
      if (!current || reportTime > currentTime) {
        latestBySiteAndDate.set(key, report);
      }
    });
    return [...latestBySiteAndDate.values()];
  }, [filteredReports]);

  const groupedReports = useMemo(() => {
    const groups = new Map();
    latestReports.forEach((report) => {
      const engineerName = String(report.engineer_name || "—").trim() || "—";
      const siteName = String(report.site_name || "—").trim() || "—";
      const key = `${engineerName.toLowerCase()}\u0000${siteName.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, { engineerName, siteName, reports: [] });
      }
      groups.get(key).reports.push(report);
    });
    return [...groups.values()].sort(
      (a, b) =>
        a.engineerName.localeCompare(b.engineerName) ||
        a.siteName.localeCompare(b.siteName),
    );
  }, [latestReports]);

  const exportExcel = () => {
    const rows = groupedReports.map((group) => [
      group.engineerName,
      group.siteName,
      group.reports.length,
      group.reports.map((report) => report.report_date || "—").join("\n"),
      group.reports
        .map((report) => safePresentationUrl(report.presentation_url))
        .filter(Boolean)
        .join("\n"),
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Engineer Name", "Site Name", "Count", "Report Dates", "WPR URLs"],
      ...rows,
    ]);
    worksheet["!cols"] = [{ wch: 32 }, { wch: 32 }, { wch: 12 }, { wch: 24 }, { wch: 60 }];

    const border = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    };
    for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
      for (let column = 0; column < 5; column += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: column });
        const cell = worksheet[cellAddress] || { t: "s", v: "" };
        cell.s = rowIndex === 0
          ? {
              font: { bold: true, color: { rgb: "000000" }, sz: 12 },
              fill: { patternType: "solid", fgColor: { rgb: "BDD7EE" } },
              alignment: { horizontal: "center", vertical: "center" },
              border,
            }
          : {
              alignment: { horizontal: "center", vertical: "center", wrapText: true },
              border,
            };
        worksheet[cellAddress] = cell;
      }
    }
    worksheet["!rows"] = [{ hpt: 24 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "WPR Report");
    XLSX.writeFile(workbook, "WPR_Report.xlsx");
  };

  return (
    <div>
      <form onSubmit={generate} className="grid2" style={{ marginBottom: 20 }}>
        <div className="fgroup">
          <label className="flabel" htmlFor="wpr-from">From Date</label>
          <input
            id="wpr-from"
            type="date"
            className="finput"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="fgroup">
          <label className="flabel" htmlFor="wpr-to">To Date</label>
          <input
            id="wpr-to"
            type="date"
            className="finput"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="fgroup col2">
          <label className="flabel" htmlFor="wpr-engineer">Engineer</label>
          <select
            id="wpr-engineer"
            className="finput"
            value={employee}
            onChange={(event) => setEmployee(event.target.value)}
          >
            <option value="">All engineers</option>
            {engineers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="col2 act-row" style={{ marginTop: 0 }}>
          <button type="submit" className="btn btn-pri" disabled={loading || rangeInvalid}>
            {loading ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </form>

      {rangeInvalid && (
        <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>
          The start date must be on or before the end date.
        </div>
      )}
      {error && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {!generated && !loading && (
        <div className="empty-state">
          <div className="empty-title">No report generated yet</div>
          <div className="empty-sub">Choose the dates and engineer, then click Generate Report.</div>
        </div>
      )}

      {loading && <div className="empty-state"><div className="empty-title">Loading WPR submissions…</div></div>}

      {generated && !loading && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
              Duration: {generated.from ? fmtDMonYYYY(generated.from) : "All"} to {generated.to ? fmtDMonYYYY(generated.to) : "All"}
              {" · "}{groupedReports.length} row{groupedReports.length !== 1 ? "s" : ""}
            </div>
            <button
              type="button"
              className="btn btn-out"
              onClick={exportExcel}
              disabled={latestReports.length === 0}
            >
              Download Excel
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink2)", marginBottom: 12 }}>
            One row per engineer and site. Report dates list each WPR submitted in the duration.
          </div>

          {groupedReports.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No WPR records found</div>
              <div className="empty-sub">
                {generated.from || generated.to
                  ? "No WPR records found for this report date range."
                  : "No WPR records found."}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: "#1f4e79", color: "#fff" }}>
                    <th style={{ ...cellStyle, textAlign: "left" }}>Engineer Name</th>
                    <th style={{ ...cellStyle, textAlign: "left" }}>Site Name</th>
                    <th style={{ ...cellStyle, textAlign: "center" }}>Count</th>
                    <th style={{ ...cellStyle, textAlign: "center" }}>Report Date</th>
                    <th style={{ ...cellStyle, textAlign: "center" }}>WPR Link</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedReports.map((group) => (
                    <tr key={`${group.engineerName}-${group.siteName}`} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ ...cellStyle, fontWeight: 600 }}>{group.engineerName}</td>
                      <td style={cellStyle}>{group.siteName}</td>
                      <td style={{ ...cellStyle, textAlign: "center", fontWeight: 700 }}>{group.reports.length}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {group.reports.map((report) => (
                          <div key={report.id}>{fmtDMonYYYY(reportDateToISO(report.report_date))}</div>
                        ))}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {group.reports.map((report) => {
                          const url = safePresentationUrl(report.presentation_url);
                          return (
                            <div key={report.id}>
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #0563c1)", fontWeight: 600 }}>
                                  Open
                                </a>
                              ) : (
                                <span style={{ color: "var(--ink2)" }}>Not available</span>
                              )}
                            </div>
                          );
                        })}
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
