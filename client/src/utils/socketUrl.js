export const pickFirstValidUrl = (value) => {
  if (!value) return '';

  const candidates = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return candidates[0] || '';
};

export const getLocalFallbackBackendUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:5000';
  }

  const { hostname, port, protocol } = window.location;
  const frontendPorts = ['3000', '3001', '3002', '3003', '3004', '3005', '4173', '5173'];

  if (['localhost', '127.0.0.1'].includes(hostname) && frontendPorts.includes(port)) {
    return 'http://localhost:5000';
  }

  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

export const normalizeSocketUrl = (value, apiValue) => {
  const candidate = pickFirstValidUrl(value) || pickFirstValidUrl(apiValue) || getLocalFallbackBackendUrl();
  if (!candidate) return getLocalFallbackBackendUrl();

  const trimmed = candidate.trim().replace(/\/$/, '');
  if (!trimmed) return getLocalFallbackBackendUrl();
  if (trimmed.endsWith('/api')) return trimmed.replace(/\/api$/, '');
  if (trimmed.endsWith('/socket.io')) return trimmed.replace(/\/socket.io$/, '');
  return trimmed;
};
