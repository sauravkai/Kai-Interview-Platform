import test from 'node:test';
import assert from 'node:assert/strict';

import { clearStoredAuth, isTokenExpired } from './authSession.js';

test('expired JWT tokens are detected and the stored auth data is cleared', () => {
  globalThis.localStorage = {
    store: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJleHAiOjE3MTYwMDAwMDB9.signature',
      user: JSON.stringify({ email: 'candidate@example.com' }),
      previousInterviewReports_alpha_example_com: JSON.stringify([{ id: 'old' }]),
      cancelledInterviewHistory_alpha_example_com: JSON.stringify([{ id: 'old' }]),
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
  };

  assert.equal(isTokenExpired('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJleHAiOjE3MTYwMDAwMDB9.signature'), true);

  clearStoredAuth();

  assert.equal(globalThis.localStorage.getItem('token'), null);
  assert.equal(globalThis.localStorage.getItem('user'), null);
  assert.equal(globalThis.localStorage.getItem('previousInterviewReports_alpha_example_com'), null);
  assert.equal(globalThis.localStorage.getItem('cancelledInterviewHistory_alpha_example_com'), null);
});

test('fresh JWT tokens remain valid until their expiry timestamp', () => {
  const futureToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEiLCJleHAiOjQ3NDA3NDA4MDB9.signature';

  assert.equal(isTokenExpired(futureToken), false);
});
