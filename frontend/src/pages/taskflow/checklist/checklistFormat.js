// Shared by the admin screens and the PDF so both read the same way.

const IST = 'Asia/Kolkata';

/** "YYYY-MM-DD" is a calendar date, so build it in local time to avoid a day shift. */
function toDate(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 0 → "A", 1 → "B" … the section letter used on the checklist sheet. */
export function sectionLetter(index) {
  return String.fromCharCode(65 + index);
}

/**
 * Groups answered rows the way the sheet shows them: common checks first (no
 * letter), then each section with its letter. Order within a group is kept.
 */
export function groupRowsBySection(rows = []) {
  const common = { key: 'common', title: 'Common checks', common: true, letter: null, rows: [] };
  const sections = [];
  const byKey = new Map();
  for (const row of rows) {
    if (row.common_item_id) {
      common.rows.push(row);
      continue;
    }
    // A deleted master section has no id left, so fall back to its saved heading.
    const key = row.section_id || `title:${row.section_title || ''}`;
    if (!byKey.has(key)) {
      const group = { key, title: row.section_title || 'Checkpoints', common: false, rows: [] };
      byKey.set(key, group);
      sections.push(group);
    }
    byKey.get(key).rows.push(row);
  }
  sections.forEach((g, i) => {
    g.letter = sectionLetter(i);
  });
  return common.rows.length ? [common, ...sections] : sections;
}
