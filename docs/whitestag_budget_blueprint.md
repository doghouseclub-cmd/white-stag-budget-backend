# White Stag Budget — Project Blueprint & Technical Specification

**Version:** 3.0
**Date:** May 25, 2026
**Project Type:** Multi-Tenant SaaS Budgeting Application

---

## 1. The Goal (The "Vibe")

White Stag Budget is a **collaborative financial bodyguard for households**. It separates planning from action, allowing spouses to see synchronized spending intentions and receive alerts when real-world transactions deviate from those intentions.

**Core Philosophy:** *Before you swipe, you unlock your intent.*

---

## 2. Main Use Cases

### Use Case 1: Household Setup & Onboarding
- **Actor:** User A (household creator)
- **Flow:** Sign up → Create household → Share join code with User B
- **Outcome:** Both users belong to the same household and can see shared data

### Use Case 2: Shared Financial Planning
- **Actors:** User A & User B (household members)
- **Flow:** View shared Priority Stack → Drag-and-drop to rank spending categories → See "Zero-Out Line" update as income flows down
- **Outcome:** Both users see the same waterfall allocation in real-time

### Use Case 3: Pre-Purchase Intent (The Unlock Ritual)
- **Actor:** User A (spender)
- **Flow:** Open app → Tap "Unlock [Category]" → Go make purchase → App confirms or alerts
- **Outcome:** Intent recorded; matched transactions pass silently, unmatched notify both spouses

### Use Case 4: Transaction Verification
- **Actors:** User A (spender), User B (observer)
- **Flow:** Real transaction hits household bank account → App checks if it was "unlocked" → Sends notification
- **Outcome:** Household gets real-time visibility into spending behavior

---

## 3. Architecture & Technical Design

### 3.1 System Layers

```
+------------------------------------------+
|         Mobile App Layer                 |
|  (Expo / React Native)                   |
|  - Login / Sign-up (Firebase Auth)       |
|  - Priority Stack (drag-and-drop)        |
|  - Unlock Ritual UI                      |
|  - Transaction Feed                      |
+------------------+-----------------------+
                   | HTTPS API Calls
                   | + Firebase JWT token
+------------------v-----------------------+
|         Backend Layer                    |
|  (Node.js + Express on Vercel)           |
|  - Verifies identity via Firebase Auth   |
|  - Household Management                  |
|  - Priority Waterfall Logic              |
|  - Unlock/Transaction Matching           |
+------------------+-----------------------+
                   | Supabase JS Client
+------------------v-----------------------+
|         Database Layer                   |
|  (Supabase - PostgreSQL)                 |
|  - households table                      |
|  - users table                           |
|  - transactions table                    |
|  - Row Level Security (RLS) policies     |
+------------------------------------------+

Firebase Auth  →  proves WHO you are
Supabase       →  stores everything your app does
Vercel         →  runs the API that connects them
Firestore      →  NOT USED (removed from project)
```

### 3.2 Data Model

All data lives in Supabase (PostgreSQL). Tables use real constraints enforced at the database level.

#### households table

```
households
  |- id           uuid PRIMARY KEY
  |- name         text NOT NULL
  |- join_code    CHAR(6) UNIQUE NOT NULL
  |- created_at   timestamptz DEFAULT now()
  |- settings     jsonb  { spilloverMode, currency }
```

#### users table

```
users
  |- id             uuid PRIMARY KEY  (matches Firebase Auth UID)
  |- email          text NOT NULL
  |- name           text NOT NULL
  |- household_id   uuid REFERENCES households(id)
  |- role           text CHECK (role IN ('owner', 'member'))
  |- created_at     timestamptz DEFAULT now()
  |- last_login     timestamptz
```

#### transactions table

```
transactions
  |- id               uuid PRIMARY KEY
  |- household_id     uuid REFERENCES households(id)
  |- amount           numeric NOT NULL
  |- category         text
  |- description      text
  |- is_unlocked      boolean DEFAULT false
  |- unlocked_by      uuid REFERENCES users(id)
  |- unlocked_at      timestamptz
  |- transaction_at   timestamptz
  |- source           text CHECK (source IN ('plaid', 'manual'))
  |- status           text CHECK (status IN ('matched', 'unmatched', 'pending'))
  |- notes            text
```

### 3.3 Multi-Tenant Security Model

All data is scoped to `household_id`. Supabase Row Level Security (RLS) policies enforce:

- Users can only read/write their own row in the `users` table
- Users can only read/write households and transactions where their user id is a member
- RLS is enforced at the database level — not the application layer

This ensures User A from Household 1 cannot access any data from Household 2, even if they call the API directly.

---

## 4. Core Features (Roadmap)

### Sprint 1: Multi-Tenant Core — ✅ Done
- User signup/login (Firebase Auth)
- Create household (User A gets join code)
- Join household (User B enters code, added to household)
- Backend API endpoints live on Vercel
- Supabase database configured with RLS policies

### Sprint 2: Mobile App Foundation — 🔄 In Progress
- Expo project initialized in Windsurf (Windows 11)
- Login / signup screens built in React Native
- Firebase Auth integrated in mobile app
- App tested on device via Expo Go
- End-to-end: mobile app calls backend APIs successfully

### Sprint 3: Shared Priority Stack — 📋 Planned
- Drag-and-drop priority list (React Native gesture handler)
- Backend: store/retrieve priority stack in Supabase
- Real-time sync: when User A reorders, User B sees it instantly
- Waterfall algorithm: income flows down categories until $0

### Sprint 4: Bank Connectivity — 📋 Planned
- Plaid integration: link bank accounts to household
- Multi-item support: User A links Chase, User B links Wells Fargo
- Transaction normalization: merge all transactions into household feed
- Webhook: real-time transaction updates from Plaid

### Sprint 5: Unlock Ritual & Alerts — 📋 Planned
- "Unlock" button: user taps to unlock intent before purchase
- Match logic: check if real transaction matches unlocked intent
- Notifications: Expo Notifications + FCM for alerts to both spouses
- Dashboard: show matched vs. unmatched transactions

---

## 5. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Mobile App** | Expo (React Native) | Cross-platform iOS & Android mobile app |
| | React Native | Native UI components |
| | NativeWind | Tailwind CSS syntax for React Native styling |
| | Firebase SDK (client) | Authentication only — sign up, log in, JWT tokens |
| | Expo Notifications | Push notification delivery on device |
| **Backend** | Node.js 24.x | Server runtime |
| | Express.js | HTTP API framework |
| | Firebase Admin SDK | Identity verification only — verifyIdToken() |
| | Supabase JS Client | All database reads and writes |
| **Database** | Supabase (PostgreSQL) | All application data — households, users, transactions |
| **Auth** | Firebase Auth | Identity only — who you are, not what you can see |
| **Security** | Supabase RLS | Row Level Security — enforces household data isolation |
| **Deployment** | Vercel | Backend hosting (auto-deploy from Git) |
| | Expo EAS Build | Mobile app builds & distribution |
| **Payments** | Stripe (future) | Subscription billing |
| **Bank Data** | Plaid | Bank account linking & transaction feeds |
| **Notifications** | FCM | Firebase Cloud Messaging for push alerts |
| **Version Control** | GitHub | Source code management |
| **IDE** | Windsurf | AI-assisted desktop IDE (Windows 11) |

---

## 6. API Specification

### Base URL

```
https://white-stag-budget-backend-xxx.vercel.app
```

### Authentication

Every request must include a Firebase ID token in the Authorization header. The backend calls Firebase Admin SDK to verify it, extracts the `uid`, then uses that uid to query Supabase.

```
Authorization: Bearer <firebase-id-token>
```

### Endpoints (Phase 1 — Live)

#### 1. Create Household

```
POST /api/household/create
Request:  { userId, email, name, householdName }
Response: { householdId, joinCode, message }
```

#### 2. Join Household

```
POST /api/household/join
Request:  { userId, email, name, joinCode }
Response: { householdId, householdName, message }
```

### Future Endpoints

- `GET /api/household/{householdId}` — Get household details
- `POST /api/household/{householdId}/priority-stack` — Update priority stack
- `GET /api/household/{householdId}/transactions` — Get transaction feed
- `POST /api/unlock` — Unlock a category
- `POST /api/transaction/match` — Match transaction to unlock

---

## 7. Deployment & DevOps

### Mobile App
- Development testing: Expo Go app on physical device (scan QR code)
- Production builds: Expo EAS Build (cloud-based, no local Xcode/Android Studio needed)
- Distribution: App Store (iOS) and Google Play Store (Android)

### Backend
- Platform: Vercel (serverless functions)
- Trigger: Push to `main` branch in GitHub
- Auto-deploy: Yes (via Git webhook)
- Environment Variables: Firebase credentials + Supabase URL and service key stored in Vercel

### Database
- Platform: Supabase (hosted PostgreSQL)
- Backup: Automatic daily backups (Supabase managed)
- Security: Row Level Security policies managed in Supabase dashboard
- Note: Firestore is not used and should be removed from firebase-admin dependency

### GitHub Repositories
- `white-stag-budget-backend` — Node.js API
- `white-stag-budget-frontend` — Expo React Native app

---

## 8. Development Workflow

### Local Development (Windows 11)
1. Open project in Windsurf (desktop IDE)
2. Run: `npx expo start`
3. Scan QR code with Expo Go app on your phone
4. Live reload: changes appear on device instantly
5. Push to GitHub when ready; Vercel auto-deploys backend

### Testing
- Mobile: Expo Go on real device (fastest feedback loop)
- Backend APIs: call from app or use Postman/Insomnia
- Database: verify data in Supabase Table Editor

---

## 9. Scalability & Business Model

### Current: Personal Tier
- Single user, single household — Free

### Future: Household Tier
- Multiple users (spouses, teens), shared stack — $9.99/month

### Future: Advisor Tier
- Accountants view multiple households — $49.99/month

The architecture supports all tiers **today** because households are the unit, not individual users.

---

## 10. Milestones & Timeline

| Milestone | Target | Status |
|---|---|---|
| Backend API live on Vercel | Week 1 | ✅ Done |
| Supabase database configured | Week 1 | ✅ Done |
| Expo mobile app initialized | Week 2 | ✅ Done |
| Mobile login/signup screens | Week 2 | 🔄 In Progress |
| Priority Stack UI | Week 3 | 📋 Planned |
| Plaid integration | Week 4-5 | 📋 Planned |
| Unlock Ritual & alerts | Week 6 | 📋 Planned |
| Beta launch (TestFlight / Play Beta) | Week 7 | 📋 Planned |

---

## 11. Key Decisions & Rationale

### Why Supabase?
- PostgreSQL gives real data integrity: `CHAR(6)` on join codes, `CHECK` constraints on enums
- Row Level Security enforces household isolation at the database level, not the app level
- Supabase dashboard makes it easy to inspect and query data during development
- Pairs cleanly with Firebase Auth via Vercel middleware — each tool does one job well
- Scales from a single household to millions without infrastructure changes

### Why Firebase Auth (not Supabase Auth)?
- Firebase Auth was already integrated in Sprint 1 and is working
- Firebase Auth handles the identity layer; Supabase handles the data layer
- The backend bridges them: verify JWT with Firebase Admin, then query Supabase by uid
- No reason to change what is working

### Why Expo (React Native)?
- The Unlock Ritual requires a phone in-hand at point of purchase — web does not fit
- Push notifications are first-class on mobile; FCM integrates natively
- Expo removes the need for local Xcode/Android Studio setup
- Expo Go enables instant device testing without a full build cycle

### Why Windsurf?
- Full-featured desktop IDE on Windows 11
- AI-assisted coding speeds up React Native development
- Built-in Git integration — push directly to GitHub

### Why Vercel?
- Serverless — no infrastructure to manage
- One-click Git deployments
- Secure environment variable storage for Firebase and Supabase credentials

### Why Multi-Tenant from Day 1?
- Avoids rip-and-replace when scaling
- Data isolation enforced at the database level via Supabase RLS

---

## 12. Success Criteria

### Phase 1 Complete when:
- Two users can sign up and join the same household via the mobile app
- Both users can log in and see shared household data
- Backend APIs verified working; data visible in Supabase Table Editor
- Vercel deployments are automatic

### Phase 2 Complete when:
- Priority Stack drag-and-drop works on device
- Real-time sync between users
- Waterfall algorithm calculates correctly

### Phase 3 Complete when:
- Bank accounts can be linked via Plaid
- Transaction feed appears in real-time on device

### Phase 4 Complete when:
- Unlock button works on mobile
- Push notifications fire correctly on both devices
- Match/alert logic works end-to-end

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Supabase RLS misconfigured — household data leaks across users | Test RLS policies with two separate accounts before any launch; use Supabase policy editor |
| Supabase bill grows unexpectedly | Set up cost alerts in Supabase dashboard; optimize queries |
| Firebase Auth and Supabase uid get out of sync | Always create Supabase user row on first Firebase Auth sign-in; never assume row exists |
| Firestore still in firebase-admin package causing confusion | Remove Firestore references from backend; keep only auth module |
| Users confused by household concept | Onboarding flow explains it clearly with join code UI |
| Plaid integration is complex | Start with manual transaction entry first |
| Push notifications do not reach users | Test Expo Notifications + FCM on real devices early |
| App Store review delays production release | Use TestFlight (iOS) and Play Beta for pre-release testing |
| Expo SDK upgrade breaks dependencies | Pin Expo SDK version; upgrade only between sprints |

---

## 14. Next Steps

- ✅ Done: Backend deployed on Vercel
- ✅ Done: Supabase database configured with households, users, transactions tables
- ✅ Done: Expo mobile app initialized in Windsurf on Windows 11
- 🔄 In Progress: Build mobile login/signup screens calling existing backend APIs
- 📋 Planned: Test end-to-end — mobile app → backend → Supabase
- 📋 Planned: Build Priority Stack UI with drag-and-drop
- 📋 Planned: Integrate Plaid
- 📋 Planned: Build Unlock Ritual & push notifications
- 🧹 Cleanup: Remove unused Firestore references from firebase-admin in backend

---

*Document Owner: You  |  Last Updated: May 25, 2026  |  Next Review: After Sprint 2 completion*