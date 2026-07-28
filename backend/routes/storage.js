const express = require('express');
const multer = require('multer');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

const SHARED_BUCKET = 'site-files';

async function ensurePublicBucket(bucketName) {
  const { data: existing } = await supabase.storage.getBucket(bucketName);
  if (existing) return { bucket: bucketName, created: false };

  const { error: createErr } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: '50MB',
  });

  if (createErr && !/already exists/i.test(createErr.message || '')) {
    throw new Error(createErr.message);
  }

  try {
    await supabase.storage.updateBucket(bucketName, { public: true });
  } catch {
    /* ignore */
  }

  return { bucket: bucketName, created: true };
}

router.post('/ensure-bucket', requireAuth, async (req, res) => {
  try {
    const result = await ensurePublicBucket(SHARED_BUCKET);
    await ensurePublicBucket('attendance-photos').catch(() => null);
    await ensurePublicBucket('documents').catch(() => null);
    res.json(result);
  } catch (err) {
    console.error('ensure-bucket error:', err.message);
    res.status(500).json({ error: err.message || 'Could not provision bucket' });
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
    let path = (req.body.path || '').replace(/^\/+/, '');

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
