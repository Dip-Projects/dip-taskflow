import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getExpCertContent, formatDateLong, safeFileName } from './expCertContent';
import logoUrl from '../../../assets/dip-logo.jpg';

const BRAND = {
  company: 'Dip Projects',
  addr1: '407/A, Trinity Business Park, L.P Savani Road, Adajan, Surat-395009.',
  addr2: 'Email : dipprojects2008@gmail.com | office.dipprojects@gmail.com',
  addr3: 'Website: www.dipprojects.com',
  dark: [61, 31, 0],
  orange: [255, 87, 26],
  phone: '+91 98253 44040',
};

async function toDataUrl(src) {
  if (!src) return '';
  if (String(src).startsWith('data:')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(new Error('logo read failed'));
      fr.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

async function buildQrDataUrl() {
  try {
    return await QRCode.toDataURL('https://www.dipprojects.com', {
      width: 160,
      margin: 1,
      color: { dark: '#3D1F00', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

/**
 * Experience certificate via jsPDF (no html2canvas) — reliable download on localhost.
 */
export async function generateExpCertificatePdf(certData, opts = {}) {
  const name = String(certData.name || '').trim();
  const designation = String(certData.designation || '').trim();
  let fromDate = String(certData.fromDate || '').trim();
  let toDate = String(certData.toDate || '').trim();
  if (!name || !designation || !fromDate || !toDate) {
    throw new Error('Name, designation, from and to dates required');
  }

  // Convert YYYY-MM-DD from date picker to long form
  const toLong = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return formatDateLong(d);
  };
  fromDate = toLong(fromDate);
  toDate = toLong(toDate);

  const companyName = String(certData.companyName || BRAND.company)
    .trim()
    .replace(/\bDIP\b/g, 'Dip');
  const dateStr = formatDateLong(new Date());
  const content = getExpCertContent(designation, name, certData.gender || 'Male');
  const [logoData, qrData] = await Promise.all([
    toDataUrl(opts.logoSrc || logoUrl),
    opts.qrDataUrl ? Promise.resolve(opts.qrDataUrl) : buildQrDataUrl(),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth(); // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const left = 18;
  const right = pageW - 18;
  const contentW = right - left;

  // Top brand bars
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageW, 3.2, 'F');
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 4.2, pageW, 2.2, 'F');

  let y = 12;

  // Columns: logo+name | phone | address | QR
  const phoneX = 78;
  const addrLeft = 108;
  const addrRight = pageW - 22;
  const addrW = addrRight - addrLeft;
  const qrX = pageW - 18;

  if (logoData) {
    try {
      const fmt = logoData.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoData, fmt, left, y, 11, 16);
    } catch {
      /* skip logo */
    }
  }
  doc.setTextColor(61, 40, 23);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.text(companyName, left + 14, y + 9);

  // Orange vertical dividers (clear of address text)
  doc.setDrawColor(...BRAND.orange);
  doc.setLineWidth(0.35);
  doc.line(phoneX - 6, y + 1, phoneX - 6, y + 17);
  doc.line(addrLeft - 4, y + 1, addrLeft - 4, y + 17);

  // Phone
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(BRAND.phone, phoneX + 8, y + 9, { align: 'center' });

  // Address block — left-aligned inside its column (no overlap with divider)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Civil Project Management Consultant', addrLeft + 2, y + 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  const addr1 = doc.splitTextToSize(BRAND.addr1, addrW - 2);
  let ay = y + 7;
  doc.text(addr1, addrLeft + 2, ay);
  ay += addr1.length * 2.5 + 0.6;
  const emailLines = doc.splitTextToSize(BRAND.addr2, addrW - 2);
  doc.text(emailLines, addrLeft + 2, ay);
  ay += emailLines.length * 2.5 + 0.6;
  doc.text(BRAND.addr3, addrLeft + 2, ay);

  if (qrData) {
    try {
      doc.addImage(qrData, 'PNG', qrX - 12, y, 13, 13);
    } catch {
      /* skip qr */
    }
  }

  y = 34;
  doc.setDrawColor(...BRAND.orange);
  doc.setLineWidth(0.6);
  doc.line(0, y, pageW, y);

  y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('EXPERIENCE CERTIFICATE', pageW / 2, y, { align: 'center' });
  // underline title
  const tw = doc.getTextWidth('EXPERIENCE CERTIFICATE');
  doc.setLineWidth(0.4);
  doc.setDrawColor(0, 0, 0);
  doc.line(pageW / 2 - tw / 2, y + 1.5, pageW / 2 + tw / 2, y + 1.5);

  y = 58;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${dateStr}`, right, y, { align: 'right' });

  y = 68;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('To Whom It May Concern,', pageW / 2, y, { align: 'center' });
  const concernW = doc.getTextWidth('To Whom It May Concern,');
  doc.line(pageW / 2 - concernW / 2, y + 1.2, pageW / 2 + concernW / 2, y + 1.2);

  y = 78;
  const p1 =
    `This is to certify that ${name} has worked with ${companyName} as a ${designation} from ${fromDate} to ${toDate}.`;
  doc.setFontSize(10.5);
  const p1Lines = doc.splitTextToSize(p1, contentW - 8);
  doc.text(p1Lines, left + 4, y);
  y += p1Lines.length * 5.2 + 4;

  const duringText =
    `During ${certData.gender === 'Female' ? 'her' : 'his'} tenure with us, ` +
    `${certData.gender === 'Female' ? 'she' : 'he'} was responsible for the following:`;
  const duringLines = doc.splitTextToSize(duringText, contentW - 8);
  doc.text(duringLines, left + 4, y);
  y += duringLines.length * 5.2 + 3;

  const bullets = content.bullets || [];
  doc.setFontSize(10);
  for (const b of bullets) {
    const lines = doc.splitTextToSize(`•  ${b}`, contentW - 14);
    if (y + lines.length * 4.8 > pageH - 55) break;
    doc.text(lines, left + 8, y);
    y += lines.length * 4.8 + 1.2;
  }

  y += 4;
  doc.setFontSize(10.5);
  for (const c of content.closing || []) {
    const lines = doc.splitTextToSize(c, contentW - 8);
    if (y + lines.length * 5.2 > pageH - 40) break;
    doc.text(lines, left + 4, y);
    y += lines.length * 5.2 + 3;
  }

  // Signature
  y = Math.max(y + 8, pageH - 42);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(left + 4, y, left + 70, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Authorized Signatory', left + 4, y);
  y += 4.5;
  doc.text(companyName, left + 4, y);

  // Bottom brand bars
  doc.setFillColor(...BRAND.dark);
  doc.rect(0, pageH - 8, pageW, 2.2, 'F');
  doc.rect(0, pageH - 4.2, pageW, 4.2, 'F');

  const filename = `ExpCert_${safeFileName(name) || 'Employee'}_${new Date().getFullYear()}.pdf`;
  try {
    doc.save(filename);
  } catch (err) {
    // Fallback blob download if save() blocked
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  return { success: true, filename };
}
