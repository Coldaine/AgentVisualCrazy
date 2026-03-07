const tokens = new Map();
let tokenCounter = 0;

async function authenticate(username, password) {
  // Simulate async auth check
  await new Promise(r => setTimeout(r, 10));
  if (!username || !password) {
    throw new Error('Invalid credentials');
  }
  const token = `token_${++tokenCounter}_${Date.now()}`;
  tokens.set(token, { username, expiresAt: Date.now() + 3600000 });
  return token;
}

function verifyToken(token) {
  const session = tokens.get(token);
  if (!session) { throw new Error('Invalid token'); }
  if (session.expiresAt < Date.now()) { throw new Error('Token expired'); }
  return session.username;
}

// BUG: This function is async but callers don't always await it
async function refreshToken(oldToken) {
  const session = tokens.get(oldToken);
  if (!session) { return null; }
  // Simulate async token refresh
  await new Promise(r => setTimeout(r, 50));
  const newToken = `token_${++tokenCounter}_${Date.now()}`;
  tokens.set(newToken, { username: session.username, expiresAt: Date.now() + 3600000 });
  tokens.delete(oldToken);
  return newToken;
}

module.exports = { authenticate, verifyToken, refreshToken };
