const admin = require('firebase-admin');

console.log('CODE_VERSION: v4-native-pkcs8');

if (!admin.apps.length) {
  // Parse the full service account JSON from env
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // Fix escaped newlines if present
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  console.log('Initializing Firebase with project:', serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
