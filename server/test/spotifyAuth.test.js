import assert from 'assert';
import { validateScopes, REQUIRED_SCOPES } from '../src/spotifyAuth.js';

const full = validateScopes(REQUIRED_SCOPES.join(' '));
assert.equal(full.valid, true);
assert.equal(full.missing.length, 0);

const partial = validateScopes('user-read-email');
assert.equal(partial.valid, false);
assert.ok(partial.missing.length > 0);

console.log('spotify scope validation test passed');
