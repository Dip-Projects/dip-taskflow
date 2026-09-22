import { useEffect, useMemo, useRef, useState } from 'react';
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

export const CV_LOCATIONS = ['Surat', 'Out of Surat'];

const MAX_PHOTOS = 3;

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

/**
 * Decode image → canvas JPEG (keeps aspect ratio, avoids stretch / HEIC quirks).
 */
async function fileToJpegDataUrl(file, maxEdge = 2000) {
  let width;
  let height;
  let source;

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      source = bitmap;
    }
  } catch {
    source = null;
  }

  if (!source) {
    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    source = img;
  }

  if (!width || !height) throw new Error('Invalid photo');

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, 0, 0, cw, ch);
  if (typeof source.close === 'function') source.close();

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: cw,
    height: ch,
  };
}

/** Convert 1–3 CV photos into a multi-page A4 PDF (one photo per page, no stretch). */
async function photosToPdfFile(photos, baseName = 'CV') {
  if (!photos?.length) throw new Error('No photos to convert');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  for (let i = 0; i < photos.length; i += 1) {
    if (i > 0) pdf.addPage();
    const { dataUrl, width, height } = await fileToJpegDataUrl(photos[i]);
    const aspect = height / width;
    let w = maxW;
    let h = w * aspect;
    if (h > maxH) {
      h = maxH;
      w = h / aspect;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(dataUrl, 'JPEG', x, y, w, h, undefined, 'MEDIUM');
  }

  const blob = pdf.output('blob');
  const safe = String(baseName || 'CV')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 40);
  return new File([blob], `${safe || 'CV'}_photos.pdf`, { type: 'application/pdf' });
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type && /^image\//i.test(file.type)) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || '');
}

export default function CvUploadPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastRole, setLastRole] = useState('');
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [cvFile, setCvFile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const photoInputRef = useRef(null);

  const photoPreview = useMemo(
    () =>
      photos.map((f, i) => ({
        key: `${f.name}-${f.size}-${f.lastModified}-${i}`,
        name: f.name || `Photo ${i + 1}`,
        url: URL.createObjectURL(f),
      })),
    [photos],
  );

  useEffect(() => {
    return () => {
      photoPreview.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url);
        } catch (_) {}
      });
    };
  }, [photoPreview]);

  const addOnePhoto = (file) => {
    if (!file || !isImageFile(file)) {
      setError('Please choose a photo (JPG / PNG)');
      return;
    }
    setPhotos((prev) => {
      if (prev.length >= MAX_PHOTOS) return prev;
      return [...prev, file];
    });
    setError('');
    setPhotoInputKey((k) => k + 1);
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoInputKey((k) => k + 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!role) return setError('Please select a role');
    if (!location) return setError('Please select Surat or Out of Surat');
    if (!cvFile && photos.length === 0) {
      return setError('Upload a CV file or add 1–3 photos of the CV');
    }

    setBusy(true);
    try {
      const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const folder = `hr/cvs/${stamp}`;

      let cvMeta = null;
      const photoMetas = [];

      if (photos.length) {
        // Build multi-page PDF from ALL photos first (primary CV file)
        const pdfFile = await photosToPdfFile(photos, fullName.trim() || role || 'CV');
        cvMeta = await uploadPublicHrFile(pdfFile, folder);
        for (const p of photos) {
          try {
            photoMetas.push(await uploadPublicHrFile(p, folder));
          } catch {
            /* originals optional if phone format fails upload */
          }
        }
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
          location,
          cv: cvMeta,
          photos: photoMetas,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      setLastRole(role);
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit CV');
    } finally {
      setBusy(false);
    }
  };

  const startAnother = () => {
    setDone(false);
    setError('');
    setFullName('');
    setMobile('');
    setRole('');
    setLocation('');
    setCvFile(null);
    setPhotos([]);
    setFileKey((k) => k + 1);
    setPhotoInputKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (done) {
    return (
      <div className="pf-page">
        <div className="pf-card pf-ok">
          <h2>CV submitted</h2>
          <p>
            Thank you{fullName.trim() ? `, ${fullName.trim()}` : ''}. HR has received your CV for{' '}
            <strong>{lastRole || role}</strong>.
          </p>
          <p style={{ marginTop: 12 }}>
            Aur ek CV add karni hai? Form yahin se dubara bhar sakte ho — QR scan ki zaroorat nahi.
          </p>
          <div className="pf-actions" style={{ marginTop: 16 }}>
            <button type="button" className="pf-btn" onClick={startAnother}>
              Add another CV
            </button>
          </div>
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
          Select role &amp; location, then upload a PDF/DOC <b>or</b> add photos one by one (max{' '}
          {MAX_PHOTOS}). Har photo PDF ki alag page banegi — stretch nahi hoga.
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
            Location <span className="pf-req">*</span>
            <select value={location} onChange={(e) => setLocation(e.target.value)} required>
              <option value="">Select location</option>
              {CV_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field full">
            CV file (PDF / DOC / DOCX)
            <input
              key={`cv-file-${fileKey}`}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                setCvFile(e.target.files?.[0] || null);
                setError('');
              }}
            />
          </label>
        </div>

        <div className="pf-section">CV photos (optional if file uploaded)</div>
        <p className="pf-hint" style={{ marginTop: 0 }}>
          Ek photo add karo → phir <b>Add another photo</b>. Max {MAX_PHOTOS} photos → 1 PDF.
        </p>

        <input
          key={`cv-photo-one-${photoInputKey}`}
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addOnePhoto(f);
            e.target.value = '';
          }}
        />

        {photoPreview.length > 0 && (
          <div className="pf-photo-grid">
            {photoPreview.map((p, i) => (
              <div key={p.key} className="pf-photo-thumb pf-photo-thumb--with-x">
                <img src={p.url} alt={p.name} />
                <button
                  type="button"
                  className="pf-photo-remove"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => removePhoto(i)}
                >
                  ×
                </button>
                <span className="pf-photo-num">{i + 1}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pf-photo-actions">
          {photos.length < MAX_PHOTOS ? (
            <button
              type="button"
              className="pf-btn ghost"
              onClick={() => photoInputRef.current?.click()}
            >
              {photos.length === 0 ? 'Add photo' : 'Add another photo'}
              {photos.length > 0 ? ` (${photos.length}/${MAX_PHOTOS})` : ''}
            </button>
          ) : (
            <span className="pf-hint">{MAX_PHOTOS} photos added — ready to submit</span>
          )}
          {photos.length > 0 ? (
            <button
              type="button"
              className="pf-btn ghost"
              onClick={() => {
                setPhotos([]);
                setPhotoInputKey((k) => k + 1);
              }}
            >
              Clear photos
            </button>
          ) : null}
        </div>

        <div className="pf-actions">
          <button type="submit" className="pf-btn" disabled={busy}>
            {busy ? 'Uploading…' : 'Submit CV'}
          </button>
        </div>
      </form>
    </div>
  );
}
