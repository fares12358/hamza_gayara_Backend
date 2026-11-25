import { env } from '../config/env.js';

/**
 * Needed only when the frontend uses a full API address (VITE_API_BASE_URL).
 * Allows the addresses in CLIENT_ORIGIN and no others.
 */
export function cors(req, res, next) {
  const origin = req.get('origin');
  res.vary('Origin');
  const allowed = Boolean(origin) && env.clientOrigins.includes(origin);

  if (allowed) {
    res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' });
  }
  // The browser asks first (preflight) before sending JSON to another address.
  if (req.method === 'OPTIONS' && allowed) {
    res.set({
      'Access-Control-Allow-Methods': 'GET,POST,PATCH',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    });
    return res.status(204).end();
  }
  next();
}
