// Mock Supabase Auth — supabase.auth.getUser resolves to a test user based on token string.
const mockUsers = {
  'owner-token':  { id: '00000000-0000-4000-8000-0000000000b1',  email: 'ps-owner@test.com',  user_metadata: { name: 'PS Owner' }  },
  'member-token': { id: '00000000-0000-4000-8000-0000000000b2', email: 'ps-member@test.com', user_metadata: { name: 'PS Member' } },
  'bare-token':   { id: '00000000-0000-4000-8000-0000000000b3',   email: 'ps-bare@test.com',   user_metadata: { name: 'Bare User' } },
};

jest.mock('../lib/supabase', () => {
  const actual = jest.requireActual('../lib/supabase');
  return {
    ...actual,
    from: actual.from.bind(actual),
    auth: {
      ...actual.auth,
      getUser: jest.fn((token) => {
        const user = mockUsers[token];
        if (user) return Promise.resolve({ data: { user }, error: null });
        return Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } });
      }),
    },
  };
});

const request  = require('supertest');
const app      = require('../app');
const supabase = require('../lib/supabase');
const { initializePriorityStack } = require('../routes/priority-stack');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OWNER_UID  = '00000000-0000-4000-8000-0000000000b1';
const MEMBER_UID = '00000000-0000-4000-8000-0000000000b2';
const BARE_UID   = '00000000-0000-4000-8000-0000000000b3';

const OWNER_TOKEN  = 'owner-token';
const MEMBER_TOKEN = 'member-token';
const BARE_TOKEN   = 'bare-token';

const HH_ID   = '00000000-0000-4000-8000-000000000002';
const HH_NAME = 'Priority Stack Test Household White Stag!'; // 41 chars
const BARE_HH_ID   = '00000000-0000-4000-8000-000000000005';
const BARE_HH_NAME = 'Bare Test Household Without Priority Stack'; // 42 chars

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let draftStackId;
let activeStackId;

async function getStackIds() {
  const { data } = await supabase
    .from('priority_stacks')
    .select('id, stack_type')
    .eq('household_id', HH_ID);
  const draft  = data.find((s) => s.stack_type === 'draft');
  const active = data.find((s) => s.stack_type === 'active');
  draftStackId  = draft.id;
  activeStackId = active.id;
}

async function clearDraftCategories() {
  await supabase.from('priority_stack_categories').delete().eq('stack_id', draftStackId);
  await supabase.from('stack_approvals').delete().eq('stack_id', draftStackId);
}

async function addCategory(overrides = {}) {
  return request(app)
    .post('/api/priority-stack/draft')
    .set('Authorization', `Bearer ${OWNER_TOKEN}`)
    .send({
      action: 'add',
      name: 'Test Category',
      amount: 100,
      order: 1,
      monthlyBudget: 100,
      ...overrides,
    });
}

async function getCategoryByName(name) {
  const { data } = await supabase
    .from('priority_stack_categories')
    .select('id, sort_order, name')
    .eq('stack_id', draftStackId)
    .eq('name', name)
    .single();
  return data;
}

const TEST_EMAILS = ['ps-owner@test.com', 'ps-member@test.com', 'ps-bare@test.com'];
const TEST_UIDS   = [OWNER_UID, MEMBER_UID, BARE_UID];

async function cleanup() {
  // Unlink all users from test households first (handles stale rows from prior failed runs)
  await supabase.from('users').update({ household_id: null, household_role: null }).eq('household_id', HH_ID);
  await supabase.from('users').update({ household_id: null, household_role: null }).eq('household_id', BARE_HH_ID);
  // Also unlink by ID and email for extra safety
  await supabase.from('users').update({ household_id: null, household_role: null }).in('id', TEST_UIDS);
  await supabase.from('users').update({ household_id: null, household_role: null }).in('email', TEST_EMAILS);
  // Delete households (cascade: priority_stacks, categories, approvals)
  await supabase.from('households').delete().in('id', [HH_ID, BARE_HH_ID]);
  await supabase.from('households').delete().in('join_code', ['PSTEST', 'NOSTCK']);
  // Delete users
  await supabase.from('users').delete().in('id', TEST_UIDS);
  await supabase.from('users').delete().in('email', TEST_EMAILS);
}

// ---------------------------------------------------------------------------
// Global setup/teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  await cleanup();

  // Main household (owner + member, with priority stacks initialized)
  await supabase.from('households').insert({
    id: HH_ID,
    name: HH_NAME,
    created_by: OWNER_UID,
    join_code: 'PSTEST',
    join_code_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    allow_negative_balances: false,
    currency: 'USD',
    spillover_mode: 'waterfall',
  });

  await supabase.from('users').insert([
    { id: OWNER_UID,  email: 'ps-owner@test.com',  name: 'PS Owner',  household_id: HH_ID, household_role: 'owner'  },
    { id: MEMBER_UID, email: 'ps-member@test.com', name: 'PS Member', household_id: HH_ID, household_role: 'member' },
  ]);

  await initializePriorityStack(HH_ID);
  await getStackIds();

  // Bare household (no priority stacks) for 404 tests
  await supabase.from('households').insert({
    id: BARE_HH_ID,
    name: BARE_HH_NAME,
    created_by: BARE_UID,
    join_code: 'NOSTCK',
    join_code_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    allow_negative_balances: false,
    currency: 'USD',
    spillover_mode: 'waterfall',
  });

  await supabase.from('users').insert(
    { id: BARE_UID, email: 'ps-bare@test.com', name: 'Bare User', household_id: BARE_HH_ID, household_role: 'owner' }
  );
});

afterAll(async () => {
  await cleanup();
});

// ============================================================================
// GET /api/priority-stack/active
// ============================================================================
describe('GET /api/priority-stack/active', () => {
  test('returns 404 when no stacks have been initialized', async () => {
    const res = await request(app)
      .get('/api/priority-stack/active')
      .set('Authorization', `Bearer ${BARE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Initialize household first/i);
  });

  test('returns 200 with the active stack', async () => {
    const res = await request(app)
      .get('/api/priority-stack/active')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stack.id).toBe('active');
    expect(res.body.stack.version).toBe(1);
    expect(Array.isArray(res.body.stack.categories)).toBe(true);
  });
});

// ============================================================================
// GET /api/priority-stack/draft
// ============================================================================
describe('GET /api/priority-stack/draft', () => {
  test('returns 404 when no stacks have been initialized', async () => {
    const res = await request(app)
      .get('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${BARE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Initialize household first/i);
  });

  test('returns 200 with draft, approvalStatus, and isFullyApproved', async () => {
    const res = await request(app)
      .get('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stack.id).toBe('draft');
    expect(Array.isArray(res.body.stack.approvalStatus)).toBe(true);
    expect(res.body.stack.approvalStatus).toHaveLength(2); // owner + member
    expect(typeof res.body.stack.isFullyApproved).toBe('boolean');
    expect(res.body.stack.isFullyApproved).toBe(false); // nobody approved yet
  });
});

// ============================================================================
// GET /api/priority-stack/approvals
// ============================================================================
describe('GET /api/priority-stack/approvals', () => {
  test('returns 200 with per-member approval status including name and email', async () => {
    const res = await request(app)
      .get('/api/priority-stack/approvals')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.approvalCount).toBe('0/2');
    expect(res.body.allApproved).toBe(false);
    expect(res.body.approvalStatus).toHaveLength(2);

    const ownerEntry = res.body.approvalStatus.find((a) => a.userId === OWNER_UID);
    expect(ownerEntry.email).toBe('ps-owner@test.com');
    expect(ownerEntry.name).toBe('PS Owner');
    expect(ownerEntry.approved).toBe(false);
    expect(ownerEntry.approvedAt).toBeNull();
  });
});

// ============================================================================
// POST /api/priority-stack/draft — invalid action
// ============================================================================
describe('POST /api/priority-stack/draft — invalid action', () => {
  test('returns 400 for an unrecognized action', async () => {
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'delete' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/action must be one of/i);
  });
});

// ============================================================================
// POST /api/priority-stack/draft — action: add
// ============================================================================
describe('POST /api/priority-stack/draft — add', () => {
  beforeEach(async () => {
    await clearDraftCategories();
  });

  test('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'add', name: 'Rent', amount: 500, order: 1 }); // missing monthlyBudget
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/monthlyBudget/i);
  });

  test('returns 400 when category name exceeds 25 characters', async () => {
    const res = await addCategory({ name: 'A'.repeat(26), order: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1-25 characters/i);
  });

  test('returns 400 when amount is negative and allowNegativeBalances is false', async () => {
    const res = await addCategory({ amount: -50, order: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/>= 0/i);
  });

  test('returns 400 when color format is invalid', async () => {
    const res = await addCategory({ color: 'red', order: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/#RRGGBB/i);
  });

  test('returns 200 and the updated draft on success', async () => {
    const res = await addCategory({ name: 'Rent', amount: 1500, order: 1, monthlyBudget: 1500, color: '#FF6B6B' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('add');
    expect(res.body.stack.categories).toHaveLength(1);
    expect(res.body.stack.categories[0].name).toBe('Rent');
    expect(res.body.stack.categories[0].order).toBe(1);
    expect(res.body.stack.categories[0].color).toBe('#FF6B6B');
    expect(res.body.stack.approvedBy).toEqual([]); // approvals reset
    expect(res.body.message).toMatch(/approvals have been reset/i);
  });

  test('returns 400 when category name is a duplicate', async () => {
    await addCategory({ name: 'Groceries', order: 1 });
    const res = await addCategory({ name: 'Groceries', order: 2 }); // same name
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unique/i);
  });

  test('returns 400 when sort order is a duplicate', async () => {
    await addCategory({ name: 'CategoryA', order: 1 });
    const res = await addCategory({ name: 'CategoryB', order: 1 }); // same order
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unique/i);
  });
});

// ============================================================================
// POST /api/priority-stack/draft — action: edit
// ============================================================================
describe('POST /api/priority-stack/draft — edit', () => {
  beforeEach(async () => {
    await clearDraftCategories();
    await addCategory({ name: 'Editable Cat', amount: 200, order: 1, monthlyBudget: 200 });
  });

  test('returns 400 when categoryId is missing', async () => {
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'edit', amount: 300 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/categoryId is required/i);
  });

  test('returns 404 when category does not exist', async () => {
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'edit', categoryId: '00000000-0000-0000-0000-000000000000', amount: 300 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/category not found/i);
  });

  test('returns 200 with updated category on success', async () => {
    const cat = await getCategoryByName('Editable Cat');
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'edit', categoryId: cat.id, amount: 999, description: 'Updated!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const updated = res.body.stack.categories.find((c) => c.id === cat.id);
    expect(updated.amount).toBe(999);
    expect(updated.description).toBe('Updated!');
  });
});

// ============================================================================
// POST /api/priority-stack/draft — action: remove
// ============================================================================
describe('POST /api/priority-stack/draft — remove', () => {
  beforeEach(async () => {
    await clearDraftCategories();
    await addCategory({ name: 'Removable Cat', amount: 50, order: 1, monthlyBudget: 50 });
  });

  test('returns 404 when category does not exist', async () => {
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'remove', categoryId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/category not found/i);
  });

  test('soft-deletes (isArchived = true) and removes from response categories', async () => {
    const cat = await getCategoryByName('Removable Cat');
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'remove', categoryId: cat.id });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Archived categories are excluded from the response
    expect(res.body.stack.categories).toHaveLength(0);
    expect(res.body.stack.categoryCount).toBe(0);

    // Verify it's still in the DB with is_archived = true
    const { data } = await supabase
      .from('priority_stack_categories')
      .select('is_archived')
      .eq('id', cat.id)
      .single();
    expect(data.is_archived).toBe(true);
  });
});

// ============================================================================
// POST /api/priority-stack/draft — action: reorder
// ============================================================================
describe('POST /api/priority-stack/draft — reorder', () => {
  beforeEach(async () => {
    await clearDraftCategories();
    // Add 3 categories at orders 1, 2, 3
    await addCategory({ name: 'Cat A', amount: 100, order: 1, monthlyBudget: 100 });
    await addCategory({ name: 'Cat B', amount: 200, order: 2, monthlyBudget: 200 });
    await addCategory({ name: 'Cat C', amount: 300, order: 3, monthlyBudget: 300 });
  });

  test('returns 404 when category does not exist', async () => {
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'reorder', categoryId: '00000000-0000-0000-0000-000000000000', newOrder: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/category not found/i);
  });

  test('returns 400 when newOrder is less than 1', async () => {
    const cat = await getCategoryByName('Cat A');
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'reorder', categoryId: cat.id, newOrder: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/>= 1/i);
  });

  test('shifts other categories correctly when moving Cat C from order 3 to order 1', async () => {
    const catC = await getCategoryByName('Cat C');
    const res = await request(app)
      .post('/api/priority-stack/draft')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ action: 'reorder', categoryId: catC.id, newOrder: 1 });
    expect(res.status).toBe(200);

    const cats = res.body.stack.categories.sort((a, b) => a.order - b.order);
    expect(cats[0].name).toBe('Cat C');
    expect(cats[0].order).toBe(1);
    expect(cats[1].name).toBe('Cat A');
    expect(cats[1].order).toBe(2);
    expect(cats[2].name).toBe('Cat B');
    expect(cats[2].order).toBe(3);
  });
});

// ============================================================================
// Approval workflow
// ============================================================================
describe('Approval workflow', () => {
  beforeAll(async () => {
    // Start with a clean draft that has one category to make promotion meaningful
    await clearDraftCategories();
    await addCategory({ name: 'Approval Test Cat', amount: 500, order: 1, monthlyBudget: 500 });
  });

  afterAll(async () => {
    // Reset draft back to active state so POST /reset test starts cleanly
    await request(app)
      .post('/api/priority-stack/reset')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
  });

  test('records partial approval and returns approvalCount', async () => {
    const res = await request(app)
      .post('/api/priority-stack/approve')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.approved).toBe(true);
    expect(res.body.approvalCount).toBe('1/2');
    const ownerStatus = res.body.approvalStatus.find((a) => a.userId === OWNER_UID);
    expect(ownerStatus.approved).toBe(true);
  });

  test('returns 400 when user has already approved this version', async () => {
    const res = await request(app)
      .post('/api/priority-stack/approve')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already approved/i);
  });

  test('promotes draft to active when all members approve', async () => {
    const res = await request(app)
      .post('/api/priority-stack/approve')
      .set('Authorization', `Bearer ${MEMBER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/promoted to active/i);
    expect(res.body.stack.id).toBe('active');
    expect(res.body.stack.categories).toHaveLength(1);
    expect(res.body.stack.categories[0].name).toBe('Approval Test Cat');

    // Verify active stack in DB is updated
    const { data: active } = await supabase
      .from('priority_stacks')
      .select('version, promoted_by')
      .eq('id', activeStackId)
      .single();
    expect(active.promoted_by).toBe(MEMBER_UID);
    expect(active.version).toBeGreaterThan(1);

    // Verify draft approvals were cleared
    const { data: approvals } = await supabase
      .from('stack_approvals')
      .select('id')
      .eq('stack_id', draftStackId);
    expect(approvals).toHaveLength(0);
  });
});

// ============================================================================
// POST /api/priority-stack/reset
// ============================================================================
describe('POST /api/priority-stack/reset', () => {
  test('resets draft to match active and clears approvals', async () => {
    // Add something to draft so it differs from active
    await clearDraftCategories();
    await addCategory({ name: 'Draft Only Cat', amount: 99, order: 1, monthlyBudget: 99 });

    const res = await request(app)
      .post('/api/priority-stack/reset')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/draft reset to active/i);
    expect(res.body.stack.approvedBy).toEqual([]);

    // After reset, draft should have the same categories as active
    // Active has 'Approval Test Cat' from the promotion test
    const draftCatNames = res.body.stack.categories.map((c) => c.name);
    expect(draftCatNames).toContain('Approval Test Cat');
    expect(draftCatNames).not.toContain('Draft Only Cat');
  });
});
