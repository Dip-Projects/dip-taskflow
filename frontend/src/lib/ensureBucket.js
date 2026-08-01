import { getToken } from './api';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

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

  await ensureSiteBucket(path.split('/')[0] || 'site');

  let fileBlob = blob;
  let type = contentType || 'application/octet-stream';

  if (!fileBlob && dataUrl) {
    fileBlob = await dataUrlToBlob(dataUrl);
    type = fileBlob.type || type || 'image/jpeg';
  }
  if (!fileBlob) throw new Error('uploadViaApi: need dataUrl or blob');

  const fileName = path.split('/').pop() || 'file';
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const fd = new FormData();
      fd.append('file', fileBlob, fileName);
      fd.append('path', path);
      fd.append('bucket', bucket);
      if (type) fd.append('contentType', type);

      const res = await fetch(`${API_BASE}/storage/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

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
