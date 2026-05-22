= require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function joinHousehold(req, res) {
  try {
    const { userId, email, name, joinCode } = req.body;

    // Validate input
    if (!userId || !email || !name || !joinCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find household by join code
    const householdSnapshot = await db
      .collection('households')
      .where('joinCode', '==', joinCode)
      .limit(1)
      .get();

    if (householdSnapshot.empty) {
      return res.status(404).json({ error: 'Invalid join code' });
    }

    const householdDoc = householdSnapshot.docs[0];
    const householdId = householdDoc.id;
    const householdData = householdDoc.data();

    // Check if user already in household
    if (householdData.members.includes(userId)) {
      return res.status(400).json({ error: 'User already in household' });
    }

    // Add user to household members array
    await db.collection('households').doc(householdId).update({
      members: admin.firestore.FieldValue.arrayUnion(userId),
    });

    // Create user document with householdId pointer
    await db.collection('users').doc(userId).set({
      email: email,
      name: name,
      householdId: householdId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      role: 'member', // User B is a regular member
    });

    res.status(200).json({
      success: true,
      householdId: householdId,
      householdName: householdData.name,
      message: 'Successfully joined household',
    });
  } catch (error) {
    console.error('Error joining household:', error);
    res.status(500).json({ error: 'Failed to join household' });
  }
}

module.exports = { joinHousehold };
