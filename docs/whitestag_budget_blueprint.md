# White Stag Budget - Project Blueprint & Technical Specification

**Version:** 1.0  
**Date:** May 22, 2026  
**Project Type:** Multi-Tenant SaaS Budgeting Application

-----

## 1. The Goal (The “Vibe”)

White Stag Budget is a **collaborative financial bodyguard for households**. It separates planning from action, allowing spouses to see synchronized spending intentions and receive alerts when real-world transactions deviate from those intentions.

**Core Philosophy:** Before you swipe, you unlock your intent.

-----

## 2. Main Use Cases

### Use Case 1: Household Setup & Onboarding

- **Actor:** User A (household creator)
- **Flow:** Sign up → Create household → Share join code with User B
- **Outcome:** Both users belong to the same household and can see shared data

### Use Case 2: Shared Financial Planning

- **Actors:** User A & User B (household members)
- **Flow:** View shared Priority Stack → Drag-and-drop to rank spending categories → See “Zero-Out Line” update as income flows down
- **Outcome:** Both users see the same waterfall allocation in real-time

### Use Case 3: Pre-Purchase Intent (The Unlock Ritual)

- **Actors:** User A (spender)
- **Flow:** Open app → Tap “Unlock [Category]” (e.g., “Unlock Groceries”) → Go make purchase → App confirms or alerts
- **Outcome:** User’s intent is recorded; if transaction matches, no alert; if unmatched, both spouses are notified

### Use Case 4: Transaction Verification

- **Actors:** User A (spender), User B (observer)
- **Flow:** Real transaction hits household bank account → App checks if it was “unlocked” → Sends notification
- **Outcome:** Household gets real-time visibility into spending behavior

-----

## 3. Architecture & Technical Design

### 3.1 System Layers

```
┌─────────────────────────────────────────┐
│         Frontend Layer                  │
│  (Next.js + React + Tailwind CSS)       │
│  - Login / Sign-up                      │
│  - Priority Stack (drag-and-drop)       │
│  - Unlock Ritual UI                     │
│  - Transaction Feed                     │
└────────────┬────────────────────────────┘
             │ HTTPS API Calls
┌────────────▼────────────────────────────┐
│         Backend Layer                   │
│  (Node.js + Express on Vercel)          │
│  - Authentication                       │
│  - Household Management                 │
│  - Priority Waterfall Logic              │
│  - Unlock/Transaction Matching          │
└────────────┬────────────────────────────┘
             │ Firestore SDK
┌────────────▼────────────────────────────┐
│         Database Layer                  │
│  (Google Firestore)                     │
│  - /households/{householdId}            │
│  - /users/{userId}                      │
│  - /transactions/{transactionId}        │
│  - Security Rules (multi-tenant)        │
└─────────────────────────────────────────┘
```

### 3.2 Data Model

#### Households Collection

```
/households/{householdId}
  ├── name: string (e.g., "Smith Household")
  ├── createdAt: timestamp
  ├── members: array[userId]
  ├── joinCode: string (6-char, unique)
  ├── settings: {
  │   ├── spilloverMode: "waterfall" | "proportional"
  │   └── currency: "USD"
  │ }
  └── priorityStack: {
      ├── categories: array[{
      │   ├── id: string
      │   ├── name: string (e.g., "Rent")
      │   ├── amount: number
      │   ├── order: number (priority rank)
      │   └── monthlyBudget: number
      │ }]
      └── lastUpdated: timestamp
    }
```

#### Users Collection

```
/users/{userId}
  ├── email: string
  ├── name: string
  ├── householdId: string (pointer to household)
  ├── role: "owner" | "member"
  ├── createdAt: timestamp
  └── lastLogin: timestamp
```

#### Transactions Collection

```
/households/{householdId}/transactions/{transactionId}
  ├── amount: number
  ├── category: string
  ├── description: string
  ├── isUnlocked: boolean
  ├── unlockedBy: userId (if unlocked)
  ├── unlockedAt: timestamp
  ├── transactionAt: timestamp (when real transaction occurred)
  ├── source: "plaid" | "manual"
  ├── status: "matched" | "unmatched" | "pending"
  └── notes: string
```

### 3.3 Multi-Tenant Security Model

All data is scoped to `householdId`. Firestore Security Rules enforce:

```
- Users can only read/write their own /users/{userId} document
- Users can only read/write /households/{householdId} if they are in members array
- All sub-collections inherit this rule
```

This ensures User A from Household 1 cannot access User B from Household 2.

-----

## 4. Core Features (Roadmap)

### Sprint 1: Multi-Tenant Core ✅ (DONE)

- User signup/login (Firebase Auth)
- Create household (User A gets join code)
- Join household (User B enters code, added to household)
- Backend API endpoints live on Vercel
- Firestore database configured

### Sprint 2: Shared Priority Stack

- Frontend UI: Drag-and-drop priority list
- Backend: Store/retrieve priority stack
- Real-time sync: When User A reorders, User B sees it instantly
- Waterfall algorithm: Income flows down categories until $0

### Sprint 3: Bank Connectivity

- Plaid integration: Link bank accounts to household
- Multi-item support: User A links Chase, User B links Wells Fargo
- Transaction normalization: Merge all transactions into household feed
- Webhook: Real-time transaction updates from Plaid

### Sprint 4: Unlock Ritual & Alerts

- “Unlock” button: User taps to unlock intent before purchase
- Match logic: Check if real transaction matches unlocked intent
- Notifications: Firebase Cloud Messaging (FCM) for alerts to both spouses
- Dashboard: Show matched vs. unmatched transactions

-----

## 5. Technology Stack

|Layer              |Technology                    |Purpose                                          |
|-------------------|------------------------------|-------------------------------------------------|
|**Frontend**       |Next.js 14+                   |React framework with server-side rendering       |
|                   |React                         |UI component library                             |
|                   |Tailwind CSS                  |Styling (mobile-first)                           |
|                   |Firebase SDK                  |Authentication & real-time data                  |
|**Backend**        |Node.js 24.x                  |Server runtime                                   |
|                   |Express.js                    |HTTP API framework                               |
|                   |Firebase Admin SDK            |Server-side Firestore access                     |
|**Database**       |Google Firestore              |NoSQL, real-time, multi-tenant                   |
|**Auth**           |Firebase Auth                 |OAuth, email/password, session management        |
|**Deployment**     |Vercel                        |Frontend & backend hosting (auto-deploy from Git)|
|**Payments**       |Stripe (future)               |Subscription billing                             |
|**Bank Data**      |Plaid                         |Bank account linking & transaction feeds         |
|**Notifications**  |Firebase Cloud Messaging (FCM)|Push notifications to mobile/web                 |
|**Version Control**|GitHub                        |Source code management                           |
|**IDE**            |Replit                        |Browser-based code editor (frontend development) |

-----

## 6. API Specification

### Base URL

```
https://white-stag-budget-backend-xxx.vercel.app
```

### Endpoints (Phase 1)

#### 1. Create Household

```
POST /api/household/create
Request: {
  userId: string,
  email: string,
  name: string,
  householdName: string
}
Response: {
  householdId: string,
  joinCode: string,
  message: string
}
```

#### 2. Join Household

```
POST /api/household/join
Request: {
  userId: string,
  email: string,
  name: string,
  joinCode: string
}
Response: {
  householdId: string,
  householdName: string,
  message: string
}
```

### Future Endpoints (to be built)

- `GET /api/household/{householdId}` — Get household details
- `POST /api/household/{householdId}/priority-stack` — Update priority stack
- `GET /api/household/{householdId}/transactions` — Get transaction feed
- `POST /api/unlock` — Unlock a category
- `POST /api/transaction/match` — Match transaction to unlock

-----

## 7. Deployment & DevOps

### Frontend Deployment

- **Platform:** Vercel
- **Trigger:** Push to `main` branch in GitHub
- **Auto-deploy:** Yes (via Git webhook)

### Backend Deployment

- **Platform:** Vercel (serverless functions)
- **Trigger:** Push to `main` branch in GitHub
- **Auto-deploy:** Yes (via Git webhook)
- **Environment Variables:** Firebase credentials (stored securely in Vercel)

### Database

- **Platform:** Google Firebase Console
- **Backup:** Automatic daily backups
- **Security Rules:** Deployed via Firestore console

### GitHub Repositories

1. `white-stag-budget-backend` — Node.js API
1. `white-stag-budget-frontend` — Next.js web app

-----

## 8. Development Workflow

### Local Development (iPad)

1. Use **Replit** (browser-based IDE) for coding
1. Make changes in Replit editor
1. Push to GitHub from Replit
1. Vercel auto-deploys (1-2 minutes)
1. Test live on Vercel URL

### Testing the APIs

- Frontend calls backend APIs on Vercel
- Firestore stores data in real-time
- Use Firestore Console to verify data

-----

## 9. Scalability & Business Model

### Current: Personal Tier

- Single user, single household
- Free

### Future: Household Tier

- Multiple users (spouses, teens)
- Shared stack
- $9.99/month

### Future: Advisor Tier

- Accountants view multiple households
- $49.99/month

The architecture supports all tiers **today** because households are the unit, not users.

-----

## 10. Milestones & Timeline

|Milestone                 |Target  |Status       |
|--------------------------|--------|-------------|
|Backend API live on Vercel|Week 1  |✅ Done       |
|Frontend login/signup     |Week 2  |🚧 In Progress|
|Priority Stack UI         |Week 3  |📋 Planned    |
|Plaid integration         |Week 4-5|📋 Planned    |
|Unlock Ritual & alerts    |Week 6  |📋 Planned    |
|Beta launch               |Week 7  |📋 Planned    |

-----

## 11. Key Decisions & Rationale

### Why Firestore?

- Real-time sync (User A moves item → User B sees instantly)
- Built-in authentication integration
- Scales from 1 user to 1M users
- No server management needed

### Why Multi-Tenant from Day 1?

- Avoids “rip and replace” when scaling
- Platform thinking from the start
- Data isolation is enforced at database level

### Why Vercel?

- One-click Git deployments
- Serverless (no infrastructure to manage)
- Perfect for iPad-based development (no CLI needed)

### Why Replit for Frontend?

- Browser-based editor (works on iPad)
- Built-in Git integration
- Can push directly to GitHub

-----

## 12. Success Criteria

✅ **Phase 1 Complete when:**

- Two users can sign up and join the same household
- Both users can log in and see shared household data
- Backend APIs are tested and working
- Vercel deployments are automatic

✅ **Phase 2 Complete when:**

- Priority Stack drag-and-drop works
- Real-time sync between users
- Waterfall algorithm calculates correctly

✅ **Phase 3 Complete when:**

- Bank accounts can be linked via Plaid
- Transaction feed appears in real-time

✅ **Phase 4 Complete when:**

- Unlock button works
- Notifications fire correctly
- Match/alert logic works end-to-end

-----

## 13. Risks & Mitigations

|Risk                                 |Mitigation                                            |
|-------------------------------------|------------------------------------------------------|
|Firestore bill grows unexpectedly    |Set up cost alerts; optimize queries                  |
|Real-time sync lags                  |Use Firestore indexes; profile with Firestore debugger|
|Users confused by “household” concept|Onboarding flow explains it clearly                   |
|Plaid integration is complex         |Start with manual transaction entry first             |
|Push notifications don’t reach users |Test FCM on real devices early                        |

-----

## 14. Next Steps

1. ✅ Backend deployed
1. 🔄 Build frontend in Replit (login, signup, join household)
1. Test end-to-end (frontend calling backend APIs)
1. Build Priority Stack UI
1. Integrate Plaid
1. Build Unlock Ritual

-----

**Document Owner:** You  
**Last Updated:** May 22, 2026  
**Next Review:** After Sprint 2 completion