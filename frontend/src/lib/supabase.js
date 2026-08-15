import { createClient } from '@supabase/supabase-js';

function readConfig() {
  const runtime =
    typeof window !== 'undefined' && window.__TF_CONFIG__
      ? window.__TF_CONFIG__
      : null;
  return {
    url:
      runtime?.supabaseUrl ||
      import.meta.env.VITE_SUPABASE_URL ||
      '',
    anonKey:
      runtime?.supabaseAnonKey ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      '',
  };
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = readConfig();

if (!supabaseUrl || !supabaseAnonKey || supabaseAnonKey === 'placeholder') {
  console.error(
    '[supabase] Missing anon key. On :5173 check frontend/.env. On :4000 ensure /config.js loads (backend SUPABASE_ANON_KEY) and rebuild.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export { supabaseUrl, supabaseAnonKey };

const _missingTables = new Set();
const _okTables = new Set();
const _tableProbes = new Map();

export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    Number(error.status) === 404 ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    details.includes('schema cache')
  );
}

/** One in-flight check per table so parallel polls do not fire 3× 404s. */
export async function tableExists(table) {
  if (_missingTables.has(table)) return false;
  if (_okTables.has(table)) return true;
  if (_tableProbes.has(table)) return _tableProbes.get(table);
  const probe = (async () => {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error && isMissingTableError(error)) {
      _missingTables.add(table);
      console.warn(`[supabase] Table "${table}" is missing. Run backend/sql/fix_site_portal_missing.sql in Supabase.`);
      return false;
    }
    _okTables.add(table);
    return true;
  })();
  _tableProbes.set(table, probe);
  try {
    return await probe;
  } finally {
    if (_tableProbes.get(table) === probe) _tableProbes.delete(table);
  }
}

export async function fromMaybe(table, build) {
  if (_missingTables.has(table)) {
    return { data: [], error: null, count: 0 };
  }
  if (_tableProbes.has(table)) {
    const ok = await _tableProbes.get(table);
    if (!ok) return { data: [], error: null, count: 0 };
  }
  if (_missingTables.has(table)) {
    return { data: [], error: null, count: 0 };
  }
  if (!_okTables.has(table) && !_tableProbes.has(table)) {
    // First caller owns the request; others wait so we get one 404, not three.
    let resolveProbe;
    const probe = new Promise((resolve) => {
      resolveProbe = resolve;
    });
    _tableProbes.set(table, probe);
    try {
      const res = await build(supabase.from(table));
      if (res?.error && isMissingTableError(res.error)) {
        _missingTables.add(table);
        console.warn(`[supabase] Table "${table}" is missing. Run backend/sql/fix_site_portal_missing.sql in Supabase.`);
        resolveProbe(false);
        return { data: [], error: null, count: 0 };
      }
      _okTables.add(table);
      resolveProbe(true);
      return res;
    } catch (err) {
      resolveProbe(false);
      throw err;
    } finally {
      if (_tableProbes.get(table) === probe) _tableProbes.delete(table);
    }
  }
  const res = await build(supabase.from(table));
  if (res?.error && isMissingTableError(res.error)) {
    _missingTables.add(table);
    _okTables.delete(table);
    return { data: [], error: null, count: 0 };
  }
  return res;
}
