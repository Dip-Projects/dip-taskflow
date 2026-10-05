const express = require('express');
const multer  = require('multer');
const supabase = require('../lib/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// 50 MB total limit (drawings can be large DWG/PDF files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const BUCKET = 'task-files'; // reuse existing bucket

// ─── Upload helper ─────────────────────────────────────────────────────────────
// Stores files under: drawings/{project_id}/{category}/{timestamp}_{filename}
async function uploadDrawingFile(file, projectId, category) {
  const safeName = file.originalname.replace(/[^a-zA-Z0-9_.\-]/g, '_');
  const safeCategory = (category || 'Uncategorised').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const path = `drawings/${projectId}/${safeCategory}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// ─── Full select shape ──────────────────────────────────────────────────────────
const DRAWING_SELECT = `
  id, category, sub_cat_1, sub_cat_2, sub_cat_3,
  drawing_date, revision, remarks, file_urls, file_paths, created_at,
  project:projects!drawings_project_id_fkey ( id, name ),
  head_user:users!drawings_head_id_fkey ( id, full_name ),
  added_by_user:users!drawings_added_by_fkey ( id, full_name )
`;

// ─── List all drawings (admin only) ────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    let query = supabase
      .from('drawings')
      .select(DRAWING_SELECT)
      .order('created_at', { ascending: false });

    if (req.query.project_id) query = query.eq('project_id', req.query.project_id);
    if (req.query.category)   query = query.eq('category', req.query.category);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List drawings error:', err.message);
    res.status(500).json({ error: 'Could not load drawings' });
  }
});

// ─── Add drawing (admin only, multipart) ──────────────────────────────────────
router.post('/', requireAdmin, upload.array('files', 20), async (req, res) => {
  try {
    const { project_id, category, sub_cat_1, sub_cat_2, sub_cat_3,
            drawing_date, head_id, revision, remarks } = req.body || {};

    if (!project_id || !category || !drawing_date || !head_id) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    // Upload all attached files to Supabase Storage
    const fileUrls  = [];
    const filePaths = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const { url, path } = await uploadDrawingFile(file, project_id, category);
        fileUrls.push(url);
        filePaths.push(path);
      }
    }

    const { data, error } = await supabase
      .from('drawings')
      .insert({
        project_id,
        category,
        sub_cat_1: sub_cat_1 || null,
        sub_cat_2: sub_cat_2 || null,
        sub_cat_3: sub_cat_3 || null,
        drawing_date,
        head_id,
        revision: revision || 'R0',
        remarks: remarks || null,
        file_urls: fileUrls,
        file_paths: filePaths,
        added_by: req.user.id
      })
      .select(DRAWING_SELECT)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Add drawing error:', err.message);
    res.status(500).json({ error: err.message || 'Could not save drawing' });
  }
});

// ─── Delete drawing (admin only) — removes files from storage too ──────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch file_paths first so we can remove them from storage
    const { data: drawing, error: fetchErr } = await supabase
      .from('drawings')
      .select('id, file_paths')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });

    // Remove files from Supabase Storage (non-critical — don't fail if files missing)
    if (drawing.file_paths && drawing.file_paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(drawing.file_paths).catch(() => {});
    }

    const { error } = await supabase.from('drawings').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete drawing error:', err.message);
    res.status(500).json({ error: err.message || 'Could not delete drawing' });
  }
});

module.exports = router;
