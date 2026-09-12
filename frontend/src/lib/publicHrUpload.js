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

/** Browser to Supabase signed upload for public apply / onboard (no JWT). */
export async function uploadPublicHrFile(file, folder) {
  if (!file) return null;
  const path = `${String(folder).replace(/\/+$/, '')}/${Date.now()}_${safeSeg(file.name)}`;
  const prep = await fetch(`${API_BASE}/hr/public/signed-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await prep.json().catch(() => ({}));
  if (!prep.ok) throw new Error(data.error || `Upload prepare failed (${prep.status})`);

  const client = publicStorageClient();
  const { error } = await client.storage
    .from(data.bucket || 'documents')
    .uploadToSignedUrl(data.path || path, data.token, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });
  if (error) {
    const msg = String(error.message || '');
    if (/jwt|session|expir|unauthorized|401/i.test(msg)) {
      throw new Error('Upload failed — refresh the form link and try again (no login needed).');
    }
    throw new Error(msg || 'File upload failed');
  }

  return {
    path: data.path || path,
    url: data.publicUrl,
    name: file.name,
    mime: file.type || null,
    size: file.size || null,
  };
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
