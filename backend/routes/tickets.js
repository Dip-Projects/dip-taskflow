const express = require('express');
const multer  = require('multer');
const supabase = require('../lib/supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// 10 MB limit for screenshots / screen recordings
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const BUCKET = 'task-files';

// Categories that warrant spinning up a task for the MIS executive to chase down.
const MIS_TASK_CATEGORIES = new Set(['Technical', 'Access']);

async function uploadFile(file, folder) {
  if (!file) return null;
  const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype, upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Finds (or creates, once) the master-data rows used to file MIS follow-up
// tasks under, so they show up cleanly in the normal task lists/reports
// instead of needing nullable FKs.
async function getOrCreate(table, name) {
  const { data: existing, error: findErr } = await supabase
    .from(table).select('id').eq('name', name).maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id;

  const { data: created, error: createErr } = await supabase
    .from(table).insert({ name }).select('id').single();
  if (createErr) throw createErr;
  return created.id;
}

// Auto-creates a follow-up task for the MIS executive when a ticket lands in
// a category they need to chase (Technical / Access). Best-effort: failures
// here must never block the ticket itself from being saved.
async function createMisFollowUpTask(ticket, raisedByName) {
  const { data: misUser, error: misErr } = await supabase
    .from('users')
    .select('id')
    .eq('is_mis_executive', true)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (misErr || !misUser) return null; // no MIS executive configured — skip silently

  const [department_id, project_id, task_type_id] = await Promise.all([
    getOrCreate('departments', 'MIS Support'),
    getOrCreate('projects', 'Internal Support'),
    getOrCreate('task_types', 'Ticket Follow-up')
  ]);

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1); // default: next day

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .insert({
      department_id,
      project_id,
      task_type_id,
      assigned_to: misUser.id,
      assigned_by: ticket.raised_by,
      description: `[Ticket #${ticket.id}] ${ticket.category} issue raised by ${raisedByName}: ${ticket.description}`,
      target_date: targetDate.toISOString().slice(0, 10),
      priority: 'High',
      rescheduling_possible: true,
      status: 'Pending'
    })
    .select('id')
    .single();
  if (taskErr) throw taskErr;
  return task.id;
}

const TICKET_SELECT = `
  id, category, description, status, attachment_url, solution, solution_at, created_at,
  task:tasks ( id, description, project:projects ( id, name ) ),
  raised_by_user:users!tickets_raised_by_fkey ( id, full_name ),
  solved_by_user:users!tickets_solution_by_fkey ( id, full_name )
`;

// ─── Raise a ticket (anyone logged in) ───────────────────────────────────────
router.post('/', upload.single('media'), async (req, res) => {
  try {
    const { task_id, category, description } = req.body || {};
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Please describe the issue' });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Please select a category' });
    }

    let attachment_url = null;
    if (req.file) {
      attachment_url = await uploadFile(req.file, 'ticket-media');
    }

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        task_id: task_id || null,
        raised_by: req.user.id,
        category: category.trim(),
        description: description.trim(),
        attachment_url,
        status: 'Open'
      })
      .select(TICKET_SELECT)
      .single();

    if (error) throw error;

    // If ticket is linked to a task, update task status to 'Ticket Raised'
    if (task_id) {
      try {
        await supabase
          .from('tasks')
          .update({ status: 'Ticket Raised' })
          .eq('id', task_id);
      } catch (_) { /* non-critical — ticket is already saved */ }
    }

    // Technical / Access issues automatically spin up a follow-up task for
    // the MIS executive so it shows up in their normal task list — non-critical.
    if (MIS_TASK_CATEGORIES.has(category.trim())) {
      try {
        await createMisFollowUpTask(data, req.user.full_name || 'an employee');
      } catch (misErr) {
        console.error('MIS follow-up task error:', misErr.message);
      }
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Raise ticket error:', err.message);
    res.status(500).json({ error: err.message || 'Could not raise ticket' });
  }
});

// ─── List tickets ─────────────────────────────────────────────────────────────
// Admin / can_resolve_tickets → sees all tickets, every category
// is_mis_executive → sees ONLY Technical / Access category tickets
// Everyone else → sees only their own raised tickets
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let me = null;

    if (!isAdmin) {
      const { data, error: meErr } = await supabase
        .from('users')
        .select('can_resolve_tickets, is_mis_executive')
        .eq('id', req.user.id)
        .maybeSingle();
      if (meErr) throw meErr;
      me = data;
    }

    let query = supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .order('created_at', { ascending: false });

    if (isAdmin || me?.can_resolve_tickets) {
      // admin / general resolver — sees every ticket, no filter
    } else if (me?.is_mis_executive) {
      // MIS executive — only the categories they're responsible for
      query = query.in('category', ['Technical', 'Access']);
    } else {
      // everyone else — only the tickets they personally raised
      query = query.eq('raised_by', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('List tickets error:', err.message);
    res.status(500).json({ error: 'Could not load tickets' });
  }
});

// ─── Solve / resolve (admin always; others need can_resolve_tickets OR is_mis_executive) ────
router.patch('/:id/solve', async (req, res) => {
  try {
    // Admins bypass permission check; others need one of the resolver flags
    if (req.user.role !== 'admin') {
      const { data: me, error: meErr } = await supabase
        .from('users')
        .select('can_resolve_tickets, is_mis_executive')
        .eq('id', req.user.id)
        .maybeSingle();
      if (meErr) throw meErr;
      if (!me?.can_resolve_tickets && !me?.is_mis_executive) {
        return res.status(403).json({ error: 'You do not have permission to resolve tickets' });
      }
    }

    const { solution } = req.body || {};
    if (!solution || !solution.trim()) {
      return res.status(400).json({ error: 'Please provide a solution' });
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: 'Resolved',
        solution: solution.trim(),
        solution_by: req.user.id,
        solution_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select(TICKET_SELECT)
      .single();
    if (error) throw error;

    // Un-stick the linked task: it was pushed to 'Ticket Raised' when this
    // ticket was raised (which also blocks reschedule/verification on it —
    // see tasks.js). Now that this ticket is resolved, put it back to
    // 'In Progress', but only if no OTHER open ticket is still pointing at
    // the same task. Best-effort — must never fail the ticket resolution.
    const linkedTaskId = data.task?.id;
    if (linkedTaskId) {
      try {
        const { data: otherOpenTickets } = await supabase
          .from('tickets')
          .select('id')
          .eq('task_id', linkedTaskId)
          .eq('status', 'Open');
        if (!otherOpenTickets || otherOpenTickets.length === 0) {
          await supabase
            .from('tasks')
            .update({ status: 'In Progress' })
            .eq('id', linkedTaskId)
            .eq('status', 'Ticket Raised'); // don't clobber Completed/Rejected etc.
        }
      } catch (revertErr) {
        console.error('Revert task status after ticket solve error:', revertErr.message);
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Solve ticket error:', err.message);
    res.status(500).json({ error: 'Could not resolve ticket' });
  }
});

module.exports = router;
