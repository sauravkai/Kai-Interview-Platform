import test from 'node:test';
import assert from 'node:assert/strict';

import { getUserInterviewReports, getInterviewReport } from '../src/controllers/interviewController.js';
import { Interview } from '../src/models/Interview.js';
import { InterviewResult } from '../src/models/InterviewResult.js';

test('getUserInterviewReports should return the saved interview results for the active user', async () => {
  const originalFind = InterviewResult.find;
  const fakeResults = [
    {
      _id: 'result-1',
      interviewId: { _id: 'int-1', title: 'System Design Round', candidateName: 'Ava Johnson', role: 'Software Engineer' },
      candidateId: 'cand-1',
      interviewerId: 'int-1',
      overallScore: 87,
      questionMetrics: [{ question: 'Why use caching?', score: 90 }],
      chatMessages: [{ sender: 'candidate', text: 'I would add Redis.' }],
      interviewerNotes: 'Strong communication',
      totalSessionTime: 1800,
      createdAt: new Date('2024-01-01T00:00:00Z'),
    },
  ];

  InterviewResult.find = async () => ({
    populate: async () => fakeResults,
    sort: async () => fakeResults,
  });

  let response = null;
  try {
    await getUserInterviewReports({ user: { _id: 'int-1' } }, { json: (payload) => { response = payload; } }, () => {});
    assert.equal(response.success, true);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].title, 'System Design Round');
    assert.equal(response.data[0].overallScore, 87);
    assert.match(response.data[0].reportSummary, /Strong communication/i);
  } finally {
    InterviewResult.find = originalFind;
  }
});

test('getUserInterviewReports should include completed and cancelled interview records even when no InterviewResult exists', async () => {
  const originalFind = InterviewResult.find;
  const originalInterviewFind = Interview.find;

  InterviewResult.find = async () => ({
    populate: async () => [],
    sort: async () => [],
  });

  Interview.find = async () => ({
    populate: () => ({
      sort: () => ({
        lean: () => Promise.resolve([
          {
            _id: 'int-2',
            title: 'Final round',
            candidateId: 'cand-1',
            interviewerId: 'int-1',
            candidateName: 'Ava Johnson',
            role: 'Software Engineer',
            roomId: 'room-321',
            status: 'completed',
            endedAt: new Date('2024-01-02T00:00:00Z'),
            durationMinutes: 30,
            problemTitle: 'Tree Traversal',
          },
          {
            _id: 'int-3',
            title: 'Cancelled screening',
            candidateId: 'cand-1',
            interviewerId: 'int-1',
            candidateName: 'Ava Johnson',
            role: 'Software Engineer',
            roomId: 'room-456',
            status: 'cancelled',
            cancelledAt: new Date('2024-01-03T00:00:00Z'),
            durationMinutes: 15,
            problemTitle: 'Hashing',
          },
        ]),
      }),
    }),
  });

  let response = null;
  try {
    await getUserInterviewReports({ user: { _id: 'int-1' } }, { json: (payload) => { response = payload; } }, () => {});
    assert.equal(response.success, true);
    assert.equal(response.data.length, 2);
    assert.equal(response.data[0].status, 'completed');
    assert.equal(response.data[1].status, 'cancelled');
    assert.equal(response.data[0].overallScore, 0);
    assert.match(response.data[1].title, /Cancelled screening/i);
  } finally {
    InterviewResult.find = originalFind;
    Interview.find = originalInterviewFind;
  }
});

test('getInterviewReport should not invent fake scores when no evaluation result exists', async () => {
  const originalResultFindOne = InterviewResult.findOne;
  const originalInterviewFindOne = Interview.findOne;

  InterviewResult.findOne = async () => null;
  Interview.findOne = async () => ({
    _id: 'int-99',
    roomId: 'room-99',
    title: 'Actual session report',
    candidateName: 'Dana Lee',
    candidateEmail: 'dana@example.com',
    interviewerName: 'Alex',
    interviewerNotes: 'Candidate solved the tree problem thoroughly.',
    chatMessages: [{ sender: 'candidate', text: 'I used BFS.' }],
    transcript: [{ sender: 'candidate', text: 'I used BFS.' }],
    status: 'completed',
    scheduledAt: new Date('2024-01-01T12:00:00Z'),
    durationMinutes: 42,
  });

  let response = null;
  try {
    await getInterviewReport({ params: { interviewId: 'room-99' }, user: { _id: 'cand-99' } }, { json: (payload) => { response = payload; } }, () => {});
    assert.equal(response.success, true);
    assert.equal(response.data.title, 'Actual session report');
    assert.equal(response.data.overallScore, 0);
    assert.match(response.data.aiSummary || '', /no evaluation data|not been generated/i);
    assert.equal(response.data.chatMessages[0].text, 'I used BFS.');
    assert.match(response.data.interviewerNotes, /tree problem thoroughly/i);
  } finally {
    InterviewResult.findOne = originalResultFindOne;
    Interview.findOne = originalInterviewFindOne;
  }
});
