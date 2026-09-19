const express = require('express');
const multer = require('multer');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const SHARED_BUCKET = 'site-files';
/** Preferred per-file limit (requires project global Storage limit ≥ this). */
const BUCKET_FILE_SIZE_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GiB
/** Hosted projects default global cap is often 50 MB — use as fallback. */
const BUCKET_FILE_SIZE_FALLBACK = 50 * 1024 * 1024;

/** Match Supabase Storage isValidKey (ASCII / S3-safe). */
function sanitizeStorageKey(path) {
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

async function applyBucketFileSizeLimit(bucketName) {
  const attempts = [BUCKET_FILE_SIZE_LIMIT, BUCKET_FILE_SIZE_FALLBACK];
  let lastErr = null;
  for (const limit of attempts) {
    const { error } = await supabase.storage.updateBucket(bucketName, {
      public: true,
      fileSizeLimit: limit,
    });
    if (!error) {
      if (limit < BUCKET_FILE_SIZE_LIMIT) {
        console.warn(
          `[storage] ${bucketName}: fileSizeLimit set to ${limit} bytes (project global cap blocks 5GB). Raise Storage → Global file size limit in Supabase Dashboard, then re-run ensure-bucket.`
        );
      }
      return limit;
    }
    lastErr = error;
  }
  console.warn(`[storage] ${bucketName}: could not set fileSizeLimit:`, lastErr?.message || lastErr);
  return null;
}

async function ensurePublicBucket(bucketName) {
  const { data: existing } = await supabase.storage.getBucket(bucketName);
  if (existing) {
    await applyBucketFileSizeLimit(bucketName);
    return { bucket: bucketName, created: false };
  }

  const { error: createErr } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: BUCKET_FILE_SIZE_FALLBACK,
  });

  if (createErr && !/already exists/i.test(createErr.message || '')) {
    throw new Error(createErr.message);
  }

  await applyBucketFileSizeLimit(bucketName);
  return { bucket: bucketName, created: true };
}

router.get('/list', requireAuth, async (req, res) => {
  try {
    const prefix = String(req.query.path || '').replace(/^\/+|\/+$/g, '');
    if (!prefix) return res.status(400).json({ error: 'Missing path' });
    const bucket = req.query.bucket || SHARED_BUCKET;
    const rows = [];
    for (let offset = 0; offset < 8000; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) return res.status(500).json({ error: error.message });
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const items = rows
      .filter((it) => it.name && it.name !== '.emptyFolderPlaceholder')
      .map((it) => {
        const isFolder = !it.id;
        const fullPath = `${prefix}/${it.name}`;
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fullPath);
        return {
          name: it.name,
          path: fullPath,
          isFolder,
          size: it.metadata?.size || 0,
          updatedAt: it.updated_at || it.created_at || null,
          publicUrl: isFolder ? null : urlData.publicUrl,
        };
      });
    res.json({ path: prefix, items });
  } catch (err) {
    console.error('storage list error:', err.message);
    res.status(500).json({ error: err.message || 'Could not list folder' });
  }
});

router.post('/ensure-bucket', requireAuth, async (req, res) => {
  try {
    const result = await ensurePublicBucket(SHARED_BUCKET);
    await ensurePublicBucket('attendance-photos').catch(() => null);
    await ensurePublicBucket('documents').catch(() => null);
    const { data: bucketMeta } = await supabase.storage.getBucket(SHARED_BUCKET);
    res.json({
      ...result,
      fileSizeLimit: bucketMeta?.file_size_limit ?? null,
      fileSizeLimitHint:
        bucketMeta?.file_size_limit && bucketMeta.file_size_limit < BUCKET_FILE_SIZE_LIMIT
          ? 'Project global Storage file size limit is below 5GB. Set it in Supabase → Project Settings → Storage, then upload again.'
          : null,
    });
  } catch (err) {
    console.error('ensure-bucket error:', err.message);
    res.status(500).json({ error: err.message || 'Could not provision bucket' });
  }
});

/**
 * Signed upload URL so the browser can PUT straight to Supabase. The /upload
 * proxy below runs as a serverless function with a ~4.5 MB body cap, so
 * anything bigger has to skip it (it came back as 413 Content Too Large).
 */
router.post('/signed-upload', requireAuth, async (req, res) => {
  try {
    const path = sanitizeStorageKey(req.body.path || '');
    if (!path) return res.status(400).json({ error: 'Missing path' });

    const bucket = req.body.bucket || SHARED_BUCKET;
    await ensurePublicBucket(bucket);

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: true });

    if (error) {
      console.error('signed-upload error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    res.json({
      bucket,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: urlData.publicUrl,
    });
  } catch (err) {
    console.error('signed-upload error:', err.message);
    res.status(500).json({ error: err.message || 'Could not prepare upload' });
  }
});

/**
 * Upload file via service_role — bypasses Storage RLS that blocks anon key.
 * Body JSON: { path, contentType?, dataUrl } OR multipart field "file" + path
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    await ensurePublicBucket(SHARED_BUCKET);

    let buffer;
    let contentType = req.body.contentType || 'application/octet-stream';
    let path = sanitizeStorageKey(req.body.path || '');

    if (!path) {
      return res.status(400).json({ error: 'Missing path' });
    }

    if (req.file) {
      buffer = req.file.buffer;
      contentType = req.file.mimetype || contentType;
    } else if (req.body.dataUrl) {
      const m = String(req.body.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return res.status(400).json({ error: 'Invalid dataUrl' });
      contentType = m[1] || contentType;
      buffer = Buffer.from(m[2], 'base64');
    } else if (req.body.base64) {
      buffer = Buffer.from(req.body.base64, 'base64');
    } else {
      return res.status(400).json({ error: 'Missing file or dataUrl' });
    }

    const bucket = req.body.bucket || SHARED_BUCKET;
    if (bucket !== SHARED_BUCKET && bucket !== 'attendance-photos' && bucket !== 'documents') {
      await ensurePublicBucket(bucket);
    }

    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      console.error('storage upload error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    res.json({ publicUrl: urlData.publicUrl, path, bucket });
  } catch (err) {
    console.error('upload error:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

module.exports = router;
