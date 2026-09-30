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

/** Hold trail was one crushed line. Stack each pause and resume on its own lines. */
function formatHoldCell(raw) {
  if (raw === '—') return '—';
  return raw.split(/\s*(?:→|\|)\s*/).map((part) => (
    part
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*\((timer stopped for [^)]+)\)/i, '\n$1')
      .replace(/\s*\(timer stopped\)/i, '\nTimer stopped')
      .replace(/\s*\(timer restarted\)/i, '\nTimer restarted')
      .replace(/\s*·\s*/g, '\n')
  )).filter(Boolean).join('\n\n');
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

module.exports = { buildReportPdf };
