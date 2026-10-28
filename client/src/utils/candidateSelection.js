export const normalizeCandidateOption = (candidate = {}, index = 0) => {
  const rawName = typeof candidate?.name === 'string' ? candidate.name.trim() : '';
  const rawEmail = typeof candidate?.email === 'string' ? candidate.email.trim().toLowerCase() : '';
  const id = String(candidate?._id || candidate?.id || rawEmail || `candidate-${index}`);
  const name = rawName || (rawEmail ? rawEmail.split('@')[0] : 'Candidate');

  return {
    id,
    name,
    email: rawEmail,
    label: rawEmail ? `${name} — ${rawEmail}` : name,
  };
};

export const normalizeCandidateOptions = (candidates = []) => {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => normalizeCandidateOption(candidate, index))
    .filter((candidate) => candidate.name || candidate.email)
    .sort((left, right) => {
      const nameDelta = (left.name || '').localeCompare(right.name || '');
      if (nameDelta !== 0) return nameDelta;
      return (left.email || '').localeCompare(right.email || '');
    });
};

export const resolveSelectedCandidate = (candidates = [], candidateName = '', candidateEmail = '') => {
  const normalizedEmail = String(candidateEmail || '').trim().toLowerCase();
  const normalizedName = String(candidateName || '').trim().toLowerCase();

  if (!candidates.length) {
    return null;
  }

  if (normalizedEmail) {
    const byEmail = candidates.find((candidate) => (candidate.email || '').toLowerCase() === normalizedEmail);
    if (byEmail) return byEmail;
  }

  if (normalizedName) {
    const byName = candidates.find((candidate) => (candidate.name || '').toLowerCase() === normalizedName);
    if (byName) return byName;
  }

  return candidates[0] || null;
};
