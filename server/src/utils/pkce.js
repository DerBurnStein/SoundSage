const crypto = require('node:crypto');

function base64url(input) {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateState() {
  return base64url(crypto.randomBytes(16));
}

function generatePkcePair() {
  const codeVerifier = base64url(crypto.randomBytes(64));
  const challenge = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64url(challenge);
  return { codeVerifier, codeChallenge };
}

module.exports = { generateState, generatePkcePair };
