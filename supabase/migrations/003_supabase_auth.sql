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
-- 2. Drop ALL RLS policies before altering column types
--    (Postgres won't alter a column type if any policy references it)
-- ---------------------------------------------------------------------------

-- households policies
DROP POLICY IF EXISTS "households_select_member" ON households;
DROP POLICY IF EXISTS "households_insert_authenticated" ON households;
DROP POLICY IF EXISTS "households_update_owner" ON households;

-- users policies
DROP POLICY IF EXISTS "users_select_self" ON users;
DROP POLICY IF EXISTS "users_select_household_members" ON users;
DROP POLICY IF EXISTS "users_insert_self" ON users;
DROP POLICY IF EXISTS "users_update_self" ON users;

-- priority_stacks policies
DROP POLICY IF EXISTS "priority_stacks_select_member" ON priority_stacks;
DROP POLICY IF EXISTS "priority_stacks_insert_member" ON priority_stacks;
DROP POLICY IF EXISTS "priority_stacks_update_member" ON priority_stacks;

-- priority_stack_categories policies
DROP POLICY IF EXISTS "categories_select_member" ON priority_stack_categories;
DROP POLICY IF EXISTS "categories_insert_member" ON priority_stack_categories;
DROP POLICY IF EXISTS "categories_update_member" ON priority_stack_categories;
DROP POLICY IF EXISTS "categories_delete_member" ON priority_stack_categories;

-- stack_approvals policies
DROP POLICY IF EXISTS "approvals_select_member" ON stack_approvals;
DROP POLICY IF EXISTS "approvals_insert_self" ON stack_approvals;
DROP POLICY IF EXISTS "approvals_update_self" ON stack_approvals;
DROP POLICY IF EXISTS "approvals_delete_member" ON stack_approvals;

-- transactions policies
DROP POLICY IF EXISTS "transactions_select_member" ON transactions;
DROP POLICY IF EXISTS "transactions_insert_member" ON transactions;
DROP POLICY IF EXISTS "transactions_update_member" ON transactions;
DROP POLICY IF EXISTS "transactions_delete_member" ON transactions;

-- Drop helper functions (they reference users.id too)
DROP FUNCTION IF EXISTS get_my_household_id();
DROP FUNCTION IF EXISTS is_household_owner();

-- ---------------------------------------------------------------------------
-- 3. Alter columns from TEXT to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE households ALTER COLUMN created_by TYPE UUID USING created_by::uuid;
ALTER TABLE priority_stacks ALTER COLUMN promoted_by TYPE UUID USING promoted_by::uuid;
ALTER TABLE priority_stacks ALTER COLUMN last_edited_by TYPE UUID USING last_edited_by::uuid;
ALTER TABLE stack_approvals ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
ALTER TABLE transactions ALTER COLUMN unlocked_by TYPE UUID USING unlocked_by::uuid;

-- ---------------------------------------------------------------------------
-- 4. Recreate helper functions (auth.uid() returns UUID natively now)
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
-- 5. Recreate ALL RLS policies (using auth.uid() without ::text casts)
-- ---------------------------------------------------------------------------

-- households
CREATE POLICY "households_select_member"
  ON households FOR SELECT TO authenticated
  USING (id = get_my_household_id());

CREATE POLICY "households_insert_authenticated"
  ON households FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "households_update_owner"
  ON households FOR UPDATE TO authenticated
  USING (id = get_my_household_id() AND is_household_owner())
  WITH CHECK (id = get_my_household_id() AND is_household_owner());

-- users
CREATE POLICY "users_select_self"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_select_household_members"
  ON users FOR SELECT TO authenticated
  USING (household_id IS NOT NULL AND household_id = get_my_household_id());

CREATE POLICY "users_insert_self"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_self"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- priority_stacks
CREATE POLICY "priority_stacks_select_member"
  ON priority_stacks FOR SELECT TO authenticated
  USING (household_id = get_my_household_id());

CREATE POLICY "priority_stacks_insert_member"
  ON priority_stacks FOR INSERT TO authenticated
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "priority_stacks_update_member"
  ON priority_stacks FOR UPDATE TO authenticated
  USING (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

-- priority_stack_categories
CREATE POLICY "categories_select_member"
  ON priority_stack_categories FOR SELECT TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

CREATE POLICY "categories_insert_member"
  ON priority_stack_categories FOR INSERT TO authenticated
  WITH CHECK (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

CREATE POLICY "categories_update_member"
  ON priority_stack_categories FOR UPDATE TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ))
  WITH CHECK (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

CREATE POLICY "categories_delete_member"
  ON priority_stack_categories FOR DELETE TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

-- stack_approvals
CREATE POLICY "approvals_select_member"
  ON stack_approvals FOR SELECT TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

CREATE POLICY "approvals_insert_self"
  ON stack_approvals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND stack_id IN (
      SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
    )
  );

CREATE POLICY "approvals_update_self"
  ON stack_approvals FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "approvals_delete_member"
  ON stack_approvals FOR DELETE TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

-- transactions
CREATE POLICY "transactions_select_member"
  ON transactions FOR SELECT TO authenticated
  USING (household_id = get_my_household_id());

CREATE POLICY "transactions_insert_member"
  ON transactions FOR INSERT TO authenticated
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "transactions_update_member"
  ON transactions FOR UPDATE TO authenticated
  USING (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "transactions_delete_member"
  ON transactions FOR DELETE TO authenticated
  USING (household_id = get_my_household_id());
