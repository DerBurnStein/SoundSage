import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/index.js';

process.env.TEST_BYPASS_AUTH = '1';
const app = createApp();

test('auth required path works with test bypass and returns typed error for bad payload', async () => {
  const res = await request(app).post('/api/sync/ingest').send({ events: [] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('history endpoint supports pagination cursor contract', async () => {
  const first = await request(app).get('/api/history/recent?limit=2');
  assert.equal(first.status, 200);
  assert.equal(first.body.events.length <= 2, true);
  if (first.body.nextCursor) {
    const second = await request(app).get(`/api/history/recent?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    assert.equal(second.status, 200);
  }
});

test('missing oauth callback params returns typed error', async () => {
  const res = await request(app).get('/api/spotify/connect/callback');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'MISSING_CODE_OR_STATE');
});
