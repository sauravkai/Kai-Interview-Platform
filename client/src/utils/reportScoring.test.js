import test from 'node:test';
import assert from 'node:assert/strict';

const { calculateQuestionScore } = await import('./reportScoring.js');

test('accepted submissions score 90', () => {
  assert.equal(calculateQuestionScore({ status: 'Accepted' }), 90);
});

test('partial pass ratio is used when available', () => {
  assert.equal(calculateQuestionScore({ passCount: 3, totalCount: 4 }), 75);
});

test('missing execution data does not default to a fake 75', () => {
  assert.equal(calculateQuestionScore(null), 0);
  assert.equal(calculateQuestionScore({}), 0);
  assert.equal(calculateQuestionScore({ passCount: 0, totalCount: 0 }), 0);
});
