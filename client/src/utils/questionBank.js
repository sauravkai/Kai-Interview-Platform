export const DIFFICULTY_LEVEL_TO_TAGS = Object.freeze({
  Junior: ['easy'],
  'Mid-Level': ['easy', 'medium'],
  Medium: ['easy', 'medium'],
  'Senior Architect': ['medium', 'hard'],
  'Staff Principal': ['hard'],
});

const normalizeDifficultyLevel = (selectedDifficulty = 'Mid-Level') => {
  const normalized = String(selectedDifficulty ?? 'Mid-Level').trim();
  if (!normalized) return 'Mid-Level';

  const aliasMap = {
    junior: 'Junior',
    'junior level': 'Junior',
    medium: 'Mid-Level',
    'mid-level': 'Mid-Level',
    'mid level': 'Mid-Level',
    'senior': 'Senior Architect',
    'senior architect': 'Senior Architect',
    staff: 'Staff Principal',
    'staff principal': 'Staff Principal',
  };

  return aliasMap[normalized.toLowerCase()] || normalized;
};

export function filterQuestionsByDifficulty(questions = [], selectedDifficulty = 'Mid-Level') {
  const canonicalDifficulty = normalizeDifficultyLevel(selectedDifficulty);
  const allowedTags = DIFFICULTY_LEVEL_TO_TAGS[canonicalDifficulty] || DIFFICULTY_LEVEL_TO_TAGS['Mid-Level'];

  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  const normalized = questions.filter((question) => {
    const difficulty = String(question?.difficulty || '').toLowerCase();
    return allowedTags.includes(difficulty);
  });

  return normalized.length > 0 ? normalized : questions;
}
