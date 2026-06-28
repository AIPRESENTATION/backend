/**
 * Netlify build — inject env vars into js/config.js for production
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'https://nwdrnhjlvashisxgputy.supabase.co';
const DEFAULT_KEY = 'sb_publishable_JrqbhsjL5-pwu5PM6yCXhQ_a2rww6Jf';
const DEFAULT_API = 'https://ams-pro-api.onrender.com';

function resolveEnv(name, fallback) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  // Netlify mistake: value is the variable name, not the secret
  if (raw === name || raw.startsWith('SUPABASE_') && raw.endsWith('_KEY') && raw.length < 40) {
    console.warn(`[build] ${name} looks like a placeholder ("${raw}") — using default`);
    return fallback;
  }
  if (raw.length < 20 && name.includes('KEY')) {
    console.warn(`[build] ${name} too short — using default`);
    return fallback;
  }
  return raw;
}

const SUPABASE_URL = resolveEnv('SUPABASE_URL', DEFAULT_URL);
const SUPABASE_ANON_KEY = resolveEnv('SUPABASE_ANON_KEY', DEFAULT_KEY);
const API_URL = resolveEnv('API_URL', resolveEnv('RENDER_API_URL', DEFAULT_API)).replace(/\/$/, '');

const config = `/**
 * AMS Pro runtime config — generated at build time (Netlify)
 * Do not edit manually in production.
 */
window.AMS_ENV = {
  supabaseUrl: ${JSON.stringify(SUPABASE_URL)},
  supabaseAnonKey: ${JSON.stringify(SUPABASE_ANON_KEY)},
  apiUrl: ${JSON.stringify(API_URL)},
};
`;

const out = path.join(__dirname, '..', 'js', 'config.js');
fs.writeFileSync(out, config, 'utf8');
console.log('[build] Wrote js/config.js');
console.log('[build] API_URL:', API_URL);
console.log('[build] Supabase key length:', SUPABASE_ANON_KEY.length);
