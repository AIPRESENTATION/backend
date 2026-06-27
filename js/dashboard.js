/**
 * dashboard.js
 * AMS Pro — Dashboard Module
 * 
 * Loads live data from Supabase for:
 * - Stat cards (total, available, in-use, repair, disposed)
 * - Donut chart distribution
 * - Category breakdown bars
 * - Recent assets table
 * - Recent activity feed
 * - Warranty expiry alert
 * 
 * DEPENDS ON: supabase.js
 */

// ── Load all dashboard data ───────────────────────────────────────────────────
async function loadDashboard() {
  try {
    await Promise.all([
      loadDashboardStats(),
      loadRecentAssets(),
      loadRecentActivity(),
      loadCategoryBreakdown(),
      loadWarrantyAlerts(),
    ]);
  } catch (err) {
    console.error('[Dashboard] Load error:', err);
    toast('error', 'Dashboard Error', 'Failed to load some dashboard data.');
  }
}

// ── Stat Cards ────────────────────────────────────────────────────────────────
async function loadDashboardStats() {
  const { data, error } = await window.AMS.db
    .from('assets')
    .select('status');

  if (error) {
    console.error('[Dashboard] Stats error:', error.message);
    return;
  }

  const total = data.length;
  const cnt = { available: 0, inuse: 0, repair: 0, disposed: 0 };
  data.forEach(a => {
    if (cnt[a.status] !== undefined) cnt[a.status]++;
  });

  const el = id => document.getElementById(id);
  const pct = v => total > 0 ? Math.round((v / total) * 100) + '%' : '0%';

  // Stat card values
  if (el('stat-total'))     el('stat-total').textContent     = total;
  if (el('stat-available')) el('stat-available').textContent = cnt.available;
  if (el('stat-inuse'))     el('stat-inuse').textContent     = cnt.inuse;
  if (el('stat-repair'))    el('stat-repair').textContent    = cnt.repair;
  if (el('stat-disposed'))  el('stat-disposed').textContent  = cnt.disposed;

  // Progress bars
  if (el('sbar-available')) el('sbar-available').style.width = pct(cnt.available);
  if (el('sbar-inuse'))     el('sbar-inuse').style.width     = pct(cnt.inuse);
  if (el('sbar-repair'))    el('sbar-repair').style.width    = pct(cnt.repair);
  if (el('sbar-disposed'))  el('sbar-disposed').style.width  = pct(cnt.disposed);

  // Sidebar badge
  if (el('sb-badge')) el('sb-badge').textContent = total;

  // Filter chip counts
  if (el('chip-cnt-all'))       el('chip-cnt-all').textContent       = `(${total})`;
  if (el('chip-cnt-available')) el('chip-cnt-available').textContent = `(${cnt.available})`;
  if (el('chip-cnt-inuse'))     el('chip-cnt-inuse').textContent     = `(${cnt.inuse})`;
  if (el('chip-cnt-repair'))    el('chip-cnt-repair').textContent    = `(${cnt.repair})`;
  if (el('chip-cnt-disposed'))  el('chip-cnt-disposed').textContent  = `(${cnt.disposed})`;

  // Donut chart legend
  const pctNum = v => total > 0 ? Math.round((v / total) * 100) + '%' : '0%';
  if (el('donut-total'))         el('donut-total').textContent         = total;
  if (el('donut-pct-inuse'))     el('donut-pct-inuse').textContent     = pctNum(cnt.inuse);
  if (el('donut-pct-available')) el('donut-pct-available').textContent = pctNum(cnt.available);
  if (el('donut-pct-repair'))    el('donut-pct-repair').textContent    = pctNum(cnt.repair);
  if (el('donut-pct-disposed'))  el('donut-pct-disposed').textContent  = pctNum(cnt.disposed);

  // Update donut chart SVG segments
  updateDonutChart(cnt, total);
}

// ── Donut Chart SVG Update ────────────────────────────────────────────────────
function updateDonutChart(cnt, total) {
  if (total === 0) return;
  const circumference = 2 * Math.PI * 48; // r=48

  const segments = [
    { key: 'inuse',     color: 'var(--purple)' },
    { key: 'available', color: 'var(--green)'  },
    { key: 'repair',    color: 'var(--yellow)' },
    { key: 'disposed',  color: 'var(--red)'    },
  ];

  let offset = 0;
  const circles = document.querySelectorAll('#page-dashboard svg circle[stroke]');
  // circles[0] is the background ring — skip it
  segments.forEach((seg, i) => {
    const circle = circles[i + 1];
    if (!circle) return;
    const len = (cnt[seg.key] / total) * circumference;
    circle.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${(circumference - len).toFixed(1)}`);
    circle.setAttribute('stroke-dashoffset', (-offset).toFixed(1));
    offset += len;
  });
}

// ── Recent Assets Table ───────────────────────────────────────────────────────
async function loadRecentAssets() {
  const { data, error } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name, status, department_id, assigned_to, category_id')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    console.error('[Dashboard] Recent assets error:', error.message);
    return;
  }

  // Find the recent assets table on the dashboard page
  const table = document.querySelector('#page-dashboard tbody');
  if (!table) return;

  const { sanitize } = window.AMS.utils;

  // Resolve department and assigned-to names separately to avoid join ambiguity
  const deptIds    = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const profileIds = [...new Set(data.map(a => a.assigned_to).filter(Boolean))];

  const [deptRes, profileRes] = await Promise.all([
    deptIds.length
      ? window.AMS.db.from('departments').select('id,name').in('id', deptIds)
      : { data: [] },
    profileIds.length
      ? window.AMS.db.from('profiles').select('id,full_name').in('id', profileIds)
      : { data: [] },
  ]);

  const deptMap    = Object.fromEntries((deptRes.data    || []).map(d => [d.id, d.name]));
  const profileMap = Object.fromEntries((profileRes.data || []).map(p => [p.id, p.full_name]));

  table.innerHTML = data.map(a => `
    <tr>
      <td><b>${sanitize(a.name)}</b></td>
      <td class="mono">${sanitize(a.asset_code)}</td>
      <td>${sanitize(profileMap[a.assigned_to] || '—')}</td>
      <td>${sanitize(deptMap[a.department_id]  || '—')}</td>
      <td><span class="badge badge-${a.status}">${window.AMS.config.assetStatus[a.status] || a.status}</span></td>
    </tr>
  `).join('');
}

// ── Recent Activity Feed ──────────────────────────────────────────────────────
async function loadRecentActivity() {
  const { data, error } = await window.AMS.db
    .from('audit_logs')
    .select('id, action, description, user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[Dashboard] Activity error:', error.message);
    return;
  }

  const container = document.querySelector('#page-dashboard .af-item')?.parentElement;
  if (!container) return;

  const { timeAgo, sanitize } = window.AMS.utils;

  // Map action types to colors and emoji tags
  const actionMeta = {
    CREATE:  { color: 'var(--accent)',  tag: '📦 Registration' },
    UPDATE:  { color: 'var(--yellow)',  tag: '✏️ Update'       },
    DELETE:  { color: 'var(--red)',     tag: '🗑️ Deletion'     },
    LOGIN:   { color: 'var(--green)',   tag: '🔐 Login'        },
    LOGOUT:  { color: 'var(--text3)',   tag: '🔓 Logout'       },
    ASSIGN:  { color: 'var(--green)',   tag: '🏷 Assignment'   },
    RETURN:  { color: 'var(--teal)',    tag: '↩ Return'        },
    DISPOSE: { color: 'var(--red)',     tag: '🗑️ Disposal'     },
    MAINT:   { color: 'var(--yellow)',  tag: '🔧 Maintenance'  },
    EXPORT:  { color: 'var(--accent)',  tag: '⬇ Export'       },
  };

  container.innerHTML = data.map((log, idx) => {
    const meta = actionMeta[log.action] || { color: 'var(--text3)', tag: '📋 Action' };
    const isLast = idx === data.length - 1;
    return `
      <div class="af-item">
        <div class="af-dc">
          <div class="af-dot" style="background:${meta.color}"></div>
          ${!isLast ? '<div class="af-line"></div>' : ''}
        </div>
        <div>
          <div class="af-txt">${sanitize(log.description)}</div>
          <div class="af-meta">
            <span class="af-time">${timeAgo(log.created_at)}</span>
            <span class="af-tag">${meta.tag}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Category Breakdown ────────────────────────────────────────────────────────
async function loadCategoryBreakdown() {
  const { data, error } = await window.AMS.db
    .from('assets')
    .select('category_id');
  if (error) { console.error('[Dashboard] Category error:', error.message); return; }

  const catIds = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const { data: catData } = catIds.length
    ? await window.AMS.db.from('asset_categories').select('id,name').in('id', catIds)
    : { data: [] };
  const catNameMap = Object.fromEntries((catData || []).map(c => [c.id, c.name]));

  // Count per category
  const counts = {};
  data.forEach(a => {
    const name = catNameMap[a.category_id] || 'Other';
    counts[name] = (counts[name] || 0) + 1;
  });

  // Sort by count descending, take top 5
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const max = sorted[0]?.[1] || 1;
  const colors = ['var(--accent)', 'var(--purple)', 'var(--teal)', 'var(--orange)', 'var(--yellow)'];

  // Find the "By Category" card body
  const catCard = Array.from(document.querySelectorAll('#page-dashboard .card-title'))
    .find(el => el.textContent.trim() === 'By Category')
    ?.closest('.card')
    ?.querySelector('.card-body');

  if (!catCard) return;

  catCard.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:9px">
      ${sorted.map(([name, count], i) => `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span>${sanitize(name)}</span><b>${count}</b>
          </div>
          <div class="prog">
            <div class="prog-f" style="width:${Math.round((count/max)*100)}%;background:${colors[i]}"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Warranty Alerts ───────────────────────────────────────────────────────────
async function loadWarrantyAlerts() {
  // Find assets whose warranty expires within 30 days
  const today = new Date();
  const in30  = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name, warranty_end')
    .not('warranty_end', 'is', null)
    .lte('warranty_end', in30.toISOString().slice(0, 10))
    .gte('warranty_end', today.toISOString().slice(0, 10))
    .eq('status', 'inuse');

  if (error) {
    console.error('[Dashboard] Warranty alert error:', error.message);
    return;
  }

  // Update the alert banner
  const alertBanner = document.querySelector('#page-dashboard .alert-warn');
  if (!alertBanner) return;

  if (data.length === 0) {
    alertBanner.style.display = 'none';
    return;
  }

  alertBanner.style.display = 'flex';
  alertBanner.innerHTML = `
    ⚠️ <b>${data.length} warrant${data.length === 1 ? 'y' : 'ies'}</b> expiring within 30 days
    <span style="margin-left:auto;cursor:pointer;text-decoration:underline" onclick="nav('reports')">Review →</span>
  `;
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadDashboard = loadDashboard;
window.AMS.dashboard = { loadDashboard };
