-- ============================================================================
-- AMS Pro — RLS Fix
-- Run AFTER schema.sql in Supabase SQL Editor (safe to re-run)
-- ============================================================================

-- Drop the blocking insert policy (trigger needs to insert freely)
DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

-- Allow the trigger (service role) to insert profiles on signup
-- Regular users can insert their OWN profile row only
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Make sure everyone can read all profiles (needed for dropdowns)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow audit_logs insert without requiring currentUser (for login event)
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Also allow anon to insert audit logs (login happens before auth completes)
DROP POLICY IF EXISTS "audit_insert_anon" ON audit_logs;
CREATE POLICY "audit_insert_anon"
  ON audit_logs FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anon to read departments (signup form dropdown)
DROP POLICY IF EXISTS "departments_select_anon" ON departments;
CREATE POLICY "departments_select_anon"
  ON departments FOR SELECT
  TO anon
  USING (true);
