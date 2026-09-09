const KEY = 'dip_hr_store_v1';

const DEFAULT = {
  candidates: [],
  documents: [],
  payrollRuns: [],
};

export function loadHrStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveHrStore(next) {
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
