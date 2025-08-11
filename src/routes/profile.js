import { Router } from 'express';
import { supabaseService } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/profile', requireAuth, async (req, res) => {
  const { data, error } = await supabaseService.from('user_profile_view').select('*').eq('id', req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

router.put('/profile', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length < 2) return res.status(400).json({ error: 'Name too short' });

  const { data, error } = await supabaseService
    .from('users')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: data });
});

export default router;
