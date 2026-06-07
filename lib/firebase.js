const admin = require('firebase-admin');

console.log('CODE_VERSION: v4-native-pkcs8');

if (!admin.apps.length) {
  // Parse the full service account JSON from env
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // Fix escaped newlines if present
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  // TEMP DEBUG - remove after fix
  const key = serviceAccount.private_key;
  console.log('Key header:', key.substring(0, 27));
  console.log('Has real newlines:', key.includes('\n'));
  console.log('Has escaped newlines:', key.includes('\\n'));
  console.log('Char code at pos 27:', key.charCodeAt(27)); // should be 10 (\n) not 92 (\)

  console.log('Initializing Firebase with project:', serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
