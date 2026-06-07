const admin = require('firebase-admin');
const forge = require('node-forge');

console.log('CODE_VERSION: v2-node-forge');

if (!admin.apps.length) {
  // Parse the full service account JSON from env
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // Convert PKCS#8 to PKCS#1 format if needed (Firebase Admin requires PKCS#1)
  const needsConversion = serviceAccount.private_key?.includes('-----BEGIN PRIVATE KEY-----');
  console.log('PKCS#8 key detected:', needsConversion);
  
  if (needsConversion) {
    const privateKeyObj = forge.pki.privateKeyFromPem(serviceAccount.private_key);
    serviceAccount.private_key = forge.pki.privateKeyToPem(privateKeyObj);
    console.log('Converted to PKCS#1:', serviceAccount.private_key?.split('\n')[0]);
  }

  console.log('Initializing Firebase with project:', serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
