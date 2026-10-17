import { createClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function safeSeg(s) {
  return (
    String(s || 'file')
      .trim()
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80) || 'file'
  );
}

function readPublicConfig() {
  const runtime =
    typeof window !== 'undefined' && window.__TF_CONFIG__
      ? window.__TF_CONFIG__
      : null;
  return {
    url:
      runtime?.supabaseUrl ||
      import.meta.env.VITE_SUPABASE_URL ||
      '',
    anonKey:
      runtime?.supabaseAnonKey ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      '',
  };
}

/** Fresh anon client — never reuse a logged-in / expired browser session. */
function publicStorageClient() {
  const { url, anonKey } = readPublicConfig();
  if (!url || !anonKey || anonKey === 'placeholder') {
    throw new Error('Upload config missing — refresh page and try again');
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function friendlyNetworkError(err, fallback) {
  const msg = String(err?.message || err || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Network error. Stay on Wi-Fi, use a smaller photo, and try again. HR does not have this form until you see “Submitted successfully”.';
  }
  return msg || fallback || 'Request failed';
}

/** Phone camera photos are often 8–15MB and the upload dies mid-way. */
async function shrinkImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/') || file.size < 1400000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    if (!blob || blob.size >= file.size) return file;
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** Browser to Supabase signed upload for public apply / onboard (no JWT). */
export async function uploadPublicHrFile(file, folder) {
  if (!file) return null;
  const uploadFile = await shrinkImageFile(file);
  const path = `${String(folder).replace(/\/+$/, '')}/${Date.now()}_${safeSeg(uploadFile.name)}`;
  let prep;
  let lastNet = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      prep = await fetch(`${API_BASE}/hr/public/signed-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      lastNet = null;
      break;
    } catch (err) {
      lastNet = err;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  if (!prep) throw new Error(friendlyNetworkError(lastNet, 'Could not start file upload'));
  const data = await prep.json().catch(() => ({}));
  if (!prep.ok) throw new Error(data.error || `Upload prepare failed (${prep.status})`);

  const client = publicStorageClient();
  const { error } = await client.storage
    .from(data.bucket || 'documents')
    .uploadToSignedUrl(data.path || path, data.token, uploadFile, {
      contentType: uploadFile.type || 'application/octet-stream',
      upsert: true,
    });
  if (error) {
    const msg = String(error.message || '');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new Error(friendlyNetworkError(error, 'File upload failed'));
    }
    if (/jwt|session|expir|unauthorized|401/i.test(msg)) {
      throw new Error('Upload failed — refresh the form link and try again (no login needed).');
    }
    throw new Error(msg || 'File upload failed');
  }

  return {
    path: data.path || path,
    url: data.publicUrl,
    name: uploadFile.name,
    mime: uploadFile.type || null,
    size: uploadFile.size || null,
  };
}

/** Keep files that uploaded. One bad photo must not throw away the rest. */
export async function uploadPublicHrFilesBestEffort(filesMap, folder) {
  const documents = {};
  const failed = [];
  for (const [key, fileList] of Object.entries(filesMap || {})) {
    if (!fileList?.length) continue;
    const list = key === 'education_certs' ? [...fileList] : [fileList[0]];
    for (const file of list) {
      try {
        const meta = await uploadPublicHrFile(file, folder);
        if (!meta) continue;
        if (key === 'education_certs') {
          documents[key] = documents[key] || [];
          documents[key].push(meta);
        } else {
          documents[key] = meta;
        }
      } catch (err) {
        failed.push(`${file?.name || key}: ${friendlyNetworkError(err, 'upload failed')}`);
      }
    }
  }
  return { documents, failed };
}

export async function uploadPublicHrFiles(filesMap, folder) {
  const out = {};
  for (const [key, fileList] of Object.entries(filesMap || {})) {
    if (!fileList?.length) continue;
    if (key === 'education_certs') {
      out[key] = [];
      for (const f of [...fileList]) {
        out[key].push(await uploadPublicHrFile(f, folder));
      }
    } else {
      out[key] = await uploadPublicHrFile(fileList[0], folder);
    }
  }
  return out;
}
