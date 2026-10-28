export const DASHBOARD_CATEGORY_COLORS = {
  Arrays: '#6366f1',
  Strings: '#8b5cf6',
  Trees: '#ec4899',
  Graphs: '#14b8a6',
  DP: '#f59e0b',
  Other: '#64748b',
};

export const DASHBOARD_CATEGORY_ORDER = ['Arrays', 'Strings', 'Trees', 'Graphs', 'DP', 'Other'];

export const EMPTY_STREAK = {
  currentStreak: 0,
  weeklyProgress: [false, false, false, false, false, false, false],
  lastActiveDate: '',
};

export function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeLearningStreak(rawStreak = null) {
  const parsed = rawStreak && typeof rawStreak === 'object' ? rawStreak : EMPTY_STREAK;
  const weeklyProgress = Array.isArray(parsed.weeklyProgress) && parsed.weeklyProgress.length === 7
    ? parsed.weeklyProgress.map(Boolean)
    : EMPTY_STREAK.weeklyProgress.slice();

  const lastActiveDate = parsed.lastActiveDate || '';
  const currentStreak = Number.isFinite(Number(parsed.currentStreak)) ? Number(parsed.currentStreak) : 0;
  const normalized = {
    currentStreak: Math.max(0, currentStreak),
    weeklyProgress,
    lastActiveDate,
  };

  if (lastActiveDate) {
    const lastDate = new Date(lastActiveDate);
    if (!Number.isNaN(lastDate.getTime()) && getLocalDateKey(lastDate) === getLocalDateKey(new Date())) {
      normalized.currentStreak = Math.max(1, normalized.currentStreak);
      normalized.weeklyProgress[(new Date().getDay() + 6) % 7] = true;
    }
  }

  return normalized;
}

export function getCurrentLearningStreak() {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...EMPTY_STREAK };
    }

    const rawStreak = localStorage.getItem('learningStreak');
    if (!rawStreak) {
      return { ...EMPTY_STREAK };
    }

    return normalizeLearningStreak(JSON.parse(rawStreak));
  } catch {
    return { ...EMPTY_STREAK };
  }
}

export function setLearningStreak(nextStreak) {
  const normalized = normalizeLearningStreak(nextStreak);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('learningStreak', JSON.stringify(normalized));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('learningStreakUpdated', { detail: normalized }));
  }

  return normalized;
}

export function resolveLearningStreak(rawStreak = null, now = new Date()) {
  const streak = normalizeLearningStreak(rawStreak);
  const todayKey = getLocalDateKey(now);
  const lastDate = streak.lastActiveDate ? new Date(streak.lastActiveDate) : null;

  if (!streak.lastActiveDate || Number.isNaN(lastDate?.getTime())) {
    return {
      currentStreak: 1,
      weeklyProgress: EMPTY_STREAK.weeklyProgress.slice(),
      lastActiveDate: todayKey,
    };
  }

  const lastKey = getLocalDateKey(lastDate);
  const diffDays = Math.round((new Date(todayKey) - new Date(lastKey)) / (1000 * 60 * 60 * 24));

  const nextWeeklyProgress = streak.weeklyProgress.slice();
  const dayIndex = (now.getDay() + 6) % 7;
  nextWeeklyProgress[dayIndex] = true;

  if (diffDays === 0) {
    return {
      currentStreak: Math.max(1, streak.currentStreak || 1),
      weeklyProgress: nextWeeklyProgress,
      lastActiveDate: lastKey,
    };
  }

  if (diffDays === 1) {
    return {
      currentStreak: Math.max(1, (streak.currentStreak || 0) + 1),
      weeklyProgress: nextWeeklyProgress,
      lastActiveDate: todayKey,
    };
  }

  return {
    currentStreak: 1,
    weeklyProgress: nextWeeklyProgress,
    lastActiveDate: todayKey,
  };
}

export function filterSolvedEntriesForDate(entries = [], targetDate = new Date()) {
  const comparatorDate = new Date(targetDate);
  const targetKey = getLocalDateKey(comparatorDate);
  const uniqueEntries = dedupeSolvedHistory(Array.isArray(entries) ? entries : []);

  return uniqueEntries.filter((entry) => {
    if (!entry) return false;

    const rawDateValue = entry?.solvedAt || entry?.date;
    if (!rawDateValue) return false;

    const parsedDate = new Date(String(rawDateValue).includes('T') ? rawDateValue : `${rawDateValue}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return false;

    return getLocalDateKey(parsedDate) === targetKey;
  });
}

export function getSolvedHistoryResetTimestamp() {
  try {
    const resetValue = localStorage.getItem('solvedHistoryResetAt');
    if (!resetValue) return null;

    const parsed = new Date(resetValue);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.getTime();
  } catch {
    return null;
  }
}

export function getSolvedHistorySinceReset(entries = [], resetAt = getSolvedHistoryResetTimestamp()) {
  if (!resetAt) {
    return Array.isArray(entries) ? entries : [];
  }

  const cutoff = Number(resetAt);
  if (!Number.isFinite(cutoff)) {
    return Array.isArray(entries) ? entries : [];
  }

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry) return false;

    const value = entry?.solvedAt || entry?.date;
    if (!value) return false;

    const parsed = new Date(String(value).includes('T') ? value : `${value}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    return parsed.getTime() >= cutoff;
  });
}

export function getSolvedHistoryKey(entry = {}) {
  const problemId = entry?.problemId ?? entry?.id ?? entry?.problem?.id ?? entry?.problem?._id;
  if (problemId) {
    return `problem:${String(problemId)}`;
  }

  const title = entry?.problemTitle ?? entry?.title ?? entry?.name ?? entry?.problemTitle ?? '';
  if (title) {
    return `title:${String(title).trim().toLowerCase()}`;
  }

  const slug = entry?.slug ?? entry?.problem?.slug ?? '';
  if (slug) {
    return `slug:${String(slug).trim().toLowerCase()}`;
  }

  return `fallback:${String(entry?.date || entry?.solvedAt || '').trim()}`;
}

export function dedupeSolvedHistory(entries = []) {
  const seen = new Set();

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry) {
      return false;
    }

    const key = getSolvedHistoryKey(entry);
    if (!key || key.startsWith('fallback:') && !String(entry?.date || entry?.solvedAt || '').trim()) {
      return false;
    }

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function replaceSolvedHistory(entries = [], source = 'local') {
  const nextHistory = dedupeSolvedHistory(Array.isArray(entries) ? entries : []);
  const progressValue = Math.max(0, Number(nextHistory.length || 0));

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('solvedQuestionHistory');
    localStorage.removeItem('solvedProgress');
    localStorage.removeItem('lastSolvedMonth');
    localStorage.setItem('solvedQuestionHistory', JSON.stringify(nextHistory));
    localStorage.setItem('solvedProgress', String(progressValue));
    if (source === 'live' && nextHistory.length > 0) {
      localStorage.setItem('lastSolvedMonth', new Date().toLocaleString('en-US', { month: 'short' }));
    }
  }

  return nextHistory;
}

export function getCanonicalSolvedCount({ user, solvedHistory = [], localSolvedProgress = 0 }) {
  const resetAt = getSolvedHistoryResetTimestamp();
  const filteredHistory = getSolvedHistorySinceReset(solvedHistory, resetAt);
  const statCount = Number(user?.stats?.problemsSolved ?? 0);
  const uniqueHistory = dedupeSolvedHistory(filteredHistory);
  const historyCount = uniqueHistory.length;
  const localCount = Number(localSolvedProgress || 0);

  if (resetAt) {
    return Math.max(0, historyCount);
  }

  if (Number.isFinite(statCount) && statCount > 0) {
    return statCount;
  }

  if (historyCount > 0) {
    return historyCount;
  }

  return Math.max(0, localCount);
}

export function buildMonthlySolvedByDay(entries = [], referenceDate = new Date()) {
  const today = new Date(referenceDate);
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const uniqueEntries = dedupeSolvedHistory(Array.isArray(entries) ? entries : []);

  const groupedByDate = new Map();
  for (const entry of uniqueEntries) {
    const rawDate = entry?.solvedAt || entry?.date;
    if (!rawDate) continue;

    const parsedDate = new Date(String(rawDate).includes('T') ? rawDate : `${rawDate}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) continue;
    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month) continue;

    const key = getLocalDateKey(parsedDate);
    const existing = groupedByDate.get(key) || [];
    const problemLabel = entry?.problemTitle || entry?.title || entry?.name || 'Solved Problem';
    if (!existing.includes(problemLabel)) {
      existing.push(problemLabel);
    }
    groupedByDate.set(key, existing);
  }

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const dateKey = getLocalDateKey(date);
    const questions = groupedByDate.get(dateKey) || [];

    return {
      dateKey,
      day: String(date.getDate()),
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      solved: questions.length,
      questions,
    };
  });
}

export function buildCategoryDistribution({ solvedCount = 0, solvedHistory = [], problems = [] }) {
  const categoryCounts = Object.fromEntries(DASHBOARD_CATEGORY_ORDER.map((category) => [category, 0]));
  const resetAt = getSolvedHistoryResetTimestamp();
  const filteredSolvedHistory = getSolvedHistorySinceReset(solvedHistory, resetAt);
  const uniqueSolvedHistory = dedupeSolvedHistory(Array.isArray(filteredSolvedHistory) ? filteredSolvedHistory : []);

  const categoryByTitle = new Map();
  for (const problem of Array.isArray(problems) ? problems : []) {
    if (problem?.title && problem?.category) {
      categoryByTitle.set(problem.title, problem.category);
    }
  }

  for (const entry of uniqueSolvedHistory) {
    const title = entry?.problemTitle?.trim();
    if (!title) continue;

    const category = categoryByTitle.get(title)
      || DASHBOARD_CATEGORY_ORDER[(title.length + (entry?.date ? entry.date.length : 0)) % DASHBOARD_CATEGORY_ORDER.length];

    if (categoryCounts[category] !== undefined) {
      categoryCounts[category] += 1;
    } else {
      categoryCounts.Other += 1;
    }
  }

  const totalSolvedCategories = Object.values(categoryCounts).reduce((sum, value) => sum + value, 0);

  if (totalSolvedCategories === 0 && solvedCount > 0) {
    const weights = [35, 20, 15, 12, 10, 8];
    let remaining = solvedCount;

    for (let i = 0; i < DASHBOARD_CATEGORY_ORDER.length; i += 1) {
      const category = DASHBOARD_CATEGORY_ORDER[i];
      const share = i === DASHBOARD_CATEGORY_ORDER.length - 1
        ? remaining
        : Math.max(0, Math.round((solvedCount * weights[i]) / 100));
      categoryCounts[category] = Math.min(share, remaining);
      remaining -= categoryCounts[category];
    }

    if (remaining > 0) {
      categoryCounts.Other += remaining;
    }
  }

  return DASHBOARD_CATEGORY_ORDER.map((name) => ({
    name,
    value: categoryCounts[name] || 0,
    color: DASHBOARD_CATEGORY_COLORS[name] || DASHBOARD_CATEGORY_COLORS.Other,
  }));
}
