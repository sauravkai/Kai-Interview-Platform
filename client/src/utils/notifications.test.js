import test from 'node:test';
import assert from 'node:assert/strict';

const makeWindowMock = () => {
  const store = new Map();

  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };

  const win = {
    localStorage,
    dispatchEvent: () => {},
  };

  globalThis.window = win;
  globalThis.localStorage = localStorage;
  return win;
};

const resetWindow = () => {
  delete globalThis.window;
  delete globalThis.localStorage;
};

test('live-room notification is added to the bell list for the target user', async () => {
  makeWindowMock();

  const { addLiveRoomNotification, getNotificationsForUser } = await import('./notifications.js');

  addLiveRoomNotification('room-123', {
    title: 'Live room invite sent',
    message: 'Join your live interview room',
    recipientEmail: 'Candidate@Example.com',
    candidateEmail: 'candidate@example.com',
    actionUrl: '/live-room/room-123',
    interviewerName: 'Alicia Stone',
    interviewerEmail: 'alicia@company.com',
  });

  const notifications = getNotificationsForUser('candidate@example.com');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'live-room-invite');
  assert.equal(notifications[0].actionUrl, '/live-room/room-123');

  resetWindow();
});

test('placeholder interview invites already in storage are stripped out automatically', async () => {
  makeWindowMock();

  const { getStoredNotifications, getNotificationsForUser } = await import('./notifications.js');
  globalThis.localStorage.setItem('interview_ai_notifications', JSON.stringify([
    {
      id: 'demo-1',
      type: 'live-room-invite',
      title: 'Interview Invitation',
      message: 'Upcoming interview scheduled: software role with SAGAR PATIL',
      roomId: 'room-demo-1',
      recipientEmail: 'candidate@example.com',
      candidateEmail: 'candidate@example.com',
      email: 'candidate@example.com',
      userEmail: 'candidate@example.com',
      createdAt: '2026-10-27T22:43:00Z',
      read: false,
    },
  ]));

  assert.deepEqual(getStoredNotifications(), []);
  assert.deepEqual(getNotificationsForUser('candidate@example.com'), []);

  resetWindow();
});

test('synthetic scheduled interviews are filtered out even when they match the candidate email', async () => {
  makeWindowMock();

  const { getStoredScheduledInterviews, getScheduledInterviewsForUser } = await import('./notifications.js');
  globalThis.localStorage.setItem('interview_ai_scheduled_sessions', JSON.stringify([
    {
      roomId: 'room-demo-678',
      sessionId: 'sess_demo_678',
      title: 'Technical Round',
      status: 'scheduled',
      candidateEmail: 'candidate@example.com',
      candidateName: 'Candidate User',
      interviewerName: 'demo_interviewer',
      interviewerEmail: 'demo_interviewer@gmail.com',
      scheduledAt: '2026-10-27T22:43:00Z',
    },
  ]));

  assert.deepEqual(getStoredScheduledInterviews(), []);
  assert.deepEqual(getScheduledInterviewsForUser('candidate@example.com', 'Candidate User'), []);

  resetWindow();
});
