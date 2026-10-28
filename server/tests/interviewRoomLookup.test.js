import test from 'node:test';
import assert from 'node:assert/strict';

import { getInterviewByRoomId } from '../src/controllers/interviewController.js';
import { Interview } from '../src/models/Interview.js';

test('getInterviewByRoomId rejects a room that has no saved record', async () => {
  const originalFindOne = Interview.findOne;
  Interview.findOne = () => ({
    populate: function () { return this; },
    then: (resolve) => resolve(null),
  });

  let statusCode;
  let response;
  try {
    await getInterviewByRoomId({ params: { roomId: 'room-demo-123' } }, {
      status: (code) => {
        statusCode = code;
        return {
          json: (payload) => {
            response = payload;
          },
        };
      },
      json: (payload) => {
        response = payload;
      },
    }, () => {});

    assert.equal(statusCode, 404);
    assert.equal(response.success, false);
    assert.equal(response.message, 'Interview room not found.');
    assert.equal(response.data, null);
  } finally {
    Interview.findOne = originalFindOne;
  }
});

test('getInterviewByRoomId rejects ended interviews from being rejoined', async () => {
  const originalFindOne = Interview.findOne;
  const endedInterview = { roomId: 'room-ended-123', status: 'completed' };
  Interview.findOne = () => ({
    populate: function () { return this; },
    then: (resolve) => resolve(endedInterview),
  });

  let statusCode;
  let response;
  try {
    await getInterviewByRoomId({ params: { roomId: 'room-ended-123' } }, {
      status: (code) => {
        statusCode = code;
        return {
          json: (payload) => {
            response = payload;
          },
        };
      },
      json: (payload) => {
        response = payload;
      },
    }, () => {});

    assert.equal(statusCode, 409);
    assert.equal(response.success, false);
    assert.equal(response.ended, true);
  } finally {
    Interview.findOne = originalFindOne;
  }
});
