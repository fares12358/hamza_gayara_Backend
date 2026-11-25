/**
 * Entry point on Vercel. There is no app.listen() here: Vercel calls this
 * function for every request. Locally and on a normal server use src/server.js.
 */
import { env } from '../src/config/env.js';
import { connectDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';

const app = createApp();
let connection;

// One connection per running instance, reused between requests.
function connectOnce() {
  connection ??= connectDatabase(env.MONGODB_URI).catch((error) => {
    connection = undefined; // try again on the next request
    throw error;
  });
  return connection;
}

export default async function handler(req, res) {
  try {
    await connectOnce();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'DB_UNAVAILABLE', message: 'قاعدة البيانات مش متاحة دلوقتي' } }));
    return;
  }
  app(req, res);
}
