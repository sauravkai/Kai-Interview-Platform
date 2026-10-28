export const normalizeViewerRole = (role = 'candidate') => {
  const normalized = String(role ?? '').trim().toLowerCase();
  return normalized || 'candidate';
};

export const canUseScreenShare = (navigatorRef = globalThis.navigator) => {
  const mediaDevices = navigatorRef?.mediaDevices;
  return Boolean(mediaDevices && typeof mediaDevices.getDisplayMedia === 'function');
};

export const getScreenShareUnavailableMessage = (viewerRole = 'candidate') => {
  const role = normalizeViewerRole(viewerRole);
  if (role === 'interviewer') {
    return 'Screen sharing is unavailable in this browser. Please use Chrome or Edge on desktop and allow screen capture.';
  }

  return 'Screen sharing is blocked in this browser. Open the interview in Chrome or Edge on desktop and allow screen capture so the candidate can share the screen.';
};
