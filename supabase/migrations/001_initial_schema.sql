-- ============================================================================
-- Migration 001: Initial Schema
-- White Stag Budget — multi-tenant household budgeting
--
-- NOTE ON USER IDs:
-- Authentication uses Firebase Auth, not Supabase Auth. Firebase UIDs are
-- arbitrary strings (e.g. "LxZhqM6bsNO0sPbHVkXj5P3A"), not UUIDs. All
-- user-id columns are therefore TEXT. When the app migrates to Supabase
-- Auth, these can be cast to UUID and FK constraints added back.
--
-- The backend uses the Supabase service_role (secret) key, which bypasses
-- RLS entirely. RLS policies in migration 002 are ready for a future
-- client-side Supabase Auth migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: keep updated_at current on any row update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- TABLE: households
-- ============================================================================
CREATE TABLE households (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(75)   NOT NULL,
  created_by              TEXT          NOT NULL,   -- Firebase UID of owner

  join_code               CHAR(6)       UNIQUE,
  join_code_expires_at    TIMESTAMPTZ,

  allow_negative_balances BOOLEAN       NOT NULL DEFAULT FALSE,
  currency                CHAR(3)       NOT NULL DEFAULT 'USD',
  spillover_mode          VARCHAR(20)   NOT NULL DEFAULT 'waterfall',

  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT households_name_length
    CHECK (char_length(name) BETWEEN 40 AND 75),
  CONSTRAINT households_currency_length
    CHECK (char_length(currency) = 3),
  CONSTRAINT households_spillover_mode
    CHECK (spillover_mode IN ('waterfall', 'proportional'))
);

CREATE TRIGGER households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_households_join_code
  ON households (join_code)
  WHERE join_code IS NOT NULL;

-- ============================================================================
-- TABLE: users
--
-- Public profile keyed on Firebase UID (TEXT). Rows are created by the
-- backend on household create/join — there is no Supabase Auth trigger.
-- ============================================================================
CREATE TABLE users (
  id             TEXT          PRIMARY KEY,   -- Firebase UID
  email          TEXT          NOT NULL UNIQUE,
  name           TEXT          NOT NULL DEFAULT '',

  household_id   UUID          REFERENCES households(id) ON DELETE SET NULL,
  household_role VARCHAR(10)   CHECK (household_role IN ('owner', 'member')),

  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_login     TIMESTAMPTZ,

  CONSTRAINT users_role_requires_household CHECK (
    (household_role IS NULL) = (household_id IS NULL)
  )
);

CREATE INDEX idx_users_household_id ON users (household_id);

-- ============================================================================
-- TABLE: priority_stacks
--
-- Exactly two rows per household: one 'active', one 'draft'.
-- ============================================================================
CREATE TABLE priority_stacks (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  stack_type      VARCHAR(10)   NOT NULL CHECK (stack_type IN ('active', 'draft')),
  version         INT           NOT NULL DEFAULT 1,

  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  category_count  INT           NOT NULL DEFAULT 0,

  -- active only
  promoted_at     TIMESTAMPTZ,
  promoted_by     TEXT,                      -- Firebase UID

  -- draft only
  last_edited_by  TEXT,                      -- Firebase UID
  last_edited_at  TIMESTAMPTZ,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT priority_stacks_one_per_type UNIQUE (household_id, stack_type)
);

CREATE INDEX idx_priority_stacks_household_id
  ON priority_stacks (household_id);

CREATE TRIGGER priority_stacks_updated_at
  BEFORE UPDATE ON priority_stacks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TABLE: priority_stack_categories
-- ============================================================================
CREATE TABLE priority_stack_categories (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id       UUID          NOT NULL REFERENCES priority_stacks(id) ON DELETE CASCADE,

  name           VARCHAR(25)   NOT NULL,
  amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order     INT           NOT NULL,
  monthly_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_balance    NUMERIC(14,2),
  description    VARCHAR(200),
  icon           TEXT,
  color          CHAR(7),
  is_archived    BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT categories_name_not_empty
    CHECK (char_length(name) >= 1),
  CONSTRAINT categories_sort_order_positive
    CHECK (sort_order >= 1),
  CONSTRAINT categories_max_balance_positive
    CHECK (max_balance IS NULL OR max_balance > 0),
  CONSTRAINT categories_color_format
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Uniqueness among non-archived categories within a stack
CREATE UNIQUE INDEX idx_categories_unique_order
  ON priority_stack_categories (stack_id, sort_order)
  WHERE NOT is_archived;

CREATE UNIQUE INDEX idx_categories_unique_name
  ON priority_stack_categories (stack_id, lower(name))
  WHERE NOT is_archived;

CREATE INDEX idx_categories_stack_id
  ON priority_stack_categories (stack_id);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON priority_stack_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TABLE: stack_approvals
-- ============================================================================
CREATE TABLE stack_approvals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id    UUID        NOT NULL REFERENCES priority_stacks(id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,              -- Firebase UID
  approved    BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,

  CONSTRAINT stack_approvals_unique UNIQUE (stack_id, user_id)
);

CREATE INDEX idx_stack_approvals_stack_id
  ON stack_approvals (stack_id);

-- ============================================================================
-- TABLE: transactions
-- ============================================================================
CREATE TABLE transactions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID          NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  amount         NUMERIC(14,2) NOT NULL,
  category       TEXT,
  description    TEXT,

  is_unlocked    BOOLEAN       NOT NULL DEFAULT FALSE,
  unlocked_by    TEXT,                           -- Firebase UID
  unlocked_at    TIMESTAMPTZ,

  transaction_at TIMESTAMPTZ   NOT NULL,
  source         VARCHAR(20)   NOT NULL DEFAULT 'manual',
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
  notes          TEXT,

  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT transactions_source
    CHECK (source IN ('plaid', 'manual')),
  CONSTRAINT transactions_status
    CHECK (status IN ('matched', 'unmatched', 'pending')),
  CONSTRAINT transactions_unlock_consistency CHECK (
    (is_unlocked = FALSE AND unlocked_by IS NULL AND unlocked_at IS NULL)
    OR
    (is_unlocked = TRUE  AND unlocked_by IS NOT NULL AND unlocked_at IS NOT NULL)
  )
);

CREATE INDEX idx_transactions_household_id
  ON transactions (household_id);

CREATE INDEX idx_transactions_household_at
  ON transactions (household_id, transaction_at DESC);

CREATE INDEX idx_transactions_status
  ON transactions (household_id, status)
  WHERE status IN ('pending', 'unmatched');

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
