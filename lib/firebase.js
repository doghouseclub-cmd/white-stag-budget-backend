const admin = require('firebase-admin');

if (!admin.apps.length) {
  // Parse the full service account JSON from env
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (parseErr) {
    console.log('JSON PARSE ERROR:', parseErr.message);
    console.log('Env var first 100 chars:', process.env.FIREBASE_SERVICE_ACCOUNT?.substring(0, 100));
    throw parseErr;
  }

  // DEBUG: Log what we got
  console.log('=== SERVICE ACCOUNT DEBUG ===');
  console.log('Type:', typeof serviceAccount);
  console.log('Keys:', Object.keys(serviceAccount));
  console.log('project_id:', serviceAccount.project_id);
  console.log('client_email:', serviceAccount.client_email);
  console.log('private_key first 60 chars:', serviceAccount.private_key?.substring(0, 60));
  console.log('private_key header:', serviceAccount.private_key?.split('\n')[0]);
  console.log('===========================');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
