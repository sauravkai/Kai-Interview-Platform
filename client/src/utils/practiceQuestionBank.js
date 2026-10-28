export const buildMixedPracticeQuestionBank = (questions = [], topic = 'React.js', difficulty = 'Medium') => {
  const bank = Array.isArray(questions) ? questions : [];

  const nonMcqQuestions = bank.filter((question) => question?.type !== 'mcq');
  const templates = [
    {
      type: 'text',
      question: `Explain the practical trade-offs and design decisions behind ${topic} in an interview-ready answer.`,
      difficulty: String(difficulty || 'Medium').toLowerCase(),
      tags: [String(topic).toLowerCase(), 'concept', 'architecture'],
      expectedKeyPoints: ['Core trade-offs', 'Practical implementation choices', 'Failure modes and mitigation'],
    },
    {
      type: 'coding',
      question: `Write a compact implementation sketch for a common ${topic} problem and explain why the approach is appropriate.`,
      difficulty: String(difficulty || 'Medium').toLowerCase(),
      tags: [String(topic).toLowerCase(), 'coding', 'implementation'],
      expectedKeyPoints: ['Correct logic', 'Edge cases', 'Clear reasoning'],
      starterCode: `// Provide a concise ${topic} solution sketch here`,
    },
  ];

  return [...nonMcqQuestions, ...templates].filter((question) => question && question.type !== 'mcq');
};
