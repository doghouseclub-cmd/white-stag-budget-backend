// index.js - Entry point for Vercel serverless functions

const app = require('./app');

// For Vercel: Export the app directly
module.exports = app;

// For local development: Run the app
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`White Stag Budget API running on port ${PORT}`);
  });
}
