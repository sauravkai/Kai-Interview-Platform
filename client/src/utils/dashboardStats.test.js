import test from 'node:test';
import assert from 'node:assert/strict';

const localStorageMock = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    this.store.set(String(key), String(value));
  },
  removeItem(key) {
    this.store.delete(key);
  },
};

globalThis.localStorage = localStorageMock;

const eventHandlers = new Map();
globalThis.window = {
  addEventListener(type, handler) {
    eventHandlers.set(type, [...(eventHandlers.get(type) || []), handler]);
  },
  removeEventListener(type, handler) {
    const handlers = eventHandlers.get(type) || [];
    eventHandlers.set(type, handlers.filter((entry) => entry !== handler));
  },
  dispatchEvent(event) {
    const handlers = eventHandlers.get(event.type) || [];
    handlers.forEach((handler) => handler(event));
  },
};

import { buildCategoryDistribution, buildMonthlySolvedByDay, filterSolvedEntriesForDate, getCanonicalSolvedCount, getCurrentLearningStreak, setLearningStreak } from './dashboardStats.js';

test('does not inflate solved count when a stale local progress value exceeds the server count', () => {
  const count = getCanonicalSolvedCount({
    user: { stats: { problemsSolved: 1 } },
    solvedHistory: [{ problemTitle: 'Two Sum', date: '2024-01-01' }],
    localSolvedProgress: 2,
  });

  assert.equal(count, 1);
});

test('uses the server-count as the source of truth when it is present and valid', () => {
  const count = getCanonicalSolvedCount({
    user: { stats: { problemsSolved: 3 } },
    solvedHistory: [{ problemTitle: 'Two Sum', date: '2024-01-01' }],
    localSolvedProgress: 1,
  });

  assert.equal(count, 3);
});

test('deduplicates repeated accepted attempts for the same problem when local history does not include a problemId', () => {
  const count = getCanonicalSolvedCount({
    user: { stats: { problemsSolved: 1 } },
    solvedHistory: [
      { problemTitle: 'Two Sum', date: '2024-01-01', solvedAt: '2024-01-01T09:00:00.000Z' },
      { problemTitle: 'Two Sum', date: '2024-01-02', solvedAt: '2024-01-02T09:00:00.000Z' },
      { problemTitle: 'Two Sum', date: '2024-01-03', solvedAt: '2024-01-03T09:00:00.000Z' },
    ],
    localSolvedProgress: 3,
  });

  assert.equal(count, 1);
});

test('deduplicates same-problem entries even when one version stores the id and another stores only the title', () => {
  const count = getCanonicalSolvedCount({
    user: { stats: { problemsSolved: 1 } },
    solvedHistory: [
      { problemId: 'p-42', problemTitle: 'Two Sum', date: '2024-01-01', solvedAt: '2024-01-01T09:00:00.000Z' },
      { title: 'Two Sum', date: '2024-01-02', solvedAt: '2024-01-02T09:00:00.000Z' },
    ],
    localSolvedProgress: 2,
  });

  assert.equal(count, 1);
});

test('filters stale previous-day entries from the current-day solved history view', () => {
  const today = new Date('2025-01-15T12:00:00.000Z');
  const filtered = filterSolvedEntriesForDate([
    { problemTitle: 'Yesterday Problem', date: '2025-01-14', solvedAt: '2025-01-14T08:00:00.000Z' },
    { problemTitle: 'Today Problem', date: '2025-01-15', solvedAt: '2025-01-15T09:00:00.000Z' },
  ], today);

  assert.deepEqual(filtered.map((entry) => entry.problemTitle), ['Today Problem']);
});

test('counts each unique solved problem once in the category distribution', () => {
  const distribution = buildCategoryDistribution({
    solvedCount: 1,
    solvedHistory: [
      { problemTitle: 'Two Sum', date: '2025-01-14', solvedAt: '2025-01-14T08:00:00.000Z' },
      { problemTitle: 'Two Sum', date: '2025-01-15', solvedAt: '2025-01-15T09:00:00.000Z' },
    ],
    problems: [{ title: 'Two Sum', category: 'Arrays' }],
  });

  assert.equal(distribution.find((entry) => entry.name === 'Arrays')?.value, 1);
});

test('counts only from the reset timestamp onward after a fresh reset', () => {
  const resetAt = '2025-01-15T00:00:00.000Z';
  localStorage.setItem('solvedHistoryResetAt', resetAt);

  const count = getCanonicalSolvedCount({
    user: { stats: { problemsSolved: 99 } },
    solvedHistory: [
      { problemTitle: 'Old Problem', date: '2025-01-14', solvedAt: '2025-01-14T08:00:00.000Z' },
      { problemTitle: 'New Problem', date: '2025-01-15', solvedAt: '2025-01-15T09:00:00.000Z' },
    ],
    localSolvedProgress: 5,
  });

  assert.equal(count, 1);
  localStorage.removeItem('solvedHistoryResetAt');
});

test('uses the same streak source for all dashboard views and emits updates', async () => {
  const initial = { currentStreak: 2, weeklyProgress: [false, false, false, false, false, false, false], lastActiveDate: new Date().toISOString() };
  const updated = setLearningStreak(initial);

  assert.equal(getCurrentLearningStreak().currentStreak, updated.currentStreak);
  assert.equal(getCurrentLearningStreak().currentStreak, 2);

  const event = new Promise((resolve) => {
    const handler = (event) => resolve(event.detail.currentStreak);
    window.addEventListener('learningStreakUpdated', handler);
    setLearningStreak({ ...initial, currentStreak: 3 });
  });

  assert.equal(await event, 3);
  localStorage.removeItem('learningStreak');
});

test('builds a full month of daily solved-problem counts instead of only the current day', () => {
  const data = buildMonthlySolvedByDay([
    { problemTitle: 'Two Sum', solvedAt: '2025-01-01T09:00:00.000Z' },
    { problemTitle: 'Valid Parentheses', solvedAt: '2025-01-01T10:00:00.000Z' },
    { problemTitle: 'Merge Sort', solvedAt: '2025-01-15T08:00:00.000Z' },
  ], new Date('2025-01-15T12:00:00.000Z'));

  assert.equal(data.length, 31);
  assert.equal(data[0].solved, 2);
  assert.equal(data[14].solved, 1);
  assert.equal(data[0].questions.length, 2);
  assert.equal(data[14].questions[0], 'Merge Sort');
});

test('deduplicates the same problem before counting monthly totals and daily chart values', () => {
  const data = buildMonthlySolvedByDay([
    { problemId: 'p-42', problemTitle: 'Two Sum', solvedAt: '2025-01-15T09:00:00.000Z' },
    { title: 'Two Sum', solvedAt: '2025-01-15T10:00:00.000Z' },
    { problemTitle: 'Merge Sort', solvedAt: '2025-01-15T11:00:00.000Z' },
  ], new Date('2025-01-15T12:00:00.000Z'));

  assert.equal(data[14].solved, 2);
  assert.deepEqual(data[14].questions, ['Two Sum', 'Merge Sort']);
});
