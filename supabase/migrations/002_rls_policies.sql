-- ============================================================================
-- Migration 002: Row Level Security Policies
-- White Stag Budget — multi-tenant isolation
--
-- IMPORTANT — SUPABASE AUTH / BROKER-ONLY ARCHITECTURE:
-- The backend uses the Supabase service_role (secret) key, which bypasses
-- RLS entirely. These policies serve as defense-in-depth for any future
-- direct client-SDK access; the current architecture treats the backend as
-- the mandatory broker.
--
-- auth.uid() is a Supabase Auth function and returns the authenticated
-- user's UUID. In this migration, user IDs are still TEXT (migration 001),
-- so policies cast auth.uid() to text. Migration 003 drops and recreates
-- these policies without the cast once user-id columns are UUID.
--
-- get_my_household_id() returns UUID (households.id type) by joining
-- through public.users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current user's household_id
-- SECURITY DEFINER prevents RLS recursion when this function reads users.
-- Returns NULL if the user has no household or is not authenticated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT household_id FROM public.users WHERE id = auth.uid()::text
$$;

-- ---------------------------------------------------------------------------
-- Helper: true if the calling user is the household owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_household_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT household_role = 'owner'
  FROM public.users
  WHERE id = auth.uid()::text
$$;

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE households                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_stacks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE priority_stack_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stack_approvals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions                ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HOUSEHOLDS
-- ============================================================================
CREATE POLICY "households_select_member"
  ON households FOR SELECT TO authenticated
  USING (id = get_my_household_id());

CREATE POLICY "households_insert_authenticated"
  ON households FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "households_update_owner"
  ON households FOR UPDATE TO authenticated
  USING (id = get_my_household_id() AND is_household_owner())
  WITH CHECK (id = get_my_household_id() AND is_household_owner());

-- ============================================================================
-- USERS
-- ============================================================================
CREATE POLICY "users_select_self"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid()::text);

CREATE POLICY "users_select_household_members"
  ON users FOR SELECT TO authenticated
  USING (household_id IS NOT NULL AND household_id = get_my_household_id());

CREATE POLICY "users_insert_self"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text);

CREATE POLICY "users_update_self"
  ON users FOR UPDATE TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- ============================================================================
-- PRIORITY_STACKS
-- ============================================================================
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

-- ============================================================================
-- PRIORITY_STACK_CATEGORIES
-- ============================================================================
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

-- ============================================================================
-- STACK_APPROVALS
-- ============================================================================
CREATE POLICY "approvals_select_member"
  ON stack_approvals FOR SELECT TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

CREATE POLICY "approvals_insert_self"
  ON stack_approvals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
    AND stack_id IN (
      SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
    )
  );

CREATE POLICY "approvals_update_self"
  ON stack_approvals FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "approvals_delete_member"
  ON stack_approvals FOR DELETE TO authenticated
  USING (stack_id IN (
    SELECT id FROM priority_stacks WHERE household_id = get_my_household_id()
  ));

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================
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

-- ============================================================================
-- NOTE: join-code lookup
-- POST /api/household/join reads a household by join_code before the user
-- has a household_id, so they cannot satisfy "households_select_member".
-- The backend uses the service_role key for this query (bypasses RLS).
-- Future client-side join flow should use a SECURITY DEFINER function:
--
--   CREATE FUNCTION lookup_join_code(code CHAR(6))
--   RETURNS TABLE(household_id UUID, name VARCHAR, expires_at TIMESTAMPTZ)
--   LANGUAGE sql STABLE SECURITY DEFINER AS $$
--     SELECT id, name, join_code_expires_at FROM households
--     WHERE join_code = code AND join_code_expires_at > NOW()
--   $$;
-- ============================================================================
