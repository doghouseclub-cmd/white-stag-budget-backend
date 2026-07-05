# Household API Specification

## Overview

The Household API manages household creation, membership, joining, and household-level settings. All endpoints require Supabase authentication.

-----

## Data Model

### Households Collection

```
/households/{householdId}
  ├── id: string (GUID, auto-generated)
  ├── name: string (2-75 characters)
  ├── createdAt: timestamp
  ├── createdBy: userId
  ├── members: array[userId]
  ├── joinCode: string (6-character unique code)
  ├── joinCodeExpiresAt: timestamp (2 days from creation)
  └── settings: {
      ├── allowNegativeBalances: boolean (default: false)
      └── currency: string (default: "USD")
    }
```

### Users Collection (Updated)

```
/users/{userId}
  ├── id: string (user UUID from Supabase Auth)
  ├── email: string (unique, lowercased)
  ├── name: string
  ├── householdId: string | null (pointer to household, null if not in one)
  ├── role: "owner" | "member" (within their household)
  ├── createdAt: timestamp
  └── lastLogin: timestamp
```

-----

## API Endpoints

### 1. Create Household

**Endpoint:** `POST /api/household/create`

**Authentication:** Required (Supabase Auth)

**Request:**

```json
{
  "householdName": "Smith Household"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "household": {
    "householdId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Smith Household",
    "joinCode": "ABC123",
    "joinCodeExpiresAt": "2026-05-24T12:00:00Z",
    "members": ["user-123"],
    "settings": {
      "allowNegativeBalances": false,
      "currency": "USD"
    }
  },
  "message": "Household created. Share join code with others."
}
```

**Error Cases:**

- `400`: Household name invalid (length not 2-75 chars)
- `409`: User already in a household
- `401`: Unauthenticated

-----

### 2. Join Household

**Endpoint:** `POST /api/household/join`

**Authentication:** Required (Supabase Auth)

**Request:**

```json
{
  "joinCode": "ABC123"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "household": {
    "householdId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Smith Household",
    "members": ["user-123", "user-456"],
    "settings": {
      "allowNegativeBalances": false,
      "currency": "USD"
    }
  },
  "message": "Successfully joined household."
}
```

**Error Cases:**

- `404`: Join code not found
- `410`: Join code expired (2+ days old)
- `409`: User already in a household
- `401`: Unauthenticated

-----

### 3. Get Household Details

**Endpoint:** `GET /api/household`

**Authentication:** Required (Supabase Auth)

**Request:** No body

**Response (200 OK):**

```json
{
  "success": true,
  "household": {
    "householdId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Smith Household",
    "createdAt": "2026-05-22T10:00:00Z",
    "createdBy": "user-123",
    "members": [
      {
        "userId": "user-123",
        "email": "alice@example.com",
        "name": "Alice Smith",
        "role": "owner"
      },
      {
        "userId": "user-456",
        "email": "bob@example.com",
        "name": "Bob Smith",
        "role": "member"
      }
    ],
    "settings": {
      "allowNegativeBalances": false,
      "currency": "USD"
    }
  }
}
```

**Error Cases:**

- `404`: User not in a household
- `401`: Unauthenticated

-----

### 4. List Members

**Endpoint:** `GET /api/household/members`

**Authentication:** Required (Supabase Auth)

**Request:** No body

**Response (200 OK):**

```json
{
  "success": true,
  "members": [
    {
      "userId": "user-123",
      "email": "alice@example.com",
      "name": "Alice Smith",
      "role": "owner"
    },
    {
      "userId": "user-456",
      "email": "bob@example.com",
      "name": "Bob Smith",
      "role": "member"
    }
  ]
}
```

**Error Cases:**

- `404`: User not in a household
- `401`: Unauthenticated

-----

### 5. Remove Member

**Endpoint:** `POST /api/household/members/remove`

**Authentication:** Required (Supabase Auth)

**Authorization:** Only household owner can remove members

**Request:**

```json
{
  "userId": "user-456"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "User removed from household."
}
```

**Error Cases:**

- `403`: User is not the owner
- `404`: User not found or not in household
- `400`: Cannot remove the owner
- `401`: Unauthenticated

-----

### 6. Leave Household

**Endpoint:** `POST /api/household/leave`

**Authentication:** Required (Supabase Auth)

**Request:** No body

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Left household."
}
```

**Error Cases:**

- `400`: User is the owner (must transfer ownership or delete household first)
- `404`: User not in a household
- `401`: Unauthenticated

-----

### 7. Update Settings

**Endpoint:** `POST /api/household/settings`

**Authentication:** Required (Supabase Auth)

**Authorization:** Only household owner can update settings

**Request:**

```json
{
  "allowNegativeBalances": true,
  "currency": "EUR"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "settings": {
    "allowNegativeBalances": true,
    "currency": "EUR"
  },
  "message": "Settings updated."
}
```

**Error Cases:**

- `403`: User is not the owner
- `400`: Invalid currency code or settings
- `404`: User not in a household
- `401`: Unauthenticated

-----

### 8. Rotate Join Code (Future)

**Endpoint:** `POST /api/household/join-code/rotate`

**Authentication:** Required (Supabase Auth)

**Authorization:** Only household owner

**Request:** No body

**Response (200 OK):**

```json
{
  "success": true,
  "joinCode": "XYZ789",
  "joinCodeExpiresAt": "2026-05-26T12:00:00Z",
  "message": "Join code rotated."
}
```

-----

## Validation Rules

|Field         |Min     |Max     |Notes                               |
|--------------|--------|--------|------------------------------------|
|householdName |2 chars|75 chars|Required, trimmed                   |
|joinCode      |6 chars |6 chars |Auto-generated, alphanumeric, unique|
|currency      |-       |-       |ISO 4217 code (e.g., “USD”, “EUR”)  |
|joinCodeExpiry|-       |2 days  |From creation timestamp             |

-----

## Implementation Notes

### Join Code Generation

- 6 alphanumeric characters (A-Z, 0-9)
- Uniqueness: Check before inserting into `households.join_code`
- Expiry: `created_at + 2 days` (48 hours)

### User Role Management

- **Owner:** Can create/delete household, invite members, remove members, and update settings.
- **Member:** Can edit/approve the priority stack draft and leave the household.

### Household Lookup

- Users are identified by Supabase Auth UUID (`users.id` matches `auth.users.id`)
- Household membership is stored in `users.household_id`
- Always validate the caller is in the household before returning data

-----

## Status Codes

|Code|Meaning                             |
|----|------------------------------------|
|200 |Success                             |
|201 |Created                             |
|400 |Bad Request (validation error)      |
|401 |Unauthenticated                     |
|403 |Forbidden (unauthorized)            |
|404 |Not Found                           |
|409 |Conflict (duplicate, already exists)|
|410 |Gone (join code expired)            |
|500 |Server Error                        |