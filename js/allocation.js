/**
 * allocation.js
 * AMS Pro — Asset Allocation Module
 *
 * Handles:
 * - View active allocations
 * - View return history
 * - Issue asset to employee
 * - Return asset
 *
 * DEPENDS ON: supabase.js, auth.js
 */

// ── Load Allocations Page ─────────────────────────────────────────────────────
async function loadAllocation() {
  await Promise.all([
    loadActiveAllocations(),
    loadReturnHistory(),
  ]);
}

// ── Active Allocations ────────────────────────────────────────────────────────
async function loadActiveAllocations() {
  const tbody = document.querySelector('#alc-a tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text3)">⏳ Loading…</td></tr>`;

  const { data, error } = await window.AMS.db
    .from('allocations')
    .select('id, issue_date, expected_return, condition_on_issue, notes, asset_id, assigned_to, department_id')
    .eq('is_active', true)
    .order('issue_date', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--red);padding:24px">❌ ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">📋</div><b>No active allocations</b>
    </td></tr>`;
    return;
  }

  // Resolve names
  const assetIds   = [...new Set(data.map(a => a.asset_id).filter(Boolean))];
  const profileIds = [...new Set(data.map(a => a.assigned_to).filter(Boolean))];
  const deptIds    = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const [assetRes, profileRes, deptRes] = await Promise.all([
    assetIds.length   ? window.AMS.db.from('assets').select('id,asset_code,name,status').in('id', assetIds)     : { data: [] },
    profileIds.length ? window.AMS.db.from('profiles').select('id,full_name').in('id', profileIds)              : { data: [] },
    deptIds.length    ? window.AMS.db.from('departments').select('id,name').in('id', deptIds)                   : { data: [] },
  ]);
  const assetMap   = Object.fromEntries((assetRes.data   || []).map(x => [x.id, x]));
  const profileMap = Object.fromEntries((profileRes.data || []).map(x => [x.id, x.full_name]));
  const deptMap    = Object.fromEntries((deptRes.data    || []).map(x => [x.id, x.name]));

  const { sanitize, formatDate } = window.AMS.utils;
  const userId = window.AMS.auth.getCurrentUser()?.id;
  const canAssign = window.AMS.permissions?.can('assign_assets');
  const canReturnOwn = window.AMS.permissions?.can('request_return');

  // Employees see only their own active allocations
  const rows = (!canAssign && userId)
    ? data.filter(a => a.assigned_to === userId)
    : data;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">📋</div><b>No active allocations</b>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(a => {
    const asset      = assetMap[a.asset_id]   || {};
    const assignedTo = profileMap[a.assigned_to] || '—';
    const dept       = deptMap[a.department_id]  || '—';
    const daysUsed   = a.issue_date
      ? Math.floor((Date.now() - new Date(a.issue_date).getTime()) / 86400000) : 0;
    const daysClass  = daysUsed > 365 ? 'c-red' : daysUsed > 180 ? 'c-orange' : 'c-green';
    const condBadge  = a.condition_on_issue === 'Good' ? 'badge-active' : 'badge-repair';
    const showReturn = canAssign || (canReturnOwn && a.assigned_to === userId);
    return `
      <tr>
        <td class="mono">${sanitize(a.id?.slice(0,8))}…</td>
        <td>${sanitize(asset.name || '—')} <span class="mono" style="font-size:10px">(${sanitize(asset.asset_code || '—')})</span></td>
        <td>${sanitize(assignedTo)}</td>
        <td>${sanitize(dept)}</td>
        <td>${formatDate(a.issue_date)}</td>
        <td>${a.expected_return ? formatDate(a.expected_return) : '—'}</td>
        <td><b class="${daysClass}">${daysUsed} days</b></td>
        <td><span class="badge ${condBadge}">${sanitize(a.condition_on_issue || 'Good')}</span></td>
        <td>${showReturn ? `<button class="btn btn-ghost btn-xs" onclick="initiateReturn('${a.asset_id}','${a.id}','${sanitize(asset.name || '')}')">Return</button>` : '—'}</td>
      </tr>
    `;
  }).join('');
}

// ── Return History ────────────────────────────────────────────────────────────
async function loadReturnHistory() {
  const tbody = document.querySelector('#alc-h tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text3)">⏳ Loading…</td></tr>`;

  const { data, error } = await window.AMS.db
    .from('allocations')
    .select('id, issue_date, return_date, condition_on_return, asset_id, assigned_to')
    .eq('is_active', false)
    .not('return_date', 'is', null)
    .order('return_date', { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:24px">❌ ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No return history yet</td></tr>`;
    return;
  }

  // Resolve names
  const assetIds2   = [...new Set(data.map(r => r.asset_id).filter(Boolean))];
  const profileIds2 = [...new Set(data.map(r => r.assigned_to).filter(Boolean))];
  const [ar, pr]    = await Promise.all([
    assetIds2.length   ? window.AMS.db.from('assets').select('id,asset_code,name').in('id', assetIds2)     : { data: [] },
    profileIds2.length ? window.AMS.db.from('profiles').select('id,full_name').in('id', profileIds2)       : { data: [] },
  ]);
  const am2 = Object.fromEntries((ar.data || []).map(x => [x.id, x]));
  const pm2 = Object.fromEntries((pr.data || []).map(x => [x.id, x.full_name]));

  const { sanitize, formatDate } = window.AMS.utils;

  tbody.innerHTML = data.map(r => {
    const asset      = am2[r.asset_id] || {};
    const returnedBy = pm2[r.assigned_to] || '—';
    const issueDate  = r.issue_date  ? new Date(r.issue_date)  : null;
    const returnDate = r.return_date ? new Date(r.return_date) : null;
    const duration   = issueDate && returnDate
      ? Math.floor((returnDate - issueDate) / 86400000) + ' days' : '—';
    const condBadge  = r.condition_on_return === 'Good' ? 'badge-active' : 'badge-repair';
    return `
      <tr>
        <td class="mono">RET-${sanitize(r.id?.slice(0,6))}</td>
        <td>${sanitize(asset.name || '—')} <span class="mono" style="font-size:10px">(${sanitize(asset.asset_code || '—')})</span></td>
        <td>${sanitize(returnedBy)}</td>
        <td>${formatDate(r.issue_date)}</td>
        <td>${formatDate(r.return_date)}</td>
        <td>${duration}</td>
        <td><span class="badge ${condBadge}">${sanitize(r.condition_on_return || '—')}</span></td>
      </tr>
    `;
  }).join('');
}

// ── Issue Asset ───────────────────────────────────────────────────────────────
async function loadIssueFormDropdowns(preselectedAssetId = null) {
  // Load available assets
  const { data: assets } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name')
    .eq('status', 'available')
    .order('name');

  const assetSel = document.getElementById('issueAsset');
  if (assetSel && assets) {
    assetSel.innerHTML = '<option value="">Select Asset</option>' +
      assets.map(a => `<option value="${a.id}" ${a.id === preselectedAssetId ? 'selected' : ''}>${a.asset_code} — ${a.name}</option>`).join('');
  }

  // Load employees
  const { data: emps } = await window.AMS.db
    .from('profiles')
    .select('id, employee_code, full_name')
    .eq('status', 'active')
    .order('full_name');

  const empSel = document.getElementById('issueEmployee');
  if (empSel && emps) {
    empSel.innerHTML = '<option value="">Select Employee</option>' +
      emps.map(e => `<option value="${e.id}">${e.employee_code} — ${e.full_name}</option>`).join('');
  }
}

// Called from assets table "Assign" button
function openIssueModal(assetId = null) {
  if (!window.AMS.permissions?.requirePermission('assign_assets', 'Issue assets')) return;
  loadIssueFormDropdowns(assetId);
  openM('issueAsset');
}

async function submitIssue() {
  if (!window.AMS.permissions?.requirePermission('assign_assets', 'Issue assets')) return;

  const get = id => document.getElementById(id)?.value?.trim();

  const assetId   = get('issueAsset');
  const empId     = get('issueEmployee');
  const issueDate = get('issueDate') || new Date().toISOString().slice(0, 10);
  const expReturn = get('issueExpReturn');
  const condition = get('issueCondition') || 'Good';
  const notes     = get('issueNotes');

  if (!assetId) { toast('error', 'Missing Field', 'Please select an asset.'); return; }
  if (!empId)   { toast('error', 'Missing Field', 'Please select an employee.'); return; }

  const submitBtn = document.getElementById('issueSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Issuing…'; }

  // Get employee's department
  const { data: empData } = await window.AMS.db
    .from('profiles')
    .select('department_id, full_name')
    .eq('id', empId)
    .single();

  // Insert allocation record
  const { data: allocData, error: allocError } = await window.AMS.db
    .from('allocations')
    .insert({
      asset_id:          assetId,
      assigned_to:       empId,
      department_id:     empData?.department_id || null,
      issue_date:        issueDate,
      expected_return:   expReturn || null,
      condition_on_issue: condition,
      notes:             notes || null,
      is_active:         true,
      issued_by:         window.AMS.auth.getCurrentUser()?.id || null,
    })
    .select()
    .single();

  if (allocError) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Issue Asset'; }
    toast('error', 'Issue Failed', allocError.message);
    return;
  }

  // Update asset status to 'inuse' and set assigned_to
  const { error: updateError } = await window.AMS.db
    .from('assets')
    .update({
      status:      'inuse',
      assigned_to: empId,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', assetId);

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Issue Asset'; }

  if (updateError) {
    toast('error', 'Status Update Failed', updateError.message);
    return;
  }

  // Get asset name for audit log
  const { data: assetData } = await window.AMS.db
    .from('assets')
    .select('asset_code, name')
    .eq('id', assetId)
    .single();

  await window.AMS.auth.logAuditEvent(
    'ASSIGN', 'allocation', allocData.id,
    `Asset ${assetData?.asset_code} (${assetData?.name}) issued to ${empData?.full_name}`
  );

  // Clear and close
  ['issueAsset', 'issueEmployee', 'issueDate', 'issueExpReturn', 'issueNotes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  closeM('issueAsset');

  await loadAllocation();
  if (typeof loadDashboard === 'function') loadDashboard();

  toast('success', 'Asset Issued', `${assetData?.name} assigned to ${empData?.full_name}`);
}

// ── Return Asset ──────────────────────────────────────────────────────────────
// Called from allocation table or asset table
async function initiateReturn(assetId, allocationId = null, assetName = '') {
  if (!window.AMS.permissions?.can('assign_assets')) {
    if (!window.AMS.permissions?.requirePermission('request_return', 'Return assets')) return;
  }

  // If no allocationId, find the active one
  if (!allocationId) {
    const { data } = await window.AMS.db
      .from('allocations')
      .select('id, asset_id')
      .eq('asset_id', assetId)
      .eq('is_active', true)
      .single();

    if (!data) {
      toast('error', 'Not Found', 'No active allocation found for this asset.');
      return;
    }
    allocationId = data.id;

    // Employees may only return assets assigned to them
    if (!window.AMS.permissions?.can('assign_assets')) {
      const userId = window.AMS.auth.getCurrentUser()?.id;
      const { data: allocCheck } = await window.AMS.db
        .from('allocations')
        .select('assigned_to')
        .eq('id', allocationId)
        .single();
      if (allocCheck?.assigned_to !== userId) {
        toast('error', 'Not Authorized', 'You can only return assets assigned to you.');
        return;
      }
    }

    // Resolve asset name
    if (!assetName) {
      const { data: a } = await window.AMS.db.from('assets').select('name').eq('id', assetId).single();
      assetName = a?.name || '';
    }
  }

  // Prefill return modal
  const allocIdEl = document.getElementById('returnAllocId');
  const assetNameEl = document.getElementById('returnAssetName');
  if (allocIdEl)   allocIdEl.value     = allocationId;
  if (assetNameEl) assetNameEl.value   = assetName;

  const retDate = document.getElementById('returnDate');
  if (retDate) retDate.value = new Date().toISOString().slice(0, 10);

  openM('returnAsset');
}

async function submitReturn() {
  if (!window.AMS.permissions?.can('assign_assets')) {
    if (!window.AMS.permissions?.requirePermission('request_return', 'Return assets')) return;
  }

  const get = id => document.getElementById(id)?.value?.trim();

  const allocationId = get('returnAllocId');
  const returnDate   = get('returnDate') || new Date().toISOString().slice(0, 10);
  const condition    = get('returnCondition') || 'Good';
  const notes        = get('returnNotes');

  if (!allocationId) { toast('error', 'Error', 'Allocation ID missing.'); return; }

  // Employees may only return their own allocations
  if (!window.AMS.permissions?.can('assign_assets')) {
    const userId = window.AMS.auth.getCurrentUser()?.id;
    const { data: allocCheck } = await window.AMS.db
      .from('allocations')
      .select('assigned_to')
      .eq('id', allocationId)
      .single();
    if (allocCheck?.assigned_to !== userId) {
      toast('error', 'Not Authorized', 'You can only return assets assigned to you.');
      return;
    }
  }

  const submitBtn = document.getElementById('returnSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Processing…'; }

  // Get allocation to find asset
  const { data: alloc } = await window.AMS.db
    .from('allocations')
    .select('asset_id, assigned_to')
    .eq('id', allocationId)
    .single();

  // Resolve asset and profile names
  const [allocAssetRes, allocProfileRes] = await Promise.all([
    alloc?.asset_id    ? window.AMS.db.from('assets').select('asset_code,name').eq('id', alloc.asset_id).single()      : { data: null },
    alloc?.assigned_to ? window.AMS.db.from('profiles').select('full_name').eq('id', alloc.assigned_to).single()        : { data: null },
  ]);
  const allocAsset   = allocAssetRes.data   || {};
  const allocProfile = allocProfileRes.data || {};

  // Mark allocation as returned
  const { error: allocError } = await window.AMS.db
    .from('allocations')
    .update({
      is_active:           false,
      return_date:         returnDate,
      condition_on_return: condition,
      return_notes:        notes || null,
      returned_by:         window.AMS.auth.getCurrentUser()?.id || null,
    })
    .eq('id', allocationId);

  if (allocError) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Return'; }
    toast('error', 'Return Failed', allocError.message);
    return;
  }

  // Set asset back to 'available' and clear assigned_to
  const newStatus = condition === 'Damaged' ? 'repair' : 'available';
  await window.AMS.db
    .from('assets')
    .update({
      status:      newStatus,
      assigned_to: null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', alloc.asset_id);

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Return'; }

  await window.AMS.auth.logAuditEvent(
    'RETURN', 'allocation', allocationId,
    `Asset ${allocAsset.asset_code} returned by ${allocProfile.full_name} — Condition: ${condition}`
  );

  ['returnAllocId', 'returnDate', 'returnNotes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  closeM('returnAsset');

  await loadAllocation();
  if (typeof loadDashboard === 'function') loadDashboard();

  toast('success', 'Asset Returned',
    `${allocAsset.name} returned — Status: ${newStatus === 'repair' ? 'Sent for Repair' : 'Available'}`
  );
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadAllocation       = loadAllocation;
window.openIssueModal       = openIssueModal;
window.submitIssue          = submitIssue;
window.initiateReturn       = initiateReturn;
window.submitReturn         = submitReturn;
window.AMS.allocation = { loadAllocation };
