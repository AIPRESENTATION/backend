/**
 * maintenance.js
 * AMS Pro — Maintenance & Repair Tracking Module
 *
 * Handles:
 * - List maintenance tickets as cards
 * - Add maintenance request
 * - Approve / reject / complete tickets
 * - Maintenance stats (in-progress, completed, cost)
 *
 * DEPENDS ON: supabase.js, auth.js
 */

// ── Load Maintenance Page ─────────────────────────────────────────────────────
async function loadMaintenance() {
  await Promise.all([
    loadMaintenanceStats(),
    loadMaintenanceCards(),
  ]);
}

// ── Maintenance Stats ─────────────────────────────────────────────────────────
async function loadMaintenanceStats() {
  const { data, error } = await window.AMS.db
    .from('maintenance')
    .select('status, cost');

  if (error) return;

  const stats = {
    inprogress: 0,
    completed:  0,
    pending:    0,
    totalCost:  0,
  };

  data.forEach(m => {
    if (m.status === 'inprogress')  stats.inprogress++;
    if (m.status === 'completed')   stats.completed++;
    if (m.status === 'pending')     stats.pending++;
    if (m.cost) stats.totalCost += Number(m.cost);
  });

  // Update stat cards in maintenance page
  const statCards = document.querySelectorAll('#page-maintenance .sc .sc-val');
  if (statCards[0]) statCards[0].textContent = stats.inprogress;
  if (statCards[1]) statCards[1].textContent = stats.completed;
  if (statCards[2]) statCards[2].textContent = stats.pending;
  if (statCards[3]) statCards[3].textContent = window.AMS.utils.formatCurrency(stats.totalCost).replace('₹', '');
}

// ── Maintenance Cards ─────────────────────────────────────────────────────────
async function loadMaintenanceCards() {
  const container = document.querySelector('#page-maintenance .g2');
  if (!container) return;

  container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)">⏳ Loading…</div>`;

  const { data, error } = await window.AMS.db
    .from('maintenance')
    .select('id, title, description, status, cost, scheduled_date, completed_date, asset_id, vendor_id')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red)">❌ ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:10px">🔧</div><b>No maintenance records</b>
    </div>`;
    return;
  }

  // Resolve names
  const assetIds  = [...new Set(data.map(m => m.asset_id).filter(Boolean))];
  const vendorIds = [...new Set(data.map(m => m.vendor_id).filter(Boolean))];
  const [assetRes, vendorRes] = await Promise.all([
    assetIds.length  ? window.AMS.db.from('assets').select('id,asset_code,name,department_id').in('id', assetIds)   : { data: [] },
    vendorIds.length ? window.AMS.db.from('vendors').select('id,name').in('id', vendorIds)                          : { data: [] },
  ]);
  const deptIds = [...new Set((assetRes.data || []).map(a => a.department_id).filter(Boolean))];
  const deptRes = deptIds.length
    ? await window.AMS.db.from('departments').select('id,name').in('id', deptIds)
    : { data: [] };

  const assetMap  = Object.fromEntries((assetRes.data  || []).map(x => [x.id, x]));
  const vendorMap = Object.fromEntries((vendorRes.data || []).map(x => [x.id, x.name]));
  const deptMap   = Object.fromEntries((deptRes.data   || []).map(x => [x.id, x.name]));

  const { sanitize, formatDate, formatCurrency } = window.AMS.utils;
  const canApprove  = window.AMS.permissions?.can('approve_maintenance');
  const canComplete = window.AMS.permissions?.can('complete_maintenance');

  const statusBadgeMap = {
    pending:     'badge-pending',
    inprogress:  'badge-repair',
    completed:   'badge-done',
    approved:    'badge-active',
    rejected:    'badge-disposed',
  };

  const statusLabelMap = {
    pending:     'Pending Approval',
    inprogress:  'In Progress',
    completed:   'Completed',
    approved:    'Approved',
    rejected:    'Rejected',
  };

  container.innerHTML = data.map(m => {
    const asset       = assetMap[m.asset_id]   || {};
    const vendorName  = vendorMap[m.vendor_id]  || null;
    const deptDisplay = deptMap[asset.department_id] || '';
    const badge       = statusBadgeMap[m.status] || 'badge-inactive';
    const label       = statusLabelMap[m.status] || m.status;
    const dateDisplay = m.completed_date
      ? `✅ Completed: ${formatDate(m.completed_date)}`
      : m.scheduled_date
        ? `📅 Scheduled: ${formatDate(m.scheduled_date)}`
        : `📅 Logged`;

    return `
      <div class="mcard">
        <div class="mcard-hd">
          <div>
            <div class="mcard-name">${sanitize(asset.name || 'Unknown Asset')}</div>
            <div class="mcard-id">${sanitize(asset.asset_code || '—')} · ${sanitize(deptDisplay)}</div>
          </div>
          <span class="badge ${badge}">${label}</span>
        </div>
        <div class="mcard-body">
          ${sanitize(m.description || m.title)}
          ${vendorName ? `<br><span style="color:var(--text3)">Service: ${sanitize(vendorName)}</span>` : ''}
          ${m.cost ? `<br><span style="color:var(--text3)">Est. Cost: ${formatCurrency(m.cost)}</span>` : ''}
        </div>
        <div class="mcard-ft">
          <span class="mcard-date">${dateDisplay}</span>
          <div style="display:flex;gap:6px">
            ${m.status === 'pending' && canApprove ? `
              <button class="btn btn-success btn-xs" onclick="updateMaintenanceStatus('${m.id}','approved','${sanitize(asset.name || '')}')">Approve</button>
              <button class="btn btn-danger btn-xs"  onclick="updateMaintenanceStatus('${m.id}','rejected','${sanitize(asset.name || '')}')">Reject</button>
            ` : ''}
            ${(m.status === 'approved' || m.status === 'inprogress') && canComplete ? `
              <button class="btn btn-success btn-xs" onclick="updateMaintenanceStatus('${m.id}','completed','${sanitize(asset.name || '')}')">Mark Done</button>
            ` : ''}
            ${m.status === 'pending' && !canApprove ? `
              <span class="badge badge-pending" style="font-size:10px">Awaiting manager approval</span>
            ` : ''}
            <button class="btn btn-ghost btn-xs" onclick="viewMaintenanceHistory('${m.asset_id || ''}','${sanitize(asset.name || '')}')">History</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Update Maintenance Status ─────────────────────────────────────────────────
async function updateMaintenanceStatus(maintenanceId, newStatus, assetName) {
  const perm = ['approved', 'rejected'].includes(newStatus)
    ? 'approve_maintenance'
    : 'complete_maintenance';
  if (!window.AMS.permissions?.requirePermission(perm, 'Update maintenance status')) return;

  const updatePayload = {
    status:     newStatus,
    updated_at: new Date().toISOString(),
  };

  // If marking complete, record completion date and set asset back to available
  if (newStatus === 'completed') {
    updatePayload.completed_date = new Date().toISOString().slice(0, 10);
  }

  const { error } = await window.AMS.db
    .from('maintenance')
    .update(updatePayload)
    .eq('id', maintenanceId);

  if (error) {
    toast('error', 'Update Failed', error.message);
    return;
  }

  // When approved, mark asset as under repair; when completed, restore availability
  const { data: maintData } = await window.AMS.db
    .from('maintenance')
    .select('asset_id')
    .eq('id', maintenanceId)
    .single();

  if (maintData?.asset_id) {
    if (newStatus === 'approved' || newStatus === 'inprogress') {
      await window.AMS.db
        .from('assets')
        .update({ status: 'repair', updated_at: new Date().toISOString() })
        .eq('id', maintData.asset_id);
    } else if (newStatus === 'completed') {
      await window.AMS.db
        .from('assets')
        .update({ status: 'available', updated_at: new Date().toISOString() })
        .eq('id', maintData.asset_id)
        .eq('status', 'repair');
    }
  }

  const actionLabels = { approved: 'Approved', rejected: 'Rejected', completed: 'Marked Complete', inprogress: 'Set In Progress' };
  await window.AMS.auth.logAuditEvent('MAINT', 'maintenance', maintenanceId,
    `Maintenance ${actionLabels[newStatus] || newStatus}: ${assetName}`
  );

  await loadMaintenance();
  toast('success', actionLabels[newStatus] || 'Updated', `${assetName} — maintenance ${newStatus}`);
}

// ── Add Maintenance Request ───────────────────────────────────────────────────
async function loadMaintenanceFormDropdowns() {
  // Load all assets
  const { data: assets } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name')
    .order('name');

  const assetSel = document.getElementById('mAsset');
  if (assetSel && assets) {
    assetSel.innerHTML = '<option value="">Select Asset</option>' +
      assets.map(a => `<option value="${a.id}">${a.asset_code} — ${a.name}</option>`).join('');
  }

  // Load vendors
  const { data: vendors } = await window.AMS.db
    .from('vendors')
    .select('id, name')
    .order('name');

  const vendorSel = document.getElementById('mVendor');
  if (vendorSel && vendors) {
    vendorSel.innerHTML = '<option value="">Select Vendor (Optional)</option>' +
      vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  }
}

async function submitMaintenance() {
  if (!window.AMS.permissions?.requirePermission('log_maintenance', 'Log maintenance')) return;

  const get = id => document.getElementById(id)?.value?.trim();

  const assetId   = get('mAsset');
  const title     = get('mTitle');
  const desc      = get('mDesc');
  const cost      = get('mCost');
  const vendorId  = get('mVendor');
  const schedDate = get('mDate');

  if (!assetId) { toast('error', 'Missing Field', 'Please select an asset.'); return; }
  if (!title)   { toast('error', 'Missing Field', 'Please enter a title/issue description.'); return; }

  const submitBtn = document.getElementById('maintSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  const { data: assetData } = await window.AMS.db
    .from('assets')
    .select('asset_code, name')
    .eq('id', assetId)
    .single();

  const { data, error } = await window.AMS.db
    .from('maintenance')
    .insert({
      asset_id:       assetId,
      title:          title,
      description:    desc || null,
      cost:           cost ? Number(cost) : null,
      vendor_id:      vendorId || null,
      scheduled_date: schedDate || null,
      status:         'pending',
      reported_by:    window.AMS.auth.getCurrentUser()?.id || null,
    })
    .select()
    .single();

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Log Maintenance'; }

  if (error) {
    toast('error', 'Save Failed', error.message);
    return;
  }

  // Asset status stays unchanged until a manager approves the request

  await window.AMS.auth.logAuditEvent('MAINT', 'maintenance', data.id,
    `Maintenance request logged for ${assetData?.asset_code}: ${title}`
  );

  ['mAsset', 'mTitle', 'mDesc', 'mCost', 'mDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  closeM('addMaint');
  await loadMaintenance();

  toast('success', 'Maintenance Logged', `Request submitted for ${assetData?.name}. A manager will review and approve.`);
}

// ── Maintenance History for Asset ─────────────────────────────────────────────
async function viewMaintenanceHistory(assetId, assetName) {
  if (!assetId) return;

  const { data, error } = await window.AMS.db
    .from('maintenance')
    .select('title, status, cost, scheduled_date, completed_date')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    toast('info', assetName, 'No maintenance history for this asset.');
    return;
  }

  const { formatDate, formatCurrency } = window.AMS.utils;
  const list = data.map(m =>
    `• ${m.title} — ${m.status.toUpperCase()} | ${formatDate(m.completed_date || m.scheduled_date)} | ${m.cost ? formatCurrency(m.cost) : 'No cost'}`
  ).join('\n');

  alert(`Maintenance History — ${assetName}:\n\n${list}`);
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadMaintenance             = loadMaintenance;
window.submitMaintenance           = submitMaintenance;
window.updateMaintenanceStatus     = updateMaintenanceStatus;
window.viewMaintenanceHistory      = viewMaintenanceHistory;
window.loadMaintenanceFormDropdowns = loadMaintenanceFormDropdowns;
window.AMS.maintenance = { loadMaintenance };
