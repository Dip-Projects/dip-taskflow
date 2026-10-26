import { api } from '../../../lib/api';
import { fmtDate, groupRowsBySection } from './checklistFormat';

const HEAD_FILL = [31, 41, 55];
const SECTION_FILL = [229, 231, 235];
const LABEL_FILL = [243, 244, 246];

/** Company block from the company_profile table. Missing details just leave the PDF without a fallback. */
async function fetchCompany() {
  try {
    return (await api('/task-checklists/company')) || {};
  } catch {
    return {};
  }
}

/**
 * Centres text one visual line at a time. A value with line breaks, or one too
 * wide for the page, is drawn line by line, so lines can never overlap.
 * Returns the y for whatever comes next.
 */
function drawCentered(doc, text, pageW, y, { size, bold = false, gap = 1 }) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  const lineH = size * 0.3528 * 1.25;
  const lines = String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => doc.splitTextToSize(s, pageW - 40));
  for (const line of lines) {
    doc.text(line, pageW / 2, y, { align: 'center' });
    y += lineH;
  }
  return y + gap;
}

/** Prints company name, tagline, address and contact lines at the top, centred. Returns the next free y. */
function drawCompanyHeader(doc, company, pageW) {
  let y = 14;
  if (company.company_name) y = drawCentered(doc, company.company_name, pageW, y, { size: 15, bold: true, gap: 0.5 });
  //if (company.tagline) y = drawCentered(doc, company.tagline, pageW, y, { size: 9.5, bold: true, gap: 0.5 });
  if (company.address) y = drawCentered(doc, company.address, pageW, y, { size: 9 });
  const contact = [
    company.phone && `Phone: ${company.phone}`,
    company.email && `Email: ${company.email}`,
    company.website,
  ].filter(Boolean);
  if (contact.length) y = drawCentered(doc, contact.join('   |   '), pageW, y, { size: 9 });
  if (company.gst_no) y = drawCentered(doc, `GST No: ${company.gst_no}`, pageW, y, { size: 9 });
  return y + 2;
}

/** Text-only PDF of one submitted checklist: company header, short details, title, then the checklist. */
export async function downloadChecklistPdf(detail) {
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = autoTableMod.default || autoTableMod;

  const company = await fetchCompany();
  const task = detail.task || {};
  const typeName = detail.task_type?.name || '';
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  const headerEndY = drawCompanyHeader(doc, company, pageW);

  const label = (text) => ({ content: text, styles: { fontStyle: 'bold', fillColor: LABEL_FILL } });
  autoTable(doc, {
    startY: headerEndY,
    theme: 'grid',
    body: [
      [label('Project'), task.project?.name || '—'],
      [label('Date'), fmtDate(detail.submitted_at)],
      [label('Pre. By'), task.assigned_to_user?.full_name || '—'],
    ],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 40 } },
  });

  const titleY = doc.lastAutoTable.finalY + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${(typeName || 'Task').toUpperCase()} CHECK LIST`, pageW / 2, titleY, { align: 'center' });
  doc.setTextColor(20);

  const body = [];
  groupRowsBySection(detail.rows).forEach((group) => {
    // Common checks sit at the top without a heading or SR numbers.
    if (group.common) {
      group.rows.forEach((row) => {
        body.push(['', row.checklist_item || '', row.comments || '']);
      });
      return;
    }
    body.push([
      {
        content: `${group.letter}   ${group.title}`,
        colSpan: 3,
        styles: { fontStyle: 'bold', fillColor: SECTION_FILL, fontSize: 10 },
      },
    ]);
    group.rows.forEach((row, ri) => {
      body.push([String(ri + 1), row.checklist_item || '', row.comments || '']);
    });
  });

  autoTable(doc, {
    startY: titleY + 4,
    head: [['SR NO', 'PARTICULAR', 'COMMENT']],
    body: body.length ? body : [[{ content: 'No checkpoints were recorded.', colSpan: 3 }]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: HEAD_FILL, textColor: 255, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 62 },
    },
    showHead: 'everyPage',
  });

  const safeName = String(task.description || typeName || 'task')
    .slice(0, 40)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`checklist-${safeName || 'task'}-${stamp}.pdf`);
}
