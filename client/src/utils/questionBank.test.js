import test from 'node:test';
import assert from 'node:assert/strict';
import * as questionBank from './questionBank.js';
const { filterQuestionsByDifficulty } = questionBank;

const bank = [
  { question: 'easy one', difficulty: 'easy' },
  { question: 'medium one', difficulty: 'medium' },
  { question: 'hard one', difficulty: 'hard' },
];

test('Junior level only includes easy questions', () => {
  assert.deepEqual(
    filterQuestionsByDifficulty(bank, 'Junior').map((q) => q.question),
    ['easy one']
  );
});

test('Mid-Level is a canonical tier and includes easy and medium questions', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(questionBank.DIFFICULTY_LEVEL_TO_TAGS, 'Mid-Level'));
  const questions = filterQuestionsByDifficulty(bank, 'Mid-Level').map((q) => q.question);
  assert.deepEqual(questions, ['easy one', 'medium one']);
});

test('Senior Architect includes medium and hard questions', () => {
  const questions = filterQuestionsByDifficulty(bank, 'Senior Architect').map((q) => q.question);
  assert.deepEqual(questions, ['medium one', 'hard one']);
});

test('Staff Principal focuses on hard questions only', () => {
  assert.deepEqual(
    filterQuestionsByDifficulty(bank, 'Staff Principal').map((q) => q.question),
    ['hard one']
  );
});
