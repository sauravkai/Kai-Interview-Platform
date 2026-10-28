import test from 'node:test';
import assert from 'node:assert/strict';
import { Interview } from './Interview.js';

test('interview records persist candidate and interviewer emails for dashboard lookup', () => {
  assert.ok(Interview.schema.paths.candidateEmail, 'candidateEmail should be part of the schema');
  assert.ok(Interview.schema.paths.interviewerEmail, 'interviewerEmail should be part of the schema');
});
