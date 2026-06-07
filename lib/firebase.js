const admin = require('firebase-admin');
const crypto = require('node:crypto');

console.log('CODE_VERSION: v3-native-crypto-v2'); // Force rebuild

if (!admin.apps.length) {
  // Parse the full service account JSON from env
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // Convert PKCS#8 to PKCS#1 format if needed (Firebase Admin requires PKCS#1)
  const needsConversion = serviceAccount.private_key?.includes('-----BEGIN PRIVATE KEY-----');
  console.log('PKCS#8 key detected:', needsConversion);
  
  if (needsConversion) {
    // Use native Node.js crypto to convert key format
    const keyObj = crypto.createPrivateKey(serviceAccount.private_key);
    serviceAccount.private_key = keyObj.export({ format: 'pem', type: 'pkcs1' });
    
    // Log detailed key info
    const lines = serviceAccount.private_key?.split('\n') || [];
    console.log('=== CONVERTED KEY DETAILS ===');
    console.log('Header:', lines[0]);
    console.log('Footer:', lines[lines.length - 2]);
    console.log('Line count:', lines.length);
    console.log('Contains RSA header:', serviceAccount.private_key?.includes('-----BEGIN RSA PRIVATE KEY-----'));
    console.log('Key length:', serviceAccount.private_key?.length);
    console.log('=============================');
  }

  console.log('Initializing Firebase with project:', serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
