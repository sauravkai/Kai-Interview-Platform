import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInterviewStatus, canRejoinInterview } from '../src/controllers/interviewController.js';

test('status normalization handles legacy scheduled and cancelled values', () => {
  assert.equal(normalizeInterviewStatus('Scheduled'), 'scheduled');
  assert.equal(normalizeInterviewStatus('In Progress'), 'in-progress');
  assert.equal(normalizeInterviewStatus('Cancelled'), 'cancelled');
  assert.equal(normalizeInterviewStatus('completed'), 'completed');
});

test('cancelled and ended interviews cannot be rejoined', () => {
  assert.equal(canRejoinInterview('Cancelled'), false);
  assert.equal(canRejoinInterview('completed'), false);
  assert.equal(canRejoinInterview('scheduled'), true);
});
