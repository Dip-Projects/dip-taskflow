/**
 * One landscape A3 PDF with every column on the same page.
 * Rows continue on later pages. Used for WhatsApp report files.
 */
async function buildReportPdf({ title, subtitle, headers, rows }) {
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 8;
  const tableW = pageW - margin * 2;
  const head = (headers || []).map((h) => String(h || ''));
  const body = (rows && rows.length)
    ? rows.map((row) => head.map((header, i) => cell(row[i], header)))
    : [head.map((_, i) => (i === 0 ? 'No tasks' : ''))];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(String(title || 'Report'), pageW / 2, 10, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(70);
  const sub = doc.splitTextToSize(String(subtitle || ''), tableW);
  doc.text(sub, pageW / 2, 16, { align: 'center' });
  doc.setTextColor(20);

  autoTable(doc, {
    startY: 16 + sub.length * 4 + 2,
    head: [head],
    body,
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 1.4,
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      overflow: 'linebreak',
      valign: 'middle',
    },
    alternateRowStyles: { fillColor: [247, 243, 236] },
    columnStyles: columnStyles(head, tableW),
    margin: { left: margin, right: margin, top: 10, bottom: 10 },
    tableWidth: tableW,
    showHead: 'everyPage',
    rowPageBreak: 'auto',
    horizontalPageBreak: false,
  });

  return Buffer.from(doc.output('arraybuffer'));
}

function cell(v, header) {
  const raw = String(v ?? '').trim();
  if (!raw) return '—';
  if (String(header || '').toLowerCase().includes('hold /')) return formatHoldCell(raw);
  return raw.replace(/\s+/g, ' ').trim() || '—';
}

/** Turn the raw hold log into short lines a person can read. */
function formatHoldCell(raw) {
  if (!raw || raw === '—') return '—';
  return raw
    .split(/\s*(?:→|\|)\s*/)
    .map(formatHoldPart)
    .filter(Boolean)
    .join('\n\n');
}

function formatHoldPart(part) {
  let s = String(part || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/^total hold/i.test(s)) {
    return `Total time on hold: ${s.replace(/^total hold\s*/i, '').trim()}`;
  }

  const stoppedFor = s.match(/\(timer stopped for ([^)]+)\)/i);
  const stopped = !stoppedFor && /\(timer stopped\)/i.test(s);
  const restarted = /\(timer restarted\)/i.test(s);
  s = s.replace(/\s*\([^)]*\)/g, '').trim();

  const leftMatch = s.match(/·\s*([0-9.]+)h left/i);
  s = s.replace(/\s*·\s*[0-9.]+h left/i, '').trim();

  const when = (value) => {
    const m = String(value || '').trim().match(/^(.+?)\s+(\d{2}:\d{2})$/);
    return m ? `${m[1]} at ${m[2]}` : value;
  };

  const lines = [];
  const hold = s.match(/^Hold\s+(.+)$/i);
  const resume = s.match(/^Resume\s+(.+)$/i);
  const since = s.match(/^On hold since\s+(.+)$/i);
  if (hold) lines.push(`Hold on ${when(hold[1])}`);
  else if (resume) lines.push(`Resumed on ${when(resume[1])}`);
  else if (since) lines.push(`On hold since ${when(since[1])}`);
  else lines.push(s);

  if (leftMatch) lines.push(`Time left: ${leftMatch[1]} hours`);
  if (stoppedFor) lines.push(`Timer was stopped for ${stoppedFor[1]}`);
  else if (stopped) lines.push('Timer was stopped');
  if (restarted) lines.push('Timer started again');
  return lines.join('\n');
}

function columnStyles(headers, tableW) {
  const weightFor = (label) => {
    const s = String(label || '').toLowerCase();
    if (s === 'sr') return 0.45;
    if (s.includes('hold /')) return 3.6;
    if (s.includes('description')) return 2.1;
    if (s.includes('employee') || s.includes('project')) return 1.25;
    if (s.includes('status')) return 0.85;
    return 1;
  };
  const weights = headers.map(weightFor);
  const sum = weights.reduce((n, w) => n + w, 0) || 1;
  const styles = {};
  headers.forEach((label, i) => {
    const style = { cellWidth: (weights[i] / sum) * tableW };
    if (String(label || '').toLowerCase().includes('hold /')) style.fontSize = 9;
    styles[i] = style;
  });
  return styles;
}

module.exports = { buildReportPdf, formatHoldCell };
