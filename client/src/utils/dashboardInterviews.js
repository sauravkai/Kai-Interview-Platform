export const debounceRefresh = (callback, delay = 250) => {
  let timeoutId = null;

  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(...args);
      timeoutId = null;
    }, delay);
  };
};

const isPlaceholderIdentityValue = (value) => {
  if (value === null || value === undefined) return true;

  const normalized = String(value).trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return true;

  const lower = normalized.toLowerCase();
  return ['tbd', 'na', 'n/a', 'not provided', 'unknown', 'unavailable', 'pending', 'placeholder', 'demo', 'guest'].includes(lower)
    || /^(tbd|na|n\/a|not provided|unknown|unavailable|pending|placeholder|demo|guest)$/i.test(normalized);
};

const getInterviewIdentityValues = (entry = {}) => [
  entry.interviewerEmail,
  entry.interviewer?.email,
  entry.email,
  entry.userEmail,
  entry.hostEmail,
  entry.recipientEmail,
  entry.interviewerId?.email,
  entry.interviewerName,
  entry.interviewer?.name,
  entry.hostName,
  entry.interviewerId?.name,
].filter((value) => value !== null && value !== undefined && String(value).trim() !== '').filter((value) => !isPlaceholderIdentityValue(value));

export const isRealInterviewInvitation = (entry = {}) => {
  if (!entry || typeof entry !== 'object') return false;

  const identityValues = getInterviewIdentityValues(entry);
  if (identityValues.length > 0) {
    return true;
  }

  const title = String(entry.title || entry.problemTitle || '').trim();
  const genericInterviewTitle = /^(interview invitation|interview scheduled|live room invitation|upcoming interview scheduled|technical round|interview session)$/i.test(title);
  if (genericInterviewTitle) {
    return false;
  }

  const roomKey = String(entry.roomId || entry.sessionId || entry._id || '').trim();
  const scheduledAt = entry.scheduledAt || entry.time || entry.startedAt || entry.createdAt;
  return Boolean(roomKey && scheduledAt);
};

const getDurationValueFromString = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  const normalized = value.trim();
  if (!normalized) return null;

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m|h|hr|hrs|hour|hours|sec|secs|second|seconds)?$/i);
  if (match) {
    const amount = Number(match[1]);
    const unit = (match[2] || '').toLowerCase();
    if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(unit)) return amount * 60;
    if (['sec', 'secs', 'second', 'seconds'].includes(unit)) return amount / 60;
    return amount;
  }

  const numericValue = Number(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
};

export const parseInterviewDurationMinutes = (value, fallback = 45) => {
  const parsed = getDurationValueFromString(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed);
  }

  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) && fallbackValue > 0 ? Math.round(fallbackValue) : 45;
};

export const resolveInterviewDisplayTitle = (entry = {}) => {
  const titleCandidates = [
    entry.title,
    entry.interviewTitle,
    entry.problemTitle,
    entry.topic,
    entry.name,
    entry.sessionName,
    entry.subject,
  ];

  for (const candidate of titleCandidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;

    const text = String(candidate).trim();
    if (!text) continue;

    const normalized = text.toLowerCase();
    if (/^(interview invitation|interview scheduled|live room invitation|upcoming interview scheduled|technical round|technical evaluation round|custom technical round|multi-problem technical round|interview session)$/i.test(normalized)) {
      continue;
    }

    return text;
  }

  return 'Interview Session';
};

const getInterviewDurationMinutes = (entry = {}) => {
  const durationValue = parseInterviewDurationMinutes(entry.durationMinutes ?? entry.duration ?? entry.durationMin ?? 45, 45);
  return durationValue;
};

const getInterviewTimeline = (entry = {}) => {
  const startValue = entry.startedAt || entry.scheduledAt || entry.time || entry.createdAt || entry.interviewDate || null;
  const start = startValue ? new Date(startValue).getTime() : NaN;
  const durationMinutes = getInterviewDurationMinutes(entry);
  const explicitEnd = entry.endedAt || entry.finishedAt || entry.completedAt || entry.completedDate || entry.interviewDate || null;
  const derivedEnd = Number.isFinite(start) ? start + durationMinutes * 60 * 1000 : NaN;
  const endTimestamp = explicitEnd ? new Date(explicitEnd).getTime() : derivedEnd;

  return {
    startAt: Number.isFinite(start) ? new Date(start).toISOString() : null,
    endAt: Number.isFinite(endTimestamp) ? new Date(endTimestamp).toISOString() : null,
    durationMinutes,
  };
};

export const normalizeInterviewCard = (entry = {}, fallbackIndex = 0) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const roomId = String(entry.roomId || entry.sessionId || entry._id || `room-${fallbackIndex + 1}`).trim();
  const interviewTimeline = getInterviewTimeline(entry);
  const scheduledAt = interviewTimeline.startAt || entry.scheduledAt || entry.time || entry.startedAt || entry.createdAt || new Date().toISOString();
  const interviewerEmail = entry.interviewerEmail || entry.interviewer?.email || entry.email || entry.userEmail || '';
  const interviewerName = entry.interviewerName || entry.interviewer?.name || entry.interviewer || entry.hostName || 'TBD';

  return {
    ...entry,
    _id: entry._id || entry.sessionId || roomId,
    roomId,
    status: String(entry.status || entry.state || 'scheduled').toLowerCase(),
    scheduledAt,
    startAt: interviewTimeline.startAt || scheduledAt,
    endAt: interviewTimeline.endAt || null,
    durationMinutes: interviewTimeline.durationMinutes,
    title: resolveInterviewDisplayTitle(entry),
    interviewerEmail,
    interviewerName,
    candidateEmail: entry.candidateEmail || entry.recipientEmail || entry.userEmail || '',
    candidateName: entry.candidateName || entry.userName || entry.name || 'Candidate',
  };
};

const getEntryEndTimestamp = (entry = {}) => {
  const endCandidates = [
    entry?.endAt,
    entry?.endsAt,
    entry?.endedAt,
    entry?.finishedAt,
    entry?.completedAt,
    entry?.sessionEnd,
    entry?.sessionEndsAt,
    entry?.expiryAt,
    entry?.expiresAt,
  ];

  for (const value of endCandidates) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const startValue = entry?.startedAt || entry?.scheduledAt || entry?.time || entry?.createdAt;
  const startTimestamp = startValue ? new Date(startValue).getTime() : NaN;
  const durationMinutes = Number(entry?.durationMinutes ?? entry?.duration ?? 45);
  if (Number.isFinite(startTimestamp) && Number.isFinite(durationMinutes) && durationMinutes > 0) {
    return startTimestamp + durationMinutes * 60 * 1000;
  }

  return null;
};

export const getInterviewEntryFingerprint = (entry = {}) => {
  if (!entry || typeof entry !== 'object') return '';

  const title = String(entry.title || entry.problemTitle || entry.interviewTitle || entry.topic || '').trim().toLowerCase();
  const scheduledAt = String(entry.scheduledAt || entry.time || entry.startedAt || entry.createdAt || entry.completedDate || entry.interviewDate || entry.cancelledAt || entry.canceledAt || '').trim();
  const candidate = String(entry.candidateEmail || entry.recipientEmail || entry.userEmail || entry.email || '').trim().toLowerCase();
  const interviewer = String(entry.interviewerEmail || entry.interviewer?.email || '').trim().toLowerCase();
  const identity = String(entry.roomId || entry.sessionId || entry._id || entry.reportId || '').trim();

  return [identity, title, scheduledAt, candidate, interviewer].join('|');
};

export const dedupeInterviewEntries = (entries = []) => {
  const seen = new Set();

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const key = getInterviewEntryFingerprint(entry);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getInterviewSortTimestamp = (entry = {}) => {
  if (!entry || typeof entry !== 'object') return 0;

  const timestampCandidates = [
    entry.completedDate,
    entry.interviewDate,
    entry.completedAt,
    entry.endedAt,
    entry.finishedAt,
    entry.cancelledAt,
    entry.canceledAt,
    entry.scheduledAt,
    entry.startedAt,
    entry.createdAt,
    entry.time,
    entry.updatedAt,
  ];

  const parsed = timestampCandidates
    .map((candidate) => {
      if (!candidate) return NaN;
      const value = new Date(candidate).getTime();
      return Number.isNaN(value) ? NaN : value;
    })
    .filter((value) => Number.isFinite(value));

  return parsed.length > 0 ? Math.max(...parsed) : 0;
};

export const sortMostRecentInterviewEntries = (entries = []) => dedupeInterviewEntries(
  [...(Array.isArray(entries) ? entries : [])].sort((a, b) => getInterviewSortTimestamp(b) - getInterviewSortTimestamp(a))
);

export const getReportDisplayValues = (entry = {}) => {
  const report = entry?.report && typeof entry.report === 'object' ? entry.report : entry;
  const questionMetrics = Array.isArray(report?.questionMetrics)
    ? report.questionMetrics
    : (Array.isArray(entry?.questionMetrics) ? entry.questionMetrics : []);

  const derivedAverage = (values = []) => {
    const numbers = values.filter((value) => Number.isFinite(Number(value)));
    if (!numbers.length) return 0;
    return Math.round(numbers.reduce((total, value) => total + Number(value), 0) / numbers.length);
  };

  const derivedTechnicalSkills = questionMetrics.length > 0
    ? {
        technical: derivedAverage(questionMetrics.map((metric) => Number(metric.score ?? metric.technicalScore ?? 0))),
        communication: derivedAverage(questionMetrics.map((metric) => Number(metric.communicationScore ?? metric.score ?? 0))),
        problemSolving: derivedAverage(questionMetrics.map((metric) => Number(metric.problemSolvingScore ?? metric.score ?? 0))),
        codeQuality: derivedAverage(questionMetrics.map((metric) => Number(metric.codeQualityScore ?? metric.score ?? 0))),
      }
    : (report?.technicalSkills && typeof report.technicalSkills === 'object'
      ? report.technicalSkills
      : {
          technical: Number(report?.technicalScore ?? entry?.technicalScore ?? 0),
          communication: Number(report?.communicationScore ?? entry?.communicationScore ?? 0),
          problemSolving: Number(report?.problemSolvingScore ?? entry?.problemSolvingScore ?? 0),
          codeQuality: Number(report?.codeQualityScore ?? entry?.codeQualityScore ?? 0),
        });

  const skillScores = Object.values(derivedTechnicalSkills || {}).map((value) => Number(value || 0));
  const fromSkills = skillScores.length ? Math.round(skillScores.reduce((total, value) => total + value, 0) / skillScores.length) : 0;
  const directScore = Number(
    report?.overallScore ??
    report?.score ??
    report?.overallAvgScore ??
    entry?.overallScore ??
    entry?.score ??
    entry?.overallAvgScore ??
    0
  );
  const hasValidDerivedSkills = skillScores.length > 0 && skillScores.some((value) => Number.isFinite(value) && value > 0);
  const overallScore = Number.isFinite(directScore) && directScore > 0 && hasValidDerivedSkills && directScore !== fromSkills
    ? fromSkills
    : (Number.isFinite(directScore) && directScore > 0 ? directScore : fromSkills);

  const rating = Number.isFinite(overallScore)
    ? Number((Math.round((overallScore / 100) * 50) / 10).toFixed(1))
    : 0;
  const strengths = Array.isArray(report?.strengths)
    ? report.strengths
    : (Array.isArray(entry?.strengths) ? entry.strengths : []);
  const improvements = Array.isArray(report?.improvements)
    ? report.improvements
    : (Array.isArray(entry?.improvements) ? entry.improvements : []);

  return {
    overallScore,
    rating,
    technicalSkills: derivedTechnicalSkills,
    strengths,
    improvements,
    questionMetrics,
  };
};

export const calculateAveragePreviousReportRating = (reports = []) => {
  const ratings = (Array.isArray(reports) ? reports : [])
    .map((report) => getReportDisplayValues(report).rating)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!ratings.length) return 0;

  const average = ratings.reduce((total, value) => total + value, 0) / ratings.length;
  return Number(average.toFixed(1));
};

export const mergeUpcomingInterviews = (apiInterviews = [], storedInterviews = []) => {
  const mergedMap = new Map();

  const upsert = (entry, fallbackIndex = 0) => {
    if (!isRealInterviewInvitation(entry)) return;

    const normalized = normalizeInterviewCard(entry, fallbackIndex);
    if (!normalized) return;

    const terminalStatus = String(normalized.status || '').toLowerCase();
    const hasTerminalMarker = Boolean(normalized.cancelledAt || normalized.canceledAt || normalized.completedAt || normalized.endedAt || normalized.finishedAt || normalized.closedAt || normalized.expiredAt);
    const endTimestamp = getEntryEndTimestamp(normalized);
    const isExpired = Number.isFinite(endTimestamp) && endTimestamp < Date.now();
    if (['cancelled', 'canceled', 'completed', 'finished', 'ended', 'closed', 'expired', 'archived', 'submitted', 'reviewed', 'failed'].includes(terminalStatus) || hasTerminalMarker || isExpired) {
      return;
    }

    const keySource = String(normalized.roomId || normalized._id || normalized.sessionId || normalized.scheduledAt || normalized.title || '').trim();
    if (!keySource) return;

    const existing = mergedMap.get(keySource);
    if (existing) {
      mergedMap.set(keySource, {
        ...existing,
        ...normalized,
        interviewerEmail: normalized.interviewerEmail || existing.interviewerEmail || '',
        interviewerName: normalized.interviewerName || existing.interviewerName || 'TBD',
        candidateEmail: normalized.candidateEmail || existing.candidateEmail || '',
        candidateName: normalized.candidateName || existing.candidateName || 'Candidate',
        title: normalized.title || existing.title || 'Interview Session',
        status: normalized.status || existing.status || 'scheduled',
        scheduledAt: normalized.scheduledAt || existing.scheduledAt || new Date().toISOString(),
        startAt: normalized.startAt || existing.startAt || normalized.scheduledAt || existing.scheduledAt || new Date().toISOString(),
        endAt: normalized.endAt || existing.endAt || null,
        durationMinutes: normalized.durationMinutes || existing.durationMinutes || 45,
      });
      return;
    }

    mergedMap.set(keySource, normalized);
  };

  const merged = [...(Array.isArray(apiInterviews) ? apiInterviews : []), ...(Array.isArray(storedInterviews) ? storedInterviews : [])]
    .filter(Boolean)
    .forEach((entry, index) => upsert(entry, index));

  return sortMostRecentInterviewEntries(Array.from(mergedMap.values()));
};
