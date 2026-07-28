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
