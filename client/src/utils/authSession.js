export const isTokenExpired = (token) => {
  if (!token || typeof token !== 'string') return true;

  try {
    const base64Payload = token.split('.')[1];
    if (!base64Payload) return true;

    const normalized = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded));
    const exp = Number(decoded.exp);

    if (!Number.isFinite(exp)) return true;
    return Date.now() >= exp * 1000;
  } catch (error) {
    return true;
  }
};

export const clearStoredAuth = () => {
  const storage = globalThis.localStorage;
  if (!storage) {
    return;
  }

  const enumeratedKeys = [
    ...Object.keys(storage),
    ...Object.keys(storage.store || {}),
  ];

  const keysToClear = [
    'token',
    'user',
    'previousInterviewReports',
    'cancelledInterviewHistory',
    'solvedQuestionHistory',
    'learningStreak',
    'solvedProgress',
    'solvedHistoryResetAt',
    'lastSolvedMonth',
    ...enumeratedKeys.filter(
      (key) =>
        key.startsWith('previousInterviewReports_') ||
        key.startsWith('cancelledInterviewHistory_') ||
        key.startsWith('aiPracticeReports_')
    ),
  ];

  [...new Set(keysToClear)].forEach((key) => storage.removeItem(key));
};
