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

/** Upload via backend (service_role) — avoids Storage RLS blocking anon. */
export async function uploadViaApi({ path, dataUrl, blob, contentType, bucket = SITE_FILES_BUCKET }) {
  const token = getToken();
  if (!token) throw new Error('Please log in again — missing session for file upload.');

  await ensureSiteBucket(path.split('/')[0] || 'site');

  let body;
  let headers = { Authorization: `Bearer ${token}` };

  if (dataUrl) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ path, dataUrl, contentType, bucket });
  } else if (blob) {
    const fd = new FormData();
    fd.append('file', blob, path.split('/').pop() || 'file');
    fd.append('path', path);
    fd.append('bucket', bucket);
    if (contentType) fd.append('contentType', contentType);
    body = fd;
  } else {
    throw new Error('uploadViaApi: need dataUrl or blob');
  }

  const res = await fetch(`${API_BASE}/storage/upload`, {
    method: 'POST',
    headers,
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  if (!data.publicUrl) throw new Error('Upload succeeded but no public URL returned');
  return data.publicUrl;
}

export { sanitizeBucketName };
