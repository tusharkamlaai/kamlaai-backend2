import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// sub = user.id (uuid), role = 'user' | 'admin'
export function signAppJwt({ sub, email, role = 'user' }) {
  return jwt.sign({ sub, email, role }, env.SUPABASE_JWT_SECRET, { expiresIn: '7d' });
}
export function verifyAppJwt(token) {
  return jwt.verify(token, env.SUPABASE_JWT_SECRET);
}
