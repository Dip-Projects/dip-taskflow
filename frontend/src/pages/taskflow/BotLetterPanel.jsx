import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { generateExpCertificatePdf } from '../hr/letters/generateExpCertPdf';
import { OFFER_TEMPLATES, generateOfferLetterPdf } from '../hr/letters/generateOfferLetterPdf';

const emptyOffer = () => ({
  title: 'MR',
  candidateName: '',
  designation: 'SITE HEAD',
  joiningDate: '',
  workTimings: '9.00 a.m. to 6.30 p.m.',
  probationSalary: '120000',
  revisedSalary: '125000',
  includeProbationSalaryRevision: true,
  includeFoodStayByClient: false,
  includeFurtherIncrement: false,
  includeProbationHike: true,
  includeProjectIncentive: true,
  revisedPercent: '10',
  projectIncentivePercent: '5',
  incrementAfterMonths: '',
  incrementAmount: '',
});

export default function BotLetterPanel({ kind }) {
  const [staff, setStaff] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [exp, setExp] = useState({
    name: '',
    gender: 'Male',
    designation: '',
    fromDate: '',
    toDate: '',
  });
  const [templateId, setTemplateId] = useState('site');
  const [offer, setOffer] = useState(emptyOffer);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [people, opts] = await Promise.all([
          api('/hr/staff').catch(() => ({ staff: [] })),
          api('/hr/staff-options').catch(() => ({ designations: [] })),
        ]);
        if (cancelled) return;
        setStaff(Array.isArray(people.staff) ? people.staff : []);
        setDesignations(Array.isArray(opts.designations) ? opts.designations : []);
      } catch {
        if (!cancelled) setStaff([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pickStaff = (id) => {
    const row = staff.find((s) => String(s.id) === String(id));
    if (!row) return;
    setExp((p) => ({
      ...p,
      name: row.full_name || '',
      designation: row.designation || p.designation,
    }));
    setOffer((p) => ({
      ...p,
      candidateName: row.full_name || '',
      designation: row.designation || p.designation,
    }));
  };

  const downloadExp = async () => {
    setNote('');
    if (!exp.name.trim() || !exp.designation.trim() || !exp.fromDate || !exp.toDate) {
      setNote('Name, designation, from date and to date are required.');
      return;
    }
    setBusy(true);
    try {
      await generateExpCertificatePdf({
        name: exp.name.trim(),
        designation: exp.designation.trim(),
        fromDate: exp.fromDate,
        toDate: exp.toDate,
        gender: exp.gender || 'Male',
      });
      setNote('Experience letter downloaded.');
    } catch (e) {
      setNote(e?.message || 'Experience letter failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadOffer = async () => {
    setNote('');
    if (!offer.candidateName.trim() || !offer.designation.trim()) {
      setNote('Name and designation are required.');
      return;
    }
    setBusy(true);
    try {
      await generateOfferLetterPdf(templateId, offer);
      setNote('Offer letter downloaded.');
    } catch (e) {
      setNote(e?.message || 'Offer letter failed.');
    } finally {
      setBusy(false);
    }
  };

  const setTpl = (id) => {
    setTemplateId(id);
    setOffer((p) => {
      if (id === 'sales') {
        return {
          ...p,
          designation: !p.designation || p.designation === 'SITE HEAD' ? 'Sales Executive' : p.designation,
          workTimings: '9:30 a.m. to 6:30 p.m.',
          probationSalary: p.probationSalary === '120000' ? '40000' : p.probationSalary,
          title: p.title === 'MR' ? 'MS' : p.title,
        };
      }
      return {
        ...p,
        designation: !p.designation || p.designation === 'Sales Executive' ? 'SITE HEAD' : p.designation,
        workTimings: '9.00 a.m. to 6.30 p.m.',
        probationSalary: p.probationSalary === '40000' ? '120000' : p.probationSalary,
      };
    });
  };

  return (
    <div className="bot-letter-panel">
      <div className="bot-letter-title">
        {kind === 'exp' ? 'Experience letter' : 'Offer letter'}
      </div>
      <label className="bot-letter-field">
        Employee (optional)
        <select defaultValue="" onChange={(e) => pickStaff(e.target.value)}>
          <option value="">Select to fill name…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </label>

      {kind === 'exp' ? (
        <div className="bot-letter-grid">
          <label className="bot-letter-field">Name
            <input value={exp.name} onChange={(e) => setExp({ ...exp, name: e.target.value })} />
          </label>
          <label className="bot-letter-field">Gender
            <select value={exp.gender} onChange={(e) => setExp({ ...exp, gender: e.target.value })}>
              <option>Male</option>
              <option>Female</option>
            </select>
          </label>
          <label className="bot-letter-field">Designation
            <input list="bot-desig-list" value={exp.designation} onChange={(e) => setExp({ ...exp, designation: e.target.value })} />
          </label>
          <label className="bot-letter-field">From
            <input type="date" value={exp.fromDate} onChange={(e) => setExp({ ...exp, fromDate: e.target.value })} />
          </label>
          <label className="bot-letter-field">To
            <input type="date" value={exp.toDate} onChange={(e) => setExp({ ...exp, toDate: e.target.value })} />
          </label>
          <div className="bot-letter-actions">
            <button type="button" className="primary-btn primary-btn-inline" disabled={busy} onClick={downloadExp}>
              {busy ? 'Generating…' : 'Download experience letter'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bot-letter-grid">
          <label className="bot-letter-field">Format
            <select value={templateId} onChange={(e) => setTpl(e.target.value)}>
              {OFFER_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="bot-letter-field">Title
            <select value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })}>
              <option value="MR">MR</option>
              <option value="MS">MS</option>
              <option value="MRS">MRS</option>
            </select>
          </label>
          <label className="bot-letter-field">Name
            <input value={offer.candidateName} onChange={(e) => setOffer({ ...offer, candidateName: e.target.value })} />
          </label>
          <label className="bot-letter-field">Designation
            <input list="bot-desig-list" value={offer.designation} onChange={(e) => setOffer({ ...offer, designation: e.target.value })} />
          </label>
          <label className="bot-letter-field">Joining date
            <input value={offer.joiningDate} placeholder="e.g. 1 OCT 2026" onChange={(e) => setOffer({ ...offer, joiningDate: e.target.value })} />
          </label>
          <label className="bot-letter-field">Working hours
            <input value={offer.workTimings} onChange={(e) => setOffer({ ...offer, workTimings: e.target.value })} />
          </label>
          <label className="bot-letter-field">Probation salary (₹)
            <input value={offer.probationSalary} onChange={(e) => setOffer({ ...offer, probationSalary: e.target.value })} />
          </label>
          {templateId === 'sales' ? (
            <>
              <label className="bot-letter-field">Hike after probation (%)
                <input value={offer.revisedPercent} onChange={(e) => setOffer({ ...offer, revisedPercent: e.target.value })} />
              </label>
              <label className="bot-letter-field">Project incentive (%)
                <input value={offer.projectIncentivePercent} onChange={(e) => setOffer({ ...offer, projectIncentivePercent: e.target.value })} />
              </label>
            </>
          ) : (
            <label className="bot-letter-field">Salary from 4th month (₹)
              <input value={offer.revisedSalary} onChange={(e) => setOffer({ ...offer, revisedSalary: e.target.value })} />
            </label>
          )}
          <label className="bot-letter-check">
            <input
              type="checkbox"
              checked={!!offer.includeFurtherIncrement}
              onChange={(e) => setOffer({ ...offer, includeFurtherIncrement: e.target.checked })}
            />
            Further increment
          </label>
          {offer.includeFurtherIncrement && (
            <>
              <label className="bot-letter-field">Every (months)
                <input value={offer.incrementAfterMonths} onChange={(e) => setOffer({ ...offer, incrementAfterMonths: e.target.value })} />
              </label>
              <label className="bot-letter-field">Increment amount (₹)
                <input value={offer.incrementAmount} onChange={(e) => setOffer({ ...offer, incrementAmount: e.target.value })} />
              </label>
            </>
          )}
          {templateId !== 'sales' && (
            <label className="bot-letter-check">
              <input
                type="checkbox"
                checked={!!offer.includeFoodStayByClient}
                onChange={(e) => setOffer({ ...offer, includeFoodStayByClient: e.target.checked })}
              />
              Food and stay by client
            </label>
          )}
          <div className="bot-letter-actions">
            <button type="button" className="primary-btn primary-btn-inline" disabled={busy} onClick={downloadOffer}>
              {busy ? 'Generating…' : 'Download offer letter'}
            </button>
          </div>
        </div>
      )}

      <datalist id="bot-desig-list">
        {designations.map((d) => <option key={d} value={d} />)}
      </datalist>
      {note && <p className="bot-letter-note">{note}</p>}
    </div>
  );
}
