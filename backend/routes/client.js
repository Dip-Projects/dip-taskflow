const express = require('express');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function isClientUser(user) {
  const role = String(user?.role || '').toLowerCase().trim();
  const dept = String(user?.department || '').toLowerCase().trim();
  return role === 'client' || dept === 'client';
}

function requireClient(req, res, next) {
  if (!isClientUser(req.user)) {
    return res.status(403).json({ error: 'This area is for client logins only' });
  }
  next();
}

router.use(requireClient);

function parseSiteNames(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    if (raw.startsWith('{') && raw.endsWith('}')) {
      return (
        raw
          .slice(1, -1)
          .match(/("(?:[^"\\]|\\.)*"|[^,]+)/g)
          ?.map((s) => s.replace(/^"|"$/g, '').trim())
          .filter(Boolean) || []
      );
    }
    return [raw.trim()].filter(Boolean);
  }
  return [];
}

function uniqueSiteNames(names) {
  const sites = [];
  const seen = new Set();
  for (const raw of names || []) {
    const s = String(raw || '').trim();
    const key = s.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sites.push(s);
  }
  return sites;
}

/** Only sites assigned on the client login — never every project. */
async function loadClientSites(userId, jwtUser) {
  const { data: dbUser } = await supabase
    .from('users')
    .select('id, username, full_name, role, department, designation, site_name, site_names')
    .eq('id', userId)
    .maybeSingle();

  const u = dbUser || jwtUser || {};
  const sites = uniqueSiteNames([
    u.site_name,
    ...parseSiteNames(u.site_names),
  ]);

  let projects = [];
  if (sites.length) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, client_name, location, status')
      .order('name');
    const allowed = new Set(sites.map((s) => s.toLowerCase()));
    projects = (data || []).filter((p) => allowed.has(String(p.name || '').toLowerCase()));
  }

  return { user: u, sites, projects };
}

async function assertSite(req, siteName) {
  const { sites } = await loadClientSites(req.user.id, req.user);
  const ok = sites.some((s) => String(s).toLowerCase() === String(siteName || '').toLowerCase());
  if (!ok) {
    const err = new Error('This site is not assigned to your login');
    err.status = 403;
    throw err;
  }
  return sites;
}

router.get('/portal', async (req, res) => {
  try {
    const { user, sites, projects } = await loadClientSites(req.user.id, req.user);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: 'client',
        department: user.department || 'Client',
        designation: user.designation || 'Client',
        site_name: sites[0] || '',
        site_names: sites,
      },
      sites,
      projects,
    });
  } catch (err) {
    console.error('client portal:', err.message);
    res.status(500).json({ error: err.message || 'Could not load client portal' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json({ pending: 0, accepted: 0, rejected: 0, dpr: 0, wpr: 0, photos: 0, recent: [] });
    await assertSite(req, siteName);

    const { data: matRows } = await supabase
      .from('material_requirements')
      .select('id, status, material_name, quantity, unit_name, created_at, actioned_at')
      .ilike('site_name', siteName)
      .order('created_at', { ascending: false });

    const { count: dprCount } = await supabase
      .from('dpr_reports')
      .select('id', { count: 'exact', head: true })
      .ilike('site', siteName);

    const { data: wprRows } = await supabase.from('wpr_reports').select('id').ilike('site_name', siteName);
    const wprIds = (wprRows || []).map((w) => w.id);
    let photoCount = 0;
    if (wprIds.length) {
      const { count } = await supabase
        .from('wpr_images')
        .select('id', { count: 'exact', head: true })
        .in('wpr_report_id', wprIds);
      photoCount = count || 0;
    }

    const rows = matRows || [];
    res.json({
      pending: rows.filter((r) => r.status === 'pending').length,
      accepted: rows.filter((r) => r.status === 'received').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      dpr: dprCount || 0,
      wpr: wprIds.length,
      photos: photoCount,
      recent: rows.slice(0, 6),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/materials', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json([]);
    await assertSite(req, siteName);
    let q = supabase.from('material_requirements').select('*').ilike('site_name', siteName);
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/materials/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['received', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { data: row, error: findErr } = await supabase
      .from('material_requirements')
      .select('id, site_name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!row) return res.status(404).json({ error: 'Request not found' });
    await assertSite(req, row.site_name);

    const { data, error } = await supabase
      .from('material_requirements')
      .update({
        status,
        actioned_at: new Date().toISOString(),
        actioned_by: req.user.full_name || req.user.username || 'Client',
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/media-tree', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json({ dates: [] });
    await assertSite(req, siteName);

    const [{ data: dprRows }, { data: wprRows }, { data: drawingRows }] = await Promise.all([
      supabase.from('dpr_reports').select('id, date, payload').ilike('site', siteName),
      supabase.from('wpr_reports').select('id, report_date').ilike('site_name', siteName),
      supabase.from('drawings').select('id, date, file_urls').ilike('site_name', siteName),
    ]);
    const wprIds = (wprRows || []).map((w) => w.id);
    let imgDates = [];
    if (wprIds.length) {
      const { data } = await supabase
        .from('wpr_images')
        .select('created_at')
        .in('wpr_report_id', wprIds)
        .in('image_type', ['site_photo', 'site_photos', 'graphical']);
      imgDates = (data || []).map((r) => r.created_at);
    }
    const dprPhotoDates = (dprRows || []).flatMap((r) => {
      const photos = Array.isArray(r?.payload?.photos) ? r.payload.photos : [];
      return photos.length ? photos.map(() => r.date) : [];
    });
    const drawingDates = (drawingRows || []).flatMap((d) => {
      const files = Array.isArray(d.file_urls) ? d.file_urls : [];
      return files.length ? files.map(() => d.date) : [];
    });
    const dates = [
      ...(dprRows || []).map((r) => r.date),
      ...(wprRows || []).map((r) => r.report_date),
      ...imgDates,
      ...dprPhotoDates,
      ...drawingDates,
    ].filter(Boolean);
    res.json({ dates });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/media', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json({ dprs: [], wprs: [], photos: [], drawings: [] });
    await assertSite(req, siteName);

    const { data: dprData } = await supabase
      .from('dpr_reports')
      .select('id, site, engineer, report_type, date, pdf_url, created_at, payload')
      .ilike('site', siteName)
      .order('date', { ascending: false });

    const { data: wprData } = await supabase
      .from('wpr_reports')
      .select('id, site_name, engineer_name, report_date, report_number, presentation_url, created_at')
      .ilike('site_name', siteName)
      .order('report_date', { ascending: false });

    const wprIds = (wprData || []).map((w) => w.id);
    let wprPhotoRows = [];
    if (wprIds.length) {
      const { data: imgData } = await supabase
        .from('wpr_images')
        .select('id, wpr_report_id, image_type, public_url, storage_path, caption, created_at')
        .in('wpr_report_id', wprIds)
        .in('image_type', ['site_photo', 'site_photos', 'graphical']);
      wprPhotoRows = (imgData || []).map((p) => ({
        ...p,
        source: 'wpr',
        public_url: p.public_url || null,
      }));
    }

    const dprPhotoRows = (dprData || []).flatMap((report) => {
      const photos = Array.isArray(report?.payload?.photos) ? report.payload.photos : [];
      return photos.filter(Boolean).map((photo, photoIndex) => ({
        id: `${report.id}-${photoIndex}`,
        dpr_report_id: report.id,
        public_url: photo.supabaseUrl || photo.publicUrl || photo.url || null,
        storage_path: photo.storagePath || photo.storage_path || null,
        caption: photo.caption || '',
        created_at: report.date || report.created_at,
        actual_created_at: report.created_at || report.date,
        source: 'dpr',
        image_type: 'photos',
      }));
    });

    const { data: drawingData } = await supabase
      .from('drawings')
      .select('id, site_name, date, file_urls, uploaded_by, created_at')
      .ilike('site_name', siteName)
      .order('date', { ascending: false });

    res.json({
      dprs: dprData || [],
      wprs: wprData || [],
      photos: [...wprPhotoRows, ...dprPhotoRows],
      drawings: drawingData || [],
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/site-profile', async (req, res) => {
  try {
    const siteName = String(req.query.site || '').trim();
    if (!siteName) return res.json(null);
    await assertSite(req, siteName);
    const { data } = await supabase
      .from('site_details')
      .select(
        'site_name, client_name, head_name, head_contact_no, incharge_name, incharge_contact_no, pc_name, pc_contact_no, status, site_image_url, job_no'
      )
      .ilike('site_name', siteName)
      .maybeSingle();
    if (data) return res.json(data);
    const { data: proj } = await supabase
      .from('projects')
      .select('name, client_name, location, status')
      .ilike('name', siteName)
      .maybeSingle();
    if (!proj) return res.json(null);
    res.json({
      site_name: proj.name,
      client_name: proj.client_name,
      status: proj.status,
      location: proj.location,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
