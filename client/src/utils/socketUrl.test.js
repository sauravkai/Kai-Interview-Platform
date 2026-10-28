import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSocketUrl } from './socketUrl.js';

test('normalizeSocketUrl strips /api and /socket.io suffixes', () => {
  assert.equal(normalizeSocketUrl('http://localhost:5000/api', ''), 'http://localhost:5000');
  assert.equal(normalizeSocketUrl('http://localhost:5000/socket.io', ''), 'http://localhost:5000');
  assert.equal(normalizeSocketUrl('http://localhost:5000/', ''), 'http://localhost:5000');
});
