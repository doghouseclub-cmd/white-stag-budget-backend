// app.js (or server.js) - Integration example
// How to integrate household routes into your Express app

const express = require(‘express’);
const admin = require(‘firebase-admin’);
const cors = require(‘cors’);

// Initialize Firebase Admin SDK
admin.initializeApp({
credential: admin.credential.cert(process.env.FIREBASE_SERVICE_ACCOUNT),
projectId: process.env.FIREBASE_PROJECT_ID,
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const householdRoutes = require(’./household-routes’);

// API routes
app.use(’/api/household’, householdRoutes);

// Health check
app.get(’/api/health’, (req, res) => {
res.json({ status: ‘ok’ });
});

// Error handling middleware
app.use((err, req, res, next) => {
console.error(‘Error:’, err);
res.status(err.status || 500).json({
success: false,
error: err.message || ‘Internal server error’,
});
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
console.log(`White Stag Budget API running on port ${PORT}`);
});

// ============================================================================
// ENVIRONMENT VARIABLES REQUIRED
// ============================================================================
// .env file should contain:
// FIREBASE_PROJECT_ID=your-firebase-project-id
// FIREBASE_SERVICE_ACCOUNT={full JSON credential object}
// PORT=3001 (or 8080 for Vercel)

// ============================================================================
// DEPLOYMENT TO VERCEL
// ============================================================================
// For Vercel serverless functions, use this structure instead:
//
// api/
//   └── household.js (or household/index.js)
//
// Each file exports a handler function:
// module.exports = async (req, res) => { … }
//
// This is handled by Vercel’s automatic routing.

// ============================================================================
// TESTING WITH CURL
// ============================================================================

// 1. CREATE HOUSEHOLD
// curl -X POST <http://localhost:3001/api/household/create>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”   
//   -H “Content-Type: application/json”   
//   -d ‘{“householdName”: “Smith Household”}’

// 2. JOIN HOUSEHOLD
// curl -X POST <http://localhost:3001/api/household/join>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”   
//   -H “Content-Type: application/json”   
//   -d ‘{“joinCode”: “ABC123”}’

// 3. GET HOUSEHOLD
// curl -X GET <http://localhost:3001/api/household>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”

// 4. LIST MEMBERS
// curl -X GET <http://localhost:3001/api/household/members>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”

// 5. UPDATE SETTINGS
// curl -X POST <http://localhost:3001/api/household/settings>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”   
//   -H “Content-Type: application/json”   
//   -d ‘{“allowNegativeBalances”: true, “currency”: “EUR”}’

// 6. REMOVE MEMBER
// curl -X POST <http://localhost:3001/api/household/members/remove>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”   
//   -H “Content-Type: application/json”   
//   -d ‘{“userId”: “target-user-id”}’

// 7. LEAVE HOUSEHOLD
// curl -X POST <http://localhost:3001/api/household/leave>   
//   -H “Authorization: Bearer YOUR_FIREBASE_TOKEN”

// ============================================================================
// HOW TO GET A FIREBASE TOKEN FOR TESTING
// ============================================================================

// In a Node.js script or Firebase Cloud Functions:
// const admin = require(‘firebase-admin’);
// admin.initializeApp();
//
// const token = await admin.auth().createCustomToken(‘user-id’);
// console.log(‘Token:’, token);
//
// Then use this token in your curl requests.

// ============================================================================
// PACKAGE.JSON DEPENDENCIES
// ============================================================================
/*
{
“dependencies”: {
“express”: “^4.18.2”,
“firebase-admin”: “^12.0.0”,
“cors”: “^2.8.5”,
“uuid”: “^9.0.0”,
“dotenv”: “^16.0.3”
},
“devDependencies”: {
“nodemon”: “^2.0.20”
}
}
*/

module.exports = app;