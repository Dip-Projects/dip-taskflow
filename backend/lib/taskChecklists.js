const supabase = require('./supabaseClient');

/** Error that the route layer turns into an HTTP status (default 500). */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Active common checkpoints (shown on every task checklist), in display order.
 * Admin setup passes includeInactive to also get hidden rows.
 */
async function loadCommonItems({ includeInactive = true } = {}) {
  let query = supabase
    .from('task_checklist_common_items')
    .select('id, item_text, sort_order, is_active')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Common checks remain enabled for task types created before the setting existed. */
async function includesCommonChecks(taskTypeId) {
  if (!taskTypeId) return true;
  const { data, error } = await supabase
    .from('task_types')
    .select('include_common_checks')
    .eq('id', taskTypeId)
    .maybeSingle();
  if (error) throw error;
  return data?.include_common_checks !== false;
}

/**
 * Everything a verifier must answer for one task, in display order:
 * common checkpoints first, then active sections with their active items.
 * Returns { task_type_id, common: [{ id, item_text }], sections: [{ id, title, items: [{ id, item_text }] }] }.
 */
async function loadActiveTemplateForTask(taskId) {
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('id, task_type_id')
    .eq('id', taskId)
    .maybeSingle();
  if (taskErr) throw taskErr;
  if (!task) throw httpError(404, 'Task not found');

  const taskTypeId = task.task_type_id || null;
  const includeCommonChecks = await includesCommonChecks(taskTypeId);
  const common = includeCommonChecks ? await loadCommonItems({ includeInactive: false }) : [];
  const sections = taskTypeId
    ? await loadSectionsForType(taskTypeId, { includeInactive: false })
    : [];

  return {
    task_type_id: taskTypeId,
    include_common_checks: includeCommonChecks,
    common: common.map((c) => ({ id: c.id, item_text: c.item_text })),
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      items: s.items.map((i) => ({ id: i.id, item_text: i.item_text })),
    })),
  };
}

/** Every section (and item) for a task type. Admin setup uses includeInactive. */
async function loadSectionsForType(taskTypeId, { includeInactive = true } = {}) {
  let sectionQuery = supabase
    .from('task_checklist_sections')
    .select('id, task_type_id, title, sort_order, is_active')
    .eq('task_type_id', taskTypeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeInactive) sectionQuery = sectionQuery.eq('is_active', true);
  const { data: sections, error: secErr } = await sectionQuery;
  if (secErr) throw secErr;
  if (!sections?.length) return [];

  let itemQuery = supabase
    .from('task_checklist_items')
    .select('id, section_id, item_text, sort_order, is_active')
    .in('section_id', sections.map((s) => s.id))
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!includeInactive) itemQuery = itemQuery.eq('is_active', true);
  const { data: items, error: itemErr } = await itemQuery;
  if (itemErr) throw itemErr;

  const bySection = new Map();
  for (const item of items || []) {
    if (!bySection.has(item.section_id)) bySection.set(item.section_id, []);
    bySection.get(item.section_id).push(item);
  }
  return sections.map((s) => ({ ...s, items: bySection.get(s.id) || [] }));
}

/**
 * Validates the verifier's answers against the active template (common
 * checkpoints + section checkpoints) and writes the submission header plus one
 * row per checkpoint. Returns the submission id, or null when nothing is set up.
 *
 * `responses` is [{ item_id, comments }]. Every active checkpoint must be
 * present so a verifier cannot skip one; comments may be left blank.
 */
async function saveVerificationChecklist({ taskId, verifier, responses }) {
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('id, task_type_id')
    .eq('id', taskId)
    .maybeSingle();
  if (taskErr) throw taskErr;
  if (!task) throw httpError(404, 'Task not found');

  const includeCommonChecks = await includesCommonChecks(task.task_type_id);
  const common = includeCommonChecks ? await loadCommonItems({ includeInactive: false }) : [];
  const sections = task.task_type_id
    ? await loadSectionsForType(task.task_type_id, { includeInactive: false })
    : [];

  // Each entry is one checkpoint in the order it is shown and saved.
  const flat = common.map((item) => ({ item, section: null, isCommon: true }));
  for (const section of sections) {
    for (const item of section.items) {
      flat.push({ item, section, isCommon: false });
    }
  }
  if (!flat.length) return null;

  const answers = new Map();
  for (const r of Array.isArray(responses) ? responses : []) {
    const itemId = String(r?.item_id || '');
    answers.set(itemId, String(r?.comments || '').trim());
  }

  const knownIds = new Set(flat.map((f) => f.item.id));
  for (const id of answers.keys()) {
    if (!knownIds.has(id)) {
      throw httpError(400, 'The checklist changed while you were filling it in. Please reopen it and try again.');
    }
  }
  const unanswered = flat.filter((f) => !answers.has(f.item.id)).length;
  if (unanswered) {
    throw httpError(400, `Please go through every checkpoint (${unanswered} not filled in).`);
  }

  const { data: submission, error: subErr } = await supabase
    .from('task_checklist_submissions')
    .insert({
      task_id: task.id,
      task_type_id: task.task_type_id || null,
      verifier_id: verifier.id || null,
      verifier_name: verifier.full_name || verifier.username || null,
    })
    .select('id')
    .single();
  if (subErr) throw subErr;

  const rows = flat.map((f, i) => (f.isCommon
    ? {
      submission_id: submission.id,
      task_type_id: task.task_type_id || null,
      common_item_id: f.item.id,
      section_id: null,
      item_id: null,
      section_title: '',
      checklist_item: f.item.item_text,
      comments: answers.get(f.item.id) || null,
      sort_order: i,
    }
    : {
      submission_id: submission.id,
      task_type_id: task.task_type_id,
      section_id: f.section.id,
      item_id: f.item.id,
      section_title: f.section.title,
      checklist_item: f.item.item_text,
      comments: answers.get(f.item.id) || null,
      sort_order: i,
    }));
  const { error: rowErr } = await supabase.from('task_checklists').insert(rows);
  if (rowErr) {
    // Keep records all-or-nothing: drop the header so no half-filled checklist remains.
    await supabase.from('task_checklist_submissions').delete().eq('id', submission.id);
    throw rowErr;
  }
  return submission.id;
}

/** Removes a submission written by saveVerificationChecklist (used when the verify step fails). */
async function discardSubmission(submissionId) {
  if (!submissionId) return;
  await supabase.from('task_checklist_submissions').delete().eq('id', submissionId);
}

module.exports = {
  httpError,
  loadCommonItems,
  loadActiveTemplateForTask,
  loadSectionsForType,
  saveVerificationChecklist,
  discardSubmission,
};
