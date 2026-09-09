import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './publicForms.css';

export default function EmployeeOnboardPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [already, setAlready] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState({});
  const [departments, setDepartments] = useState([
    'Engg. Division',
    'MDO OFFICE',
    'PMC',
    'Sales',
    'Accounts',
    'HR',
    'Admin',
    'General',
  ]);
  const [form, setForm] = useState({
    employee_name: '',
    department: '',
    full_address: '',
    contact_number: '',
    email: '',
    aadhaar: '',
    pan: '',
    birth_date: '',
    education_institute: '',
    total_experience: '',
    experience_in_dip: '',
    marital_status: '',
    health_conditions: '',
    emergency_address: '',
    emergency_contact: '',
    emergency_relationship: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hr/public/onboard/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Invalid link');
        if (cancelled) return;
        if (data.already_submitted) {
          setAlready(true);
        } else {
          if (Array.isArray(data.departments) && data.departments.length) {
            setDepartments(data.departments);
          }
          setForm((f) => ({
            ...f,
            employee_name: data.full_name || '',
            contact_number: data.phone || '',
            email: data.email || '',
            department: data.department || f.department || '',
          }));
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const name = form.employee_name.trim();
    const phone = form.contact_number.replace(/\D/g, '');
    const aadhaar = form.aadhaar.replace(/\D/g, '');
    if (!name) return setError('Employee name is required');
    if (phone.length < 10) return setError('Valid contact number is required');
    if (aadhaar.length < 12) return setError('Valid Aadhaar (12 digits) is required');

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
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
      const res = await fetch(`/api/hr/public/onboard/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not submit');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="pf-page">
        <div className="pf-card">Loading form…</div>
      </div>
    );
  }

  if (already || done) {
    return (
      <div className="pf-page">
        <div className="pf-card pf-ok">
          <h2>{already ? 'Already submitted' : 'Submitted successfully'}</h2>
          <p>
            Thank you. Your details are with DIP Projects HR. You do not need to download or keep any PDF —
            HR will handle records internally.
          </p>
        </div>
      </div>
    );
  }

  if (error && !form.employee_name) {
    return (
      <div className="pf-page">
        <div className="pf-card">
          <div className="pf-error">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-page">
      <form className="pf-card" onSubmit={submit}>
        <p className="pf-brand">DIP PROJECTS</p>
        <h1 className="pf-title">Employee joining details</h1>
        <p className="pf-sub">
          Appointed employee form. Only <b>Name</b>, <b>Mobile</b> and <b>Aadhaar</b> are mandatory. Upload PDF
          or images for documents. No PDF is sent to you — HR keeps records.
        </p>

        {error ? <div className="pf-error">{error}</div> : null}

        <div className="pf-section">Employee information</div>
        <div className="pf-grid">
          <label className="pf-field full">
            Employee name <span className="pf-req">*</span>
            <input value={form.employee_name} onChange={(e) => set('employee_name', e.target.value)} />
          </label>
          <label className="pf-field">
            Department
            <select value={form.department} onChange={(e) => set('department', e.target.value)}>
              <option value="">Select department…</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="pf-field full">
            Full address
            <textarea value={form.full_address} onChange={(e) => set('full_address', e.target.value)} />
          </label>
          <label className="pf-field">
            Contact number <span className="pf-req">*</span>
            <input
              inputMode="numeric"
              value={form.contact_number}
              onChange={(e) => set('contact_number', e.target.value)}
            />
          </label>
          <label className="pf-field">
            Email ID
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label className="pf-field">
            Aadhaar ID <span className="pf-req">*</span>
            <input inputMode="numeric" value={form.aadhaar} onChange={(e) => set('aadhaar', e.target.value)} />
          </label>
          <label className="pf-field">
            PAN No.
            <input value={form.pan} onChange={(e) => set('pan', e.target.value)} />
          </label>
          <label className="pf-field">
            Birth date
            <input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
          </label>
          <label className="pf-field">
            Marital status
            <select value={form.marital_status} onChange={(e) => set('marital_status', e.target.value)}>
              <option value="">—</option>
              <option>Single</option>
              <option>Married</option>
            </select>
          </label>
          <label className="pf-field full">
            Education and institute
            <input
              value={form.education_institute}
              onChange={(e) => set('education_institute', e.target.value)}
            />
          </label>
          <label className="pf-field">
            Total experience
            <input value={form.total_experience} onChange={(e) => set('total_experience', e.target.value)} />
          </label>
          <label className="pf-field">
            Experience in DIP Projects
            <input value={form.experience_in_dip} onChange={(e) => set('experience_in_dip', e.target.value)} />
          </label>
          <label className="pf-field full">
            Any health conditions / issues
            <textarea value={form.health_conditions} onChange={(e) => set('health_conditions', e.target.value)} />
          </label>
        </div>

        <div className="pf-section">Emergency contact</div>
        <div className="pf-grid">
          <label className="pf-field full">
            Address
            <textarea value={form.emergency_address} onChange={(e) => set('emergency_address', e.target.value)} />
          </label>
          <label className="pf-field">
            Contact number
            <input value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
          </label>
          <label className="pf-field">
            Relationship
            <input
              value={form.emergency_relationship}
              onChange={(e) => set('emergency_relationship', e.target.value)}
            />
          </label>
        </div>

        <div className="pf-section">Attachments (PDF / image)</div>
        <div className="pf-grid">
          {[
            ['cv', 'Updated CV'],
            ['aadhaar_file', 'Aadhaar card'],
            ['pan_file', 'PAN card'],
            ['photo', 'Photo'],
            ['bank_details', 'Bank details'],
            ['salary_slip', 'Salary slip'],
          ].map(([key, label]) => (
            <label key={key} className="pf-field">
              {label}
              <input
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={(e) => setFiles((f) => ({ ...f, [key]: e.target.files }))}
              />
            </label>
          ))}
          <label className="pf-field full">
            Education / other certificates
            <input
              type="file"
              multiple
              accept="image/*,.pdf,application/pdf"
              onChange={(e) => setFiles((f) => ({ ...f, education_certs: e.target.files }))}
            />
          </label>
        </div>

        <div className="pf-actions">
          <button type="submit" className="pf-btn" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit to HR'}
          </button>
        </div>
      </form>
    </div>
  );
}
