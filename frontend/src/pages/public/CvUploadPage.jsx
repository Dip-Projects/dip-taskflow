import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { uploadPublicHrFile } from '../../lib/publicHrUpload';
import './publicForms.css';

export const CV_ROLES = [
  'Site Engineer',
  'Coordinator',
  'Head',
  'Site Incharge',
  'Jr Site Engineer',
  'Senior Site Engineer',
  'Jr Interior',
  'Sr Interior',
  'MIS',
  'PC',
  'EA',
  'Estimator',
  'Senior Estimator',
  'Jr Estimator',
  'Sales Executive',
];

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = dataUrl;
  });
}

/** Convert 1–3 CV photos into a multi-page A4 PDF blob. */
async function photosToPdfFile(photos, baseName = 'CV') {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;

  for (let i = 0; i < photos.length; i += 1) {
    if (i > 0) pdf.addPage();
    const file = photos[i];
    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);
    const format = /png/i.test(file.type) ? 'PNG' : 'JPEG';
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    let w = maxW;
    let h = (img.naturalHeight / img.naturalWidth) * w;
    if (h > maxH) {
      h = maxH;
      w = (img.naturalWidth / img.naturalHeight) * h;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(dataUrl, format, x, y, w, h, undefined, 'FAST');
  }

  const blob = pdf.output('blob');
  const safe = String(baseName || 'CV')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 40);
  return new File([blob], `${safe || 'CV'}_photos.pdf`, { type: 'application/pdf' });
}

export default function CvUploadPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('');
  const [cvFile, setCvFile] = useState(null);
  const [photos, setPhotos] = useState([]);

  const photoPreview = useMemo(
    () =>
      photos.map((f, i) => ({
        key: `${f.name}-${i}`,
        name: f.name,
        url: URL.createObjectURL(f),
      })),
    [photos],
  );

  const onPhotos = (list) => {
    const next = [...(list || [])].filter((f) => f && /^image\//i.test(f.type)).slice(0, 3);
    setPhotos(next);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!role) return setError('Please select a role');
    if (!cvFile && photos.length === 0) {
      return setError('Upload a CV file or take/add 1–3 photos of the CV');
    }

    setBusy(true);
    try {
      const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const folder = `hr/cvs/${stamp}`;

      let cvMeta = null;
      const photoMetas = [];

      if (photos.length) {
        for (const p of photos) {
          photoMetas.push(await uploadPublicHrFile(p, folder));
        }
        const pdfFile = await photosToPdfFile(photos, fullName.trim() || role || 'CV');
        cvMeta = await uploadPublicHrFile(pdfFile, folder);
      } else if (cvFile) {
        cvMeta = await uploadPublicHrFile(cvFile, folder);
      }

      if (!cvMeta?.url) throw new Error('CV upload failed');

      const res = await fetch('/api/hr/public/cv-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          mobile: mobile.trim(),
          role,
          cv: cvMeta,
          photos: photoMetas,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit CV');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="pf-page">
        <div className="pf-card pf-ok">
          <h2>CV submitted</h2>
          <p>
            Thank you{fullName.trim() ? `, ${fullName.trim()}` : ''}. HR has received your CV for{' '}
            <strong>{role}</strong>. You may close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-page">
      <form className="pf-card" onSubmit={submit}>
        <p className="pf-brand">DIP PROJECTS</p>
        <h1 className="pf-title">CV upload</h1>
        <p className="pf-sub">
          Select role, then upload a PDF/DOC <b>or</b> take up to 3 photos of your CV. Photos are
          automatically combined into one PDF.
        </p>

        {error ? <div className="pf-error">{error}</div> : null}

        <div className="pf-grid">
          <label className="pf-field">
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Optional"
              autoComplete="name"
            />
          </label>
          <label className="pf-field">
            Mobile
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="Optional"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <label className="pf-field full">
            Role applied <span className="pf-req">*</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} required>
              <option value="">Select role</option>
              {CV_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field full">
            CV file (PDF / DOC / DOCX)
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                setCvFile(e.target.files?.[0] || null);
                setError('');
              }}
            />
          </label>
          <label className="pf-field full">
            Or CV photos (max 3) — camera / gallery → auto PDF
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => onPhotos(e.target.files)}
            />
          </label>
        </div>

        {photoPreview.length > 0 && (
          <div className="pf-photo-grid">
            {photoPreview.map((p) => (
              <div key={p.key} className="pf-photo-thumb">
                <img src={p.url} alt={p.name} />
              </div>
            ))}
            <button type="button" className="pf-btn ghost" onClick={() => setPhotos([])}>
              Clear photos
            </button>
          </div>
        )}

        <div className="pf-actions">
          <button type="submit" className="pf-btn" disabled={busy}>
            {busy ? 'Uploading…' : 'Submit CV'}
          </button>
        </div>
      </form>
    </div>
  );
}
