import { Router } from 'express';
import { supabaseService } from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabaseService
    .from('users')
    .select('id,name,email,is_admin,created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data });
});

router.get('/applications', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabaseService
    .from('applications_admin_view')
    .select('*')
    .order('applied_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ applications: data });
});

router.patch('/applications/:id', requireAuth, requireAdmin, async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  if (!['pending', 'reviewed', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const { data, error } = await supabaseService
    .from('applications')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ application: data });
});

router.get('/stats', requireAuth, requireAdmin, async (_req, res) => {
  const { data, error } = await supabaseService.rpc('stats_overview');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// Add this to src/routes/admin.js
router.get('/applications/:id', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabaseService
    .from('applications_admin_view') // Reuse the existing view
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Application not found' });
  res.json({ application: data });
});

export default router;
