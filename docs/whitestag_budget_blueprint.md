# White Stag Budget — Consolidated Design Document

**Version:** 4.0
**Date:** July 5, 2026
**Project Type:** Multi-Tenant SaaS Household Budgeting App (Mobile)

---

## 1. Project Overview

**Goal:** A collaborative financial bodyguard for households. It separates planning from action — members declare spending intent before they spend, and real transactions are checked against that declared intent.

**Core Philosophy:** Before you swipe, you unlock your intent.

**Use Case Families:**
1. Household Setup & Onboarding
2. Shared Financial Planning (Priority Stack)
3. Pre-Purchase Intent (Unlock Ritual) — future sprint
4. Transaction Verification — future sprint

---

## 2. Architecture

### 2.1 Auth Pivot (v4 change)

Previous versions used Firebase Auth + Firebase Admin SDK for identity, with Supabase for data only. **This version moves authentication to Supabase Auth**, eliminating Firebase entirely.

```
┌─────────────────────────────────────────┐
│         Mobile App Layer                │
│  (Expo / React Native)                  │
│  - Login / Sign-up (Supabase Auth)      │
│  - Social sign-in (Google, via Supabase)│
│  - Priority Stack (drag-and-drop)       │
└────────────┬────────────────────────────┘
             │ HTTPS API Calls
             │ + Supabase JWT token
┌────────────▼────────────────────────────┐
│         Backend Layer                   │
│  (Node.js + Express on Vercel)          │
│  - Verifies Supabase JWT                │
│  - Household Management                 │
│  - Priority Waterfall Logic             │
└────────────┬────────────────────────────┘
             │ Supabase JS Client (service role)
┌────────────▼────────────────────────────┐
│         Database Layer                  │
│  (Supabase — PostgreSQL)                │
│  - Auth (auth.users)                    │
│  - households / users / priority_stacks │
│  - priority_stack_categories            │
│  - stack_approvals / transactions       │
│  - Row Level Security (RLS)             │
└─────────────────────────────────────────┘
```

**Broker-only rule:** The frontend never calls Supabase directly. All data access goes through the Express backend, which uses the Supabase service role key. RLS policies are kept in place as a defense-in-depth layer for any future direct access, but the current architecture treats the backend as the mandatory broker.

### 2.2 Real-Time Sync

The priority stack is synchronized across household members via **frontend polling**. The mobile app periodically calls `GET /api/priority-stack/active` and `GET /api/priority-stack/draft` (and optionally `GET /api/priority-stack/approvals`) to refresh the current state. This keeps the implementation simple and broker-only while still giving members a near-real-time view.

### 2.3 Stack Summary

| Layer | Technology | Purpose |
|---|---|---|
| Mobile App | Expo (React Native) + NativeWind | Cross-platform UI |
| Auth | Supabase Auth | Email/password + Google OAuth |
| Backend | Node.js + Express on Vercel | API layer, business logic, mandatory data broker |
| Database | Supabase (PostgreSQL) | All application data |
| Security | Supabase RLS + backend auth | Household-level data isolation |
| Bank Data | Plaid (future) | Bank account linking |
| Notifications | Expo Notifications + FCM (future) | Push alerts |
| Repos | `white-stag-budget-backend`, `white-stag-budget-frontend` | Two repos, one consolidated design doc |

---

## 3. Data Model (Supabase / PostgreSQL)

### households
```
households
  |- id                      uuid PRIMARY KEY
  |- name                    VARCHAR(75) NOT NULL CHECK (LENGTH(name) >= 2)
  |- created_by              uuid NOT NULL REFERENCES users(id)
  |- join_code               CHAR(6) UNIQUE
  |- join_code_expires_at    TIMESTAMPTZ
  |- allow_negative_balances BOOLEAN NOT NULL DEFAULT FALSE
  |- currency                CHAR(3) NOT NULL DEFAULT 'USD'
  |- spillover_mode          VARCHAR(20) NOT NULL DEFAULT 'waterfall'
  |- created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
  |- updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### users (public schema, mirrors auth.users)
```
users
  |- id             uuid PRIMARY KEY  (matches auth.users id)
  |- email          TEXT NOT NULL UNIQUE
  |- name           TEXT NOT NULL DEFAULT ''
  |- household_id   UUID REFERENCES households(id) ON DELETE SET NULL
  |- household_role VARCHAR(10) CHECK (household_role IN ('owner', 'member'))
  |- created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  |- last_login     TIMESTAMPTZ
```

### priority_stacks
```
priority_stacks
  |- id             uuid PRIMARY KEY
  |- household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE
  |- stack_type     VARCHAR(10) NOT NULL CHECK (stack_type IN ('active', 'draft'))
  |- version        INT NOT NULL DEFAULT 1
  |- total_amount   NUMERIC(14,2) NOT NULL DEFAULT 0
  |- category_count INT NOT NULL DEFAULT 0
  |- promoted_at    TIMESTAMPTZ  (active only)
  |- promoted_by    uuid         (active only)
  |- last_edited_by uuid         (draft only)
  |- last_edited_at TIMESTAMPTZ  (draft only)
  |- created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  |- updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### priority_stack_categories
```
priority_stack_categories
  |- id             uuid PRIMARY KEY
  |- stack_id       uuid NOT NULL REFERENCES priority_stacks(id) ON DELETE CASCADE
  |- name           VARCHAR(25) NOT NULL
  |- amount         NUMERIC(14,2) NOT NULL DEFAULT 0
  |- sort_order     INT NOT NULL
  |- monthly_budget NUMERIC(14,2) NOT NULL DEFAULT 0
  |- max_balance    NUMERIC(14,2)
  |- description    VARCHAR(200)
  |- icon           TEXT
  |- color          CHAR(7)
  |- is_archived    BOOLEAN NOT NULL DEFAULT FALSE
  |- created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  |- updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### stack_approvals
```
stack_approvals
  |- id          uuid PRIMARY KEY
  |- stack_id    uuid NOT NULL REFERENCES priority_stacks(id) ON DELETE CASCADE
  |- user_id     uuid NOT NULL
  |- approved    BOOLEAN NOT NULL DEFAULT FALSE
  |- approved_at TIMESTAMPTZ
```

### transactions
```
transactions
  |- id             uuid PRIMARY KEY
  |- household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE
  |- amount         NUMERIC(14,2) NOT NULL
  |- category       TEXT
  |- description    TEXT
  |- is_unlocked    BOOLEAN NOT NULL DEFAULT FALSE
  |- unlocked_by    uuid
  |- unlocked_at    TIMESTAMPTZ
  |- transaction_at TIMESTAMPTZ NOT NULL
  |- source         VARCHAR(20) NOT NULL DEFAULT 'manual'
  |- status         VARCHAR(20) NOT NULL DEFAULT 'pending'
  |- notes          TEXT
  |- created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  |- updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 3.1 Multi-Tenant Security Model

- RLS is enforced at the database level via Supabase policies keyed on `auth.uid()`.
- Users can only read/write their own `users` row.
- Users can only read/write `households`, `priority_stacks`, `priority_stack_categories`, `stack_approvals`, and `transactions` rows where their `auth.uid()` is a member of that household.
- `auth.uid()` maps directly to `users.id` because the project uses Supabase Auth.
- In the current broker-only architecture, the backend uses the Supabase service role key, which bypasses RLS. The policies serve as defense-in-depth for any future direct access.

---

## 4. Roles & Permissions

| Action | Owner | Member |
|---|---|---|
| Create household | ✅ | ❌ |
| Delete household | ✅ | ❌ |
| Invite members (share join code) | ✅ | ❌ |
| Remove members | ✅ | ❌ |
| Update household settings | ✅ | ❌ |
| Leave household | ❌* | ✅ |
| Edit priority stack draft | ✅ | ✅ |
| Approve priority stack draft | ✅ | ✅ |
| Reset draft to active | ✅ | ✅ |
| Override / force-approve draft | ❌ | ❌ |

\* Owner cannot leave a household; they must delete it or transfer ownership first (transfer is not yet implemented).

---

## 5. Use Case Family 1: Household Setup & Onboarding

1. **Account Sign-Up** — new user creates an account via Supabase Auth (email/password) or Google OAuth.
2. **Household Creation** — authenticated user with no household creates one, receives a 6-character join code.
3. **Join Code Sharing** — join code displayed prominently; user can copy or share it.
4. **Household Joining** — authenticated user enters a join code, is attached to that household as a member.
5. **Post-Join State Resolution** — on app load, route user based on state: no auth → Welcome; auth, no household → Household Setup; auth + household → Home.
6. **Error & Edge Cases** — invalid/expired join code, user already in a household, duplicate account email, re-used codes.
7. **Password Reset** — forgot-password flow via Supabase Auth (reset email/link, new password confirmation).
8. **Social/OAuth Sign-In** — sign up or log in via Google through Supabase Auth's OAuth provider; on first sign-in, still routes through household creation/join same as email users.

---

## 6. Use Case Family 2: Shared Financial Planning (Priority Stack)

1. **View Active Stack** — member views the currently approved priority list and amounts.
2. **Draft Editing** — add / edit / remove / reorder categories in a draft; any edit resets all approvals.
3. **Approval Workflow** — each member approves the draft; system tracks who has/hasn't approved.
4. **Auto-Promotion** — when all members approve, draft becomes the new active stack (version increments, approvals cleared).
5. **Draft Reset/Discard** — revert draft to match active state, discarding changes and clearing approvals.
6. **Concurrent Edit Handling** — last-write-wins on the same category; approvals reset regardless of merge outcome.
7. **Real-Time Sync** — one member's changes are reflected for other members via polling.
8. **Waterfall Calculation** — income allocates down the ordered categories until $0 (the "Zero-Out Line"). *Waterfall math is a future UI concern; the backend stores the ordered categories and amounts.*
9. **Stack Templates** — new household or new budget planning session picks a starting template instead of building from scratch:
   - **Simple**: Tithe, Savings, Rent, Utilities, Car Payment, Gas, Groceries, Misc
   - **Family**: mid-size category list — *pending definition*
   - **Full**: largest category list — *pending definition*
   - **Custom**: start with an empty stack

Templates are selected when the user starts budget/planning, not during household creation.

---

## 7. API Specification (Phase 1–2)

All endpoints require `Authorization: Bearer <supabase-jwt>`. The backend verifies the JWT against Supabase, extracts `auth.uid()`, and uses it for all subsequent queries.

### Household
```
POST /api/household/create          { householdName }                → { householdId, name, joinCode, joinCodeExpiresAt, members, settings }
POST /api/household/join            { joinCode }                     → { household }
GET  /api/household/                (token only)                     → { household }
GET  /api/household/members         (token only)                     → { members }
POST /api/household/members/remove  { userId }        (owner only)     → { message }
POST /api/household/leave           (token only)                     → { message }
POST /api/household/settings        { allowNegativeBalances?, currency? } (owner only) → { settings }
```

### Auth
Sign up, log in, Google OAuth, and password reset are handled client-side via the Supabase Auth SDK. No custom backend endpoints are required for these flows.

### Priority Stack
```
GET  /api/priority-stack/active
GET  /api/priority-stack/draft
POST /api/priority-stack/draft        { action: add|edit|remove|reorder, ... }
POST /api/priority-stack/approve
POST /api/priority-stack/reset
GET  /api/priority-stack/approvals
POST /api/priority-stack/template     { template: simple|family|full|custom }   -- future endpoint
```

---

## 8. Open Decisions / Risks

| Item | Status |
|---|---|
| Family template category list | Pending — Dan to provide |
| Full template category list | Pending — Dan to provide |
| Owner-transfer / leave-household flow for owner | Not yet implemented |
| Plaid integration scope | Future sprint |
| Push notification architecture | Future sprint |

---

## 9. Roadmap

1. ✅ Supabase Auth (email/password + Google OAuth)
2. ✅ Backend: Supabase JWT verification
3. ✅ Household Setup & Onboarding
4. ✅ Priority Stack — core backend workflow
5. 🔄 Priority Stack — mobile UI
6. 📋 Priority Stack — templates
7. 📋 Plaid integration (Bank Connectivity)
8. 📋 Unlock Ritual & Alerts

---

## 10. Key Decisions & Rationale

### Why Supabase Auth?
- Eliminates the Firebase/Supabase identity bridge.
- `auth.uid()` maps directly to `users.id` (UUID).
- Built-in email/password and OAuth providers.

### Why Backend Broker?
- The frontend never holds the Supabase service role key.
- RLS is a defense-in-depth layer, not the primary security gate.
- Business logic stays in one place.

### Why Polling?
- Simpler than WebSockets or Supabase Realtime.
- Fits the broker-only architecture.
- Good enough for household-level sync.

### Why Expo (React Native)?
- The Unlock Ritual requires a phone in-hand at point of purchase.
- Push notifications are first-class on mobile.

---

## 11. Shared Glossary

| Term | Meaning |
|---|---|
| **Household** | A group of users sharing one budget. The unit of data isolation. |
| **Owner** | The household creator. Can create/delete the household, invite members, and manage settings. |
| **Member** | A user invited to a household. Can edit/approve the priority stack and leave the household. |
| **Priority Stack** | The ordered list of spending categories that drives the household budget. |
| **Active Stack** | The currently approved priority stack in effect. |
| **Draft Stack** | The working copy of the priority stack. Requires approval from all members before becoming active. |
| **Zero-Out Line** | The point in the waterfall where income is fully allocated. |
| **Unlock Ritual** | The future feature where a member taps to unlock a category before spending. |
| **Join Code** | A 6-character code used to invite members to a household. |
| **Broker-only rule** | The frontend never calls Supabase directly; all data access goes through the backend. |

---

## 12. Cross-Repo Planning Workflow

### Source of Truth

- The design document lives in the **backend repo** at `docs/whitestag_budget_blueprint.md`.
- The frontend repo does **not** duplicate it. The frontend README links back to this file.

### Process for New Features

1. **Design first.** Update `whitestag_budget_blueprint.md` before writing code for any new feature.
2. **Get alignment.** Confirm roles, data model, API shape, and auth/security behavior.
3. **Backend second.** Implement the backend API and migration changes.
4. **Frontend third.** Implement the mobile UI and polling/sync behavior.
5. **Update the change log.** Record decisions and version bumps in the design doc.

---

## 13. Change Log

| Version | Date | Changes |
|---|---|---|
| 3.0 | May 25, 2026 | Initial blueprint with Firebase Auth. |
| 4.0 | July 5, 2026 | Pivoted to Supabase Auth; documented broker-only architecture, polling, and current roles/permissions. |

---

*Document Owner: Dan | Last Updated: July 5, 2026 | Supersedes: WHITE_STAG_BUDGET_BLUEPRINT.md v3.0*
