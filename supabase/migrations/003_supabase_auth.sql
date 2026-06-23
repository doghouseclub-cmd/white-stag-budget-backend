-- ============================================================================
-- Migration 003: Switch from Firebase Auth to Supabase Auth
--
-- Supabase Auth issues UUID user IDs. This migration changes all user-ID
-- columns from TEXT (Firebase UIDs) to UUID.
--
-- WARNING: This is destructive — existing user rows with Firebase UIDs will
-- be deleted. Run only when there is no production user data to preserve.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clear data that references Firebase UIDs (order matters for FK deps)
-- ---------------------------------------------------------------------------
DELETE FROM stack_approvals;
DELETE FROM priority_stack_categories;
DELETE FROM priority_stacks;
DELETE FROM users;
DELETE FROM transactions;
DELETE FROM households;

-- ---------------------------------------------------------------------------
-- 2. Alter users.id from TEXT to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN id TYPE UUID USING id::uuid;

-- ---------------------------------------------------------------------------
-- 3. Alter households.created_by from TEXT to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE households ALTER COLUMN created_by TYPE UUID USING created_by::uuid;

-- ---------------------------------------------------------------------------
-- 4. Alter priority_stacks Firebase UID columns from TEXT to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE priority_stacks ALTER COLUMN promoted_by TYPE UUID USING promoted_by::uuid;
ALTER TABLE priority_stacks ALTER COLUMN last_edited_by TYPE UUID USING last_edited_by::uuid;

-- ---------------------------------------------------------------------------
-- 5. Alter stack_approvals.user_id from TEXT to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE stack_approvals ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- ---------------------------------------------------------------------------
-- 6. Alter transactions.unlocked_by from TEXT to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE transactions ALTER COLUMN unlocked_by TYPE UUID USING unlocked_by::uuid;

-- ---------------------------------------------------------------------------
-- 7. Update RLS helper functions to remove ::text casts
--    (auth.uid() already returns UUID in Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT household_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_household_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT household_role = 'owner'
  FROM public.users
  WHERE id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 8. Recreate RLS policies that used auth.uid()::text — now just auth.uid()
-- ---------------------------------------------------------------------------

-- households
DROP POLICY IF EXISTS "households_insert_authenticated" ON households;
CREATE POLICY "households_insert_authenticated"
  ON households FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- users
DROP POLICY IF EXISTS "users_select_self" ON users;
CREATE POLICY "users_select_self"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_insert_self" ON users;
CREATE POLICY "users_insert_self"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_update_self" ON users;
CREATE POLICY "users_update_self"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- stack_approvals
DROP POLICY IF EXISTS "approvals_insert_self" ON stack_approvals;
CREATE POLICY "approvals_insert_self"
  ON stack_approvals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND stack_id IN (
      SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
    )
  );

DROP POLICY IF EXISTS "approvals_update_self" ON stack_approvals;
CREATE POLICY "approvals_update_self"
  ON stack_approvals FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
