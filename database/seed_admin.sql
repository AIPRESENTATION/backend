-- ============================================================================
-- AMS Pro — Admin User Profile (Step 3 of setup)
-- Run AFTER schema.sql + fix_rls.sql
--
-- PREREQUISITE: Create auth user first in Supabase Dashboard:
--   Authentication → Users → Add User
--   Email: admin@acme.in   Password: Admin@123456
--
-- Safe to re-run. Links profile to auth user BY EMAIL (not hardcoded UUID).
-- You can have unlimited users — signup in the app or add via Employees page.
-- ============================================================================

DO $$
DECLARE
  admin_id   UUID;
  emp_code   TEXT;
  max_num    INTEGER;
BEGIN
  -- Find admin in Supabase Auth
  SELECT id INTO admin_id
  FROM auth.users
  WHERE email = 'admin@acme.in'
  LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No auth user for admin@acme.in — create user in Authentication → Users first.';
  END IF;

  -- Keep existing code, or assign next free USR-XXX
  SELECT employee_code INTO emp_code
  FROM profiles
  WHERE id = admin_id;

  IF emp_code IS NULL OR emp_code = '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE employee_code = 'USR-001' AND id <> admin_id
    ) THEN
      emp_code := 'USR-001';
    ELSE
      SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 5) AS INTEGER)), 0)
      INTO max_num
      FROM profiles
      WHERE employee_code ~ '^USR-[0-9]+$';

      emp_code := 'USR-' || LPAD((max_num + 1)::TEXT, 3, '0');
    END IF;
  END IF;

  INSERT INTO profiles (
    id, email, full_name, role, employee_code, status, avatar_color
  )
  SELECT
    admin_id,
    u.email,
    'Admin User',
    'Super Admin',
    emp_code,
    'active',
    'linear-gradient(135deg,#3b82f6,#6366f1)'
  FROM auth.users u
  WHERE u.id = admin_id
  ON CONFLICT (id) DO UPDATE SET
    role          = 'Super Admin',
    full_name     = 'Admin User',
    email         = EXCLUDED.email,
    status        = 'active',
    -- Never overwrite an existing employee_code (avoids USR-001 duplicate error)
    employee_code = COALESCE(profiles.employee_code, EXCLUDED.employee_code);
END $$;

-- Verify admin profile
SELECT id, email, full_name, role, employee_code, status
FROM profiles
WHERE email = 'admin@acme.in';
