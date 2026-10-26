import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const titleCase = (s) =>
  s
    ? s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    : "";

function sitesFor(user) {
  if (Array.isArray(user?.site_names) && user.site_names.length) {
    return user.site_names.map((s) => titleCase(String(s))).filter(Boolean);
  }
  if (user?.site_name) return [titleCase(String(user.site_name))];
  return [];
}

function fmtWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function MaterialReceived({ user }) {
  const sites = useMemo(() => sitesFor(user), [user]);
  const [site, setSite] = useState(sites[0] || "");
  const [materials, setMaterials] = useState([]);
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState(null);

  const flash = (type, msg) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadMaterials = useCallback(async () => {
    const { data, error } = await supabase.from("dpr_materials").select("name").order("name");
    if (error) return;
    const names = [...new Set((data || []).map((r) => titleCase(r.name)).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    setMaterials(names);
  }, []);

  const loadArrivals = useCallback(async () => {
    if (!site) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("material_requirements")
      .select("id, material_name, quantity, site_name, requested_by, created_at")
      .eq("site_name", site)
      .eq("status", "arrived")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      flash("err", error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [site]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    loadArrivals();
  }, [loadArrivals]);

  const saveNewMaterial = async () => {
    const name = titleCase(newName.trim());
    if (!name) return;
    const exists = materials.some((m) => m.toLowerCase() === name.toLowerCase());
    if (!exists) {
      const { error } = await supabase.from("dpr_materials").insert({ name });
      if (error && !/duplicate|unique/i.test(error.message || "")) {
        flash("err", error.message);
        return;
      }
      await loadMaterials();
    }
    setMaterial(name);
    setNewName("");
    setAdding(false);
  };

  const submit = async () => {
    const name = titleCase(material.trim());
    const amount = Number(qty);
    if (!site) {
      flash("err", "No site is linked to your account.");
      return;
    }
    if (!name) {
      flash("err", "Select a material.");
      return;
    }
    if (!qty || Number.isNaN(amount) || amount <= 0) {
      flash("err", "Enter a quantity greater than 0.");
      return;
    }
    setSaving(true);
    const who = user?.name || user?.full_name || user?.user_name || user?.username || "";
    const { error } = await supabase.from("material_requirements").insert({
      material_name: name,
      quantity: amount,
      site_name: site,
      requested_by: who,
      received_by: who,
      status: "arrived",
      received_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      flash("err", error.message);
      return;
    }
    setQty("");
    flash("ok", `${name} — ${amount} recorded.`);
    loadArrivals();
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || String(r.material_name || "").toLowerCase().includes(q));

  const totals = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = titleCase(r.material_name || "");
      map.set(key, (map.get(key) || 0) + Number(r.quantity || 0));
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const selectedTotal = material
    ? rows
        .filter((r) => String(r.material_name || "").toLowerCase() === material.toLowerCase())
        .reduce((sum, r) => sum + Number(r.quantity || 0), 0)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div className="card-hdr">
          <div className="card-ico">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.3 7 12 12 20.7 7" />
              <line x1="12" y1="22" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <div className="card-title">Material Received</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 2 }}>
              Record material that arrived on site. New names are added to the material list.
            </div>
          </div>
        </div>

        {notice && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              background: notice.type === "ok" ? "#f0fdf4" : "#fef2f2",
              color: notice.type === "ok" ? "var(--green)" : "var(--red)",
              border: notice.type === "ok" ? "1px solid #bbf7d0" : "1px solid #fecaca",
            }}
          >
            {notice.msg}
          </div>
        )}

        {sites.length > 1 && (
          <div className="fgroup" style={{ marginBottom: 14 }}>
            <label className="flabel">Site <span className="req">*</span></label>
            <select className="finput" value={site} onChange={(e) => setSite(e.target.value)}>
              {sites.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid2">
          <div className="fgroup">
            <label className="flabel">Material <span className="req">*</span></label>
            <select
              className="finput"
              value={adding ? "__add" : material}
              onChange={(e) => {
                if (e.target.value === "__add") {
                  setAdding(true);
                  return;
                }
                setAdding(false);
                setMaterial(e.target.value);
              }}
            >
              <option value="">Select material</option>
              {materials.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="__add">Add other</option>
            </select>
          </div>
          <div className="fgroup">
            <label className="flabel">Qty <span className="req">*</span></label>
            <input
              className="finput"
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {adding && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <input
              className="finput"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New material name"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNewMaterial();
              }}
            />
            <button type="button" className="btn btn-green" onClick={saveNewMaterial} disabled={!newName.trim()}>
              Add
            </button>
            <button
              type="button"
              className="btn btn-out"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {material && !adding && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--ink2)" }}>
            {material} arrived so far at this site: <strong>{selectedTotal}</strong>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-amber" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save received qty"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>How much material arrived</div>
        <input
          className="finput"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search material"
        />

        {loading ? (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink3)" }}>Loading…</div>
        ) : totals.length === 0 ? (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink3)" }}>
            {q ? "No material matches that search." : "No material received for this site yet."}
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {totals.map(([name, total]) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  background: "var(--paper)",
                }}
              >
                <span style={{ fontWeight: 700 }}>{name}</span>
                <span style={{ fontWeight: 800 }}>{total}</span>
              </div>
            ))}
            {q && (
              <div style={{ marginTop: 8 }}>
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: 12.5,
                      color: "var(--ink2)",
                      padding: "6px 2px",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <span>{r.material_name} · {fmtWhen(r.created_at)}</span>
                    <span>{Number(r.quantity)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
