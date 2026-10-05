const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** ~1km buckets — must match frontend coordCacheKey (toFixed(3)). */
function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

function uniqParts(parts) {
  const uniq = [];
  for (const p of parts) {
    const s = String(p || '').trim();
    if (!s) continue;
    if (!uniq.some((u) => u.toLowerCase() === s.toLowerCase())) uniq.push(s);
  }
  return uniq;
}

function placeLabelFromNominatim(data) {
  const addr = data?.address || {};
  const area =
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.village ||
    addr.hamlet ||
    addr.town ||
    addr.city_district ||
    addr.municipality ||
    data?.name ||
    '';
  const city =
    addr.city ||
    addr.town ||
    addr.state_district ||
    addr.county ||
    addr.state ||
    '';
  const uniq = uniqParts([area, city]);
  if (uniq.length) return uniq.slice(0, 2).join(', ');
  const display = String(data?.display_name || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return display.slice(0, 2).join(', ');
}

function placeLabelFromPhoton(data) {
  const props = data?.features?.[0]?.properties || {};
  const area = props.name || props.city || props.locality || '';
  const city = props.city || props.county || props.state || props.country || '';
  const uniq = uniqParts([area, city === area ? '' : city]);
  return uniq.slice(0, 2).join(', ');
}

// In-memory cache (process lifetime). Keys are ~1km buckets.
const labelCache = new Map();
const MAX_CACHE = 5000;
const MAX_POINTS = 120;

const NOMINATIM_UA = 'DIP-TaskFlow/1.0 (attendance reverse-geocode)';
let lastNominatimAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function remember(key, label) {
  if (labelCache.size >= MAX_CACHE) {
    const first = labelCache.keys().next().value;
    labelCache.delete(first);
  }
  labelCache.set(key, label);
}

async function reversePhoton(lat, lng) {
  const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = await res.json();
  return placeLabelFromPhoton(data) || '';
}

async function reverseNominatim(lat, lng) {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimAt));
  if (wait) await sleep(wait);
  lastNominatimAt = Date.now();

  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
    `&format=json&zoom=14&addressdetails=1`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = await res.json();
  return placeLabelFromNominatim(data) || '';
}

async function reverseOne(lat, lng) {
  const key = cacheKey(lat, lng);
  if (labelCache.has(key)) return { key, label: labelCache.get(key) };

  let label = '';
  try {
    label = await reversePhoton(lat, lng);
  } catch (err) {
    console.warn('[geocode] photon failed', key, err.message);
  }
  if (!label) {
    try {
      label = await reverseNominatim(lat, lng);
    } catch (err) {
      console.warn('[geocode] nominatim failed', key, err.message);
    }
  }

  remember(key, label);
  return { key, label };
}

/**
 * POST /api/geocode/reverse-batch
 * body: { points: [{ lat, lng }, ...] }
 * returns: { labels: { "26.xxx,75.yyy": "Kotputli, Rajasthan", ... } }
 */
router.post('/reverse-batch', async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.points) ? req.body.points : [];
    const points = [];
    const seen = new Set();

    for (const p of raw) {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const key = cacheKey(lat, lng);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ lat, lng, key });
      if (points.length >= MAX_POINTS) break;
    }

    const labels = {};
    // Photon tolerates mild concurrency; Nominatim fallback is rate-limited inside reverseOne.
    const CONCURRENCY = 4;
    let i = 0;
    async function worker() {
      while (i < points.length) {
        const idx = i++;
        const { lat, lng, key } = points[idx];
        try {
          const { label } = await reverseOne(lat, lng);
          labels[key] = label;
        } catch (err) {
          console.warn('[geocode] reverse failed', key, err.message);
          labels[key] = '';
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, Math.max(points.length, 1)) }, () => worker())
    );

    res.json({ labels });
  } catch (err) {
    console.error('[geocode] reverse-batch:', err.message);
    res.status(500).json({ error: 'Geocode batch failed' });
  }
});

module.exports = router;
