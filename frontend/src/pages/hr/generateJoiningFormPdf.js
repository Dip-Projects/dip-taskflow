import html2pdf from 'html2pdf.js';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label, value) {
  if (value == null || value === '') return '';
  return `<tr>
    <td style="padding:5pt 6pt;border:0.6pt solid #ccc;width:38%;font-weight:700;background:#f7f1ea;vertical-align:top;">${esc(label)}</td>
    <td style="padding:5pt 6pt;border:0.6pt solid #ccc;vertical-align:top;">${esc(value)}</td>
  </tr>`;
}

function docLine(label, file) {
  if (!file?.url) return '';
  return `<div style="margin:2pt 0;font-size:9pt;">• ${esc(label)}: <a href="${esc(file.url)}">${esc(file.name || 'file')}</a></div>`;
}

export async function generateJoiningFormPdf(form) {
  const docs = form.documents || {};
  const html = `
  <div style="font-family:Calibri,Arial,sans-serif;color:#22160c;width:190mm;padding:10mm;">
    <div style="font-family:Georgia,serif;font-size:16pt;color:#3D1F00;margin-bottom:2pt;">DIP PROJECTS</div>
    <div style="font-size:13pt;font-weight:700;margin-bottom:8pt;">Employee Joining Form (HR copy)</div>
    <div style="font-size:8.5pt;color:#666;margin-bottom:10pt;">Submitted: ${esc(form.submitted_at || '')}</div>
    <table style="width:100%;border-collapse:collapse;font-size:10pt;">
      ${row('Employee name', form.employee_name)}
      ${row('Full address', form.full_address)}
      ${row('Contact number', form.contact_number)}
      ${row('Email ID', form.email)}
      ${row('Aadhaar ID', form.aadhaar)}
      ${row('PAN No.', form.pan)}
      ${row('Birth date', form.birth_date)}
      ${row('Education & institute', form.education_institute)}
      ${row('Total experience', form.total_experience)}
      ${row('Experience in DIP Projects', form.experience_in_dip)}
      ${row('Marital status', form.marital_status)}
      ${row('Health conditions / issues', form.health_conditions)}
      ${row('Emergency address', form.emergency_address)}
      ${row('Emergency contact', form.emergency_contact)}
      ${row('Relationship', form.emergency_relationship)}
      ${row('Designation', form.designation)}
      ${row('Department', form.department)}
    </table>
    <div style="margin-top:12pt;font-weight:700;font-size:10pt;">Attached documents</div>
    ${docLine('CV', docs.cv)}
    ${docLine('Aadhaar', docs.aadhaar_file)}
    ${docLine('PAN', docs.pan_file)}
    ${docLine('Photo', docs.photo)}
    ${docLine('Bank details', docs.bank_details)}
    ${docLine('Salary slip', docs.salary_slip)}
    ${(docs.education_certs || []).map((f, i) => docLine(`Education cert ${i + 1}`, f)).join('')}
  </div>`;

  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-10000px';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const name = String(form.employee_name || 'Employee').replace(/[^\w\s-]/g, '').trim() || 'Employee';
  try {
    await html2pdf()
      .set({
        margin: 8,
        filename: `Joining_Form_${name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrap.firstElementChild)
      .save();
  } finally {
    wrap.remove();
  }
}
