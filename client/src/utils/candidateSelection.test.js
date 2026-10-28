import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandidateOptions, resolveSelectedCandidate } from './candidateSelection.js';

test('candidate options are normalized with clear labels and stable ordering', () => {
  const options = normalizeCandidateOptions([
    { _id: '2', name: 'Brianna Ross', email: 'brianna@example.com' },
    { _id: '1', name: 'Ava Patel', email: 'ava@example.com' },
  ]);

  assert.deepEqual(options.map((option) => option.label), [
    'Ava Patel — ava@example.com',
    'Brianna Ross — brianna@example.com',
  ]);
});

test('selected candidate is resolved from email and falls back to the first option', () => {
  const candidates = normalizeCandidateOptions([
    { _id: '1', name: 'Ava Patel', email: 'ava@example.com' },
    { _id: '2', name: 'Brianna Ross', email: 'brianna@example.com' },
  ]);

  assert.equal(resolveSelectedCandidate(candidates, '', 'brianna@example.com')?.name, 'Brianna Ross');
  assert.equal(resolveSelectedCandidate(candidates, 'Ava Patel', '')?.email, 'ava@example.com');
  assert.equal(resolveSelectedCandidate(candidates, '', '')?.id, '1');
});
