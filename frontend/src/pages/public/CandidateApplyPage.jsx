import { useState } from 'react';
import './publicForms.css';

const EDU_ROWS = ['10th', '12th / Diploma', 'Graduation', 'Post Graduation', 'Other'];
const SOURCES = [
  'Job Portal',
  'LinkedIn',
  'Company Website',
  'Employee Reference',
  'Social Media',
  'Walk-in',
  'Newspaper',
  'Other',
];

const emptyEdu = () =>
  EDU_ROWS.map((qualification) => ({
    qualification,
    degree: '',
    board: '',
    year: '',
    percentage: '',
  }));

export default function CandidateApplyPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]);
  const [education, setEducation] = useState(emptyEdu);
  const [files, setFiles] = useState({});
  const [form, setForm] = useState({
    form_date: new Date().toISOString().slice(0, 10),
    full_name: '',
    father_name: '',
    position_applied: '',
    dob: '',
    gender: '',
    marital_status: '',
    native_place: '',
    mobile: '',
    alternate_number: '',
    current_address: '',
    permanent_address: '',
    email: '',
    aadhaar: '',
    pan: '',
    source_other: '',
    current_organization: '',
    current_designation: '',
    total_experience: '',
    current_ctc: '',
    expected_ctc: '',
    notice_period: '',
    reason_for_change: '',
    declaration: false,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSource = (s) => {
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const name = form.full_name.trim();
    const mobile = form.mobile.replace(/\D/g, '');
    const aadhaar = form.aadhaar.replace(/\D/g, '');
    if (!name) return setError('Full name is required');
    if (mobile.length < 10) return setError('Valid mobile number is required');
    if (aadhaar.length < 12) return setError('Valid Aadhaar (12 digits) is required');
    if (!files.cv?.length) return setError('Updated CV is required');
    if (!form.declaration) return setError('Please confirm the declaration');

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'declaration') fd.append(k, v ? 'true' : 'false');
      else fd.append(k, v == null ? '' : String(v));
    });
    fd.append('sources', JSON.stringify(sources));
    fd.append('education', JSON.stringify(education));
    Object.entries(files).forEach(([k, fileList]) => {
      if (!fileList?.length) return;
      if (k === 'education_certs') {
        [...fileList].forEach((f) => fd.append('education_certs', f));
      } else {
        fd.append(k, fileList[0]);
      }
    });

    setBusy(true);
    try {
      const res = await fetch('/api/hr/public/apply', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="pf-page">
        <div className="pf-card pf-ok">
          <h2>Application submitted</h2>
          <p>Thank you. DIP Projects HR has received your details. You may close this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-page">
      <form className="pf-card" onSubmit={submit}>
        <p className="pf-brand">DIP PROJECTS</p>
        <h1 className="pf-title">Candidate Application Form</h1>
        <p className="pf-sub">
          Fill this form for interview / walk-in. Required: <b>Name</b>, <b>Mobile</b>, <b>Aadhaar</b> and{' '}
          <b>Updated CV</b>.
        </p>

        {error ? <div className="pf-error">{error}</div> : null}

        <div className="pf-section">Personal details</div>
        <div className="pf-grid">
          <label className="pf-field">
            Date
            <input type="date" value={form.form_date} onChange={(e) => set('form_date', e.target.value)} />
          </label>
          <label className="pf-field">
            Position applied for
            <input value={form.position_applied} onChange={(e) => set('position_applied', e.target.value)} />
          </label>
          <label className="pf-field full">
            Full name <span className="pf-req">*</span>
            <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
          </label>
          <label className="pf-field">
            Father&apos;s name
            <input value={form.father_name} onChange={(e) => set('father_name', e.target.value)} />
          </label>
          <label className="pf-field">
            Date of birth
            <input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
          </label>
          <label className="pf-field">
            Gender
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">—</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </label>
          <label className="pf-field">
            Marital status
            <select value={form.marital_status} onChange={(e) => set('marital_status', e.target.value)}>
              <option value="">—</option>
              <option>Single</option>
              <option>Married</option>
            </select>
          </label>
          <label className="pf-field">
            Native place
            <input value={form.native_place} onChange={(e) => set('native_place', e.target.value)} />
          </label>
          <label className="pf-field">
            Mobile number <span className="pf-req">*</span>
            <input
              inputMode="numeric"
              value={form.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              placeholder="10-digit mobile"
            />
          </label>
          <label className="pf-field">
            Alternate number
            <input value={form.alternate_number} onChange={(e) => set('alternate_number', e.target.value)} />
          </label>
          <label className="pf-field full">
            Current address
            <textarea value={form.current_address} onChange={(e) => set('current_address', e.target.value)} />
          </label>
          <label className="pf-field full">
            Permanent address
            <textarea value={form.permanent_address} onChange={(e) => set('permanent_address', e.target.value)} />
          </label>
          <label className="pf-field">
            Email
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label className="pf-field">
            Aadhaar ID <span className="pf-req">*</span>
            <input
              inputMode="numeric"
              value={form.aadhaar}
              onChange={(e) => set('aadhaar', e.target.value)}
              placeholder="12 digits"
            />
          </label>
          <label className="pf-field">
            PAN No.
            <input value={form.pan} onChange={(e) => set('pan', e.target.value)} />
          </label>
        </div>

        <div className="pf-section">How did you hear about this opening?</div>
        <div className="pf-check-grid">
          {SOURCES.map((s) => (
            <label key={s}>
              <input type="checkbox" checked={sources.includes(s)} onChange={() => toggleSource(s)} />
              {s}
            </label>
          ))}
        </div>
        {sources.includes('Other') ? (
          <label className="pf-field" style={{ marginTop: 8 }}>
            Other (specify)
            <input value={form.source_other} onChange={(e) => set('source_other', e.target.value)} />
          </label>
        ) : null}

        <div className="pf-section">Educational qualifications</div>
        <div className="pf-edu">
          <table>
            <thead>
              <tr>
                <th>Qualification</th>
                <th>Degree</th>
                <th>Board / University</th>
                <th>Year</th>
                <th>% / CGPA</th>
              </tr>
            </thead>
            <tbody>
              {education.map((row, i) => (
                <tr key={row.qualification}>
                  <td>{row.qualification}</td>
                  {['degree', 'board', 'year', 'percentage'].map((k) => (
                    <td key={k}>
                      <input
                        value={row[k]}
                        onChange={(e) => {
                          const next = [...education];
                          next[i] = { ...next[i], [k]: e.target.value };
                          setEducation(next);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pf-section">Work experience</div>
        <div className="pf-grid">
          <label className="pf-field">
            Current organization
            <input value={form.current_organization} onChange={(e) => set('current_organization', e.target.value)} />
          </label>
          <label className="pf-field">
            Current designation
            <input value={form.current_designation} onChange={(e) => set('current_designation', e.target.value)} />
          </label>
          <label className="pf-field">
            Total experience
            <input value={form.total_experience} onChange={(e) => set('total_experience', e.target.value)} />
          </label>
          <label className="pf-field">
            Current CTC / monthly
            <input value={form.current_ctc} onChange={(e) => set('current_ctc', e.target.value)} />
          </label>
          <label className="pf-field">
            Expected CTC / salary
            <input value={form.expected_ctc} onChange={(e) => set('expected_ctc', e.target.value)} />
          </label>
          <label className="pf-field">
            Notice period
            <input value={form.notice_period} onChange={(e) => set('notice_period', e.target.value)} />
          </label>
          <label className="pf-field full">
            Reason for change
            <textarea value={form.reason_for_change} onChange={(e) => set('reason_for_change', e.target.value)} />
          </label>
        </div>

        <div className="pf-section">Documents</div>
        <div className="pf-grid">
          <label className="pf-field full">
            Updated CV <span className="pf-req">*</span>
            <span className="pf-hint">PDF or image</span>
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              required
              onChange={(e) => setFiles((f) => ({ ...f, cv: e.target.files }))}
            />
          </label>
        </div>

        <label className="pf-field full" style={{ marginTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <input
            type="checkbox"
            checked={form.declaration}
            onChange={(e) => set('declaration', e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontWeight: 500, lineHeight: 1.4 }}>
            I hereby declare that the information provided above is true and correct to the best of my knowledge.
          </span>
        </label>

        <div className="pf-actions">
          <button type="submit" className="pf-btn" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
      </form>
    </div>
  );
}
