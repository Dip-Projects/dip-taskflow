/**
 * Import staff birthdays (from HR DOB sheet) into hr/_meta/employee_profiles.json
 * and link employee_id when name matches users table.
 *
 *   node scripts/importBirthdays.js
 */
require('dotenv').config();
const supabase = require('../lib/supabaseClient');

const BUCKET = 'documents';
const PROFILES_PATH = 'hr/_meta/employee_profiles.json';

/** DD-MM-YYYY → YYYY-MM-DD */
function toIso(dob) {
  const m = String(dob || '').trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function normName(s) {
  let n = String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const aliases = {
    AISHWARYAVANKAWLA: 'AISHWARYAVANKAWALA',
    NAMANPRAKSHBHAIVYAS: 'NAMANVYAS',
    SAYALIMPATHANIA: 'SAYALIPATHANIA',
    MUMUKSHVIJAYBHAIGOHIL: 'MUMUKSHGOHIL',
    ANILBHAIJASWANTLALPATEL: 'ANILPATEL',
    BADALKUMAR: 'BADALPATEL',
    HARSHILPRAJAPATIRINESHKUMAR: 'HARSHILPRAJAPATI',
    CHIRAGVGAJERA: 'CHIRAGGAJERA',
    AMITKEDARIYA: 'AMITKESDIYA',
  };
  return aliases[n] || n;
}

function nameScore(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 90;
  const ta = String(a || '').toUpperCase().split(/\s+/).filter((t) => t.length > 2);
  const tb = String(b || '').toUpperCase().split(/\s+/).filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  let hit = 0;
  ta.forEach((t) => {
    if (tb.some((u) => u === t || u.includes(t) || t.includes(u))) hit += 1;
  });
  return Math.round((hit / Math.max(ta.length, tb.length)) * 80);
}

const BIRTHDAYS = [
  ['JASIM PATEL', '18-01-1998'],
  ['YASH PATEL', '19-01-2001'],
  ['NARAYAN CHANDRAPPA TANKSHAL', '26-01-1979'],
  ['NAMAN PRAKSHBHAI VYAS', '09-02-1999'],
  ['RAJDIP PARMAR', '14-02-2000'],
  ['DIVYESH RAJESHBHAI RANA', '04-03-1995'],
  ['JIGNESH THAKORBHAI LAD', '06-03-1986'],
  ['ASHISH GANESHBHAI PATEL', '17-03-1994'],
  ['ANKIT RASIKLAL SHAH', '21-03-1994'],
  ['SAYALI M PATHANIA', '28-03-1992'],
  ['ROSHAN PRAFULKUMAR PATEL', '09-04-2001'],
  ['ANKUR CHOPDA', '11-04-1986'],
  ['CHARMY DESAI', '19-04-2004'],
  ['AISHWARYA VANKAWLA', '30-04-2003'],
  ['MUMUKSH. VIJAYBHAI . GOHIL', '04-05-1998'],
  ['BEENA PARMAR', '08-05-1997'],
  ['JAY LOH', '17-05-2002'],
  ['MUKESH CHAUDHARI', '02-06-1995'],
  ['SUNIL SHARMA', '05-06-1990'],
  ['NISARG PANDYA', '08-06-1990'],
  ['POOJAN BANGDIWALA', '13-06-2002'],
  ['AASHDEEPSINH SHAILENDRASINH MAHIDA', '07-07-1999'],
  ['ALOK KUMAR', '21-07-1996'],
  ['AMIT KEDARIYA', '12-08-1992'],
  ['RAHUL PATEL', '13-08-1994'],
  ['ANILBHAI JASWANTLAL PATEL', '10-09-1968'],
  ['DHAVALKUMAR SURESHBHAI CHAUDHARI', '16-09-2001'],
  ['CHIRAG V. GAJERA', '19-09-1997'],
  ['RIPESHKUMAR JAGDISHBHAI DHIMMAR', '27-09-1987'],
  ['SALIM NABUKHAN', '03-10-1986'],
  ['MAYANK MAISURIYA', '07-10-1999'],
  ['BADAL KUMAR', '16-10-2000'],
  ['DIVYANKA PATIL', '10-11-2001'],
  ['VIRAL LAD', '19-11-1994'],
  ['KISHAN LALJIBHAI KALSARIYA', '22-11-1996'],
  ['TUSHAR CHAUHAN', '23-11-2000'],
  ['PARESHBHAI MAHESHBHAI SANDISH', '25-11-1992'],
  ['ROCKY HASMUKHBHAI PATEL', '27-11-1997'],
  ['HARSHIL PRAJAPATI RINESHKUMAR', '14-12-2000'],
  ['PRAGNESH PATEL', '18-12-1995'],
  ['DHRUVIN NAIK', '15-12-2001'],
];

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureBucket() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) return;
  await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '50MB' }).catch(() => {});
}

async function readJson(path, fallback) {
  await ensureBucket();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) return fallback;
  try {
    return JSON.parse(await data.text());
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await ensureBucket();
  const body = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

async function main() {
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, whatsapp_number, designation, department')
    .eq('is_active', true)
    .limit(2000);

  const userList = users || [];
  const profiles = await readJson(PROFILES_PATH, []);
  const byNorm = new Map(profiles.map((p) => [normName(p.employee_name), p]));
  const now = new Date().toISOString();
  let updated = 0;

  for (const [name, dobRaw] of BIRTHDAYS) {
    const dob = toIso(dobRaw);
    if (!dob) continue;
    const key = normName(name);
    let bestUser = null;
    let best = 0;
    userList.forEach((u) => {
      const s = nameScore(name, u.full_name);
      if (s > best) {
        best = s;
        bestUser = u;
      }
    });
    const linked = best >= 70 ? bestUser : null;
    const prev = byNorm.get(key) || (linked ? byNorm.get(normName(linked.full_name)) : null);
    const row = {
      id: prev?.id || uid(),
      employee_id: linked?.id || prev?.employee_id || null,
      employee_name: linked?.full_name || name.replace(/\s+/g, ' ').trim(),
      dob,
      whatsapp_number: prev?.whatsapp_number || linked?.whatsapp_number || '',
      designation: prev?.designation || linked?.designation || '',
      department: prev?.department || linked?.department || '',
      updated_at: now,
    };
    byNorm.set(normName(row.employee_name), row);
    byNorm.set(key, row);
    updated += 1;
  }

  const list = [...new Map([...byNorm.values()].map((p) => [normName(p.employee_name), p])).values()];
  await writeJson(PROFILES_PATH, list);
  console.log(`✅ Birthdays imported/updated: ${updated}. Profiles total: ${list.length}`);
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
