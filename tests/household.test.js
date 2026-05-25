// Mock Firebase Admin — verifyIdToken resolves to a test user based on token string.
// Any unknown token throws, simulating an invalid Firebase JWT.
jest.mock('../lib/firebase', () => ({
  auth: () => ({
    verifyIdToken: jest.fn((token) => {
      const users = {
        'owner-token':  { uid: 'ws-hh-owner',  email: 'hh-owner@test.com',  name: 'Test Owner'  },
        'member-token': { uid: 'ws-hh-member', email: 'hh-member@test.com', name: 'Test Member' },
        'free-token':   { uid: 'ws-hh-free',   email: 'hh-free@test.com',   name: 'Free User'   },
      };
      if (users[token]) return Promise.resolve(users[token]);
      throw new Error('Firebase: invalid token');
    }),
  }),
}));

const request  = require('supertest');
const app      = require('../app');
const supabase = require('../lib/supabase');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const OWNER_UID  = 'ws-hh-owner';
const MEMBER_UID = 'ws-hh-member';
const FREE_UID   = 'ws-hh-free';

const OWNER_TOKEN  = 'owner-token';
const MEMBER_TOKEN = 'member-token';
const FREE_TOKEN   = 'free-token';

const HH_ID   = '00000000-0000-4000-8000-000000000001';
const HH_NAME = 'Test Household for White Stag Budget App'; // exactly 40 chars

// Households used only inside the POST /join describe block
const JOIN_HH_ID    = '00000000-0000-4000-8000-000000000003';
const EXPIRED_HH_ID = '00000000-0000-4000-8000-000000000004';
const VALID_CODE    = 'JOINOK';
const EXPIRED_CODE  = 'EXPIRY';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function unlinkTestUsers() {
  await supabase
    .from('users')
    .update({ household_id: null, household_role: null })
    .in('id', [OWNER_UID, MEMBER_UID, FREE_UID]);
}

async function cleanup() {
  // Unlink all users from test households first (handles stale rows from prior failed runs)
  await supabase.from('users').update({ household_id: null, household_role: null }).eq('household_id', HH_ID);
  await supabase.from('users').update({ household_id: null, household_role: null }).eq('household_id', JOIN_HH_ID);
  await supabase.from('users').update({ household_id: null, household_role: null }).eq('household_id', EXPIRED_HH_ID);
  // Also unlink by email and ID for extra safety
  await supabase
    .from('users')
    .update({ household_id: null, household_role: null })
    .in('email', ['hh-owner@test.com', 'hh-member@test.com', 'hh-free@test.com']);
  await unlinkTestUsers();
  // Delete known test households (cascades to priority_stacks, categories, approvals)
  await supabase.from('households').delete().in('id', [HH_ID, JOIN_HH_ID, EXPIRED_HH_ID]);
  // Clean up households by join code and by creator (stale from prior runs)
  await supabase.from('households').delete().in('join_code', ['HHTEST', 'JOINOK', 'EXPIRY']);
  await supabase.from('households').delete().in('created_by', [OWNER_UID, MEMBER_UID, FREE_UID]);
  // Delete test users by ID and by email
  await supabase.from('users').delete().in('id', [OWNER_UID, MEMBER_UID, FREE_UID]);
  await supabase.from('users').delete().in('email', ['hh-owner@test.com', 'hh-member@test.com', 'hh-free@test.com']);
}

// ---------------------------------------------------------------------------
// Global setup/teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  await cleanup(); // start from a known-clean state

  await supabase.from('households').insert({
    id: HH_ID,
    name: HH_NAME,
    created_by: OWNER_UID,
    join_code: 'HHTEST',
    join_code_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    allow_negative_balances: false,
    currency: 'USD',
    spillover_mode: 'waterfall',
  });

  await supabase.from('users').insert([
    { id: OWNER_UID,  email: 'hh-owner@test.com',  name: 'Test Owner',  household_id: HH_ID, household_role: 'owner'  },
    { id: MEMBER_UID, email: 'hh-member@test.com', name: 'Test Member', household_id: HH_ID, household_role: 'member' },
    { id: FREE_UID,   email: 'hh-free@test.com',   name: 'Free User',   household_id: null,  household_role: null     },
  ]);
});

afterAll(async () => {
  await cleanup();
});

// ============================================================================
// Auth middleware
// ============================================================================
describe('Auth middleware', () => {
  test('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/household');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/household')
      .set('Authorization', 'Bearer this-is-not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Invalid token');
  });
});

// ============================================================================
// POST /api/household/create
// ============================================================================
describe('POST /api/household/create', () => {
  afterEach(async () => {
    // Unlink free user in case a household was created, then delete it
    await supabase.from('users').update({ household_id: null, household_role: null }).eq('id', FREE_UID);
    await supabase.from('households').delete().eq('created_by', FREE_UID);
  });

  test('returns 400 when household name is too short (< 40 chars)', async () => {
    const res = await request(app)
      .post('/api/household/create')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ householdName: 'Too Short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/40/);
  });

  test('returns 400 when household name is too long (> 75 chars)', async () => {
    const res = await request(app)
      .post('/api/household/create')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ householdName: 'A'.repeat(76) });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/75/);
  });

  test('returns 409 when user is already in a household', async () => {
    const res = await request(app)
      .post('/api/household/create')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ householdName: HH_NAME });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already in a household/i);
  });

  test('returns 201 and household details on success', async () => {
    const res = await request(app)
      .post('/api/household/create')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ householdName: 'A Brand New Household Created by Free Test User!!' }); // 49 chars
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.household.householdId).toBeDefined();
    expect(res.body.household.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.body.household.joinCodeExpiresAt).toBeDefined();
    expect(res.body.message).toMatch(/join code/i);
  });
});

// ============================================================================
// POST /api/household/join
// ============================================================================
describe('POST /api/household/join', () => {
  beforeAll(async () => {
    await supabase.from('households').insert([
      {
        id: JOIN_HH_ID,
        name: 'Household for Testing Join Code Flows Only', // 42 chars
        created_by: OWNER_UID,
        join_code: VALID_CODE,
        join_code_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        allow_negative_balances: false,
        currency: 'USD',
        spillover_mode: 'waterfall',
      },
      {
        id: EXPIRED_HH_ID,
        name: 'Household for Testing Expired Join Code Test', // 44 chars
        created_by: OWNER_UID,
        join_code: EXPIRED_CODE,
        join_code_expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        allow_negative_balances: false,
        currency: 'USD',
        spillover_mode: 'waterfall',
      },
    ]);
  });

  afterAll(async () => {
    await supabase.from('users').update({ household_id: null, household_role: null }).eq('id', FREE_UID);
    await supabase.from('households').delete().in('id', [JOIN_HH_ID, EXPIRED_HH_ID]);
  });

  afterEach(async () => {
    // Reset free user after each join attempt
    await supabase.from('users').update({ household_id: null, household_role: null }).eq('id', FREE_UID);
  });

  test('returns 400 when join code format is invalid', async () => {
    const res = await request(app)
      .post('/api/household/join')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ joinCode: 'AB' }); // too short
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 404 when join code does not exist', async () => {
    const res = await request(app)
      .post('/api/household/join')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ joinCode: 'XXXXXX' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 410 when join code has expired', async () => {
    const res = await request(app)
      .post('/api/household/join')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ joinCode: EXPIRED_CODE });
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/expired/i);
  });

  test('returns 409 when user is already in a household', async () => {
    const res = await request(app)
      .post('/api/household/join')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ joinCode: VALID_CODE });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already in a household/i);
  });

  test('returns 200 and household details on success', async () => {
    const res = await request(app)
      .post('/api/household/join')
      .set('Authorization', `Bearer ${FREE_TOKEN}`)
      .send({ joinCode: VALID_CODE });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.household.householdId).toBe(JOIN_HH_ID);
    expect(res.body.message).toMatch(/joined/i);
  });
});

// ============================================================================
// GET /api/household
// ============================================================================
describe('GET /api/household', () => {
  test('returns 404 when user is not in a household', async () => {
    const res = await request(app)
      .get('/api/household')
      .set('Authorization', `Bearer ${FREE_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not in a household/i);
  });

  test('returns 200 with household and full member list', async () => {
    const res = await request(app)
      .get('/api/household')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.household.householdId).toBe(HH_ID);
    expect(res.body.household.name).toBe(HH_NAME);
    expect(res.body.household.members).toHaveLength(2);
    const ownerMember = res.body.household.members.find((m) => m.userId === OWNER_UID);
    expect(ownerMember.role).toBe('owner');
    expect(res.body.household.settings.currency).toBe('USD');
  });
});

// ============================================================================
// GET /api/household/members
// ============================================================================
describe('GET /api/household/members', () => {
  test('returns 200 with all household members', async () => {
    const res = await request(app)
      .get('/api/household/members')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(2);
    const ids = res.body.members.map((m) => m.userId);
    expect(ids).toContain(OWNER_UID);
    expect(ids).toContain(MEMBER_UID);
  });
});

// ============================================================================
// POST /api/household/settings
// ============================================================================
describe('POST /api/household/settings', () => {
  test('returns 403 when caller is not the owner', async () => {
    const res = await request(app)
      .post('/api/household/settings')
      .set('Authorization', `Bearer ${MEMBER_TOKEN}`)
      .send({ currency: 'EUR' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when currency code is invalid', async () => {
    const res = await request(app)
      .post('/api/household/settings')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ currency: 'EURO' }); // 4 chars, not 3
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/3-character/i);
  });

  test('returns 400 when no valid settings are provided', async () => {
    const res = await request(app)
      .post('/api/household/settings')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/no valid settings/i);
  });

  test('returns 200 and updated settings on success', async () => {
    const res = await request(app)
      .post('/api/household/settings')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ currency: 'EUR', allowNegativeBalances: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.settings.currency).toBe('EUR');
    expect(res.body.settings.allowNegativeBalances).toBe(true);

    // Restore original settings for other tests
    await supabase
      .from('households')
      .update({ currency: 'USD', allow_negative_balances: false })
      .eq('id', HH_ID);
  });
});

// ============================================================================
// POST /api/household/leave
// ============================================================================
describe('POST /api/household/leave', () => {
  test('returns 400 when the owner tries to leave', async () => {
    const res = await request(app)
      .post('/api/household/leave')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/owner cannot leave/i);
  });

  test('returns 200 when a member successfully leaves', async () => {
    const res = await request(app)
      .post('/api/household/leave')
      .set('Authorization', `Bearer ${MEMBER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/left/i);

    // Re-add member for subsequent tests
    await supabase
      .from('users')
      .update({ household_id: HH_ID, household_role: 'member' })
      .eq('id', MEMBER_UID);
  });
});

// ============================================================================
// POST /api/household/members/remove
// ============================================================================
describe('POST /api/household/members/remove', () => {
  test('returns 403 when caller is not the owner', async () => {
    const res = await request(app)
      .post('/api/household/members/remove')
      .set('Authorization', `Bearer ${MEMBER_TOKEN}`)
      .send({ userId: OWNER_UID });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when trying to remove the owner', async () => {
    const res = await request(app)
      .post('/api/household/members/remove')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ userId: OWNER_UID });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/cannot remove the owner/i);
  });

  test('returns 404 when target user is not in the household', async () => {
    const res = await request(app)
      .post('/api/household/members/remove')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ userId: FREE_UID }); // free user has no household
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 200 when owner removes a member', async () => {
    const res = await request(app)
      .post('/api/household/members/remove')
      .set('Authorization', `Bearer ${OWNER_TOKEN}`)
      .send({ userId: MEMBER_UID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/removed/i);

    // Re-add member for subsequent tests
    await supabase
      .from('users')
      .update({ household_id: HH_ID, household_role: 'member' })
      .eq('id', MEMBER_UID);
  });
});
