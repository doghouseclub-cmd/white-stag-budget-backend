# White Stag Budget Backend

API layer for the White Stag Budget multi-tenant household budgeting app.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Firebase Credentials

- Go to Firebase Console → Project Settings → Service Accounts
- Generate a new private key
- Copy the JSON and add to `.env`:

```
FIREBASE_PROJECT_ID=your-id
FIREBASE_PRIVATE_KEY=your-key
FIREBASE_CLIENT_EMAIL=your-email
```

### 3. Local Development

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### 4. Deploy to Vercel

#### Option A: Via GitHub (Recommended)

1. Push this repo to GitHub
1. Go to [vercel.com](https://vercel.com)
1. Click “New Project”
1. Import your GitHub repo
1. Add environment variables (same as `.env`)
1. Deploy

#### Option B: Via Vercel CLI

```bash
npm install -g vercel
vercel
```

## API Endpoints

### Create Household

```
POST /api/household/create
Body: {
  userId: "user123",
  email: "alice@example.com",
  name: "Alice",
  householdName: "Smith Household"
}
Response: {
  householdId: "...",
  joinCode: "ABC123"
}
```

### Join Household

```
POST /api/household/join
Body: {
  userId: "user456",
  email: "bob@example.com",
  name: "Bob",
  joinCode: "ABC123"
}
Response: {
  householdId: "...",
  householdName: "Smith Household"
}
```

## Firestore Security Rules

Apply `firestore.rules` in Firebase Console → Firestore → Rules tab.

## Architecture

- **Frontend:** Next.js (separate repo)
- **Backend:** Node.js + Express (this repo)
- **Database:** Firestore
- **Auth:** Firebase Auth
- **Hosting:** Vercel