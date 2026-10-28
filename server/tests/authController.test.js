import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeEmail } from '../src/controllers/authController.js';

test('normalizeEmail trims and lowercases mixed-case email addresses', () => {
  assert.equal(normalizeEmail('  QA.Test.User@Example.COM  '), 'qa.test.user@example.com');
});
