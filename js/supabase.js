/**
 * supabase.js
 * AMS Pro — Supabase Client Configuration
 * 
 * This is the single source of truth for the Supabase connection.
 * All other JS modules import the `supabase` client from here.
 * 
 * SECURITY:
 * - Only the anon/publishable key is used here (safe for frontend)
 * - The service_role/secret key is NEVER used in frontend code
 * - Row Level Security (RLS) policies protect all data
 */

// ── Supabase Project Config ──────────────────────────────────────────────────
// Values from js/config.js (Netlify build) or local defaults
const ENV = window.AMS_ENV || {};
const SUPABASE_URL = ENV.supabaseUrl || 'https://nwdrnhjlvashisxgputy.supabase.co';
const SUPABASE_ANON_KEY = ENV.supabaseAnonKey || 'sb_publishable_JrqbhsjL5-pwu5PM6yCXhQ_a2rww6Jf';
const API_URL = (ENV.apiUrl || '').replace(/\/$/, '');

// ── Initialize Supabase Client ───────────────────────────────────────────────
// Uses the CDN-loaded supabase-js library (loaded in index.html)
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage so user stays logged in on refresh
    persistSession: true,
    // Auto-refresh the JWT token before it expires
    autoRefreshToken: true,
    // Detect session from URL (needed for password reset email links)
    detectSessionInUrl: true,
  },
  // Realtime config — used for notifications and live dashboard updates
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ── App Constants ────────────────────────────────────────────────────────────
const APP_CONFIG = {
  appName: 'AMS Pro',
  version: '2.0',
  company: 'Acme Corp Pvt. Ltd.',
  currency: '₹',
  currencyLocale: 'en-IN',
  // Pagination default
  pageSize: 20,
  // Roles (must match the `roles` table in Supabase)
  roles: {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    EMPLOYEE: 'Employee',
  },
  // Asset statuses
  assetStatus: {
    available:        'Available',
    inuse:            'In Use',
    repair:           'Under Repair',
    disposed:         'Disposed',
    reserved:         'Reserved',
    pending_approval: 'Pending Approval',
    rejected:         'Rejected',
  },
};

// ── Helper: Format currency ──────────────────────────────────────────────────
function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return APP_CONFIG.currency + Number(amount).toLocaleString(APP_CONFIG.currencyLocale);
}

// ── Helper: Format date ──────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── Helper: Time ago ─────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days < 7)   return `${days}d ago`;
  return formatDate(dateStr);
}

// ── Helper: Generate asset ID ─────────────────────────────────────────────────
function generateAssetId(seq) {
  return 'AST-' + String(seq).padStart(3, '0');
}

// ── Helper: Sanitize string (XSS prevention) ─────────────────────────────────
function sanitize(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// ── Helper: Debounce (for search inputs) ─────────────────────────────────────
function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Connection Test (runs once on page load) ──────────────────────────────────
async function testSupabaseConnection() {
  const status = { ok: false, auth: false, database: false, api: false, message: '' };

  try {
    // 0. Optional Render API health
    if (API_URL) {
      try {
        const apiRes = await fetch(`${API_URL}/api/health`);
        const apiJson = await apiRes.json().catch(() => ({}));
        status.api = apiRes.ok && apiJson.ok;
      } catch {
        status.api = false;
      }
    }

    // 1. Auth service health
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    status.auth = authRes.ok;

    // 2. Database REST API
    const { error } = await db.from('departments').select('id').limit(1);
    if (error && !['PGRST116', '42501'].includes(error.code)) {
      status.message = error.message;
      console.warn('[AMS] Supabase DB warning:', error.message);
    } else {
      status.database = true;
    }

    status.ok = status.auth && status.database;
    if (status.ok) {
      console.log('[AMS] ✅ Supabase connected — auth & database OK');
      if (API_URL) console.log(`[AMS] API (${API_URL}):`, status.api ? 'OK' : 'unreachable');
      status.message = status.api || !API_URL ? 'Connected' : 'Connected (API offline)';
    } else {
      console.warn('[AMS] ⚠️ Supabase partial connection:', status);
      status.message = status.auth ? 'Database limited' : 'Connection issue';
    }
  } catch (err) {
    status.message = err.message;
    console.error('[AMS] ❌ Supabase connection failed:', err.message);
  }

  window.AMS.connectionStatus = status;
  updateConnectionBadge(status);
  return status;
}

function updateConnectionBadge(status) {
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.textContent = status.ok ? '● Online' : '● Offline';
  el.style.color = status.ok ? '#10b981' : '#ef4444';
  el.title = status.message || (status.ok ? 'Backend connected' : 'Backend unreachable');
}

// Export so other modules can use
// (Using window globals since we're not using a bundler)
window.AMS = window.AMS || {};
window.AMS.db = db;
window.AMS.config = APP_CONFIG;
window.AMS.apiUrl = API_URL;
window.AMS.utils = {
  formatCurrency,
  formatDate,
  timeAgo,
  generateAssetId,
  sanitize,
  debounce,
};
window.AMS.testConnection = testSupabaseConnection;
