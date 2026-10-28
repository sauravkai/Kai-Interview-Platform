import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeInterviewReports, formatDurationLabel, getUserScopedHistoryKey, isSessionJoinAllowed, isSessionVisibleInUpcomingList, isHistoryStatusVisible, normalizeQuestionCount, readStoredHistoryReports, removeCancelledInterviewFromState, resolveParticipantEmail, resolveParticipantName } from './sessionAccess.js';
import { getStoredScheduledInterviews } from './notifications.js';

test('completed sessions cannot be rejoined', () => {
  assert.equal(isSessionJoinAllowed('completed'), false);
  assert.equal(isSessionJoinAllowed('finished'), false);
});

test('generic category-only titles like Arrays are treated as placeholders when they have no real interview metadata', () => {
  const placeholderLikeSession = {
    _id: 'fake_report_1',
    title: 'Arrays',
    topic: 'Arrays',
    roomId: 'room-demo-123',
    status: 'completed',
    overallScore: 0,
  };

  assert.equal(isSessionVisibleInUpcomingList(placeholderLikeSession), false);
  assert.equal(isHistoryStatusVisible(placeholderLikeSession), false);
});

test('generic interview session rows without real candidate or interviewer identity are hidden even with a future schedule', () => {
  const syntheticSession = {
    _id: 'room-123',
    title: 'Interview Session',
    roomId: 'room-123',
    status: 'scheduled',
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    durationMinutes: 45,
  };

  assert.equal(isSessionVisibleInUpcomingList(syntheticSession), false);
});

test('inactive or ended items are hidden from upcoming lists', () => {
  assert.equal(isSessionVisibleInUpcomingList({ isActive: false }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'completed' }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'cancelled' }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'canceled' }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'ended' }), false);
  assert.equal(isSessionVisibleInUpcomingList({ completedAt: '2026-01-01T00:00:00Z' }), false);
  assert.equal(isSessionVisibleInUpcomingList({ type: 'login', isActive: true }), false);
  assert.equal(isSessionVisibleInUpcomingList({ type: 'logout', isActive: true }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'scheduled', scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }), true);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'scheduled', scheduledAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), durationMinutes: 45 }), true);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'scheduled', scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), durationMinutes: 30 }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'scheduled', scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), sessionEnd: new Date(Date.now() - 30 * 60 * 1000).toISOString() }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'scheduled', startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), durationMinutes: 30, endAt: new Date(Date.now() - 15 * 60 * 1000).toISOString() }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'live', startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), durationMinutes: 30, endAt: new Date(Date.now() - 15 * 60 * 1000).toISOString() }), false);
  assert.equal(isSessionVisibleInUpcomingList({ status: 'live' }), true);
});

test('active sessions can still be joined', () => {
  assert.equal(isSessionJoinAllowed('in-progress'), true);
  assert.equal(isSessionJoinAllowed('scheduled'), true);
  assert.equal(isSessionJoinAllowed('live'), true);
  assert.equal(isSessionJoinAllowed('cancelled'), false);
});

test('sessions are joinable only after the scheduled start time and before the active window ends', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const active = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const expired = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  assert.equal(isSessionJoinAllowed({ status: 'scheduled', scheduledAt: future, durationMinutes: 45 }), false);
  assert.equal(isSessionJoinAllowed({ status: 'scheduled', scheduledAt: active, durationMinutes: 45 }), true);
  assert.equal(isSessionJoinAllowed({ status: 'scheduled', scheduledAt: future, endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }), false);
  assert.equal(isSessionJoinAllowed({ status: 'scheduled', scheduledAt: expired, durationMinutes: 30 }), false);
  assert.equal(isSessionJoinAllowed({ status: 'in-progress', scheduledAt: expired, durationMinutes: 30 }), false);
});

test('user-scoped history keys are isolated per account', () => {
  const first = getUserScopedHistoryKey('previousInterviewReports', { email: 'alpha@example.com' });
  const second = getUserScopedHistoryKey('previousInterviewReports', { email: 'beta@example.com' });

  assert.notEqual(first, second);
  assert.equal(first, 'previousInterviewReports_alpha_example_com');
});

test('cancelled interviews are kept in the history list and marked as cancelled', () => {
  assert.equal(isHistoryStatusVisible({ status: 'cancelled' }), true);
  assert.equal(isHistoryStatusVisible({ status: 'completed' }), true);
  assert.equal(isHistoryStatusVisible({ status: 'scheduled' }), true);
  assert.equal(isHistoryStatusVisible({ status: 'live' }), false);
});

test('cancelled interviews are removed from both active interview and session lists', () => {
  const interviews = [
    { _id: 'a', title: 'Interview A' },
    { _id: 'b', title: 'Interview B' },
  ];

  const sessions = [
    { roomId: 'a', type: 'interview' },
    { roomId: 'c', type: 'interview' },
  ];

  const result = removeCancelledInterviewFromState(interviews, sessions, 'a');

  assert.deepEqual(result.interviews, [{ _id: 'b', title: 'Interview B' }]);
  assert.deepEqual(result.sessions, [{ roomId: 'c', type: 'interview' }]);
});

test('cancelled or terminal interviews are excluded from the active dashboard list', () => {
  const interviews = [
    { _id: 'cancelled-session', status: 'cancelled', cancelledAt: new Date().toISOString() },
    { _id: 'scheduled-session', status: 'scheduled', scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
    { _id: 'completed-session', status: 'completed', completedAt: new Date().toISOString() },
  ];

  const visible = interviews.filter(isSessionVisibleInUpcomingList);
  assert.deepEqual(visible.map((item) => item._id), ['scheduled-session']);
});

test('question counts are normalized to a stable positive integer instead of random default fallbacks', () => {
  assert.equal(normalizeQuestionCount('1'), 1);
  assert.equal(normalizeQuestionCount(0, 2), 2);
  assert.equal(normalizeQuestionCount(undefined, 3), 3);
  assert.equal(normalizeQuestionCount('5.9'), 5);
  assert.equal(normalizeQuestionCount('abc', 4), 4);
});

test('report durations are normalized for both completed interviews and AI practice sessions', () => {
  assert.equal(formatDurationLabel({ durationMinutes: 45 }), '45 min');
  assert.equal(formatDurationLabel({ totalSessionTime: 5400 }), '1h 30m');
  assert.equal(formatDurationLabel({ duration: '90 min' }), '1h 30m');
  assert.equal(formatDurationLabel({ totalTime: 300, questionsAnswered: 5 }), '5 min');
  assert.equal(formatDurationLabel({}), 'N/A');
});

test('participant emails and names are resolved from nested objects as well as flat fields', () => {
  const record = {
    candidateName: 'Candidate Name',
    candidate: { email: 'candidate@gmail.com' },
    interviewer: { name: 'Jane Interviewer', email: 'jane@company.com' },
  };

  assert.equal(resolveParticipantEmail(record), 'candidate@gmail.com');
  assert.equal(resolveParticipantName(record), 'Candidate Name');
  assert.equal(resolveParticipantEmail({ interviewer: { email: 'jane@company.com' } }), 'jane@company.com');
});

test('expired scheduled interviews are pruned from persisted storage before they can remain visible on the dashboard', () => {
  globalThis.localStorage = {
    store: {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
  };

  globalThis.localStorage.setItem('interview_ai_scheduled_sessions', JSON.stringify([
    {
      roomId: 'room-ended-123',
      _id: 'room-ended-123',
      title: 'Interview Session',
      status: 'scheduled',
      scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 45,
      candidateEmail: 'candidate@example.com',
      interviewerEmail: 'interviewer@example.com',
      candidateName: 'Candidate',
      interviewerName: 'Interviewer',
    },
  ]));

  assert.deepEqual(getStoredScheduledInterviews(), []);
  assert.equal(isSessionVisibleInUpcomingList({ roomId: 'room-ended-123', title: 'Interview Session', status: 'scheduled', scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), durationMinutes: 45 }), false);
});

test('interview report history deduplicates by the shared room/session identity even when a new report id is generated', () => {
  const reports = [
    { _id: 'report_a', reportId: 'report_a', roomId: 'room_42', title: 'System Design Interview', status: 'completed' },
    { _id: 'report_b', reportId: 'report_b', roomId: 'room_42', title: 'System Design Interview', status: 'completed' },
    { _id: 'report_c', reportId: 'report_c', roomId: 'room_99', title: 'Different Interview', status: 'completed' },
  ];

  assert.equal(dedupeInterviewReports(reports).length, 2);
  assert.deepEqual(dedupeInterviewReports(reports).map((report) => report.roomId), ['room_42', 'room_99']);
});

test('ai practice reports are persisted and returned in the user-scoped history feed', () => {
  globalThis.localStorage = {
    store: {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
  };

  const user = { email: 'alpha@example.com' };
  const report = { _id: 'ai_123', title: 'One-to-AI Practice Session', status: 'completed', overallScore: 82 };

  const aiKey = getUserScopedHistoryKey('aiPracticeReports', user);
  globalThis.localStorage.setItem(aiKey, JSON.stringify([report]));

  assert.deepEqual(readStoredHistoryReports('aiPracticeReports', user), [report]);
  assert.equal(globalThis.localStorage.getItem(aiKey), JSON.stringify([report]));
});
