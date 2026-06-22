const admin = require('firebase-admin');

if (!admin.apps.length) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  console.log('FIREBASE_DEBUG: b64 length:', b64 ? b64.length : 'undefined');
  console.log('FIREBASE_DEBUG: b64 first 20 chars:', b64 ? b64.substring(0, 20) : 'N/A');

  const raw = Buffer.from(b64, 'base64').toString('utf8');
  console.log('FIREBASE_DEBUG: raw length:', raw.length);
  console.log('FIREBASE_DEBUG: raw first 50 chars:', raw.substring(0, 50));

  const serviceAccount = JSON.parse(raw);
  console.log('FIREBASE_DEBUG: project_id:', serviceAccount.project_id);
  console.log('FIREBASE_DEBUG: client_email:', serviceAccount.client_email);

  if (serviceAccount.private_key) {
    const pk = serviceAccount.private_key;
    console.log('FIREBASE_DEBUG: key length:', pk.length);
    console.log('FIREBASE_DEBUG: key starts with:', pk.substring(0, 31));
    console.log('FIREBASE_DEBUG: has real newlines:', pk.includes('\n'));
    console.log('FIREBASE_DEBUG: has backslash-n:', pk.includes('\\n'));
    console.log('FIREBASE_DEBUG: char at 27:', pk.charCodeAt(27));

    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

    const pk2 = serviceAccount.private_key;
    console.log('FIREBASE_DEBUG: after replace - key length:', pk2.length);
    console.log('FIREBASE_DEBUG: after replace - has real newlines:', pk2.includes('\n'));
    console.log('FIREBASE_DEBUG: after replace - has backslash-n:', pk2.includes('\\n'));
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('FIREBASE_DEBUG: Firebase initialized successfully');
}

module.exports = admin;
