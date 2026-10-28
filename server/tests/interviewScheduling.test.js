import test from 'node:test';
import assert from 'node:assert/strict';

import { Interview } from '../src/models/Interview.js';
import { matchesInterviewForUser } from '../src/controllers/interviewController.js';

test('scheduled interviews can be created without a candidate user record', () => {
  const candidateIdPath = Interview.schema.paths.candidateId;
  assert.equal(candidateIdPath.options.required, undefined, 'candidateId should not be required when scheduling a session without a known user');
});

test('scheduled interviews match current users by email or name when candidateId is missing', () => {
  const interview = {
    roomId: 'room-test-123',
    candidateEmail: 'sauravkai2023@gmail.com',
    interviewerEmail: 'interviewer@demo.com',
    candidateName: 'candidate_kai',
    interviewerName: 'Saurav',
    status: 'scheduled',
  };

  assert.equal(matchesInterviewForUser(interview, { email: 'sauravkai2023@gmail.com' }), true);
  assert.equal(matchesInterviewForUser(interview, { name: 'candidate_kai' }), true);
  assert.equal(matchesInterviewForUser(interview, { email: 'nobody@example.com' }), false);
});
