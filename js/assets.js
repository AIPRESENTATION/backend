/**
 * assets.js
 * AMS Pro — Asset Management Module
 *
 * Handles:
 * - List assets (with pagination, filter, sort)
 * - Add asset
 * - Edit asset
 * - Delete asset
 * - Search assets
 * - Export CSV
 * - QR code generation
 *
 * DEPENDS ON: supabase.js, auth.js
 */

// ── State ─────────────────────────────────────────────────────────────────────
let assetState = {
  currentFilter: 'all',
  currentPage: 1,
  pageSize: window.AMS.config.pageSize,
  totalCount: 0,
  searchQuery: '',
  sortField: 'created_at',
  sortAsc: false,
  selectedIds: new Set(),
  editingAssetId: null,   // null = adding new, UUID = editing existing
};

// ── Load & Render Assets ──────────────────────────────────────────────────────
async function loadAssets(filter = 'all', page = 1, search = '') {
  assetState.currentFilter = filter;
  assetState.currentPage   = page;
  assetState.searchQuery   = search;

  const tbody = document.getElementById('atbody');
  if (!tbody) return;

  // Show skeleton loader
  tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--text3)">
    <span style="font-size:20px">⏳</span><br>Loading assets…
  </td></tr>`;

  // Build query
  let query = window.AMS.db
    .from('assets')
    .select(
      'id, asset_code, name, serial_number, purchase_date, purchase_value, warranty_end, status, created_at, category_id, department_id, assigned_to',
      { count: 'exact' }
    );

  // Filter by status
  if (filter !== 'all') {
    query = query.eq('status', filter);
  }

  // Search across name, asset_code, serial_number
  if (search.trim()) {
    query = query.or(
      `name.ilike.%${search}%,asset_code.ilike.%${search}%,serial_number.ilike.%${search}%`
    );
  }

  // Sort
  query = query.order(assetState.sortField, { ascending: assetState.sortAsc });

  // Pagination
  const from = (page - 1) * assetState.pageSize;
  const to   = from + assetState.pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:28px;color:var(--red)">
      ❌ Failed to load assets: ${error.message}
    </td></tr>`;
    toast('error', 'Load Failed', error.message);
    return;
  }

  assetState.totalCount = count || 0;

  // Resolve category, department, assigned-to names via separate queries
  const catIds     = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const deptIds    = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const profileIds = [...new Set(data.map(a => a.assigned_to).filter(Boolean))];

  const [catRes, deptRes, profileRes] = await Promise.all([
    catIds.length
      ? window.AMS.db.from('asset_categories').select('id,name').in('id', catIds)
      : { data: [] },
    deptIds.length
      ? window.AMS.db.from('departments').select('id,name').in('id', deptIds)
      : { data: [] },
    profileIds.length
      ? window.AMS.db.from('profiles').select('id,full_name').in('id', profileIds)
      : { data: [] },
  ]);

  const catMap     = Object.fromEntries((catRes.data     || []).map(c => [c.id, c.name]));
  const deptMap    = Object.fromEntries((deptRes.data    || []).map(d => [d.id, d.name]));
  const profileMap = Object.fromEntries((profileRes.data || []).map(p => [p.id, p.full_name]));

  // Enrich asset objects with resolved names
  const enriched = data.map(a => ({
    ...a,
    category_name:  catMap[a.category_id]  || '—',
    dept_name:      deptMap[a.department_id] || '—',
    assigned_name:  profileMap[a.assigned_to] || '—',
  }));

  await refreshAssetCounts();
  renderAssetTable(enriched);
  renderPagination('assets');
}

// ── Render Asset Table Rows ───────────────────────────────────────────────────
function renderAssetTable(assets) {
  const tbody = document.getElementById('atbody');
  if (!tbody) return;

  if (!assets || assets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">📭</div>
      <b>No assets found</b>
      <div style="font-size:12px;margin-top:4px">Try a different filter or add a new asset</div>
    </td></tr>`;
    return;
  }

  const { sanitize, formatDate, formatCurrency } = window.AMS.utils;
  const statusLabels = window.AMS.config.assetStatus;
  const canAssign = window.AMS.permissions?.can('assign_assets');
  const canEdit   = window.AMS.permissions?.can('edit_assets');
  const canDelete = window.AMS.permissions?.can('delete_assets');
  const canReturnOwn = window.AMS.permissions?.can('request_return');
  const userId = window.AMS.auth.getCurrentUser()?.id;

  tbody.innerHTML = assets.map(a => {
    const isSelected = assetState.selectedIds.has(a.id);
    const warrantyDate = a.warranty_end ? new Date(a.warranty_end) : null;
    const isWarrantyExpired = warrantyDate && warrantyDate < new Date();
    const warrantyDisplay = warrantyDate
      ? `<span style="color:${isWarrantyExpired ? 'var(--red)' : 'inherit'}">${formatDate(a.warranty_end)}${isWarrantyExpired ? ' ⚠️' : ''}</span>`
      : '—';

    return `
      <tr class="${isSelected ? 'sel' : ''}" data-id="${a.id}">
        <td class="tck">
          <input type="checkbox" ${isSelected ? 'checked' : ''}
            onchange="toggleAssetRow('${a.id}', this)">
        </td>
        <td class="mono">${sanitize(a.asset_code)}</td>
        <td><b>${sanitize(a.name)}</b></td>
        <td>${sanitize(a.category_name || '—')}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${sanitize(a.serial_number || '—')}</td>
        <td>${sanitize(a.dept_name || '—')}</td>
        <td>${sanitize(a.assigned_name || '—')}</td>
        <td>${formatDate(a.purchase_date)}</td>
        <td>${warrantyDisplay}</td>
        <td>${formatCurrency(a.purchase_value)}</td>
        <td><span class="badge badge-${a.status}">${statusLabels[a.status] || a.status}</span></td>
        <td style="display:flex;gap:4px;flex-wrap:nowrap">
          ${a.status === 'available' && canAssign
            ? `<button class="btn btn-success btn-xs" onclick="openIssueModal('${a.id}')">Assign</button>`
            : ''}
          ${a.status === 'inuse' && (canAssign || (canReturnOwn && a.assigned_to === userId))
            ? `<button class="btn btn-ghost btn-xs" onclick="initiateReturn('${a.id}')">Return</button>`
            : ''}
          <button class="btn btn-ghost btn-xs" onclick="generateQR('${a.asset_code}', '${sanitize(a.name)}')">QR</button>
          ${canEdit
            ? `<button class="btn btn-ghost btn-xs" onclick="openEditAsset('${a.id}')">Edit</button>`
            : ''}
          ${canDelete
            ? `<button class="btn btn-danger btn-xs" onclick="confirmDeleteAsset('${a.id}', '${sanitize(a.name)}')">Del</button>`
            : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// ── Refresh filter chip counts ────────────────────────────────────────────────
async function refreshAssetCounts() {
  const { data, error } = await window.AMS.db
    .from('assets')
    .select('status');

  if (error) return;

  const total = data.length;
  const cnt = { available: 0, inuse: 0, repair: 0, disposed: 0 };
  data.forEach(a => { if (cnt[a.status] !== undefined) cnt[a.status]++; });

  const el = id => document.getElementById(id);
  if (el('chip-cnt-all'))       el('chip-cnt-all').textContent       = `(${total})`;
  if (el('chip-cnt-available')) el('chip-cnt-available').textContent = `(${cnt.available})`;
  if (el('chip-cnt-inuse'))     el('chip-cnt-inuse').textContent     = `(${cnt.inuse})`;
  if (el('chip-cnt-repair'))    el('chip-cnt-repair').textContent    = `(${cnt.repair})`;
  if (el('chip-cnt-disposed'))  el('chip-cnt-disposed').textContent  = `(${cnt.disposed})`;
  if (el('sb-badge'))           el('sb-badge').textContent           = total;
  if (el('stat-total'))         el('stat-total').textContent         = total;
  if (el('stat-available'))     el('stat-available').textContent     = cnt.available;
  if (el('stat-inuse'))         el('stat-inuse').textContent         = cnt.inuse;
  if (el('stat-repair'))        el('stat-repair').textContent        = cnt.repair;
  if (el('stat-disposed'))      el('stat-disposed').textContent      = cnt.disposed;
}

// ── Row Selection ─────────────────────────────────────────────────────────────
function toggleAssetRow(id, cb) {
  if (cb.checked) assetState.selectedIds.add(id);
  else assetState.selectedIds.delete(id);
  cb.closest('tr').classList.toggle('sel', cb.checked);
  updateBulkBar();
}

function selAllTog(cb) {
  document.querySelectorAll('#atbody input[type=checkbox]').forEach(c => {
    c.checked = cb.checked;
    const id = c.closest('tr').dataset.id;
    if (cb.checked) assetState.selectedIds.add(id);
    else assetState.selectedIds.delete(id);
    c.closest('tr').classList.toggle('sel', cb.checked);
  });
  updateBulkBar();
}

function clearSel() {
  assetState.selectedIds.clear();
  document.querySelectorAll('#atbody input[type=checkbox]').forEach(c => {
    c.checked = false;
    c.closest('tr').classList.remove('sel');
  });
  const sa = document.getElementById('selAll');
  if (sa) sa.checked = false;
  updateBulkBar();
}

function updateBulkBar() {
  const bb  = document.getElementById('bulkBar');
  const cnt = document.getElementById('bulkCnt');
  if (!bb) return;
  if (assetState.selectedIds.size > 0) {
    bb.classList.add('show');
    if (cnt) cnt.textContent = assetState.selectedIds.size;
  } else {
    bb.classList.remove('show');
  }
}

// ── Add Asset (with approval workflow) ───────────────────────────────────────
// Employee  → status = 'pending_approval' (Manager must approve)
// Manager+  → status = 'available' (direct registration, no approval needed)
async function submitAsset() {
  if (!window.AMS.permissions?.requirePermission('register_assets', 'register assets')) return;

  const get = id => document.getElementById(id)?.value?.trim();

  const name     = get('aName');
  const cat      = get('aCat');
  const serial   = get('aSerial');
  const dept     = get('aDept');
  const pd       = get('aPD');
  const warr     = get('aWarr');
  const val      = get('aVal');
  const tag      = get('aTag');
  const notes    = get('aNotes');

  // Validation
  if (!name)   { toast('error', 'Missing Field', 'Please enter an Asset Name.');   return; }
  if (!cat)    { toast('error', 'Missing Field', 'Please select a Category.');      return; }
  if (!serial) { toast('error', 'Missing Field', 'Please enter a Serial Number.');  return; }

  // Get category UUID from the dropdown value (which stores the UUID)
  // Get department UUID similarly
  const user = window.AMS.auth.getCurrentUser();

  // Check for duplicate serial number
  const { data: existing } = await window.AMS.db
    .from('assets')
    .select('id')
    .eq('serial_number', serial)
    .limit(1);

  if (existing && existing.length > 0) {
    toast('error', 'Duplicate Serial', `Serial number "${serial}" already exists in the system.`);
    return;
  }

  // Get next asset code (e.g. AST-011)
  const { count } = await window.AMS.db
    .from('assets')
    .select('id', { count: 'exact', head: true });

  const assetCode = window.AMS.utils.generateAssetId((count || 0) + 1);

  // Disable submit button to prevent double-submit
  const submitBtn = document.getElementById('assetSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  const insertPayload = {
    asset_code:      assetCode,
    name:            name,
    category_id:     cat || null,
    serial_number:   serial,
    department_id:   dept || null,
    purchase_date:   pd || null,
    warranty_end:    warr || null,
    purchase_value:  val ? Number(val) : null,
    asset_tag:       tag || null,
    notes:           notes || null,
    // Managers/Admins register directly as 'available'
    // Employees submit for approval — Manager must approve before asset goes live
    status:          window.AMS.permissions?.can('approve_assets') ? 'available' : 'pending_approval',
    created_by:      user?.id || null,
  };

  const { data, error } = await window.AMS.db
    .from('assets')
    .insert(insertPayload)
    .select()
    .single();

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Register Asset'; }

  if (error) {
    toast('error', 'Save Failed', error.message);
    return;
  }

  const isPending = insertPayload.status === 'pending_approval';

  // Log audit event
  await window.AMS.auth.logAuditEvent('CREATE', 'asset', data.id,
    `Asset ${isPending ? 'submitted for approval' : 'registered'}: ${name} (${assetCode})`);

  // Notify managers about pending approval
  if (isPending) {
    await notifyManagers(data.id, name, assetCode, user);
  }

  // Clear form and close modal
  clearAssetForm();
  closeM('addAsset');

  // Reload assets list
  assetState.currentFilter = 'all';
  nav('assets');
  await loadAssets('all');

  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  document.getElementById('chip-all')?.classList.add('on');

  if (isPending) {
    toast('info', 'Submitted for Approval',
      `${name} (${assetCode}) sent to manager for approval.`);
  } else {
    toast('success', 'Asset Registered', `${name} added · ID: ${assetCode}`);
  }
}

// ── Edit Asset ────────────────────────────────────────────────────────────────
async function openEditAsset(assetId) {
  if (!window.AMS.permissions?.requirePermission('edit_assets', 'Edit assets')) return;

  assetState.editingAssetId = assetId;

  const { data, error } = await window.AMS.db
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .single();

  if (error || !data) {
    toast('error', 'Load Error', 'Could not load asset details.');
    return;
  }

  // Fill form with existing data
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('aName',   data.name);
  set('aSerial', data.serial_number);
  set('aCat',    data.category_id);
  set('aDept',   data.department_id);
  set('aPD',     data.purchase_date);
  set('aWarr',   data.warranty_end);
  set('aVal',    data.purchase_value);
  set('aTag',    data.asset_tag);
  set('aNotes',  data.notes);

  // Change modal title and button
  const mTitle = document.querySelector('#m-addAsset .mhd h3');
  const mSub   = document.querySelector('#m-addAsset .mhd p');
  const btn    = document.getElementById('assetSubmitBtn');
  if (mTitle) mTitle.textContent = 'Edit Asset';
  if (mSub)   mSub.textContent   = `Editing: ${data.asset_code}`;
  if (btn)    btn.textContent    = 'Save Changes';

  openM('addAsset');
}

async function submitAssetEdit() {
  if (!window.AMS.permissions?.requirePermission('edit_assets', 'Edit assets')) return;

  const get = id => document.getElementById(id)?.value?.trim();
  const assetId = assetState.editingAssetId;

  if (!assetId) { submitAsset(); return; } // fallback to add

  const name   = get('aName');
  const serial = get('aSerial');
  if (!name)   { toast('error', 'Missing Field', 'Please enter an Asset Name.');  return; }
  if (!serial) { toast('error', 'Missing Field', 'Please enter a Serial Number.'); return; }

  const updatePayload = {
    name:           name,
    category_id:    get('aCat')   || null,
    serial_number:  serial,
    department_id:  get('aDept')  || null,
    purchase_date:  get('aPD')    || null,
    warranty_end:   get('aWarr')  || null,
    purchase_value: get('aVal') ? Number(get('aVal')) : null,
    asset_tag:      get('aTag')   || null,
    notes:          get('aNotes') || null,
    updated_at:     new Date().toISOString(),
  };

  const { error } = await window.AMS.db
    .from('assets')
    .update(updatePayload)
    .eq('id', assetId);

  if (error) {
    toast('error', 'Update Failed', error.message);
    return;
  }

  await window.AMS.auth.logAuditEvent('UPDATE', 'asset', assetId, `Asset updated: ${name}`);

  clearAssetForm();
  closeM('addAsset');
  assetState.editingAssetId = null;

  // Reset modal title
  const mTitle = document.querySelector('#m-addAsset .mhd h3');
  const mSub   = document.querySelector('#m-addAsset .mhd p');
  const btn    = document.getElementById('assetSubmitBtn');
  if (mTitle) mTitle.textContent = 'Register New Asset';
  if (mSub)   mSub.textContent   = 'Add a new asset to the inventory';
  if (btn)    btn.textContent    = 'Register Asset';

  await loadAssets(assetState.currentFilter);
  toast('success', 'Asset Updated', `${name} has been updated.`);
}

// Unified submit — checks if editing or adding
function handleAssetSubmit() {
  if (assetState.editingAssetId) {
    submitAssetEdit();
  } else {
    submitAsset();
  }
}

// ── Delete Asset ──────────────────────────────────────────────────────────────
function confirmDeleteAsset(assetId, assetName) {
  if (!window.AMS.permissions?.requirePermission('delete_assets', 'Delete assets')) return;
  if (confirm(`Delete "${assetName}"?\n\nThis will permanently remove the asset from the system. This action cannot be undone.`)) {
    deleteAsset(assetId, assetName);
  }
}

async function deleteAsset(assetId, assetName) {
  if (!window.AMS.permissions?.requirePermission('delete_assets', 'Delete assets')) return;
  // Check if asset is currently assigned
  const { data: alloc } = await window.AMS.db
    .from('allocations')
    .select('id')
    .eq('asset_id', assetId)
    .eq('is_active', true)
    .limit(1);

  if (alloc && alloc.length > 0) {
    toast('error', 'Cannot Delete', 'Asset is currently assigned. Return it first before deleting.');
    return;
  }

  const { error } = await window.AMS.db
    .from('assets')
    .delete()
    .eq('id', assetId);

  if (error) {
    toast('error', 'Delete Failed', error.message);
    return;
  }

  await window.AMS.auth.logAuditEvent('DELETE', 'asset', assetId, `Asset deleted: ${assetName}`);
  await loadAssets(assetState.currentFilter);
  toast('success', 'Asset Deleted', `"${assetName}" has been removed.`);
}

// ── Clear Asset Form ──────────────────────────────────────────────────────────
function clearAssetForm() {
  ['aName', 'aSerial', 'aTag', 'aPD', 'aWarr', 'aVal', 'aNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cat = document.getElementById('aCat');
  if (cat) cat.value = '';
  const dept = document.getElementById('aDept');
  if (dept) dept.value = '';
  assetState.editingAssetId = null;
}

// ── Filter Assets ─────────────────────────────────────────────────────────────
function fA(filter, btn) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  assetState.selectedIds.clear();
  updateBulkBar();
  loadAssets(filter);
}

// Alias for dashboard quick-filter navigation
function fNav(status) {
  assetState.currentFilter = status;
  nav('assets');
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  const chip = document.getElementById('chip-' + status);
  if (chip) chip.classList.add('on');
}

// ── Search (debounced) ────────────────────────────────────────────────────────
const debouncedAssetSearch = window.AMS.utils.debounce((value) => {
  loadAssets(assetState.currentFilter, 1, value);
}, 400);

// ── QR Code Generation ────────────────────────────────────────────────────────
function generateQR(assetCode, assetName) {
  const qrModal = document.getElementById('m-qr');
  if (!qrModal) return;

  // Use a free QR API to generate the QR code image
  const qrData = encodeURIComponent(`AMS:${assetCode}:${assetName}`);
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrData}&bgcolor=1a1d26&color=e2e5f0`;

  // Update QR modal content
  const qrContainer = qrModal.querySelector('[style*="dashed"]');
  if (qrContainer) {
    qrContainer.innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text)">${assetName}</div>
      <img src="${qrImgUrl}" alt="QR Code" style="border-radius:8px;display:block;margin:0 auto 12px"
        onerror="this.style.display='none'">
      <div class="mono" style="font-size:16px;font-weight:700;color:var(--accent)">${assetCode}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">Scan to look up this asset</div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn btn-primary btn-sm" onclick="printQR()">🖨️ Print QR</button>
      </div>
    `;
  }

  openM('qr');
}

function printQR() {
  window.print();
}

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportCSV() {
  if (!window.AMS.permissions?.requirePermission('export_reports', 'Export asset data')) return;

  toast('info', 'Exporting…', 'Preparing CSV file');

  const { data, error } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name, serial_number, purchase_date, purchase_value, warranty_end, status, asset_tag, notes, category_id, department_id, assigned_to')
    .order('asset_code');

  if (error) { toast('error', 'Export Failed', error.message); return; }

  // Resolve names
  const catIds     = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const deptIds    = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const profileIds = [...new Set(data.map(a => a.assigned_to).filter(Boolean))];
  const [catRes, deptRes, profileRes] = await Promise.all([
    catIds.length     ? window.AMS.db.from('asset_categories').select('id,name').in('id', catIds) : { data: [] },
    deptIds.length    ? window.AMS.db.from('departments').select('id,name').in('id', deptIds)     : { data: [] },
    profileIds.length ? window.AMS.db.from('profiles').select('id,full_name').in('id', profileIds): { data: [] },
  ]);
  const catMap     = Object.fromEntries((catRes.data     || []).map(c => [c.id, c.name]));
  const deptMap    = Object.fromEntries((deptRes.data    || []).map(d => [d.id, d.name]));
  const profileMap = Object.fromEntries((profileRes.data || []).map(p => [p.id, p.full_name]));

  const { formatDate, formatCurrency } = window.AMS.utils;
  const statusLabels = window.AMS.config.assetStatus;

  const headers = [
    'Asset ID', 'Name', 'Category', 'Serial No.', 'Department',
    'Assigned To', 'Purchase Date', 'Warranty Expiry', 'Purchase Value', 'Status', 'Asset Tag', 'Notes'
  ];

  const rows = data.map(a => [
    a.asset_code,
    a.name,
    catMap[a.category_id]    || '',
    a.serial_number          || '',
    deptMap[a.department_id] || '',
    profileMap[a.assigned_to]|| '',
    a.purchase_date          || '',
    a.warranty_end           || '',
    a.purchase_value         || 0,
    statusLabels[a.status]   || a.status,
    a.asset_tag              || '',
    a.notes                  || '',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ams_assets_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  await window.AMS.auth.logAuditEvent('EXPORT', 'asset', null, `Asset list exported to CSV (${data.length} records)`);
  toast('success', 'Exported', `${data.length} assets exported to CSV`);
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(type) {
  const totalPages = Math.ceil(assetState.totalCount / assetState.pageSize);
  const current    = assetState.currentPage;

  // Find or create pagination container (append after .card in assets page)
  let pager = document.getElementById('assetPager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'assetPager';
    pager.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 18px;font-size:12px;color:var(--text2)';
    document.querySelector('#page-assets .card')?.appendChild(pager);
  }

  if (totalPages <= 1) { pager.innerHTML = ''; return; }

  pager.innerHTML = `
    <span>Showing ${((current-1)*assetState.pageSize)+1}–${Math.min(current*assetState.pageSize, assetState.totalCount)} of ${assetState.totalCount} assets</span>
    <div style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-xs" ${current===1?'disabled':''} onclick="loadAssets('${assetState.currentFilter}',${current-1},'${assetState.searchQuery}')">‹ Prev</button>
      <span style="padding:0 10px;display:flex;align-items:center">${current} / ${totalPages}</span>
      <button class="btn btn-ghost btn-xs" ${current===totalPages?'disabled':''} onclick="loadAssets('${assetState.currentFilter}',${current+1},'${assetState.searchQuery}')">Next ›</button>
    </div>
  `;
}

// ── Notify managers about pending asset approval ──────────────────────────────
async function notifyManagers(assetId, assetName, assetCode, submittedBy) {
  try {
    // Get all managers and admins
    const { data: managers } = await window.AMS.db
      .from('profiles')
      .select('id')
      .in('role', ['Manager', 'Admin', 'Super Admin'])
      .eq('status', 'active');

    if (!managers?.length) return;

    const submitterName = submittedBy?.full_name || submittedBy?.email || 'An employee';
    const notifications = managers.map(m => ({
      user_id: m.id,
      title:   'Asset Approval Required',
      message: `${submitterName} submitted ${assetCode} — "${assetName}" for approval.`,
      type:    'system',
      is_read: false,
    }));

    await window.AMS.db.from('notifications').insert(notifications);
  } catch (e) {
    console.warn('[Assets] Could not send manager notifications:', e.message);
  }
}

// ── Approve / Reject pending asset (Manager only) ─────────────────────────────
async function approveAsset(assetId, assetName) {
  if (!window.AMS.permissions?.requirePermission('approve_assets', 'Approve assets')) return;

  const { error } = await window.AMS.db
    .from('assets')
    .update({ status: 'available', updated_at: new Date().toISOString() })
    .eq('id', assetId);

  if (error) { toast('error', 'Approval Failed', error.message); return; }

  // Notify the employee who submitted it
  const { data: asset } = await window.AMS.db
    .from('assets')
    .select('created_by, asset_code, name')
    .eq('id', assetId)
    .single();

  if (asset?.created_by) {
    await window.AMS.db.from('notifications').insert({
      user_id: asset.created_by,
      title:   'Asset Approved ✅',
      message: `Your asset ${asset.asset_code} — "${asset.name}" has been approved and is now active.`,
      type:    'assignment',
      is_read: false,
    });
  }

  await window.AMS.auth.logAuditEvent('UPDATE', 'asset', assetId,
    `Asset approved: ${assetName}`);

  await loadAssets(assetState.currentFilter);
  await window.AMS.permissions?.loadPendingCount();
  toast('success', 'Asset Approved', `"${assetName}" is now available in the inventory.`);
}

async function rejectAsset(assetId, assetName) {
  if (!window.AMS.permissions?.requirePermission('reject_assets', 'Reject assets')) return;

  const reason = prompt(`Reason for rejecting "${assetName}" (optional):`);
  if (reason === null) return; // cancelled

  const { error } = await window.AMS.db
    .from('assets')
    .update({ status: 'disposed', notes: `Rejected: ${reason || 'No reason given'}`, updated_at: new Date().toISOString() })
    .eq('id', assetId);

  if (error) { toast('error', 'Rejection Failed', error.message); return; }

  // Notify employee
  const { data: asset } = await window.AMS.db
    .from('assets')
    .select('created_by, asset_code, name')
    .eq('id', assetId)
    .single();

  if (asset?.created_by) {
    await window.AMS.db.from('notifications').insert({
      user_id: asset.created_by,
      title:   'Asset Registration Rejected',
      message: `Your asset ${asset.asset_code} — "${asset.name}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      type:    'alert',
      is_read: false,
    });
  }

  await window.AMS.auth.logAuditEvent('UPDATE', 'asset', assetId,
    `Asset rejected: ${assetName}${reason ? ' — ' + reason : ''}`);

  await loadAssets(assetState.currentFilter);
  await window.AMS.permissions?.loadPendingCount();
  toast('info', 'Asset Rejected', `"${assetName}" has been rejected.`);
}

// ── Load Pending Approvals page (Manager view) ────────────────────────────────
async function loadPendingApprovals() {
  const container = document.getElementById('pendingApprovalsBody');
  if (!container) return;

  if (!window.AMS.permissions?.can('approve_assets')) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text3)">
      You don't have permission to approve assets.
    </td></tr>`;
    return;
  }

  container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">⏳ Loading…</td></tr>`;

  const { data, error } = await window.AMS.db
    .from('assets')
    .select('id, asset_code, name, serial_number, purchase_date, purchase_value, created_at, category_id, department_id, created_by')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red);padding:24px">❌ ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">✅</div>
      <b>No pending approvals</b><br>
      <div style="font-size:12px;margin-top:4px">All asset registrations are up to date</div>
    </td></tr>`;
    await window.AMS.permissions?.loadPendingCount();
    return;
  }

  // Resolve names
  const catIds  = [...new Set(data.map(a => a.category_id).filter(Boolean))];
  const deptIds = [...new Set(data.map(a => a.department_id).filter(Boolean))];
  const userIds = [...new Set(data.map(a => a.created_by).filter(Boolean))];
  const [catRes, deptRes, userRes] = await Promise.all([
    catIds.length  ? window.AMS.db.from('asset_categories').select('id,name').in('id', catIds)  : { data: [] },
    deptIds.length ? window.AMS.db.from('departments').select('id,name').in('id', deptIds)      : { data: [] },
    userIds.length ? window.AMS.db.from('profiles').select('id,full_name,email').in('id', userIds) : { data: [] },
  ]);
  const catMap  = Object.fromEntries((catRes.data  || []).map(x => [x.id, x.name]));
  const deptMap = Object.fromEntries((deptRes.data || []).map(x => [x.id, x.name]));
  const userMap = Object.fromEntries((userRes.data || []).map(x => [x.id, x.full_name || x.email]));

  const { sanitize, formatDate, formatCurrency, timeAgo } = window.AMS.utils;

  container.innerHTML = data.map(a => `
    <tr>
      <td class="mono">${sanitize(a.asset_code)}</td>
      <td><b>${sanitize(a.name)}</b></td>
      <td>${sanitize(catMap[a.category_id] || '—')}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${sanitize(a.serial_number || '—')}</td>
      <td>${sanitize(deptMap[a.department_id] || '—')}</td>
      <td>${formatCurrency(a.purchase_value)}</td>
      <td>
        <div style="font-size:12px;font-weight:600">${sanitize(userMap[a.created_by] || '—')}</div>
        <div style="font-size:11px;color:var(--text3)">${timeAgo(a.created_at)}</div>
      </td>
      <td style="display:flex;gap:5px">
        <button class="btn btn-success btn-xs" onclick="approveAsset('${a.id}','${sanitize(a.name)}')">
          ✅ Approve
        </button>
        <button class="btn btn-danger btn-xs" onclick="rejectAsset('${a.id}','${sanitize(a.name)}')">
          ✕ Reject
        </button>
      </td>
    </tr>
  `).join('');

  await window.AMS.permissions?.loadPendingCount();
}

// ── Load category and department dropdowns ────────────────────────────────────
async function loadAssetFormDropdowns() {
  // Load categories
  const { data: cats } = await window.AMS.db
    .from('asset_categories')
    .select('id, name')
    .order('name');

  const catSel = document.getElementById('aCat');
  if (catSel && cats) {
    catSel.innerHTML = '<option value="">Select Category</option>' +
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  // Load departments
  const { data: depts } = await window.AMS.db
    .from('departments')
    .select('id, name')
    .order('name');

  const deptSel = document.getElementById('aDept');
  if (deptSel && depts) {
    deptSel.innerHTML = '<option value="">Select Department</option>' +
      depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  }
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadAssets         = loadAssets;
window.renderAssetTable   = renderAssetTable;
window.toggleAssetRow     = toggleAssetRow;
window.selAllTog          = selAllTog;
window.clearSel           = clearSel;
window.updateBulkBar      = updateBulkBar;
window.submitAsset        = handleAssetSubmit;   // replaces original
window.fA                 = fA;
window.fNav               = fNav;
window.openEditAsset      = openEditAsset;
window.confirmDeleteAsset = confirmDeleteAsset;
window.approveAsset       = approveAsset;
window.rejectAsset        = rejectAsset;
window.loadPendingApprovals = loadPendingApprovals;
window.generateQR         = generateQR;
window.printQR            = printQR;
window.exportCSV          = exportCSV;
window.loadAssetFormDropdowns = loadAssetFormDropdowns;
window.debouncedAssetSearch   = debouncedAssetSearch;
window.AMS.assets = { loadAssets, refreshAssetCounts, assetState };
