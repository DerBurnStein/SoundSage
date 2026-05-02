import test from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '../src/repository.js';

const hasDb = Boolean(process.env.DATABASE_URL);

test('db dedupe uniqueness + cursor update', { skip: !hasDb }, async () => {
  const user = await repository.findOrCreateUserByGoogleSub(`db-sub-${Date.now()}`, { displayName: 'DB Test' });
  const playedAt = new Date().toISOString();
  const payload = [{ spotifyTrackId: 'db_track_1', trackName: 'DB Track', artistNames: ['DB Artist'], playedAt, msPlayed: 200000, genre: 'Indie' }];
  const first = await repository.ingestEvents(user.id, payload);
  const second = await repository.ingestEvents(user.id, payload);
  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);

  const now = new Date().toISOString();
  await repository.updateSync(user.id, now);
  const account = await repository.getAccount(user.id);
  assert.ok(account.cursor);
});
