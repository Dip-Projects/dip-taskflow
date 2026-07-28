
// ─── config ────────────────────────────────────────────────────────────────

const CONFIG = {
  maxWidthPx:   1920,   // max output width  (height scales proportionally)
  maxHeightPx:  1920,   // max output height
  jpegQuality:  0.82,   // JPEG compression quality (0–1)
  maxFileSizeKb: 800,   // if still over this after first pass, re-compress
  minQuality:   0.55,   // never go below this quality when retrying
};

// ─── HEIC loader (lazy — only imported when needed) ────────────────────────

let _heic2any = null;
async function getHeic2any() {
  if (_heic2any) return _heic2any;
  try {
    const mod = await import("heic2any");
    _heic2any = mod.default || mod;
    return _heic2any;
  } catch {
    throw new Error(
      "heic2any is not installed. Run: npm install heic2any"
    );
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isHeic(file) {
  // Check MIME type AND filename extension — iOS sometimes sends blank MIME
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

/**
 * Draws an image onto a canvas, scaling it down if it exceeds max dimensions.
 * Returns { canvas, width, height }.
 */
function drawScaled(img) {
  let { naturalWidth: w, naturalHeight: h } = img;

  // Scale down proportionally if too large
  const scaleW = CONFIG.maxWidthPx  / w;
  const scaleH = CONFIG.maxHeightPx / h;
  const scale  = Math.min(1, scaleW, scaleH); // never upscale

  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  // Use high-quality downsampling
  ctx.imageSmoothingEnabled  = true;
  ctx.imageSmoothingQuality  = "high";
  ctx.drawImage(img, 0, 0, w, h);

  return { canvas, width: w, height: h };
}

/**
 * Converts a canvas to a JPEG blob, retrying with lower quality
 * if the result still exceeds CONFIG.maxFileSizeKb.
 */
async function canvasToJpegBlob(canvas, quality = CONFIG.jpegQuality) {
  return new Promise(async (resolve) => {
    let q = quality;
    let blob;

    const attempt = (q) =>
      new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", q)
      );

    blob = await attempt(q);

    // Re-compress if still too large
    while (
      blob &&
      blob.size / 1024 > CONFIG.maxFileSizeKb &&
      q > CONFIG.minQuality
    ) {
      q = Math.max(CONFIG.minQuality, q - 0.1);
      blob = await attempt(q);
    }

    resolve(blob);
  });
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Processes a single File:
 *  1. Converts HEIC/HEIF → JPEG blob via heic2any
 *  2. Loads into an <img> element
 *  3. Scales down if larger than maxWidthPx × maxHeightPx
 *  4. Re-compresses if still over maxFileSizeKb
 *  5. Returns dataUrl + metadata
 *
 * @param {File} file
 * @returns {Promise<{
 *   dataUrl: string,   // base64 JPEG data URL — safe to store in DB or use in PDF
 *   blob: Blob,        // JPEG blob — use for Supabase Storage upload
 *   fileName: string,  // sanitised .jpg filename
 *   width: number,
 *   height: number,
 *   sizeKb: number,    // final compressed size
 *   originalSizeKb: number,
 * }>}
 */
export async function processImage(file) {
  let workingBlob = file;
  const originalSizeKb = Math.round(file.size / 1024);

  // ── Step 1: HEIC → JPEG ──────────────────────────────────────────────────
  if (isHeic(file)) {
    try {
      const heic2any = await getHeic2any();
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: CONFIG.jpegQuality,
      });
      // heic2any can return a single Blob or an array
      workingBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch (err) {
      throw new Error(`HEIC conversion failed: ${err.message}`);
    }
  }

  // ── Step 2: load into <img> ───────────────────────────────────────────────
  const tempUrl = URL.createObjectURL(workingBlob);
  let img;
  try {
    img = await loadImage(tempUrl);
  } finally {
    URL.revokeObjectURL(tempUrl);
  }

  // ── Step 3 & 4: scale + compress ─────────────────────────────────────────
  const { canvas, width, height } = drawScaled(img);
  const jpegBlob = await canvasToJpegBlob(canvas);

  if (!jpegBlob) throw new Error("Canvas toBlob returned null");

  // ── Step 5: produce outputs ───────────────────────────────────────────────
  const dataUrl = await blobToDataUrl(jpegBlob);

  // Sanitise filename → always .jpg
  const baseName = (file.name || "photo")
    .replace(/\.[^.]+$/, "")            // strip extension
    .replace(/[^a-zA-Z0-9_\-\s]/g, "") // strip special chars
    .trim()
    .replace(/\s+/g, "_")
    || "photo";
  const fileName = `${baseName}.jpg`;

  return {
    dataUrl,
    blob: jpegBlob,
    fileName,
    width,
    height,
    sizeKb:         Math.round(jpegBlob.size / 1024),
    originalSizeKb,
  };
}

/**
 * Processes multiple files, skipping non-image files silently.
 * Returns results in the same order as input (failed files are skipped with console.warn).
 *
 * @param {FileList | File[]} files
 * @returns {Promise<Array<{ dataUrl, blob, fileName, width, height, sizeKb, originalSizeKb }>>}
 */
export async function processImageFiles(files) {
  const arr = Array.from(files);
  const results = [];

  for (const file of arr) {
    // Skip non-image files (PDFs, docs, etc.)
    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const isImage =
      mime.startsWith("image/") ||
      name.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic|heif|avif)$/);

    if (!isImage) {
      console.warn(`[imageUtils] Skipped non-image file: ${file.name}`);
      continue;
    }

    try {
      const result = await processImage(file);
      results.push(result);
    } catch (err) {
      console.warn(`[imageUtils] Failed to process ${file.name}:`, err.message);
      // Don't throw — continue with remaining files
    }
  }

  return results;
}

/**
 * Convenience: processes files and returns them in the shape
 * your site report expects: [{ dataUrl, caption }]
 *
 * @param {FileList | File[]} files
 * @param {string[]} [captions]  optional captions array, matched by index
 */
export async function processReportPhotos(files, captions = []) {
  const processed = await processImageFiles(files);
  return processed.map((r, i) => ({
    dataUrl: r.dataUrl,
    caption: captions[i] || "",
    _meta: {
      fileName:       r.fileName,
      width:          r.width,
      height:         r.height,
      sizeKb:         r.sizeKb,
      originalSizeKb: r.originalSizeKb,
    },
  }));
}