const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../lib/supabase');
const router = express.Router();

// ---------------------------------------------------------------------------
// Middleware: verify Supabase Auth JWT
// ---------------------------------------------------------------------------
const verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ---------------------------------------------------------------------------
// Middleware: confirm caller belongs to a household
// ---------------------------------------------------------------------------
const requireHousehold = async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('household_id, household_role')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (!user.household_id) {
      return res.status(404).json({ success: false, error: 'User not in a household' });
    }
    req.householdId = user.household_id;
    req.userRole = user.household_role;
    next();
  } catch {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// Middleware: owner-only actions
// ---------------------------------------------------------------------------
const requireOwner = (req, res, next) => {
  if (req.userRole !== 'owner') {
    return res.status(403).json({ success: false, error: 'Only owner can perform this action' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Helper: unique 6-char join code
// ---------------------------------------------------------------------------
const generateJoinCode = async () => {
  let code;
  let taken = true;
  while (taken) {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data } = await supabase
      .from('households')
      .select('id')
      .eq('join_code', code)
      .maybeSingle();
    taken = !!data;
  }
  return code;
};

// ---------------------------------------------------------------------------
// Helper: household + member list for API responses
// ---------------------------------------------------------------------------
const getHouseholdWithMembers = async (householdId) => {
  const { data: hh, error: hErr } = await supabase
    .from('households')
    .select('id, name, created_at, created_by, allow_negative_balances, currency, spillover_mode, join_code, join_code_expires_at')
    .eq('id', householdId)
    .single();

  if (hErr || !hh) return null;

  const { data: members } = await supabase
    .from('users')
    .select('id, email, name, household_role')
    .eq('household_id', householdId);

  return {
    householdId: hh.id,
    name: hh.name,
    createdAt: hh.created_at,
    createdBy: hh.created_by,
    members: (members || []).map((m) => ({
      userId: m.id,
      email: m.email,
      name: m.name,
      role: m.household_role,
    })),
    settings: {
      allowNegativeBalances: hh.allow_negative_balances,
      currency: hh.currency,
      spilloverMode: hh.spillover_mode,
    },
  };
};

// ============================================================================
// 1. CREATE HOUSEHOLD
// ============================================================================
router.post('/create', verifyAuth, async (req, res) => {
  try {
    const { householdName } = req.body;
    const trimmed = householdName?.trim() ?? '';

    if (trimmed.length < 40 || trimmed.length > 75) {
      return res.status(400).json({ success: false, error: 'Household name must be 40-75 characters' });
    }

    // Check user isn't already in a household
    const { data: existing } = await supabase
      .from('users')
      .select('household_id')
      .eq('id', req.user.id)
      .maybeSingle();

    if (existing?.household_id) {
      return res.status(409).json({ success: false, error: 'User already in a household' });
    }

    const householdId = uuidv4();
    const joinCode = await generateJoinCode();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: hErr } = await supabase.from('households').insert({
      id: householdId,
      name: trimmed,
      created_by: req.user.id,
      join_code: joinCode,
      join_code_expires_at: expiresAt,
      allow_negative_balances: false,
      currency: 'USD',
      spillover_mode: 'waterfall',
    });
    if (hErr) throw hErr;

    // Upsert user row (created here on first API use)
    const { error: uErr } = await supabase.from('users').upsert(
      {
        id: req.user.id,
        email: (req.user.email || '').toLowerCase(),
        name: req.user.user_metadata?.name || '',
        household_id: householdId,
        household_role: 'owner',
      },
      { onConflict: 'id' }
    );
    if (uErr) throw uErr;

    // Initialize the priority stack for the new household
    const { initializePriorityStack } = require('./priority-stack');
    await initializePriorityStack(householdId);

    res.status(201).json({
      success: true,
      household: {
        householdId,
        name: trimmed,
        joinCode,
        joinCodeExpiresAt: expiresAt,
        members: [req.user.id],
        settings: { allowNegativeBalances: false, currency: 'USD' },
      },
      message: 'Household created. Share join code with others.',
    });
  } catch (error) {
    console.error('Create household error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// 2. JOIN HOUSEHOLD
// ============================================================================
router.post('/join', verifyAuth, async (req, res) => {
  try {
    const { joinCode } = req.body;
    if (!joinCode || joinCode.length !== 6) {
      return res.status(400).json({ success: false, error: 'Invalid join code format' });
    }

    // Check user isn't already in a household
    const { data: existing } = await supabase
      .from('users')
      .select('household_id')
      .eq('id', req.user.id)
      .maybeSingle();

    if (existing?.household_id) {
      return res.status(409).json({ success: false, error: 'User already in a household' });
    }

    // Find household by join code
    const { data: hh } = await supabase
      .from('households')
      .select('id, join_code_expires_at')
      .eq('join_code', joinCode.toUpperCase())
      .maybeSingle();

    if (!hh) return res.status(404).json({ success: false, error: 'Join code not found' });

    if (new Date(hh.join_code_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'Join code has expired' });
    }

    // Upsert user into the household
    const { error: uErr } = await supabase.from('users').upsert(
      {
        id: req.user.id,
        email: (req.user.email || '').toLowerCase(),
        name: req.user.user_metadata?.name || '',
        household_id: hh.id,
        household_role: 'member',
      },
      { onConflict: 'id' }
    );
    if (uErr) throw uErr;

    const household = await getHouseholdWithMembers(hh.id);
    res.status(200).json({ success: true, household, message: 'Successfully joined household.' });
  } catch (error) {
    console.error('Join household error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// 3. GET HOUSEHOLD DETAILS
// ============================================================================
router.get('/', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const household = await getHouseholdWithMembers(req.householdId);
    if (!household) return res.status(404).json({ success: false, error: 'Household not found' });
    res.status(200).json({ success: true, household });
  } catch (error) {
    console.error('Get household error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// 4. LIST MEMBERS
// ============================================================================
router.get('/members', verifyAuth, requireHousehold, async (req, res) => {
  try {
    const { data: members, error } = await supabase
      .from('users')
      .select('id, email, name, household_role')
      .eq('household_id', req.householdId);

    if (error) throw error;

    res.status(200).json({
      success: true,
      members: (members || []).map((m) => ({
        userId: m.id,
        email: m.email,
        name: m.name,
        role: m.household_role,
      })),
    });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// 5. REMOVE MEMBER
// ============================================================================
router.post('/members/remove', verifyAuth, requireHousehold, requireOwner, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    const { data: target } = await supabase
      .from('users')
      .select('household_id, household_role')
      .eq('id', userId)
      .maybeSingle();

    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (target.household_id !== req.householdId) {
      return res.status(404).json({ success: false, error: 'User not in this household' });
    }
    if (target.household_role === 'owner') {
      return res.status(400).json({ success: false, error: 'Cannot remove the owner' });
    }

    const { error } = await supabase
      .from('users')
      .update({ household_id: null, household_role: null })
      .eq('id', userId);
    if (error) throw error;

    res.status(200).json({ success: true, message: 'User removed from household.' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// 6. LEAVE HOUSEHOLD
// ============================================================================
router.post('/leave', verifyAuth, requireHousehold, async (req, res) => {
  try {
    if (req.userRole === 'owner') {
      return res.status(400).json({
        success: false,
        error: 'Owner cannot leave household. Transfer ownership or delete household first.',
      });
    }

    const { error } = await supabase
      .from('users')
      .update({ household_id: null, household_role: null })
      .eq('id', req.user.id);
    if (error) throw error;

    res.status(200).json({ success: true, message: 'Left household.' });
  } catch (error) {
    console.error('Leave household error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================================
// 7. UPDATE SETTINGS
// ============================================================================
router.post('/settings', verifyAuth, requireHousehold, requireOwner, async (req, res) => {
  try {
    const { allowNegativeBalances, currency } = req.body;
    const updates = {};

    if (allowNegativeBalances !== undefined) {
      if (typeof allowNegativeBalances !== 'boolean') {
        return res.status(400).json({ success: false, error: 'allowNegativeBalances must be a boolean' });
      }
      updates.allow_negative_balances = allowNegativeBalances;
    }

    if (currency !== undefined) {
      if (typeof currency !== 'string' || currency.length !== 3) {
        return res.status(400).json({ success: false, error: 'currency must be a 3-character ISO code (e.g., USD, EUR)' });
      }
      updates.currency = currency.toUpperCase();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid settings provided' });
    }

    const { data, error } = await supabase
      .from('households')
      .update(updates)
      .eq('id', req.householdId)
      .select('allow_negative_balances, currency, spillover_mode')
      .single();
    if (error) throw error;

    res.status(200).json({
      success: true,
      settings: {
        allowNegativeBalances: data.allow_negative_balances,
        currency: data.currency,
        spilloverMode: data.spillover_mode,
      },
      message: 'Settings updated.',
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
