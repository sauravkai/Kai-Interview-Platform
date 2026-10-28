export const filterProblems = (problemBank, { searchQuery = '', selectedCategory = 'All', selectedDifficulty = 'All' } = {}) => {
  const normalizedQuery = (searchQuery || '').trim().toLowerCase();
  const searchTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return problemBank.filter((problem) => {
    const searchableText = [
      problem.title,
      problem.category,
      problem.difficulty,
      ...(Array.isArray(problem.companies) ? problem.companies : []),
    ].join(' ').toLowerCase();

    const matchesPhrase = !normalizedQuery || searchableText.includes(normalizedQuery);
    const matchesAllWords = !searchTokens.length || searchTokens.every((token) => searchableText.includes(token));
    const matchesSearch = matchesPhrase || matchesAllWords;
    const matchesCategory = selectedCategory === 'All' || problem.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'All' || problem.difficulty === selectedDifficulty;

    return matchesSearch && matchesCategory && matchesDifficulty;
  });
};
