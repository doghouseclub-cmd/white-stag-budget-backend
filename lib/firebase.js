const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Fix private key: handle literal \n, remove wrapping quotes, handle double escapes
  const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';

  // DEBUG: Log raw key details (remove after fixing)
  console.log('=== FIREBASE KEY DEBUG ===');
  console.log('Raw key length:', rawKey.length);
  console.log('Raw key first 50 chars:', rawKey.substring(0, 50));
  console.log('Raw key last 50 chars:', rawKey.slice(-50));
  console.log('Contains \\n:', rawKey.includes('\\n'));
  console.log('Contains actual newlines:', rawKey.includes('\n'));
  console.log('Starts with quote:', /^["\']/.test(rawKey));
  console.log('Ends with quote:', /["\']$/.test(rawKey));
  console.log('===========================');

  const privateKey = rawKey
    .replace(/^["']|["']$/g, '') // Remove wrapping quotes
    .replace(/\\n/g, '\n') // Replace literal \n with actual newlines
    .replace(/\\/g, ''); // Remove any remaining stray backslashes

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

module.exports = admin;
