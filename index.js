const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import functions
const { createHousehold } = require('./functions/createHousehold');
const { joinHousehold } = require('./functions/joinHousehold');

// Routes
app.post('/api/household/create', createHousehold);
app.post('/api/household/join', joinHousehold);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for Vercel
module.exports = app;

// Local development
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
