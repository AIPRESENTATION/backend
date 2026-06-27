/**
 * reports.js
 * AMS Pro — Reports, Audit Logs & Notifications Module
 *
 * Handles:
 * - Audit log table with pagination
 * - Notifications list
 * - Report cards (export triggers)
 * - Depreciation calculations
 *
 * DEPENDS ON: supabase.js, auth.js
 */

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

async function loadAuditLogs(page = 1) {
  const tbody = document.getElementById('auditTbody') || document.querySelector('#page-audit tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text3)">⏳ Loading audit logs…</td></tr>`;

  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const { data, error, count } = await window.AMS.db
    .from('audit_logs')
    .select('id, action, entity, entity_id, description, user_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--red);padding:24px">❌ ${error.message}</td></tr>`;
    return;
  }

  // Resolve user names
  const userIds = [...new Set((data || []).map(l => l.user_id).filter(Boolean))];
  const { data: userData } = userIds.length
    ? await window.AMS.db.from('profiles').select('id,full_name').in('id', userIds)
    : { data: [] };
  const userMap = Object.fromEntries((userData || []).map(u => [u.id, u.full_name]));

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">📋</div>No audit logs yet
    </td></tr>`;
    return;
  }

  const { sanitize, formatDate, timeAgo } = window.AMS.utils;

  const actionColors = {
    CREATE:  'var(--accent)', UPDATE: 'var(--yellow)', DELETE: 'var(--red)',
    LOGIN:   'var(--green)',  LOGOUT: 'var(--text3)',  ASSIGN: 'var(--green)',
    RETURN:  'var(--teal)',   MAINT:  'var(--yellow)', EXPORT: 'var(--purple)',
    DISPOSE: 'var(--red)',
  };

  tbody.innerHTML = data.map(log => {
    const color = actionColors[log.action] || 'var(--text3)';
    return `
      <tr>
        <td style="font-size:11px;color:var(--text3)">${timeAgo(log.created_at)}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700">
            <span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>
            ${sanitize(log.action)}
          </span>
        </td>
        <td style="font-size:12px">${sanitize(log.entity || '—')}</td>
        <td style="font-size:12px">${sanitize(log.description || '—')}</td>
        <td style="font-size:12px">${sanitize(userMap[log.user_id] || 'System')}</td>
        <td style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text3)">${log.entity_id ? log.entity_id.slice(0, 8) + '…' : '—'}</td>
      </tr>
    `;
  }).join('');

  // Pagination
  renderAuditPagination(page, Math.ceil((count || 0) / pageSize), count || 0, pageSize);
}

function renderAuditPagination(current, totalPages, totalCount, pageSize) {
  let pager = document.getElementById('auditPager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'auditPager';
    pager.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 18px;font-size:12px;color:var(--text2)';
    document.querySelector('#page-audit .card')?.appendChild(pager);
  }

  if (totalPages <= 1) { pager.innerHTML = ''; return; }

  pager.innerHTML = `
    <span>Showing ${((current-1)*pageSize)+1}–${Math.min(current*pageSize, totalCount)} of ${totalCount} logs</span>
    <div style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-xs" ${current===1?'disabled':''} onclick="loadAuditLogs(${current-1})">‹ Prev</button>
      <span style="padding:0 10px;display:flex;align-items:center">${current} / ${totalPages}</span>
      <button class="btn btn-ghost btn-xs" ${current===totalPages?'disabled':''} onclick="loadAuditLogs(${current+1})">Next ›</button>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

async function loadNotifications() {
  const container = document.getElementById('notifContainer');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center;padding:28px;color:var(--text3)">⏳ Loading…</div>`;

  const currentUser = window.AMS.auth.getCurrentUser();
  if (!currentUser) return;

  const { data, error } = await window.AMS.db
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    container.innerHTML = `<div style="text-align:center;color:var(--red);padding:24px">❌ ${error.message}</div>`;
    return;
  }

  // Update notification badge count
  const unreadCount = (data || []).filter(n => !n.is_read).length;
  const badge = document.querySelector('.topbar .ndot');
  if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';
  const notifBadge = document.querySelector('#n-notifications .nbadge');
  if (notifBadge) notifBadge.textContent = unreadCount > 0 ? unreadCount : '';

  if (!data || data.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:10px">🔔</div>
      <b>No notifications</b><br>
      <div style="font-size:12px;margin-top:4px">You're all caught up!</div>
    </div>`;
    return;
  }

  const { sanitize, timeAgo } = window.AMS.utils;

  const typeIcons = {
    warranty:    '⚠️',
    maintenance: '🔧',
    assignment:  '📦',
    return:      '↩',
    system:      'ℹ️',
    alert:       '🚨',
  };

  container.innerHTML = data.map(n => `
    <div class="af-item" style="opacity:${n.is_read ? 0.6 : 1}">
      <div class="af-dc">
        <div class="af-dot" style="background:${n.is_read ? 'var(--text3)' : 'var(--accent)'}"></div>
        <div class="af-line"></div>
      </div>
      <div style="flex:1">
        <div class="af-txt">
          ${typeIcons[n.type] || '🔔'} <b>${sanitize(n.title)}</b>
          ${!n.is_read ? '<span style="font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:99px;margin-left:6px">NEW</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">${sanitize(n.message || '')}</div>
        <div class="af-meta">
          <span class="af-time">${timeAgo(n.created_at)}</span>
          ${!n.is_read
            ? `<button class="btn btn-ghost btn-xs" style="height:20px;padding:0 7px;font-size:10px"
                onclick="markNotificationRead('${n.id}')">Mark Read</button>`
            : ''}
        </div>
      </div>
    </div>
  `).join('');

  // Mark all as read button logic
  const markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) markAllBtn.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
}

async function markNotificationRead(notifId) {
  await window.AMS.db
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId);

  await loadNotifications();
}

async function markAllNotificationsRead() {
  const currentUser = window.AMS.auth.getCurrentUser();
  if (!currentUser) return;

  await window.AMS.db
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', currentUser.id)
    .eq('is_read', false);

  await loadNotifications();
  toast('success', 'All Read', 'All notifications marked as read.');
}

// ── Subscribe to realtime notifications ───────────────────────────────────────
function subscribeToNotifications() {
  const currentUser = window.AMS.auth.getCurrentUser();
  if (!currentUser) return;

  window.AMS.db
    .channel('notifications')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'notifications',
      filter: `user_id=eq.${currentUser.id}`,
    }, (payload) => {
      // Show toast for new notification
      toast('info', payload.new.title, payload.new.message);
      // Refresh notification count
      loadNotifications();
    })
    .subscribe();
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPRECIATION
// ══════════════════════════════════════════════════════════════════════════════

async function loadDepreciation() {
  const tbody = document.getElementById('deprTbody') || document.querySelector('#page-depreciation tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text3)">⏳ Loading…</td></tr>`;

  // Get assets with purchase value and date
  const { data, error } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name, purchase_value, purchase_date, status, category_id')
    .not('purchase_value', 'is', null)
    .not('purchase_date', 'is', null)
    .neq('status', 'disposed')
    .order('purchase_value', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red);padding:24px">❌ ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">No depreciation data available</td></tr>`;
    return;
  }

  // Resolve category names and depreciation rates
  const deprCatIds = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const { data: deprCatData } = deprCatIds.length
    ? await window.AMS.db.from('asset_categories').select('id,name,depreciation_rate').in('id', deprCatIds)
    : { data: [] };
  const deprCatMap = Object.fromEntries((deprCatData || []).map(c => [c.id, c]));

  const { sanitize, formatDate, formatCurrency } = window.AMS.utils;
  const today = new Date();

  tbody.innerHTML = data.map(a => {
    const purchaseDate  = new Date(a.purchase_date);
    const ageYears      = (today - purchaseDate) / (1000 * 60 * 60 * 24 * 365.25);
    // Straight-line depreciation rate from category, default 20% per year
    const deprRate      = deprCatMap[a.category_id]?.depreciation_rate || 20;
    const totalDeprPct  = Math.min(ageYears * deprRate, 100);
    const originalValue = Number(a.purchase_value);
    const deprAmount    = originalValue * (totalDeprPct / 100);
    const currentValue  = Math.max(originalValue - deprAmount, 0);
    const pctRemaining  = 100 - totalDeprPct;

    const barColor = pctRemaining > 60 ? 'var(--green)'
                   : pctRemaining > 30 ? 'var(--yellow)'
                   : 'var(--red)';

    return `
      <tr>
        <td class="mono">${sanitize(a.asset_code)}</td>
        <td><b>${sanitize(a.name)}</b></td>
        <td>${sanitize(deprCatMap[a.category_id]?.name || '—')}</td>
        <td>${formatDate(a.purchase_date)}</td>
        <td>${formatCurrency(originalValue)}</td>
        <td>${formatCurrency(Math.round(currentValue))}</td>
        <td>
          <div class="db-wrap">
            <div style="flex:1">
              <div class="prog">
                <div class="prog-f" style="width:${pctRemaining.toFixed(0)}%;background:${barColor}"></div>
              </div>
            </div>
            <span class="db-pct" style="color:${barColor}">${pctRemaining.toFixed(0)}%</span>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text3)">${deprRate}% p.a.</td>
      </tr>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════════════════

async function runReport(reportType) {
  if (!window.AMS.permissions?.requirePermission('export_reports', 'Export reports')) return;

  toast('info', 'Generating Report', 'Preparing your report…');

  switch (reportType) {
    case 'asset_summary':    return exportAssetSummaryReport();
    case 'allocation':       return exportAllocationReport();
    case 'maintenance':      return exportMaintenanceReport();
    case 'warranty_expiry':  return exportWarrantyReport();
    case 'depreciation':     return exportDepreciationReport();
    default:
      toast('warning', 'Coming Soon', `"${reportType}" report will be available soon.`);
  }
}

async function exportAssetSummaryReport() {
  const { data } = await window.AMS.db
    .from('assets')
    .select('asset_code,name,serial_number,purchase_date,purchase_value,warranty_end,status,asset_tag,notes,category_id,department_id,assigned_to')
    .order('asset_code');
  if (!data) return;

  // Resolve names
  const catIds2  = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const deptIds2 = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const pIds2    = [...new Set(data.map(a => a.assigned_to).filter(Boolean))];
  const [cr, dr, pr] = await Promise.all([
    catIds2.length  ? window.AMS.db.from('asset_categories').select('id,name').in('id', catIds2)       : { data: [] },
    deptIds2.length ? window.AMS.db.from('departments').select('id,name').in('id', deptIds2)           : { data: [] },
    pIds2.length    ? window.AMS.db.from('profiles').select('id,full_name').in('id', pIds2)            : { data: [] },
  ]);
  const cm = Object.fromEntries((cr.data || []).map(x => [x.id, x.name]));
  const dm = Object.fromEntries((dr.data || []).map(x => [x.id, x.name]));
  const pm = Object.fromEntries((pr.data || []).map(x => [x.id, x.full_name]));

  downloadCSV(data.map(a => ({
    'Asset ID':      a.asset_code,
    'Name':          a.name,
    'Category':      cm[a.category_id] || '',
    'Serial No':     a.serial_number || '',
    'Department':    dm[a.department_id] || '',
    'Assigned To':   pm[a.assigned_to] || '',
    'Purchase Date': a.purchase_date || '',
    'Warranty End':  a.warranty_end || '',
    'Value':         a.purchase_value || 0,
    'Status':        a.status,
    'Asset Tag':     a.asset_tag || '',
    'Notes':         a.notes || '',
  })), 'asset_summary_report');
}

async function exportAllocationReport() {
  const { data } = await window.AMS.db
    .from('allocations')
    .select('issue_date,return_date,is_active,condition_on_issue,condition_on_return,asset_id,assigned_to')
    .order('issue_date', { ascending: false });
  if (!data) return;

  const aIds = [...new Set(data.map(r => r.asset_id).filter(Boolean))];
  const pIds = [...new Set(data.map(r => r.assigned_to).filter(Boolean))];
  const [ar2, pr2] = await Promise.all([
    aIds.length ? window.AMS.db.from('assets').select('id,asset_code,name').in('id', aIds)     : { data: [] },
    pIds.length ? window.AMS.db.from('profiles').select('id,full_name').in('id', pIds)          : { data: [] },
  ]);
  const am  = Object.fromEntries((ar2.data || []).map(x => [x.id, x]));
  const pm2 = Object.fromEntries((pr2.data || []).map(x => [x.id, x.full_name]));

  downloadCSV(data.map(r => ({
    'Asset Code':    am[r.asset_id]?.asset_code || '',
    'Asset Name':    am[r.asset_id]?.name || '',
    'Assigned To':   pm2[r.assigned_to] || '',
    'Issue Date':    r.issue_date || '',
    'Return Date':   r.return_date || '',
    'Status':        r.is_active ? 'Active' : 'Returned',
    'Condition In':  r.condition_on_issue || '',
    'Condition Out': r.condition_on_return || '',
  })), 'allocation_report');
}

async function exportMaintenanceReport() {
  const { data } = await window.AMS.db
    .from('maintenance')
    .select('title,description,status,cost,scheduled_date,completed_date,asset_id,vendor_id')
    .order('created_at', { ascending: false });
  if (!data) return;

  const maIds = [...new Set(data.map(m => m.asset_id).filter(Boolean))];
  const vIds  = [...new Set(data.map(m => m.vendor_id).filter(Boolean))];
  const [mar, vr] = await Promise.all([
    maIds.length ? window.AMS.db.from('assets').select('id,asset_code,name').in('id', maIds)  : { data: [] },
    vIds.length  ? window.AMS.db.from('vendors').select('id,name').in('id', vIds)              : { data: [] },
  ]);
  const mam = Object.fromEntries((mar.data || []).map(x => [x.id, x]));
  const vm  = Object.fromEntries((vr.data  || []).map(x => [x.id, x.name]));

  downloadCSV(data.map(m => ({
    'Asset Code':  mam[m.asset_id]?.asset_code || '',
    'Asset Name':  mam[m.asset_id]?.name || '',
    'Issue':       m.title,
    'Description': m.description || '',
    'Vendor':      vm[m.vendor_id] || '',
    'Status':      m.status,
    'Cost (₹)':    m.cost || 0,
    'Scheduled':   m.scheduled_date || '',
    'Completed':   m.completed_date || '',
  })), 'maintenance_report');
}

async function exportWarrantyReport() {
  const { data } = await window.AMS.db
    .from('assets')
    .select('asset_code,name,warranty_end,status,department_id')
    .not('warranty_end', 'is', null)
    .order('warranty_end');
  if (!data) return;

  const wdIds = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const { data: wdData } = wdIds.length
    ? await window.AMS.db.from('departments').select('id,name').in('id', wdIds)
    : { data: [] };
  const wdm = Object.fromEntries((wdData || []).map(x => [x.id, x.name]));

  const today2 = new Date();
  downloadCSV(data.map(a => {
    const expiry   = new Date(a.warranty_end);
    const daysLeft = Math.ceil((expiry - today2) / 86400000);
    return {
      'Asset ID':     a.asset_code,
      'Name':         a.name,
      'Department':   wdm[a.department_id] || '',
      'Warranty End': a.warranty_end,
      'Days Left':    daysLeft,
      'Status':       daysLeft < 0 ? 'Expired' : daysLeft < 30 ? 'Expiring Soon' : 'Valid',
      'Asset Status': a.status,
    };
  }), 'warranty_expiry_report');
}

async function exportDepreciationReport() {
  const { data } = await window.AMS.db
    .from('assets')
    .select('asset_code,name,purchase_value,purchase_date,category_id')
    .not('purchase_value', 'is', null)
    .not('purchase_date', 'is', null);
  if (!data) return;

  const dcIds = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const { data: dcData } = dcIds.length
    ? await window.AMS.db.from('asset_categories').select('id,name,depreciation_rate').in('id', dcIds)
    : { data: [] };
  const dcm = Object.fromEntries((dcData || []).map(x => [x.id, x]));

  const today3 = new Date();
  downloadCSV(data.map(a => {
    const cat      = dcm[a.category_id] || {};
    const years    = (today3 - new Date(a.purchase_date)) / (365.25 * 86400000);
    const rate     = cat.depreciation_rate || 20;
    const deprPct  = Math.min(years * rate, 100);
    const origVal  = Number(a.purchase_value);
    const currVal  = Math.max(origVal - origVal * deprPct / 100, 0);
    return {
      'Asset ID':         a.asset_code,
      'Name':             a.name,
      'Category':         cat.name || '',
      'Purchase Date':    a.purchase_date,
      'Original Value':   origVal,
      'Current Value':    Math.round(currVal),
      'Depreciation (%)': deprPct.toFixed(1),
      'Rate (% p.a.)':    rate,
    };
  }), 'depreciation_report');
}

// ── Full Analytics PDF Export ─────────────────────────────────────────────────
async function exportFullReportPDF() {
  if (!window.AMS.permissions?.requirePermission('export_reports', 'Export PDF report')) return;

  const btn = document.getElementById('exportPdfBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Exporting…'; }

  toast('info', 'Generating PDF', 'Fetching analytics data…');

  try {
    if (!window.jspdf?.jsPDF) {
      toast('error', 'PDF Library Missing', 'Could not load PDF generator. Check your internet connection.');
      return;
    }

    const [assetsRes, allocRes, maintRes, deptRes] = await Promise.all([
      window.AMS.db.from('assets').select('asset_code,name,status,purchase_value,warranty_end,department_id').order('asset_code'),
      window.AMS.db.from('allocations').select('id', { count: 'exact', head: true }).eq('is_active', true),
      window.AMS.db.from('maintenance').select('id', { count: 'exact', head: true }).in('status', ['pending', 'inprogress']),
      window.AMS.db.from('departments').select('id,name'),
    ]);

    const assets = assetsRes.data || [];
    if (assetsRes.error) throw new Error(assetsRes.error.message);
    if (assets.length === 0) {
      toast('warning', 'No Data', 'No assets found to export.');
      return;
    }

    const deptMap = Object.fromEntries((deptRes.data || []).map(d => [d.id, d.name]));
    const statusCounts = { available: 0, inuse: 0, repair: 0, disposed: 0, reserved: 0 };
    let totalValue = 0;
    assets.forEach(a => {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
      totalValue += Number(a.purchase_value) || 0;
    });

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('AMS Pro — Analytics Report', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${today}`, 14, 25);
    doc.text(`Company: ${window.AMS.config?.company || 'Acme Corp Pvt. Ltd.'}`, 14, 31);

    // Summary stats
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Summary', 14, 42);

    doc.autoTable({
      startY: 46,
      head: [['Metric', 'Value']],
      body: [
        ['Total Assets', String(assets.length)],
        ['Available', String(statusCounts.available)],
        ['In Use', String(statusCounts.inuse)],
        ['Under Repair', String(statusCounts.repair)],
        ['Disposed', String(statusCounts.disposed)],
        ['Active Allocations', String(allocRes.count || 0)],
        ['Open Maintenance', String(maintRes.count || 0)],
        ['Total Asset Value', `₹${totalValue.toLocaleString('en-IN')}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    // Assets table
    const tableStartY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text('Asset Inventory', 14, tableStartY);

    const tableRows = assets.map(a => [
      a.asset_code || '—',
      a.name || '—',
      (a.status || '—').replace(/^(\w)/, c => c.toUpperCase()),
      deptMap[a.department_id] || '—',
      a.purchase_value ? `₹${Number(a.purchase_value).toLocaleString('en-IN')}` : '—',
      a.warranty_end || '—',
    ]);

    doc.autoTable({
      startY: tableStartY + 4,
      head: [['Asset ID', 'Name', 'Status', 'Department', 'Value', 'Warranty End']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });

    // Footer on last page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}  ·  AMS Pro Asset Management System`, 14, 287);
    }

    const filename = `AMS_Analytics_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);

    window.AMS.auth.logAuditEvent('EXPORT', 'report', null, `PDF exported: ${filename}`).catch(() => {});
    toast('success', 'PDF Downloaded', `${filename} saved to your downloads.`);

  } catch (err) {
    console.error('[Reports] PDF export error:', err);
    toast('error', 'Export Failed', err.message || 'Could not generate PDF.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Export PDF'; }
  }
}

// ── Generic CSV download helper ───────────────────────────────────────────────
function downloadCSV(rows, filename) {
  if (!rows || rows.length === 0) { toast('warning', 'No Data', 'No records to export.'); return; }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  window.AMS.auth.logAuditEvent('EXPORT', 'report', null, `Report exported: ${filename}`);
  toast('success', 'Report Downloaded', `${filename}.csv saved`);
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadAuditLogs               = loadAuditLogs;
window.loadNotifications           = loadNotifications;
window.markNotificationRead        = markNotificationRead;
window.markAllNotificationsRead    = markAllNotificationsRead;
window.subscribeToNotifications    = subscribeToNotifications;
window.loadDepreciation            = loadDepreciation;
window.runReport                   = runReport;
window.exportFullReportPDF         = exportFullReportPDF;
window.downloadCSV                 = downloadCSV;
window.AMS.reports = { loadAuditLogs, loadNotifications, loadDepreciation, runReport, exportFullReportPDF };
