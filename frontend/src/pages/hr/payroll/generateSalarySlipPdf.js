import html2pdf from 'html2pdf.js';
import logoUrl from '../../../assets/dip-logo.jpg';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inr(n) {
  return Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const MO = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const C = {
  brown: '#3D1F00',
  orange: '#FF571A',
  ink: '#22160c',
  muted: '#6a5545',
  line: '#cbbbab',
  wash: '#f6f0e8',
  white: '#ffffff',
};

export function amountInWords(n) {
  const num = Math.round(Number(n) || 0);
  if (num === 0) return 'Zero Rupees Only';
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(x) {
    if (x < 20) return a[x];
    return `${b[Math.floor(x / 10)]}${x % 10 ? ` ${a[x % 10]}` : ''}`.trim();
  }
  function three(x) {
    if (x < 100) return two(x);
    return `${a[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ''}`.trim();
  }
  let rem = num;
  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  const parts = [];
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (rem) parts.push(three(rem));
  return `${parts.join(' ')} Rupees Only`;
}

function metaCell(label, value, opts = {}) {
  const { wide = false } = opts;
  return `
    <td style="width:${wide ? '34%' : '16%'};padding:4pt 8pt 8pt 0;vertical-align:top;">
      <div style="font-size:6.8pt;letter-spacing:0.7px;text-transform:uppercase;color:${C.muted};font-weight:700;margin-bottom:2pt;">${label}</div>
      <div style="font-size:10pt;font-weight:700;color:${C.ink};line-height:1.25;">${value}</div>
    </td>`;
}

/** Formal corporate payslip — DIP letterhead. */
export async function generateSalarySlipPdf(data) {
  const earn = data.earnings || [];
  const ded = data.deductions || [];
  const pad = Math.max(earn.length, ded.length, 5);

  const rowHtml = [];
  for (let i = 0; i < pad; i++) {
    const e = earn[i];
    const d = ded[i];
    rowHtml.push(`
      <tr>
        <td style="padding:6pt 8pt 6pt 0;border-bottom:1px solid ${C.line};font-size:9.5pt;">${e ? esc(e.label) : '&nbsp;'}</td>
        <td style="padding:6pt 10pt 6pt 0;border-bottom:1px solid ${C.line};text-align:right;font-size:9.5pt;font-variant-numeric:tabular-nums;">${e ? `₹ ${inr(e.amt)}` : '&nbsp;'}</td>
        <td style="padding:6pt 8pt 6pt 10pt;border-bottom:1px solid ${C.line};font-size:9.5pt;">${d ? esc(d.label) : '&nbsp;'}</td>
        <td style="padding:6pt 0;border-bottom:1px solid ${C.line};text-align:right;font-size:9.5pt;font-variant-numeric:tabular-nums;">${d ? `₹ ${inr(d.amt)}` : '&nbsp;'}</td>
      </tr>`);
  }

  const monthParts = String(data.month || '').split('-');
  const monthLabel =
    monthParts.length === 2
      ? `${MO[parseInt(monthParts[1], 10) - 1]} ${monthParts[0]}`
      : data.month || '—';

  let payDateFmt = data.payDate || '—';
  try {
    const pd = new Date(data.payDate);
    if (!Number.isNaN(pd.getTime())) {
      payDateFmt = pd.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  } catch {
    /* keep */
  }

  const logo = data.logoSrc || data.logoBase64 || logoUrl;
  const company = data.companyName || 'Dip Projects';
  const addressLine =
    [data.companyAddr, data.companyCity, data.companyCountry].filter(Boolean).join(', ') ||
    '407/A, Trinity Business Park, L.P Savani Road, Adajan, Surat-395009.';

  const gross = Number(data.gross || 0);
  const totalDed = Number(data.totalDeductions || 0);
  const net = Number(data.netPayable || gross - totalDed);
  const words = data.amountWords || amountInWords(net);
  const nowLabel = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const slipNo = `DIP/PS/${String(data.month || '').replace('-', '') || new Date().getFullYear()}/${esc(
    String(data.empId || 'EMP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'EMP'
  )}`;

  const html = `
  <div class="sheet" style="width:210mm;height:297mm;box-sizing:border-box;background:${C.white};color:${C.ink};font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;display:flex;flex-direction:column;">
    <!-- top brand bars -->
    <div style="height:6pt;background:${C.brown};flex-shrink:0;"></div>
    <div style="height:2.5pt;background:${C.orange};flex-shrink:0;"></div>

    <div style="padding:14pt 20pt 10pt;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;">
      <!-- letterhead -->
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:62pt;vertical-align:middle;padding:0 12pt 0 0;">
            <img src="${logo}" alt="" style="height:56pt;width:auto;display:block;" />
          </td>
          <td style="vertical-align:middle;padding:0;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:21pt;color:#3d2817;letter-spacing:0.3px;">${esc(company)}</div>
            <div style="font-size:9.5pt;font-weight:700;color:${C.ink};margin-top:1pt;">Civil Project Management Consultant</div>
            <div style="font-size:7.4pt;color:${C.muted};margin-top:4pt;line-height:1.4;">${esc(addressLine)}</div>
            <div style="font-size:7.4pt;color:${C.muted};line-height:1.4;">Email: dipprojects2008@gmail.com · office.dipprojects@gmail.com</div>
            <div style="font-size:7.4pt;color:${C.muted};line-height:1.4;">Phone: +91 98253 44040 · Web: www.dipprojects.com</div>
          </td>
          <td style="width:118pt;vertical-align:top;text-align:right;padding:0;">
            <div style="font-size:6.5pt;letter-spacing:1.2px;text-transform:uppercase;color:${C.orange};font-weight:800;">Confidential</div>
            <div style="margin-top:10pt;text-align:right;">
              <div style="font-size:7pt;letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};font-weight:700;">Payslip month</div>
              <div style="font-size:12pt;font-weight:800;color:${C.brown};margin-top:2pt;line-height:1.2;">${esc(monthLabel)}</div>
            </div>
            <div style="margin-top:8pt;font-size:6.8pt;color:${C.muted};">Slip No.<br/><b style="color:${C.ink};font-size:7.2pt;">${slipNo}</b></div>
          </td>
        </tr>
      </table>

      <div style="height:1.2pt;background:${C.orange};margin:12pt 0 0;"></div>

      <div style="text-align:center;margin:12pt 0 10pt;">
        <div style="font-size:12.5pt;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:${C.brown};">Salary Slip</div>
        <div style="font-size:8pt;color:${C.muted};margin-top:2pt;">For the month of ${esc(monthLabel)}</div>
      </div>

      <div style="flex:1 1 auto;">
      <!-- employee particulars — no outer box -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:6pt;border-bottom:1px solid ${C.line};">
        <tr>
          ${metaCell('Employee Name', esc(data.empName || '—'), { wide: true })}
          ${metaCell('Employee ID / Code', esc(data.empId || '—'))}
          ${metaCell('Pay Date', esc(payDateFmt))}
        </tr>
        <tr>
          ${metaCell('Designation', esc(data.designation || '—'), { wide: true })}
          ${metaCell('Department', esc(data.department || '—'))}
          ${metaCell('Paid Days / LOP', `${esc(data.paidDays ?? '—')} / ${esc(data.lopDays ?? '0')}`)}
        </tr>
      </table>

      <!-- earnings + deductions — light rules only, no dark header boxes -->
      <table style="width:100%;border-collapse:collapse;margin-top:8pt;">
        <thead>
          <tr>
            <th colspan="2" style="padding:6pt 8pt 4pt 0;background:transparent;color:${C.brown};text-align:left;font-size:9.5pt;letter-spacing:0.8px;text-transform:uppercase;font-weight:800;border-bottom:1.4pt solid ${C.brown};">Earnings</th>
            <th colspan="2" style="padding:6pt 0 4pt 10pt;background:transparent;color:${C.brown};text-align:left;font-size:9.5pt;letter-spacing:0.8px;text-transform:uppercase;font-weight:800;border-bottom:1.4pt solid ${C.brown};">Deductions</th>
          </tr>
          <tr>
            <th style="padding:7pt 8pt 5pt 0;text-align:left;font-size:7pt;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.line};font-weight:700;width:28%;">Particulars</th>
            <th style="padding:7pt 10pt 5pt 0;text-align:right;font-size:7pt;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.line};font-weight:700;width:22%;">Amount (₹)</th>
            <th style="padding:7pt 8pt 5pt 10pt;text-align:left;font-size:7pt;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.line};font-weight:700;width:28%;">Particulars</th>
            <th style="padding:7pt 0 5pt 0;text-align:right;font-size:7pt;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};border-bottom:1px solid ${C.line};font-weight:700;width:22%;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml.join('')}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:9pt 8pt 8pt 0;font-weight:800;font-size:9.5pt;border-top:1.3pt solid ${C.brown};">Gross Earnings</td>
            <td style="padding:9pt 10pt 8pt 0;font-weight:800;font-size:9.5pt;text-align:right;border-top:1.3pt solid ${C.brown};">₹ ${inr(gross)}</td>
            <td style="padding:9pt 8pt 8pt 10pt;font-weight:800;font-size:9.5pt;border-top:1.3pt solid ${C.brown};">Total Deductions</td>
            <td style="padding:9pt 0 8pt 0;font-weight:800;font-size:9.5pt;text-align:right;border-top:1.3pt solid ${C.brown};">₹ ${inr(totalDed)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- net pay — plain text, no dark box -->
      <div style="margin-top:14pt;padding-top:10pt;border-top:1px solid ${C.line};">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:0;vertical-align:middle;">
              <div style="font-size:8pt;letter-spacing:0.8px;text-transform:uppercase;color:${C.muted};font-weight:700;">Net Salary Payable</div>
              <div style="font-size:8.5pt;color:${C.muted};margin-top:2pt;">(Gross Earnings − Total Deductions)</div>
              <div style="font-size:9pt;margin-top:6pt;color:${C.ink};"><span style="color:${C.muted};">In words:</span> <b>${esc(words)}</b></div>
            </td>
            <td style="width:38%;padding:0;text-align:right;vertical-align:middle;">
              <div style="font-size:8pt;letter-spacing:0.8px;text-transform:uppercase;color:${C.muted};font-weight:700;">Net Pay</div>
              <div style="font-size:20pt;font-weight:800;margin-top:2pt;color:${C.brown};letter-spacing:0.3px;">₹ ${inr(net)}</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="margin-top:12pt;font-size:7.5pt;color:${C.muted};line-height:1.45;">
        <b style="color:${C.ink};">Note:</b> This salary slip is system-generated by Dip Projects for official payroll records.
        Please retain a copy for your reference. For any discrepancy, contact HR within 7 days of receipt.
      </div>
      </div>

      <!-- signature pushed toward page end -->
      <table style="width:100%;margin-top:auto;padding-top:20pt;border-collapse:collapse;flex-shrink:0;">
        <tr>
          <td style="width:50%;vertical-align:bottom;padding:0 10pt 0 0;">
            <div style="font-size:7pt;color:${C.muted};line-height:1.4;">
              Prepared for internal / employee use.<br/>
              Generated: ${esc(nowLabel)}
            </div>
          </td>
          <td style="width:50%;vertical-align:bottom;text-align:center;padding:0;">
            <div style="height:28pt;"></div>
            <div style="border-top:1.1pt solid ${C.brown};width:190pt;margin:0 auto 5pt;"></div>
            <div style="font-size:9pt;font-weight:800;color:${C.brown};">Authorised Signatory</div>
            <div style="font-size:8pt;color:${C.muted};margin-top:1pt;">${esc(company)} · HR / Accounts</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- footer bars — always at physical page bottom -->
    <div style="margin-top:auto;flex-shrink:0;">
      <div style="height:2.5pt;background:${C.orange};"></div>
      <div style="height:6pt;background:${C.brown};"></div>
    </div>
  </div>`;

  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-10000px';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const safe = String(data.empName || 'Employee').replace(/[\\/:*?"<>|]/g, '_');
  const filename = `Payslip_${safe}_${data.month || ''}.pdf`;
  try {
    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrap.querySelector('.sheet'))
      .save();
    return { success: true, filename };
  } finally {
    wrap.remove();
  }
}
