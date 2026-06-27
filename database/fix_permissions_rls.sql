-- ============================================================================
-- AMS Pro — Tighten RLS for role-based authorization
-- Run in Supabase SQL Editor after schema.sql and fix_rls.sql
-- ============================================================================

-- Maintenance: only managers+ can approve/complete; employees can edit own pending requests only
DROP POLICY IF EXISTS "maintenance_update" ON maintenance;

CREATE POLICY "maintenance_update_manager"
  ON maintenance FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Super Admin', 'Admin', 'Manager'));

CREATE POLICY "maintenance_update_reporter_pending"
  ON maintenance FOR UPDATE
  TO authenticated
  USING (reported_by = auth.uid() AND status = 'pending')
  WITH CHECK (reported_by = auth.uid() AND status = 'pending');

-- Allocations: employees cannot issue assets (insert) — already manager-only in schema
-- Optional: employees can update only their own active allocation for return
DROP POLICY IF EXISTS "allocations_update" ON allocations;

CREATE POLICY "allocations_update_manager"
  ON allocations FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Super Admin', 'Admin', 'Manager'));

CREATE POLICY "allocations_update_own_return"
  ON allocations FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid() AND is_active = true)
  WITH CHECK (assigned_to = auth.uid());

-- Assets: employees cannot change asset status directly
DROP POLICY IF EXISTS "assets_update_manager" ON assets;

CREATE POLICY "assets_update_manager"
  ON assets FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Super Admin', 'Admin', 'Manager'));
