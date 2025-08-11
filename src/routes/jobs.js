import { Router } from 'express';
import { z } from 'zod';
import { supabaseAnon, supabaseService } from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public active jobs
router.get('/', async (_req, res) => {
  const { data, error } = await supabaseAnon.from('jobs_public').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ jobs: data });
});

// Get single job (admin can see inactive)
router.get('/:id', requireAuth, async (req, res) => {
  const table = req.user.role === 'admin' ? 'jobs' : 'jobs_public';
  const { data, error } = await supabaseService.from(table).select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Job not found' });
  res.json({ job: data });
});

// Admin create
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const Schema = z.object({
    title: z.string().min(2),
    description: z.string().min(10),
    requirements: z.string().min(1),
    skills: z.string().optional(),
    location: z.string().min(1),
    salary_range: z.string().optional(),
    is_active: z.boolean().default(true),
    qualifications: z.string().min(2),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const payload = { ...parsed.data, posted_by: req.user.id };
  const { data, error } = await supabaseService.from('jobs').insert(payload).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ job: data });
});

// Admin update
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabaseService
    .from('jobs')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ job: data });
});

// Admin delete
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabaseService.from('jobs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Admin toggle status
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { is_active } = req.body || {};
  const { data, error } = await supabaseService
    .from('jobs')
    .update({ is_active: !!is_active, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ job: data });
});

// Admin list all jobs
router.get('/admin/all/list', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabaseService.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ jobs: data });
});

export default router;
