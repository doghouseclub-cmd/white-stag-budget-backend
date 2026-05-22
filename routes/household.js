// household-routes.js
// Household API endpoints for White Stag Budget

const express = require('express');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Firebase references
const db = admin.firestore();

// Middleware: Verify Firebase Auth token
const verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Middleware: Check user is in a household
const requireHousehold = async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const userData = userDoc.data();
    if (!userData.householdId) {
      return res.status(404).json({ success: false, error: 'User not in a household' });
    }
    req.householdId = userData.householdId;
    req.userRole = userData.role;
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Middleware: Check user is owner
const requireOwner = async (req, res, next) => {
  if (req.userRole !== 'owner') {
    return res.status(403).json({ success: false, error: 'Only owner can perform this action' });
  }
  next();
};

// Utility: Generate unique 6-char join code
const generateJoinCode = async () => {
  let code;
  let exists = true;
  while (exists) {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const snapshot = await db.collection('households').where('joinCode', '==', code).get();
    exists = !snapshot.empty;
  }
  return code;
};

// Utility: Validate household name length
const validateHouseholdName = (name) => {
  return name && name.trim().length >= 40 && name.trim().length <= 75;
};

// Utility: Get household with member details
const getHouseholdWithMembers = async (householdId) => {
  const householdDoc = await db.collection('households').doc(householdId).get();
  if (!householdDoc.exists) {
    return null;
  }
  const householdData = householdDoc.data();
  const members = [];
  for (const userId of householdData.members || []) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      members.push({
        userId: userId,
        email: userData.email,
        name: userData.name,
        role: userData.role,
      });
    }
  }
  return {
    householdId: householdId,
    name: householdData.name,
    createdAt: householdData.createdAt,
    createdBy: householdData.createdBy,
    members: members,
    settings: householdData.settings || {},
  };
};

// ============================================================================
// 1. CREATE HOUSEHOLD
// ============================================================================
router.post('/create', verifyAuth, async (req, res) => {
  try {
    const { householdName } = req.body;

    // Validate input
    if (!validateHouseholdName(householdName)) {
      return res.status(400).json({
        success: false,
        error: 'Household name must be 40-75 characters',
      });
    }

    // Check if user already in a household
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists && userDoc.data().householdId) {
      return res.status(409).json({
        success: false,
        error: 'User already in a household',
      });
    }

    // Generate household ID and join code
    const householdId = uuidv4();
    const joinCode = await generateJoinCode();
    const now = admin.firestore.Timestamp.now();
    const expiresAt = new admin.firestore.Timestamp(now.seconds + 172800, now.nanoseconds); // +2 days

    // Create household document
    await db.collection('households').doc(householdId).set({
      id: householdId,
      name: householdName.trim(),
      createdAt: now,
      createdBy: req.user.uid,
      members: [req.user.uid],
      joinCode: joinCode,
      joinCodeExpiresAt: expiresAt,
      settings: {
        allowNegativeBalances: false,
        currency: 'USD',
      },
    });

    // Update user document
    await db.collection('users').doc(req.user.uid).set(
      {
        householdId: householdId,
        role: 'owner',
      },
      { merge: true }
    );

    res.status(201).json({
      success: true,
      household: {
        householdId: householdId,
        name: householdName.trim(),
        joinCode: joinCode,
        joinCodeExpiresAt: expiresAt,
        members: [req.user.uid],
        settings: {
          allowNegativeBalances: false,
          currency: 'USD',
        },
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
      return res.status(400).json({
        success: false,
        error: 'Invalid join code format',
      });
    }

    // Check if user already in a household
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists && userDoc.data().householdId) {
      return res.status(409).json({
        success: false,
        error: 'User already in a household',
      });
    }

    // Find household by join code
    const snapshot = await db
      .collection('households')
      .where('joinCode', '==', joinCode.toUpperCase())
      .get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'Join code not found',
      });
    }

    const householdDoc = snapshot.docs[0];
    const householdData = householdDoc.data();
    const householdId = householdDoc.id;

    // Check if join code expired
    const now = admin.firestore.Timestamp.now();
    if (householdData.joinCodeExpiresAt.toMillis() < now.toMillis()) {
      return res.status(410).json({
        success: false,
        error: 'Join code has expired',
      });
    }

    // Add user to household
    await db.collection('households').doc(householdId).update({
      members: admin.firestore.FieldValue.arrayUnion(req.user.uid),
    });

    // Update user document
    await db.collection('users').doc(req.user.uid).set(
      {
        householdId: householdId,
        role: 'member',
      },
      { merge: true }
    );

    // Return household with members
    const household = await getHouseholdWithMembers(householdId);

    res.status(200).json({
      success: true,
      household: household,
      message: 'Successfully joined household.',
    });
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
    if (!household) {
      return res.status(404).json({
        success: false,
        error: 'Household not found',
      });
    }
    res.status(200).json({
      success: true,
      household: household,
    });
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
    const householdDoc = await db.collection('households').doc(req.householdId).get();
    if (!householdDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Household not found',
      });
    }

    const householdData = householdDoc.data();
    const members = [];
    for (const userId of householdData.members || []) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        members.push({
          userId: userId,
          email: userData.email,
          name: userData.name,
          role: userData.role,
        });
      }
    }

    res.status(200).json({
      success: true,
      members: members,
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

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    // Check if trying to remove owner
    const targetUserDoc = await db.collection('users').doc(userId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const targetUserData = targetUserDoc.data();
    if (targetUserData.role === 'owner') {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove the owner',
      });
    }

    if (targetUserData.householdId !== req.householdId) {
      return res.status(404).json({
        success: false,
        error: 'User not in this household',
      });
    }

    // Remove user from household
    await db.collection('households').doc(req.householdId).update({
      members: admin.firestore.FieldValue.arrayRemove(userId),
    });

    // Clear user's household
    await db.collection('users').doc(userId).update({
      householdId: admin.firestore.FieldValue.delete(),
      role: admin.firestore.FieldValue.delete(),
    });

    res.status(200).json({
      success: true,
      message: 'User removed from household.',
    });
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
    // Check if user is owner
    if (req.userRole === 'owner') {
      return res.status(400).json({
        success: false,
        error: 'Owner cannot leave household. Transfer ownership or delete household first.',
      });
    }

    // Remove user from household
    await db.collection('households').doc(req.householdId).update({
      members: admin.firestore.FieldValue.arrayRemove(req.user.uid),
    });

    // Clear user's household
    await db.collection('users').doc(req.user.uid).update({
      householdId: admin.firestore.FieldValue.delete(),
      role: admin.firestore.FieldValue.delete(),
    });

    res.status(200).json({
      success: true,
      message: 'Left household.',
    });
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

    // Validate inputs
    const updates = {};
    if (allowNegativeBalances !== undefined) {
      if (typeof allowNegativeBalances !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'allowNegativeBalances must be a boolean',
        });
      }
      updates['settings.allowNegativeBalances'] = allowNegativeBalances;
    }
    if (currency !== undefined) {
      if (typeof currency !== 'string' || currency.length !== 3) {
        return res.status(400).json({
          success: false,
          error: 'currency must be a 3-character ISO code (e.g., USD, EUR)',
        });
      }
      updates['settings.currency'] = currency.toUpperCase();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid settings provided',
      });
    }

    // Update household
    await db.collection('households').doc(req.householdId).update(updates);

    // Fetch updated household
    const householdDoc = await db.collection('households').doc(req.householdId).get();
    const settings = householdDoc.data().settings;

    res.status(200).json({
      success: true,
      settings: settings,
      message: 'Settings updated.',
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
