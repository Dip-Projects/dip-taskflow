// People who open the Site portal first and get the Team Overview dashboard,
// recognised by name so it works without any database switch.
// To add someone: add a pattern here (matched against full name / username).
const SITE_DEFAULT_PEOPLE = [
  { name: /^\s*divyesh\b.*\brana\s*$/i, username: /^divyesh\.r$/i }, // Divyesh Rajeshbhai Rana
  { name: /^\s*jignesh\b.*\blad\s*$/i, username: /^jignesh\.l$/i },  // Jignesh Thakorbhai Lad
];

function isSiteDefaultPerson(user) {
  if (!user) return false;
  const name = String(user.full_name || user.name || '').trim();
  const username = String(user.username || user.user_name || '').trim();
  return SITE_DEFAULT_PEOPLE.some((p) => p.name.test(name) || p.username.test(username));
}

module.exports = { isSiteDefaultPerson };
