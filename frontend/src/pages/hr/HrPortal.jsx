import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../lib/api';
import { uploadViaApi } from '../../lib/ensureBucket';
import { generateExpCertificatePdf } from './letters/generateExpCertPdf';
import {
  OFFER_TEMPLATES,
  generateOfferLetterPdf,
} from './letters/generateOfferLetterPdf';
import { generateSalarySlipPdf, amountInWords } from './payroll/generateSalarySlipPdf';
import { generateJoiningFormPdf } from './generateJoiningFormPdf';
import './HrPortal.css';

function safePathSeg(s) {
  return (
    String(s || 'unknown')
      .trim()
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'unknown'
  );
}

function publicOrigin() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

async function makeQrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, { width: 280, margin: 1 });
  } catch {
    return '';
  }
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'leaves', label: 'Leaves' },
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'letters', label: 'Letters' },
  { key: 'documents', label: 'Documents' },
];

const RECRUIT_STATUSES = [
  'Request Received',
  'Post Create',
  'Post Live',
  'Shortlist',
  'Interview Lined Up',
  'Interview Done',
  'Offer Extended',
  'Approved',
  'Hired',
  'Rejected',
];

const DOC_TYPES = [
  'Aadhaar',
  'PAN',
  'CV',
  'Photo',
  'Salary slip',
  'Insurance',
  'PF / ESI',
  'Bank details',
  'Offer letter copy',
  'Experience letter',
  'Education certificate',
  'Other',
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'present' || s === 'hired' || s === 'active') return 'ok';
  if (s === 'pending' || s === 'interview' || s === 'half') return 'warn';
  if (s === 'rejected' || s === 'absent' || s === 'rejected') return 'bad';
  return '';
}

function Dashboard({ employees, leaves, attendanceToday, candidates, alerts, onSendWa }) {
  const pendingLeaves = leaves.filter((l) => String(l.status).toLowerCase() === 'pending').length;
  const active = employees.filter((e) => e.is_active !== false).length;
  const present = attendanceToday.filter((r) => {
    const s = String(r.status || '').toLowerCase();
    return s === 'present' || s === 'half' || r.clock_in;
  }).length;
  const openHiring = (candidates || []).filter((c) => {
    const st = String(c.status || '').toLowerCase();
    if (st === 'hired' || st === 'rejected' || st === 'approved') return false;
    return true;
  }).length;
  const birthdays = alerts?.birthdays || [];
  const insuranceDue = alerts?.insuranceDue || [];

  return (
    <>
      <div className="hr-cards">
        <div className="hr-stat"><div className="n">{active}</div><div className="l">Active employees</div></div>
        <div className="hr-stat"><div className="n">{present}</div><div className="l">Present today</div></div>
        <div className="hr-stat"><div className="n">{pendingLeaves}</div><div className="l">Pending leaves</div></div>
        <div className="hr-stat"><div className="n">{openHiring}</div><div className="l">Open hiring</div></div>
      </div>

      <div className="hr-panel">
        <div className="hr-toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>Today&apos;s attendance</h3>
          <span className="hr-badge">{attendanceToday.length} records</span>
        </div>
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr><th>Employee</th><th>Status</th><th>Clock in</th></tr>
            </thead>
            <tbody>
              {!attendanceToday.length ? (
                <tr><td colSpan={3} className="hr-empty">No attendance marked today yet.</td></tr>
              ) : (
                attendanceToday.slice(0, 40).map((r) => (
                  <tr key={r.id || r.user_name}>
                    <td>{r.name || r.user_name}</td>
                    <td><span className={`hr-badge ${statusBadge(r.status)}`}>{r.status || '—'}</span></td>
                    <td>{r.clock_in ? String(r.clock_in).slice(11, 19) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-panel">
        <div className="hr-toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>Alerts</h3>
          <button type="button" className="hr-btn ghost" onClick={onSendWa}>Send WhatsApp reminders</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <h4 style={{ marginTop: 0 }}>Birthdays in 7 days</h4>
            {!birthdays.length ? (
              <div className="hr-empty">None upcoming.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {birthdays.map((b) => (
                  <li key={b.id || b.employee_id}>
                    <b>{b.employee_name}</b> — {b.days_until === 0 ? 'Today' : `${b.days_until}d`} ({b.dob})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 style={{ marginTop: 0 }}>Insurance due / overdue (≤4 days)</h4>
            {!insuranceDue.length ? (
              <div className="hr-empty">None due soon.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {insuranceDue.map((i) => (
                  <li key={i.id}>
                    <b>{i.employee_name}</b> — {i.policy_type} renew {i.renew_date}
                    {' '}({i.days_until < 0 ? `overdue ${Math.abs(i.days_until)}d` : `${i.days_until}d`})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const HR_DEPARTMENTS_FALLBACK = [
  'Engg. Division',
  'MDO OFFICE',
  'PMC',
  'Sales',
  'Accounts',
  'HR',
  'Admin',
  'General',
];

const HR_DESIGNATIONS_FALLBACK = [
  'Site Engineer',
  'Site Incharge',
  'Site Head',
  'SITE HEAD',
  'Team lead',
  'Coordinator',
  'Office Head',
  'JR.ESTIMATOR',
  'Jr. Estimator',
  'MIS',
  'EA',
  'Sales Executive',
  'Staff',
];

/** Normalize directory row (system user OR hr_only) for pickers */
function asEmpShape(s) {
  return {
    id: s.id,
    full_name: s.full_name,
    designation: s.designation,
    department: s.department,
    whatsapp_number: s.whatsapp_number,
    dob: s.dob,
    joining_date: s.joining_date,
    is_active: s.is_active !== false,
    username: s.username || '',
    role: s.role || (s.source === 'hr_only' ? 'hr_only' : 'employee'),
    site_name: s.site_name || null,
    site_names: s.site_names || [],
    source: s.source === 'hr_only' || s.source === 'hr_register' ? 'hr_only' : 'system',
  };
}

function EmployeesView({ staff, loading, error, q, setQ, onReload, departments, designations }) {
  const depts = departments?.length ? departments : HR_DEPARTMENTS_FALLBACK;
  const desigs = designations?.length ? designations : HR_DESIGNATIONS_FALLBACK;
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [qrModal, setQrModal] = useState(null); // { title, url, qr }
  const [form, setForm] = useState({
    full_name: '',
    designation: 'Site Engineer',
    department: 'Engg. Division',
    whatsapp_number: '',
    dob: '',
    joining_date: '',
    email: '',
  });

  const filtered = staff.filter((u) => {
    const blob = `${u.department || ''} ${u.designation || ''} ${u.role || ''} ${u.username || ''}`.toLowerCase();
    if (/\bclient\b/.test(blob)) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      (u.full_name || '').toLowerCase().includes(s) ||
      (u.department || '').toLowerCase().includes(s) ||
      (u.designation || '').toLowerCase().includes(s) ||
      (u.username || '').toLowerCase().includes(s) ||
      (u.whatsapp_number || '').includes(s)
    );
  });

  const openOnboardQr = async (emp) => {
    setBusy(true);
    try {
      // Always mint/refresh token for THIS employee id (never reuse another emp's fuzzy token)
      const res = await api(`/hr/staff/${emp.id}/onboard-token`, {
        method: 'POST',
        body: JSON.stringify({ source: emp.source || 'system' }),
      });
      const token =
        res?.staff?.onboard_token ||
        String(res?.onboard_path || '').replace(/^\/?onboard\//, '');
      if (!token) throw new Error('QR token create nahi hua');
      const url = `${publicOrigin()}/onboard/${token}`;
      const qr = await makeQrDataUrl(url);
      setQrModal({ title: `Joining form — ${emp.full_name}`, url, qr });
      await onReload?.();
    } catch (e) {
      alert(e.message || 'Could not create QR');
    } finally {
      setBusy(false);
    }
  };

  const downloadJoiningPdf = async (emp) => {
    setBusy(true);
    try {
      const res = await api(`/hr/joining-forms/${emp.id}`);
      await generateJoiningFormPdf(res.form);
    } catch (e) {
      alert(e.message || 'No joining form yet');
    } finally {
      setBusy(false);
    }
  };

  const saveNew = async () => {
    if (!form.full_name.trim() || !form.designation.trim() || !form.department.trim()) {
      alert('Name, designation and department required');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/hr/staff', {
        method: 'POST',
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          designation: form.designation.trim(),
          department: form.department.trim(),
          whatsapp_number: form.whatsapp_number || '',
          dob: form.dob || null,
          joining_date: form.joining_date || null,
          email: form.email || '',
        }),
      });
      const token = res?.staff?.onboard_token || String(res?.onboard_path || '').replace('/onboard/', '');
      setForm({
        full_name: '',
        designation: 'Site Engineer',
        department: 'Engg. Division',
        whatsapp_number: '',
        dob: '',
        joining_date: '',
        email: '',
      });
      setShowAdd(false);
      await onReload?.();
      if (token) {
        const url = `${publicOrigin()}/onboard/${token}`;
        const qr = await makeQrDataUrl(url);
        setQrModal({
          title: `Joining form QR — ${res.staff?.full_name || 'Employee'}`,
          url,
          qr,
        });
      } else {
        alert('Saved in HR-only table. Joining QR create nahi hua — row pe QR dabao.');
      }
    } catch (e) {
      alert(e.message || 'Could not add HR employee');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id, name, source) => {
    if (source !== 'hr_only') {
      alert('System user (main table) yahan se delete nahi hota.');
      return;
    }
    if (!window.confirm(`Remove ${name} from HR-only register?`)) return;
    setBusy(true);
    try {
      await api(`/hr/staff/${id}`, { method: 'DELETE' });
      await onReload?.();
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hr-panel">
        <p className="hr-sub" style={{ marginTop: 0 }}>
          <b>System</b> + <b>HR-only</b> dono dikhte hain. Client dept/designation hide. Har employee pe{' '}
          <b>QR</b> → joining details form.
        </p>
        <div className="hr-toolbar">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees…" />
          <span style={{ color: 'var(--hr-muted)', fontSize: '0.85rem' }}>{filtered.length} people</span>
          <button type="button" className="hr-btn" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Close form' : '+ Add HR-only employee'}
          </button>
        </div>

        {showAdd && (
          <div className="hr-form" style={{ marginBottom: 16 }}>
            <p className="full" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--hr-muted)' }}>
              Yeh sirf HR register mein save hoga — TaskFlow / main users table touch nahi hogi. Add ke baad
              joining-form QR milega.
            </p>
            <label>Full name *
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </label>
            <label>Department *
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Designation *
              <select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}>
                {desigs.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>WhatsApp
              <input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="91xxxxxxxxxx" />
            </label>
            <label>Date of birth
              <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </label>
            <label>Joining date
              <input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
            </label>
            <label>Email
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <div className="actions">
              <button type="button" className="hr-btn" disabled={busy} onClick={saveNew}>
                {busy ? 'Saving…' : 'Save + show joining QR'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="hr-error">{error}</div>}
        {loading ? (
          <div className="hr-empty">Loading…</div>
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Department</th>
                  <th>DOB</th>
                  <th>Source</th>
                  <th>WhatsApp</th>
                  <th>Joining form</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!filtered.length ? (
                  <tr><td colSpan={9} className="hr-empty">No employees found.</td></tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={`${u.source}-${u.id}`}>
                      <td>
                        {u.full_name || '—'}
                        {u.username ? <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>{u.username}</div> : null}
                      </td>
                      <td>{u.designation || '—'}</td>
                      <td>{u.department || '—'}</td>
                      <td>
                        <input
                          type="date"
                          value={u.dob ? String(u.dob).slice(0, 10) : ''}
                          disabled={busy}
                          title="Birthday / DOB"
                          onChange={async (e) => {
                            const dob = e.target.value || null;
                            setBusy(true);
                            try {
                              if (u.source === 'hr_only') {
                                await api(`/hr/staff/${u.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ dob }),
                                });
                              } else {
                                await api('/hr/profiles', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    employee_id: u.id,
                                    employee_name: u.full_name,
                                    dob,
                                    whatsapp_number: u.whatsapp_number || '',
                                  }),
                                });
                              }
                              await onReload?.();
                            } catch (err) {
                              alert(err.message || 'DOB save failed');
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      </td>
                      <td>
                        <span className={`hr-badge ${u.source === 'hr_only' ? 'warn' : 'ok'}`}>
                          {u.source === 'hr_only' ? 'HR-only' : 'System'}
                        </span>
                      </td>
                      <td>{u.whatsapp_number || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <button type="button" className="hr-btn ghost" disabled={busy} onClick={() => openOnboardQr(u)}>
                            QR
                          </button>
                          {u.joining_form_submitted_at ? (
                            <button type="button" className="hr-btn ok" disabled={busy} onClick={() => downloadJoiningPdf(u)}>
                              PDF
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--hr-muted)' }}>pending</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`hr-badge ${u.is_active === false ? 'bad' : 'ok'}`}>
                          {u.is_active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {u.source === 'hr_only' ? (
                          <button type="button" className="hr-btn ghost" disabled={busy} onClick={() => remove(u.id, u.full_name, u.source)}>Del</button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {qrModal ? (
        <div className="hr-modal-backdrop" onClick={() => setQrModal(null)} role="presentation">
          <div className="hr-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3 style={{ marginTop: 0 }}>{qrModal.title}</h3>
            <p className="hr-sub">Candidate/employee is phone pe scan kare → form open hoga.</p>
            {qrModal.qr ? (
              <img src={qrModal.qr} alt="QR" style={{ width: 220, height: 220, display: 'block', margin: '0 auto' }} />
            ) : null}
            <p style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>
              <a href={qrModal.url} target="_blank" rel="noreferrer">{qrModal.url}</a>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                className="hr-btn"
                href={qrModal.url}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                Open form
              </a>
              <button
                type="button"
                className="hr-btn ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(qrModal.url);
                  alert('Link copied');
                }}
              >
                Copy link
              </button>
              <button type="button" className="hr-btn ghost" onClick={() => setQrModal(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AttendanceView() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to });
      const data = await api(`/hr/attendance?${params.toString()}`);
      setRows(Array.isArray(data.attendance) ? data.attendance : []);
    } catch (e) {
      setError(e.message || 'Could not load attendance from existing attendance table.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      (r.user_name || '').toLowerCase().includes(s) ||
      (r.name || '').toLowerCase().includes(s) ||
      (r.status || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="hr-panel">
      <div className="hr-toolbar">
        <label>
          From{' '}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To{' '}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / site…" />
        <button type="button" className="hr-btn ghost" onClick={load}>Refresh</button>
      </div>
      {error && <div className="hr-error">{error}</div>}
      {loading ? (
        <div className="hr-empty">Loading attendance…</div>
      ) : (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Username</th>
                <th>Status</th>
                <th>Clock in</th>
                <th>Clock out</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr><td colSpan={6} className="hr-empty">No attendance in this range.</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id || `${r.date}-${r.user_name}`}>
                    <td>{r.date}</td>
                    <td>{r.name || r.user_name || '—'}</td>
                    <td>{r.user_name || '—'}</td>
                    <td><span className={`hr-badge ${statusBadge(r.status)}`}>{r.status || '—'}</span></td>
                    <td>{r.clock_in ? String(r.clock_in).slice(11, 19) : '—'}</td>
                    <td>{r.clock_out ? String(r.clock_out).slice(11, 19) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeavesView({ leaves, loading, error, onReload }) {
  const [busy, setBusy] = useState(false);

  const decide = async (id, decision) => {
    setBusy(true);
    try {
      await api(`/leaves/${id}/${decision}`, { method: 'PATCH', body: JSON.stringify({}) });
      await onReload();
    } catch (e) {
      alert(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hr-panel">
      <div className="hr-toolbar">
        <button type="button" className="hr-btn ghost" onClick={onReload} disabled={busy}>Refresh</button>
      </div>
      {error && <div className="hr-error">{error}</div>}
      {loading ? (
        <div className="hr-empty">Loading leaves…</div>
      ) : (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>From</th>
                <th>To</th>
                <th>Half</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!leaves.length ? (
                <tr><td colSpan={7} className="hr-empty">No leave requests.</td></tr>
              ) : (
                leaves.map((l) => (
                  <tr key={l.id}>
                    <td>{l.user?.full_name || l.full_name || '—'}</td>
                    <td>{l.from_date}</td>
                    <td>{l.to_date}</td>
                    <td>{l.is_half_day ? 'Yes' : '—'}</td>
                    <td>{l.reason || '—'}</td>
                    <td><span className={`hr-badge ${statusBadge(l.status)}`}>{l.status}</span></td>
                    <td>
                      {String(l.status).toLowerCase() === 'pending' ? (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="hr-btn ok" disabled={busy} onClick={() => decide(l.id, 'approve')}>Approve</button>
                          <button type="button" className="hr-btn warn" disabled={busy} onClick={() => decide(l.id, 'reject')}>Reject</button>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatStatusAt(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function StatusHistoryModal({ row, onClose }) {
  const title = row?.candidate_name || row?.designation || 'Recruitment';
  const hist = Array.isArray(row?.status_history) ? row.status_history : [];
  return (
    <div className="hr-modal-backdrop" onClick={onClose} role="presentation">
      <div className="hr-modal" onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 520, maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Status history — {title}</h3>
        <p className="hr-sub" style={{ marginTop: 0 }}>
          Kab konsa status change hua, kaun ne change kiya.
        </p>
        {!hist.length ? (
          <div className="hr-empty">No status history yet. Next change se yahan dikhega.</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hist.map((h, i) => (
              <li key={`${h.at}-${i}`} style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>
                <div style={{ fontWeight: 700 }}>
                  {h.from ? (
                    <>
                      {h.from} → <span style={{ color: '#6b2d0f' }}>{h.to}</span>
                    </>
                  ) : (
                    <span style={{ color: '#6b2d0f' }}>{h.to}</span>
                  )}
                </div>
                <div style={{ opacity: 0.75 }}>
                  {formatStatusAt(h.at)}
                  {h.by_name ? ` · ${h.by_name}` : ''}
                </div>
                {h.note ? <div style={{ opacity: 0.7, fontStyle: 'italic' }}>{h.note}</div> : null}
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="hr-btn ghost" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function lastStatusChange(row) {
  const hist = Array.isArray(row?.status_history) ? row.status_history : [];
  if (!hist.length) return null;
  return hist[hist.length - 1];
}

function RecruitmentView({ apiCandidates, onReload, busySet }) {
  const [busy, setBusy] = useState(false);
  const [subTab, setSubTab] = useState('requirements'); // requirements | candidates
  const [applyQr, setApplyQr] = useState(null);
  const [detail, setDetail] = useState(null);
  const [historyRow, setHistoryRow] = useState(null);
  const statuses = RECRUIT_STATUSES;
  const applyUrl = `${publicOrigin()}/apply`;

  const isRequirement = (c) =>
    c?.kind === 'requirement' ||
    c?.source === 'office_requirement' ||
    (!!c?.designation && !!c?.experience_required && !c?.application && c?.source !== 'public_qr');

  const requirements = (apiCandidates || []).filter(isRequirement);
  const candidates = (apiCandidates || []).filter((c) => !isRequirement(c));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qr = await makeQrDataUrl(applyUrl);
      if (!cancelled) setApplyQr({ url: applyUrl, qr });
    })();
    return () => {
      cancelled = true;
    };
  }, [applyUrl]);

  const update = async (id, patch) => {
    setBusy(true);
    busySet?.(true);
    try {
      await api(`/hr/recruitments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await onReload();
    } catch (e) {
      alert(e.message || 'Update failed');
    } finally {
      setBusy(false);
      busySet?.(false);
    }
  };

  const appDocs = (c) => {
    const d = c?.application?.documents || {};
    const links = [];
    if (d.cv?.url) links.push({ label: 'CV', url: d.cv.url });
    if (d.aadhaar_file?.url) links.push({ label: 'Aadhaar', url: d.aadhaar_file.url });
    if (d.pan_file?.url) links.push({ label: 'PAN', url: d.pan_file.url });
    if (d.photo?.url) links.push({ label: 'Photo', url: d.photo.url });
    if (d.bank_details?.url) links.push({ label: 'Bank', url: d.bank_details.url });
    if (d.salary_slip?.url) links.push({ label: 'Salary slip', url: d.salary_slip.url });
    (d.education_certs || []).forEach((f, i) => {
      if (f?.url) links.push({ label: `Education ${i + 1}`, url: f.url });
    });
    if (!links.length && c?.cv_url) links.push({ label: 'CV', url: c.cv_url });
    return links;
  };

  return (
    <div className="hr-panel">
      <p className="hr-sub" style={{ marginTop: 0 }}>
        Office hiring requirements aur candidate applications alag tabs me.
        Apply form ke saare documents <strong>Documents</strong> section me
        Recruitment → Role → Candidate folder structure me save hote hain.
      </p>

      <div className="hr-tabs" role="tablist" aria-label="Recruitment sections">
        <button
          type="button"
          className={`hr-tab${subTab === 'requirements' ? ' on' : ''}`}
          onClick={() => setSubTab('requirements')}
        >
          Hiring requirements
          <span className="hr-badge" style={{ marginLeft: 8 }}>{requirements.length}</span>
        </button>
        <button
          type="button"
          className={`hr-tab${subTab === 'candidates' ? ' on' : ''}`}
          onClick={() => setSubTab('candidates')}
        >
          Candidates
          <span className="hr-badge" style={{ marginLeft: 8 }}>{candidates.length}</span>
        </button>
        <button type="button" className="hr-btn ghost" onClick={onReload} disabled={busy} style={{ marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>

      {subTab === 'requirements' && (
        <>
          <h3 style={{ margin: '4px 0 10px', fontSize: '1.05rem' }}>Hiring requirements (from Office)</h3>
          <p className="hr-sub">
            Designation / experience / openings Office se aate hain. Status update yahin se karo — History me timeline rahegi.
          </p>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Designation</th>
                  <th>Experience</th>
                  <th>Openings</th>
                  <th>Dept / Location</th>
                  <th>Urgency</th>
                  <th>From</th>
                  <th>Skills / notes</th>
                  <th>Status</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {!requirements.length ? (
                  <tr><td colSpan={9} className="hr-empty">No hiring requirements yet.</td></tr>
                ) : (
                  requirements.map((c) => {
                    const last = lastStatusChange(c);
                    return (
                      <tr key={c.id}>
                        <td>{c.designation || c.role_applied || '—'}</td>
                        <td>{c.experience_required || '—'}</td>
                        <td>{c.openings != null ? c.openings : '—'}</td>
                        <td>{[c.department, c.location].filter(Boolean).join(' · ') || '—'}</td>
                        <td>{c.urgency || 'Normal'}</td>
                        <td>{c.submitted_by_name || '—'}</td>
                        <td style={{ maxWidth: 220, fontSize: '0.78rem' }}>
                          {[c.skills, c.notes].filter(Boolean).join(' — ') || '—'}
                        </td>
                        <td>
                          <select
                            value={statuses.includes(c.status) ? c.status : (c.status || 'Request Received')}
                            disabled={busy}
                            onChange={(e) => update(c.id, { status: e.target.value })}
                          >
                            {!statuses.includes(c.status) && c.status ? (
                              <option value={c.status}>{c.status}</option>
                            ) : null}
                            {statuses.map((s) => <option key={s}>{s}</option>)}
                          </select>
                          {last ? (
                            <div style={{ fontSize: '0.68rem', opacity: 0.7, marginTop: 4, maxWidth: 140 }}>
                              {last.from ? `${last.from} → ` : ''}{last.to}
                              <br />
                              {formatStatusAt(last.at)}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <button type="button" className="hr-btn ghost" onClick={() => setHistoryRow(c)}>
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'candidates' && (
        <>
          <div
            className="hr-apply-qr"
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 18,
              padding: 14,
              border: '1px solid var(--hr-line, #e2d5c6)',
              borderRadius: 12,
              background: '#fffaf5',
            }}
          >
            {applyQr?.qr ? (
              <img src={applyQr.qr} alt="Apply QR" width={140} height={140} />
            ) : (
              <div style={{ width: 140, height: 140, background: '#f5f0eb', borderRadius: 8 }} />
            )}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '1rem' }}>Candidate application QR / link</div>
              <p className="hr-sub" style={{ margin: '0 0 8px' }}>
                Candidate form fill kare → CV / Aadhaar / PAN / Photo Documents me save ho jayenge.
              </p>
              <div style={{ fontSize: '0.82rem', wordBreak: 'break-all', marginBottom: 8 }}>{applyUrl}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="hr-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(applyUrl);
                    alert('Apply link copied');
                  }}
                >
                  Copy link
                </button>
                <a className="hr-btn ghost" href={applyUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  Open form
                </a>
              </div>
            </div>
          </div>

          <h3 style={{ margin: '4px 0 8px', fontSize: '1.05rem' }}>Candidates (apply / walk-in)</h3>
          <p className="hr-sub">
            Pipeline: Request → Post Create → Post Live → Shortlist → Interview Lined Up → Interview Done → Offer → Approved / Hired / Rejected.
          </p>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>From</th>
                  <th>Form / docs</th>
                  <th>Interview</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {!candidates.length ? (
                  <tr><td colSpan={9} className="hr-empty">No candidate applications yet.</td></tr>
                ) : (
                  candidates.map((c) => {
                    const last = lastStatusChange(c);
                    const docs = appDocs(c);
                    return (
                      <tr key={c.id}>
                        <td>
                          {c.candidate_name}
                          {c.aadhaar ? <div style={{ fontSize: '0.72rem', opacity: 0.65 }}>Aadhaar: {c.aadhaar}</div> : null}
                        </td>
                        <td>{c.role_applied || c.application?.position_applied || '—'}</td>
                        <td>{[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</td>
                        <td>{c.submitted_by_name || (c.source === 'public_qr' ? 'QR Apply' : '—')}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {c.application ? (
                              <button type="button" className="hr-btn ghost" onClick={() => setDetail(c)}>View form</button>
                            ) : null}
                            {docs.map((d) => (
                              <a key={`${d.label}-${d.url}`} href={d.url} target="_blank" rel="noreferrer">{d.label}</a>
                            ))}
                            {!c.application && !docs.length ? '—' : null}
                          </div>
                        </td>
                        <td>
                          <input
                            type="datetime-local"
                            value={c.interview_at ? String(c.interview_at).slice(0, 16) : ''}
                            disabled={busy}
                            onChange={(e) => update(c.id, {
                              interview_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                              status: e.target.value ? 'Interview Lined Up' : c.status,
                            })}
                          />
                        </td>
                        <td>
                          <select
                            value={statuses.includes(c.status) ? c.status : (c.status || 'Request Received')}
                            disabled={busy}
                            onChange={(e) => update(c.id, { status: e.target.value })}
                          >
                            {!statuses.includes(c.status) && c.status ? (
                              <option value={c.status}>{c.status}</option>
                            ) : null}
                            {statuses.map((s) => <option key={s}>{s}</option>)}
                          </select>
                          {last ? (
                            <div style={{ fontSize: '0.68rem', opacity: 0.7, marginTop: 4, maxWidth: 140 }}>
                              {last.from ? `${last.from} → ` : ''}{last.to}
                              <br />
                              {formatStatusAt(last.at)}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <input
                            defaultValue={c.interview_notes || c.notes || ''}
                            placeholder="Interview / process notes"
                            disabled={busy}
                            onBlur={(e) => {
                              if (e.target.value !== (c.interview_notes || c.notes || '')) {
                                update(c.id, { interview_notes: e.target.value });
                              }
                            }}
                          />
                        </td>
                        <td>
                          <button type="button" className="hr-btn ghost" onClick={() => setHistoryRow(c)}>
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail ? (
        <div className="hr-modal-backdrop" onClick={() => setDetail(null)} role="presentation">
          <div className="hr-modal" onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 560, maxHeight: '85vh', overflow: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{detail.candidate_name}</h3>
            {appDocs(detail).length ? (
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: '0.85rem' }}>Documents</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {appDocs(detail).map((d) => (
                    <li key={`${d.label}-${d.url}`}>
                      <a href={d.url} target="_blank" rel="noreferrer">{d.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', background: '#f7f1ea', padding: 10, borderRadius: 8 }}>
              {JSON.stringify(detail.application || detail, null, 2)}
            </pre>
            <button type="button" className="hr-btn ghost" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      ) : null}

      {historyRow ? (
        <StatusHistoryModal row={historyRow} onClose={() => setHistoryRow(null)} />
      ) : null}
    </div>
  );
}

function InsuranceView({ employees }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    employee_id: '',
    employee_name: '',
    policy_type: 'Accidental',
    policy_no: '',
    start_date: '',
    renew_date: '',
    status: 'Active',
    whatsapp_number: '',
    notes: '',
  });
  const [dobForm, setDobForm] = useState({ employee_id: '', employee_name: '', dob: '', whatsapp_number: '' });

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filter && filter !== 'all') params.set('filter', filter);
      if (q.trim()) params.set('q', q.trim());
      const data = await api(`/hr/insurances?${params.toString()}`);
      setRows(data.insurances || []);
    } catch (e) {
      setError(e.message || 'Failed to load insurance');
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [filter, q]);

  useEffect(() => {
    load();
  }, [load]);

  const pickEmp = (id, forDob = false) => {
    const e = employees.find((x) => x.id === id);
    if (!e) return;
    if (forDob) {
      setDobForm((p) => ({
        ...p,
        employee_id: e.id,
        employee_name: e.full_name || '',
        whatsapp_number: e.phone || e.whatsapp || p.whatsapp_number,
      }));
    } else {
      setForm((p) => ({
        ...p,
        employee_id: e.id,
        employee_name: e.full_name || '',
        whatsapp_number: e.phone || e.whatsapp || p.whatsapp_number,
      }));
    }
  };

  const save = async () => {
    if (!form.employee_name || !form.renew_date) {
      alert('Employee name and renew date required');
      return;
    }
    setBusy(true);
    try {
      await api('/hr/insurances', { method: 'POST', body: JSON.stringify(form) });
      setForm({
        employee_id: '',
        employee_name: '',
        policy_type: 'Accidental',
        policy_no: '',
        start_date: '',
        renew_date: '',
        status: 'Active',
        whatsapp_number: '',
        notes: '',
      });
      await load();
    } catch (e) {
      alert(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id, body) => {
    setBusy(true);
    try {
      await api(`/hr/insurances/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await load();
    } catch (e) {
      alert(e.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this insurance record?')) return;
    setBusy(true);
    try {
      await api(`/hr/insurances/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const saveDob = async () => {
    if (!dobForm.employee_name || !dobForm.dob) {
      alert('Employee and DOB required for birthday alerts');
      return;
    }
    setBusy(true);
    try {
      await api('/hr/profiles', { method: 'POST', body: JSON.stringify(dobForm) });
      alert('DOB / WhatsApp saved for birthday alerts');
      setDobForm({ employee_id: '', employee_name: '', dob: '', whatsapp_number: '' });
    } catch (e) {
      alert(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const dueBadge = (d) => {
    if (d == null) return '';
    if (d < 0) return 'bad';
    if (d <= 3) return 'warn';
    return 'ok';
  };

  return (
    <>
      <div className="hr-panel">
        <div className="hr-toolbar">
          <h3 style={{ margin: 0, flex: 1 }}>Insurance register</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} disabled={busy}>
            <option value="all">All</option>
            <option value="due">Due ≤4 days</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Upcoming ≤30 days</option>
          </select>
          <input
            placeholder="Search name / policy…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 200 }}
          />
          <button type="button" className="hr-btn ghost" onClick={load} disabled={busy}>Refresh</button>
        </div>
        {error && <div className="hr-empty" style={{ color: 'crimson' }}>{error}</div>}
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Renew date</th>
                <th>Days</th>
                <th>Aadhaar / PAN</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr><td colSpan={8} className="hr-empty">No insurance records. Add below.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div>{r.employee_name}</div>
                      {r.designation ? <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{r.designation}</div> : null}
                    </td>
                    <td>{r.policy_type}</td>
                    <td>{r.whatsapp_number || '—'}</td>
                    <td>
                      <input
                        type="date"
                        value={r.renew_date ? String(r.renew_date).slice(0, 10) : ''}
                        disabled={busy}
                        onChange={(e) => patch(r.id, { renew_date: e.target.value })}
                      />
                    </td>
                    <td>
                      <span className={`hr-badge ${dueBadge(r.days_until)}`}>
                        {r.days_until == null ? '—' : r.days_until < 0 ? `-${Math.abs(r.days_until)}d` : `${r.days_until}d`}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {r.aadhaar || '—'}
                      <br />
                      {r.pan || '—'}
                    </td>
                    <td>
                      <select
                        value={r.status || 'Active'}
                        disabled={busy}
                        onChange={(e) => patch(r.id, { status: e.target.value })}
                      >
                        <option>Active</option>
                        <option>Pending arrange</option>
                        <option>HOLD</option>
                        <option>PENDING</option>
                        <option>Renewed</option>
                        <option>Expired</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" className="hr-btn ghost" disabled={busy} onClick={() => remove(r.id)}>Del</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-panel">
        <h3 style={{ marginTop: 0 }}>Add / update insurance</h3>
        <p className="hr-sub">WhatsApp reminder ~8 AM IST, 3–4 days before renew (full Aadhaar/PAN/nominee pack to HR).</p>
        <div className="hr-form">
          <label className="full">Employee
            <select
              value={form.employee_id}
              onChange={(e) => {
                setForm((p) => ({ ...p, employee_id: e.target.value }));
                pickEmp(e.target.value, false);
              }}
            >
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </label>
          <label>Name
            <input value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} />
          </label>
          <label>Policy type
            <select value={form.policy_type} onChange={(e) => setForm({ ...form, policy_type: e.target.value })}>
              <option>Accidental</option>
              <option>Mediclaim</option>
              <option>Life</option>
              <option>Other</option>
            </select>
          </label>
          <label>Policy no
            <input value={form.policy_no} onChange={(e) => setForm({ ...form, policy_no: e.target.value })} />
          </label>
          <label>Start date
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </label>
          <label>Renew / arrange by
            <input type="date" value={form.renew_date} onChange={(e) => setForm({ ...form, renew_date: e.target.value })} />
          </label>
          <label>WhatsApp
            <input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="91xxxxxxxxxx" />
          </label>
          <label className="full">Notes
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="actions">
            <button type="button" className="hr-btn" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save insurance'}
            </button>
          </div>
        </div>
      </div>

      <div className="hr-panel">
        <h3 style={{ marginTop: 0 }}>Birthday profile (alerts)</h3>
        <p className="hr-sub">Save DOB so dashboard shows birthdays in 7 days and WhatsApp reminders can fire.</p>
        <div className="hr-form">
          <label className="full">Employee
            <select
              value={dobForm.employee_id}
              onChange={(e) => {
                setDobForm((p) => ({ ...p, employee_id: e.target.value }));
                pickEmp(e.target.value, true);
              }}
            >
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </label>
          <label>Name
            <input value={dobForm.employee_name} onChange={(e) => setDobForm({ ...dobForm, employee_name: e.target.value })} />
          </label>
          <label>Date of birth
            <input type="date" value={dobForm.dob} onChange={(e) => setDobForm({ ...dobForm, dob: e.target.value })} />
          </label>
          <label>WhatsApp
            <input value={dobForm.whatsapp_number} onChange={(e) => setDobForm({ ...dobForm, whatsapp_number: e.target.value })} />
          </label>
          <div className="actions">
            <button type="button" className="hr-btn" disabled={busy} onClick={saveDob}>Save DOB</button>
          </div>
        </div>
      </div>
    </>
  );
}

function DocumentsView({ employees, user }) {
  const [tree, setTree] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    doc_type: 'Insurance',
    title: '',
  });
  const [file, setFile] = useState(null);
  const [openDept, setOpenDept] = useState('');
  const [openDesig, setOpenDesig] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api('/hr/documents/tree');
      setTree(data.tree || {});
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load documents');
      setTree({});
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const emp = employees.find((e) => String(e.id) === String(form.employee_id));

  const upload = async (e) => {
    e.preventDefault();
    if (!emp || !file) {
      alert('Select employee and file');
      return;
    }
    setBusy(true);
    try {
      const department = emp.department || 'General';
      const designation = emp.designation || 'Staff';
      const employee_name = emp.full_name || 'Employee';
      const file_path = `hr/employees/${safePathSeg(department)}/${safePathSeg(designation)}/${safePathSeg(employee_name)}/${Date.now()}_${safePathSeg(file.name)}`;
      // Signed URL / storage proxy — avoids Vercel ~4.5 MB body limit on /api/hr/documents
      const file_url = await uploadViaApi({
        path: file_path,
        blob: file,
        contentType: file.type || 'application/octet-stream',
        bucket: 'documents',
      });
      await api('/hr/documents', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: emp.id,
          employee_name,
          department,
          designation,
          doc_type: form.doc_type,
          title: form.title || file.name,
          file_path,
          file_url,
          file_name: file.name,
        }),
      });
      setFile(null);
      setForm({ employee_id: '', doc_type: 'Insurance', title: '' });
      await load();
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api(`/hr/documents/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  };

  const depts = Object.keys(tree).sort();

  return (
    <>
      <div className="hr-panel">
        <h3 style={{ marginTop: 0 }}>Upload / register document</h3>
        <p className="hr-sub">
          Stored as folders: Department → Designation → files.
          QR joining form aur Recruitment apply form ke documents bhi yahin aate hain
          (Recruitment → Role → Candidate).
        </p>
        <form className="hr-form" onSubmit={upload}>
          <label>Employee
            <select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </label>
          <label>Type
            <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
              {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>File<input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label>
          <div className="actions">
            <button type="submit" className="hr-btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload to folder'}</button>
            <button type="button" className="hr-btn ghost" onClick={load}>Refresh folders</button>
          </div>
        </form>
        {error && <div className="hr-error">{error}</div>}
      </div>
      <div className="hr-panel">
        <h3 style={{ marginTop: 0 }}>Document folders</h3>
        {!depts.length ? (
          <div className="hr-empty">No documents yet.</div>
        ) : (
          depts.map((dept) => (
            <div key={dept} style={{ marginBottom: 10 }}>
              <button type="button" className="hr-tab on" style={{ marginBottom: 6 }} onClick={() => setOpenDept(openDept === dept ? '' : dept)}>
                📁 {dept}
              </button>
              {openDept === dept && Object.keys(tree[dept] || {}).sort().map((desig) => (
                <div key={desig} style={{ marginLeft: 16, marginBottom: 8 }}>
                  <button type="button" className="hr-tab" onClick={() => setOpenDesig(openDesig === `${dept}/${desig}` ? '' : `${dept}/${desig}`)}>
                    📂 {desig} ({(tree[dept][desig] || []).length})
                  </button>
                  {openDesig === `${dept}/${desig}` && (
                    <div className="hr-table-wrap" style={{ marginTop: 8 }}>
                      <table className="hr-table">
                        <thead>
                          <tr><th>Employee</th><th>Type</th><th>Title</th><th>File</th><th></th></tr>
                        </thead>
                        <tbody>
                          {(tree[dept][desig] || []).map((d) => (
                            <tr key={d.id}>
                              <td>{d.employee_name}</td>
                              <td><span className="hr-badge">{d.doc_type || d.category || 'Other'}</span></td>
                              <td>{d.title || d.file_name || '—'}</td>
                              <td>{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer">{d.file_name || 'Open'}</a> : '—'}</td>
                              <td><button type="button" className="hr-btn ghost" onClick={() => remove(d.id)}>Delete</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
        {user ? null : null}
      </div>
    </>
  );
}

function PayrollView({ employees }) {
  const [empId, setEmpId] = useState('');
  const [month, setMonth] = useState(monthISO());
  const [payDate, setPayDate] = useState(todayISO());
  const [paidDays, setPaidDays] = useState('26');
  const [lopDays, setLopDays] = useState('0');
  const [earnings, setEarnings] = useState([
    { label: 'Basic', amt: 20000 },
    { label: 'HRA', amt: 8000 },
    { label: 'Special Allowance', amt: 5000 },
  ]);
  const [deductions, setDeductions] = useState([
    { label: 'PF', amt: 1800 },
    { label: 'Professional Tax', amt: 200 },
  ]);
  const [busy, setBusy] = useState(false);

  const emp = employees.find((e) => e.id === empId);

  const gross = earnings.reduce((s, r) => s + (Number(r.amt) || 0), 0);
  const totalDeductions = deductions.reduce((s, r) => s + (Number(r.amt) || 0), 0);
  const netPayable = gross - totalDeductions;

  const updateRow = (list, setList, idx, key, val) => {
    const next = list.map((r, i) => (i === idx ? { ...r, [key]: key === 'amt' ? Number(val) || 0 : val } : r));
    setList(next);
  };

  const download = async () => {
    if (!emp) {
      alert('Select an employee');
      return;
    }
    setBusy(true);
    try {
      await generateSalarySlipPdf({
        companyName: 'Dip Projects',
        companyAddr: '407/A, Trinity Business Park, L.P Savani Road, Adajan',
        companyCity: 'Surat-395009',
        companyCountry: 'India',
        empName: emp.full_name,
        empId: emp.username,
        designation: emp.designation || '',
        department: emp.department || '',
        month,
        payDate,
        paidDays,
        lopDays,
        earnings,
        deductions,
        gross,
        totalDeductions,
        netPayable,
        amountWords: amountInWords(netPayable),
      });
    } catch (e) {
      alert(e.message || 'PDF failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hr-panel">
      <div className="hr-form">
        <label>Employee
          <select value={empId} onChange={(e) => setEmpId(e.target.value)}>
            <option value="">Select…</option>
            {employees.filter((e) => e.is_active !== false).map((e) => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </label>
        <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label>Pay date<input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
        <label>Paid days<input value={paidDays} onChange={(e) => setPaidDays(e.target.value)} /></label>
        <label>LOP days<input value={lopDays} onChange={(e) => setLopDays(e.target.value)} /></label>
      </div>

      <h4>Earnings</h4>
      {earnings.map((r, i) => (
        <div className="hr-toolbar" key={`e-${i}`}>
          <input value={r.label} onChange={(e) => updateRow(earnings, setEarnings, i, 'label', e.target.value)} />
          <input type="number" value={r.amt} onChange={(e) => updateRow(earnings, setEarnings, i, 'amt', e.target.value)} />
          <button type="button" className="hr-btn ghost" onClick={() => setEarnings(earnings.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="hr-btn ghost" onClick={() => setEarnings([...earnings, { label: 'Allowance', amt: 0 }])}>+ Earning</button>

      <h4>Deductions</h4>
      {deductions.map((r, i) => (
        <div className="hr-toolbar" key={`d-${i}`}>
          <input value={r.label} onChange={(e) => updateRow(deductions, setDeductions, i, 'label', e.target.value)} />
          <input type="number" value={r.amt} onChange={(e) => updateRow(deductions, setDeductions, i, 'amt', e.target.value)} />
          <button type="button" className="hr-btn ghost" onClick={() => setDeductions(deductions.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="hr-btn ghost" onClick={() => setDeductions([...deductions, { label: 'Deduction', amt: 0 }])}>+ Deduction</button>

      <p style={{ marginTop: 16 }}>
        Gross: <b>₹{gross.toLocaleString('en-IN')}</b> · Deductions:{' '}
        <b>₹{totalDeductions.toLocaleString('en-IN')}</b> · Net:{' '}
        <b>₹{netPayable.toLocaleString('en-IN')}</b>
      </p>
      <button type="button" className="hr-btn" disabled={busy} onClick={download}>
        {busy ? 'Generating…' : 'Download salary slip PDF'}
      </button>
    </div>
  );
}

function LettersView({ employees, onEmployeesReload, departments, designations }) {
  const depts = departments?.length ? departments : HR_DEPARTMENTS_FALLBACK;
  const desigs = designations?.length ? designations : HR_DESIGNATIONS_FALLBACK;
  const [letterTab, setLetterTab] = useState('exp');
  const [busy, setBusy] = useState(false);
  const [nameMode, setNameMode] = useState('new'); // new | existing
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [saveAsEmployee, setSaveAsEmployee] = useState(true);
  const [newEmpMeta, setNewEmpMeta] = useState({
    department: 'Engg. Division',
    whatsapp_number: '',
    dob: '',
  });

  const [exp, setExp] = useState({
    name: '',
    gender: 'Male',
    designation: 'Site Engineer',
    fromDate: '',
    toDate: '',
  });

  const [templateId, setTemplateId] = useState('site');
  const template = OFFER_TEMPLATES.find((t) => t.id === templateId) || OFFER_TEMPLATES[0];
  const [offerFields, setOfferFields] = useState({
    title: 'MR',
    candidateName: '',
    designation: 'SITE HEAD',
    workTimings: '9.00 a.m. to 6.30 p.m.',
    probationSalary: '120000',
    revisedSalary: '125000',
    includeProbationSalaryRevision: true,
    includeFoodStayByClient: false,
    includeFurtherIncrement: false,
    includeProbationHike: true,
    includeProjectIncentive: true,
    incrementAfterMonths: '',
    incrementAmount: '',
  });

  useEffect(() => {
    setOfferFields((prev) => {
      const next = { ...prev };
      template.fields.forEach((f) => {
        if (next[f] === undefined) next[f] = '';
      });
      if (templateId === 'sales') {
        if (!next.designation || next.designation === 'SITE HEAD') next.designation = 'Sales Executive';
        if (!next.workTimings || next.workTimings.startsWith('9.00')) next.workTimings = '9:30 a.m. to 6:30 p.m.';
        if (!next.probationSalary || next.probationSalary === '120000') next.probationSalary = '40000';
        if (!next.revisedPercent) next.revisedPercent = '10';
        if (!next.projectIncentivePercent) next.projectIncentivePercent = '5';
        if (!next.title || next.title === 'MR') next.title = 'MS';
      } else {
        if (!next.designation || next.designation === 'Sales Executive') next.designation = 'SITE HEAD';
        if (!next.workTimings || next.workTimings.includes('9:30')) next.workTimings = '9.00 a.m. to 6.30 p.m.';
        if (!next.probationSalary || next.probationSalary === '40000') next.probationSalary = '120000';
        if (!next.revisedSalary) next.revisedSalary = '125000';
        if (next.includeProbationSalaryRevision === undefined) next.includeProbationSalaryRevision = true;
      }
      return next;
    });
  }, [templateId, template.fields]);

  const fillFromEmp = (id) => {
    setSelectedEmpId(id);
    const e = employees.find((x) => x.id === id);
    if (!e) return;
    setNameMode('existing');
    setExp((p) => ({
      ...p,
      name: e.full_name || '',
      designation: e.designation || p.designation,
    }));
    setOfferFields((p) => ({
      ...p,
      candidateName: e.full_name || '',
      designation: e.designation || p.designation,
    }));
  };

  const switchToNewName = () => {
    setNameMode('new');
    setSelectedEmpId('');
    setOfferFields((p) => ({ ...p, candidateName: '' }));
  };

  const genExp = async () => {
    if (!exp.name?.trim() || !exp.designation?.trim() || !exp.fromDate?.trim() || !exp.toDate?.trim()) {
      alert('Fill name, designation, from and to dates');
      return;
    }
    setBusy(true);
    try {
      await generateExpCertificatePdf({
        name: exp.name.trim(),
        designation: exp.designation.trim(),
        fromDate: exp.fromDate.trim(),
        toDate: exp.toDate.trim(),
        gender: exp.gender || 'Male',
        companyName: exp.companyName,
      });
    } catch (e) {
      console.error('exp cert pdf', e);
      alert(e?.message || 'Experience letter download failed');
    } finally {
      setBusy(false);
    }
  };

  const genOffer = async () => {
    if (!offerFields.candidateName || !offerFields.designation) {
      alert('Candidate name and designation are required');
      return;
    }
    setBusy(true);
    try {
      if (nameMode === 'new' && saveAsEmployee) {
        await api('/hr/staff', {
          method: 'POST',
          body: JSON.stringify({
            full_name: offerFields.candidateName.trim(),
            department: newEmpMeta.department || 'Engg. Division',
            designation: offerFields.designation || 'Staff',
            whatsapp_number: newEmpMeta.whatsapp_number || '',
            dob: newEmpMeta.dob || null,
            joining_date: offerFields.joiningDate || null,
          }),
        });
        await onEmployeesReload?.();
        alert('Saved to HR register (not TaskFlow login). Letters dropdown mein available.');
      }
      await generateOfferLetterPdf(templateId, offerFields);
    } catch (e) {
      alert(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hr-tabs">
        <button type="button" className={letterTab === 'exp' ? 'hr-tab on' : 'hr-tab'} onClick={() => setLetterTab('exp')}>Experience letter</button>
        <button type="button" className={letterTab === 'offer' ? 'hr-tab on' : 'hr-tab'} onClick={() => setLetterTab('offer')}>Offer letter</button>
      </div>

      <div className="hr-panel">
        {letterTab === 'exp' ? (
          <>
            <label style={{ display: 'block', marginBottom: 12, fontSize: '0.85rem', fontWeight: 600, color: 'var(--hr-muted)' }}>
              Prefill from employee
              <select style={{ display: 'block', marginTop: 6, width: '100%', maxWidth: 360 }} onChange={(e) => fillFromEmp(e.target.value)} defaultValue="">
                <option value="">Select employee (optional)…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </label>
            <div className="hr-form">
              <label>Name<input value={exp.name} onChange={(e) => setExp({ ...exp, name: e.target.value })} /></label>
              <label>Gender
                <select value={exp.gender} onChange={(e) => setExp({ ...exp, gender: e.target.value })}>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </label>
              <label>Designation<input value={exp.designation} onChange={(e) => setExp({ ...exp, designation: e.target.value })} /></label>
              <label>From date
                <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(exp.fromDate) ? exp.fromDate : ''} onChange={(e) => setExp({ ...exp, fromDate: e.target.value })} />
              </label>
              <label>To date
                <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(exp.toDate) ? exp.toDate : ''} onChange={(e) => setExp({ ...exp, toDate: e.target.value })} />
              </label>
              <div className="actions">
                <button type="button" className="hr-btn" disabled={busy} onClick={genExp}>
                  {busy ? 'Generating…' : 'Download experience certificate PDF'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="hr-form">
            <div className="full" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--hr-muted)' }}>Employee name</span>
              <button
                type="button"
                className={nameMode === 'new' ? 'hr-btn' : 'hr-btn ghost'}
                onClick={switchToNewName}
              >
                + New employee name
              </button>
              <button
                type="button"
                className={nameMode === 'existing' ? 'hr-btn' : 'hr-btn ghost'}
                onClick={() => setNameMode('existing')}
              >
                Existing employee
              </button>
            </div>

            {nameMode === 'existing' ? (
              <label className="full">Select employee
                <select
                  value={selectedEmpId}
                  onChange={(e) => fillFromEmp(e.target.value)}
                >
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="full">New employee / candidate full name
                <input
                  value={offerFields.candidateName || ''}
                  onChange={(e) => setOfferFields({ ...offerFields, candidateName: e.target.value })}
                  placeholder="Type new name here (e.g. Aayushi Shah)"
                  autoFocus
                />
              </label>
            )}

            {nameMode === 'existing' && (
              <label className="full">Name on letter (editable)
                <input
                  value={offerFields.candidateName || ''}
                  onChange={(e) => setOfferFields({ ...offerFields, candidateName: e.target.value })}
                />
              </label>
            )}

            {nameMode === 'new' && (
              <>
                <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={saveAsEmployee}
                    onChange={(e) => setSaveAsEmployee(e.target.checked)}
                  />
                  Save to HR-only table (main users mein nahi — Letters dropdown mein aayega)
                </label>
                {saveAsEmployee && (
                  <>
                    <label>Department *
                      <select
                        value={newEmpMeta.department}
                        onChange={(e) => setNewEmpMeta({ ...newEmpMeta, department: e.target.value })}
                      >
                        {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                    <label>WhatsApp
                      <input
                        value={newEmpMeta.whatsapp_number}
                        onChange={(e) => setNewEmpMeta({ ...newEmpMeta, whatsapp_number: e.target.value })}
                        placeholder="91xxxxxxxxxx"
                      />
                    </label>
                    <label>Date of birth
                      <input
                        type="date"
                        value={newEmpMeta.dob}
                        onChange={(e) => setNewEmpMeta({ ...newEmpMeta, dob: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </>
            )}

            <label className="full">Format (Word samples)
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {OFFER_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <p className="full" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--hr-muted)' }}>
              {templateId === 'sales'
                ? 'Ishwari / Sales Executive letter — sales duties, % hike, project incentive, travel.'
                : 'Satish / SITE HEAD letter — same format; only designation & salary fields change.'}
            </p>

            <label>Title
              <select value={offerFields.title || 'MR'} onChange={(e) => setOfferFields({ ...offerFields, title: e.target.value })}>
                <option value="MR">MR</option>
                <option value="MS">MS</option>
                <option value="MRS">MRS</option>
              </select>
            </label>
            <label>Designation
              <select
                value={desigs.includes(offerFields.designation) ? offerFields.designation : (offerFields.designation || 'Site Engineer')}
                onChange={(e) => setOfferFields({ ...offerFields, designation: e.target.value })}
              >
                {!desigs.includes(offerFields.designation) && offerFields.designation ? (
                  <option value={offerFields.designation}>{offerFields.designation}</option>
                ) : null}
                {desigs.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Joining date
              <input value={offerFields.joiningDate || ''} onChange={(e) => setOfferFields({ ...offerFields, joiningDate: e.target.value })} placeholder="e.g. 1 OCT 2026" />
            </label>
            <label>Working hours
              <input value={offerFields.workTimings || ''} onChange={(e) => setOfferFields({ ...offerFields, workTimings: e.target.value })} />
            </label>
            <label>Probation salary (₹)
              <input value={offerFields.probationSalary || ''} onChange={(e) => setOfferFields({ ...offerFields, probationSalary: e.target.value })} />
            </label>

            {templateId === 'sales' ? (
              <>
                <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={offerFields.includeProbationHike !== false}
                    onChange={(e) => setOfferFields({ ...offerFields, includeProbationHike: e.target.checked })}
                  />
                  Add after-probation hike % sentence
                </label>
                {offerFields.includeProbationHike !== false && (
                  <label>Hike after probation (%)
                    <input value={offerFields.revisedPercent || ''} onChange={(e) => setOfferFields({ ...offerFields, revisedPercent: e.target.value })} />
                  </label>
                )}
                <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={offerFields.includeProjectIncentive !== false}
                    onChange={(e) => setOfferFields({ ...offerFields, includeProjectIncentive: e.target.checked })}
                  />
                  Add project incentive sentence (sales format)
                </label>
                {offerFields.includeProjectIncentive !== false && (
                  <label>Project incentive (%)
                    <input value={offerFields.projectIncentivePercent || ''} onChange={(e) => setOfferFields({ ...offerFields, projectIncentivePercent: e.target.value })} />
                  </label>
                )}
              </>
            ) : (
              <>
                <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={offerFields.includeProbationSalaryRevision !== false}
                    onChange={(e) => setOfferFields({ ...offerFields, includeProbationSalaryRevision: e.target.checked })}
                  />
                  Add probation salary revision (3 months → 4th month amount)
                </label>
                {offerFields.includeProbationSalaryRevision !== false && (
                  <label>Revised salary from 4th month (₹)
                    <input value={offerFields.revisedSalary || ''} onChange={(e) => setOfferFields({ ...offerFields, revisedSalary: e.target.value })} placeholder="125000" />
                  </label>
                )}
                <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!offerFields.includeFoodStayByClient}
                    onChange={(e) => setOfferFields({ ...offerFields, includeFoodStayByClient: e.target.checked })}
                  />
                  Food and Stay expenses borne by the client
                </label>
              </>
            )}

            <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!offerFields.includeFurtherIncrement}
                onChange={(e) => setOfferFields({ ...offerFields, includeFurtherIncrement: e.target.checked })}
              />
              Add further salary increment line (after X months → amount)
            </label>
            {offerFields.includeFurtherIncrement && (
              <>
                <label>Increment after (months)
                  <input
                    value={offerFields.incrementAfterMonths || ''}
                    onChange={(e) => setOfferFields({ ...offerFields, incrementAfterMonths: e.target.value })}
                    placeholder="e.g. 12"
                  />
                </label>
                <label>Increment amount (₹ or %)
                  <input
                    value={offerFields.incrementAmount || ''}
                    onChange={(e) => setOfferFields({ ...offerFields, incrementAmount: e.target.value })}
                    placeholder="e.g. 5000 or 10%"
                  />
                </label>
              </>
            )}

            <div className="actions">
              <button type="button" className="hr-btn" disabled={busy} onClick={genOffer}>
                {busy ? 'Generating…' : 'Download offer letter PDF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function HrPortal({ user, onLogout, onOpenOffice }) {
  const [tab, setTab] = useState('dashboard');
  const isAdminUser = String(user?.role || '').toLowerCase() === 'admin';
  const isHrUser = (() => {
    const role = String(user?.role || '').toLowerCase().trim();
    if (role === 'hr' || role === 'admin') return true;
    const blob = [user?.role, user?.designation, user?.department]
      .map((s) => String(s || '').toLowerCase())
      .join(' ');
    return /\bhr\b|human\s*resource/.test(blob);
  })();
  const canManageRecruitment = isAdminUser || isHrUser;
  const navItems = useMemo(
    () => NAV.filter((n) => n.key !== 'recruitment' || canManageRecruitment),
    [canManageRecruitment]
  );
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState('');
  const [empQ, setEmpQ] = useState('');
  const [departments, setDepartments] = useState(HR_DEPARTMENTS_FALLBACK);
  const [designations, setDesignations] = useState(HR_DESIGNATIONS_FALLBACK);
  const [leaves, setLeaves] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [attendanceToday, setAttendanceToday] = useState([]);
  const [recruitments, setRecruitments] = useState([]);
  const [alerts, setAlerts] = useState({ birthdays: [], insuranceDue: [] });

  useEffect(() => {
    if (tab === 'recruitment' && !canManageRecruitment) setTab('dashboard');
  }, [tab, canManageRecruitment]);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    setEmpError('');
    try {
      const data = await api('/hr/staff');
      const list = (data.staff || []).map(asEmpShape);
      setEmployees(list);
      if (data.departments?.length) setDepartments(data.departments);
      if (data.designations?.length) setDesignations(data.designations);
    } catch (e) {
      setEmpError(e.message || 'Failed to load HR employees');
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  }, []);

  const loadLeaves = useCallback(async () => {
    setLeaveLoading(true);
    setLeaveError('');
    try {
      const data = await api('/leaves/all');
      setLeaves(Array.isArray(data) ? data : data.leaves || []);
    } catch (e) {
      setLeaveError(e.message || 'Failed to load leaves');
      setLeaves([]);
    } finally {
      setLeaveLoading(false);
    }
  }, []);

  const loadRecruitments = useCallback(async () => {
    if (!canManageRecruitment) {
      setRecruitments([]);
      return;
    }
    try {
      const data = await api('/hr/recruitments');
      setRecruitments(data.recruitments || []);
    } catch {
      setRecruitments([]);
    }
  }, [canManageRecruitment]);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await api('/hr/alerts');
      setAlerts({
        birthdays: data.birthdays || [],
        insuranceDue: data.insuranceDue || [],
      });
    } catch {
      setAlerts({ birthdays: [], insuranceDue: [] });
    }
  }, []);

  const sendWaReminders = useCallback(async () => {
    try {
      const data = await api('/hr/alerts/send-whatsapp', { method: 'POST', body: '{}' });
      const n = (data.sent || []).length;
      alert(n ? `WhatsApp sent: ${n} reminder(s)` : 'No new reminders to send (missing numbers, or already sent today).');
      await loadAlerts();
    } catch (e) {
      alert(e.message || 'WhatsApp send failed');
    }
  }, [loadAlerts]);

  useEffect(() => {
    loadEmployees();
    loadLeaves();
    loadRecruitments();
    loadAlerts();
    (async () => {
      try {
        const data = await api(`/hr/attendance?date=${encodeURIComponent(todayISO())}`);
        setAttendanceToday(Array.isArray(data.attendance) ? data.attendance : []);
      } catch {
        setAttendanceToday([]);
      }
    })();
  }, [loadEmployees, loadLeaves, loadRecruitments, loadAlerts]);

  const title = useMemo(
    () => navItems.find((n) => n.key === tab)?.label || NAV.find((n) => n.key === tab)?.label || 'HR',
    [tab, navItems]
  );

  return (
    <div className="hr-shell">
      <aside className="hr-side">
        <div className="hr-brand">DIP HRMS</div>
        <p className="hr-brand-sub">HR · {user?.full_name || 'User'}</p>
        {navItems.map((n) => (
          <button
            key={n.key}
            type="button"
            className={tab === n.key ? 'hr-nav-btn active' : 'hr-nav-btn'}
            onClick={() => setTab(n.key)}
          >
            {n.label}
          </button>
        ))}
        <div className="hr-side-foot">
          {onOpenOffice && (
            <button type="button" onClick={onOpenOffice}>Office TaskFlow</button>
          )}
          <button type="button" onClick={onLogout}>Log out</button>
        </div>
      </aside>
      <main className="hr-main">
        <h1>{title}</h1>
        <p className="hr-sub">Human Resource Management — Dip Projects</p>

        {tab === 'dashboard' && (
          <Dashboard
            employees={employees}
            leaves={leaves}
            attendanceToday={attendanceToday}
            candidates={canManageRecruitment ? recruitments : []}
            alerts={alerts}
            onSendWa={sendWaReminders}
          />
        )}
        {tab === 'employees' && (
          <EmployeesView
            staff={employees}
            loading={empLoading}
            error={empError}
            q={empQ}
            setQ={setEmpQ}
            onReload={loadEmployees}
            departments={departments}
            designations={designations}
          />
        )}
        {tab === 'attendance' && <AttendanceView />}
        {tab === 'leaves' && (
          <LeavesView leaves={leaves} loading={leaveLoading} error={leaveError} onReload={loadLeaves} />
        )}
        {tab === 'recruitment' && canManageRecruitment && (
          <RecruitmentView apiCandidates={recruitments} onReload={loadRecruitments} />
        )}
        {tab === 'insurance' && <InsuranceView employees={employees} />}
        {tab === 'payroll' && <PayrollView employees={employees} />}
        {tab === 'letters' && (
          <LettersView
            employees={employees}
            onEmployeesReload={loadEmployees}
            departments={departments}
            designations={designations}
          />
        )}
        {tab === 'documents' && (
          <DocumentsView employees={employees} user={user} />
        )}
      </main>
    </div>
  );
}
