= require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Initialize Firebase Admin (Vercel will inject credentials via environment)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Generate a random 6-character join code
function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function createHousehold(req, res) {
  try {
    const { userId, email, name, householdName } = req.body;

    // Validate input
    if (!userId || !email || !name || !householdName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create household document
    const householdId = uuidv4();
    const joinCode = generateJoinCode();

    await db.collection('households').doc(householdId).set({
      name: householdName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      members: [userId],
      joinCode: joinCode,
      settings: {
        spilloverMode: 'waterfall',
      },
    });

    // Create user document with householdId pointer
    await db.collection('users').doc(userId).set({
      email: email,
      name: name,
      householdId: householdId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      role: 'owner', // User A is the owner
    });

    // Return household ID and join code
    res.status(201).json({
      success: true,
      householdId: householdId,
      joinCode: joinCode,
      message: 'Household created successfully',
    });
  } catch (error) {
    console.error('Error creating household:', error);
    res.status(500).json({ error: 'Failed to create household' });
  }
}

module.exports = { createHousehold };
