const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin, requireAdminOrHr, isHrUser } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const BUCKET = 'documents';
const RECRUIT_PATH = 'hr/_meta/recruitments.json';
const DOCS_META_PATH = 'hr/_meta/employee_documents.json';
const INSURANCE_PATH = 'hr/_meta/insurances.json';
const PROFILES_PATH = 'hr/_meta/employee_profiles.json';
const REMINDER_LOG_PATH = 'hr/_meta/reminder_log.json';
const HR_STAFF_PATH = 'hr/_meta/hr_employees.json';
const JOINING_FORMS_PATH = 'hr/_meta/joining_forms.json';

const DOC_FIELD_NAMES = [
  'cv',
  'aadhaar_file',
  'pan_file',
  'photo',
  'bank_details',
  'salary_slip',
  'education_certs',
];

const publicDocsUpload = upload.fields([
  { name: 'cv', maxCount: 1 },
  { name: 'aadhaar_file', maxCount: 1 },
  { name: 'pan_file', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
  { name: 'bank_details', maxCount: 1 },
  { name: 'salary_slip', maxCount: 1 },
  { name: 'education_certs', maxCount: 8 },
]);

/** HR-only master lists (not TaskFlow users) */
const HR_DEPARTMENTS = [
  'Engg. Division',
  'MDO OFFICE',
  'PMC',
  'Sales',
  'Accounts',
  'HR',
  'Admin',
  'General',
];

const HR_DESIGNATIONS = [
  'Site Engineer',
  'Site Incharge',
  'Site Head',
  'SITE HEAD',
  'Team lead',
  'Coordinator',
  'Site Co-ordinater',
  'Office Head',
  'JR.ESTIMATOR',
  'Jr. Estimator',
  'MIS',
  'EA',
  'Sales Executive',
  'Process Controller',
  'Staff',
];

const RECRUIT_STATUSES = [
  'Request Received',
  'Post Create',
  'Post Live',
  'Shortlist',
  'Interview Lined Up',
  'Interview Done',
  'Offer Extended',
  'Approved',
  'Hired',
  'Rejected',
];

function isHead(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'head' || user.is_head) return true;
  const blob = `${user.role || ''} ${user.designation || ''} ${user.department || ''}`.toLowerCase();
  return /\bhead\b|project head|team lead/.test(blob);
}

function canHrOrAdmin(user) {
  return user?.role === 'admin' || isHrUser(user);
}

/** Timeline entry when recruitment status is set / changed */
function statusHistoryEntry({ from = null, to, by = null, by_name = 'System', note = '' } = {}) {
  return {
    from: from || null,
    to: String(to || '').trim() || 'Request Received',
    at: new Date().toISOString(),
    by,
    by_name: by_name || 'System',
    note: String(note || '').trim(),
  };
}

function ensureStatusHistory(row, actor) {
  if (Array.isArray(row.status_history) && row.status_history.length) return row.status_history;
  return [
    statusHistoryEntry({
      from: null,
      to: row.status || 'Request Received',
      by: row.submitted_by || actor?.id || null,
      by_name: row.submitted_by_name || actor?.full_name || actor?.username || 'System',
      note: 'Created',
    }),
  ];
}

async function ensureBucket() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '50MB',
  });
  if (error && !/already exists/i.test(error.message || '')) throw error;
}

async function readJson(path, fallback) {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) {
    if (/not found|404/i.test(error.message || '')) return fallback;
    // empty / missing
    return fallback;
  }
  const text = await data.text();
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await ensureBucket();
  const body = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeSeg(s) {
  return String(s || 'unknown')
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'unknown';
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function isClientStaff(row) {
  const blob = `${row?.department || ''} ${row?.designation || ''} ${row?.role || ''} ${row?.username || ''}`.toLowerCase();
  return /\bclient\b/.test(blob);
}

async function findOnboardTarget(token) {
  const staff = await readJson(HR_STAFF_PATH, []);
  const hrIdx = staff.findIndex((r) => r.onboard_token === token);
  if (hrIdx >= 0) {
    return { kind: 'hr_only', staff, hrIdx, profiles: null, profileIdx: -1 };
  }
  const profiles = await readJson(PROFILES_PATH, []);
  const profileIdx = profiles.findIndex((r) => r.onboard_token === token);
  if (profileIdx >= 0) {
    return { kind: 'system', staff: null, hrIdx: -1, profiles, profileIdx };
  }
  return null;
}

function parseMaybeJson(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return fallback;
  }
}

async function uploadOneFile(file, folder) {
  if (!file) return null;
  await ensureBucket();
  const path = `${folder}/${uid()}_${safeSeg(file.originalname)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    path,
    url: urlData.publicUrl,
    name: file.originalname,
    mime: file.mimetype,
    size: file.size,
  };
}

async function collectUploadedDocs(files, folder) {
  const out = {};
  if (!files) return out;
  for (const key of DOC_FIELD_NAMES) {
    const arr = files[key];
    if (!arr?.length) continue;
    if (key === 'education_certs') {
      out[key] = [];
      for (const f of arr) {
        out[key].push(await uploadOneFile(f, folder));
      }
    } else {
      out[key] = await uploadOneFile(arr[0], folder);
    }
  }
  return out;
}

/** Case/spacing/middle-name tolerant name key */
function normNameKey(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function nameTokens(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function editDist(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function softTokenEqual(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)) return true;
  if (a.length >= 4 && b.length >= 4 && editDist(a, b) <= 2) return true;
  return false;
}

/** Fuzzy score 0–100 for DOB / staff matching */
function nameMatchScore(a, b) {
  const na = normNameKey(a);
  const nb = normNameKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 92;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const firstClose = softTokenEqual(ta[0], tb[0]);
  const lastClose = softTokenEqual(ta[ta.length - 1], tb[tb.length - 1]);
  if (firstClose && lastClose) return 88;
  if (lastClose && firstClose === false && softTokenEqual(ta[0].slice(0, 4), tb[0].slice(0, 4))) return 82;
  let hit = 0;
  ta.forEach((t) => {
    if (tb.some((u) => softTokenEqual(t, u))) hit += 1;
  });
  return Math.round((hit / Math.max(ta.length, tb.length)) * 85);
}

function findBestProfile(name, userId, profiles) {
  let best = null;
  let score = 0;
  for (const p of profiles) {
    if (!p.dob && !p.whatsapp_number) continue;
    if (userId && p.employee_id && p.employee_id === userId) return { profile: p, score: 100 };
    const s = nameMatchScore(name, p.employee_name);
    if (s > score) {
      score = s;
      best = p;
    }
  }
  if (score >= 70) return { profile: best, score };
  return { profile: null, score: 0 };
}

/** Cron auth (no JWT) — before requireAuth */
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const hdr = req.headers.authorization || '';
  return (
    (secret && hdr === `Bearer ${secret}`) ||
    (secret && req.query.secret === secret) ||
    (secret && req.headers['x-cron-secret'] === secret) ||
    (!secret && process.env.VERCEL !== '1')
  );
}

async function handleInsuranceCron(req, res) {
  try {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized cron' });
    const { runInsuranceRenewReminders } = require('../lib/insuranceReminders');
    const result = await runInsuranceRenewReminders();
    res.json(result);
  } catch (err) {
    console.error('Insurance WA cron:', err.message);
    res.status(500).json({ error: err.message || 'Cron failed' });
  }
}

/** Cron auth (no JWT) — before requireAuth */
router.post('/cron/insurance-whatsapp', handleInsuranceCron);
router.get('/cron/insurance-whatsapp', handleInsuranceCron);

/**
 * Public signed upload (apply / onboard) — browser PUTs file to Supabase,
 * so Vercel body limit does not block CVs / scans.
 * Only paths under hr/applications/ or hr/joining/ are allowed.
 */
router.post('/public/signed-upload', async (req, res) => {
  try {
    const path = String(req.body?.path || '').replace(/^\/+/, '');
    if (!path || !/^hr\/(applications|joining)\//.test(path)) {
      return res.status(400).json({ error: 'Invalid upload path' });
    }
    if (path.includes('..') || path.includes('\\')) {
      return res.status(400).json({ error: 'Invalid upload path' });
    }
    await ensureBucket();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error) {
      console.error('public signed-upload:', error.message);
      return res.status(500).json({ error: error.message });
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    res.json({
      bucket: BUCKET,
      path: data.path || path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: urlData.publicUrl,
    });
  } catch (err) {
    console.error('public signed-upload:', err.message);
    res.status(500).json({ error: err.message || 'Could not prepare upload' });
  }
});

function publicDocsUploadMaybe(req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return publicDocsUpload(req, res, (err) => {
      if (err) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 25MB). Try a smaller PDF/image.'
            : err.message || 'Upload parse failed';
        return res.status(400).json({ error: msg });
      }
      next();
    });
  }
  next();
}

function docsFromBodyMeta(raw) {
  const src = typeof raw === 'string' ? parseMaybeJson(raw, {}) : raw || {};
  const out = {};
  for (const key of DOC_FIELD_NAMES) {
    const v = src[key];
    if (!v) continue;
    if (key === 'education_certs' && Array.isArray(v)) {
      out[key] = v
        .filter((f) => f && f.path && f.url)
        .map((f) => ({
          path: String(f.path),
          url: String(f.url),
          name: String(f.name || 'file'),
          mime: f.mime || null,
          size: f.size || null,
        }));
    } else if (v.path && v.url) {
      out[key] = {
        path: String(v.path),
        url: String(v.url),
        name: String(v.name || 'file'),
        mime: v.mime || null,
        size: v.size || null,
      };
    }
  }
  return out;
}

/**
 * Public candidate application (QR / interview walk-in) — no login.
 * Required: name, mobile, aadhaar. Rest optional + file uploads.
 * Prefer JSON + pre-uploaded docs (signed URL); multipart still works for small files.
 */
router.post('/public/apply', publicDocsUploadMaybe, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.full_name || body.candidate_name || '').trim();
    const phone = String(body.mobile || body.phone || '').replace(/\D/g, '');
    const aadhaar = String(body.aadhaar || body.aadhaar_id || '').replace(/\D/g, '');
    if (!name) return res.status(400).json({ error: 'Full name is required' });
    if (phone.length < 10) return res.status(400).json({ error: 'Valid mobile number is required' });
    if (aadhaar.length < 12) return res.status(400).json({ error: 'Valid Aadhaar (12 digits) is required' });

    let docs = docsFromBodyMeta(body.documents);
    if (!docs.cv && req.files?.cv?.length) {
      docs = await collectUploadedDocs(req.files, `hr/applications/${uid()}`);
    }
    if (!docs.cv) return res.status(400).json({ error: 'Updated CV is required' });
    const education = parseMaybeJson(body.education, []);
    const sources = parseMaybeJson(body.sources, []);
    if (typeof body.sources === 'string' && !body.sources.trim().startsWith('[')) {
      sources.length = 0;
      String(body.sources)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => sources.push(s));
    }

    const application = {
      form_date: String(body.form_date || '').trim(),
      full_name: name,
      father_name: String(body.father_name || '').trim(),
      position_applied: String(body.position_applied || body.role_applied || '').trim(),
      dob: String(body.dob || '').trim(),
      gender: String(body.gender || '').trim(),
      marital_status: String(body.marital_status || '').trim(),
      native_place: String(body.native_place || '').trim(),
      mobile: phone,
      alternate_number: String(body.alternate_number || '').trim(),
      current_address: String(body.current_address || '').trim(),
      permanent_address: String(body.permanent_address || '').trim(),
      email: String(body.email || '').trim(),
      aadhaar,
      pan: String(body.pan || '').trim(),
      sources,
      source_other: String(body.source_other || '').trim(),
      education,
      current_organization: String(body.current_organization || '').trim(),
      current_designation: String(body.current_designation || '').trim(),
      total_experience: String(body.total_experience || '').trim(),
      current_ctc: String(body.current_ctc || '').trim(),
      expected_ctc: String(body.expected_ctc || '').trim(),
      notice_period: String(body.notice_period || '').trim(),
      reason_for_change: String(body.reason_for_change || '').trim(),
      documents: docs,
      declaration: body.declaration === 'true' || body.declaration === true,
    };

    const row = {
      id: uid(),
      candidate_name: name,
      role_applied: application.position_applied,
      phone,
      email: application.email,
      aadhaar,
      notes: '',
      status: 'Request Received',
      pipeline_step: 'Request Received',
      interview_at: null,
      interview_notes: '',
      cv_url: docs.cv?.url || null,
      cv_path: docs.cv?.path || null,
      application,
      source: 'public_qr',
      submitted_by: null,
      submitted_by_name: 'Walk-in / QR Apply',
      status_history: [
        statusHistoryEntry({
          from: null,
          to: 'Request Received',
          by: null,
          by_name: 'Walk-in / QR Apply',
          note: 'Application submitted',
        }),
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const list = await readJson(RECRUIT_PATH, []);
    list.unshift(row);
    await writeJson(RECRUIT_PATH, list);
    res.status(201).json({ ok: true, id: row.id, message: 'Application submitted successfully' });
  } catch (err) {
    console.error('public apply:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit application' });
  }
});

/** Prefill name for employee joining form (token from HR Employees QR) */
router.get('/public/onboard/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Invalid link' });
    const hit = await findOnboardTarget(token);
    if (!hit) return res.status(404).json({ error: 'Link expired or invalid' });

    if (hit.kind === 'hr_only') {
      const row = hit.staff[hit.hrIdx];
      if (row.joining_form_submitted_at) {
        return res.json({
          ok: true,
          already_submitted: true,
          full_name: row.full_name,
          designation: row.designation,
          department: row.department,
        });
      }
      return res.json({
        ok: true,
        already_submitted: false,
        full_name: row.full_name,
        designation: row.designation || '',
        department: row.department || '',
        email: row.email || '',
        phone: row.whatsapp_number || '',
        departments: HR_DEPARTMENTS,
      });
    }

    const row = hit.profiles[hit.profileIdx];
    if (row.joining_form_submitted_at) {
      return res.json({
        ok: true,
        already_submitted: true,
        full_name: row.employee_name,
        designation: row.designation,
        department: row.department,
      });
    }
    res.json({
      ok: true,
      already_submitted: false,
      full_name: row.employee_name || '',
      designation: row.designation || '',
      department: row.department || '',
      email: row.email || '',
      phone: row.whatsapp_number || '',
      departments: HR_DEPARTMENTS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load form' });
  }
});

/** Employee joining details + docs (no login). PDF is for HR only — not returned here. */
router.post('/public/onboard/:token', publicDocsUploadMaybe, async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    const hit = await findOnboardTarget(token);
    if (!hit) return res.status(404).json({ error: 'Link expired or invalid' });

    const target =
      hit.kind === 'hr_only' ? hit.staff[hit.hrIdx] : hit.profiles[hit.profileIdx];
    if (target.joining_form_submitted_at) {
      return res.status(409).json({ error: 'Form already submitted. Thank you.' });
    }

    const body = req.body || {};
    const name = String(
      body.employee_name ||
        body.full_name ||
        target.full_name ||
        target.employee_name ||
        ''
    ).trim();
    const phone = String(body.contact_number || body.mobile || body.phone || '').replace(/\D/g, '');
    const aadhaar = String(body.aadhaar || body.aadhaar_id || '').replace(/\D/g, '');
    if (!name) return res.status(400).json({ error: 'Employee name is required' });
    if (phone.length < 10) return res.status(400).json({ error: 'Valid mobile / contact number is required' });
    if (aadhaar.length < 12) return res.status(400).json({ error: 'Valid Aadhaar (12 digits) is required' });

    const empKey =
      hit.kind === 'hr_only' ? hit.staff[hit.hrIdx].id : target.employee_id || target.id;
    let docs = docsFromBodyMeta(body.documents);
    if (!Object.keys(docs).length && req.files) {
      docs = await collectUploadedDocs(req.files, `hr/joining/${empKey}`);
    }
    const now = new Date().toISOString();
    const designation = String(body.designation || target.designation || '').trim() || 'Staff';
    const department =
      String(body.department || target.department || '').trim() || 'General';

    const form = {
      id: uid(),
      staff_id: hit.kind === 'hr_only' ? hit.staff[hit.hrIdx].id : null,
      employee_id: hit.kind === 'system' ? target.employee_id || null : null,
      employee_name: name,
      full_address: String(body.full_address || '').trim(),
      contact_number: phone,
      email: String(body.email || body.emailid || '').trim(),
      aadhaar,
      pan: String(body.pan || '').trim(),
      birth_date: String(body.birth_date || body.dob || '').trim(),
      education_institute: String(body.education_institute || body.education || '').trim(),
      total_experience: String(body.total_experience || '').trim(),
      experience_in_dip: String(body.experience_in_dip || '').trim(),
      marital_status: String(body.marital_status || '').trim(),
      health_conditions: String(body.health_conditions || '').trim(),
      emergency_address: String(body.emergency_address || '').trim(),
      emergency_contact: String(body.emergency_contact || '').trim(),
      emergency_relationship: String(body.emergency_relationship || '').trim(),
      designation,
      department,
      documents: docs,
      submitted_at: now,
    };

    const forms = await readJson(JOINING_FORMS_PATH, []);
    forms.unshift(form);
    await writeJson(JOINING_FORMS_PATH, forms);

    if (hit.kind === 'hr_only') {
      const row = hit.staff[hit.hrIdx];
      row.full_name = name;
      row.whatsapp_number = phone;
      row.email = form.email || row.email;
      row.dob = form.birth_date || row.dob;
      row.department = department;
      row.designation = designation || row.designation;
      row.joining_form_id = form.id;
      row.joining_form_submitted_at = now;
      row.updated_at = now;
      await writeJson(HR_STAFF_PATH, hit.staff);

      const profiles = await readJson(PROFILES_PATH, []);
      const pIdx = profiles.findIndex((p) => p.hr_staff_id === row.id);
      const prof = {
        id: pIdx >= 0 ? profiles[pIdx].id : uid(),
        hr_staff_id: row.id,
        employee_id: profiles[pIdx]?.employee_id || null,
        employee_name: name,
        dob: form.birth_date || null,
        whatsapp_number: phone,
        aadhaar,
        pan: form.pan,
        designation,
        department,
        joining_form_id: form.id,
        joining_form_submitted_at: now,
        updated_at: now,
      };
      if (pIdx >= 0) profiles[pIdx] = { ...profiles[pIdx], ...prof };
      else profiles.push(prof);
      await writeJson(PROFILES_PATH, profiles);
    } else {
      const row = hit.profiles[hit.profileIdx];
      row.employee_name = name;
      row.whatsapp_number = phone;
      row.email = form.email || row.email || '';
      row.dob = form.birth_date || row.dob || null;
      row.aadhaar = aadhaar;
      row.pan = form.pan;
      row.department = department;
      row.designation = designation || row.designation || '';
      row.joining_form_id = form.id;
      row.joining_form_submitted_at = now;
      row.updated_at = now;
      await writeJson(PROFILES_PATH, hit.profiles);
    }

    // Mirror into HR Documents vault (same shape as POST /documents)
    const docMeta = await readJson(DOCS_META_PATH, []);
    const docEntries = [];
    const pushDoc = (docType, file) => {
      if (!file?.url) return;
      docEntries.push({
        id: uid(),
        employee_id: empKey,
        employee_name: name,
        department: department || 'General',
        designation: designation || 'Staff',
        doc_type: docType,
        title: file.name || docType,
        category: docType,
        file_name: file.name,
        file_path: file.path,
        file_url: file.url,
        uploaded_by: null,
        uploaded_by_name: 'Employee QR form',
        source: 'joining_qr',
        created_at: now,
      });
    };
    pushDoc('CV', docs.cv);
    pushDoc('Aadhaar', docs.aadhaar_file);
    pushDoc('PAN', docs.pan_file);
    pushDoc('Photo', docs.photo);
    pushDoc('Bank details', docs.bank_details);
    pushDoc('Salary slip', docs.salary_slip);
    (docs.education_certs || []).forEach((f) => pushDoc('Education certificate', f));
    if (docEntries.length) {
      await writeJson(DOCS_META_PATH, [...docEntries, ...docMeta]);
    }

    res.status(201).json({
      ok: true,
      message: 'Details submitted successfully. HR will process your records.',
      documents_saved: docEntries.length,
    });
  } catch (err) {
    console.error('public onboard:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit form' });
  }
});

router.use(requireAuth);

/**
 * Read-only: existing Site/MDO `attendance` table only.
 * No inserts/updates/schema changes — SELECT only.
 */
async function fetchAttendanceRows({ from, to, dateEq } = {}) {
  const pageSize = 1000;
  const selectCols = 'id, date, user_name, clock_in, clock_out, status, clock_in_status';
  const all = [];
  for (let page = 0; page < 30; page++) {
    let q = supabase.from('attendance').select(selectCols);
    if (dateEq) q = q.eq('date', dateEq);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    q = q.order('date', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

/** HR/admin: list attendance from existing public.attendance (Site clock-in data). */
router.get('/attendance', requireAdminOrHr, async (req, res) => {
  try {
    const from = String(req.query.from || '').trim() || null;
    const to = String(req.query.to || '').trim() || null;
    const date = String(req.query.date || '').trim() || null;
    if (!date && !from && !to) {
      return res.status(400).json({ error: 'Provide date=YYYY-MM-DD or from & to' });
    }
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
    }

    const rows = await fetchAttendanceRows(
      date ? { dateEq: date } : { from, to }
    );

    // Optional display names from users (read-only). Never writes.
    const usernames = [...new Set(rows.map((r) => r.user_name).filter(Boolean))];
    const nameByUser = {};
    if (usernames.length) {
      const { data: users } = await supabase
        .from('users')
        .select('username, full_name')
        .in('username', usernames.slice(0, 500));
      (users || []).forEach((u) => {
        if (u.username) nameByUser[u.username] = u.full_name || u.username;
      });
    }

    const attendance = rows.map((r) => ({
      id: r.id,
      date: r.date,
      user_name: r.user_name,
      name: nameByUser[r.user_name] || r.user_name || null,
      status: r.status || (r.clock_in ? 'present' : null),
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      clock_in_status: r.clock_in_status || null,
    }));

    res.json({ attendance, count: attendance.length });
  } catch (err) {
    console.error('hr attendance:', err.message);
    res.status(500).json({ error: err.message || 'Could not load attendance' });
  }
});

/** Heads see own submissions; only admin sees full recruitment pipeline (HR portal). */
router.get('/recruitments', async (req, res) => {
  try {
    const list = await readJson(RECRUIT_PATH, []);
    if (req.user?.role === 'admin') return res.json({ recruitments: list });
    if (!isHead(req.user)) {
      return res.status(403).json({ error: 'Only admin can view all recruitments' });
    }
    const uid = String(req.user.id || '');
    const mine = list.filter((r) => String(r.submitted_by || '') === uid);
    res.json({ recruitments: mine });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load recruitments' });
  }
});

/** Accept JSON (preferred for requirements) or multipart (legacy CV upload). */
function parseRecruitmentBody(req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.single('cv')(req, res, next);
  }
  return next();
}

/** Head / admin submits hiring requirement (not candidate details) → HR */
router.post('/recruitments', parseRecruitmentBody, async (req, res) => {
  try {
    if (!isHead(req.user) && !canHrOrAdmin(req.user)) {
      return res.status(403).json({ error: 'Only Head or HR can submit recruitment' });
    }
    const body = req.body || {};
    const kindRaw = String(body.kind || '').trim().toLowerCase();
    const looksLikeRequirement =
      kindRaw === 'requirement' ||
      !!(body.designation || body.experience_required || body.experience);
    const kind = looksLikeRequirement ? 'requirement' : 'candidate';

    // Manpower / hiring requirement from Office (no candidate name/mobile)
    if (kind === 'requirement') {
      const designation = String(body.designation || body.role_applied || body.role || '').trim();
      const experience_required = String(body.experience_required || body.experience || '').trim();
      if (!designation) return res.status(400).json({ error: 'Designation needed is required' });
      if (!experience_required) return res.status(400).json({ error: 'Experience required is required' });
      const openings = Math.max(1, Math.min(50, parseInt(body.openings, 10) || 1));
      const row = {
        id: uid(),
        kind: 'requirement',
        designation,
        role_applied: designation,
        experience_required,
        openings,
        department: String(body.department || '').trim(),
        location: String(body.location || '').trim(),
        skills: String(body.skills || '').trim(),
        urgency: String(body.urgency || 'Normal').trim() || 'Normal',
        notes: String(body.notes || '').trim(),
        candidate_name: `Hiring: ${designation}`,
        phone: '',
        email: '',
        status: 'Request Received',
        pipeline_step: 'Request Received',
        interview_at: null,
        interview_notes: '',
        cv_url: null,
        cv_path: null,
        source: 'office_requirement',
        submitted_by: req.user.id,
        submitted_by_name: req.user.full_name || req.user.username,
        status_history: [
          statusHistoryEntry({
            from: null,
            to: 'Request Received',
            by: req.user.id,
            by_name: req.user.full_name || req.user.username,
            note: 'Hiring requirement submitted',
          }),
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const list = await readJson(RECRUIT_PATH, []);
      list.unshift(row);
      await writeJson(RECRUIT_PATH, list);
      return res.status(201).json({ recruitment: row });
    }

    // Legacy / rare: candidate-style submit (CV attach) — still supported
    const name = String(body.candidate_name || body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Candidate name is required' });

    let cv_url = null;
    let cv_path = null;
    if (req.file) {
      await ensureBucket();
      cv_path = `hr/cvs/${uid()}_${safeSeg(req.file.originalname)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(cv_path, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(cv_path);
      cv_url = urlData.publicUrl;
    }

    const row = {
      id: uid(),
      kind: 'candidate',
      candidate_name: name,
      role_applied: String(body.role_applied || body.role || '').trim(),
      phone: String(body.phone || '').trim(),
      email: String(body.email || '').trim(),
      notes: String(body.notes || '').trim(),
      status: 'Request Received',
      pipeline_step: 'Request Received',
      interview_at: null,
      interview_notes: '',
      cv_url,
      cv_path,
      source: 'office_candidate',
      submitted_by: req.user.id,
      submitted_by_name: req.user.full_name || req.user.username,
      status_history: [
        statusHistoryEntry({
          from: null,
          to: 'Request Received',
          by: req.user.id,
          by_name: req.user.full_name || req.user.username,
          note: 'Candidate submitted',
        }),
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const list = await readJson(RECRUIT_PATH, []);
    list.unshift(row);
    await writeJson(RECRUIT_PATH, list);
    res.status(201).json({ recruitment: row });
  } catch (err) {
    console.error('hr recruit create:', err.message);
    res.status(500).json({ error: err.message || 'Could not submit recruitment' });
  }
});

/** Admin updates pipeline status / interview — status changes are logged */
router.patch('/recruitments/:id', requireAdmin, async (req, res) => {
  try {
    const list = await readJson(RECRUIT_PATH, []);
    const idx = list.findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });

    const prev = list[idx];
    const history = ensureStatusHistory({ ...prev }, req.user);
    const prevStatus = String(prev.status || 'Request Received');

    const allowed = ['status', 'interview_at', 'interview_notes', 'notes', 'role_applied'];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) list[idx][k] = req.body[k];
    });

    const nextStatus = String(list[idx].status || prevStatus);
    if (req.body.status !== undefined && nextStatus !== prevStatus) {
      history.push(
        statusHistoryEntry({
          from: prevStatus,
          to: nextStatus,
          by: req.user.id,
          by_name: req.user.full_name || req.user.username || 'HR',
          note: String(req.body.status_note || '').trim(),
        })
      );
    }

    list[idx].status_history = history;
    list[idx].pipeline_step = nextStatus;
    list[idx].updated_at = new Date().toISOString();
    await writeJson(RECRUIT_PATH, list);
    res.json({ recruitment: list[idx] });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Update failed' });
  }
});

/** Employee / HR: list documents (HR sees all; emp sees own) */
router.get('/documents', async (req, res) => {
  try {
    const list = await readJson(DOCS_META_PATH, []);
    if (canHrOrAdmin(req.user)) {
      const dept = req.query.department;
      const desig = req.query.designation;
      let out = list;
      if (dept) out = out.filter((d) => String(d.department).toLowerCase() === String(dept).toLowerCase());
      if (desig) out = out.filter((d) => String(d.designation).toLowerCase() === String(desig).toLowerCase());
      return res.json({ documents: out });
    }
    const mine = list.filter(
      (d) => d.employee_id === req.user.id || d.uploaded_by === req.user.id
    );
    res.json({ documents: mine });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load documents' });
  }
});

/** Folder tree for HR: department → designation → docs */
router.get('/documents/tree', requireAdminOrHr, async (req, res) => {
  try {
    const list = await readJson(DOCS_META_PATH, []);
    const tree = {};
    list.forEach((d) => {
      const dept = d.department || 'General';
      const desig = d.designation || 'Staff';
      if (!tree[dept]) tree[dept] = {};
      if (!tree[dept][desig]) tree[dept][desig] = [];
      tree[dept][desig].push(d);
    });
    res.json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not build folder tree' });
  }
});

/**
 * Register a document after the browser uploaded bytes via signed URL
 * (avoids Vercel ~4.5 MB body cap). Still accepts multipart for tiny files / local.
 */
function documentsUploadMaybe(req, res, next) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.single('file')(req, res, (err) => {
      if (err) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 25MB)'
            : err.message || 'Upload parse failed';
        return res.status(400).json({ error: msg });
      }
      next();
    });
  }
  next();
}

/** Employee uploads own doc OR HR registers for employee */
router.post('/documents', documentsUploadMaybe, async (req, res) => {
  try {
    const body = req.body || {};
    const employee_id = body.employee_id || req.user.id;
    const employee_name = String(body.employee_name || req.user.full_name || req.user.username).trim();
    const department = String(body.department || req.user.department || 'General').trim() || 'General';
    const designation = String(body.designation || req.user.designation || 'Staff').trim() || 'Staff';
    const doc_type = String(body.doc_type || 'Other').trim();
    const title = String(body.title || req.file?.originalname || body.file_name || 'Document').trim();

    if (!canHrOrAdmin(req.user) && String(employee_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'You can only upload your own documents' });
    }

    await ensureBucket();
    let file_path = String(body.file_path || '').replace(/^\/+/, '');
    let file_url = String(body.file_url || '').trim();
    let file_name = String(body.file_name || req.file?.originalname || 'document').trim();

    if (req.file) {
      file_path = `hr/employees/${safeSeg(department)}/${safeSeg(designation)}/${safeSeg(employee_name)}/${uid()}_${safeSeg(req.file.originalname)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(file_path, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(file_path);
      file_url = urlData.publicUrl;
      file_name = req.file.originalname;
    } else if (file_path && file_url) {
      if (!file_path.startsWith('hr/employees/')) {
        return res.status(400).json({ error: 'Invalid document path' });
      }
    } else {
      return res.status(400).json({ error: 'File is required' });
    }

    const row = {
      id: uid(),
      employee_id,
      employee_name,
      department,
      designation,
      doc_type,
      title,
      file_path,
      file_url,
      file_name,
      uploaded_by: req.user.id,
      uploaded_by_name: req.user.full_name || req.user.username,
      created_at: new Date().toISOString(),
    };

    const list = await readJson(DOCS_META_PATH, []);
    list.unshift(row);
    await writeJson(DOCS_META_PATH, list);
    res.status(201).json({ document: row });
  } catch (err) {
    console.error('hr doc upload:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const list = await readJson(DOCS_META_PATH, []);
    const row = list.find((d) => d.id === req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canHrOrAdmin(req.user) && row.uploaded_by !== req.user.id && row.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const next = list.filter((d) => d.id !== req.params.id);
    await writeJson(DOCS_META_PATH, next);
    if (row.file_path) {
      await supabase.storage.from(BUCKET).remove([row.file_path]).catch(() => null);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

router.get('/recruit-statuses', (_req, res) => {
  res.json({ statuses: RECRUIT_STATUSES });
});

function daysUntilNextBirthday(dobStr, today = new Date()) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const y = today.getFullYear();
  let next = new Date(y, dob.getMonth(), dob.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < start) next = new Date(y + 1, dob.getMonth(), dob.getDate());
  return Math.round((next - start) / 86400000);
}

function daysUntilDate(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target - start) / 86400000);
}

/** HR alerts: birthdays in 7 days + insurance renew within 4 days / overdue */
router.get('/alerts', requireAdminOrHr, async (req, res) => {
  try {
    const { daysUntilDate: daysUntil, RENEW_WINDOW_DAYS } = require('../lib/insuranceReminders');
    const profiles = await readJson(PROFILES_PATH, []);
    const insurances = await readJson(INSURANCE_PATH, []);
    const birthdays = [];
    profiles.forEach((p) => {
      const days = daysUntilNextBirthday(p.dob);
      if (days != null && days >= 0 && days <= 7) {
        birthdays.push({ ...p, days_until: days });
      }
    });
    birthdays.sort((a, b) => a.days_until - b.days_until);

    const insuranceDue = [];
    insurances.forEach((row) => {
      const days = daysUntil(row.renew_date);
      if (days == null) return;
      if (days <= RENEW_WINDOW_DAYS) {
        insuranceDue.push({ ...row, days_until: days });
      }
    });
    insuranceDue.sort((a, b) => a.days_until - b.days_until);

    res.json({ birthdays, insuranceDue });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load alerts' });
  }
});

/** Send WhatsApp for birthday (7d) + insurance renew (≤4d) — ONLY to fixed HR number */
router.post('/alerts/send-whatsapp', requireAdminOrHr, async (req, res) => {
  try {
    const { sendWhatsAppText } = require('../lib/whatsapp');
    const { runInsuranceRenewReminders, resolveHrWhatsApp } = require('../lib/insuranceReminders');
    const profiles = await readJson(PROFILES_PATH, []);
    const log = await readJson(REMINDER_LOG_PATH, {});
    const todayKey = new Date().toISOString().slice(0, 10);
    const hrWa = await resolveHrWhatsApp();
    const sent = [];

    if (!hrWa) {
      return res.status(400).json({ error: 'HR WhatsApp number not configured' });
    }

    for (const p of profiles) {
      const days = daysUntilNextBirthday(p.dob);
      if (days == null || days < 0 || days > 7) continue;
      const key = `bday:${p.employee_id || p.id}:${todayKey}:${days}`;
      if (log[key]) continue;
      const when = days === 0 ? 'today' : `in ${days} day(s)`;
      const msg =
        `DIP HR Reminder: Birthday of ${p.employee_name || p.name} is ${when} (${p.dob}). Please wish / arrange accordingly.`;
      try {
        const result = await sendWhatsAppText(hrWa, msg);
        if (!result?.ok) continue;
        log[key] = new Date().toISOString();
        sent.push({ type: 'birthday', to: hrWa, name: p.employee_name });
      } catch (e) {
        console.warn('bday wa fail', e.message);
      }
    }
    await writeJson(REMINDER_LOG_PATH, log);

    const ins = await runInsuranceRenewReminders({ force: !!req.body?.force });
    res.json({
      ok: true,
      hr_whatsapp: hrWa,
      sent: [...sent, ...(ins.sent || [])],
      insurance: ins,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'WhatsApp send failed' });
  }
});

router.get('/profiles', requireAdminOrHr, async (_req, res) => {
  try {
    res.json({ profiles: await readJson(PROFILES_PATH, []) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profiles', requireAdminOrHr, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.employee_id && !body.employee_name) {
      return res.status(400).json({ error: 'employee_id or employee_name required' });
    }
    const list = await readJson(PROFILES_PATH, []);
    const idx = list.findIndex(
      (p) =>
        (body.employee_id && p.employee_id === body.employee_id) ||
        (body.employee_name && p.employee_name === body.employee_name)
    );
    const row = {
      id: idx >= 0 ? list[idx].id : uid(),
      employee_id: body.employee_id || list[idx]?.employee_id || null,
      employee_name: body.employee_name || list[idx]?.employee_name || '',
      dob: body.dob || list[idx]?.dob || null,
      whatsapp_number: body.whatsapp_number || list[idx]?.whatsapp_number || '',
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...row };
    else list.push(row);
    await writeJson(PROFILES_PATH, list);
    res.json({ profile: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Directory for HR UI:
 *  - Main users table (system) — read-only here; shows everyone already in TaskFlow
 *  - hr/_meta/hr_employees.json (hr_only) — NEW people added from HR; NEVER written to users
 * Dedupes by name: system user wins if same name exists in both.
 */
router.get('/staff-options', requireAdminOrHr, (_req, res) => {
  res.json({ departments: HR_DEPARTMENTS, designations: HR_DESIGNATIONS });
});

router.get('/staff', requireAdminOrHr, async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase().trim();
    const hrOnly = await readJson(HR_STAFF_PATH, []);

    const { data: users, error: uErr } = await supabase
      .from('users')
      .select(
        'id, username, full_name, department, designation, role, is_active, site_name, site_names, whatsapp_number'
      )
      .order('full_name', { ascending: true })
      .limit(3000);
    if (uErr) throw uErr;

    const profiles = await readJson(PROFILES_PATH, []);

    const systemNames = new Set();
    const system = (users || [])
      .filter((u) => !isClientStaff(u))
      .map((u) => {
      const name = String(u.full_name || '').trim();
      if (name) systemNames.add(name.toLowerCase());
      const { profile: prof } = findBestProfile(name, u.id, profiles);
      // Token / joining form ONLY from exact employee_id match — never fuzzy (avoids shared Adbhi QR)
      const byId = profiles.find((p) => p.employee_id === u.id);
      return {
        id: u.id,
        full_name: name,
        username: u.username || '',
        department: u.department || '',
        designation: u.designation || '',
        role: u.role || 'employee',
        is_active: u.is_active !== false,
        site_name: u.site_name || null,
        site_names: u.site_names || [],
        whatsapp_number: u.whatsapp_number || byId?.whatsapp_number || prof?.whatsapp_number || '',
        dob: byId?.dob || prof?.dob || null,
        joining_date: null,
        source: 'system',
        onboard_token: byId?.onboard_token || null,
        joining_form_submitted_at: byId?.joining_form_submitted_at || null,
        joining_form_id: byId?.joining_form_id || null,
      };
    });

    // HR-only adds — skip if same name already exists in main users
    const extras = (hrOnly || [])
      .filter((r) => {
        if (isClientStaff(r)) return false;
        const n = String(r.full_name || '').trim().toLowerCase();
        if (!n) return false;
        // also skip if fuzzy-matches a system user name
        for (const sn of systemNames) {
          if (nameMatchScore(n, sn) >= 88) return false;
        }
        return true;
      })
      .map((r) => {
        const { profile: prof } = findBestProfile(r.full_name, null, profiles);
        return {
          id: r.id,
          full_name: r.full_name,
          username: '',
          department: r.department || '',
          designation: r.designation || '',
          role: 'hr_only',
          is_active: r.is_active !== false,
          site_name: null,
          site_names: [],
          whatsapp_number: r.whatsapp_number || prof?.whatsapp_number || '',
          dob: r.dob || prof?.dob || null,
          joining_date: r.joining_date || null,
          email: r.email || '',
          source: 'hr_only',
          onboard_token: r.onboard_token || null,
          joining_form_submitted_at: r.joining_form_submitted_at || null,
          joining_form_id: r.joining_form_id || null,
        };
      });

    let list = [...system, ...extras].filter((r) => !isClientStaff(r));
    if (q) {
      list = list.filter(
        (r) =>
          String(r.full_name || '').toLowerCase().includes(q) ||
          String(r.department || '').toLowerCase().includes(q) ||
          String(r.designation || '').toLowerCase().includes(q) ||
          String(r.username || '').toLowerCase().includes(q) ||
          String(r.whatsapp_number || '').includes(q)
      );
    }
    list.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));

    res.json({
      staff: list,
      system_count: system.length,
      hr_only_count: extras.length,
      departments: HR_DEPARTMENTS,
      designations: HR_DESIGNATIONS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load HR staff' });
  }
});

router.post('/staff', requireAdminOrHr, async (req, res) => {
  try {
    const body = req.body || {};
    const full_name = String(body.full_name || '').trim();
    if (!full_name) return res.status(400).json({ error: 'full_name required' });

    // Block accidental duplicate of an existing system user name
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, full_name')
      .ilike('full_name', full_name)
      .limit(1)
      .maybeSingle();
    if (existingUser) {
      return res.status(409).json({
        error: `“${full_name}” already exists in main users. Use that record — do not add again in HR-only table.`,
      });
    }

    const list = await readJson(HR_STAFF_PATH, []);
    const dup = list.find(
      (r) => String(r.full_name || '').trim().toLowerCase() === full_name.toLowerCase()
    );
    if (dup) {
      return res.status(409).json({ error: 'Already in HR-only register' });
    }

    const now = new Date().toISOString();
    const onboard_token = makeToken();
    const row = {
      id: uid(),
      full_name,
      department: String(body.department || 'General').trim() || 'General',
      designation: String(body.designation || 'Staff').trim() || 'Staff',
      whatsapp_number: String(body.whatsapp_number || '').trim(),
      dob: body.dob || null,
      joining_date: body.joining_date || null,
      email: String(body.email || '').trim(),
      notes: String(body.notes || '').trim(),
      is_active: body.is_active !== false,
      // Never written to users / TaskFlow login
      source: 'hr_only',
      onboard_token,
      joining_form_submitted_at: null,
      joining_form_id: null,
      created_at: now,
      updated_at: now,
      created_by: req.user?.id || null,
    };
    list.unshift(row);
    await writeJson(HR_STAFF_PATH, list);

    if (row.dob || row.whatsapp_number) {
      const profiles = await readJson(PROFILES_PATH, []);
      const pIdx = profiles.findIndex(
        (p) =>
          p.hr_staff_id === row.id ||
          String(p.employee_name || '').toLowerCase() === full_name.toLowerCase()
      );
      const prof = {
        id: pIdx >= 0 ? profiles[pIdx].id : uid(),
        hr_staff_id: row.id,
        employee_id: null,
        employee_name: full_name,
        dob: row.dob,
        whatsapp_number: row.whatsapp_number,
        designation: row.designation,
        department: row.department,
        updated_at: now,
      };
      if (pIdx >= 0) profiles[pIdx] = { ...profiles[pIdx], ...prof };
      else profiles.push(prof);
      await writeJson(PROFILES_PATH, profiles);
    }

    res.status(201).json({
      staff: { ...row, source: 'hr_only' },
      onboard_path: `/onboard/${onboard_token}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not add HR staff' });
  }
});
router.patch('/staff/:id', requireAdminOrHr, async (req, res) => {
  try {
    const list = await readJson(HR_STAFF_PATH, []);
    const idx = list.findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    const allowed = [
      'full_name', 'department', 'designation', 'whatsapp_number', 'dob',
      'joining_date', 'email', 'notes', 'is_active',
    ];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) list[idx][k] = req.body[k];
    });
    list[idx].updated_at = new Date().toISOString();
    await writeJson(HR_STAFF_PATH, list);

    const row = list[idx];
    if (row.dob || row.whatsapp_number) {
      const profiles = await readJson(PROFILES_PATH, []);
      const pIdx = profiles.findIndex(
        (p) =>
          p.hr_staff_id === row.id ||
          String(p.employee_name || '').toLowerCase() === String(row.full_name || '').toLowerCase()
      );
      const prof = {
        id: pIdx >= 0 ? profiles[pIdx].id : uid(),
        hr_staff_id: row.id,
        employee_id: profiles[pIdx]?.employee_id || null,
        employee_name: row.full_name,
        dob: row.dob || profiles[pIdx]?.dob || null,
        whatsapp_number: row.whatsapp_number || profiles[pIdx]?.whatsapp_number || '',
        designation: row.designation,
        department: row.department,
        updated_at: new Date().toISOString(),
      };
      if (pIdx >= 0) profiles[pIdx] = { ...profiles[pIdx], ...prof };
      else profiles.push(prof);
      await writeJson(PROFILES_PATH, profiles);
    }

    res.json({ staff: row });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Update failed' });
  }
});

router.delete('/staff/:id', requireAdminOrHr, async (req, res) => {
  try {
    const list = await readJson(HR_STAFF_PATH, []);
    await writeJson(
      HR_STAFF_PATH,
      list.filter((r) => r.id !== req.params.id)
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Create / regenerate joining-form QR token (system users + HR-only) */
router.post('/staff/:id/onboard-token', requireAdminOrHr, async (req, res) => {
  try {
    const id = req.params.id;
    const source = String(req.body?.source || '').toLowerCase();
    const token = makeToken();
    const now = new Date().toISOString();
    const reset = !!req.body?.reset_submit;

    // Prefer HR-only row unless caller explicitly says system
    const list = await readJson(HR_STAFF_PATH, []);
    const hrIdx = list.findIndex((r) => r.id === id);
    if (hrIdx >= 0 && source !== 'system') {
      list[hrIdx].onboard_token = token;
      if (reset) {
        list[hrIdx].joining_form_submitted_at = null;
        list[hrIdx].joining_form_id = null;
      }
      list[hrIdx].updated_at = now;
      await writeJson(HR_STAFF_PATH, list);
      return res.json({
        ok: true,
        staff: { ...list[hrIdx], source: 'hr_only' },
        onboard_path: `/onboard/${token}`,
      });
    }

    // System user → store token on THAT user's profile only (never reuse another name's profile)
    let user = null;
    {
      const sel = await supabase
        .from('users')
        .select('id, full_name, department, designation, whatsapp_number, role')
        .eq('id', id)
        .maybeSingle();
      if (sel.error) throw sel.error;
      user = sel.data;
    }
    if (!user) {
      if (hrIdx >= 0) {
        list[hrIdx].onboard_token = token;
        if (reset) {
          list[hrIdx].joining_form_submitted_at = null;
          list[hrIdx].joining_form_id = null;
        }
        list[hrIdx].updated_at = now;
        await writeJson(HR_STAFF_PATH, list);
        return res.json({
          ok: true,
          staff: { ...list[hrIdx], source: 'hr_only' },
          onboard_path: `/onboard/${token}`,
        });
      }
      return res.status(404).json({ error: 'Employee not found' });
    }
    if (isClientStaff(user)) {
      return res.status(400).json({ error: 'Client accounts do not get joining QR' });
    }

    const profiles = await readJson(PROFILES_PATH, []);
    let pIdx = profiles.findIndex((p) => p.employee_id === user.id);
    // Only bind orphan profile (no employee_id / hr_staff_id) by exact name — never steal another emp's row
    if (pIdx < 0) {
      pIdx = profiles.findIndex(
        (p) =>
          !p.employee_id &&
          !p.hr_staff_id &&
          String(p.employee_name || '').trim().toLowerCase() ===
            String(user.full_name || '').trim().toLowerCase()
      );
    }
    const prev = pIdx >= 0 ? profiles[pIdx] : null;
    const prof = {
      id: prev?.id || uid(),
      employee_id: user.id,
      hr_staff_id: prev?.hr_staff_id || null,
      employee_name: user.full_name || '',
      department: user.department || prev?.department || '',
      designation: user.designation || prev?.designation || '',
      whatsapp_number: user.whatsapp_number || prev?.whatsapp_number || '',
      email: prev?.email || '',
      dob: prev?.dob || null,
      onboard_token: token,
      joining_form_submitted_at: reset ? null : prev?.joining_form_submitted_at || null,
      joining_form_id: reset ? null : prev?.joining_form_id || null,
      updated_at: now,
    };
    if (pIdx >= 0) profiles[pIdx] = { ...prev, ...prof };
    else profiles.push(prof);
    await writeJson(PROFILES_PATH, profiles);

    res.json({
      ok: true,
      staff: {
        id: user.id,
        full_name: user.full_name,
        source: 'system',
        onboard_token: token,
        joining_form_submitted_at: prof.joining_form_submitted_at,
      },
      onboard_path: `/onboard/${token}`,
    });
  } catch (err) {
    console.error('onboard-token:', err.message);
    res.status(500).json({ error: err.message || 'Could not create QR token' });
  }
});

/** HR: fetch submitted joining form (for PDF download) */
router.get('/joining-forms/:staffId', requireAdminOrHr, async (req, res) => {
  try {
    const id = req.params.staffId;
    const forms = await readJson(JOINING_FORMS_PATH, []);
    const staff = await readJson(HR_STAFF_PATH, []);
    const profiles = await readJson(PROFILES_PATH, []);
    const emp = staff.find((r) => r.id === id) || null;
    const prof = profiles.find((p) => p.employee_id === id || p.id === id) || null;
    const form =
      forms.find((f) => f.staff_id === id || f.employee_id === id) ||
      (emp?.joining_form_id ? forms.find((f) => f.id === emp.joining_form_id) : null) ||
      (prof?.joining_form_id ? forms.find((f) => f.id === prof.joining_form_id) : null);
    if (!form) return res.status(404).json({ error: 'No joining form submitted yet' });
    res.json({ form, staff: emp || prof || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/insurances', requireAdminOrHr, async (req, res) => {
  try {
    let list = await readJson(INSURANCE_PATH, []);
    const status = String(req.query.status || '').toLowerCase();
    const q = String(req.query.q || '').toLowerCase();
    const filter = String(req.query.filter || '').toLowerCase(); // due | overdue | all
    if (status) list = list.filter((r) => String(r.status || '').toLowerCase() === status);
    if (q) {
      list = list.filter(
        (r) =>
          String(r.employee_name || '').toLowerCase().includes(q) ||
          String(r.policy_no || '').toLowerCase().includes(q) ||
          String(r.policy_type || '').toLowerCase().includes(q)
      );
    }
    list = list.map((r) => ({ ...r, days_until: daysUntilDate(r.renew_date) }));
    if (filter === 'due') list = list.filter((r) => r.days_until != null && r.days_until >= 0 && r.days_until <= 4);
    if (filter === 'overdue') list = list.filter((r) => r.days_until != null && r.days_until < 0);
    if (filter === 'upcoming') list = list.filter((r) => r.days_until != null && r.days_until >= 0 && r.days_until <= 30);
    res.json({ insurances: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/insurances', requireAdminOrHr, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.employee_name) return res.status(400).json({ error: 'employee_name required' });
    const list = await readJson(INSURANCE_PATH, []);
    const row = {
      id: uid(),
      employee_id: body.employee_id || null,
      employee_name: body.employee_name,
      policy_type: body.policy_type || 'Accidental',
      policy_no: body.policy_no || '',
      start_date: body.start_date || null,
      renew_date: body.renew_date || null,
      insurance_period: body.insurance_period || '',
      joining_date: body.joining_date || null,
      amount: body.amount ?? null,
      salary: body.salary ?? null,
      status: body.status || 'Active',
      whatsapp_number: body.whatsapp_number || '',
      designation: body.designation || '',
      aadhaar: body.aadhaar || '',
      pan: body.pan || '',
      height: body.height || '',
      weight: body.weight || '',
      medical_condition: body.medical_condition || '',
      nominee_details: body.nominee_details || '',
      notes: body.notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.unshift(row);
    await writeJson(INSURANCE_PATH, list);
    res.status(201).json({ insurance: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/insurances/:id', requireAdminOrHr, async (req, res) => {
  try {
    const list = await readJson(INSURANCE_PATH, []);
    const idx = list.findIndex((r) => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    const allowed = [
      'employee_name', 'employee_id', 'policy_type', 'policy_no', 'start_date',
      'renew_date', 'status', 'whatsapp_number', 'notes', 'hr_whatsapp',
      'aadhaar', 'pan', 'height', 'weight', 'medical_condition', 'nominee_details',
      'designation', 'joining_date', 'amount', 'salary', 'insurance_period',
      'assigned_to', 'remark',
    ];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) list[idx][k] = req.body[k];
    });
    list[idx].updated_at = new Date().toISOString();
    await writeJson(INSURANCE_PATH, list);
    res.json({ insurance: list[idx] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/insurances/:id', requireAdminOrHr, async (req, res) => {
  try {
    const list = await readJson(INSURANCE_PATH, []);
    await writeJson(INSURANCE_PATH, list.filter((r) => r.id !== req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.RECRUIT_STATUSES = RECRUIT_STATUSES;
