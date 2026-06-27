/**
 * Netlify build — inject env vars into js/config.js for production
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nwdrnhjlvashisxgputy.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_JrqbhsjL5-pwu5PM6yCXhQ_a2rww6Jf';
const API_URL = (process.env.API_URL || process.env.RENDER_API_URL || '').replace(/\/$/, '');

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
if (API_URL) console.log('[build] API_URL:', API_URL);
else console.warn('[build] API_URL not set — frontend will use Supabase directly');
