import { useEffect, useState, useCallback, useMemo } from "react";
import Navbar from "../../components/Navbar";
import { supabase, fromMaybe } from "../../lib/supabase";
import { api } from "../../lib/api";
import "../site/SitePortal.css";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx-js-style";

// ─── Config ────────────────────────────────────────────────────────────────

const LATE_CUTOFF_HOUR = 9;
const LATE_CUTOFF_MIN = 30;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const todayISO = () => toISODateLocal(new Date());

function addSiteName(set, value) {
  const s = String(value || "").trim();
  if (s) set.add(s);
}

function normKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Prefer mixed/title case over ALL CAPS so "Proposed Cafe" wins over "PROPOSED CAFE". */
function preferDisplayName(a, b) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x) return y;
  if (!y) return x;
  const xAll = x === x.toUpperCase() && /[A-Z]/.test(x);
  const yAll = y === y.toUpperCase() && /[A-Z]/.test(y);
  if (xAll && !yAll) return y;
  if (yAll && !xAll) return x;
  const xU = (x.match(/[A-Z]/g) || []).length;
  const yU = (y.match(/[A-Z]/g) || []).length;
  if (xU !== yU) return xU > yU ? x : y;
  return x.length >= y.length ? x : y;
}

function uniqueNamesCaseInsensitive(names) {
  const map = new Map();
  (names || []).forEach((n) => {
    const trimmed = String(n || "").trim();
    if (!trimmed) return;
    const k = normKey(trimmed);
    map.set(k, map.has(k) ? preferDisplayName(map.get(k), trimmed) : trimmed);
  });
  return [...map.values()];
}

function sitesOfRow(row) {
  const out = [];
  if (row?.site_name) out.push(String(row.site_name).trim());
  let arr = row?.site_names;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = arr ? [arr] : [];
    }
  }
  if (!Array.isArray(arr)) arr = [];
  arr.forEach((s) => s && out.push(String(s).trim()));
  return [...new Set(out.filter(Boolean))];
}

function rowTouchesSites(row, sites) {
  if (!sites?.length) return true;
  const have = new Set(sitesOfRow(row).map((s) => s.toLowerCase()));
  return sites.some((s) => have.has(String(s).toLowerCase()));
}

/** Process Controller is office-wide — pull sites from TaskFlow tables, not only user_details. */
async function collectAllSiteNames() {
  const set = new Set();
  try {
    const projects = await api("/sites");
    (projects || []).forEach((p) => addSiteName(set, p.name));
  } catch {
    /* token/API optional */
  }
  const { data: users } = await fromMaybe("users", (q) => q.select("site_name, site_names"));
  (users || []).forEach((u) => sitesOfRow(u).forEach((s) => addSiteName(set, s)));

  const { data: assigns } = await fromMaybe("user_site_assignments", (q) => q.select("site_name"));
  (assigns || []).forEach((a) => addSiteName(set, a.site_name));

  const { data: details } = await fromMaybe("user_details", (q) => q.select("site_name, site_names"));
  (details || []).forEach((u) => sitesOfRow(u).forEach((s) => addSiteName(set, s)));

  const { data: dprs } = await fromMaybe("dpr_reports", (q) => q.select("site"));
  (dprs || []).forEach((r) => addSiteName(set, r.site));

  return uniqueNamesCaseInsensitive([...set]).sort((a, b) => a.localeCompare(b));
}

async function resolvePeopleForSites(sites) {
  const people = new Map();
  const { data: users } = await fromMaybe("users", (q) =>
    q.select("username, full_name, site_name, site_names, is_active")
  );
  (users || []).forEach((u) => {
    if (!u?.username || u.is_active === false) return;
    if (rowTouchesSites(u, sites)) people.set(u.username, u.full_name || u.username);
  });
  const { data: assigns } = await fromMaybe("user_site_assignments", (q) =>
    q.select("user_name, full_name, site_name")
  );
  (assigns || []).forEach((a) => {
    if (!a?.user_name) return;
    const hit =
      !sites?.length ||
      sites.some((s) => s.toLowerCase() === String(a.site_name || "").toLowerCase());
    if (hit) people.set(a.user_name, a.full_name || people.get(a.user_name) || a.user_name);
  });
  const { data: details } = await fromMaybe("user_details", (q) =>
    q.select("username, name, site_name, site_names")
  );
  (details || []).forEach((u) => {
    if (!u?.username) return;
    if (rowTouchesSites(u, sites)) people.set(u.username, u.name || people.get(u.username) || u.username);
  });
  return people;
}

function fmtDDMMYYYY(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
function fmtDMonYYYY(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${pad(d.getDate())}-${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`;
}
// any timezone ahead of UTC (like IST).
function toISODateLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtTimeIST(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function fmtTimeIST24(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
function fmtDMonYY(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${pad(d.getDate())}-${MONTHS_SHORT[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}
function lateMinutesFromClockIn(ts) {
  if (!ts) return 0;
  const parts = new Date(ts).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).split(":");
  const mins = Number(parts[0]) * 60 + Number(parts[1]);
  return Math.max(0, mins - 9 * 60);
}
function pendText(value) {
  const s = String(value ?? "").trim();
  return s || "Pend";
}
function employeeOptionKey(person) {
  return normKey(person?.username) || normKey(person?.name);
}
function employeeMatches(person, key) {
  if (!key || key === "all") return true;
  return normKey(person?.username) === key || normKey(person?.name) === key;
}
function locationCell(label, url) {
  const text = pendText(label);
  if (text === "Pend" || !url) {
    return (
      <span style={{ fontWeight: text === "Pend" ? 700 : undefined, color: text === "Pend" ? "var(--amber2, #d97706)" : undefined }}>
        {text}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#0563c1", fontWeight: 600, textDecoration: "underline" }}>
      {text}
    </a>
  );
}
function parseLatLng(raw) {
  const m = String(raw || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
function mapsUrlFromCoords(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
function placeLabelFromGeo(data) {
  if (!data) return "";
  const area = data.locality || data.localityInfo?.informative?.[0]?.name || "";
  const city = data.city || "";
  const parts = [area, city].map((p) => String(p || "").trim()).filter(Boolean);
  return [...new Set(parts)].join(", ");
}
async function reverseGeocodeLatLng(lat, lng) {
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
  );
  if (!res.ok) throw new Error("geocode failed");
  return res.json();
}
async function resolveLocationInfo(raw, cache) {
  const text = String(raw || "").trim();
  if (!text) return { label: "Pend", url: "" };
  const coords = parseLatLng(text);
  if (!coords) return { label: text, url: "" };
  const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);
  const promise = (async () => {
    const url = mapsUrlFromCoords(coords.lat, coords.lng);
    try {
      const geo = await reverseGeocodeLatLng(coords.lat, coords.lng);
      return { label: placeLabelFromGeo(geo) || "View on Maps", url };
    } catch {
      return { label: "View on Maps", url };
    }
  })();
  cache.set(key, promise);
  return promise;
}
async function attachResolvedLocations(sheets) {
  const cache = new Map();
  const pending = [];
  (sheets || []).forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      pending.push(
        resolveLocationInfo(row.clockInLocation, cache).then((info) => {
          row.clockInLocation = info.label;
          row.clockInMaps = info.url;
        })
      );
      pending.push(
        resolveLocationInfo(row.clockOutLocation, cache).then((info) => {
          row.clockOutLocation = info.label;
          row.clockOutMaps = info.url;
        })
      );
    });
  });
  await Promise.all(pending);
  return sheets;
}
function excelSheetName(name, used) {
  let base = String(name || "Engineer").replace(/[:\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (!base) base = "Engineer";
  base = base.slice(0, 31);
  let out = base;
  let n = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` (${n})`;
    out = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(out.toLowerCase());
  return out;
}
const DRAWING_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function slugify(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

function isImageFile(url) {
  if (!url) return false;
  const clean = url.split("?")[0].split("#")[0];
  const ext = clean.split(".").pop().toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext);
}

function isOfficeDoc(url) {
  return /\.(pptx|ppt|docx|doc|xlsx|xls)(\?|$)/i.test(url || "");
}

function getViewUrl(url) {
  if (!url) return url;
  if (isOfficeDoc(url)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

async function uploadDrawingFiles(supabaseClient, siteName, dateStr, files) {
  const bucket = slugify(siteName);
  if (!bucket) throw new Error("Site name is required to upload drawings.");

  const { error: bucketErr } = await supabaseClient.storage.createBucket(bucket, { public: true });
  if (bucketErr && !/already exists/i.test(bucketErr.message || "")) {
    throw new Error(`Could not create bucket "${bucket}": ${bucketErr.message}`);
  }

  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const month = DRAWING_MONTHS[d.getMonth()];
  const dayFolder = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${year}`;

  const uploaded = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${year}/${month}/${dayFolder}/drawings/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabaseClient.storage.from(bucket).upload(path, file);
    if (upErr) throw new Error(`Failed to upload ${file.name}: ${upErr.message}`);
    const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    uploaded.push({ name: file.name, url: urlData.publicUrl, path });
  }
  return uploaded;
}
// Inclusive list of ISO date strings between from and to
function dateRange(from, to) {
  const out = [];
  if (!from || !to) return out;
  let cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cur <= end) {
    out.push(toISODateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
      <span>Loading…</span>
    </div>
  );
}

const Ico = {
  attendance: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  log: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  dpr: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  excel: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v18" />
    </svg>
  ),
  addDrawing: (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="12" height="14" rx="1" />
    <path d="M6 9h6M6 12h6M6 15h4" />
    <path d="M16 16l5-5 2 2-5 5-3 1z" />
  </svg>
),
allDrawings: (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 9h18" /><path d="M9 3v18" /><path d="M15 3v18" /><path d="M3 15h18" />
  </svg>
),
  dl: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
apply: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  ),
  leave: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  ),
  proxy:(
   <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#eb2727"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M5 21c0-3.5 3-6 7-6s7 2.5 7 6" />
    <path d="M18 10l2 2 3-3" />
  </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  send: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  plus: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════════════════════════════════════

function isLateAttendance(row) {
  const mark = String(row?.clock_in_status || row?.status || "").toLowerCase();
  return mark === "late";
}

async function fetchAttendanceSummary(sites, from, to) {
  if (!from || !to) return [];

  const people = await resolvePeopleForSites(sites);
  const { data, error } = await supabase
    .from("attendance")
    .select("user_name, date, clock_in, clock_out, status, clock_in_status")
    .gte("date", from)
    .lte("date", to);
  if (error) throw error;
  const nameByUsername = Object.fromEntries(people);

  const byUser = new Map();
  (data || []).forEach((r) => {
    const key = r.user_name;
    if (!byUser.has(key)) {
      byUser.set(key, {
        name: nameByUsername[key] || key,
        clockIn: 0,
        clockOut: 0,
        late: 0,
      });
    }
    const bucket = byUser.get(key);
    if (r.clock_in) bucket.clockIn += 1;
    if (r.clock_out) bucket.clockOut += 1;
    if (isLateAttendance(r)) bucket.late += 1;
  });

return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Per-date, per-employee attendance rows: Date · Name · Clock In · Clock Out
async function fetchAttendanceLog(sites, from, to) {
  if (!from || !to) return [];

  const people = await resolvePeopleForSites(sites);
  const nameByUsername = Object.fromEntries(people);
  const { data, error } = await supabase
    .from("attendance")
    .select("user_name, date, clock_in, clock_out, status, clock_in_status")
    .gte("date", from)
    .lte("date", to);
  if (error) throw error;

  return (data || [])
    .map((r) => ({
      date: r.date,
      name: nameByUsername[r.user_name] || r.user_name,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      late: isLateAttendance(r),
    }))
    .sort((a, b) =>
      a.date === b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date)
    );
}

const ENGINEER_ROLES = ["Site Engineer", "Site Incharge", "Site Coordinator"];

function isEngineerRole(role) {
  const r = String(role || "");
  return ENGINEER_ROLES.some((x) => r.toLowerCase().includes(x.toLowerCase())) || /engineer|incharge|coordinator/i.test(r);
}

async function fetchPagedRows(table, select, apply) {
  const pageSize = 1000;
  const all = [];
  for (let page = 0; page < 20; page++) {
    let q = supabase.from(table).select(select);
    q = apply(q);
    const { data, error } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

async function resolveAllSiteEngineers(sites) {
  const byUser = new Map();
  const add = (username, name, role, row) => {
    const uname = String(username || "").trim();
    if (!uname) return;
    if (sites?.length && row && !rowTouchesSites(row, sites)) return;
    if (role != null && !isEngineerRole(role)) return;
    const display = String(name || uname).trim();
    const prev = byUser.get(normKey(uname));
    byUser.set(normKey(uname), {
      username: uname,
      name: prev ? preferDisplayName(prev.name, display) : display,
    });
  };

  const { data: users } = await fromMaybe("users", (q) =>
    q.select("username, full_name, designation, role, department, site_name, site_names, is_active")
  );
  (users || []).forEach((u) => {
    if (u.is_active === false) return;
    add(u.username, u.full_name, u.designation || u.role || u.department, u);
  });

  const { data: assigns } = await fromMaybe("user_site_assignments", (q) =>
    q.select("user_name, full_name, site_name")
  );
  (assigns || []).forEach((a) => {
    add(a.user_name, a.full_name || a.user_name, "Site Engineer", { site_name: a.site_name });
  });

  const { data: details } = await fromMaybe("user_details", (q) =>
    q.select("username, name, role, department, site_name, site_names")
  );
  (details || []).forEach((u) => {
    add(u.username, u.name, u.role || u.department, u);
  });

  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function isApprovedLeaveRow(leave) {
  const st = String(leave?.status || "").toLowerCase();
  if (st === "rejected") return false;
  if (st === "approved") return true;
  if (leave?.level_approved === false || leave?.head_approved === false) return false;
  if (leave?.admin_approved === true) return true;
  return isLeaveFullyApproved(leave);
}

async function fetchApprovedLeaveDays(from, to) {
  const onLeave = new Set();
  const addLeaves = (rows) => {
    (rows || []).forEach((l) => {
      if (!isApprovedLeaveRow(l) || !l.from_date || !l.to_date) return;
      const start = l.from_date > from ? l.from_date : from;
      const end = l.to_date < to ? l.to_date : to;
      dateRange(start, end).forEach((d) => {
        if (l.user_name) onLeave.add(`${normKey(l.user_name)}__${d}`);
        if (l.name) onLeave.add(`${normKey(l.name)}__${d}`);
      });
    });
  };
  const { data: siteLeaves } = await fromMaybe("site_leaves", (q) =>
    q.select("user_name, name, from_date, to_date, status, level_approved, head_approved")
      .lte("from_date", to)
      .gte("to_date", from)
  );
  addLeaves(siteLeaves);
  const { data: officeLeaves } = await fromMaybe("leaves", (q) =>
    q.select("user_name, name, from_date, to_date, status, admin_approved, proxy_approved, proxy_user_name, level_approved, head_approved, level_approver_user_name, head_approver_user_name")
      .lte("from_date", to)
      .gte("to_date", from)
  );
  addLeaves(officeLeaves);
  return onLeave;
}

function engineerDayStatus({ onLeave, clockIn, clockOut, lateMins, att }) {
  if (onLeave) return "On Leave";
  if (!clockIn || !clockOut) return "Pend";
  if (lateMins > 0 || isLateAttendance(att)) return "Late";
  return "On Time";
}

function engineerReportMark(onLeave, done) {
  if (onLeave) return "On Leave";
  return done ? "Done" : "Pend";
}

async function fetchEngineerExcelReport(sites, from, to, employeeKey = "all") {
  if (!from || !to) return [];
  const dates = dateRange(from, to);
  if (!dates.length) return [];

  const engineers = await resolveAllSiteEngineers(sites);
  const byUser = new Map(engineers.map((e) => [normKey(e.username), e]));
  const byName = new Map(engineers.map((e) => [normKey(e.name), e]));
  const leaveDays = await fetchApprovedLeaveDays(from, to);

  let attendance;
  try {
    attendance = await fetchPagedRows(
      "attendance",
      "user_name, date, clock_in, clock_out, clock_in_location, clock_out_location, status, clock_in_status",
      (q) => q.gte("date", from).lte("date", to)
    );
  } catch (e) {
    if (!/clock_in_location|clock_out_location/i.test(String(e.message || ""))) throw e;
    attendance = await fetchPagedRows(
      "attendance",
      "user_name, date, clock_in, clock_out, status, clock_in_status",
      (q) => q.gte("date", from).lte("date", to)
    );
  }
  const dprs = await fetchPagedRows(
    "dpr_reports",
    "engineer, date, report_type",
    (q) => q.gte("date", from).lte("date", to)
  );

  attendance.forEach((r) => {
    const key = normKey(r.user_name);
    if (!key || byUser.has(key)) return;
    const name = r.user_name;
    const eng = { username: r.user_name, name };
    byUser.set(key, eng);
    byName.set(normKey(name), eng);
  });
  dprs.forEach((r) => {
    const name = String(r.engineer || "").trim();
    if (!name || byName.has(normKey(name))) return;
    const eng = { username: name, name };
    byName.set(normKey(name), eng);
    byUser.set(normKey(name), eng);
  });

  const attByUserDate = new Map();
  attendance.forEach((r) => {
    attByUserDate.set(`${normKey(r.user_name)}__${r.date}`, r);
  });

  const dprByNameDate = new Map();
  dprs.forEach((r) => {
    const key = `${normKey(r.engineer)}__${r.date}`;
    if (!dprByNameDate.has(key)) dprByNameDate.set(key, { morning: false, evening: false });
    const bucket = dprByNameDate.get(key);
    const type = String(r.report_type || "").toLowerCase();
    if (type === "morning") bucket.morning = true;
    if (type === "evening") bucket.evening = true;
  });

  let list = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (employeeKey && employeeKey !== "all") {
    list = list.filter((eng) => employeeMatches(eng, employeeKey));
  }
  const sheets = list.map((eng) => {
    const rows = dates.map((date) => {
      const att = attByUserDate.get(`${normKey(eng.username)}__${date}`)
        || attByUserDate.get(`${normKey(eng.name)}__${date}`);
      const dpr = dprByNameDate.get(`${normKey(eng.name)}__${date}`)
        || dprByNameDate.get(`${normKey(eng.username)}__${date}`)
        || { morning: false, evening: false };
      const clockIn = att?.clock_in || "";
      const clockOut = att?.clock_out || "";
      const lateMins = lateMinutesFromClockIn(clockIn);
      const onLeave = leaveDays.has(`${normKey(eng.username)}__${date}`)
        || leaveDays.has(`${normKey(eng.name)}__${date}`);
      return {
        date,
        name: eng.name,
        clockIn,
        clockInLocation: att?.clock_in_location || "",
        clockOut,
        clockOutLocation: att?.clock_out_location || "",
        status: engineerDayStatus({ onLeave, clockIn, clockOut, lateMins, att }),
        lateMinutes: clockIn && !onLeave ? lateMins : 0,
        morning: engineerReportMark(onLeave, dpr.morning),
        evening: engineerReportMark(onLeave, dpr.evening),
      };
    });
    return { name: eng.name, username: eng.username, rows };
  });
  return attachResolvedLocations(sheets);
}

function downloadEngineerExcel(sheets, from, to) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set();
  const thin = { style: "thin", color: { rgb: "FFB0B7C3" } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const titleStyle = {
    font: { bold: true, sz: 14, name: "Calibri", color: { rgb: "FF1A3A5C" } },
    fill: { patternType: "solid", fgColor: { rgb: "FFBDD7EE" } },
    alignment: { horizontal: "center", vertical: "center" },
    border,
  };
  const headStyle = {
    font: { bold: true, sz: 11, name: "Calibri", color: { rgb: "FFFFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "FF1F4E79" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border,
  };
  const bodyStyle = (align = "center") => ({
    font: { sz: 10, name: "Calibri", color: { rgb: "FF1A2E42" } },
    alignment: { horizontal: align, vertical: "center" },
    border,
  });

  const headers = [
    "Date", "Employee Name", "Check In Time", "Check In Location",
    "Check Out Time", "Check Out Location", "Status", "Late Minutes",
    "Morning Report", "Evening DPR",
  ];

  (sheets || []).forEach((sheet) => {
    const ws = {};
    const name = String(sheet.name || "ENGINEER").toUpperCase();
    for (let c = 0; c <= 9; c++) {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: c === 0 ? name : "", t: "s", s: titleStyle };
    }
    headers.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 1, c })] = { v: h, t: "s", s: headStyle };
    });
    (sheet.rows || []).forEach((row, i) => {
      const r = i + 2;
      const vals = [
        fmtDMonYY(row.date),
        row.name,
        pendText(fmtTimeIST24(row.clockIn)),
        pendText(row.clockInLocation),
        pendText(fmtTimeIST24(row.clockOut)),
        pendText(row.clockOutLocation),
        row.status,
        row.lateMinutes || 0,
        row.morning,
        row.evening,
      ];
      vals.forEach((v, c) => {
        const st = bodyStyle(c === 1 ? "left" : "center");
        const mapsUrl = c === 3 ? row.clockInMaps : c === 5 ? row.clockOutMaps : "";
        if (c === 6) {
          if (v === "Late") st.font = { ...st.font, bold: true, color: { rgb: "FFB45309" } };
          else if (v === "Pend") st.font = { ...st.font, bold: true, color: { rgb: "FFD97706" } };
          else if (v === "On Leave") st.font = { ...st.font, bold: true, color: { rgb: "FF7C3AED" } };
          else if (v === "On Time") st.font = { ...st.font, bold: true, color: { rgb: "FF16A34A" } };
        }
        if ((c === 2 || c === 3 || c === 4 || c === 5) && v === "Pend") {
          st.font = { ...st.font, bold: true, color: { rgb: "FFD97706" } };
        }
        if ((c === 8 || c === 9) && v === "Pend") {
          st.font = { ...st.font, bold: true, color: { rgb: "FFD97706" } };
        }
        if ((c === 8 || c === 9) && v === "Done") {
          st.font = { ...st.font, bold: true, color: { rgb: "FF16A34A" } };
        }
        if ((c === 8 || c === 9) && v === "On Leave") {
          st.font = { ...st.font, bold: true, color: { rgb: "FF7C3AED" } };
        }
        if (mapsUrl && v !== "Pend") {
          st.font = { ...st.font, color: { rgb: "FF0563C1" }, underline: true };
        }
        const cell = {
          v,
          t: typeof v === "number" ? "n" : "s",
          s: st,
        };
        if (mapsUrl && v !== "Pend") cell.l = { Target: mapsUrl };
        ws[XLSX.utils.encode_cell({ r, c })] = cell;
      });
    });
    const lastRow = 1 + (sheet.rows?.length || 0);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(lastRow, 1), c: 9 } });
    ws["!cols"] = [
      { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 32 },
      { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 14 },
      { wch: 16 }, { wch: 14 },
    ];
    ws["!rows"] = [{ hpt: 24 }, { hpt: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, excelSheetName(sheet.name, usedNames));
  });

  if (!wb.SheetNames.length) {
    const ws = XLSX.utils.aoa_to_sheet([["No site engineers found"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Report");
  }
  XLSX.writeFile(wb, `SITE_ATT_REPORT_${fmtDDMMYYYY(from)} TO ${fmtDDMMYYYY(to)}.xlsx`);
}

async function resolveEngineers(sites) {
  if (!sites.length) return {};

  const rows = [];
  const { data: users } = await fromMaybe("users", (q) =>
    q.select("full_name, designation, role, department, site_name, site_names")
  );
  (users || []).forEach((u) => {
    const role = String(u.designation || u.role || u.department || "");
    rows.push({ name: u.full_name, role, site_names: sitesOfRow(u) });
  });
  const { data: assigns } = await fromMaybe("user_site_assignments", (q) =>
    q.select("full_name, user_name, site_name")
  );
  (assigns || []).forEach((a) => {
    rows.push({ name: a.full_name || a.user_name, role: "Site Engineer", site_names: a.site_name ? [a.site_name] : [] });
  });
  const { data: details } = await fromMaybe("user_details", (q) =>
    q.select("name, role, site_names, site_name")
  );
  (details || []).forEach((u) => {
    rows.push({ name: u.name, role: u.role, site_names: sitesOfRow(u) });
  });

  const map = {};
  sites.forEach((site) => {
    const siteLc = normKey(site);
    const names = rows
      .filter((u) => {
        const onSite = (u.site_names || []).some((s) => normKey(s) === siteLc);
        if (!onSite) return false;
        const role = String(u.role || "");
        return ENGINEER_ROLES.some((r) => role.toLowerCase().includes(r.toLowerCase())) || /engineer|incharge|coordinator/i.test(role);
      })
      .map((u) => u.name)
      .filter(Boolean);
    map[siteLc] = uniqueNamesCaseInsensitive(names).sort((a, b) => a.localeCompare(b));
  });

  return map;
}

// DPR sheet: one row per site (case-insensitive), or one row per engineer when a site has several.
async function fetchDprSheet(sites, from, to) {
  if (!from || !to) return { rows: [], dates: [] };

  let rawSites = (sites || []).filter(Boolean);
  if (!rawSites.length) rawSites = await collectAllSiteNames();

  const uniqueSites = uniqueNamesCaseInsensitive(rawSites).sort((a, b) => a.localeCompare(b));
  if (!uniqueSites.length) return { rows: [], dates: [] };

  const knownKeys = new Set(uniqueSites.map(normKey));
  const dates = dateRange(from, to);

  // Fetch the date range (not only exact site strings) so "Proposed Cafe" and
  // "PROPOSED CAFE" submissions fold into the same site.
  const data = [];
  const pageSize = 1000;
  for (let page = 0; page < 20; page++) {
    const { data: chunk, error } = await supabase
      .from("dpr_reports")
      .select("site, engineer, report_type, date")
      .gte("date", from)
      .lte("date", to)
      .neq("report_type", "morning")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    data.push(...(chunk || []));
    if (!chunk || chunk.length < pageSize) break;
  }

  // siteKey -> engineerKey -> { display, dates }
  const submittedBySite = new Map();
  (data || []).forEach((r) => {
    const sk = normKey(r.site);
    if (!knownKeys.has(sk)) return;
    const eng = String(r.engineer || "").trim();
    const ek = normKey(eng) || "__none__";
    if (!submittedBySite.has(sk)) submittedBySite.set(sk, new Map());
    const engMap = submittedBySite.get(sk);
    if (!engMap.has(ek)) {
      engMap.set(ek, { display: eng || "—", dates: new Set() });
    } else if (eng) {
      engMap.get(ek).display = preferDisplayName(engMap.get(ek).display, eng);
    }
    if (r.date) engMap.get(ek).dates.add(r.date);
  });

  const assignedBySite = await resolveEngineers(uniqueSites);

  const rows = [];
  uniqueSites.forEach((site) => {
    const sk = normKey(site);
    const submittedEngs = submittedBySite.get(sk);
    const assigned = assignedBySite[sk] || [];
    const fromReports = [...(submittedEngs?.values() || [])]
      .map((e) => e.display)
      .filter((d) => d && d !== "—");
    const engineers = uniqueNamesCaseInsensitive([...assigned, ...fromReports])
      .sort((a, b) => a.localeCompare(b));
    const list = engineers.length ? engineers : ["—"];

    list.forEach((eng) => {
      const ek = normKey(eng);
      const ownDates = ek && submittedEngs ? submittedEngs.get(ek)?.dates : null;
      const anySiteDates = new Set();
      if (eng === "—") {
        submittedEngs?.forEach((v) => v.dates.forEach((d) => anySiteDates.add(d)));
      }

      rows.push({
        site,
        engineer: eng,
        days: dates.map((d) => {
          if (eng === "—") return anySiteDates.has(d) ? "DONE" : "PEND";
          return ownDates?.has(d) ? "DONE" : "PEND";
        }),
      });
    });
  });

  rows.forEach((r, i) => {
    r.srNo = i + 1;
  });

  return { rows, dates };
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT (matches the layout of the two reference PDFs)
// ═══════════════════════════════════════════════════════════════════════════
// Draws the two-tone title/subtitle bars seen in the reference PDFs and
// returns the Y position where the table should start.
function drawReportHeader(doc, title, subtitle) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const barWidth = pageWidth - margin * 2;

  // Title bar — dark navy
  doc.setFillColor(30, 58, 95);
  doc.rect(margin, 12, barWidth, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text(title, pageWidth / 2, 20, { align: "center" });

  // Subtitle bar — lighter blue
  doc.setFillColor(69, 102, 143);
  doc.rect(margin, 24, barWidth, 9, "F");
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(subtitle, pageWidth / 2, 30, { align: "center" });

  doc.setTextColor(0, 0, 0); // reset for table body
  return 24 + 9 + 4;
}

function downloadAttendancePdf(rows, from, to) {
  const doc = new jsPDF();
  const startY = drawReportHeader(
    doc,
    "Attendance Summary",
    `${fmtDDMMYYYY(from)} to ${fmtDDMMYYYY(to)}`
  );

    autoTable(doc, {
    startY,
    theme: "grid",
    head: [["Name", "Clock In", "Clock Out", "Late Count"]],
    body: rows.map((r) => [r.name.toUpperCase(), r.clockIn, r.clockOut, r.late]),
    styles: { fontSize: 9, halign: "center", cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.1 },
    headStyles: { fillColor: [240, 217, 196], textColor: [40, 40, 40], fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.1 },
    bodyStyles: { textColor: [30, 30, 30], fillColor: [255, 255, 255] },
    columnStyles: { 0: { halign: "center", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const val = Number(data.cell.raw);
        data.cell.styles.textColor = val > 0 ? [220, 38, 38] : [22, 163, 74];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

doc.save(`Attendance_${from}_to_${to}.pdf`);
}

function downloadAttendanceLogPdf(rows, from, to) {
  const doc = new jsPDF();
  const startY = drawReportHeader(
    doc,
    "Attendance Log",
    `${fmtDDMMYYYY(from)} to ${fmtDDMMYYYY(to)}`
  );

  autoTable(doc, {
    startY,
    theme: "grid",
    head: [["Date", "Engineer Name", "Clock In", "Clock Out"]],
    body: rows.map((r) => [
      fmtDDMMYYYY(r.date),
      r.name.toUpperCase(),
      fmtTimeIST(r.clockIn),
      fmtTimeIST(r.clockOut),
    ]),
    styles: { fontSize: 9, halign: "center", cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.1 },
    headStyles: { fillColor: [240, 217, 196], textColor: [40, 40, 40], fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.1 },
    bodyStyles: { textColor: [30, 30, 30], fillColor: [255, 255, 255] },
    columnStyles: { 1: { halign: "center", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "body" && (data.column.index === 2 || data.column.index === 3)) {
        if (data.cell.raw === "—") data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  doc.save(`Attendance_Log_${from}_to_${to}.pdf`);
}

function drawCheck(doc, x, y, size, color) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.line(x, y + size * 0.55, x + size * 0.35, y + size * 0.9);
  doc.line(x + size * 0.35, y + size * 0.9, x + size, y);
}
function drawCross(doc, x, y, size, color) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.line(x, y, x + size, y + size);
  doc.line(x + size, y, x, y + size);
}

function downloadDprPdf(rows, dates, from, to) {
  const doc = new jsPDF({ orientation: dates.length > 6 ? "landscape" : "portrait" });
  const startY = drawReportHeader(
    doc,
    "DPR SHEET",
    `Period: ${fmtDMonYYYY(from)}  to  ${fmtDMonYYYY(to)}`
  );

  const useIcons = dates.length > 7; // switch DONE/PEND text -> ✓/✗ glyphs

  const dayHead = dates.map((d) => {
    const dt = new Date(d + "T00:00:00");
    return `${pad(dt.getDate())}\n${MONTHS_SHORT[dt.getMonth()]}`;
  });

  autoTable(doc, {
    startY,
    theme: "grid",
    head: [["SR NO", "ENGINEER NAME", "SITE NAME", ...dayHead]],
    body: rows.map((r) => [r.srNo, r.engineer, r.site.toUpperCase(), ...r.days]),
    styles: { fontSize: useIcons ? 7 : 8, halign: "center", cellPadding: useIcons ? 1.5 : 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
    headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.1 },
    bodyStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: useIcons ? 8 : "auto" },
      1: { halign: "center", cellWidth: useIcons ? 30 : "auto" },
      2: { halign: "center", fontStyle: "bold", cellWidth: useIcons ? 32 : "auto" },
    },

    // Suppress the default DONE/PEND text draw for day columns when
    // useIcons is on — we'll draw the glyph ourselves in didDrawCell.
    willDrawCell: (data) => {
      if (useIcons && data.section === "body" && data.column.index >= 3) {
        data.cell.text = [];
      }
    },

    didDrawCell: (data) => {
      if (useIcons && data.section === "body" && data.column.index >= 3) {
        const isDone = data.cell.raw === "DONE";
        const size = 2.6;
        const cx = data.cell.x + data.cell.width / 2 - size / 2;
        const cy = data.cell.y + data.cell.height / 2 - size / 2;
        if (isDone) drawCheck(doc, cx, cy, size, [22, 163, 74]);
        else drawCross(doc, cx, cy, size, [220, 38, 38]);
      }
    },

    // Keep the colored DONE/PEND text only when NOT using icons (<=7 days)
    didParseCell: (data) => {
      if (!useIcons && data.section === "body" && data.column.index >= 3) {
        if (data.cell.raw === "DONE") {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        }
        if (data.cell.raw === "PEND") {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  doc.save(`DPR_Sheet_${from}_to_${to}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════
// DATE RANGE FILTER (shared control)
// ═══════════════════════════════════════════════════════════════════════════

function RangeFilter({ from, to, setFrom, setTo, onGenerate, busy, extra }) {
  return (
    <div className="grid2" style={{ marginBottom: 20 }}>
      <div className="fgroup">
        <label className="flabel">From Date <span className="req">*</span></label>
        <input
          type="date"
          className="finput"
          value={from}
          max={to && to < todayISO() ? to : todayISO()}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>
      <div className="fgroup">
        <label className="flabel">To Date <span className="req">*</span></label>
        <input
          type="date"
          className="finput"
          value={to}
          min={from || undefined}
          max={todayISO()}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {extra}
      <div className="col2 act-row" style={{ marginTop: 0 }}>
        <button className="btn btn-pri" disabled={!from || !to || busy} onClick={onGenerate}>
          {busy ? "Generating…" : "Generate Report"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE REPORT SCREEN
// ═══════════════════════════════════════════════════════════════════════════

function AttendanceReport({ sites }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const generate = async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await fetchAttendanceSummary(sites, from, to);
      setRows(data);
    } catch (e) {
      setErr(e.message || "Failed to load attendance.");
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <RangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onGenerate={generate} busy={busy} />
      {err && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{err}</div>}

      {rows && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>
              {rows.length} employee{rows.length !== 1 ? "s" : ""} · {fmtDDMMYYYY(from)} to {fmtDDMMYYYY(to)}
            </div>
            <button className="btn btn-out" onClick={() => downloadAttendancePdf(rows, from, to)} disabled={!rows.length}>
              {Ico.dl} Download PDF
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No attendance records</div>
              <div className="empty-sub">No clock-in/out data for this date range across your sites.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Name</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Clock In</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Clock Out</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Late Count</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.name}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{r.clockIn}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{r.clockOut}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{r.late}</td>
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

// ═══════════════════════════════════════════════════════════════════════════
// ATTENDANCE LOG SCREEN — one row per date per employee
// ═══════════════════════════════════════════════════════════════════════════

function AttendanceLog({ sites }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const generate = async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await fetchAttendanceLog(sites, from, to);
      setRows(data);
    } catch (e) {
      setErr(e.message || "Failed to load attendance log.");
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <RangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onGenerate={generate} busy={busy} />
      {err && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{err}</div>}

      {rows && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>
              {rows.length} record{rows.length !== 1 ? "s" : ""} · {fmtDDMMYYYY(from)} to {fmtDDMMYYYY(to)}
            </div>
            <button className="btn btn-out" onClick={() => downloadAttendanceLogPdf(rows, from, to)} disabled={!rows.length}>
              {Ico.dl} Download PDF
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No attendance records</div>
              <div className="empty-sub">No clock-in/out data for this date range across your sites.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Engineer Name</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Clock In</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Clock Out</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.date}-${r.name}-${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px 10px" }}>{fmtDDMMYYYY(r.date)}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.name}</td>
                      <td
                        style={{
                          padding: "8px 10px",
                          textAlign: "center",
                          color: !r.clockIn ? "var(--red)" : r.late ? "var(--amber2, #d97706)" : "inherit",
                        }}
                      >
                        {fmtTimeIST(r.clockIn)}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          textAlign: "center",
                          color: !r.clockOut ? "var(--red)" : "inherit",
                        }}
                      >
                        {fmtTimeIST(r.clockOut)}
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

function EngineerExcelReport({ sites }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sheets, setSheets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [employeeKey, setEmployeeKey] = useState("all");
  const [employees, setEmployees] = useState([]);
  const sitesKey = (sites || []).join("|");

  useEffect(() => {
    let live = true;
    resolveAllSiteEngineers(sites)
      .then((list) => {
        if (!live) return;
        setEmployees(list || []);
      })
      .catch(() => {
        if (live) setEmployees([]);
      });
    return () => { live = false; };
  }, [sitesKey]);

  const employeeOptions = useMemo(() => {
    const byKey = new Map();
    (employees || []).forEach((e) => {
      const key = employeeOptionKey(e);
      if (key) byKey.set(key, e);
    });
    (sheets || []).forEach((s) => {
      const key = employeeOptionKey(s);
      if (key && !byKey.has(key)) byKey.set(key, { username: s.username, name: s.name });
    });
    return [...byKey.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [employees, sheets]);

  const visibleSheets = !sheets ? null : sheets.filter((s) => employeeMatches(s, employeeKey));

  const generate = async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await fetchEngineerExcelReport(sites, from, to, employeeKey);
      setSheets(data);
    } catch (e) {
      setErr(e.message || "Failed to build engineer Excel report.");
      setSheets(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <RangeFilter
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        onGenerate={generate}
        busy={busy}
        extra={(
          <div className="fgroup col2">
            <label className="flabel">Employee <span className="req">*</span></label>
            <select
              className="finput"
              value={employeeKey}
              onChange={(e) => setEmployeeKey(e.target.value)}
            >
              <option value="all">All Employees</option>
              {employeeOptions.map((e) => {
                const key = employeeOptionKey(e);
                return (
                  <option key={key} value={key}>{e.name}</option>
                );
              })}
            </select>
          </div>
        )}
      />
      {err && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{err}</div>}

      {visibleSheets && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>
              {employeeKey === "all"
                ? `${visibleSheets.length} employee${visibleSheets.length !== 1 ? "s" : ""} · ${fmtDDMMYYYY(from)} to ${fmtDDMMYYYY(to)} · one Excel sheet per employee`
                : `${visibleSheets[0]?.name || "Selected employee"} · ${fmtDDMMYYYY(from)} to ${fmtDDMMYYYY(to)}`}
            </div>
            <button
              className="btn btn-out"
              onClick={() => downloadEngineerExcel(visibleSheets, from, to)}
              disabled={!visibleSheets.length}
            >
              {Ico.dl} Download Excel
            </button>
          </div>

          {visibleSheets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">{employeeKey === "all" ? "No site engineers found" : "No report for this employee"}</div>
              <div className="empty-sub">
                {employeeKey === "all"
                  ? "No site engineers are assigned for the selected sites."
                  : "Generate the report again after selecting this employee."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {visibleSheets.map((s) => (
                <div key={s.username || s.name} style={{ overflowX: "auto" }}>
                  <div style={{
                    textAlign: "center",
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: ".04em",
                    padding: "10px 8px",
                    background: "#bdd7ee",
                    color: "#1a3a5c",
                    border: "1px solid #9eb3cc",
                  }}>
                    {String(s.name || "").toUpperCase()}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: "#1f4e79", color: "#fff" }}>
                        <th style={{ padding: "8px 8px" }}>Date</th>
                        <th style={{ padding: "8px 8px", textAlign: "left" }}>Employee Name</th>
                        <th style={{ padding: "8px 8px" }}>Check In Time</th>
                        <th style={{ padding: "8px 8px" }}>Check In Location</th>
                        <th style={{ padding: "8px 8px" }}>Check Out Time</th>
                        <th style={{ padding: "8px 8px" }}>Check Out Location</th>
                        <th style={{ padding: "8px 8px" }}>Status</th>
                        <th style={{ padding: "8px 8px" }}>Late Minutes</th>
                        <th style={{ padding: "8px 8px" }}>Morning Report</th>
                        <th style={{ padding: "8px 8px" }}>Evening DPR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r) => (
                        <tr key={`${s.username}-${r.date}`} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "7px 8px", textAlign: "center" }}>{fmtDMonYY(r.date)}</td>
                          <td style={{ padding: "7px 8px" }}>{r.name}</td>
                          <td style={{ padding: "7px 8px", textAlign: "center", fontWeight: pendText(fmtTimeIST24(r.clockIn)) === "Pend" ? 700 : undefined, color: pendText(fmtTimeIST24(r.clockIn)) === "Pend" ? "var(--amber2, #d97706)" : undefined }}>{pendText(fmtTimeIST24(r.clockIn))}</td>
                          <td style={{ padding: "7px 8px", textAlign: "center" }}>{locationCell(r.clockInLocation, r.clockInMaps)}</td>
                          <td style={{ padding: "7px 8px", textAlign: "center", fontWeight: pendText(fmtTimeIST24(r.clockOut)) === "Pend" ? 700 : undefined, color: pendText(fmtTimeIST24(r.clockOut)) === "Pend" ? "var(--amber2, #d97706)" : undefined }}>{pendText(fmtTimeIST24(r.clockOut))}</td>
                          <td style={{ padding: "7px 8px", textAlign: "center" }}>{locationCell(r.clockOutLocation, r.clockOutMaps)}</td>
                          <td style={{
                            padding: "7px 8px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: r.status === "Late" || r.status === "Pend" ? "var(--amber2, #d97706)"
                              : r.status === "On Leave" ? "#7c3aed"
                              : r.status === "On Time" ? "var(--green)" : "inherit",
                          }}>{r.status}</td>
                          <td style={{ padding: "7px 8px", textAlign: "center" }}>{r.lateMinutes}</td>
                          <td style={{
                            padding: "7px 8px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: r.morning === "Done" ? "var(--green)" : r.morning === "On Leave" ? "#7c3aed" : "var(--amber2, #d97706)",
                          }}>{r.morning}</td>
                          <td style={{
                            padding: "7px 8px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: r.evening === "Done" ? "var(--green)" : r.evening === "On Leave" ? "#7c3aed" : "var(--amber2, #d97706)",
                          }}>{r.evening}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AddDrawings({ sites, drawingForm, setDrawingForm, drawingSubmitting, onSubmit }) {
  return (
    <div>
      <div className="grid2">
        <div className="fgroup">
          <label className="flabel">Site Name <span className="req">*</span></label>
          <select
            className="finput"
            value={drawingForm.site_name}
            onChange={(e) => setDrawingForm((p) => ({ ...p, site_name: e.target.value }))}
          >
            <option value="">Select site…</option>
            {sites.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="fgroup">
          <label className="flabel">
            Date <span style={{ fontSize: 11, color: "var(--ink3)" }}>(defaults to today)</span>
          </label>
          <input
            type="date"
            className="finput"
            value={drawingForm.date}
            max={todayISO()}
            onChange={(e) => setDrawingForm((p) => ({ ...p, date: e.target.value }))}
          />
        </div>
        <div className="fgroup col2">
          <label className="flabel">Drawing Attachments <span className="req">*</span></label>
          <input
            type="file"
            multiple
            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            className="finput"
            onChange={(e) => {
              const newFiles = Array.from(e.target.files || []);
              setDrawingForm((p) => ({ ...p, files: [...p.files, ...newFiles] }));
              e.target.value = "";
            }}
          />
          {drawingForm.files.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {drawingForm.files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontSize: 12, background: "#f8fafc", border: "1px solid var(--line)",
                    borderRadius: 6, padding: "5px 10px",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </span>
                  <button
                    onClick={() =>
                      setDrawingForm((p) => ({ ...p, files: p.files.filter((_, idx) => idx !== i) }))
                    }
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontWeight: 700 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>
            Multiple files allowed — PDF, DWG, DXF, images, and Word docs supported.
          </span>
        </div>
      </div>
      <div className="act-row">
        <button className="btn btn-out" onClick={() => setDrawingForm({ site_name: "", date: "", files: [] })}>
          Reset
        </button>
        <button className="btn btn-pri" onClick={onSubmit} disabled={drawingSubmitting}>
          {drawingSubmitting ? "Uploading…" : "Upload Drawings"}
        </button>
      </div>
    </div>
  );
}

function AllDrawings({ drawings, loading, onAddClick }) {
  if (loading) return <Loading />;

  if (!drawings.length) {
    return (
      <div className="empty-state">
        <div className="empty-title">No drawings uploaded yet</div>
        <div className="empty-sub">Add a drawing to get started.</div>
        <button className="btn btn-pri" style={{ marginTop: 12 }} onClick={onAddClick}>
          Add Drawings
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
      {drawings.flatMap((d) =>
        (d.file_urls || []).map((f, i) => {
          const isImg = isImageFile(f.url);
          return (
            <div
              key={`${d.id}-${i}`}
              style={{
                background: "var(--surface)", border: "1.5px solid var(--line)",
                borderTop: "3px solid #d97706", borderRadius: 10, overflow: "hidden",
                display: "flex", flexDirection: "column",
              }}
            >
              {isImg ? (
                <img src={f.url} alt="" style={{ width: "100%", height: 150, objectFit: "cover" }} />
              ) : (
                <div
                  style={{ position: "relative", overflow: "hidden", height: 150, cursor: "pointer" }}
                  onClick={() => window.open(getViewUrl(f.url), "_blank")}
                >
                  <iframe
                    src={`${f.url}#toolbar=0&navpanel=0&scrollbar=0&view=FitH`}
                    title={f.name}
                    loading="lazy"
                    scrolling="no"
                    style={{
                      position: "absolute", top: 0, left: -20, width: "calc(100% + 40px)",
                      height: "260%", border: "none", pointerEvents: "none",
                    }}
                  />
                </div>
              )}
              <div style={{ padding: "13px 15px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5, alignSelf: "flex-start",
                    fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                    background: "#fef3c7", color: "#d97706",
                  }}
                >
                  Drawing
                </span>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{f.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink3)" }}>
                  {d.site_name} · {fmtDDMMYYYY(d.date)}
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <a
                    href={getViewUrl(f.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-out"
                    style={{ flex: 1, height: 34, justifyContent: "center" }}
                  >
                    View
                  </a>
                  <a
                    href={f.url}
                    download
                    className="btn btn-out"
                    style={{ flex: 1, height: 34, justifyContent: "center", color: "#0369a1" }}
                  >
                    Download
                  </a>
                </div>
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DPR SHEET SCREEN
// ═══════════════════════════════════════════════════════════════════════════

function DprSheetReport({ sites }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState(null); // { rows, dates }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const generate = async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await fetchDprSheet(sites, from, to);
      setResult(data);
    } catch (e) {
      setErr(e.message || "Failed to load DPR sheet.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <RangeFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onGenerate={generate} busy={busy} />
      {err && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{err}</div>}

      {result && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>
              {result.rows.length} row{result.rows.length !== 1 ? "s" : ""} · Period: {fmtDMonYYYY(from)} to {fmtDMonYYYY(to)}
            </div>
            <button
              className="btn btn-out"
              onClick={() => downloadDprPdf(result.rows, result.dates, from, to)}
              disabled={!result.rows.length}
            >
              {Ico.dl} Download PDF
            </button>
          </div>

          {result.rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No sites found</div>
              <div className="empty-sub">No sites are assigned to your account.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--line)" }}>
                    <th style={{ padding: "8px 6px" }}>SR NO</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>ENGINEER NAME</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>SITE NAME</th>
                    {result.dates.map((d) => {
                      const dt = new Date(d + "T00:00:00");
                      return (
                        <th key={d} style={{ padding: "8px 6px", textAlign: "center", whiteSpace: "nowrap" }}>
                          {pad(dt.getDate())}<br />{MONTHS_SHORT[dt.getMonth()]}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={`${r.srNo}-${r.site}-${r.engineer}`} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "8px 6px", textAlign: "center" }}>{r.srNo}</td>
                      <td style={{ padding: "8px 10px" }}>{r.engineer}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.site}</td>
                      {r.days.map((status, i) => (
                        <td
                          key={i}
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            fontWeight: 700,
                            fontSize: 11,
                            color: status === "DONE" ? "var(--green)" : "var(--amber2, #d97706)",
                          }}
                        >
                          {status}
                        </td>
                      ))}
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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MDO PORTAL
// ═══════════════════════════════════════════════════════════════════════════

const NAV = [
  { key: "attendance", label: "Attendance Report", icon: Ico.attendance },
  { key: "attendance-log", label: "Attendance Log", icon: Ico.log },
  { key: "engineer-excel", label: "Employee Report", icon: Ico.excel },
  { key: "dpr", label: "Daily Report (DPR)", icon: Ico.dpr },
  { key: "add-drawings", label: "Add Drawings", icon: Ico.addDrawing },
  { key: "all-drawings", label: "All Drawings", icon: Ico.allDrawings },
  { key: "apply-leave", label: "Apply Leave", icon: Ico.apply },
  { key: "my-leave", label: "My Leave", icon: Ico.leave },
  { key: "proxy-request", label: "Leave Approvals", icon: Ico.proxy },
];

const NAV_COLORS = {
  attendance: "#2563eb",
  "attendance-log": "#2563eb",
  "engineer-excel": "#0f766e",
  dpr: "#16a34a",
  "apply-leave": "#7c3aed",
  "my-leave": "#7c3aed",
  "proxy-request": "#eb2727",
  "add-drawings": "#d97706",
  "all-drawings": "#d97706",
};

const LEAVE_TYPES = [
  "Casual Leave", "Sick Leave", "Earned Leave",
  "Maternity Leave", "Paternity Leave", "Compensatory Leave", "Unpaid Leave",
];
export function deriveLeaveStatus(levelApproved, headApproved) {
  if (levelApproved === false || headApproved === false) return "rejected";
  if (levelApproved === true && headApproved === true) return "approved";
  return "pending";
}

export function mergeRejectionReason(existing, slot, by, reason) {
  const arr = Array.isArray(existing) ? existing.filter((r) => r.slot !== slot) : [];
  arr.push({ slot, by, reason, at: new Date().toISOString() });
  return arr;
}
function isLeaveFullyApproved(leave) {
  const proxyDone = !leave.proxy_user_name || leave.proxy_approved === true;
  if (!proxyDone) return false;
  const hasChain = !!(leave.level_approver_user_name || leave.head_approver_user_name);
  if (hasChain) {
    const levelDone = !leave.level_approver_user_name || leave.level_approved === true;
    const headDone = !leave.head_approver_user_name || leave.head_approved === true;
    return levelDone && headDone;
  }
  return leave.admin_approved === true;
}

async function transferTasksToProxy(leave, showToast) {
  if (!leave.proxy_user_name || !leave.from_date || !leave.to_date) return;
  const { data: tasksToMove, error } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("assigned_to", leave.user_name)
    .neq("status", "completed")
    .gte("due_date", leave.from_date)
    .lte("due_date", leave.to_date);
  if (error || !tasksToMove?.length) return;
  const ids = tasksToMove.map((t) => t.id);
  await supabase.from("tasks").update({ assigned_to: leave.proxy_user_name }).in("id", ids);
  showToast?.(
    `${tasksToMove.length} task${tasksToMove.length > 1 ? "s" : ""} transferred to you for the leave period.`,
  );
}
function ProxyLeaveApproval({ user }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const fetchLeaves = useCallback(async () => {
  setLoading(true);
  const { data, error } = await supabase
    .from("leaves")
    .select("*")
    .eq("proxy_user_name", user.user_name)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("ProxyLeaveApproval fetch error:", error);
  }

  console.log("Fetched leaves for proxy", user.user_name, data);
  setLeaves(data || []);
  setLoading(false);
}, [user.user_name]);
  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  const approve = async (leave) => {
    setUpdatingId(leave.id);
    const { error } = await supabase  
      .from("leaves")
      .update({ proxy_approved: true })
      .eq("id", leave.id);
    setUpdatingId(null);
    if (error) return showToast("Failed: " + error.message);
    const updated = { ...leave, proxy_approved: true };
    setLeaves((prev) => prev.map((l) => (l.id === leave.id ? updated : l)));
    showToast("Leave approved.");
    if (isLeaveFullyApproved(updated)) {
      await transferTasksToProxy(updated, showToast);
    }
  };

  const openReject = (leave) => { setRejectTarget(leave); setRejectReason(""); };

  const confirmReject = async () => {
    if (!rejectReason.trim() || !rejectTarget) return;
    setUpdatingId(rejectTarget.id);
    const merged = mergeRejectionReason(
      rejectTarget.rejection_reason, "proxy", user.name, rejectReason.trim(),
    );
    const { error } = await supabase
      .from("leaves")
      .update({ proxy_approved: false, rejection_reason: merged })
      .eq("id", rejectTarget.id);
    setUpdatingId(null);
    if (error) { showToast("Failed: " + error.message); setRejectTarget(null); return; }
    setLeaves((prev) =>
      prev.map((l) => (l.id === rejectTarget.id ? { ...l, proxy_approved: false, rejection_reason: merged } : l)),
    );
    setRejectTarget(null);
    showToast("Leave rejected.");
  };

  if (loading) return <Loading />;

  const pending = leaves.filter((l) => l.proxy_approved === null || l.proxy_approved === undefined);
  const actioned = leaves.filter((l) => l.proxy_approved === true || l.proxy_approved === false);

  return (
    <div>
      {leaves.length === 0 ? (
        <div className="empty-state">
          <div className="empty-ico">{Ico.leave}</div>
          <div className="empty-title">No leave requests routed to you</div>
          <div className="empty-sub">You haven't been selected as a proxy for anyone's leave yet.</div>
        </div>
      ) : (
        <div className="lv-list">
          {[...pending, ...actioned].map((l) => {
            const days = l.from_date && l.to_date
              ? Math.ceil((new Date(l.to_date) - new Date(l.from_date)) / 86400000) + 1
              : null;
            const isPending = l.proxy_approved === null || l.proxy_approved === undefined;
            return (
              <div key={l.id} className="lv-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div className="lv-type">{l.name || l.user_name}</div>
                    <div className="lv-dates">
                      {l.leave_type} · {fmtD(l.from_date)} → {fmtD(l.to_date)}
                      {days && <> · <strong>{days} day{days > 1 ? "s" : ""}</strong></>}
                    </div>
                    {l.reason && <div className="lv-reason">"{l.reason}"</div>}
                  </div>
                  <span className={`badge ${l.proxy_approved === true ? "badge-green" : l.proxy_approved === false ? "badge-red" : "badge-amber"}`}>
                    {l.proxy_approved === true ? "Approved" : l.proxy_approved === false ? "Rejected" : "Pending"}
                  </span>
                </div>
                {isPending ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-pri" style={{ flex: 1 }} disabled={updatingId === l.id} onClick={() => approve(l)}>
                      {updatingId === l.id ? "Saving…" : "Approve"}
                    </button>
                    <button className="btn btn-red" style={{ flex: 1 }} disabled={updatingId === l.id} onClick={() => openReject(l)}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--ink2)" }}>
                    {l.proxy_approved ? "✓ You approved this — their tasks will be covered by you." : "✗ You rejected this."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejectTarget && (
        <div onClick={() => !updatingId && setRejectTarget(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,13,10,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 400, padding: 24, border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Reject this leave?</div>
            <textarea
              className="finput" rows={3} placeholder="Reason for rejection…"
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => setRejectTarget(null)}>Cancel</button>
              <button className="btn btn-red" style={{ flex: 1 }} disabled={!rejectReason.trim() || !!updatingId} onClick={confirmReject}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "#f0fdf4", color: "var(--green)", border: "1.5px solid #bbf7d0" }}>
          {toast}
        </div>
      )}
    </div>
  );
} 
// MDO leaves skip the site-role chain entirely and go straight to
// whichever user_details row has role = "Admin".
async function findAdminApprover() {
  const { data: fromUsers } = await fromMaybe("users", (q) =>
    q.select("username, full_name, role").ilike("role", "admin").eq("is_active", true).limit(1)
  );
  const u = Array.isArray(fromUsers) ? fromUsers[0] : fromUsers;
  if (u?.username) return { username: u.username, name: u.full_name, role: u.role };
  const { data } = await fromMaybe("user_details", (q) =>
    q.select("username, name, role").ilike("role", "Admin").limit(1)
  );
  const d = Array.isArray(data) ? data[0] : data;
  return d || null;
}
function ApplyLeave({ user }) {
  const empty = { leave_type: "", from_date: "", to_date: "", reason: "", proxy_user_name: "" };
  const [form, setForm] = useState(empty);
  const [proxyCandidates, setProxyCandidates] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  const [admin, setAdmin] = useState(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const sites =
    Array.isArray(user.site_names) && user.site_names.length
      ? user.site_names
      : user.site_name
        ? [user.site_name]
        : [];
  const site = sites[0] || "MDO Office";

  const showToast = (msg, ms = 4500) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

useEffect(() => {
    setAdminLoading(true);
    findAdminApprover().then(setAdmin).finally(() => setAdminLoading(false));
  }, []);

  useEffect(() => {
    (async () => {
      const { data: users } = await fromMaybe("users", (q) =>
        q.select("username, full_name, department, designation, role, is_active")
      );
      const fromUsers = (users || [])
        .filter((u) => u.is_active !== false && u.username && u.username !== user.user_name)
        .filter((u) => {
          const dept = String(u.department || "").trim().toLowerCase();
          return dept === "mdo office" || dept === "engineer office" || /process controller/i.test(`${u.designation} ${u.role} ${u.department}`);
        })
        .map((u) => ({ username: u.username, name: u.full_name || u.username, department: u.department }));
      if (fromUsers.length) {
        setProxyCandidates(fromUsers.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
        return;
      }
      const { data } = await fromMaybe("user_details", (q) => q.select("username, name, department"));
      const pool = (data || []).filter((u) => {
        const dept = String(u.department || "").trim().toLowerCase();
        return (dept === "mdo office" || dept === "engineer office") && u.username !== user.user_name;
      });
      setProxyCandidates(pool.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    })();
  }, [user.user_name]);

  const days =
    form.from_date && form.to_date && new Date(form.to_date) >= new Date(form.from_date)
      ? Math.ceil((new Date(form.to_date) - new Date(form.from_date)) / 86400000) + 1
      : null;

const submit = async () => {
  const missing = [];
  if (!form.leave_type) missing.push("Leave Type");
  if (!form.from_date) missing.push("From Date");
  if (!form.to_date) missing.push("To Date");
  if (!form.reason.trim()) missing.push("Reason");
  if (!form.proxy_user_name) missing.push("Proxy");

  if (missing.length) {
    setInvalidFields(missing);
    showToast(`Please fill: ${missing.join(", ")}`);
    setErr("");
    return;
  }

  setInvalidFields([]);
  setBusy(true);
  setErr("");

  const proxyUser = proxyCandidates.find((u) => u.username === form.proxy_user_name);

  const { error } = await supabase.from("leaves").insert({
    user_name: user.user_name,
    name: user.name,
    leave_type: form.leave_type,
    from_date: form.from_date,
    to_date: form.to_date,
    reason: form.reason || null,
    site_name: site,
    admin_approved: null,
    approved_by: null,
    rejection_reason: null,
    status: "Pending",
    proxy_user_name: form.proxy_user_name,
    proxy_name: proxyUser?.name || form.proxy_user_name,
    proxy_approved: null,
  });

  setBusy(false);
  if (error) { setErr(error.message); return; }
  setSubmitted(true);
};
  if (submitted)
    return (
      <div className="success-state">
        <div className="success-ico">{Ico.check}</div>
        <div className="success-title">Leave Application Submitted!</div>
        <div className="success-sub">Your request is pending approval. You'll be notified once reviewed.</div>
        <button className="btn btn-pri" onClick={() => { setSubmitted(false); setForm(empty); }}>
          Apply Another
        </button>
      </div>
    );

  return (
    <div>
      <div className="info-banner" style={{ marginBottom: 20, display: "flex", gap: 8 }}>
        <span>{Ico.info}</span>
        <span>Your leave will be reviewed by an Admin.</span>
      </div>
      {err && <div className="info-banner warn-banner" style={{ marginBottom: 16 }}>{Ico.info} {err}</div>}

      <div className="grid2">
        <div className="fgroup col2">
          <label className="flabel">Leave Type <span className="req">*</span></label>
          <select
            className="finput"
            value={form.leave_type}
            onChange={(e) => { set("leave_type", e.target.value); setInvalidFields((f) => f.filter((x) => x !== "Leave Type")); }}
            style={invalidFields.includes("Leave Type") ? { borderColor: "var(--red)", boxShadow: "0 0 0 3px rgba(220,38,38,.12)" } : undefined}
          >
            <option value="">Select leave type…</option>
            {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="fgroup">
          <label className="flabel">From Date <span className="req">*</span></label>
          <input type="date" className="finput" value={form.from_date}
            onChange={(e) => { set("from_date", e.target.value); setInvalidFields((f) => f.filter((x) => x !== "From Date")); }}
            style={invalidFields.includes("From Date") ? { borderColor: "var(--red)" } : undefined} />
        </div>
        <div className="fgroup">
          <label className="flabel">To Date <span className="req">*</span></label>
          <input type="date" className="finput" value={form.to_date} min={form.from_date || undefined}
            onChange={(e) => { set("to_date", e.target.value); setInvalidFields((f) => f.filter((x) => x !== "To Date")); }}
            style={invalidFields.includes("To Date") ? { borderColor: "var(--red)" } : undefined} />
        </div>
        {days && (
          <div className="col2" style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--green)" }}>
            {days} day{days > 1 ? "s" : ""} of leave
          </div>
        )}
        <div className="fgroup col2">
          <label className="flabel">Reason <span className="req">*</span></label>
          <textarea className="finput" rows={3} placeholder="Briefly describe the reason…" value={form.reason}
            onChange={(e) => { set("reason", e.target.value); setInvalidFields((f) => f.filter((x) => x !== "Reason")); }}
            style={invalidFields.includes("Reason") ? { borderColor: "var(--red)" } : undefined} />
        </div>
        <div className="fgroup col2">
          <label className="flabel">
            Proxy (covers your tasks while on leave) <span className="req">*</span>
          </label>
          <select
            className="finput"
            value={form.proxy_user_name}
            onChange={(e) => { set("proxy_user_name", e.target.value); setInvalidFields((f) => f.filter((x) => x !== "Proxy")); }}
            style={invalidFields.includes("Proxy") ? { borderColor: "var(--red)" } : undefined}
          >
            <option value="">Select a proxy…</option>
            {proxyCandidates.map((u) => (
              <option key={u.username} value={u.username}>{u.name}</option>
            ))}
          </select>
          <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>
            Both your proxy and the admin must approve before this leave is confirmed.
            Your pending tasks due during the leave period will be handed to them.
          </span>
        </div>
      </div>
      <div className="act-row">
        <button className="btn btn-out" onClick={() => setForm(empty)}>Reset</button>
        <button className="btn btn-pri" onClick={submit} disabled={busy || adminLoading}>
          {Ico.send} {busy ? "Submitting…" : "Submit Application"}
        </button>
      </div>
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "#fef2f2", color: "var(--red)", border: "1.5px solid #fecaca" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
function computeLeaveStatus(leave) {
  const s = (leave.status || "").toLowerCase();
  if (leave.admin_approved === false || s === "rejected") return "rejected";
  if (leave.admin_approved === true || s === "approved") return "approved";
  return "pending";
}

function MyLeave({ user, onApply }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("leaves")
        .select("*")
        .eq("user_name", user.user_name)
        .order("created_at", { ascending: false });
      setLeaves(data || []);
      setLoading(false);
    })();
  }, [user.user_name]);

const canCancel = (l) => {
  if (computeLeaveStatus(l) !== "pending") return false;
  if (l.admin_approved !== null && l.admin_approved !== undefined) return false;
  return true;
};
  const requestCancel = (l, e) => { e.stopPropagation(); setConfirmLeave(l); };

  const confirmCancel = async () => {
    if (!confirmLeave) return;
    setCancellingId(confirmLeave.id);
    const { error } = await supabase.from("leaves").delete().eq("id", confirmLeave.id);
    setCancellingId(null);
    if (error) { alert("Failed to cancel leave: " + error.message); setConfirmLeave(null); return; }
    setLeaves((prev) => prev.filter((x) => x.id !== confirmLeave.id));
    setConfirmLeave(null);
  };

  const badgeCls = { approved: "badge-green", pending: "badge-amber", rejected: "badge-red" };
  const counts = { total: leaves.length, approved: 0, pending: 0, rejected: 0 };
  leaves.forEach((l) => { const s = computeLeaveStatus(l); if (counts[s] !== undefined) counts[s]++; });

  const dayCount = (from, to) => (!from || !to ? null : Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1);

  if (loading) return <Loading />;

  return (
    <div>
      <div className="stat-row">
        {[["Total", counts.total, "var(--ink)"], ["Approved", counts.approved, "var(--green)"], ["Pending", counts.pending, "var(--amber)"], ["Rejected", counts.rejected, "var(--red)"]].map(([l, v, c]) => (
          <div key={l} className="stat-card">
            <div className="stat-val" style={{ color: c }}>{v}</div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      <div className="lv-list">
        {leaves.length === 0 ? (
          <div className="empty-state">
            <div className="empty-ico">{Ico.leave}</div>
            <div className="empty-title">No leave applications yet</div>
            <div className="empty-sub">Apply for your first leave below.</div>
          </div>
        ) : (
          leaves.map((l) => {
            const status = computeLeaveStatus(l);
            const days = dayCount(l.from_date, l.to_date);
            const isOpen = expanded === l.id;
            const showCancel = canCancel(l);
            const isCancelling = cancellingId === l.id;
            return (
              <div key={l.id} className="lv-item" style={{ flexDirection: "column", alignItems: "stretch", cursor: "pointer", gap: 0 }} onClick={() => setExpanded(isOpen ? null : l.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="lv-left">
                    <div className="lv-type">{l.leave_type}</div>
                    <div className="lv-dates">
                      {fmtD(l.from_date)} → {fmtD(l.to_date)}
                      {days && <> · <strong>{days} day{days > 1 ? "s" : ""}</strong></>}
                    </div>
                    {l.reason && <div className="lv-reason">"{l.reason}"</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span className={`badge ${badgeCls[status]}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    {showCancel && (
                      <button className="btn btn-red btn-sm" onClick={(e) => requestCancel(l, e)} disabled={isCancelling} style={{ marginTop: 8, padding: "5px 10px", fontSize: 10.5 }}>
                        {isCancelling ? "Cancelling…" : "Cancel Leave"}
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, color: "var(--ink2)" }}>
                    {l.admin_approved === true && <span style={{ color: "var(--green)" }}>✓ Approved{l.approved_by ? ` by ${l.approved_by}` : ""}</span>}
                    {l.admin_approved === false && <span style={{ color: "var(--red)" }}>✗ Rejected</span>}
                    {(l.admin_approved === null || l.admin_approved === undefined) && <span style={{ color: "var(--amber2)" }}>Approval Pending</span>}
                    {l.rejection_reason && (
                      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", color: "var(--red)" }}>
                        <strong>Rejection reason:</strong> {l.rejection_reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 16, display: "flex" }}>
        <button className="btn btn-pri" onClick={onApply}>{Ico.plus} Apply New Leave</button>
      </div>

      {confirmLeave && (
        <div onClick={() => !cancellingId && setConfirmLeave(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,13,10,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 380, padding: 24, border: "1px solid var(--line)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Cancel this leave application?</div>
            <div style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 20 }}>
              <strong>{confirmLeave.leave_type}</strong> · {fmtD(confirmLeave.from_date)} → {fmtD(confirmLeave.to_date)}
              <br />This action cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-out" style={{ flex: 1 }} onClick={() => setConfirmLeave(null)} disabled={!!cancellingId}>Keep It</button>
              <button className="btn" style={{ flex: 1, background: "var(--red)", color: "#fff" }} onClick={confirmCancel} disabled={!!cancellingId}>
                {cancellingId ? "Cancelling…" : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const fmtD = (d) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export default function MDOPortal({ onLogout }) {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("attendance");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hoveredNavKey, setHoveredNavKey] = useState(null);
  const [drawingForm, setDrawingForm] = useState({ site_name: "", date: "", files: [] });
  const [drawingSubmitting, setDrawingSubmitting] = useState(false);
  const [allDrawings, setAllDrawings] = useState([]);
  const [loadingDrawings, setLoadingDrawings] = useState(false);
  const [allSites, setAllSites] = useState([]);

  const fetchDrawings = useCallback(async (u, siteList) => {
  if (!u) return;
  setLoadingDrawings(true);
  const drawingSites =
    (siteList && siteList.length)
      ? siteList
      : (u.site_names?.length ? u.site_names : u.site_name ? [u.site_name] : []);
  let q = supabase.from("drawings").select("*").order("date", { ascending: false });
  if (drawingSites.length) q = q.in("site_name", drawingSites);
  const { data, error } = await q;
  if (!error) setAllDrawings(data || []);
  setLoadingDrawings(false);
}, []);

const handleDrawingSubmit = async () => {
  if (!drawingForm.site_name) return alert("Please select a site.");
  if (!drawingForm.files.length) return alert("Please attach at least one drawing file.");

  const effectiveDate = drawingForm.date || todayISO();
  setDrawingSubmitting(true);
  try {
    const uploaded = await uploadDrawingFiles(supabase, drawingForm.site_name, effectiveDate, drawingForm.files);
    const { error } = await supabase.from("drawings").insert([
      {
        site_name: drawingForm.site_name,
        date: effectiveDate,
        file_urls: uploaded,
        uploaded_by: user.user_name,
      },
    ]);
    if (error) throw error;
    setDrawingForm({ site_name: "", date: "", files: [] });
    fetchDrawings(user, allSites);
    setActiveTab("all-drawings");
  } catch (err) {
    alert(err.message);
  }
  setDrawingSubmitting(false);
};

  const loadUser = useCallback(async () => {
    let parsed = null;
    try {
      const tf = localStorage.getItem("tf_user");
      if (tf) parsed = JSON.parse(tf);
    } catch { /* ignore */ }
    if (!parsed) {
      try {
        const stored = localStorage.getItem("user");
        if (stored) parsed = JSON.parse(stored);
      } catch { /* ignore */ }
    }
    if (!parsed) return;
    const shaped = {
      id: parsed.id,
      user_name: parsed.user_name || parsed.username,
      name: parsed.name || parsed.full_name,
      department: parsed.department || "",
      role: parsed.designation || parsed.role || "Process Controller",
      designation: parsed.designation || parsed.role || "",
      site_name: parsed.site_name || "",
      site_names: parsed.site_names || null,
    };
    setUser(shaped);

    const uname = shaped.user_name;
    let data = null;
    if (uname) {
      const { data: fromUsers } = await fromMaybe("users", (q) =>
        q.select("site_name, site_names, department, designation, full_name, role").eq("username", uname).maybeSingle()
      );
      const urow = fromUsers && !Array.isArray(fromUsers) ? fromUsers : (fromUsers || [])[0];
      if (urow) {
        data = {
          site_name: urow.site_name,
          site_names: urow.site_names,
          department: urow.department,
          role: urow.designation || urow.role || shaped.role,
          name: urow.full_name,
        };
      }
      if (!data) {
        const { data: fromDetails } = await fromMaybe("user_details", (q) =>
          q.select("site_name, site_names, department, role, name").eq("username", uname).maybeSingle()
        );
        const drow = fromDetails && !Array.isArray(fromDetails) ? fromDetails : (fromDetails || [])[0];
        if (drow) data = drow;
      }
      const { data: assigns } = await fromMaybe("user_site_assignments", (q) =>
        q.select("site_name").eq("user_name", uname)
      );
      const assigned = (assigns || []).map((a) => a.site_name).filter(Boolean);
      if (assigned.length) {
        data = {
          ...(data || {}),
          site_name: data?.site_name || assigned[0],
          site_names: uniqueNamesCaseInsensitive([...sitesOfRow(data), ...assigned]),
        };
      }
    }

    const ownSites = uniqueNamesCaseInsensitive(sitesOfRow(data || shaped));
    const all = await collectAllSiteNames();
    const site_names = ownSites.length ? ownSites : all;
    const updated = {
      ...shaped,
      name: data?.name || shaped.name,
      role: data?.role || shaped.role,
      site_name: site_names[0] || shaped.site_name,
      site_names,
      department: data?.department ?? shaped.department,
    };
    setUser(updated);
    setAllSites(all.length ? all : site_names);
    localStorage.setItem("user", JSON.stringify(updated));
  }, []);
useEffect(() => {
  collectAllSiteNames().then((names) => {
    if (names.length) setAllSites(names);
  });
}, []);
useEffect(() => {
    loadUser();
    const onResize = () => {
      if (window.innerWidth <= 768) setSidebarOpen(false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loadUser]);

  // ← add it here
  useEffect(() => {
    if (user) fetchDrawings(user, allSites);
  }, [user, allSites, fetchDrawings]);

  if (!user) {
    return (
      <div className="loading" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
        <span>Loading user…</span>
      </div>
    );
  }

  const ownSites = uniqueNamesCaseInsensitive(
    Array.isArray(user.site_names) && user.site_names.length
      ? user.site_names
      : user.site_name
        ? [user.site_name]
        : []
  );
  const sites = ownSites.length ? ownSites : allSites;

  const activeItem = NAV.find((n) => n.key === activeTab);

  return (
    <div>
      <Navbar onMenuToggle={() => setSidebarOpen((p) => !p)} menuOpen={sidebarOpen} onLogout={onLogout} />

      <div className="body">
        {sidebarOpen && window.innerWidth <= 768 && (
          <button className="sb-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />
        )}

        <aside className={`sidebar${sidebarOpen ? "" : " closed"}`}>
          <div style={{ padding: "14px 14px 6px", fontSize: 11, fontWeight: 800, letterSpacing: ".08em", color: "var(--ink3)", textTransform: "uppercase" }}>
            MDO Office Portal
          </div>
          <nav
          className="snav"
          style={{
            overflowY: "auto",
            maxHeight: "none",
            height: "auto",
            display: "flex",
            flexDirection: "column",
          }}  
        >
          {NAV.map((n) => {
            const color = NAV_COLORS[n.key] || "#2563eb";
            const highlighted = activeTab === n.key || hoveredNavKey === n.key;
            return (
              <button
                key={n.key}
                className={`sni${activeTab === n.key ? " act" : ""}`}
                onClick={() => {
                  setActiveTab(n.key);
                  if (window.innerWidth <= 768) setSidebarOpen(false);
                }}
                onMouseEnter={() => setHoveredNavKey(n.key)}
                onMouseLeave={() => setHoveredNavKey(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  visibility: "visible",
                  opacity: 1,
                  height: "auto",
                  minHeight: 40,
                  flexShrink: 0,
                  background: highlighted ? `${color}18` : undefined,
                  color: highlighted ? color : undefined,
                }}
              >
                {n.icon} {n.label}
              </button>
            );
          })}
        </nav>
        </aside>

        <main className="main">
          <div className="card">
            <div className="card-hdr">
              <div className="card-ico">{activeItem?.icon}</div>
              <span className="card-title">{activeItem?.label}</span>
            </div>

            <div className="info-banner" style={{ marginBottom: 20 }}>
              {user.name} · Access to <strong>{sites.length}</strong> site{sites.length !== 1 ? "s" : ""}
            </div>
                                                  
            {activeTab === "attendance" ? (
              <AttendanceReport sites={sites} />
            ) : activeTab === "attendance-log" ? (
              <AttendanceLog sites={sites} />
            ) : activeTab === "engineer-excel" ? (
              <EngineerExcelReport sites={sites} />
            ) : activeTab === "dpr" ? (
              <DprSheetReport sites={sites} />
            ) : activeTab === "add-drawings" ? (
              <AddDrawings
                sites={allSites}
                drawingForm={drawingForm}
                setDrawingForm={setDrawingForm}
                drawingSubmitting={drawingSubmitting}
                onSubmit={handleDrawingSubmit}
              />
            ) : activeTab === "all-drawings" ? (
              <AllDrawings
                drawings={allDrawings}
                loading={loadingDrawings}
                onAddClick={() => setActiveTab("add-drawings")}
              />
            ) : activeTab === "apply-leave" ? (
              <ApplyLeave user={user} />
            ) : activeTab === "proxy-request" ? (
              <ProxyLeaveApproval user={user} />
            ) : (
              <MyLeave user={user} onApply={() => setActiveTab("apply-leave")} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}