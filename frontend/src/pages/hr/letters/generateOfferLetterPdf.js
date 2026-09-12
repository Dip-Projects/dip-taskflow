import html2pdf from 'html2pdf.js';
import { safeFileName } from './expCertContent';
import logoUrl from '../../../assets/dip-logo.jpg';
import { amountInWords } from '../payroll/generateSalarySlipPdf';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inr(n) {
  const v = Number(String(n || '').replace(/[^\d.]/g, ''));
  if (!v) return String(n || '__________');
  return v.toLocaleString('en-IN');
}

function rupeeLine(n, withWords = false) {
  const v = Number(String(n || '').replace(/[^\d.]/g, ''));
  if (!v) return '₹__________/-';
  const base = `₹${inr(v)}/-`;
  if (!withWords) return base;
  return `${base} (${amountInWords(v).replace(/ Rupees Only$/i, ' Only')})`;
}

function formatOfferDate(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function titleCaseName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function honorific(f) {
  const g = String(f.gender || f.title || '').toLowerCase();
  if (g === 'female' || g === 'ms' || g === 'miss') return 'MS.';
  if (g === 'mrs' || g === 'mrs.') return 'MRS.';
  return `${String(f.title || 'MR').toUpperCase().replace(/\.$/, '')}.`;
}

export const OFFER_TEMPLATES = [
  {
    id: 'site',
    label: 'Site / Office / General (SITE HEAD format)',
    fields: [
      'candidateName', 'title', 'designation', 'joiningDate', 'workTimings',
      'probationSalary', 'revisedSalary', 'incrementAfterMonths', 'incrementAmount',
    ],
  },
  {
    id: 'sales',
    label: 'Sales Executive format',
    fields: [
      'candidateName', 'title', 'designation', 'joiningDate', 'workTimings',
      'probationSalary', 'revisedPercent', 'projectIncentivePercent',
      'incrementAfterMonths', 'incrementAmount',
    ],
  },
];

export const FIELD_LABELS = {
  candidateName: 'Candidate full name',
  title: 'Title (MR / MS / MRS)',
  designation: 'Designation / Position',
  joiningDate: 'Joining date',
  workTimings: 'Working hours',
  probationSalary: 'Probation salary (₹)',
  revisedSalary: 'Salary from 4th month (₹)',
  revisedPercent: 'After probation hike %',
  projectIncentivePercent: 'Project incentive %',
  incrementAfterMonths: 'Next increment after (months)',
  incrementAmount: 'Increment amount (₹ or %)',
};

function letterheadHtml(logo) {
  return `
    <div style="text-align:center;margin-bottom:6pt;">
      <img src="${logo}" alt="" style="height:38pt;width:auto;display:inline-block;margin-bottom:3pt;" />
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:13.5pt;font-weight:700;letter-spacing:0.7px;color:#3D1F00;text-transform:uppercase;">
        DIP GROUP OF COMPANIES
      </div>
      <div style="font-size:8pt;margin-top:2pt;line-height:1.35;color:#222;">
        407-A, Trinity Business Park, L. P. Savani Road, Adajan, Surat - 395009, Gujarat, INDIA.<br/>
        Ph: - Er. Chirag Shah 91 9825344040<br/>
        Email: - dipprojects2008@gmail.com, office.dipprojects@gmail.com
      </div>
    </div>
    <div style="border-top:1.2pt solid #3D1F00;margin:4pt 0 8pt;"></div>
    <div style="text-align:center;font-size:12.5pt;font-weight:700;text-decoration:underline;letter-spacing:0.7px;margin-bottom:8pt;">
      Offer Letter
    </div>`;
}

function incrementSentenceHtml(f) {
  // Only when user ticks "Further salary increment" and fills fields
  if (!f.includeFurtherIncrement) return '';
  const monthsNum = Number(String(f.incrementAfterMonths || '').replace(/[^\d.]/g, ''));
  const amtRaw = String(f.incrementAmount || '').trim();
  if (!monthsNum && !amtRaw) return '';
  const after = monthsNum || String(f.incrementAfterMonths || '').trim() || '______';
  const looksPercent = /%/.test(amtRaw);
  const hikeNum = Number(String(amtRaw).replace(/[^\d.]/g, ''));
  const hikeShow = looksPercent
    ? esc(amtRaw.includes('%') ? amtRaw : `${amtRaw}%`)
    : (amtRaw.includes('₹') ? esc(amtRaw) : `₹${esc(inr(hikeNum || amtRaw))}/-`);

  // Starting salary for cumulative schedule (post-probation if available)
  let base = Number(String(f.revisedSalary || '').replace(/[^\d.]/g, ''));
  if (!base || f.includeProbationSalaryRevision === false) {
    base = Number(String(f.probationSalary || '').replace(/[^\d.]/g, '')) || base;
  }

  // Flat ₹ amount → write 1st / 2nd / 3rd cycle examples (cumulative)
  if (!looksPercent && monthsNum && hikeNum) {
    const steps = [];
    for (let i = 1; i <= 3; i += 1) {
      const at = monthsNum * i;
      if (base) {
        const nextSal = base + hikeNum * i;
        steps.push(
          `after first <b>${at} month(s)</b> salary shall become <b>₹${esc(inr(nextSal))}/-</b>`
        );
      } else {
        steps.push(
          `after <b>${at} month(s)</b> add another <b>₹${esc(inr(hikeNum))}/-</b>`
        );
      }
    }
    // Prefer clearer wording matching offer sample
    if (base) {
      return (
        ` Further, salary increment of <b>${hikeShow}</b> shall be added after every <b>${esc(String(after))} month(s)</b>` +
        ` subject to satisfactory performance and management approval` +
        ` (after ${esc(String(monthsNum))} months salary shall be <b>₹${esc(inr(base + hikeNum))}/-</b>;` +
        ` after ${esc(String(monthsNum * 2))} months salary shall be <b>₹${esc(inr(base + hikeNum * 2))}/-</b>;` +
        ` after ${esc(String(monthsNum * 3))} months salary shall be <b>₹${esc(inr(base + hikeNum * 3))}/-</b>; and so on).`
      );
    }
    return (
      ` Further, salary increment of <b>${hikeShow}</b> shall be added after every <b>${esc(String(after))} month(s)</b>` +
      ` subject to satisfactory performance and management approval` +
      ` (${steps.join('; ')}; and so on).`
    );
  }

  return ` Further, salary increment shall be reviewed after every <b>${esc(String(after))} month(s)</b>, and the increment shall be <b>${hikeShow}</b> subject to satisfactory performance and management approval.`;
}

/** Returns HTML paragraph strings (already escaped where needed). */
function buildSiteParagraphs(f) {
  const name = titleCaseName(f.candidateName || 'Candidate');
  const desig = esc((f.designation || 'SITE HEAD').toUpperCase());
  const join = esc(f.joiningDate || '__________');
  const timings = esc(f.workTimings || '9.00 a.m. to 6.30 p.m.');
  const prob = esc(rupeeLine(f.probationSalary || 120000));
  const revised = esc(rupeeLine(f.revisedSalary || 125000));
  const paras = [];

  paras.push(
    `We are pleased to extend to you a formal offer of employment with Dip Group Of Companies, for the position of <b>${desig}</b> at Dip Group Of Companies PMC, beginning from <b>${join}</b>, reporting time at Site would be <b>${timings}</b>.`
  );

  let duty =
    'As an employee of Dip Group Of Companies, there are several duties and responsibilities laid upon you, which we wholeheartedly trust you will perform with full honesty, loyalty, and to the best of your knowledge.';

  if (f.includeProbationSalaryRevision !== false) {
    duty +=
      ` We would also like to inform you that during the initial probation period of <b>three (3) months</b>, you will be eligible to receive a consolidated salary <b>${prob}</b> per month. Upon successful completion of the probation period and mutual agreement to continue the employment relationship, the salary shall be revised to <b>${revised}</b> per month from the <b>fourth month</b> onwards.`;
  } else if (String(f.probationSalary || '').trim()) {
    duty +=
      ` We would also like to inform you that you will be eligible to receive a consolidated salary <b>${prob}</b> per month.`;
  }
  duty += incrementSentenceHtml(f);
  if (f.includeFoodStayByClient) {
    duty += ' Your <b>Food and Stay</b> expenses for the month will be bear additionally by the client.';
  }
  paras.push(duty);
  paras.push('<b>The Salary includes:</b>');
  paras.push(
    'The offered salary is consolidated and inclusive of bonus. You will be having your mobile instrument (smart phone) with limited internet connection.'
  );
  paras.push(
    'The first three (3) months of employment shall be treated as the probation period. You will have to submit the <b>Mediclaim policy or Ayushman card</b>.'
  );
  paras.push(
    'The Company shall arrange an <b>Accidental Insurance Policy</b> for you within one month of joining, the cost of which shall be borne by the Company.'
  );
  paras.push(
    '<b>Please note that acceptance of this offer letter will commence your professional relationship with the company.</b> You will have to follow <b>HR policy</b> as and when commenced.'
  );
  paras.push(
    `<b>${esc(honorific(f))} ${esc(name.toUpperCase())}</b>, we are very excited about the prospect of you joining our team and look forward to your response.`
  );
  return paras;
}

function buildSalesParagraphs(f) {
  const name = titleCaseName(f.candidateName || 'Candidate');
  const desig = esc(f.designation || 'Sales Executive');
  const join = esc(f.joiningDate || '__________');
  const timings = esc(f.workTimings || '9:30 a.m. to 6:30 p.m.');
  const probSal = esc(rupeeLine(f.probationSalary || 40000, true));
  const hike = esc(f.revisedPercent || '10');
  const incentive = esc(f.projectIncentivePercent || '5');
  const welcomeName =
    honorific(f) === 'MS.' || honorific(f) === 'MRS.'
      ? `Ms. ${name}`
      : `${honorific(f)} ${name}`;

  const paras = [
    `We are pleased to extend to you a formal offer of employment with Dip Projects, for the position of <b>${desig}</b> at Dip Projects PMC, commencing from <b>${join}</b>. Your regular reporting and working hours shall be from <b>${timings}</b>, subject to project and business requirements.`,
    'As an employee of Dip Projects, you will be entrusted with various duties and responsibilities related to <b>sales, client coordination, business development</b>, enquiry generation, follow-ups, and project-related communication. We trust that you will perform your responsibilities with honesty, loyalty, dedication, professionalism, and to the best of your knowledge and ability.',
    `The first <b>three (3) months</b> of employment shall be treated as the probation period. During the probation period, you will be eligible to receive a monthly consolidated salary of <b>${probSal}</b>.`,
  ];

  // Probation % hike — only if ticked (default on)
  if (f.includeProbationHike !== false) {
    let hikePara =
      `Upon successful completion of the three-month probation period and mutual agreement to continue the employment relationship, your salary shall be revised by <b>${hike}%</b> from the fourth month onwards, subject to satisfactory performance.`;
    hikePara += incrementSentenceHtml(f);
    paras.push(hikePara);
  } else if (f.includeFurtherIncrement) {
    const onlyInc = incrementSentenceHtml(f).trim();
    if (onlyInc) paras.push(onlyInc.replace(/^Further,\s*/i, 'Further, '));
  }

  // Project incentive — only if ticked (default on)
  if (f.includeProjectIncentive !== false) {
    paras.push(
      `In addition to the monthly salary, you will be eligible for a <b>${incentive}% project incentive</b> on the applicable project monthly fees one-time; no incentive will be paid thereafter for months. If the same client gives new project then incentive will be levied.`
    );
    paras.push(
      'There shall be no separate or additional bonus payable apart from the above-mentioned project incentive, unless specifically approved by the management in writing.'
    );
  }

  paras.push(
    'For the performance of official duties, you will be required to have access to your own <b>vehicle and mobile phone/smartphone</b> for official communication, client coordination, business development, and work-related activities.',
    "In case you are required to travel outside Surat for official or project-related work, the Company shall provide or arrange car/official transportation and driver, or shall reimbursed <b>TA/DA</b> actual cost subject to the Company's policy and submission of required supporting documents.",
    'You will be required to submit a valid <b>Mediclaim Policy or Ayushman Card</b> upon joining.',
    'The Company shall arrange an <b>Accidental Insurance Policy</b> for you within one month of joining. The cost of such accidental insurance shall be borne by the Company.',
    '<b>By accepting this offer letter, you agree to abide by the rules, regulations, HR policies, procedures, professional standards, and instructions of Dip Projects</b> as applicable from time to time.',
    '<b>Please note that acceptance of this offer letter will commence your professional relationship with the Company.</b> We expect you to perform your duties with integrity, professionalism, commitment, and responsibility.',
    `<b>${esc(welcomeName)}</b>, we are pleased to welcome you to Dip Projects PMC and look forward to your valuable contribution to the organization. We wish you a successful and rewarding professional journey with us.`
  );
  return paras;
}

export async function generateOfferLetterPdf(templateId, fields, opts = {}) {
  const isSales = templateId === 'sales';
  const paras = isSales ? buildSalesParagraphs(fields) : buildSiteParagraphs(fields);
  const dateStr = fields.offerDate || formatOfferDate(new Date());
  const logo = opts.logoSrc || logoUrl;
  const nameUpper = titleCaseName(fields.candidateName || 'Candidate').toUpperCase();
  const toLine = `${honorific(fields)} ${nameUpper}`;
  const dearName = nameUpper;
  const signFor = isSales ? 'For Dip Projects' : 'For Dip Group of Companies';

  // Slightly larger body; sales a bit tighter to stay on 1 page
  const bodyFs = isSales ? '10pt' : '10.5pt';
  const bodyLh = isSales ? '1.32' : '1.35';
  const bodyGap = isSales ? '5pt' : '5.5pt';
  const metaFs = '10.5pt';

  // Page border full A4; signatures sit just under body (small gap) — not pushed to page bottom
  const html = `
  <div class="offer-root" style="width:210mm;min-height:297mm;height:297mm;overflow:hidden;box-sizing:border-box;padding:8mm;background:#fff;font-family:'Times New Roman',Times,serif;color:#111;">
    <div style="border:1.25pt solid #222;min-height:100%;height:100%;box-sizing:border-box;padding:8mm 9mm 7mm;display:flex;flex-direction:column;">
      ${letterheadHtml(logo)}

      <div style="text-align:right;font-size:${metaFs};margin-bottom:8pt;">Date: ${esc(dateStr)}</div>
      <div style="font-size:${metaFs};margin-bottom:1pt;"><b>To:</b></div>
      <div style="font-size:${metaFs};font-weight:700;margin-bottom:6pt;">${esc(toLine)}</div>
      <div style="font-size:${metaFs};margin-bottom:1pt;">Dear,</div>
      <div style="font-size:${metaFs};font-weight:700;margin-bottom:8pt;">${esc(dearName)}</div>

      <div>
      ${paras
        .map(
          (p) =>
            `<p style="margin:0 0 ${bodyGap};font-size:${bodyFs};line-height:${bodyLh};text-align:justify;">${p}</p>`
        )
        .join('')}
      </div>

      <div class="offer-sign" style="page-break-inside:avoid;break-inside:avoid;margin-top:8pt;margin-bottom:8pt;flex-shrink:0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:55%;vertical-align:top;padding:0 14pt 0 0;">
              <div style="font-size:11pt;font-weight:700;margin-bottom:22pt;">${esc(signFor)}</div>
              <div style="border-top:1pt solid #333;width:180pt;margin-bottom:4pt;"></div>
              <div style="font-size:9.5pt;color:#333;">Authorised Signatory</div>
            </td>
            <td style="width:45%;vertical-align:top;padding:56pt 0 0 0;text-align:left;">
              <div style="border-top:1pt solid #333;width:100%;max-width:200pt;margin-bottom:4pt;"></div>
              <b style="font-size:11pt;">Accepted (${esc(nameUpper)})</b>
            </td>
          </tr>
        </table>
      </div>

      <div style="flex:1 1 auto;min-height:8pt;"></div>
    </div>
  </div>`;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;width:210mm;';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const filename = `Offer_Letter_${safeFileName(fields.candidateName || 'Candidate')}.pdf`;
  try {
    await html2pdf()
      .set({
        margin: 0,
        filename,
        pagebreak: { mode: ['avoid-all'], avoid: ['.offer-sign', '.offer-root'] },
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, windowWidth: 794, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrap.querySelector('.offer-root'))
      .save();
    return { success: true, filename };
  } finally {
    wrap.remove();
  }
}
