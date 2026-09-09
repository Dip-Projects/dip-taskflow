// Run with: npm run seed
// Creates starter departments/projects/task types plus one admin login and
// one employee login, so you have something to log in with right away.
// Safe to re-run — it skips anything that already exists.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabaseClient');

async function upsertByName(table, names) {
  const { data: existing, error: fetchErr } = await supabase.from(table).select('name');
  if (fetchErr) throw fetchErr;

  const existingNames = new Set((existing || []).map((r) => r.name));
  const toInsert = names.filter((name) => !existingNames.has(name)).map((name) => ({ name }));

  if (toInsert.length) {
    const { error } = await supabase.from(table).insert(toInsert);
    if (error) throw error;
  }
  console.log(`✅ ${table}: added ${toInsert.length}, ${existingNames.size} already existed`);
}

async function upsertUser({ username, password, full_name, role, department, designation }) {
  const { data: existing, error: fetchErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  if (existing) {
    console.log(`↪️  user "${username}" already exists, skipping`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const row = { username, password_hash, full_name, role };
  if (department) row.department = department;
  if (designation) row.designation = designation;
  const { error } = await supabase.from('users').insert(row);
  if (error) throw error;
  console.log(`✅ created ${role} login → username: "${username}"  password: "${password}"`);
}

(async () => {
  try {
    await upsertByName('departments', ['Estimation', 'Drawing', 'Site Execution', 'Accounts']);
    await upsertByName('projects', ['Proposed Cafe Project', 'SMJV Boys Hostel']);
    await upsertByName('task_types', ['Estimate', 'Comparative', 'Drawing', 'Site Visit']);

    await upsertUser({ username: 'admin', password: 'Admin@123', full_name: 'Admin User', role: 'admin' });
    await upsertUser({ username: 'charmy', password: 'Charmy@123', full_name: 'Charmy Desai', role: 'employee' });
    await upsertUser({
      username: 'hr',
      password: 'Hr@123',
      full_name: 'HR User',
      role: 'hr',
      department: 'HR',
      designation: 'HR',
    });

    console.log('\n🎉 Seed complete — log in with the credentials above, then add real employees in Supabase → Table editor → users.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
})();
