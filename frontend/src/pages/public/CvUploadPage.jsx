import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const MAX_PHOTOS = 6;
const DRAFT_KEY = 'tf_cv_upload_draft_v1';

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

function dataUrlToFile(dataUrl, name = 'photo.jpg') {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid image data');
  const mime = m[1] || 'image/jpeg';
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/**
 * Phone CV photos often look grey on print (underexposed paper).
 * Stretch luminance toward pure white + force opaque pixels.
 */
function whitenPaperForPrint(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const samples = [];
  const step = Math.max(4, Math.floor((w * h) / 25000) * 4);
  for (let i = 0; i < d.length; i += step) {
    samples.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }
  samples.sort((a, b) => a - b);
  const pLow = samples[Math.floor(samples.length * 0.02)] ?? 0;
  const pHigh = samples[Math.floor(samples.length * 0.97)] ?? 255;
  const range = Math.max(18, pHigh - pLow);
  for (let i = 0; i < d.length; i += 4) {
    let r = ((d[i] - pLow) / range) * 255;
    let g = ((d[i + 1] - pLow) / range) * 255;
    let b = ((d[i + 2] - pLow) / range) * 255;
    // Extra lift so paper reads as white when printed
    r = Math.min(255, Math.max(0, r * 1.06 + 8));
    g = Math.min(255, Math.max(0, g * 1.06 + 8));
    b = Math.min(255, Math.max(0, b * 1.06 + 8));
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

async function decodeImageSource(file) {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    }
  } catch {
    /* fallback below */
  }
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}

/**
 * Decode image → canvas (white bg, whitened paper, print-safe PNG/JPEG).
 */
async function fileToPrintDataUrl(file, maxEdge = 2200, { format = 'jpeg', quality = 0.92, whiten = true } = {}) {
  const { source, width, height } = await decodeImageSource(file);
  if (!width || !height) throw new Error('Invalid photo');

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, cw, ch);
  if (typeof source.close === 'function') source.close();
  if (whiten) whitenPaperForPrint(ctx, cw, ch);

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl =
    format === 'png' ? canvas.toDataURL(mime) : canvas.toDataURL(mime, quality);
  return { dataUrl, width: cw, height: ch, format: format === 'png' ? 'PNG' : 'JPEG' };
}

/** Alias for draft/crop paths that expect JPEG. */
async function fileToJpegDataUrl(file, maxEdge = 2200, quality = 0.92) {
  return fileToPrintDataUrl(file, maxEdge, { format: 'jpeg', quality, whiten: false });
}

/** Convert CV photos into multi-page A4 PDF — pure white pages, whitened images. */
async function photosToPdfFile(photos, baseName = 'CV') {
  if (!photos?.length) throw new Error('No photos to convert');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: false,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 5;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  for (let i = 0; i < photos.length; i += 1) {
    if (i > 0) pdf.addPage();
    // Pure white page (printers grey empty / transparent PDF backgrounds)
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, 'F');

    // Whiten underexposed paper, then high-quality JPEG (PNG was too heavy on phones)
    const { dataUrl, width, height, format } = await fileToPrintDataUrl(photos[i], 2200, {
      format: 'jpeg',
      quality: 0.94,
      whiten: true,
    });
    const aspect = height / width;
    let w = maxW;
    let h = w * aspect;
    if (h > maxH) {
      h = maxH;
      w = h / aspect;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(dataUrl, format, x, y, w, h, undefined, 'NONE');
    // Re-paint white margin frame so no grey edge leaks from image
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, Math.max(0, y), 'F');
    pdf.rect(0, y + h, pageW, Math.max(0, pageH - (y + h)), 'F');
    pdf.rect(0, 0, Math.max(0, x), pageH, 'F');
    pdf.rect(x + w, 0, Math.max(0, pageW - (x + w)), pageH, 'F');
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

/** Simple drag-rect crop modal */
function CropModal({ src, fileName, onCancel, onDone }) {
  const imgRef = useRef(null);
  const boxRef = useRef(null);
  const drag = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 8, y: 8, w: 80, h: 80 }); // % of display box

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    setNatural({ w: nw, h: nh });
    // Start with ~90% centered crop
    setCrop({ x: 5, y: 5, w: 90, h: 90 });
  };

  const clientToPct = (clientX, clientY) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100)),
    };
  };

  const onPointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const p = clientToPct(e.clientX, e.clientY);
    drag.current = { mode, start: p, crop: { ...crop } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    const p = clientToPct(e.clientX, e.clientY);
    const { mode, start, crop: c0 } = drag.current;
    if (mode === 'move') {
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      let nx = c0.x + dx;
      let ny = c0.y + dy;
      nx = Math.min(100 - c0.w, Math.max(0, nx));
      ny = Math.min(100 - c0.h, Math.max(0, ny));
      setCrop({ ...c0, x: nx, y: ny });
    } else if (mode === 'resize') {
      const nw = Math.min(100 - c0.x, Math.max(15, p.x - c0.x));
      const nh = Math.min(100 - c0.y, Math.max(15, p.y - c0.y));
      setCrop({ ...c0, w: nw, h: nh });
    }
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const applyCrop = async (full = false) => {
    const img = imgRef.current;
    if (!img || !natural.w) return;
    let sx = 0;
    let sy = 0;
    let sw = natural.w;
    let sh = natural.h;
    if (!full) {
      sx = Math.round((crop.x / 100) * natural.w);
      sy = Math.round((crop.y / 100) * natural.h);
      sw = Math.round((crop.w / 100) * natural.w);
      sh = Math.round((crop.h / 100) * natural.h);
    }
    sw = Math.max(1, Math.min(sw, natural.w - sx));
    sh = Math.max(1, Math.min(sh, natural.h - sy));

    const maxEdge = 2400;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    whitenPaperForPrint(ctx, cw, ch);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const base = String(fileName || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    onDone(dataUrlToFile(dataUrl, `${base}_crop.jpg`));
  };

  return (
    <div className="pf-crop-overlay" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="pf-crop-card">
        <h3 className="pf-crop-title">Crop photo</h3>
        <p className="pf-hint" style={{ marginTop: 0 }}>
          Drag the box to move · corner to resize · or use full photo.
        </p>
        <div
          className="pf-crop-stage"
          ref={boxRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img ref={imgRef} src={src} alt="Crop" onLoad={onImgLoad} draggable={false} />
          <div
            className="pf-crop-rect"
            style={{
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.w}%`,
              height: `${crop.h}%`,
            }}
            onPointerDown={(e) => onPointerDown(e, 'move')}
          >
            <span
              className="pf-crop-handle"
              onPointerDown={(e) => onPointerDown(e, 'resize')}
            />
          </div>
        </div>
        <div className="pf-actions" style={{ marginTop: 12 }}>
          <button type="button" className="pf-btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="pf-btn ghost" onClick={() => applyCrop(true)}>
            Use full photo
          </button>
          <button type="button" className="pf-btn" onClick={() => applyCrop(false)}>
            Apply crop
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CvUploadPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastRole, setLastRole] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [cvFile, setCvFile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropName, setCropName] = useState('photo.jpg');
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

  // Restore draft once
  useEffect(() => {
    if (draftRestored) return;
    setDraftRestored(true);
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.fullName) setFullName(String(d.fullName));
      if (d.mobile) setMobile(String(d.mobile));
      if (d.role) setRole(String(d.role));
      if (d.location) setLocation(String(d.location));
      if (Array.isArray(d.photos) && d.photos.length) {
        const files = [];
        d.photos.forEach((p, i) => {
          try {
            if (p?.dataUrl) files.push(dataUrlToFile(p.dataUrl, p.name || `draft_${i + 1}.jpg`));
          } catch (_) {}
        });
        if (files.length) setPhotos(files);
      }
      setInfo('Draft restored — submit when ready, or Save draft again.');
    } catch {
      /* ignore bad draft */
    }
  }, [draftRestored]);

  const clearDraftStorage = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (_) {}
  };

  const saveDraft = async () => {
    setError('');
    setInfo('');
    try {
      const photoPayload = [];
      for (let i = 0; i < photos.length; i += 1) {
        const { dataUrl } = await fileToJpegDataUrl(photos[i], 1600, 0.85);
        photoPayload.push({ name: photos[i].name || `photo_${i + 1}.jpg`, dataUrl });
      }
      const payload = {
        fullName: fullName.trim(),
        mobile: mobile.trim(),
        role,
        location,
        photos: photoPayload,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      setInfo(
        photos.length
          ? `Draft saved (${photos.length} photo${photos.length === 1 ? '' : 's'}). Phone refresh pe bhi wapas aayega.`
          : 'Draft saved (form fields).',
      );
    } catch (e) {
      setError(e.message || 'Could not save draft (photos may be too large)');
    }
  };

  const clearDraft = () => {
    clearDraftStorage();
    setInfo('Draft cleared.');
  };

  const pushPhoto = useCallback((file) => {
    setPhotos((prev) => {
      if (prev.length >= MAX_PHOTOS) return prev;
      return [...prev, file];
    });
    setError('');
    setInfo('');
    setPhotoInputKey((k) => k + 1);
  }, []);

  const openCropForFile = async (file) => {
    if (!file || !isImageFile(file)) {
      setError('Please choose a photo (JPG / PNG)');
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      setError(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      setCropName(file.name || 'photo.jpg');
      setCropSrc(url);
      setError('');
    } catch {
      pushPhoto(file);
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoInputKey((k) => k + 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!role) return setError('Please select a role');
    if (!location) return setError('Please select Surat or Out of Surat');
    if (!cvFile && photos.length === 0) {
      return setError(`Upload a CV file or add 1–${MAX_PHOTOS} photos of the CV`);
    }

    setBusy(true);
    try {
      const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const folder = `hr/cvs/${stamp}`;

      let cvMeta = null;
      const photoMetas = [];

      if (photos.length) {
        const pdfFile = await photosToPdfFile(photos, fullName.trim() || role || 'CV');
        cvMeta = await uploadPublicHrFile(pdfFile, folder);
        for (const p of photos) {
          try {
            photoMetas.push(await uploadPublicHrFile(p, folder));
          } catch {
            /* originals optional */
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
      clearDraftStorage();
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
    setInfo('');
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
      {cropSrc ? (
        <CropModal
          src={cropSrc}
          fileName={cropName}
          onCancel={() => {
            try {
              URL.revokeObjectURL(cropSrc);
            } catch (_) {}
            setCropSrc(null);
          }}
          onDone={(file) => {
            try {
              URL.revokeObjectURL(cropSrc);
            } catch (_) {}
            setCropSrc(null);
            pushPhoto(file);
          }}
        />
      ) : null}

      <form className="pf-card" onSubmit={submit}>
        <p className="pf-brand">DIP PROJECTS</p>
        <h1 className="pf-title">CV upload</h1>
        <p className="pf-sub">
          Select role &amp; location, then upload a PDF/DOC <b>or</b> add photos one by one (max{' '}
          {MAX_PHOTOS}). Crop optional · draft save available · PDF print white pages.
        </p>

        {error ? <div className="pf-error">{error}</div> : null}
        {info ? <div className="pf-info">{info}</div> : null}

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
          Add photo → crop if needed → Add another. Max {MAX_PHOTOS} → 1 clean PDF.
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
            if (f) openCropForFile(f);
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

        <div className="pf-actions pf-actions--split">
          <button type="button" className="pf-btn ghost" onClick={saveDraft} disabled={busy}>
            Save draft
          </button>
          <button type="button" className="pf-btn ghost" onClick={clearDraft} disabled={busy}>
            Clear draft
          </button>
          <button type="submit" className="pf-btn" disabled={busy}>
            {busy ? 'Uploading…' : 'Submit CV'}
          </button>
        </div>
      </form>
    </div>
  );
}
