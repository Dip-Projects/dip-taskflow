// Quick way to add a real employee login without writing SQL by hand.
// Usage:
//   node scripts/addEmployee.js <username> <password> "<Full Name>" [admin|hr|employee]
// Optional 4th arg sets role (default: employee).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabaseClient');

(async () => {
  const [username, password, full_name, roleArg] = process.argv.slice(2);

  if (!username || !password || !full_name) {
    console.log('Usage: node scripts/addEmployee.js <username> <password> "<Full Name>" [admin|hr|employee]');
    process.exit(1);
  }

  const allowed = new Set(['admin', 'employee', 'head', 'client', 'hr']);
  const role = allowed.has(String(roleArg || '').toLowerCase())
    ? String(roleArg).toLowerCase()
    : 'employee';

  try {
    const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (existing) {
      console.log(`❌ username "${username}" already exists`);
      process.exit(1);
    }

    const password_hash = await bcrypt.hash(password, 10);
    const row = { username, password_hash, full_name, role };
    if (role === 'hr') {
      row.department = 'HR';
      row.designation = 'HR';
    }
    const { error } = await supabase.from('users').insert(row);
    if (error) throw error;

    console.log(`✅ created ${role} login → username: "${username}"  password: "${password}"`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
})();
