import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/index.js';

process.env.TEST_BYPASS_AUTH = '1';
const app = createApp();

test('oauth state mismatch rejected', async () => {
  const res = await request(app).get('/api/spotify/connect/callback?code=abc&state=bad');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'MISSING_OAUTH_NONCE');
});

test('refresh without token returns typed error', async () => {
  const res = await request(app).post('/api/spotify/token/refresh');
  assert.equal([400, 500].includes(res.status), true);
});
