/**
 * One-off: insert Kadmawala DPR rows into TaskFlow dpr_reports (keep existing).
 * Run: node scripts/import-kadmawala-dpr.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return out;
}

const env = { ...loadEnv(join(root, '.env')), ...process.env };
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ROWS = [
  {
    site: 'Kadmawala Industrial Park',
    engineer: 'Ripesh Dhimmar',
    report_type: 'evening',
    date: '2026-09-01',
    payload: {
      cube: '',
      date: '2026-09-01',
      site: 'Kadmawala Industrial Park',
      photos: [
        {
          caption: '',
          storagePath: '2026/September/01-09-2026/dpr/photos/photo_1.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/01-09-2026/dpr/photos/photo_1.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/01-09-2026/dpr/photos/photo_2.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/01-09-2026/dpr/photos/photo_2.jpg',
        },
      ],
      summary: 'No work due to monsoon season ',
      engineer: 'Ripesh Dhimmar',
      manpower: [
        {
          id: 'tmp_1788233384079',
          count: 1,
          scope: 'client',
          skill: 'Site Supervisor',
          gender: 'MALE',
          labour: 'Supervisor',
          category: 'Supervisor',
          displayScope: 'Client',
        },
        {
          id: 'tmp_1788233411256',
          count: 1,
          scope: 'pmc',
          skill: 'Site Incharge',
          gender: 'MALE',
          labour: 'Site Incharge',
          category: 'Civil Work',
          displayScope: 'Pmc',
        },
      ],
      material: [],
      planning: 'No work due to monsoon season ',
      visitors: [],
      equipment: [],
      cementUsed: '',
      reportType: 'evening',
      customFields: [],
      employeeName: 'Ripesh Dhimmar',
      cementBalance: '0',
      cementReceived: '',
      cementUsedDesc: '',
      concreteOnsite: '',
      cementAvailable: '',
      checklistPhotos: [],
      concreteDescription: '',
      concreteTheoretical: '',
      materialRequirement: [],
    },
    pdf_url:
      'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/01-09-2026/dpr/reports/DPR_Evening_Kadmawala_Industrial_Park_2026-09-01.pdf',
    photo_folder: '2026/September/01-09-2026/dpr',
    created_at: '2026-09-01T11:39:35.068Z',
  },
  {
    site: 'Kadmawala Industrial Park',
    engineer: 'Ripesh Dhimmar',
    report_type: 'morning',
    date: '2026-09-02',
    payload: {
      cube: '',
      date: '2026-09-02',
      site: 'Kadmawala Industrial Park',
      photos: [],
      summary: 'No work due to monsoon season ',
      engineer: 'Ripesh Dhimmar',
      manpower: [
        {
          id: 'tmp_1788319352207',
          count: 1,
          scope: 'client',
          skill: 'Site Supervisor',
          gender: 'MALE',
          labour: 'Supervisor',
          category: 'Supervisor',
          displayScope: 'Client',
        },
        {
          id: 'tmp_1788319375882',
          count: 1,
          scope: 'pmc',
          skill: 'Site Incharge',
          gender: 'MALE',
          labour: 'Site Incharge',
          category: 'Civil Work',
          displayScope: 'Pmc',
        },
      ],
      material: [],
      planning: '',
      visitors: [],
      equipment: [],
      cementUsed: '',
      reportType: 'morning',
      customFields: [],
      employeeName: 'Ripesh Dhimmar',
      cementBalance: '0',
      cementReceived: '',
      cementUsedDesc: '',
      concreteOnsite: '',
      cementAvailable: '',
      checklistPhotos: [],
      concreteDescription: '',
      concreteTheoretical: '',
      materialRequirement: [],
    },
    pdf_url: null,
    photo_folder: null,
    created_at: '2026-09-02T03:23:03.244Z',
  },
  {
    site: 'Kadmawala Industrial Park',
    engineer: 'Ripesh Dhimmar',
    report_type: 'evening',
    date: '2026-09-02',
    payload: {
      cube: '',
      date: '2026-09-02',
      site: 'Kadmawala Industrial Park',
      photos: [
        {
          caption: '',
          storagePath: '2026/September/02-09-2026/dpr/photos/photo_1.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/02-09-2026/dpr/photos/photo_1.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/02-09-2026/dpr/photos/photo_2.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/02-09-2026/dpr/photos/photo_2.jpg',
        },
      ],
      summary: 'No work due to monsoon season ',
      engineer: 'Ripesh Dhimmar',
      manpower: [
        {
          id: 'tmp_1788319352207',
          count: 1,
          scope: 'client',
          skill: 'Site Supervisor',
          gender: 'MALE',
          labour: 'Supervisor',
          category: 'Supervisor',
          displayScope: 'Client',
        },
        {
          id: 'tmp_1788319375882',
          count: 1,
          scope: 'pmc',
          skill: 'Site Incharge',
          gender: 'MALE',
          labour: 'Site Incharge',
          category: 'Civil Work',
          displayScope: 'Pmc',
        },
      ],
      material: [],
      planning: 'No work due to monsoon season ',
      visitors: [],
      equipment: [],
      cementUsed: '',
      reportType: 'evening',
      customFields: [],
      employeeName: 'Ripesh Dhimmar',
      cementBalance: '0',
      cementReceived: '',
      cementUsedDesc: '',
      concreteOnsite: '',
      cementAvailable: '',
      checklistPhotos: [],
      concreteDescription: '',
      concreteTheoretical: '',
      materialRequirement: [],
    },
    pdf_url:
      'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/02-09-2026/dpr/reports/DPR_Evening_Kadmawala_Industrial_Park_2026-09-02.pdf',
    photo_folder: '2026/September/02-09-2026/dpr',
    created_at: '2026-09-02T10:28:54.592Z',
  },
  {
    site: 'Kadmawala Industrial Park',
    engineer: 'Ripesh Dhimmar',
    report_type: 'evening',
    date: '2026-09-03',
    payload: {
      cube: '',
      date: '2026-09-03',
      site: 'Kadmawala Industrial Park',
      photos: [
        {
          caption: '',
          storagePath: '2026/September/03-09-2026/dpr/photos/photo_1.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/photos/photo_1.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/03-09-2026/dpr/photos/photo_2.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/photos/photo_2.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/03-09-2026/dpr/photos/photo_3.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/photos/photo_3.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/03-09-2026/dpr/photos/photo_4.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/photos/photo_4.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/03-09-2026/dpr/photos/photo_5.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/photos/photo_5.jpg',
        },
        {
          caption: '',
          storagePath: '2026/September/03-09-2026/dpr/photos/photo_6.jpg',
          supabaseUrl:
            'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/photos/photo_6.jpg',
        },
      ],
      summary: 'No work due to Monsoon season ',
      engineer: 'Ripesh Dhimmar',
      manpower: [
        {
          id: 'tmp_1788405724690',
          count: 1,
          scope: 'client',
          skill: 'Site Supervisor',
          gender: 'MALE',
          labour: 'Supervisor',
          category: 'Supervisor',
          displayScope: 'Client',
        },
        {
          id: 'tmp_1788405752134',
          count: 1,
          scope: 'pmc',
          skill: 'Site Incharge',
          gender: 'MALE',
          labour: 'Site Incharge',
          category: 'Civil Work',
          displayScope: 'Pmc',
        },
      ],
      material: [],
      planning: 'No work due to Monsoon season ',
      visitors: [],
      equipment: [],
      cementUsed: '',
      reportType: 'evening',
      customFields: [],
      employeeName: 'Ripesh Dhimmar',
      cementBalance: '0',
      cementReceived: '',
      cementUsedDesc: '',
      concreteOnsite: '',
      cementAvailable: '',
      checklistPhotos: [],
      concreteDescription: '',
      concreteTheoretical: '',
      materialRequirement: [],
    },
    pdf_url:
      'https://efqfjfthsleymhljswcq.supabase.co/storage/v1/object/public/kadmawala-industrial-park/2026/September/03-09-2026/dpr/reports/DPR_Evening_Kadmawala_Industrial_Park_2026-09-03.pdf',
    photo_folder: '2026/September/03-09-2026/dpr',
    created_at: '2026-09-03T13:03:20.252Z',
  },
];

async function main() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }

  let inserted = 0;
  let skipped = 0;

  for (const row of ROWS) {
    const { data: existing, error: findErr } = await sb
      .from('dpr_reports')
      .select('id')
      .eq('site', row.site)
      .eq('engineer', row.engineer)
      .eq('report_type', row.report_type)
      .eq('date', row.date)
      .limit(1);

    if (findErr) throw new Error(findErr.message);

    if (existing?.length) {
      console.log(`SKIP (exists): ${row.date} ${row.report_type}`);
      skipped += 1;
      continue;
    }

    const { data, error } = await sb
      .from('dpr_reports')
      .insert({
        site: row.site,
        engineer: row.engineer,
        report_type: row.report_type,
        date: row.date,
        payload: row.payload,
        pdf_url: row.pdf_url,
        photo_folder: row.photo_folder,
        created_at: row.created_at,
      })
      .select('id, date, report_type')
      .single();

    if (error) throw new Error(error.message);
    console.log(`INSERTED: ${data.date} ${data.report_type} → ${data.id}`);
    inserted += 1;
  }

  console.log(`Done. inserted=${inserted} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
