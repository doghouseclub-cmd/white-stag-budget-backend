# Priority Stack API Specification

## Overview

The Priority Stack API manages household spending priorities and approval workflows. All endpoints require Firebase authentication (Bearer token in Authorization header).

**Base URL**: `/api/priority-stack`

**Authentication**: All endpoints require `Authorization: Bearer <idToken>` header

**Response Format**: JSON with `{ success: boolean, data: {...}, error?: string }`

---

## Endpoints

### 1. GET /api/priority-stack/active

**Description**: Get the current approved active priority stack.

**Access**: All household members

**Request**:
```http
GET /api/priority-stack/active
Authorization: Bearer <idToken>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "stack": {
    "id": "active",
    "version": 3,
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-02-20T14:45:00Z",
    "promotedAt": "2025-02-20T14:45:00Z",
    "promotedBy": "user-id-123",
    "totalAmount": 5200,
    "categoryCount": 6,
    "categories": [
      {
        "id": "cat-uuid-1",
        "name": "Rent",
        "amount": 2000,
        "order": 1,
        "monthlyBudget": 2000,
        "maxBalance": null,
        "description": "Monthly apartment rent",
        "icon": "home",
        "color": "#FF6B6B",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-02-01T12:00:00Z"
      },
      {
        "id": "cat-uuid-2",
        "name": "Groceries",
        "amount": 500,
        "order": 2,
        "monthlyBudget": 500,
        "maxBalance": 1000,
        "description": "Food shopping and groceries",
        "icon": "shopping-bag",
        "color": "#4ECDC4",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-02-15T08:00:00Z"
      },
      {
        "id": "cat-uuid-3",
        "name": "Utilities",
        "amount": 150,
        "order": 3,
        "monthlyBudget": 150,
        "maxBalance": null,
        "description": "Electric, water, gas",
        "icon": "zap",
        "color": "#FFD93D",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      },
      {
        "id": "cat-uuid-4",
        "name": "Transportation",
        "amount": 300,
        "order": 4,
        "monthlyBudget": 300,
        "maxBalance": null,
        "description": "Gas, maintenance, parking",
        "icon": "car",
        "color": "#6BCB77",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      },
      {
        "id": "cat-uuid-5",
        "name": "Entertainment",
        "amount": 200,
        "order": 5,
        "monthlyBudget": 200,
        "maxBalance": 400,
        "description": "Movies, games, hobbies",
        "icon": "star",
        "color": "#A78BFA",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-02-10T15:00:00Z"
      },
      {
        "id": "cat-uuid-6",
        "name": "Savings",
        "amount": 2050,
        "order": 6,
        "monthlyBudget": 2050,
        "maxBalance": null,
        "description": "Emergency fund and long-term savings",
        "icon": "piggy-bank",
        "color": "#F97316",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-02-01T12:00:00Z"
      }
    ]
  }
}
```

**Error Responses**:

| Status | Scenario | Response |
|--------|----------|----------|
| 401 | No token or invalid token | `{ "success": false, "error": "Unauthorized" }` |
| 404 | User not in household | `{ "success": false, "error": "User not in a household" }` |
| 404 | Active stack not initialized | `{ "success": false, "error": "Active priority stack not found. Initialize household first." }` |
| 500 | Server error | `{ "success": false, "error": "Server error" }` |

---

### 2. GET /api/priority-stack/draft

**Description**: Get the draft priority stack with approval status.

**Access**: All household members

**Request**:
```http
GET /api/priority-stack/draft
Authorization: Bearer <idToken>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "stack": {
    "id": "draft",
    "version": 4,
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-02-22T09:15:00Z",
    "lastEditedBy": "user-id-456",
    "lastEditedAt": "2025-02-22T09:15:00Z",
    "approvedBy": ["user-id-123"],
    "isFullyApproved": false,
    "totalAmount": 5300,
    "categoryCount": 6,
    "approvalStatus": [
      {
        "userId": "user-id-123",
        "approved": true
      },
      {
        "userId": "user-id-456",
        "approved": false
      },
      {
        "userId": "user-id-789",
        "approved": false
      }
    ],
    "categories": [
      {
        "id": "cat-uuid-1",
        "name": "Rent",
        "amount": 2000,
        "order": 1,
        "monthlyBudget": 2000,
        "maxBalance": null,
        "description": "Monthly apartment rent",
        "icon": "home",
        "color": "#FF6B6B",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-02-01T12:00:00Z"
      },
      {
        "id": "cat-uuid-2",
        "name": "Groceries",
        "amount": 600,
        "order": 2,
        "monthlyBudget": 600,
        "maxBalance": 1200,
        "description": "Food shopping and groceries",
        "icon": "shopping-bag",
        "color": "#4ECDC4",
        "isArchived": false,
        "createdAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-02-22T09:15:00Z"
      }
      // ... more categories
    ]
  }
}
```

**Error Responses**: Same as GET /active, plus:

| Status | Scenario | Response |
|--------|----------|----------|
| 404 | Draft stack not initialized | `{ "success": false, "error": "Draft priority stack not found. Initialize household first." }` |

---

### 3. POST /api/priority-stack/draft

**Description**: Add, edit, remove, or reorder categories in the draft. **Resets all approvals on any change.**

**Access**: All household members

**Request Format**:

#### 3a. Add Category
```http
POST /api/priority-stack/draft
Content-Type: application/json
Authorization: Bearer <idToken>

{
  "action": "add",
  "category": {
    "name": "Dining Out",
    "amount": 200,
    "order": 5,
    "monthlyBudget": 200,
    "maxBalance": null,
    "description": "Restaurants and takeout",
    "icon": "utensils",
    "color": "#EC4899"
  }
}
```

#### 3b. Edit Category
```http
POST /api/priority-stack/draft
Content-Type: application/json
Authorization: Bearer <idToken>

{
  "action": "edit",
  "categoryId": "cat-uuid-2",
  "category": {
    "amount": 600,
    "maxBalance": 1200,
    "description": "Food shopping and groceries (updated)"
  }
}
```

#### 3c. Remove Category (soft delete)
```http
POST /api/priority-stack/draft
Content-Type: application/json
Authorization: Bearer <idToken>

{
  "action": "remove",
  "categoryId": "cat-uuid-5"
}
```

#### 3d. Reorder Category
```http
POST /api/priority-stack/draft
Content-Type: application/json
Authorization: Bearer <idToken>

{
  "action": "reorder",
  "categoryId": "cat-uuid-2",
  "newOrder": 3
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "action": "add",
  "message": "Category add successful. All approvals have been reset.",
  "stack": {
    "id": "draft",
    "version": 5,
    "updatedAt": "2025-02-22T10:00:00Z",
    "lastEditedBy": "user-id-456",
    "lastEditedAt": "2025-02-22T10:00:00Z",
    "approvedBy": [],
    "totalAmount": 5500,
    "categoryCount": 7,
    "categories": [
      // ... all categories including newly added one
    ]
  }
}
```

**Error Responses**:

| Status | Scenario | Response |
|--------|----------|----------|
| 400 | Invalid action | `{ "success": false, "error": "Action must be one of: add, edit, remove, reorder" }` |
| 400 | Category name too long | `{ "success": false, "error": "Category name must be 1-25 characters" }` |
| 400 | Category amount invalid | `{ "success": false, "error": "Category amount must be >= 0" }` |
| 400 | Duplicate category name | `{ "success": false, "error": "Category name must be unique" }` |
| 400 | Duplicate order | `{ "success": false, "error": "Category order must be unique within the stack" }` |
| 400 | Missing required field | `{ "success": false, "error": "[field] is required" }` |
| 404 | Category not found (edit/remove/reorder) | `{ "success": false, "error": "Category not found" }` |
| 500 | Server error | `{ "success": false, "error": "Server error" }` |

---

### 4. POST /api/priority-stack/approve

**Description**: Approve the draft. When all members approve, draft automatically becomes active.

**Access**: All household members

**Request**:
```http
POST /api/priority-stack/approve
Authorization: Bearer <idToken>
```

**Response (200 OK) — Partial Approval**:
```json
{
  "success": true,
  "approved": true,
  "message": "Draft approved by user. 2/3 members approved.",
  "approvalCount": "2/3",
  "approvalStatus": [
    {
      "userId": "user-id-123",
      "approved": true
    },
    {
      "userId": "user-id-456",
      "approved": true
    },
    {
      "userId": "user-id-789",
      "approved": false
    }
  ]
}
```

**Response (200 OK) — Full Approval (Draft Promoted)**:
```json
{
  "success": true,
  "approved": true,
  "message": "Draft approved by user. All members approved. Draft promoted to active.",
  "stack": {
    "id": "draft",
    "version": 5,
    "categories": [
      // ... all categories
    ],
    "approvedBy": [],
    "totalAmount": 5500,
    "categoryCount": 7
  }
}
```

**Error Responses**:

| Status | Scenario | Response |
|--------|----------|----------|
| 400 | User already approved | `{ "success": false, "error": "User has already approved this draft version" }` |
| 404 | Draft not found | `{ "success": false, "error": "Draft priority stack not found" }` |
| 500 | Server error | `{ "success": false, "error": "Server error" }` |

---

### 5. POST /api/priority-stack/reset

**Description**: Reset draft back to active, discarding all changes and clearing approvals.

**Access**: All household members

**Request**:
```http
POST /api/priority-stack/reset
Authorization: Bearer <idToken>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Draft reset to active. All changes discarded. All approvals cleared.",
  "stack": {
    "id": "draft",
    "version": 3,
    "categories": [
      // ... categories from active stack
    ],
    "approvedBy": [],
    "totalAmount": 5200,
    "categoryCount": 6
  }
}
```

**Error Responses**:

| Status | Scenario | Response |
|--------|----------|----------|
| 404 | Active stack not found | `{ "success": false, "error": "Active priority stack not found" }` |
| 500 | Server error | `{ "success": false, "error": "Server error" }` |

---

### 6. GET /api/priority-stack/approvals

**Description**: Get detailed approval status for the pending draft.

**Access**: All household members

**Request**:
```http
GET /api/priority-stack/approvals
Authorization: Bearer <idToken>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "allApproved": false,
  "approvalCount": "2/3",
  "draftVersion": 5,
  "lastUpdatedAt": "2025-02-22T10:00:00Z",
  "approvalStatus": [
    {
      "userId": "user-id-123",
      "email": "alice@example.com",
      "name": "Alice Smith",
      "approved": true,
      "approvedAt": "2025-02-22T10:00:00Z"
    },
    {
      "userId": "user-id-456",
      "email": "bob@example.com",
      "name": "Bob Johnson",
      "approved": true,
      "approvedAt": "2025-02-22T10:05:00Z"
    },
    {
      "userId": "user-id-789",
      "email": "carol@example.com",
      "name": "Carol Williams",
      "approved": false,
      "approvedAt": null
    }
  ]
}
```

**Error Responses**:

| Status | Scenario | Response |
|--------|----------|----------|
| 404 | Draft not found | `{ "success": false, "error": "Draft priority stack not found" }` |
| 500 | Server error | `{ "success": false, "error": "Server error" }` |

---

## Data Types & Constraints

### Category Object

```typescript
{
  id: string;                  // UUID (auto-generated on creation)
  name: string;                // 1-25 characters, unique within household
  amount: number;              // >= 0 (or negative if allowNegativeBalances=true)
  order: number;               // >= 1, unique within stack
  monthlyBudget: number;       // >= 0
  maxBalance?: number | null;  // If provided: > 0
  description?: string;        // Max 200 characters
  icon?: string;               // Icon name (e.g., "home", "shopping-bag")
  color?: string;              // Hex color (e.g., "#FF6B6B")
  isArchived: boolean;         // Default: false
  createdAt: Timestamp;        // ISO 8601 string
  updatedAt: Timestamp;        // ISO 8601 string
}
```

### Stack Object

```typescript
{
  id: "active" | "draft";
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastEditedBy?: string;       // (draft only)
  lastEditedAt?: Timestamp;    // (draft only)
  promotedAt?: Timestamp;      // (active only)
  promotedBy?: string;         // (active only)
  categories: Category[];
  approvedBy?: string[];       // (draft only) - User IDs who approved
  totalAmount: number;
  categoryCount: number;
}
```

---

## Approval Workflow

### Step-by-Step Flow

1. **Members edit draft** → Multiple `POST /draft` calls
   - Each edit increments `version` and resets `approvedBy: []`

2. **Members review and approve** → Individual `POST /approve` calls
   - System tracks approvals in `approvedBy` array
   - If user edits draft after approving, approvals reset

3. **All members approve** → System auto-promotes
   - Draft becomes active (version increments)
   - History entry created
   - Draft `approvedBy` array cleared
   - Draft `version` resets to match active

4. **Member wants to change** → `POST /draft` with edits
   - Cycle repeats from step 1

5. **Want to discard changes** → `POST /reset`
   - Draft returns to active state
   - All approvals cleared

### Concurrent Edit Handling

If two members edit simultaneously:
- **Non-conflicting changes** (e.g., different categories): Auto-merge ✓
- **Conflicting changes** (e.g., both edit same field): Last-write-wins ✓
- **Always**: All approvals reset to `[]` ✓

---

## Integration with Household API

### Initialization (on household creation)

When a household is created via `POST /api/households/create`, the backend should initialize Priority Stack:

```javascript
const { initializePriorityStack } = require('./priority-stack-routes');

// After household document created:
await initializePriorityStack(householdId, []); // Empty stack initially

// Or with default categories:
const defaultCategories = [
  {
    name: "Rent",
    amount: 0,
    order: 1,
    monthlyBudget: 0,
    // ... etc
  },
];
await initializePriorityStack(householdId, defaultCategories);
```

---

## Validation Rules Summary

| Field | Rule |
|-------|------|
| Category Name | Required, 1-25 chars, unique, trimmed |
| Category Amount | Required, >= 0 (or negative if allowed) |
| Category Order | Required, >= 1, unique |
| Monthly Budget | Required, >= 0 |
| Max Balance | Optional, if provided must be > 0 |
| Description | Optional, max 200 chars |
| Icon | Optional, string |
| Color | Optional, hex format (#RRGGBB) |
| Draft Version | Increments on every edit |
| Active Version | Increments only on promotion |
| Approval Array | Tracks user IDs, resets on any draft edit |

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found (resource doesn't exist) |
| 409 | Conflict (e.g., duplicate order, stale approval) |
| 500 | Server Error |

---

## Implementation Notes

### Optimistic Merge Strategy

For concurrent edits, the system uses optimistic merging:

1. **Detect conflict**: If `lastEditedBy` differs from current user AND edit within 5 seconds
2. **Attempt merge**: If changes don't overlap, apply both
3. **Fail if conflict**: If same field edited by two users simultaneously, return 409
4. **Always reset approvals**: Regardless of merge outcome

### Version Numbers

- **Draft version**: Increments on EVERY edit (add, edit, remove, reorder)
- **Active version**: Increments ONLY when promoted from draft
- **Used for**: Detecting stale approvals (if draft version changes after approval, approvals reset)

### Performance Considerations

- **No batch operations**: Each edit triggers immediate Firestore update
- **Index on `updatedAt`**: Allows sorting by recent changes
- **History cleanup**: Consider archiving old history entries after 1+ year (future feature)
- **Approval tracking**: Uses simple array for < 50 members; scale if needed

---

## Household Settings Impact

Settings in `households/{householdId}/settings`:

| Setting | Impact |
|---------|--------|
| `allowNegativeBalances` | If true, categories can have negative amounts |
| `currency` | Displayed in UI (ISO code, e.g., "USD") |
| `spilloverMode` | Used by Income Allocation system (not Priority Stack) |

The Priority Stack API validates `allowNegativeBalances` on category amount validation.

---

## Future Enhancements

- [ ] Template system (Simple, Family, Full)
- [ ] Reorder by drag-and-drop (frontend)
- [ ] Bulk import categories from CSV
- [ ] Category descriptions with markdown support
- [ ] Approval deadline with auto-reset after X days
- [ ] Approval history (per-user approval timestamps)
- [ ] Change summary (what changed between versions)
- [ ] Rollback to previous active version
- [ ] Comments/discussion on draft categories