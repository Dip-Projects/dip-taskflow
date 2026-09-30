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
    ? rows.map((row) => head.map((_, i) => cell(row[i])))
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
      fontSize: 8,
      cellPadding: 1,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      overflow: 'linebreak',
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

function cell(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s || '—';
}

function columnStyles(headers, tableW) {
  const weightFor = (label) => {
    const s = String(label || '').toLowerCase();
    if (s === 'sr') return 0.5;
    if (s.includes('description') || s.includes('hold /')) return 2.2;
    if (s.includes('employee') || s.includes('project')) return 1.35;
    if (s.includes('status')) return 0.9;
    return 1.05;
  };
  const weights = headers.map(weightFor);
  const sum = weights.reduce((n, w) => n + w, 0) || 1;
  const styles = {};
  headers.forEach((_, i) => {
    styles[i] = { cellWidth: (weights[i] / sum) * tableW };
  });
  return styles;
}

module.exports = { buildReportPdf };
