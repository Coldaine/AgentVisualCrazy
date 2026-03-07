const express = require('express');
const { authenticate, refreshToken } = require('./auth');

const app = express();
app.use(express.json());

app.post('/login', async (req, res) => {
  try {
    const token = await authenticate(req.body.username, req.body.password);
    res.json({ token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/protected', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) { return res.status(401).json({ error: 'No token' }); }
  const token = authHeader.replace('Bearer ', '');
  try {
    const user = verifyToken(token);
    res.json({ user });
  } catch (err) {
    // BUG: When token is expired, we try to refresh but don't await it
    // This causes intermittent 401 errors because the refresh hasn't completed
    const newToken = refreshToken(token);  // missing await
    if (newToken) {
      res.json({ user: 'refreshed', token: newToken });
    } else {
      res.status(401).json({ error: 'Token expired' });
    }
  }
});

module.exports = app;
