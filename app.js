const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const householdRoutes = require('./routes/household');
const priorityStackRoutes = require('./routes/priority-stack');

app.use('/api/household', householdRoutes);
app.use('/api/priority-stack', priorityStackRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

module.exports = app;
