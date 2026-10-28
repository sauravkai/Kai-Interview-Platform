import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAveragePreviousReportRating, debounceRefresh, getReportDisplayValues, mergeUpcomingInterviews, sortMostRecentInterviewEntries } from './dashboardInterviews.js';

test('merges live API interviews with stored scheduled interviews for the same user', () => {
  const apiInterviews = [
    { _id: 'a1', roomId: 'room-1', title: 'Backend Round', scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(), interviewerEmail: 'alex@company.com', status: 'scheduled' },
  ];

  const storedInterviews = [
    { _id: 'b2', roomId: 'room-2', title: 'Frontend Round', scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), interviewerEmail: 'bea@company.com', status: 'scheduled' },
    { _id: 'a1', roomId: 'room-1', title: 'Backend Round', scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(), interviewerEmail: 'alex@company.com', status: 'scheduled' },
  ];

  const merged = mergeUpcomingInterviews(apiInterviews, storedInterviews);
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((entry) => entry.roomId),
    ['room-2', 'room-1']
  );
  assert.equal(merged[0].interviewerEmail, 'bea@company.com');
});

test('filters generic demo invite entries with no real interviewer metadata', () => {
  const apiInterviews = [
    { _id: 'real-1', roomId: 'room-real-1', title: 'Technical Round', scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(), interviewerName: 'Alicia Stone', interviewerEmail: 'alicia@company.com', status: 'scheduled', questionCount: 6 },
  ];

  const storedInterviews = [
    { _id: 'demo-1', roomId: 'room-demo-1', title: 'Interview Invitation', scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), status: 'scheduled', candidateEmail: 'candidate@example.com', questionCount: 0 },
    { _id: 'real-2', roomId: 'room-real-2', title: 'System Design', scheduledAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(), interviewerName: 'Brandon Lee', interviewerEmail: 'brandon@company.com', status: 'scheduled', questionCount: 8 },
  ];

  const merged = mergeUpcomingInterviews(apiInterviews, storedInterviews);
  assert.deepEqual(
    merged.map((entry) => entry.roomId),
    ['room-real-2', 'room-real-1']
  );
  assert.ok(merged.every((entry) => entry.interviewerEmail || entry.interviewerName));
});

test('ignores cancelled items even when stale scheduled data is still present', () => {
  const apiInterviews = [
    { _id: 'active-1', roomId: 'room-active-1', title: 'Live round', scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), interviewerEmail: 'alex@company.com', status: 'scheduled' },
  ];

  const storedInterviews = [
    { _id: 'cancelled-1', roomId: 'room-cancelled-1', title: 'Cancelled round', scheduledAt: new Date(Date.now() - 3600 * 1000).toISOString(), interviewerEmail: 'zoe@company.com', status: 'cancelled', cancelledAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    { _id: 'active-1', roomId: 'room-active-1', title: 'Live round', scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), interviewerEmail: 'alex@company.com', status: 'scheduled' },
  ];

  const merged = mergeUpcomingInterviews(apiInterviews, storedInterviews);
  assert.deepEqual(
    merged.map((entry) => entry.roomId),
    ['room-active-1']
  );
});

test('preserves interviewer-assigned titles and exact start/end times for valid interviews', () => {
  const interview = {
    _id: 'real-3',
    roomId: 'room-real-3',
    title: 'System Design Deep Dive',
    scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    durationMinutes: 90,
    interviewerName: 'Maya Chen',
    interviewerEmail: 'maya@company.com',
    status: 'scheduled',
  };

  const merged = mergeUpcomingInterviews([interview], []);
  assert.equal(merged[0].title, 'System Design Deep Dive');
  assert.equal(merged[0].durationMinutes, 90);
  assert.equal(new Date(merged[0].scheduledAt).getTime(), new Date(interview.scheduledAt).getTime());
  assert.equal(new Date(merged[0].startAt).getTime(), new Date(interview.scheduledAt).getTime());
  assert.equal(new Date(merged[0].endAt).getTime(), new Date(new Date(interview.scheduledAt).getTime() + 90 * 60 * 1000).getTime());
});

test('filters generic invitation entries that only contain a candidate email and no interviewer details', () => {
  const storedInterviews = [
    {
      _id: 'demo-42',
      roomId: 'room-demo-42',
      title: 'Interview Invitation',
      scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: 'scheduled',
      candidateEmail: 'candidate@example.com',
      candidateName: 'Candidate User',
      interviewerName: 'TBD',
      interviewerEmail: 'Not provided',
      questionCount: 0,
    },
  ];

  const merged = mergeUpcomingInterviews([], storedInterviews);
  assert.deepEqual(merged, []);
});

test('keeps the interviewer-assigned title and duration when a stored invite has generic placeholder values', () => {
  const storedInterviews = [
    {
      _id: 'stored-90',
      roomId: 'room-stored-90',
      title: 'Interview Invitation',
      interviewTitle: 'Senior Frontend System Design',
      scheduledAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      duration: '90 min',
      interviewerName: 'Maya Chen',
      interviewerEmail: 'maya@company.com',
      status: 'scheduled',
    },
  ];

  const merged = mergeUpcomingInterviews([], storedInterviews);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Senior Frontend System Design');
  assert.equal(merged[0].durationMinutes, 90);
});

test('sorts completed and past interviews by newest timestamp first', () => {
  const reports = [
    { _id: 'older', title: 'Older report', completedDate: '2026-10-01T09:00:00Z' },
    { _id: 'newest', title: 'Newest report', completedDate: '2026-10-15T18:00:00Z' },
    { _id: 'middle', title: 'Middle report', completedDate: '2026-10-10T12:00:00Z' },
  ];

  const sorted = sortMostRecentInterviewEntries(reports);

  assert.deepEqual(sorted.map((entry) => entry._id), ['newest', 'middle', 'older']);
});

test('sorts upcoming interviews by newest scheduled time first', () => {
  const now = Date.now();
  const interviews = [
    { _id: 'old', roomId: 'room-old', title: 'Old slot', scheduledAt: new Date(now - 4 * 3600 * 1000).toISOString(), interviewerEmail: 'old@company.com', status: 'scheduled', durationMinutes: 30 },
    { _id: 'new', roomId: 'room-new', title: 'New slot', scheduledAt: new Date(now + 4 * 3600 * 1000).toISOString(), interviewerEmail: 'new@company.com', status: 'scheduled', durationMinutes: 30 },
    { _id: 'mid', roomId: 'room-mid', title: 'Mid slot', scheduledAt: new Date(now + 2 * 3600 * 1000).toISOString(), interviewerEmail: 'mid@company.com', status: 'scheduled', durationMinutes: 30 },
  ];

  const sorted = mergeUpcomingInterviews(interviews, []).map((entry) => entry._id);

  assert.deepEqual(sorted, ['new', 'mid']);
});

test('normalizes stale report data to the real percentage and 5-point rating', () => {
  const report = {
    overallScore: 23,
    questionMetrics: [
      { score: 90 },
      { score: 95 },
      { score: 88 },
    ],
    strengths: ['Strong technical clarity'],
    improvements: ['Improve communication pacing'],
  };

  const values = getReportDisplayValues(report);

  assert.equal(values.overallScore, 91);
  assert.equal(values.rating, 4.6);
  assert.deepEqual(values.strengths, ['Strong technical clarity']);
  assert.deepEqual(values.improvements, ['Improve communication pacing']);
});

test('calculates the average rating from completed previous interview reports', () => {
  const reports = [
    { overallScore: 80 },
    { overallScore: 90 },
    { overallScore: 100 },
    { status: 'cancelled' },
  ];

  const average = calculateAveragePreviousReportRating(reports);
  assert.equal(average, 4.5);
});

test('debounces repeated refresh requests to avoid repeated API bursts', async () => {
  let refreshCount = 0;
  const debounced = debounceRefresh(() => {
    refreshCount += 1;
  }, 20);

  debounced();
  debounced();
  debounced();

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(refreshCount, 1);
});
