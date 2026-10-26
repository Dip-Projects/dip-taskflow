/**
 * MDO Office Work tasks stay on the MDO portal / day-to-day task lists.
 * Keep them out of office Emp Delay Report, Work & Verification, and FMS.
 */
function isMdoOfficeWorkTask(t) {
  const dept = String(
    t?.department?.name || t?.assigned_to_user?.department || ''
  )
    .toLowerCase()
    .trim();
  const type = String(t?.task_type?.name || '')
    .toLowerCase()
    .trim();

  if (type === 'mdo office work' || type.includes('mdo office work')) return true;
  if (dept === 'mdo office' || /\bmdo\b/.test(dept)) return true;
  if (/\bmdo\b/.test(type)) return true;
  return false;
}

module.exports = { isMdoOfficeWorkTask };
