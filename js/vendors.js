/**
 * vendors.js
 * AMS Pro — Vendor Management Module
 *
 * Handles:
 * - List vendors as cards
 * - Add vendor
 * - Edit vendor
 * - View assets linked to vendor
 *
 * DEPENDS ON: supabase.js, auth.js
 */

let vendorState = { editingId: null };

// ── Load Vendors ──────────────────────────────────────────────────────────────
async function loadVendors() {
  const container = document.querySelector('#page-vendors .gauto');
  if (!container) return;

  container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)">
    <span style="font-size:24px">⏳</span><br>Loading vendors…
  </div>`;

  const { data, error } = await window.AMS.db
    .from('vendors')
    .select('*')
    .order('name');

  if (error) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red)">
      ❌ Failed to load vendors: ${error.message}
    </div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:10px">🏢</div>
      <b>No vendors added yet</b><br>
      <div style="font-size:12px;margin-top:4px">Add your first vendor to get started</div>
    </div>`;
    return;
  }

  // Get asset counts per vendor
  const { data: assetData } = await window.AMS.db
    .from('assets')
    .select('vendor_id');

  const vendorAssetCounts = {};
  (assetData || []).forEach(a => {
    if (a.vendor_id) vendorAssetCounts[a.vendor_id] = (vendorAssetCounts[a.vendor_id] || 0) + 1;
  });

  renderVendorCards(data, vendorAssetCounts);
}

// ── Render Vendor Cards ───────────────────────────────────────────────────────
function renderVendorCards(vendors, assetCounts = {}) {
  const container = document.querySelector('#page-vendors .gauto');
  if (!container) return;

  const { sanitize } = window.AMS.utils;
  const canManage = window.AMS.permissions?.can('manage_vendors');

  const categoryIcons = {
    Laptops: '💻', Servers: '🖥️', Networking: '🌐',
    Printers: '🖨️', Furniture: '🪑', 'AC Units': '❄️',
    Projectors: '📽️', Monitors: '🖥️', Software: '💿', Default: '🏢',
  };

  container.innerHTML = vendors.map(v => {
    const count     = assetCounts[v.id] || 0;
    const tags      = v.categories || [];
    const iconEmoji = categoryIcons[tags[0]] || categoryIcons.Default;

    return `
      <div class="vcard">
        <div class="vcard-logo">${iconEmoji}</div>
        <div class="vcard-name">${sanitize(v.name)}</div>
        <div class="vcard-id">${sanitize(v.vendor_code)}</div>
        ${v.phone    ? `<div class="vcard-info">📞 ${sanitize(v.phone)}</div>`   : ''}
        ${v.email    ? `<div class="vcard-info">✉ ${sanitize(v.email)}</div>`    : ''}
        ${v.address  ? `<div class="vcard-info">📍 ${sanitize(v.address)}</div>` : ''}
        <div class="vcard-tags">
          ${tags.map(t => `<span class="vcard-tag">${sanitize(t)}</span>`).join('')}
        </div>
        <div style="margin-top:12px;display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--text3)">${count} asset${count !== 1 ? 's' : ''}</span>
          <div style="margin-left:auto;display:flex;gap:5px">
            ${canManage ? `<button class="btn btn-ghost btn-xs" onclick="openEditVendor('${v.id}')">Edit</button>` : ''}
            <button class="btn btn-ghost btn-xs" onclick="viewVendorAssets('${v.id}','${sanitize(v.name)}')">View Assets</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Add Vendor ────────────────────────────────────────────────────────────────
async function submitVendor() {
  if (!window.AMS.permissions?.requirePermission('manage_vendors', 'Manage vendors')) return;

  const get = id => document.getElementById(id)?.value?.trim();

  const name    = get('vName');
  const email   = get('vEmail');
  const phone   = get('vPhone');
  const address = get('vAddress');
  const cats    = get('vCategories');
  const website = get('vWebsite');
  const contact = get('vContact');

  if (!name) { toast('error', 'Missing Field', 'Please enter the vendor name.'); return; }

  const submitBtn = document.getElementById('vendorSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  // Get next vendor code
  const { count } = await window.AMS.db
    .from('vendors')
    .select('id', { count: 'exact', head: true });

  const vendorCode = 'VND-' + String((count || 0) + 1).padStart(3, '0');

  const payload = {
    vendor_code:   vendorCode,
    name:          name,
    email:         email || null,
    phone:         phone || null,
    address:       address || null,
    website:       website || null,
    contact_name:  contact || null,
    categories:    cats ? cats.split(',').map(s => s.trim()).filter(Boolean) : [],
  };

  const isEditing = !!vendorState.editingId;

  let error;
  let vendorId = vendorState.editingId;

  if (isEditing) {
    const res = await window.AMS.db
      .from('vendors')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', vendorId);
    error = res.error;
  } else {
    const res = await window.AMS.db
      .from('vendors')
      .insert(payload)
      .select()
      .single();
    error = res.error;
    if (res.data) vendorId = res.data.id;
  }

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isEditing ? 'Save Changes' : 'Add Vendor'; }

  if (error) {
    toast('error', isEditing ? 'Update Failed' : 'Save Failed', error.message);
    return;
  }

  const action = isEditing ? 'UPDATE' : 'CREATE';
  await window.AMS.auth.logAuditEvent(action, 'vendor', vendorId, `Vendor ${isEditing ? 'updated' : 'added'}: ${name}`);

  clearVendorForm();
  closeM('addVendor');
  vendorState.editingId = null;
  await loadVendors();

  toast('success', isEditing ? 'Vendor Updated' : 'Vendor Added', `${name} has been ${isEditing ? 'updated' : 'added'}.`);
}

// ── Edit Vendor ───────────────────────────────────────────────────────────────
async function openEditVendor(vendorId) {
  vendorState.editingId = vendorId;

  const { data, error } = await window.AMS.db
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .single();

  if (error || !data) {
    toast('error', 'Load Error', 'Could not load vendor details.');
    return;
  }

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('vName',       data.name);
  set('vEmail',      data.email);
  set('vPhone',      data.phone);
  set('vAddress',    data.address);
  set('vWebsite',    data.website);
  set('vContact',    data.contact_name);
  set('vCategories', (data.categories || []).join(', '));

  const mTitle = document.querySelector('#m-addVendor .mhd h3');
  const btn    = document.getElementById('vendorSubmitBtn');
  if (mTitle) mTitle.textContent = 'Edit Vendor';
  if (btn)    btn.textContent    = 'Save Changes';

  openM('addVendor');
}

// ── View Vendor Assets ────────────────────────────────────────────────────────
async function viewVendorAssets(vendorId, vendorName) {
  const { data, error } = await window.AMS.db
    .from('assets')
    .select('asset_code, name, status, purchase_date')
    .eq('vendor_id', vendorId);

  if (error) { toast('error', 'Load Error', error.message); return; }

  if (!data || data.length === 0) {
    toast('info', vendorName, 'No assets linked to this vendor.');
    return;
  }

  const { formatDate } = window.AMS.utils;
  const list = data.map(a => `• ${a.asset_code} — ${a.name} (${formatDate(a.purchase_date)})`).join('\n');
  alert(`Assets from ${vendorName}:\n\n${list}`);
}

// ── Clear Vendor Form ─────────────────────────────────────────────────────────
function clearVendorForm() {
  ['vName', 'vEmail', 'vPhone', 'vAddress', 'vWebsite', 'vContact', 'vCategories'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  vendorState.editingId = null;
  const mTitle = document.querySelector('#m-addVendor .mhd h3');
  const btn    = document.getElementById('vendorSubmitBtn');
  if (mTitle) mTitle.textContent = 'Add New Vendor';
  if (btn)    btn.textContent    = 'Add Vendor';
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadVendors       = loadVendors;
window.submitVendor      = submitVendor;
window.openEditVendor    = openEditVendor;
window.viewVendorAssets  = viewVendorAssets;
window.AMS.vendors = { loadVendors };
