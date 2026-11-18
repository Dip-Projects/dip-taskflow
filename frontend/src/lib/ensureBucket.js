import { getToken, setSession } from './api';
import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** Serverless functions cap request bodies at ~4.5 MB, so bigger files must go
 *  straight to Supabase Storage with a signed URL instead of via /api. */
const PROXY_MAX_BYTES = 4 * 1024 * 1024;

/** Shared public bucket for all Site Engineer uploads */
export const SITE_FILES_BUCKET = 'site-files';

function sanitizeBucketName(site) {
  return (
    (site || 'site')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || 'site'
  );
}

/**
 * Supabase Storage keys must match S3-safe ASCII only
 * (see isValidKey in supabase/storage). Strip accents and
 * replace any other illegal character so deep folder packs upload.
 */
export function sanitizeStorageKey(path) {
  return String(path || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .map((seg) => {
      const cleaned = seg
        .replace(/[^\w!.\-*'() &$@=;:+,?]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_ .]+|[_ .]+$/g, '');
      return cleaned || 'file';
    })
    .join('/');
}

/** 401 from the upload endpoints = the login token is dead (expired / invalid).
 *  Flag it so screens can show a clear "log in again" message instead of a
 *  developer error. We do NOT wipe the session here, so a half-filled report
 *  (photos, text) stays on screen while the user logs in again in another tab. */
export const SESSION_EXPIRED_MESSAGE = 'Your login has expired. Please log in again, then try again.';

function sessionExpiredError() {
  const e = new Error(SESSION_EXPIRED_MESSAGE);
  e.code = 'SESSION_EXPIRED';
  return e;
}

/** Keep the sliding-session token fresh, same as api() does. */
function keepTokenFresh(res) {
  const fresh = res.headers.get('X-New-Token');
  if (fresh) setSession(fresh);
}

let _sharedReady = false;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function ensureSiteBucket(site) {
  const prefix = sanitizeBucketName(site);
  if (_sharedReady) {
    return { bucket: SITE_FILES_BUCKET, prefix, created: false };
  }

  const token = getToken();
  if (!token) {
    throw new Error('Please log in again — missing session for file upload.');
  }

  const res = await fetch(`${API_BASE}/storage/ensure-bucket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ site: SITE_FILES_BUCKET, shared: true }),
  });
  keepTokenFresh(res);
  if (res.status === 401) throw sessionExpiredError();

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error ||
        `Storage setup failed (${res.status}). Restart backend and try again.`
    );
  }

  _sharedReady = true;
  return { bucket: SITE_FILES_BUCKET, prefix, created: !!data.created };
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function uploadViaSignedUrl({ path, blob, contentType, bucket }) {
  const token = getToken();
  if (!token) throw new Error('Please log in again — missing session for file upload.');

  const res = await fetch(`${API_BASE}/storage/signed-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, bucket }),
  });
  keepTokenFresh(res);
  if (res.status === 401) throw sessionExpiredError();

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

  const { error } = await supabase.storage
    .from(data.bucket || bucket)
    .uploadToSignedUrl(data.path, data.token, blob, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });

  if (error) throw new Error(error.message || 'Upload failed');
  return data.publicUrl;
}

/**
 * Upload via backend (service_role) — always multipart FormData.
 * Avoids huge JSON base64 bodies that trigger ERR_CONNECTION_RESET on Vercel.
 */
export async function uploadViaApi({
  path,
  dataUrl,
  blob,
  contentType,
  bucket = SITE_FILES_BUCKET,
  retries = 3,
}) {
  const token = getToken();
  if (!token) throw new Error('Please log in again — missing session for file upload.');

  const safePath = sanitizeStorageKey(path);
  if (!safePath) throw new Error('Invalid upload path');

  await ensureSiteBucket(safePath.split('/')[0] || 'site');

  let fileBlob = blob;
  let type = contentType || 'application/octet-stream';

  if (!fileBlob && dataUrl) {
    fileBlob = await dataUrlToBlob(dataUrl);
    type = fileBlob.type || type || 'image/jpeg';
  }
  if (!fileBlob) throw new Error('uploadViaApi: need dataUrl or blob');

  if (fileBlob.size > PROXY_MAX_BYTES) {
    return uploadViaSignedUrl({ path: safePath, blob: fileBlob, contentType: type, bucket });
  }

  const fileName = safePath.split('/').pop() || 'file';
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const fd = new FormData();
      fd.append('file', fileBlob, fileName);
      fd.append('path', safePath);
      fd.append('bucket', bucket);
      if (type) fd.append('contentType', type);

      const res = await fetch(`${API_BASE}/storage/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      keepTokenFresh(res);
      if (res.status === 401) throw sessionExpiredError();

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      if (!data.publicUrl) throw new Error('Upload succeeded but no public URL returned');
      return data.publicUrl;
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err || '');
      const retryable =
        /Failed to fetch|NetworkError|CONNECTION_RESET|timeout|502|503|504/i.test(msg) ||
        err?.name === 'TypeError';
      if (!retryable || attempt === retries) break;
      await sleep(400 * attempt);
    }
  }

  throw lastErr || new Error('Upload failed');
}

export { sanitizeBucketName };
