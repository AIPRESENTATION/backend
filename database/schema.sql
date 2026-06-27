-- ============================================================================
-- AMS Pro — Complete PostgreSQL Schema for Supabase
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ROLES (lookup table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name  TEXT NOT NULL UNIQUE  -- 'Super Admin', 'Admin', 'Manager', 'Employee'
);

INSERT INTO roles (name) VALUES
  ('Super Admin'), ('Admin'), ('Manager'), ('Employee')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. DEPARTMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS departments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  code       TEXT,
  manager_id UUID,  -- FK to profiles (added after profiles table)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO departments (name, code) VALUES
  ('Engineering',  'ENG'),
  ('HR',           'HR'),
  ('IT',           'IT'),
  ('Finance',      'FIN'),
  ('Design',       'DSN'),
  ('Operations',   'OPS'),
  ('Marketing',    'MKT'),
  ('Conference',   'CNF'),
  ('Management',   'MGT')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 3. PROFILES (extends auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code   TEXT UNIQUE,
  full_name       TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT,
  designation     TEXT,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  role            TEXT NOT NULL DEFAULT 'Employee'
                  CHECK (role IN ('Super Admin','Admin','Manager','Employee')),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
  avatar_color    TEXT DEFAULT 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from departments.manager_id to profiles (safe to re-run)
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_dept_manager;
ALTER TABLE departments
  ADD CONSTRAINT fk_dept_manager
  FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. ASSET CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_categories (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL UNIQUE,
  icon               TEXT DEFAULT '📦',
  depreciation_rate  NUMERIC(5,2) DEFAULT 20.00,  -- % per year (straight-line)
  useful_life_years  INTEGER DEFAULT 5,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO asset_categories (name, icon, depreciation_rate, useful_life_years) VALUES
  ('Laptop',      '💻', 25.00, 4),
  ('Desktop',     '🖥️', 20.00, 5),
  ('Server',      '🗄️', 15.00, 7),
  ('Printer',     '🖨️', 20.00, 5),
  ('Networking',  '🌐', 20.00, 5),
  ('Monitor',     '🖥️', 20.00, 5),
  ('Projector',   '📽️', 20.00, 5),
  ('AC Unit',     '❄️', 10.00, 10),
  ('Furniture',   '🪑', 10.00, 10),
  ('Software',    '💿', 33.33, 3),
  ('Mobile',      '📱', 33.33, 3),
  ('Camera',      '📷', 20.00, 5),
  ('Other',       '📦', 20.00, 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 5. VENDORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_code   TEXT UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  website       TEXT,
  contact_name  TEXT,
  categories    TEXT[] DEFAULT '{}',   -- array of category names for display
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. ASSETS (core table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_code      TEXT UNIQUE NOT NULL,    -- e.g. AST-001
  name            TEXT NOT NULL,
  serial_number   TEXT UNIQUE,
  asset_tag       TEXT,
  category_id     UUID REFERENCES asset_categories(id) ON DELETE SET NULL,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  purchase_date   DATE,
  purchase_value  NUMERIC(12,2),
  warranty_end    DATE,
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','inuse','repair','disposed','reserved')),
  notes           TEXT,
  qr_code_url     TEXT,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 7. ASSET IMAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS asset_images (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id   UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  filename   TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. ALLOCATIONS (Issue / Return)
-- ============================================================================
CREATE TABLE IF NOT EXISTS allocations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id             UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  assigned_to          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id        UUID REFERENCES departments(id) ON DELETE SET NULL,
  issue_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return      DATE,
  return_date          DATE,
  condition_on_issue   TEXT DEFAULT 'Good'
                       CHECK (condition_on_issue IN ('New','Good','Fair','Poor')),
  condition_on_return  TEXT
                       CHECK (condition_on_return IN ('Good','Fair','Damaged','Lost')),
  notes                TEXT,
  return_notes         TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  issued_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  returned_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 9. MAINTENANCE
-- ============================================================================
CREATE TABLE IF NOT EXISTS maintenance (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','inprogress','completed','rejected')),
  cost             NUMERIC(10,2),
  vendor_id        UUID REFERENCES vendors(id) ON DELETE SET NULL,
  scheduled_date   DATE,
  completed_date   DATE,
  notes            TEXT,
  reported_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT,
  type       TEXT DEFAULT 'system'
             CHECK (type IN ('warranty','maintenance','assignment','return','system','alert')),
  is_read    BOOLEAN DEFAULT FALSE,
  link       TEXT,  -- optional deep link e.g. '/assets/AST-001'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 11. AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,   -- 'CREATE','UPDATE','DELETE','LOGIN','LOGOUT','ASSIGN','RETURN','MAINT','EXPORT'
  entity      TEXT,            -- 'asset','employee','vendor','allocation','maintenance','auth'
  entity_id   UUID,            -- the affected record's UUID
  description TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 12. DEPRECIATION RECORDS (optional cached values)
-- ============================================================================
CREATE TABLE IF NOT EXISTS depreciation (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  opening_value    NUMERIC(12,2),
  depreciation_amt NUMERIC(12,2),
  closing_value    NUMERIC(12,2),
  rate             NUMERIC(5,2),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asset_id, year)
);

-- ============================================================================
-- INDEXES (performance)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_assets_status        ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_department    ON assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned      ON assets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_assets_category      ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_warranty      ON assets(warranty_end);
CREATE INDEX IF NOT EXISTS idx_allocations_active   ON allocations(is_active);
CREATE INDEX IF NOT EXISTS idx_allocations_asset    ON allocations(asset_id);
CREATE INDEX IF NOT EXISTS idx_allocations_employee ON allocations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_status   ON maintenance(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_asset    ON maintenance(asset_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity    ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id, is_read);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciation   ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── PROFILES ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_superadmin" ON profiles;

-- Anyone logged in can read all profiles (needed for dropdowns)
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile; admins can update any
CREATE POLICY "profiles_update_own_or_admin"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR get_my_role() IN ('Super Admin', 'Admin')
  );

-- Only admins can insert profiles (handled by trigger for signup)
CREATE POLICY "profiles_insert_admin"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Super Admin', 'Admin'));

-- Only super admins can delete profiles
CREATE POLICY "profiles_delete_superadmin"
  ON profiles FOR DELETE
  TO authenticated
  USING (get_my_role() = 'Super Admin');

-- ── ASSETS ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "assets_select_authenticated" ON assets;
DROP POLICY IF EXISTS "assets_insert_manager" ON assets;
DROP POLICY IF EXISTS "assets_update_manager" ON assets;
DROP POLICY IF EXISTS "assets_delete_admin" ON assets;

-- All authenticated users can view assets
CREATE POLICY "assets_select_authenticated"
  ON assets FOR SELECT
  TO authenticated
  USING (true);

-- Managers and above can create/update assets
CREATE POLICY "assets_insert_manager"
  ON assets FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Super Admin', 'Admin', 'Manager'));

CREATE POLICY "assets_update_manager"
  ON assets FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Super Admin', 'Admin', 'Manager'));

-- Only admins can delete assets
CREATE POLICY "assets_delete_admin"
  ON assets FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Super Admin', 'Admin'));

-- ── ASSET IMAGES ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "asset_images_select" ON asset_images;
DROP POLICY IF EXISTS "asset_images_insert" ON asset_images;
DROP POLICY IF EXISTS "asset_images_delete" ON asset_images;
CREATE POLICY "asset_images_select" ON asset_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "asset_images_insert" ON asset_images FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('Super Admin','Admin','Manager'));
CREATE POLICY "asset_images_delete" ON asset_images FOR DELETE TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));

-- ── ALLOCATIONS ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allocations_select" ON allocations;
DROP POLICY IF EXISTS "allocations_insert" ON allocations;
DROP POLICY IF EXISTS "allocations_update" ON allocations;
DROP POLICY IF EXISTS "allocations_delete" ON allocations;
CREATE POLICY "allocations_select" ON allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "allocations_insert" ON allocations FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('Super Admin','Admin','Manager'));
CREATE POLICY "allocations_update" ON allocations FOR UPDATE TO authenticated USING (get_my_role() IN ('Super Admin','Admin','Manager'));
CREATE POLICY "allocations_delete" ON allocations FOR DELETE TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));

-- ── MAINTENANCE ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "maintenance_select" ON maintenance;
DROP POLICY IF EXISTS "maintenance_insert" ON maintenance;
DROP POLICY IF EXISTS "maintenance_update" ON maintenance;
DROP POLICY IF EXISTS "maintenance_delete" ON maintenance;
CREATE POLICY "maintenance_select" ON maintenance FOR SELECT TO authenticated USING (true);
-- Employees can log maintenance, managers can approve
CREATE POLICY "maintenance_insert" ON maintenance FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "maintenance_update" ON maintenance FOR UPDATE TO authenticated USING (
  reported_by = auth.uid() OR get_my_role() IN ('Super Admin','Admin','Manager')
);
CREATE POLICY "maintenance_delete" ON maintenance FOR DELETE TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));

-- ── VENDORS ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;
DROP POLICY IF EXISTS "vendors_delete" ON vendors;
CREATE POLICY "vendors_select" ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors_insert" ON vendors FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('Super Admin','Admin','Manager'));
CREATE POLICY "vendors_update" ON vendors FOR UPDATE TO authenticated USING (get_my_role() IN ('Super Admin','Admin','Manager'));
CREATE POLICY "vendors_delete" ON vendors FOR DELETE TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));

-- ── DEPARTMENTS & CATEGORIES (read-only for most users) ──────────────────────
DROP POLICY IF EXISTS "departments_select" ON departments;
DROP POLICY IF EXISTS "departments_manage" ON departments;
DROP POLICY IF EXISTS "categories_select" ON asset_categories;
DROP POLICY IF EXISTS "categories_manage" ON asset_categories;
CREATE POLICY "departments_select"   ON departments       FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_manage"   ON departments       FOR ALL    TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));
CREATE POLICY "categories_select"    ON asset_categories  FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_manage"    ON asset_categories  FOR ALL    TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));

-- ── AUDIT LOGS ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
-- Admins and managers can read audit logs
CREATE POLICY "audit_select" ON audit_logs FOR SELECT TO authenticated
  USING (get_my_role() IN ('Super Admin','Admin','Manager'));
-- Anyone authenticated can insert (needed to log actions)
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
-- Nobody can update or delete audit logs (immutable)

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notif_select" ON notifications;
DROP POLICY IF EXISTS "notif_insert" ON notifications;
DROP POLICY IF EXISTS "notif_update" ON notifications;
-- Users see only their own notifications
CREATE POLICY "notif_select" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_insert" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ── DEPRECIATION ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "depr_select" ON depreciation;
DROP POLICY IF EXISTS "depr_manage" ON depreciation;
CREATE POLICY "depr_select" ON depreciation FOR SELECT TO authenticated USING (true);
CREATE POLICY "depr_manage" ON depreciation FOR ALL    TO authenticated USING (get_my_role() IN ('Super Admin','Admin'));

-- ============================================================================
-- TRIGGER: Auto-create profile on new Supabase Auth signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Employee'),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- TRIGGER: Auto-update `updated_at` timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_updated_at      ON assets;
DROP TRIGGER IF EXISTS trg_profiles_updated_at    ON profiles;
DROP TRIGGER IF EXISTS trg_allocations_updated_at ON allocations;
DROP TRIGGER IF EXISTS trg_maintenance_updated_at ON maintenance;
DROP TRIGGER IF EXISTS trg_vendors_updated_at   ON vendors;
CREATE TRIGGER trg_assets_updated_at         BEFORE UPDATE ON assets         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at       BEFORE UPDATE ON profiles       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_allocations_updated_at    BEFORE UPDATE ON allocations    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_maintenance_updated_at    BEFORE UPDATE ON maintenance    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vendors_updated_at        BEFORE UPDATE ON vendors        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SUPABASE REALTIME (enable for live notifications and dashboard)
-- ============================================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE assets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STORAGE BUCKETS
-- Run separately in Supabase Dashboard → Storage (or via API)
-- ============================================================================
-- Bucket: asset-images   (public: false, max size: 5MB, allowed types: image/*)
-- Bucket: asset-docs     (public: false, max size: 10MB, allowed types: application/pdf)

-- ============================================================================
-- SEED DATA: Create the first Super Admin user
-- 1. Go to Supabase Dashboard → Authentication → Users → Add User
-- 2. Email: admin@acme.in   Password: Admin@123456
-- 3. Then run this to set the Super Admin role:
-- ============================================================================
-- UPDATE profiles SET role = 'Super Admin', full_name = 'Admin User', employee_code = 'USR-001'
-- WHERE email = 'admin@acme.in';
