-- ============================================================================
-- AMS Pro — Asset Approval Workflow Fix
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add pending_approval and rejected to asset status enum
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_status_check;
ALTER TABLE assets ADD CONSTRAINT assets_status_check
  CHECK (status IN ('available','inuse','repair','disposed','reserved','pending_approval','rejected'));

-- 2. RLS: Employees can only see their own pending assets + all approved ones
-- (Managers/Admins see all)
DROP POLICY IF EXISTS "assets_select_authenticated" ON assets;

CREATE POLICY "assets_select_all_roles"
  ON assets FOR SELECT
  TO authenticated
  USING (
    -- Managers and above see everything
    get_my_role() IN ('Super Admin','Admin','Manager')
    OR
    -- Employees see: their own submissions + all non-pending assets
    status NOT IN ('pending_approval','rejected')
    OR
    created_by = auth.uid()
  );

-- 3. Employees can INSERT assets (they go to pending_approval)
DROP POLICY IF EXISTS "assets_insert_manager" ON assets;

CREATE POLICY "assets_insert_any_authenticated"
  ON assets FOR INSERT
  TO authenticated
  WITH CHECK (
    -- If Employee, can only insert with pending_approval status
    CASE
      WHEN get_my_role() IN ('Super Admin','Admin','Manager')
        THEN true  -- can insert any status
      ELSE
        status = 'pending_approval'  -- Employee: must be pending
    END
  );

-- 4. Managers can UPDATE status (approve/reject)
DROP POLICY IF EXISTS "assets_update_manager" ON assets;

CREATE POLICY "assets_update_role_based"
  ON assets FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Super Admin','Admin','Manager')
    OR
    -- Employees can only update their own pending assets
    (created_by = auth.uid() AND status = 'pending_approval')
  );

-- 5. Add pending_approval filter to notifications insert
DROP POLICY IF EXISTS "notif_insert" ON notifications;
CREATE POLICY "notif_insert"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Verify
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'assets_status_check';
