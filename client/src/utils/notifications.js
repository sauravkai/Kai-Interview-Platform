const STORAGE_KEY = 'interview_ai_notifications';
const SCHEDULED_INTERVIEWS_KEY = 'interview_ai_scheduled_sessions';

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const isPlaceholderIdentityValue = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return true;

  const lower = normalized.toLowerCase();
  const placeholderTokens = ['tbd', 'na', 'n/a', 'not provided', 'unknown', 'unavailable', 'pending', 'placeholder', 'demo', 'guest'];

  return placeholderTokens.some((token) => {
    const matchText = token.toLowerCase();
    if (lower === matchText) return true;
    if (matchText === 'n/a') return lower.includes('n/a') || lower.includes('na');
    return lower.includes(matchText)
      || lower.includes(`${matchText}_`)
      || lower.includes(`${matchText}-`)
      || lower.includes(`${matchText}.`)
      || lower.includes(`${matchText}@`)
      || lower.includes(`${matchText} `);
  }) || /^(tbd|na|n\/a|not provided|unknown|unavailable|pending|placeholder|demo|guest)$/i.test(normalized);
};

const hasMeaningfulInterviewerIdentity = (item = {}) => {
  const candidates = [
    item?.interviewerEmail,
    item?.interviewer?.email,
    item?.hostEmail,
    item?.interviewerName,
    item?.interviewer?.name,
    item?.hostName,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

  return candidates.some((value) => !isPlaceholderIdentityValue(value));
};

const isMeaningfulNotification = (item = {}) => {
  if (!item || typeof item !== 'object') return false;

  const roomId = String(item.roomId || item._id || item.sessionId || '').trim();
  const title = String(item.title || '').trim();
  const genericTitle = /^(interview invitation|interview scheduled|live room invitation|upcoming interview scheduled|technical round|interview session)$/i.test(title);

  if (!roomId) return false;
  if (genericTitle && !hasMeaningfulInterviewerIdentity(item)) return false;

  return true;
};

const getInterviewEndTimestamp = (interview = {}) => {
  const endCandidates = [
    interview.endAt,
    interview.endsAt,
    interview.endedAt,
    interview.finishedAt,
    interview.completedAt,
    interview.sessionEnd,
    interview.sessionEndsAt,
    interview.expiryAt,
    interview.expiresAt,
  ];

  for (const value of endCandidates) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const startValue = interview.startedAt || interview.scheduledAt || interview.time || interview.createdAt;
  const startTimestamp = startValue ? new Date(startValue).getTime() : NaN;
  const durationMinutes = Number(interview.durationMinutes ?? interview.duration ?? 45);
  if (Number.isFinite(startTimestamp) && Number.isFinite(durationMinutes) && durationMinutes > 0) {
    return startTimestamp + durationMinutes * 60 * 1000;
  }

  return null;
};

const shouldPersistScheduledInterview = (interview = {}) => {
  const roomId = String(interview.roomId || interview._id || interview.sessionId || '').trim();
  const title = String(interview.title || interview.problemTitle || '').trim();
  const candidateEmail = String(interview.candidateEmail || interview.recipientEmail || interview.email || interview.userEmail || '').trim();
  const candidateName = String(interview.candidateName || interview.userName || interview.name || '').trim();
  const interviewerName = String(interview.interviewerName || interview.interviewer?.name || interview.hostName || '').trim();
  const interviewerEmail = String(interview.interviewerEmail || interview.interviewer?.email || interview.hostEmail || '').trim();

  const hasRealCandidate = Boolean(candidateEmail && !isPlaceholderIdentityValue(candidateEmail)) || Boolean(candidateName && !isPlaceholderIdentityValue(candidateName));
  const hasRealInterviewer = Boolean(
    (interviewerEmail && !isPlaceholderIdentityValue(interviewerEmail))
    || (interviewerName && !isPlaceholderIdentityValue(interviewerName))
  );
  const endTimestamp = getInterviewEndTimestamp(interview);
  const isExpired = Number.isFinite(endTimestamp) && endTimestamp < Date.now();

  return Boolean(roomId && hasRealCandidate && hasRealInterviewer && !isExpired);
};

export const getStoredNotifications = () => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(parsed) ? parsed.filter(isMeaningfulNotification) : [];

    if (filtered.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }

    return filtered;
  } catch (error) {
    console.warn('Unable to load notifications from storage.', error);
    return [];
  }
};

export const getNotificationsForUser = (userEmail = '') => {
  const notifications = getStoredNotifications();
  if (!userEmail) return notifications;

  const normalizedEmail = normalizeEmail(userEmail);
  return notifications.filter((item) => {
    const recipientCandidates = [
      item.recipientEmail,
      item.candidateEmail,
      item.email,
      item.userEmail,
    ];

    const hasRecipient = recipientCandidates.some((candidate) => normalizeEmail(candidate));
    if (!hasRecipient) return true;

    return recipientCandidates.some((candidate) => normalizeEmail(candidate) === normalizedEmail);
  });
};

export const pruneExpiredScheduledInterviews = (entries = []) => {
  if (!Array.isArray(entries)) return [];

  const now = Date.now();
  return entries.filter((item) => {
    if (!item || typeof item !== 'object') return false;

    const status = String(item.status || item.state || '').trim().toLowerCase();
    const terminalStatus = ['cancelled', 'canceled', 'completed', 'finished', 'ended', 'closed', 'expired', 'archived', 'done', 'submitted', 'reviewed', 'failed', 'success', 'terminated', 'aborted'].includes(status);
    const explicitEnd = getInterviewEndTimestamp(item);
    const roomId = String(item.roomId || item._id || item.sessionId || '').trim();

    if (!roomId) return false;
    if (terminalStatus) return false;
    if (Number.isFinite(explicitEnd) && explicitEnd < now) return false;

    return true;
  });
};

export const getStoredScheduledInterviews = () => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(SCHEDULED_INTERVIEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(parsed)
      ? pruneExpiredScheduledInterviews(parsed.filter((item) => shouldPersistScheduledInterview(item)))
      : [];

    if (filtered.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      localStorage.setItem(SCHEDULED_INTERVIEWS_KEY, JSON.stringify(filtered));
    }

    return filtered;
  } catch (error) {
    console.warn('Unable to load scheduled interviews from storage.', error);
    return [];
  }
};

export const removeScheduledInterviewFromStorage = (interviewId = '') => {
  if (!interviewId || typeof window === 'undefined') return [];

  const next = pruneExpiredScheduledInterviews(
    getStoredScheduledInterviews().filter((item) => {
      const storedId = String(item?.roomId || item?._id || item?.sessionId || '').trim();
      return storedId !== String(interviewId).trim();
    })
  );

  localStorage.setItem(SCHEDULED_INTERVIEWS_KEY, JSON.stringify(next));
  return next;
};

export const getScheduledInterviewsForUser = (userEmail = '', userName = '') => {
  const normalizedEmail = normalizeEmail(userEmail);
  const normalizedName = String(userName || '').trim().toLowerCase();
  const interviews = getStoredScheduledInterviews();

  if (!normalizedEmail && !normalizedName) return interviews;

  return interviews.filter((item) => {
    const emailMatches = [
      item?.candidateEmail,
      item?.recipientEmail,
      item?.email,
      item?.userEmail,
    ].some((candidate) => normalizeEmail(candidate) === normalizedEmail);

    const nameMatches = [
      item?.candidateName,
      item?.userName,
      item?.name,
    ].some((candidate) => String(candidate || '').trim().toLowerCase() === normalizedName);

    return emailMatches || nameMatches;
  });
};

export const saveScheduledInterviewForUser = (interview = []) => {
  if (!interview || typeof interview !== 'object') return [];
  if (!shouldPersistScheduledInterview(interview)) {
    return getStoredScheduledInterviews();
  }

  const normalizedInterview = {
    ...interview,
    roomId: interview.roomId || interview._id || `room-${Date.now()}`,
    status: interview.status || 'scheduled',
    scheduledAt: interview.scheduledAt || new Date().toISOString(),
  };

  const existing = getStoredScheduledInterviews();
  const next = [normalizedInterview, ...existing.filter((item) => String(item?.roomId || item?._id || '') !== String(normalizedInterview.roomId))].slice(0, 50);

  if (typeof window !== 'undefined') {
    localStorage.setItem(SCHEDULED_INTERVIEWS_KEY, JSON.stringify(next));
  }

  return next;
};

export const addLiveRoomNotification = (roomId, details = {}) => {
  if (!roomId || typeof window === 'undefined') return null;

  const recipientEmail = details.recipientEmail || details.candidateEmail || details.email || '';
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const payload = {
    id: `live-room-${roomId}-${Date.now()}`,
    type: 'live-room-invite',
    title: details.title || 'Live room invitation',
    message:
      details.message ||
      'Your interviewer has shared a live interview room link for you to join.',
    roomId,
    recipientEmail: normalizedRecipientEmail,
    candidateEmail: normalizeEmail(details.candidateEmail || recipientEmail || ''),
    email: normalizedRecipientEmail,
    userEmail: normalizedRecipientEmail,
    candidateName: details.candidateName || '',
    actionUrl: details.actionUrl || `/live-room/${roomId}`,
    createdAt: new Date().toISOString(),
    read: false,
  };

  const existing = getStoredNotifications();
  const next = [payload, ...existing.filter((item) => {
    if (item.roomId !== roomId) return true;
    if (!normalizedRecipientEmail) return false;
    return normalizeEmail(item.recipientEmail || item.candidateEmail || item.email || item.userEmail) !== normalizedRecipientEmail;
  })].slice(0, 12);

  if (details.recipientEmail || details.candidateEmail || details.email) {
    saveScheduledInterviewForUser({
      ...details,
      roomId,
      candidateEmail: details.candidateEmail || details.recipientEmail || details.email || '',
      interviewerEmail: details.interviewerEmail || details.hostEmail || '',
      interviewerName: details.interviewerName || details.hostName || '',
      candidateName: details.candidateName || '',
      title: details.title || 'Live room invitation',
      status: 'scheduled',
      scheduledAt: new Date().toISOString(),
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('live-room-notification', { detail: payload }));
    window.dispatchEvent(new CustomEvent('notification-storage-sync', { detail: next }));

    if (typeof StorageEvent !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(next) }));
    } else {
      window.dispatchEvent(new Event('storage'));
    }
  }

  return payload;
};

export const markNotificationRead = (notificationId) => {
  if (typeof window === 'undefined') return [];

  const next = getStoredNotifications().map((item) =>
    item.id === notificationId ? { ...item, read: true } : item,
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const clearNotifications = () => {
  if (typeof window === 'undefined') return [];
  localStorage.removeItem(STORAGE_KEY);
  return [];
};
