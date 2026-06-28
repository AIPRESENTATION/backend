-- ============================================================================
-- AMS Pro — Seed All System Users
-- Run AFTER creating each user in Supabase Auth Dashboard
-- ============================================================================

-- Super Admin (already created)
INSERT INTO profiles (id, email, full_name, role, employee_code, status, avatar_color)
SELECT id, email, 'Admin User', 'Super Admin', 'USR-001', 'active',
  'linear-gradient(135deg,#3b82f6,#6366f1)'
FROM auth.users WHERE email = 'admin@acme.in'
ON CONFLICT (id) DO UPDATE SET
  role='Super Admin', full_name='Admin User', employee_code='USR-001', status='active';

-- Manager
INSERT INTO profiles (id, email, full_name, role, employee_code, status, avatar_color)
SELECT id, email, 'Manager User', 'Manager', 'USR-002', 'active',
  'linear-gradient(135deg,#10b981,#06b6d4)'
FROM auth.users WHERE email = 'manager@acme.in'
ON CONFLICT (id) DO UPDATE SET
  role='Manager', full_name='Manager User', employee_code='USR-002', status='active';

-- Employee
INSERT INTO profiles (id, email, full_name, role, employee_code, status, avatar_color)
SELECT id, email, 'Employee User', 'Employee', 'USR-003', 'active',
  'linear-gradient(135deg,#f59e0b,#ef4444)'
FROM auth.users WHERE email = 'employee@acme.in'
ON CONFLICT (id) DO UPDATE SET
  role='Employee', full_name='Employee User', employee_code='USR-003', status='active';

-- Verify all users
SELECT employee_code, full_name, email, role, status FROM profiles ORDER BY employee_code;
