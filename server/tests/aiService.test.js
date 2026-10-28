import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateMLCorrectnessScore, generateAIQuestion, generateFinalReport } from '../src/services/aiService.js';

test('generateAIQuestion keeps SQL & DB questions in the SQL domain instead of falling back to Node.js', async () => {
  const result = await generateAIQuestion({ topic: 'SQL & DB', difficulty: 'Senior Architect', questionCount: 1 });

  assert.equal(typeof result.question, 'string');
  assert.match(result.question.toLowerCase(), /index|transaction|sql|database/);
  assert.doesNotMatch(result.question.toLowerCase(), /node\.js|event loop|stream|cluster/);
});

test('generateAIQuestion keeps Java questions in the Java domain', async () => {
  const result = await generateAIQuestion({ topic: 'Java', difficulty: 'Senior Architect', questionCount: 1 });

  assert.equal(typeof result.question, 'string');
  assert.match(result.question.toLowerCase(), /java|thread|volatile|concurrent|equals|hashmap/);
  assert.doesNotMatch(result.question.toLowerCase(), /node\.js|react|database|system design/);
});

test('calculateMLCorrectnessScore accepts semantically correct React reconciliation answers', () => {
  const result = calculateMLCorrectnessScore({
    candidateAnswer:
      'React compares the old and new trees using an O(n) diffing strategy, matches elements by component type, and uses unique keys so list items keep stable identities when reordered.',
    expectedKeyPoints: [
      'Tree comparison O(N) heuristic',
      'Component type matching',
      'Keyed element reordering',
    ],
    topic: 'React.js',
  });

  assert.ok(result.correctnessPercentage >= 70, `Expected a high score, got ${result.correctnessPercentage}`);
  assert.equal(result.matchedConcepts.length, 3);
});

test('generateFinalReport marks interviews above 80 as Accepted', async () => {
  const report = await generateFinalReport({
    interview: { topic: 'React.js' },
    submissions: [{ status: 'Accepted' }, { status: 'Accepted' }],
    sessionScores: [90, 90, 88],
    transcriptHistory: [
      { speaker: 'Candidate', text: 'I explained React reconciliation using a virtual DOM diff and stable keys to preserve list order.' },
      { speaker: 'Candidate', text: 'I also talked through memoization and rendering trade-offs for performance-sensitive UIs.' },
    ],
    topic: 'React.js',
    questionMetrics: [
      { title: 'React fundamentals', score: 90, questionType: 'coding', difficulty: 'Medium', timeSpentSeconds: 90 },
      { title: 'UI rendering trade-offs', score: 90, questionType: 'coding', difficulty: 'Medium', timeSpentSeconds: 90 },
      { title: 'Performance reasoning', score: 88, questionType: 'text', difficulty: 'Medium', timeSpentSeconds: 90 },
    ],
    chatMessages: [],
    interviewerNotes: 'Strong performance across all core topics.',
    totalSessionTime: 450,
  });

  assert.equal(report.overallScore > 80, true);
  assert.equal(report.hiringRecommendation, 'Accepted');
});
