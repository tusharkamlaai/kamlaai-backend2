// src/routes/auth.js
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { supabaseService } from '../lib/supabase.js';
import { signAppJwt } from '../utils/jwt.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

async function fetchUserInfoWithAccessToken(accessToken) {
  // Optional: validate the token is for your app
  try {
    const info = await googleClient.getTokenInfo(accessToken); // throws if invalid/expired
    if (!info || !info.aud) throw new Error('Invalid access token');
  } catch (e) {
    // Still try userinfo: some environments may not return aud here reliably
    // console.warn('TokenInfo check failed, proceeding to userinfo:', e?.message);
  }

  const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`userinfo fetch failed: ${resp.status} ${text}`);
  }
  // { sub, email, email_verified, name, picture, given_name, family_name }
  return await resp.json();
}

router.post('/google', async (req, res) => {
  try {
    const { idToken, accessToken } = req.body || {};
    if (!idToken && !accessToken) {
      return res.status(400).json({ error: 'Provide accessToken (preferred) or idToken' });
    }

    let email, nameFromGoogle, googleSub, pictureFromGoogle;

    if (accessToken) {
      const profile = await fetchUserInfoWithAccessToken(accessToken);
      email = profile.email?.toLowerCase();
      nameFromGoogle = profile.name || email?.split('@')[0] || 'User';
      googleSub = profile.sub || null;
      pictureFromGoogle = profile.picture || null;
    } else {
      // Fallback path: ID token only
      const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();
      email = payload.email?.toLowerCase();
      nameFromGoogle = payload.name || email?.split('@')[0] || 'User';
      googleSub = payload.sub || null;
      pictureFromGoogle = payload.picture || null;
    }

    if (!email) return res.status(400).json({ error: 'Google account email missing' });

    // Find existing user by email
    const { data: existing, error: fErr } = await supabaseService
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (fErr && fErr.code !== 'PGRST116') {
      console.error('Find user error:', fErr);
      return res.status(500).json({ error: fErr.message });
    }

    let user = existing;

    if (!user) {
      const id = uuidv4();
      const { data: created, error: iErr } = await supabaseService
        .from('users')
        .insert({
          id,
          email,
          name: nameFromGoogle,
          is_admin: false,
          google_id: googleSub,
          profile_picture_url: pictureFromGoogle || null // real Google picture if available
        })
        .select()
        .single();
      if (iErr) {
        console.error('Create user error:', iErr);
        return res.status(500).json({ error: iErr.message });
      }
      user = created;
    } else {
      const updates = {};
      // Always refresh Google picture if we have one and it's different
      if (pictureFromGoogle && pictureFromGoogle !== user.profile_picture_url) {
        updates.profile_picture_url = pictureFromGoogle;
      }
      // Keep google_id and name in sync if missing
      if (!user.google_id && googleSub) updates.google_id = googleSub;
      if ((!user.name || user.name.trim().length === 0) && nameFromGoogle) updates.name = nameFromGoogle;

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const { data: updated, error: uErr } = await supabaseService
          .from('users')
          .update(updates)
          .eq('id', user.id)
          .select()
          .single();
        if (uErr) {
          console.error('User update error:', uErr);
        } else if (updated) {
          user = updated;
        }
      }
    }

    const token = signAppJwt({ sub: user.id, email: user.email, role: user.is_admin ? 'admin' : 'user' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.is_admin,
        profile_picture_url: user.profile_picture_url
      }
    });
  } catch (e) {
    console.error('Google auth error:', e);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// Admin login + /me unchanged...
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  if (email.toLowerCase() !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const { data: existing, error: fErr } = await supabaseService
    .from('users')
    .select('*')
    .eq('email', env.ADMIN_EMAIL)
    .single();

  let adminUser = existing;
  if (fErr && fErr.code !== 'PGRST116') return res.status(500).json({ error: fErr.message });
  if (!adminUser) {
    const id = uuidv4();
    const { data: created, error: iErr } = await supabaseService
      .from('users')
      .insert({ id, email: env.ADMIN_EMAIL, name: 'Admin', is_admin: true })
      .select()
      .single();
    if (iErr) return res.status(500).json({ error: iErr.message });
    adminUser = created;
  } else if (!adminUser.is_admin) {
    await supabaseService.from('users').update({ is_admin: true }).eq('id', adminUser.id);
  }

  const token = signAppJwt({ sub: adminUser.id, email: adminUser.email, role: 'admin' });
  res.json({ token, user: { id: adminUser.id, email: adminUser.email, name: adminUser.name, is_admin: true } });
});

router.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await supabaseService
    .from('users')
    .select('id,name,email,is_admin,profile_picture_url,created_at,updated_at')
    .eq('id', req.user.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: data });
});

export default router;
