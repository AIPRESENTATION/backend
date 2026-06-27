/**
 * AMS Pro API — Express backend for Render
 * Database/auth: Supabase (hosted separately)
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const corsOptions = FRONTEND_URL
  ? { origin: [FRONTEND_URL, FRONTEND_URL.replace(/\/$/, '')], credentials: true }
  : { origin: true };

app.use(cors(corsOptions));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'AMS Pro API',
    version: '2.0.0',
    status: 'running',
    endpoints: ['/health', '/api/health', '/api/config'],
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/** Public config for the Netlify frontend (anon key only — safe for browsers) */
app.get('/api/config', (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({
      error: 'Server not configured',
      message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY on Render',
    });
  }
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    appName: 'AMS Pro',
    version: '2.0.0',
  });
});

/** Full backend connectivity check (Supabase auth + REST) */
app.get('/api/health', async (_req, res) => {
  const result = { ok: false, auth: false, database: false, message: '' };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    result.message = 'Missing SUPABASE_URL or SUPABASE_ANON_KEY';
    return res.status(503).json(result);
  }

  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    result.auth = authRes.ok;

    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/departments?select=id&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    result.database = dbRes.ok;
    result.ok = result.auth && result.database;
    result.message = result.ok ? 'Connected' : 'Partial connection';
    res.status(result.ok ? 200 : 503).json(result);
  } catch (err) {
    result.message = err.message;
    res.status(503).json(result);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`[AMS Pro API] Listening on port ${PORT}`);
  if (FRONTEND_URL) console.log(`[AMS Pro API] CORS allowed for: ${FRONTEND_URL}`);
});
