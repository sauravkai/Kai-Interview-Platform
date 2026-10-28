import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMixedPracticeQuestionBank } from './practiceQuestionBank.js';

test('mixed practice excludes mcq questions and keeps only coding or paragraph prompts', () => {
  const mixed = buildMixedPracticeQuestionBank([
    { type: 'mcq', question: 'alpha', difficulty: 'medium' },
    { type: 'mcq', question: 'beta', difficulty: 'hard' },
  ], 'React.js', 'Medium');

  assert.equal(mixed.some((question) => question.type === 'mcq'), false);
  assert.equal(mixed.some((question) => question.type === 'text'), true);
  assert.equal(mixed.some((question) => question.type === 'coding'), true);
});
