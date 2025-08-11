import { verifyAppJwt } from '../utils/jwt.js';

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = verifyAppJwt(token);
    req.user = { id: decoded.sub, email: decoded.email, role: decoded.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(_req, res, next) {
  if (!_req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (_req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  return next();
}
