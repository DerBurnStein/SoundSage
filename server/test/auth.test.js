import assert from 'assert';
import { repository } from '../src/repository.js';

const sub = `sub_${Date.now()}`;
const user1 = repository.findOrCreateUserByGoogleSub(sub, { displayName: 'Auth User' });
const user2 = repository.findOrCreateUserByGoogleSub(sub, { displayName: 'Auth User' });

assert.equal(user1.id, user2.id);
assert.equal(user1.googleSub, sub);
console.log('auth repository mapping test passed');
