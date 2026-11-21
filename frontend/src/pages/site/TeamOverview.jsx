import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

// Dashboard for heads: who from my team is in today, who is not, who is on
// leave, and which person is at which site. Data: GET /api/team-overview.

const STATUS = {
  present: { label: "Present", color: "#16a34a", bg: "rgba(22,163,74,.12)" },
  absent: { label: "Not in yet", color: "#dc2626", bg: "rgba(220,38,38,.12)" },
  leave: { label: "On leave", color: "#d97706", bg: "rgba(217,119,6,.14)" },
};

const timeOf = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "—";

const card = {
  background: "var(--surface, #fff)",
  border: "1px solid var(--line, #e8e2d8)",
  borderRadius: 12,
  padding: 14,
};

function Pill({ status }) {
  const s = STATUS[status] || STATUS.absent;
  return (
    <span style={{ background: s.bg, color: s.color, fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

export default function TeamOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("all");
  const [date, setDate] = useState(""); // "" = today
  const [filter, setFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api(`/team-overview?scope=${scope}${date ? `&date=${date}` : ""}`));
    } catch (e) {
      setError(e.message || "Could not load Team Overview");
    } finally {
      setLoading(false);
    }
  }, [scope, date]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2 * 60 * 1000); // keep it live
    return () => clearInterval(t);
  }, [load]);

  const members = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.members || []).filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      if (siteFilter && (m.site || "No site assigned") !== siteFilter) return false;
      if (q && !`${m.name} ${m.username} ${m.designation} ${m.site}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, siteFilter, search]);

  const sum = data?.summary || { total: 0, present: 0, leave: 0, absent: 0, late: 0 };
  const isToday = !date || date === data?.date && date === new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const dateLabel = data?.date
    ? new Date(`${data.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const stat = (key, label, value, color) => (
    <button
      type="button"
      onClick={() => setFilter(filter === key ? "all" : key)}
      style={{
        ...card, textAlign: "left", cursor: "pointer", flex: "1 1 130px", minWidth: 120,
        outline: filter === key ? `2px solid ${color}` : "none",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--ink3, #9a9289)", fontWeight: 600 }}>{label}</div>
    </button>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 4px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Team Overview</h2>
          <div style={{ fontSize: 13, color: "var(--ink3, #9a9289)" }}>{dateLabel}{isToday ? " · updates every 2 minutes" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="date"
            value={date || data?.date || ""}
            max={new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line2, #d4ccc0)", background: "var(--surface, #fff)", color: "inherit" }}
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line2, #d4ccc0)", background: "var(--surface, #fff)", color: "inherit" }}
          >
            <option value="all">Whole team (everyone under me)</option>
            <option value="direct">Direct reports only</option>
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--amber, #d97706)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div style={{ ...card, borderColor: "#dc2626", color: "#dc2626", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {stat("all", "Total in team", sum.total, "#2563eb")}
        {stat("present", "Present today", sum.present, STATUS.present.color)}
        {stat("absent", isToday ? "Not in yet" : "Absent", sum.absent, STATUS.absent.color)}
        {stat("leave", "On leave", sum.leave, STATUS.leave.color)}
        <div style={{ ...card, flex: "1 1 130px", minWidth: 120 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#d97706" }}>{sum.late || 0}</div>
          <div style={{ fontSize: 12, color: "var(--ink3, #9a9289)", fontWeight: 600 }}>Came late</div>
        </div>
      </div>

      {data && sum.total === 0 && !loading && (
        <div style={{ ...card, marginBottom: 12 }}>
          No employees are mapped under you yet. Ask admin to set <b>Reporting Head</b> for your team in
          Manage Employees.
        </div>
      )}

      {/* ── By site ── */}
      {(data?.sites || []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, margin: "4px 0 8px" }}>Who is at which site</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {data.sites.map((s) => {
              const people = (data.members || []).filter((m) => (m.site || "No site assigned") === s.site);
              return (
                <div key={s.site} style={card}>
                  <button
                    type="button"
                    onClick={() => setSiteFilter(siteFilter === s.site ? "" : s.site)}
                    style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700 }}>
                      <span>📍 {s.site}</span>
                      <span style={{ color: STATUS.present.color }}>{s.present}/{s.total}</span>
                    </div>
                  </button>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {people.map((m) => (
                      <span
                        key={m.id}
                        title={STATUS[m.status].label}
                        style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: STATUS[m.status].bg, color: STATUS[m.status].color, fontWeight: 600 }}
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {siteFilter && (
            <button type="button" onClick={() => setSiteFilter("")} style={{ marginTop: 8, background: "none", border: "none", color: "var(--amber2, #b45309)", cursor: "pointer", fontWeight: 600 }}>
              ✕ Clear site filter ({siteFilter})
            </button>
          )}
        </div>
      )}

      {/* ── People list ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 8px", alignItems: "center" }}>
        <div style={{ fontWeight: 700, marginRight: 4 }}>Team members ({members.length})</div>
        {[["all", "All"], ["absent", "Not in"], ["leave", "On leave"], ["present", "Present"]].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            style={{
              padding: "4px 12px", borderRadius: 16, cursor: "pointer", fontSize: 12, fontWeight: 600,
              border: "1px solid var(--line2, #d4ccc0)",
              background: filter === k ? "var(--amber, #d97706)" : "transparent",
              color: filter === k ? "#fff" : "inherit",
            }}
          >
            {l}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or site…"
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line2, #d4ccc0)", background: "var(--surface, #fff)", color: "inherit", minWidth: 180 }}
        />
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink3, #9a9289)", fontSize: 12 }}>
              {["Employee", "Status", "Site", "Came at", "Left at", "Hours", ""].map((h) => (
                <th key={h} style={{ padding: "10px 12px", borderBottom: "1px solid var(--line, #e8e2d8)", fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)" }}>
                  <div style={{ fontWeight: 700 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink3, #9a9289)" }}>{m.designation || m.department}</div>
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)" }}><Pill status={m.status} /></td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)" }}>
                  {m.site || "—"}
                  {m.site_source === "qr" && <span style={{ marginLeft: 6, fontSize: 10, color: "#16a34a", fontWeight: 700 }}>QR scan</span>}
                  {m.site_source === "assigned" && m.status !== "present" && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: "var(--ink3, #9a9289)" }}>assigned</span>
                  )}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)", whiteSpace: "nowrap" }}>
                  {timeOf(m.clock_in)}
                  {m.clock_in_status === "late" && <span style={{ marginLeft: 6, color: "#dc2626", fontSize: 11 }}>late</span>}
                </td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)", whiteSpace: "nowrap" }}>{m.still_in && isToday ? <span style={{ color: "#16a34a", fontWeight: 600 }}>Working</span> : timeOf(m.clock_out)}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)", whiteSpace: "nowrap" }}>{m.hours != null ? `${m.hours} h` : "—"}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--line, #e8e2d8)" }}>
                  {m.map_url && (
                    <a href={m.map_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue, #2563eb)", fontWeight: 600 }}>
                      Map
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {!members.length && (
              <tr><td colSpan={7} style={{ padding: 18, textAlign: "center", color: "var(--ink3, #9a9289)" }}>
                {loading ? "Loading…" : "No one matches this filter."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
