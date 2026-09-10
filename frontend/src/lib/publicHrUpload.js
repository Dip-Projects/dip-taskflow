import { supabase } from './supabase';

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

  const { error } = await supabase.storage
    .from(data.bucket || 'documents')
    .uploadToSignedUrl(data.path || path, data.token, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });
  if (error) throw new Error(error.message || 'File upload failed');

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
