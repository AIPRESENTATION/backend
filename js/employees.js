/**
 * employees.js
 * AMS Pro — Employee Management Module
 *
 * Handles:
 * - List employees from `profiles` table
 * - Add employee (creates Supabase Auth user + profile row)
 * - Edit employee profile
 * - View assets assigned to employee
 * - Role badge display
 *
 * DEPENDS ON: supabase.js, auth.js
 */

// ── State ─────────────────────────────────────────────────────────────────────
let employeeState = {
  editingId: null,
};

// ── Load & Render Employees ───────────────────────────────────────────────────
async function loadEmployees() {
  const tbody = document.getElementById('empTbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text3)">
    <span style="font-size:20px">⏳</span><br>Loading employees…
  </td></tr>`;

  const { data, error } = await window.AMS.db
    .from('profiles')
    .select('id, employee_code, full_name, email, phone, designation, role, status, created_at, department_id')
    .order('full_name');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--red)">
      ❌ Failed to load employees: ${error.message}
    </td></tr>`;
    return;
  }

  // Get asset counts per employee in one query
  const { data: allocData } = await window.AMS.db
    .from('allocations')
    .select('assigned_to')
    .eq('is_active', true);

  const assetCounts = {};
  (allocData || []).forEach(a => {
    assetCounts[a.assigned_to] = (assetCounts[a.assigned_to] || 0) + 1;
  });

  // Resolve department names
  const deptIds = [...new Set(data.map(e => e.department_id).filter(Boolean))];
  const { data: deptData } = deptIds.length
    ? await window.AMS.db.from('departments').select('id,name').in('id', deptIds)
    : { data: [] };
  const deptMap = Object.fromEntries((deptData || []).map(d => [d.id, d.name]));

  renderEmployeeTable(data, assetCounts, deptMap);
}

// ── Render Employee Table ─────────────────────────────────────────────────────
function renderEmployeeTable(employees, assetCounts = {}, deptMap = {}) {
  const tbody = document.getElementById('empTbody');
  if (!tbody) return;

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:8px">👤</div>
      <b>No employees found</b>
    </td></tr>`;
    return;
  }

  const { sanitize } = window.AMS.utils;
  const canManage = window.AMS.permissions?.can('manage_employees');

  tbody.innerHTML = employees.map(e => {
    const count = assetCounts[e.id] || 0;
    const roleBadge = ['Super Admin', 'Admin'].includes(e.role) ? 'badge-admin' : 'badge-inactive';
    const statusBadge = e.status === 'active' ? 'badge-active' : 'badge-inactive';

    return `
      <tr data-empid="${e.id}">
        <td class="mono">${sanitize(e.employee_code || '—')}</td>
        <td><b>${sanitize(e.full_name)}</b></td>
        <td>${sanitize(deptMap[e.department_id] || '—')}</td>
        <td>${sanitize(e.designation || '—')}</td>
        <td>${sanitize(e.email)}</td>
        <td>${sanitize(e.phone || '—')}</td>
        <td>
          <span class="badge ${count > 0 ? 'badge-inuse' : 'badge-available'}">
            ${count} asset${count !== 1 ? 's' : ''}
          </span>
        </td>
        <td><span class="badge ${roleBadge}">${sanitize(e.role || 'Employee')}</span></td>
        <td><span class="badge ${statusBadge}">${e.status === 'active' ? 'Active' : 'Inactive'}</span></td>
        <td style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-xs" onclick="viewEmployeeAssets('${e.id}', '${sanitize(e.full_name)}')">
            View Assets
          </button>
          ${canManage ? `
            <button class="btn btn-ghost btn-xs" onclick="openEditEmployee('${e.id}')">Edit</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// ── Add Employee ──────────────────────────────────────────────────────────────
// NOTE: Creating a Supabase Auth user from the frontend requires the user to
// sign up themselves, OR an admin does it via the Supabase Admin API (server-side).
// For the frontend-only approach, we use Supabase's signUp and immediately
// create a profile row via a database trigger (see SQL schema).
async function submitEmployee() {
  if (!window.AMS.permissions?.requirePermission('manage_employees', 'Add employees')) return;

  const get = id => document.getElementById(id)?.value?.trim();

  const name   = get('eName');
  const email  = get('eEmail');
  const dept   = get('eDept');
  const desig  = get('eDesig');
  const phone  = get('ePhone');
  const role   = get('eRole');
  const status = get('eStatus');
  const password = get('ePassword') || 'TempPass@123'; // temp password

  if (!name)  { toast('error', 'Missing Field', 'Please enter the employee\'s full name.'); return; }
  if (!email) { toast('error', 'Missing Field', 'Please enter an email address.'); return; }
  if (!email.includes('@')) { toast('error', 'Invalid Email', 'Please enter a valid email address.'); return; }

  const submitBtn = document.getElementById('empSubmitBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

  // Preserve admin session — signUp() would otherwise switch to the new user
  const { data: { session: adminSession } } = await window.AMS.db.auth.getSession();

  const { data: signupData, error: signupError } = await window.AMS.db.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        role: role || 'Employee',
      }
    }
  });

  if (signupError) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Employee'; }
    if (signupError.message.includes('already registered')) {
      toast('error', 'Email Exists', 'This email is already registered in the system.');
    } else {
      toast('error', 'Registration Failed', signupError.message);
    }
    return;
  }

  // Restore admin session after creating the employee account
  if (adminSession) {
    await window.AMS.db.auth.setSession({
      access_token:  adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    });
  }

  const newUserId = signupData.user?.id;
  if (!newUserId) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Employee'; }
    toast('error', 'Error', 'Could not create user account.');
    return;
  }

  // Next employee code: max(USR-XXX) + 1 (not row count — avoids duplicates)
  const { data: codeRows } = await window.AMS.db
    .from('profiles')
    .select('employee_code')
    .like('employee_code', 'USR-%');

  let maxNum = 0;
  (codeRows || []).forEach(p => {
    const m = p.employee_code?.match(/^USR-(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  const empCode = 'USR-' + String(maxNum + 1).padStart(3, '0');

  // Step 2: Upsert profile with full details
  const { error: profileError } = await window.AMS.db
    .from('profiles')
    .upsert({
      id:            newUserId,
      employee_code: empCode,
      full_name:     name,
      email:         email,
      phone:         phone || null,
      designation:   desig || null,
      department_id: dept || null,
      role:          role || 'Employee',
      status:        status === 'Active' ? 'active' : 'inactive',
      avatar_color:  randomAvatarColor(),
    });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add Employee'; }

  if (profileError) {
    toast('error', 'Profile Error', profileError.message);
    return;
  }

  await window.AMS.auth.logAuditEvent('CREATE', 'employee', newUserId, `Employee added: ${name} (${empCode})`);

  // Clear form and close modal
  clearEmployeeForm();
  closeM('addEmp');

  await loadEmployees();
  toast('success', 'Employee Added', `${name} registered · ID: ${empCode} · Welcome email sent.`);
}

// ── Edit Employee ─────────────────────────────────────────────────────────────
async function openEditEmployee(empId) {
  if (!window.AMS.permissions?.requirePermission('manage_employees', 'Edit employees')) return;

  employeeState.editingId = empId;

  const { data, error } = await window.AMS.db
    .from('profiles')
    .select('*')
    .eq('id', empId)
    .single();

  if (error || !data) {
    toast('error', 'Load Error', 'Could not load employee details.');
    return;
  }

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('eName',   data.full_name);
  set('eEmail',  data.email);
  set('eDesig',  data.designation);
  set('ePhone',  data.phone);
  set('eDept',   data.department_id);
  set('eRole',   data.role);
  set('eStatus', data.status === 'active' ? 'Active' : 'Inactive');

  // Hide password field when editing
  const pwField = document.getElementById('ePasswordGroup');
  if (pwField) pwField.style.display = 'none';

  const mTitle = document.querySelector('#m-addEmp .mhd h3');
  const btn    = document.getElementById('empSubmitBtn');
  if (mTitle) mTitle.textContent = 'Edit Employee';
  if (btn)    btn.textContent    = 'Save Changes';

  openM('addEmp');
}

async function submitEmployeeEdit() {
  if (!window.AMS.permissions?.requirePermission('manage_employees', 'Edit employees')) return;

  const get = id => document.getElementById(id)?.value?.trim();
  const empId = employeeState.editingId;
  if (!empId) { submitEmployee(); return; }

  const name = get('eName');
  if (!name) { toast('error', 'Missing Field', 'Please enter the employee\'s full name.'); return; }

  const { error } = await window.AMS.db
    .from('profiles')
    .update({
      full_name:     name,
      phone:         get('ePhone') || null,
      designation:   get('eDesig') || null,
      department_id: get('eDept')  || null,
      role:          get('eRole')  || 'Employee',
      status:        get('eStatus') === 'Active' ? 'active' : 'inactive',
      updated_at:    new Date().toISOString(),
    })
    .eq('id', empId);

  if (error) {
    toast('error', 'Update Failed', error.message);
    return;
  }

  await window.AMS.auth.logAuditEvent('UPDATE', 'employee', empId, `Employee updated: ${name}`);

  clearEmployeeForm();
  closeM('addEmp');
  employeeState.editingId = null;

  // Reset modal
  const mTitle = document.querySelector('#m-addEmp .mhd h3');
  const btn    = document.getElementById('empSubmitBtn');
  const pwField = document.getElementById('ePasswordGroup');
  if (mTitle)  mTitle.textContent = 'Add New Employee';
  if (btn)     btn.textContent    = 'Add Employee';
  if (pwField) pwField.style.display = 'block';

  await loadEmployees();
  toast('success', 'Employee Updated', `${name} has been updated.`);
}

function handleEmployeeSubmit() {
  if (employeeState.editingId) submitEmployeeEdit();
  else submitEmployee();
}

// ── View Assets for Employee ──────────────────────────────────────────────────
async function viewEmployeeAssets(empId, empName) {
  const { data, error } = await window.AMS.db
    .from('allocations')
    .select('id, issue_date, expected_return, asset_id')
    .eq('assigned_to', empId)
    .eq('is_active', true);

  if (error) { toast('error', 'Load Error', error.message); return; }

  if (!data || data.length === 0) {
    toast('info', empName, 'No assets currently assigned to this employee.');
    return;
  }

  const { formatDate } = window.AMS.utils;

  // Resolve asset details
  const allocAssetIds = [...new Set(data.map(a => a.asset_id).filter(Boolean))];
  const { data: allocAssets } = allocAssetIds.length
    ? await window.AMS.db.from('assets').select('id,asset_code,name').in('id', allocAssetIds)
    : { data: [] };
  const allocAssetMap = Object.fromEntries((allocAssets || []).map(x => [x.id, x]));

  const assetList = data.map(a => {
    const asset = allocAssetMap[a.asset_id] || {};
    return `• ${asset.asset_code || '—'} — ${asset.name || '—'} (since ${formatDate(a.issue_date)})`;
  }).join('\n');

  alert(`Assets assigned to ${empName}:\n\n${assetList}`);
}

// ── Clear Employee Form ───────────────────────────────────────────────────────
function clearEmployeeForm() {
  ['eName', 'eEmail', 'eDesig', 'ePhone', 'ePassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dept = document.getElementById('eDept');
  if (dept) dept.value = '';
  const role = document.getElementById('eRole');
  if (role) role.value = 'Employee';
  const status = document.getElementById('eStatus');
  if (status) status.value = 'Active';
  employeeState.editingId = null;
}

// ── Load Department Dropdown ──────────────────────────────────────────────────
async function loadEmployeeFormDropdowns() {
  const { data: depts } = await window.AMS.db
    .from('departments')
    .select('id, name')
    .order('name');

  const deptSel = document.getElementById('eDept');
  if (deptSel && depts) {
    deptSel.innerHTML = '<option value="">Select Department</option>' +
      depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  }
}

// ── Avatar Color Helper ───────────────────────────────────────────────────────
function randomAvatarColor() {
  const colors = [
    'linear-gradient(135deg,#3b82f6,#6366f1)',
    'linear-gradient(135deg,#8b5cf6,#ec4899)',
    'linear-gradient(135deg,#10b981,#06b6d4)',
    'linear-gradient(135deg,#f59e0b,#ef4444)',
    'linear-gradient(135deg,#14b8a6,#3b82f6)',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.loadEmployees            = loadEmployees;
window.submitEmployee           = handleEmployeeSubmit;
window.openEditEmployee         = openEditEmployee;
window.viewEmployeeAssets       = viewEmployeeAssets;
window.loadEmployeeFormDropdowns = loadEmployeeFormDropdowns;
window.AMS.employees = { loadEmployees };
