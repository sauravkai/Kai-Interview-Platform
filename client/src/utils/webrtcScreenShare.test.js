import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeViewerRole, canUseScreenShare } from './webrtcScreenShare.js';

test('normalizeViewerRole lowercases and trims the role', () => {
  assert.equal(normalizeViewerRole(' Candidate '), 'candidate');
  assert.equal(normalizeViewerRole('Interviewer'), 'interviewer');
  assert.equal(normalizeViewerRole(''), 'candidate');
});

test('canUseScreenShare reports support when display media exists', () => {
  const mockNavigator = {
    mediaDevices: {
      getDisplayMedia: () => Promise.resolve({}),
    },
  };

  assert.equal(canUseScreenShare(mockNavigator), true);
  assert.equal(canUseScreenShare({ mediaDevices: {} }), false);
});
