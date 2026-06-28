/**
 * permissions.js
 * AMS Pro — Role-Based Permission System
 *
 * ROLES:
 *   Super Admin  → full access
 *   Admin        → full access (same as Super Admin)
 *   Manager      → approve assets, approve maintenance, assign, view all
 *   Employee     → submit assets for approval, view own, request maintenance
 *
 * ASSET WORKFLOW:
 *   Employee adds asset → status = 'pending_approval'
 *   Manager/Admin sees it in "Pending Approvals" → Approve → status = 'available'
 *                                                → Reject  → status = 'rejected'
 */

const ROLE_PERMISSIONS = {
  'Super Admin': [
    'view_assets', 'register_assets', 'edit_assets', 'delete_assets',
    'approve_assets', 'reject_assets',
    'assign_assets', 'request_return',
    'view_employees', 'manage_employees',
    'view_vendors', 'manage_vendors',
    'view_allocation', 'manage_allocation',
    'request_maintenance', 'approve_maintenance', 'complete_maintenance',
    'view_reports', 'export_reports',
    'view_audit', 'view_settings', 'manage_settings',
    'view_notifications',
  ],
  'Admin': [
    'view_assets', 'register_assets', 'edit_assets', 'delete_assets',
    'approve_assets', 'reject_assets',
    'assign_assets', 'request_return',
    'view_employees', 'manage_employees',
    'view_vendors', 'manage_vendors',
    'view_allocation', 'manage_allocation',
    'request_maintenance', 'approve_maintenance', 'complete_maintenance',
    'view_reports', 'export_reports',
    'view_audit', 'view_settings', 'manage_settings',
    'view_notifications',
  ],
  'Manager': [
    'view_assets', 'register_assets', 'edit_assets',
    'approve_assets', 'reject_assets',
    'assign_assets', 'request_return',
    'view_employees',
    'view_vendors',
    'view_allocation', 'manage_allocation',
    'request_maintenance', 'approve_maintenance', 'complete_maintenance',
    'view_reports', 'export_reports',
    'view_audit',
    'view_notifications',
  ],
  'Employee': [
    'view_assets', 'register_assets',   // submits for approval
    'request_return',
    'view_employees',
    'view_vendors',
    'view_allocation',
    'request_maintenance',
    'view_notifications',
  ],
};

// ── Permission check helpers ──────────────────────────────────────────────────
function can(permission) {
  const user = window.AMS.auth.getCurrentUser();
  if (!user) return false;
  const role = user.role || 'Employee';
  return (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Employee']).includes(permission);
}

function requirePermission(permission, actionName = 'perform this action') {
  if (!can(permission)) {
    toast('error', 'Access Denied',
      `You don't have permission to ${actionName}. Contact your manager.`);
    return false;
  }
  return true;
}

// ── Apply role restrictions to UI ─────────────────────────────────────────────
function applyRoleRestrictions(role) {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['Employee'];

  // Settings nav — only Admin+
  if (!perms.includes('view_settings')) {
    document.getElementById('n-settings')?.style.setProperty('display', 'none');
  }
  // Audit nav — Manager+
  if (!perms.includes('view_audit')) {
    document.getElementById('n-audit')?.style.setProperty('display', 'none');
  }

  // "Add Asset" topbar button — shown to all (Employee submits for approval)
  // but hide if they truly can't register
  if (!perms.includes('register_assets')) {
    document.querySelector('.topbar .btn-primary')?.style.setProperty('display', 'none');
  }

  // Show Pending Approvals nav item only to Manager+
  const pendingNav = document.getElementById('n-pending');
  if (pendingNav) {
    pendingNav.style.display = perms.includes('approve_assets') ? 'flex' : 'none';
  }

  // Store resolved role on window for quick access
  window.AMS._userRole = role;
}

// ── Pending approvals count (for Manager badge) ───────────────────────────────
async function loadPendingCount() {
  if (!can('approve_assets')) return;

  const { count } = await window.AMS.db
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval');

  const badge = document.getElementById('n-pending-badge');
  if (badge) {
    badge.textContent = count || 0;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

// ── Expose ────────────────────────────────────────────────────────────────────
window.AMS.permissions = { can, requirePermission, applyRoleRestrictions, loadPendingCount };
