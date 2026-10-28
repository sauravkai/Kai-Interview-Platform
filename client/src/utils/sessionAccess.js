export const BLOCKED_SESSION_STATUSES = new Set([
  'completed',
  'finished',
  'cancelled',
  'canceled',
  'ended',
  'closed',
  'inactive',
  'archived',
  'expired',
  'done',
  'submitted',
  'reviewed',
  'failed',
  'success',
  'terminated',
  'aborted',
]);

const normalizeSessionStatus = (session = {}) => {
  const status = session.status ?? session.state ?? session.sessionStatus ?? (session.isActive ? 'live' : 'scheduled');
  const normalized = String(status ?? '').trim().toLowerCase();
  const aliasMap = {
    scheduled: 'scheduled',
    'in progress': 'in-progress',
    'in-progress': 'in-progress',
    in_progress: 'in-progress',
    active: 'live',
    live: 'live',
    ongoing: 'live',
    complete: 'completed',
    completed: 'completed',
    finished: 'finished',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    ended: 'ended',
    closed: 'closed',
    expired: 'expired',
    archived: 'archived',
    done: 'done',
    failed: 'failed',
    success: 'success',
    terminated: 'terminated',
    aborted: 'aborted',
  };

  return aliasMap[normalized] ?? normalized;
};

const hasTerminalSessionMarkers = (session = {}) => {
  if (!session || typeof session !== 'object') return false;

  const explicitMarkers = [
    'completed',
    'isComplete',
    'isCompleted',
    'hasCompleted',
    'isEnded',
    'hasEnded',
    'isCancelled',
    'isCanceled',
    'hasCancelled',
    'hasCanceled',
    'cancelled',
    'canceled',
    'ended',
    'finished',
    'closed',
    'expired',
    'archived',
    'submitted',
    'reviewed',
    'failed',
    'success',
    'terminated',
    'aborted',
  ];

  for (const key of explicitMarkers) {
    const value = session[key];
    if (value === true || value === 'true' || value === 1) return true;
  }

  const dateMarkers = ['completedAt', 'endedAt', 'finishedAt', 'cancelledAt', 'canceledAt', 'closedAt', 'expiredAt'];
  for (const key of dateMarkers) {
    const value = session[key];
    if (value && !Number.isNaN(new Date(value).getTime())) return true;
  }

  const plannedExpiryMarkers = ['sessionEnd', 'sessionEndsAt', 'endAt', 'endsAt', 'endTime', 'expiresAt', 'expiryAt'];
  for (const key of plannedExpiryMarkers) {
    const value = session[key];
    if (value && !Number.isNaN(new Date(value).getTime()) && new Date(value).getTime() < Date.now()) return true;
  }

  return BLOCKED_SESSION_STATUSES.has(normalizeSessionStatus(session));
};

const getExplicitSessionEnd = (session = {}) => {
  if (!session || typeof session !== 'object') return null;

  const endCandidates = [
    session.sessionEnd,
    session.sessionEndsAt,
    session.endAt,
    session.endsAt,
    session.endTime,
    session.expiryAt,
    session.expiresAt,
    session.closedAt,
    session.expiredAt,
    session.completedAt,
    session.finishedAt,
    session.endedAt,
  ];

  for (const value of endCandidates) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const getSessionWindow = (session = {}) => {
  const startValue = session.scheduledAt ?? session.startedAt ?? session.createdAt ?? session.time ?? null;
  const start = startValue ? new Date(startValue).getTime() : null;
  const explicitEnd = getExplicitSessionEnd(session);
  const durationMinutes = Number(session.durationMinutes ?? session.duration ?? 45);
  const derivedEnd = Number.isFinite(start) ? start + (Number.isFinite(durationMinutes) ? durationMinutes * 60 * 1000 : 45 * 60 * 1000) : null;
  const end = Number.isFinite(explicitEnd) ? explicitEnd : derivedEnd;

  return { start, end };
};

const isPlaceholderSessionValue = (value) => {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return true;
  if (normalized === 'placeholder' || normalized === 'pending') return true;
  if (/^(sess|session)[-_]?(pending|demo|placeholder)$/i.test(normalized)) return true;
  if (/^(room|session|interview)[-_]?(placeholder|pending)$/i.test(normalized)) return true;
  return false;
};

const GENERIC_SESSION_TITLES = new Set([
  'arrays',
  'strings',
  'trees',
  'graphs',
  'dp',
  'linked lists',
  'hash maps',
  'stacks/queues',
  'heaps',
  'design',
  'backtracking',
  'other',
  'interview invitation',
  'interview scheduled',
  'live room invitation',
  'upcoming interview scheduled',
  'technical evaluation round',
  'technical round',
  'custom technical round',
  'multi-problem technical round',
  'interview session',
  'interview report',
]);

export const normalizeInterviewTitle = (value, fallback = 'Interview Report') => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (GENERIC_SESSION_TITLES.has(normalized)) return fallback;
  return raw;
};

const hasMeaningfulInterviewMetadata = (session = {}) => {
  const identityFields = [
    session.candidateName,
    session.candidateEmail,
    session.interviewerName,
    session.interviewerEmail,
    session.userName,
    session.ownerName,
  ];

  const titleFields = [
    session.problemTitle,
    session.title,
    session.interviewTitle,
    session.topic,
    session.name,
    session.sessionName,
  ].filter((value) => value !== null && value !== undefined && value !== '');

  const hasIdentity = identityFields.some((value) => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string') return value.trim().length > 0 && !/^(tbd|na|n\/a|not provided|unknown|unavailable|pending|placeholder|demo|guest)$/i.test(value.trim());
    return true;
  });

  const hasRealTitle = titleFields.some((value) => {
    if (typeof value !== 'string') return true;
    const trimmed = value.trim();
    return trimmed.length > 0 && !GENERIC_SESSION_TITLES.has(trimmed.toLowerCase());
  });

  return hasIdentity || hasRealTitle;
};

export const isPlaceholderSession = (session = {}) => {
  if (!session || typeof session !== 'object') return true;

  const titleValues = [session.title, session.interviewTitle, session.problemTitle, session.topic, session.name, session.sessionName]
    .filter((value) => value !== null && value !== undefined && value !== '');
  const normalizedTitle = titleValues.find((value) => typeof value === 'string' && GENERIC_SESSION_TITLES.has(String(value).trim().toLowerCase()));

  if (normalizedTitle && !hasMeaningfulInterviewMetadata(session)) {
    return true;
  }

  if (session.roomId && !/placeholder|pending/i.test(session.roomId)) {
    const hasRealIdentity = Boolean(session.candidateName || session.candidateEmail || session.interviewerName || session.interviewerEmail || session.userName || session.ownerName);
    const hasRealTiming = Boolean(session.scheduledAt || session.startedAt || session.createdAt || session.time);
    const hasRealTitle = Boolean(titleValues.some((value) => typeof value === 'string' && String(value).trim().length > 0 && !GENERIC_SESSION_TITLES.has(String(value).trim().toLowerCase())));
    if (!hasRealIdentity && !hasRealTiming && !hasRealTitle) {
      return true;
    }
    return false;
  }

  const idValues = [session._id, session.id, session.sessionId, session.reportId].filter((value) => value !== null && value !== undefined);
  if (idValues.some((value) => isPlaceholderSessionValue(value))) {
    return true;
  }

  const status = normalizeSessionStatus(session);
  return !status && !session.scheduledAt && !session.startedAt && !session.createdAt && !session.time && !session.problemTitle && !session.title;
};

export const isSessionJoinAllowed = (statusOrSession, scheduledAtValue) => {
  const session = typeof statusOrSession === 'object' && statusOrSession !== null
    ? statusOrSession
    : { status: statusOrSession, scheduledAt: scheduledAtValue };

  const normalized = normalizeSessionStatus(session);
  if (!normalized) return true;
  if (hasTerminalSessionMarkers(session) || BLOCKED_SESSION_STATUSES.has(normalized)) return false;

  const { start, end } = getSessionWindow(session);
  const now = Date.now();

  if (start !== null && Number.isFinite(start) && now < start) return false;
  if (end !== null && Number.isFinite(end) && now > end) return false;
  if (start !== null && Number.isFinite(start) && end === null && now > start + 45 * 60 * 1000) {
    return false;
  }

  return true;
};

export const isSessionVisibleInUpcomingList = (session = {}) => {
  if (!session || typeof session !== 'object') return false;
  if (isPlaceholderSession(session)) return false;
  const sessionType = String(session.type ?? '').trim().toLowerCase();
  if (['login', 'logout'].includes(sessionType)) return false;
  if (session.isActive === false) return false;
  if (hasTerminalSessionMarkers(session)) return false;

  const normalized = normalizeSessionStatus(session);
  const scheduledAtValue = session.scheduledAt || session.startedAt || session.createdAt || session.time;

  if (!normalized) {
    if (scheduledAtValue) {
      const scheduledDate = new Date(scheduledAtValue).getTime();
      if (!Number.isNaN(scheduledDate) && scheduledDate < Date.now()) {
        return false;
      }
    }
    return true;
  }

  if (BLOCKED_SESSION_STATUSES.has(normalized)) return false;

  if (scheduledAtValue) {
    const scheduledDate = new Date(scheduledAtValue).getTime();
    const explicitEnd = getExplicitSessionEnd(session);
    const durationMinutes = Number(session.durationMinutes ?? session.duration ?? 45);
    const endDate = Number.isFinite(explicitEnd)
      ? explicitEnd
      : (Number.isFinite(scheduledDate) ? scheduledDate + durationMinutes * 60 * 1000 : null);
    if (!Number.isNaN(scheduledDate) && endDate !== null && Date.now() > endDate) return false;
  }

  if (!scheduledAtValue && getExplicitSessionEnd(session) !== null && Date.now() > getExplicitSessionEnd(session)) {
    return false;
  }

  return true;
};

export const getUserScopedHistoryKey = (baseKey = 'previousInterviewReports', user = null) => {
  const identity = user?._id || user?.id || user?.email || user?.name || 'guest';
  const normalized = String(identity).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'guest';
  return `${baseKey}_${normalized}`;
};

export const readStoredHistoryReports = (baseKey = 'previousInterviewReports', user = null) => {
  try {
    const key = getUserScopedHistoryKey(baseKey, user);
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export const writeStoredHistoryReports = (baseKey = 'previousInterviewReports', user = null, reports = []) => {
  try {
    const safeReports = Array.isArray(reports) ? reports : [];
    const key = getUserScopedHistoryKey(baseKey, user);
    localStorage.setItem(key, JSON.stringify(safeReports));
    return safeReports;
  } catch {
    return [];
  }
};

const normalizeReportSessionKey = (report = {}) => {
  const candidates = [
    report?.roomId,
    report?.sessionId,
    report?.interviewId,
    report?._id,
    report?.reportId,
    report?.id,
    report?.room,
    report?.session,
    report?.interview,
  ];

  const firstRealValue = candidates.find((value) => value !== null && value !== undefined && String(value).trim() !== '');
  const raw = String(firstRealValue ?? '').trim();

  if (raw) return raw.toLowerCase();

  const fallbackTitle = typeof report?.title === 'string' ? report.title.trim() : '';
  const fallbackCandidates = [
    report?.candidateName,
    report?.candidateEmail,
    report?.interviewerName,
    report?.interviewerEmail,
    report?.problemTitle,
    fallbackTitle,
    report?.completedDate,
    report?.interviewDate,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

  const fallback = fallbackCandidates.map((value) => String(value).trim()).join('|').toLowerCase();
  return fallback || `report_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const dedupeInterviewReports = (reports = []) => {
  const list = Array.isArray(reports) ? reports.filter(Boolean) : [];
  const seen = new Map();

  list.forEach((report) => {
    if (!report || (!report._id && !report.reportId && !report.roomId && !report.sessionId && !report.interviewId)) {
      return;
    }

    const key = normalizeReportSessionKey(report);
    if (!seen.has(key)) {
      seen.set(key, { ...report });
      return;
    }

    const current = seen.get(key);
    const currentSort = current?.updatedAt || current?.completedDate || current?.interviewDate || current?.endedAt || current?.scheduledAt || '';
    const incomingSort = report?.updatedAt || report?.completedDate || report?.interviewDate || report?.endedAt || report?.scheduledAt || '';

    if (incomingSort && (!currentSort || new Date(incomingSort).getTime() >= new Date(currentSort).getTime())) {
      seen.set(key, { ...report });
    }
  });

  return Array.from(seen.values());
};

export const normalizeQuestionCount = (value, fallback = 1) => {
  const parsed = Number(value);
  const safeFallback = Number(fallback);

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  if (Number.isFinite(safeFallback) && safeFallback > 0) {
    return Math.floor(safeFallback);
  }

  return 1;
};

const formatMinutesLabel = (minutes) => {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'N/A';
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
};

const formatSecondsLabel = (seconds) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'N/A';

  if (totalSeconds < 60) return `${totalSeconds} sec`;

  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 60) return `${Math.max(1, Math.round(totalMinutes))} min`;

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = Math.max(1, Math.round(totalMinutes % 60));
  if (remainingMinutes === 60) return `${hours + 1}h`;
  return `${hours}h ${remainingMinutes}m`;
};

export const formatDurationLabel = (reportOrValue, fallback = 'N/A') => {
  if (reportOrValue === null || reportOrValue === undefined || reportOrValue === '') return fallback;

  if (typeof reportOrValue === 'number') {
    return formatSecondsLabel(reportOrValue);
  }

  if (typeof reportOrValue === 'string') {
    const raw = reportOrValue.trim();
    if (!raw) return fallback;
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|m|h|hr|hrs|hour|hours|sec|secs|second|seconds)?$/i);
    if (match) {
      const value = Number(match[1]);
      const unit = (match[2] || '').toLowerCase();
      if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(unit)) return formatMinutesLabel(value * 60);
      if (['m', 'min', 'mins', 'minute', 'minutes'].includes(unit)) return formatMinutesLabel(value);
      if (['sec', 'secs', 'second', 'seconds'].includes(unit)) return formatSecondsLabel(value);
      return formatSecondsLabel(value);
    }
    if (/^\d+:\d{2}(:\d{2})?$/.test(raw)) return raw;
    return raw;
  }

  const report = reportOrValue || {};
  const durationSource = report.duration ?? report.durationMinutes ?? report.durationMin ?? report.completedDuration ?? report.totalSessionTime ?? report.totalTime ?? report.elapsedTime ?? report.sessionDuration ?? report.averageDuration ?? null;

  if (durationSource === null || durationSource === undefined || durationSource === '') return fallback;

  if (typeof durationSource === 'number') {
    if (Object.prototype.hasOwnProperty.call(report, 'durationMinutes') || Object.prototype.hasOwnProperty.call(report, 'durationMin')) {
      return formatMinutesLabel(durationSource);
    }
    if (Object.prototype.hasOwnProperty.call(report, 'totalSessionTime') || Object.prototype.hasOwnProperty.call(report, 'totalTime') || Object.prototype.hasOwnProperty.call(report, 'elapsedTime') || Object.prototype.hasOwnProperty.call(report, 'sessionDuration') || Object.prototype.hasOwnProperty.call(report, 'completedDuration')) {
      return formatSecondsLabel(durationSource);
    }
    return formatSecondsLabel(durationSource);
  }

  if (typeof durationSource === 'string') {
    return formatDurationLabel(durationSource, fallback);
  }

  if (durationSource && typeof durationSource === 'object') {
    const nested = durationSource.minutes ?? durationSource.seconds ?? durationSource.value ?? null;
    if (nested !== null && nested !== undefined) return formatDurationLabel(nested, fallback);
  }

  return fallback;
};

export const resolveParticipantEmail = (record = {}, fallback = 'Not provided') => {
  const candidateKeys = ['candidateEmail', 'interviewerEmail', 'recipientEmail', 'participantEmail', 'email', 'userEmail', 'mail'];
  const nestedKeys = ['candidate', 'interviewer', 'user', 'participant', 'owner', 'candidateId', 'interviewerId', 'userId'];

  const values = [];

  for (const key of candidateKeys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
    if (value && typeof value !== 'string') values.push(String(value).trim());
  }

  for (const key of nestedKeys) {
    const nested = record?.[key];
    if (!nested || typeof nested !== 'object') continue;
    for (const childKey of ['email', 'mail']) {
      const nestedValue = nested[childKey];
      if (typeof nestedValue === 'string' && nestedValue.trim()) values.push(nestedValue.trim());
      if (nestedValue && typeof nestedValue !== 'string') values.push(String(nestedValue).trim());
    }
  }

  return values.find(Boolean) || fallback;
};

export const resolveParticipantName = (record = {}, fallback = 'Candidate') => {
  const candidateKeys = ['candidateName', 'interviewerName', 'participantName', 'name', 'ownerName', 'hostName'];
  const nestedKeys = ['candidate', 'interviewer', 'user', 'participant', 'owner', 'candidateId', 'interviewerId', 'userId'];

  const values = [];

  for (const key of candidateKeys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
    if (value && typeof value !== 'string') values.push(String(value).trim());
  }

  for (const key of nestedKeys) {
    const nested = record?.[key];
    if (!nested || typeof nested !== 'object') continue;
    for (const childKey of ['name']) {
      const nestedValue = nested[childKey];
      if (typeof nestedValue === 'string' && nestedValue.trim()) values.push(nestedValue.trim());
      if (nestedValue && typeof nestedValue !== 'string') values.push(String(nestedValue).trim());
    }
  }

  return values.find(Boolean) || fallback;
};

export const isHistoryStatusVisible = (statusOrSession = {}) => {
  const session = typeof statusOrSession === 'object' && statusOrSession !== null
    ? statusOrSession
    : { status: statusOrSession };

  if (!session || typeof session !== 'object') return false;
  if (isPlaceholderSession(session)) return false;

  const normalized = normalizeSessionStatus(session);
  if (!normalized) {
    return !!(
      session.scheduledAt ||
      session.startedAt ||
      session.createdAt ||
      session.time ||
      session.completedAt ||
      session.finishedAt ||
      session.cancelledAt ||
      session.canceledAt ||
      session.endedAt ||
      session.closedAt ||
      session.expiredAt
    );
  }

  return !['live', 'in-progress', 'in progress', 'ongoing', 'active'].includes(normalized);
};

const getSessionIdentifier = (item = {}) => String(item?._id || item?.roomId || item?.sessionId || item?.id || item?.reportId || '');

const isPlaceholderSessionIdentifier = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return !normalized || ['demo', 'guest', 'null', 'undefined', 'pending', 'placeholder', 'room-1', 'sess_pending'].includes(normalized)
    || /^(sess|session)[-_]?(pending|demo|placeholder)$/i.test(normalized)
    || /^room[-_]?0*1$/i.test(normalized);
};

export const removeCancelledInterviewFromState = (interviews = [], sessions = [], interviewId) => {
  const normalizedId = String(interviewId ?? '');

  const nextInterviews = (Array.isArray(interviews) ? interviews : []).filter((item) => {
    const itemId = getSessionIdentifier(item);
    if (isPlaceholderSessionIdentifier(itemId) && !normalizedId) return false;
    return !normalizedId || itemId !== normalizedId;
  });

  const nextSessions = (Array.isArray(sessions) ? sessions : []).filter((item) => {
    const itemId = getSessionIdentifier(item);
    if (isPlaceholderSessionIdentifier(itemId) && !normalizedId) return false;
    return !normalizedId || itemId !== normalizedId;
  });

  return { interviews: nextInterviews, sessions: nextSessions };
};
