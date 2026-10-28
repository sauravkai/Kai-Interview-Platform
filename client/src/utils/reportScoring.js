export const calculateQuestionScore = (testResult = null) => {
  if (!testResult || typeof testResult !== 'object') return 0;

  if (testResult.status === 'Accepted') return 90;

  const passCount = Number(testResult.passCount ?? 0);
  const totalCount = Number(testResult.totalCount ?? 0);

  if (!Number.isFinite(passCount) || !Number.isFinite(totalCount) || totalCount <= 0) {
    return 0;
  }

  return Math.round((passCount / totalCount) * 100);
};
