/**
 * permissions.js — AMS Pro Role-Based Access Control
 *
 * Roles: Super Admin > Admin > Manager > Employee
 * DB RLS enforces server-side rules; this module mirrors them in the UI.
 */

const ROLE_LEVEL = {
  'Super Admin': 4,
  'Admin':       3,
  'Manager':     2,
  'Employee':    1,
};

/** Minimum role level required per permission */
const PERMISSIONS = {
  // Everyone
  view_dashboard:    1,
  view_assets:       1,
  view_allocations:  1,
  view_maintenance:  1,
  view_vendors:      1,
  view_employees:    1,
  view_reports:      1,
  view_notifications: 1,
  log_maintenance:   1,
  request_return:    1,

  // Manager and above
  assign_assets:       2,
  register_assets:   2,
  edit_assets:         2,
  approve_maintenance: 2,
  complete_maintenance: 2,
  manage_vendors:      2,
  view_audit:          2,
  view_depreciation:   2,
  export_reports:      2,

  // Admin and above
  delete_assets:     3,
  manage_employees:  3,
  manage_settings:   3,

  // Super Admin only
  dispose_assets:    4,
};

const PAGE_PERMISSIONS = {
  dashboard:     'view_dashboard',
  assets:        'view_assets',
  employees:     'view_employees',
  allocation:    'view_allocations',
  maintenance:   'view_maintenance',
  vendors:       'view_vendors',
  reports:       'view_reports',
  notifications: 'view_notifications',
  audit:         'view_audit',
  depreciation:  'view_depreciation',
  settings:      'manage_settings',
};

const MODAL_PERMISSIONS = {
  addAsset:    'register_assets',
  issueAsset:  'assign_assets',
  returnAsset: 'request_return',
  addMaint:    'log_maintenance',
  addVendor:   'manage_vendors',
  addEmp:      'manage_employees',
};

function getRole() {
  return window.AMS?.auth?.getCurrentUser()?.role || 'Employee';
}

function roleLevel(role) {
  return ROLE_LEVEL[role] || 1;
}

function can(permission) {
  const min = PERMISSIONS[permission];
  if (min == null) return false;
  return roleLevel(getRole()) >= min;
}

function requirePermission(permission, actionLabel) {
  if (can(permission)) return true;
  toast('error', 'Not Authorized', `${actionLabel || 'This action'} requires ${permissionLabel(permission)} access.`);
  return false;
}

function permissionLabel(permission) {
  const min = PERMISSIONS[permission];
  if (!min) return 'higher';
  const role = Object.entries(ROLE_LEVEL).find(([, v]) => v === min)?.[0];
  return role || 'Manager';
}

function canAccessPage(page) {
  const perm = PAGE_PERMISSIONS[page];
  return !perm || can(perm);
}

/** Hide nav items and action buttons the current role
 cannot use */
function applyUIPermissions() {
  const role = getRole();

  // Sidebar nav
  Object.entries({
    'n-settings':     'manage_settings',
    'n-audit':        'view_audit',
    'n-depreciation': 'view_depreciation',
  }).forEach(([id, perm]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = can(perm) ? '' : 'none';
  });

  // Top bar + page header buttons
  document.querySelectorAll('[data-perm]').forEach(el => {
    el.style.display = can(el.dataset.perm) ? '' : 'none';
  });

  // Employee: hide bulk actions on assets
  const bulkBar = document.getElementById('bulkBar');
  if (bulkBar && !can('assign_assets')) {
    bulkBar.querySelectorAll('.bb-actions button:not([onclick*="clearSel"])').forEach(b => {
      b.style.display = 'none';
    });
  }

  // Show role hint in sidebar
  const sfRole = document.querySelector('.sf-role');
  if (sfRole) {
    sfRole.title = role === 'Employee'
      ? 'You can view assets and submit maintenance requests. Manager approval required for assignments.'
      : '';
  }
}

function applyRoleRestrictions(role) {
  applyUIPermissions();
}

window.AMS.permissions = {
  getRole, can, requirePermission, canAccessPage,
  applyUIPermissions, applyRoleRestrictions, PERMISSIONS, PAGE_PERMISSIONS, MODAL_PERMISSIONS,
};
