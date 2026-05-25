# White Stag Budget Backend

API layer for the White Stag Budget multi-tenant household budgeting app.

## Architecture

- **Frontend:** Next.js (separate repo)
- **Backend:** Node.js + Express, deployed on Vercel
- **Database:** Supabase (PostgreSQL)
- **Auth:** Firebase Auth (JWT verification)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```
# Firebase Admin SDK — from Firebase Console → Project Settings → Service Accounts
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# Supabase — from Supabase Dashboard → Settings → API Keys
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...

PORT=3001
NODE_ENV=development
```

### 3. Database Migrations

Apply the schema and RLS policies to your Supabase project:

```bash
supabase db push
```

This runs the files in `supabase/migrations/` in order.

### 4. Local Development

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### 5. Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo in [vercel.com](https://vercel.com)
3. Add all five environment variables in Vercel → Settings → Environment Variables
4. Deploy — Vercel auto-deploys on every push to `main`

---

## API Endpoints

All endpoints require `Authorization: Bearer <firebase-id-token>`.

### Household

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/household/create` | Create a household (owner) |
| `POST` | `/api/household/join` | Join via 6-char code |
| `GET` | `/api/household` | Get household + members |
| `GET` | `/api/household/members` | List members |
| `POST` | `/api/household/members/remove` | Remove a member (owner only) |
| `POST` | `/api/household/leave` | Leave household |
| `POST` | `/api/household/settings` | Update settings (owner only) |

### Priority Stack

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/priority-stack/active` | Get approved active stack |
| `GET` | `/api/priority-stack/draft` | Get draft with approval status |
| `POST` | `/api/priority-stack/draft` | Mutate draft (add/edit/remove/reorder) |
| `POST` | `/api/priority-stack/approve` | Approve draft; auto-promotes when all members approve |
| `POST` | `/api/priority-stack/reset` | Reset draft back to active |
| `GET` | `/api/priority-stack/approvals` | Detailed approval status with member names |

See [`docs/household_api_spec.md`](docs/household_api_spec.md) and [`docs/PRIORITY_STACK_API_SPEC.md`](docs/priority_stack_api_spec.md) for full request/response details.

---

## Database

Schema and RLS policies live in `supabase/migrations/`. Run `supabase db push` after any schema change.

| Migration | Contents |
|-----------|----------|
| `001_initial_schema.sql` | All tables, indexes, triggers |
| `002_rls_policies.sql` | Row Level Security policies |

The backend uses the Supabase **service_role (secret) key**, which bypasses RLS. RLS policies are in place for future direct client-SDK access once the frontend migrates to Supabase Auth.
