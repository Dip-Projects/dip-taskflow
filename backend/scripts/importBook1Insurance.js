/**
 * Import Book1.xlsx insurance sheets into Supabase storage:
 *   Sheet IFCO INS  → schedule (policy period / renew date)
 *   Sheet Sheet1    → POST Accident detail (contact, Aadhaar, PAN, nominee…)
 *
 * Usage:
 *   node scripts/importBook1Insurance.js [path-to-Book1.xlsx]
 * Default path: C:\Users\Admin\Downloads\Book1.xlsx
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const supabase = require('../lib/supabaseClient');

const BUCKET = 'documents';
const INSURANCE_PATH = 'hr/_meta/insurances.json';
const PROFILES_PATH = 'hr/_meta/employee_profiles.json';

const DEFAULT_XLSX = 'C:\\Users\\Admin\\Downloads\\Book1.xlsx';

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normName(s) {
  let n = String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  // common spelling variants in Book1
  const aliases = {
    CHARMYDESIA: 'CHARMYDESAI',
    NAMANVYASH: 'NAMANVYAS',
    NISARGPANDIYA: 'NISARGPANDYA',
    SALIMKHAN: 'SALIMNABUKHAN',
    AYUSHISHAH: 'AAYUSHISHAH',
    AMITKEDARIYA: 'AMITKESDIYA',
    ASHISHPATEL: 'ASHISHGANESHBHAIPATEL',
    YASHPATEL: 'YASHKUMARMAHESHBHAIPATEL',
    JAYLOH: 'LOHJAYKUMARBHIKHABHAI',
    TRUPALKAPADIYA: 'TRUPALNAVNEETLALKAPADIA',
    JIGNESHLAD: 'JIGNESHTHAKORBHAILAD',
    DIVYESHRANA: 'DIVYESHRAJESHBHAIRANA',
    KISHANKALSARIYA: 'KISHANLALJIBHAIKALSARIYA',
    ROCKYPATEL: 'ROCKYHASMUKHBHAIPATEL',
    ROSHANPATEL: 'ROSHANPRAFULKUMARPATEL',
    DHAVALKUMARCHAUDHARI: 'DHAVALKUMARSURESHBHAICHAUDHARI',
    PARESHSANDISH: 'PARESHBHAIMAHESHBHAISANDISH',
    AASHDEEPSINHMAHIDA: 'AASHDEEPSINHSHAILENDRASINHMAHIDA',
    RIPESHKUMARDHIMMAR: 'RIPESHKUMARJAGDISHBHAIDHIMMAR',
    NARAYANTANKSHAL: 'NARAYANCHANDRAPPATANKSHAL',
  };
  return aliases[n] || n;
}

function nameScore(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 90;
  // token overlap on original words
  const ta = String(a || '').toUpperCase().split(/\s+/).filter((t) => t.length > 2);
  const tb = String(b || '').toUpperCase().split(/\s+/).filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  let hit = 0;
  ta.forEach((t) => {
    if (tb.some((u) => u === t || u.includes(t) || t.includes(u))) hit += 1;
  });
  return Math.round((hit / Math.max(ta.length, tb.length)) * 80);
}

function findBest(name, list, getName) {
  let best = null;
  let score = 0;
  list.forEach((row) => {
    const s = nameScore(name, getName(row));
    if (s > score) {
      score = s;
      best = row;
    }
  });
  return score >= 70 ? best : null;
}

/** Parse "12-01-2026 TO 11-01-2027" or "09/07/2026 TO 08/07/2027" */
function parsePeriod(raw) {
  const s = String(raw || '').trim();
  if (!s) return { start: null, end: null, raw: '' };
  const m = s.match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*TO\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i
  );
  if (!m) return { start: null, end: null, raw: s };
  const iso = (d, mo, y) =>
    `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return {
    start: iso(m[1], m[2], m[3]),
    end: iso(m[4], m[5], m[6]),
    raw: s,
  };
}

function toIsoDate(v) {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function phoneStr(v) {
  if (v == null || v === '') return '';
  let n = String(v).replace(/\D/g, '');
  if (n.length === 10) n = `91${n}`;
  return n;
}

function loadSheetsViaPython(xlsxPath) {
  const py = `
import openpyxl, json
from datetime import datetime, date
wb=openpyxl.load_workbook(r'''${xlsxPath.replace(/\\/g, '\\\\')}''', data_only=True)
def ser(v):
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    if v is None: return None
    return v
out={}
for name in wb.sheetnames:
    rows=list(wb[name].iter_rows(values_only=True))
    out[name]=[[ser(c) for c in r] for r in rows]
print(json.dumps(out, ensure_ascii=False))
`;
  const raw = execFileSync('python', ['-c', py], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(raw);
}

async function ensureBucket() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '50MB' });
}

async function readJson(p, fallback) {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(p);
  if (error) return fallback;
  try {
    return JSON.parse(await data.text());
  } catch {
    return fallback;
  }
}

async function writeJson(p, value) {
  await ensureBucket();
  const body = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  const { error } = await supabase.storage.from(BUCKET).upload(p, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

function parseIfco(rows) {
  const out = [];
  for (const r of rows) {
    const sr = r[0];
    const name = String(r[1] || '').trim();
    if (!name || /staff name|ifco/i.test(name)) continue;
    if (sr == null && !name) continue;
    if (!/\d/.test(String(sr)) && typeof sr !== 'number') continue;
    const period = parsePeriod(r[3]);
    out.push({
      sr: sr,
      employee_name: name.replace(/\s+/g, ' ').trim(),
      joining_date: toIsoDate(r[2]),
      insurance_period: period.raw,
      start_date: period.start,
      renew_date: period.end,
      salary: r[4] ?? null,
      amount: r[5] ?? 1280,
      remark: r[6] || '',
      assigned_to: String(r[8] || '').trim() || '',
      followup_status: String(r[9] || '').trim() || '',
    });
  }
  return out;
}

function parsePost(rows) {
  const out = [];
  for (const r of rows) {
    const name = String(r[1] || '').trim();
    if (!name || /staff name|post accident/i.test(name)) continue;
    if (r[0] == null && !r[2]) continue;
    out.push({
      sr: r[0],
      employee_name: name.replace(/\s+/g, ' ').trim(),
      contact: phoneStr(r[2]),
      salary: r[3] ?? null,
      designation: String(r[4] || '').trim() || '',
      joining_date: toIsoDate(r[5]),
      amount: r[6] ?? 1280,
      aadhaar: String(r[7] || '').trim(),
      pan: String(r[8] || '').trim(),
      height: r[9] != null ? String(r[9]).trim() : '',
      weight: r[10] != null ? String(r[10]).trim() : '',
      medical_condition: String(r[11] || '').trim() || 'NO',
      nominee_details: String(r[12] || '').trim().replace(/\s+/g, ' '),
    });
  }
  return out;
}

async function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX;
  if (!fs.existsSync(xlsxPath)) {
    console.error('File not found:', xlsxPath);
    process.exit(1);
  }
  console.log('Reading', xlsxPath);
  const sheets = loadSheetsViaPython(xlsxPath);
  const ifcoKey = Object.keys(sheets).find((k) => /ifco/i.test(k)) || Object.keys(sheets)[0];
  const postKey = Object.keys(sheets).find((k) => k !== ifcoKey) || Object.keys(sheets)[1];
  const ifco = parseIfco(sheets[ifcoKey] || []);
  const post = parsePost(sheets[postKey] || []);
  console.log(`Parsed IFCO=${ifco.length}, POST details=${post.length}`);

  const existing = await readJson(INSURANCE_PATH, []);
  const byNorm = new Map();
  existing.forEach((row) => {
    const k = normName(row.employee_name);
    if (k) byNorm.set(k, row);
  });

  const now = new Date().toISOString();
  const merged = [];

  for (const row of ifco) {
    const detail = findBest(row.employee_name, post, (p) => p.employee_name);
    const prev = byNorm.get(normName(row.employee_name));
    const id = prev?.id || uid();
    const record = {
      id,
      employee_id: prev?.employee_id || null,
      employee_name: row.employee_name,
      policy_type: 'Accidental (IFCO)',
      policy_no: '',
      start_date: row.start_date,
      renew_date: row.renew_date,
      insurance_period: row.insurance_period,
      joining_date: row.joining_date || detail?.joining_date || null,
      amount: row.amount ?? detail?.amount ?? 1280,
      salary: row.salary ?? detail?.salary ?? null,
      status: row.followup_status || prev?.status || 'Active',
      assigned_to: row.assigned_to || '',
      remark: row.remark || '',
      whatsapp_number: detail?.contact || prev?.whatsapp_number || '',
      designation: detail?.designation || prev?.designation || '',
      aadhaar: detail?.aadhaar || prev?.aadhaar || '',
      pan: detail?.pan || prev?.pan || '',
      height: detail?.height || prev?.height || '',
      weight: detail?.weight || prev?.weight || '',
      medical_condition: detail?.medical_condition || prev?.medical_condition || '',
      nominee_details: detail?.nominee_details || prev?.nominee_details || '',
      source: 'Book1.xlsx',
      created_at: prev?.created_at || now,
      updated_at: now,
    };
    merged.push(record);
    byNorm.set(normName(row.employee_name), record);
  }

  // POST-only people not on IFCO sheet → still store for renew pack / contact
  for (const d of post) {
    const hit = findBest(d.employee_name, merged, (p) => p.employee_name);
    if (hit) continue;
    merged.push({
      id: uid(),
      employee_id: null,
      employee_name: d.employee_name,
      policy_type: 'Accidental (POST detail)',
      policy_no: '',
      start_date: null,
      renew_date: null,
      insurance_period: '',
      joining_date: d.joining_date,
      amount: d.amount,
      salary: d.salary,
      status: 'Pending arrange',
      assigned_to: '',
      remark: 'Imported from POST sheet — renew date missing',
      whatsapp_number: d.contact,
      designation: d.designation,
      aadhaar: d.aadhaar,
      pan: d.pan,
      height: d.height,
      weight: d.weight,
      medical_condition: d.medical_condition,
      nominee_details: d.nominee_details,
      source: 'Book1.xlsx',
      created_at: now,
      updated_at: now,
    });
  }

  await writeJson(INSURANCE_PATH, merged);

  // Profiles for WA / contact lookup
  const profiles = await readJson(PROFILES_PATH, []);
  const pByNorm = new Map(profiles.map((p) => [normName(p.employee_name), p]));
  for (const row of merged) {
    if (!row.whatsapp_number && !row.employee_name) continue;
    const key = normName(row.employee_name);
    const prev = pByNorm.get(key);
    const prof = {
      id: prev?.id || uid(),
      employee_id: prev?.employee_id || row.employee_id || null,
      employee_name: row.employee_name,
      dob: prev?.dob || null,
      whatsapp_number: row.whatsapp_number || prev?.whatsapp_number || '',
      designation: row.designation || prev?.designation || '',
      aadhaar: row.aadhaar || prev?.aadhaar || '',
      pan: row.pan || prev?.pan || '',
      updated_at: now,
    };
    pByNorm.set(key, prof);
  }
  await writeJson(PROFILES_PATH, [...pByNorm.values()]);

  const withRenew = merged.filter((r) => r.renew_date).length;
  const withContact = merged.filter((r) => r.whatsapp_number).length;
  console.log(`✅ Saved ${merged.length} insurance rows (${withRenew} with renew_date, ${withContact} with contact)`);
  console.log(`✅ Profiles: ${pByNorm.size}`);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
