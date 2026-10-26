import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "../../lib/supabase";

function reportDateToISO(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const dayFirstMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirstMatch) {
    return `${dayFirstMatch[3]}-${dayFirstMatch[2].padStart(2, "0")}-${dayFirstMatch[1].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
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

export default function WprReport() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setError("");
      try {
        const rows = [];
        const pageSize = 1000;
        for (let page = 0; ; page += 1) {
          let query = supabase
            .from("wpr_reports")
            .select("id, site_name, engineer_name, report_number, report_date, presentation_url, created_at")
            .order("report_date", { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
          const { data, error: queryError } = await query;
          if (queryError) throw queryError;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        if (!cancelled) setReports(rows);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load WPR submissions.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReports();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredReports = useMemo(() => {
    if (from && to && from > to) return [];
    return reports.filter((report) => {
      const date = reportDateToISO(report.report_date);
      if (!from && !to) return true;
      if (!date) return false;
      return (!from || date >= from) && (!to || date <= to);
    });
  }, [reports, from, to]);

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
    <section style={{ color: "var(--ink, #1f2937)" }}>
      <div style={{ marginBottom: 16, color: "var(--ink3, #64748b)", fontSize: 13 }}>
        Filter WPR records by report date. Leave both dates blank to show all records.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, marginBottom: 18 }}>
        <label style={dateFieldStyle}>
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            style={dateInputStyle}
          />
        </label>
        <label style={dateFieldStyle}>
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            style={dateInputStyle}
          />
        </label>
        <button
          type="button"
          onClick={exportExcel}
          disabled={loading || latestReports.length === 0}
          style={buttonStyle}
        >
          Download Excel
        </button>
      </div>

      {from && to && from > to && (
        <div role="alert" style={{ color: "var(--red, #b91c1c)", marginBottom: 12 }}>
          The start date must be on or before the end date.
        </div>
      )}
      {error && (
        <div role="alert" style={{ color: "var(--red, #b91c1c)", marginBottom: 12 }}>
          Could not load WPR submissions: {error}
        </div>
      )}
      {loading ? (
        <div style={{ padding: 20, color: "var(--ink3, #64748b)" }}>
          Loading WPR submissions…
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--line, #e5e7eb)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "var(--paper, #f8fafc)", color: "var(--ink2, #475569)", textAlign: "left" }}>
                {["Engineer Name", "Site Name", "Count", "Report Date", "WPR_Url"].map((heading) => (
                  <th key={heading} style={cellStyle}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedReports.map((group) => (
                <tr key={`${group.engineerName}-${group.siteName}`}>
                  <td style={cellStyle}>{group.engineerName}</td>
                  <td style={cellStyle}>{group.siteName}</td>
                  <td style={cellStyle}>{group.reports.length}</td>
                  <td style={cellStyle}>
                    <div style={{ display: "grid", gap: 5 }}>
                      {group.reports.map((report) => (
                        <div key={report.id}>{report.report_date || "—"}</div>
                      ))}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: "grid", gap: 5 }}>
                      {group.reports.map((report) => {
                        const url = safePresentationUrl(report.presentation_url);
                        return (
                          <div key={report.id}>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "var(--blue, #0563c1)", textDecoration: "underline" }}
                              >
                                open
                              </a>
                            ) : "—"}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {groupedReports.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...cellStyle, textAlign: "center", color: "var(--ink3, #64748b)" }}>
                    {error
                      ? "WPR submissions could not be displayed."
                      : from || to
                        ? "No WPR records found for this report date range."
                        : "No WPR records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const dateFieldStyle = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  fontWeight: 700,
};

const dateInputStyle = {
  padding: "8px 10px",
  border: "1px solid var(--line, #d1d5db)",
  borderRadius: 6,
  background: "var(--surface, #fff)",
  color: "var(--ink, #1f2937)",
};

const buttonStyle = {
  padding: "9px 14px",
  border: "1px solid var(--line2, #d1d5db)",
  borderRadius: 6,
  background: "var(--amber, #0f766e)",
  color: "var(--ink, #fff)",
  fontWeight: 700,
  cursor: "pointer",
};

const cellStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--line, #e5e7eb)",
  borderRight: "1px solid var(--line, #e5e7eb)",
  color: "var(--ink, #1f2937)",
  verticalAlign: "top",
  fontSize: 13,
};
