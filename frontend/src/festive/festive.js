// Seasonal (Diwali) theme switch.
//
// The theme is on only between `start` and `end` (local date, inclusive), like
// the seasonal logos Google shows. Outside that window the app looks exactly
// as it did before.
//
// To turn the theme off for good: set `enabled: false`.
// To remove it completely: delete the <FestiveLayer /> line in main.jsx and
// the src/festive folder.
export const FESTIVE_CONFIG = {
  enabled: true,
  start: '2026-10-25',
  end: '2026-11-15',
  // true = show the theme on every day, for previewing it. Keep false normally.
  forceOn: false,
};

function localDateKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function isFestiveActive(date = new Date()) {
  if (!FESTIVE_CONFIG.enabled) return false;
  if (FESTIVE_CONFIG.forceOn) return true;
  const today = localDateKey(date);
  return today >= FESTIVE_CONFIG.start && today <= FESTIVE_CONFIG.end;
}
