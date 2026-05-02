import assert from 'assert';
import { repository } from '../src/repository.js';

const playedAt = new Date().toISOString();
const payload = [{ spotifyTrackId: 'dedupe_track', trackName: 'Dedupe', artistNames: ['Tester'], playedAt, msPlayed: 1000, genre: 'Test', hour: 10 }];

const first = repository.ingestEvents('u1', payload);
const second = repository.ingestEvents('u1', payload);

assert.equal(first.inserted, 1);
assert.equal(second.inserted, 0);
console.log('repository dedupe test passed');
