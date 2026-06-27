/**
 * AMS Pro — Backend Integration Test
 * Run: node test-backend.js
 */
const SUPABASE_URL = 'https://nwdrnhjlvashisxgputy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_JrqbhsjL5-pwu5PM6yCXhQ_a2rww6Jf';

const ADMIN_EMAIL = 'admin@acme.in';
const ADMIN_PASSWORD = 'Admin@123456';

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  ✅ ${name}`); }
function fail(name, err) { failed++; console.log(`  ❌ ${name}: ${err}`); }

async function api(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { res, json };
}

async function run() {
  console.log('\n🔌 AMS Pro Backend Tests\n');

  // 1. Auth health
  try {
    const { res } = await api('/auth/v1/health');
    res.ok ? ok('Auth service reachable') : fail('Auth service', `HTTP ${res.status}`);
  } catch (e) { fail('Auth service', e.message); }

  // 2. Public DB (departments — readable without auth in some configs)
  try {
    const { res, json } = await api('/rest/v1/departments?select=id,name&limit=1');
    if (res.ok && Array.isArray(json)) ok('REST API reachable');
    else fail('REST API', json?.message || `HTTP ${res.status}`);
  } catch (e) { fail('REST API', e.message); }

  // 3. Admin login
  let token;
  try {
    const { res, json } = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (res.ok && json.access_token) {
      token = json.access_token;
      ok(`Admin login (${ADMIN_EMAIL})`);
    } else {
      fail('Admin login', json.error_description || json.msg || `HTTP ${res.status}`);
    }
  } catch (e) { fail('Admin login', e.message); }

  if (!token) {
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
    process.exit(1);
  }

  const authHdr = { Authorization: `Bearer ${token}` };

  // 4. Profiles
  try {
    const { res, json } = await api('/rest/v1/profiles?select=id,email,role&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json) && json.length > 0) ok(`Profiles loaded (${json.length} rows)`);
    else fail('Profiles', json?.message || 'empty or error');
  } catch (e) { fail('Profiles', e.message); }

  // 5. Assets
  try {
    const { res, json } = await api('/rest/v1/assets?select=id,asset_code,status&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json)) ok(`Assets loaded (${json.length} rows)`);
    else fail('Assets', json?.message || 'error');
  } catch (e) { fail('Assets', e.message); }

  // 6. Departments
  try {
    const { res, json } = await api('/rest/v1/departments?select=id,name&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json) && json.length > 0) ok(`Departments loaded (${json.length} rows)`);
    else fail('Departments', json?.message || 'error');
  } catch (e) { fail('Departments', e.message); }

  // 7. Vendors
  try {
    const { res, json } = await api('/rest/v1/vendors?select=id,name&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json)) ok(`Vendors loaded (${json.length} rows)`);
    else fail('Vendors', json?.message || 'error');
  } catch (e) { fail('Vendors', e.message); }

  // 8. Allocations
  try {
    const { res, json } = await api('/rest/v1/allocations?select=id,is_active&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json)) ok(`Allocations loaded (${json.length} rows)`);
    else fail('Allocations', json?.message || 'error');
  } catch (e) { fail('Allocations', e.message); }

  // 9. Maintenance
  try {
    const { res, json } = await api('/rest/v1/maintenance?select=id,status&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json)) ok(`Maintenance loaded (${json.length} rows)`);
    else fail('Maintenance', json?.message || 'error');
  } catch (e) { fail('Maintenance', e.message); }

  // 10. Audit logs
  try {
    const { res, json } = await api('/rest/v1/audit_logs?select=id,action&limit=5', { headers: authHdr });
    if (res.ok && Array.isArray(json)) ok(`Audit logs loaded (${json.length} rows)`);
    else fail('Audit logs', json?.message || 'error');
  } catch (e) { fail('Audit logs', e.message); }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
