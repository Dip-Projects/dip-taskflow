/**
 * Delete existing Sunday recurring_task_instances for MDO OFFICE tasks.
 * Run from backend/: node ../scripts/remove-mdo-sunday-recurring.mjs
 * Or: node scripts/remove-mdo-sunday-recurring.mjs (with NODE_PATH=backend/node_modules)
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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

const root = path.join(__dirname, '..');
const env = {
  ...loadEnv(path.join(root, 'backend', '.env')),
  ...loadEnv(path.join(root, '.env')),
  ...process.env,
};

function isSundayYmd(ymd) {
  // Noon UTC → stable calendar weekday for IST
  return new Date(`${ymd}T12:00:00.000Z`).getUTCDay() === 0;
}

async function main() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: depts, error: dErr } = await sb
    .from('departments')
    .select('id, name')
    .ilike('name', 'MDO OFFICE');
  if (dErr) throw new Error(dErr.message);
  const deptIds = (depts || []).map((d) => d.id);
  if (!deptIds.length) {
    console.log('No MDO OFFICE department found — nothing to do.');
    return;
  }

  const { data: tasks, error: tErr } = await sb
    .from('recurring_tasks')
    .select('id, description, department_id')
    .in('department_id', deptIds);
  if (tErr) throw new Error(tErr.message);
  const taskIds = (tasks || []).map((t) => t.id);
  console.log(`MDO OFFICE recurring tasks: ${taskIds.length}`);
  if (!taskIds.length) return;

  const { data: instances, error: iErr } = await sb
    .from('recurring_task_instances')
    .select('id, due_date, status, recurring_task_id')
    .in('recurring_task_id', taskIds);
  if (iErr) throw new Error(iErr.message);

  const sundayIds = (instances || [])
    .filter((row) => isSundayYmd(String(row.due_date || '').slice(0, 10)))
    .map((row) => row.id);

  console.log(`Sunday instances found: ${sundayIds.length}`);
  if (!sundayIds.length) {
    console.log('Nothing to delete.');
    return;
  }

  // Delete in chunks
  let deleted = 0;
  for (let i = 0; i < sundayIds.length; i += 100) {
    const chunk = sundayIds.slice(i, i + 100);
    const { error: delErr } = await sb
      .from('recurring_task_instances')
      .delete()
      .in('id', chunk);
    if (delErr) throw new Error(delErr.message);
    deleted += chunk.length;
  }
  console.log(`Deleted Sunday MDO OFFICE instances: ${deleted}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
