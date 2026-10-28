import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
  Trophy,
  Code2,
  Bot,
  Video,
  Clock,
  ArrowRight,
  TrendingUp,
  Award,
  CheckCircle2,
  Calendar,
  Sparkles,
  Sun,
  Moon,
  Flame,
  Target,
  Zap,
  BookOpen,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, BarChart, Bar, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import API from '../../services/api';
import { buildCategoryDistribution, buildMonthlySolvedByDay, dedupeSolvedHistory, filterSolvedEntriesForDate, getCanonicalSolvedCount, getCurrentLearningStreak, normalizeLearningStreak, replaceSolvedHistory, setLearningStreak } from '../../utils/dashboardStats';
import { dedupeInterviewReports, formatDurationLabel, getUserScopedHistoryKey, isHistoryStatusVisible, isPlaceholderSession, isSessionJoinAllowed, isSessionVisibleInUpcomingList, readStoredHistoryReports, removeCancelledInterviewFromState, resolveParticipantName, resolveParticipantEmail } from '../../utils/sessionAccess';
import { getStoredScheduledInterviews, getScheduledInterviewsForUser, removeScheduledInterviewFromStorage } from '../../utils/notifications';
import { debounceRefresh, dedupeInterviewEntries, getReportDisplayValues, mergeUpcomingInterviews, parseInterviewDurationMinutes, resolveInterviewDisplayTitle, sortMostRecentInterviewEntries } from '../../utils/dashboardInterviews';

export const CandidateDashboard = () => {
  const { user, setUser } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [problems, setProblems] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [previousInterviews, setPreviousInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [codeAnalysis, setCodeAnalysis] = useState(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(40); // percentage
  const [isResizing, setIsResizing] = useState(false);
  const [editorHeight, setEditorHeight] = useState(60); // percentage of right panel
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [streakData, setStreakData] = useState({ currentStreak: 0, weeklyProgress: [false, false, false, false, false, false, false] });
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [solvedHistory, setSolvedHistory] = useState([]);
  const [selectedPreviousInterview, setSelectedPreviousInterview] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Calculate learning streak from localStorage
  const calculateStreak = () => {
    const normalized = getCurrentLearningStreak();

    if (!normalized.lastActiveDate) {
      const nextStreak = { ...normalized, currentStreak: 1, lastActiveDate: new Date().toISOString() };
      setLearningStreak(nextStreak);
      return nextStreak;
    }

    const lastActiveDate = new Date(normalized.lastActiveDate);
    if (Number.isNaN(lastActiveDate.getTime())) {
      const nextStreak = { ...normalized, currentStreak: 1, lastActiveDate: new Date().toISOString() };
      setLearningStreak(nextStreak);
      return nextStreak;
    }

    const diffDays = Math.round((new Date() - lastActiveDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 1) {
      const resetStreak = { currentStreak: 0, weeklyProgress: [false, false, false, false, false, false, false], lastActiveDate: new Date().toISOString() };
      setLearningStreak(resetStreak);
      return resetStreak;
    }

    if (normalized.currentStreak === 0 && diffDays === 0) {
      const repairedStreak = { ...normalized, currentStreak: 1 };
      setLearningStreak(repairedStreak);
      return repairedStreak;
    }

    return normalized;
  };

  const resetProgressToZero = () => {
    const freshStreak = {
      currentStreak: 0,
      weeklyProgress: [false, false, false, false, false, false, false],
      lastActiveDate: new Date().toISOString(),
    };

    const resetAt = new Date().toISOString();
    setLearningStreak(freshStreak);
    localStorage.setItem('solvedProgress', '0');
    localStorage.setItem('solvedQuestionHistory', JSON.stringify([]));
    localStorage.setItem('solvedHistoryResetAt', resetAt);
    localStorage.setItem('lastSolvedMonth', '');

    const cachedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (cachedUser && typeof cachedUser === 'object') {
      const nextUser = {
        ...cachedUser,
        stats: {
          ...(cachedUser.stats || {}),
          problemsSolved: 0,
          solvedProblems: 0,
          averageScore: 0,
        },
      };
      localStorage.setItem('user', JSON.stringify(nextUser));
      setUser(nextUser);
    }

    setSolvedHistory([]);
    setStreakData(freshStreak);
  };

  const fetchPreviousInterviews = async () => {
    try {
      const res = await API.get('/interviews/reports');
      const serverReports = res.data?.success && Array.isArray(res.data.data) ? res.data.data : [];
      const localSavedReports = readStoredHistoryReports('previousInterviewReports', user);
      const cancelledReports = readStoredHistoryReports('cancelledInterviewHistory', user);
      const aiPracticeReports = readStoredHistoryReports('aiPracticeReports', user);

      const mergedReports = dedupeInterviewReports([
        ...localSavedReports,
        ...cancelledReports,
        ...aiPracticeReports,
        ...serverReports,
      ].filter((report) => report && !isPlaceholderSession(report)));

      setPreviousInterviews(sortMostRecentInterviewEntries(mergedReports));
    } catch (e) {
      console.warn('Unable to load saved interview reports.', e);
    }
  };

  const handleCancelInterview = async (interview) => {
    const interviewId = interview?._id || interview?.roomId || interview?.sessionId;
    if (!interviewId || !window.confirm(`Cancel this interview for ${interview?.title || 'your upcoming session'}?`)) {
      return;
    }

    try {
      const res = await API.put(`/interviews/${interviewId}/cancel`);
      if (res.data.success) {
        const cancelledEntry = {
          _id: interviewId,
          roomId: interview?.roomId || interviewId,
          title: interview?.title || 'Interview Session',
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          candidateName: interview?.candidateName || user?.name || 'Candidate',
          role: interview?.role || user?.role || 'Software Engineer',
          cancellationMessage: 'This session was canceled by you.',
          cancelReason: 'This session was canceled by you.',
        };

        const storedCancelled = (() => {
          try {
            const key = getUserScopedHistoryKey('cancelledInterviewHistory', user);
            const raw = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(raw) ? raw : [];
          } catch {
            return [];
          }
        })();

        const nextCancelled = [cancelledEntry, ...storedCancelled.filter((item) => String(item._id || item.roomId || '') !== String(interviewId))].slice(0, 20);
        localStorage.setItem(getUserScopedHistoryKey('cancelledInterviewHistory', user), JSON.stringify(nextCancelled));
        removeScheduledInterviewFromStorage(interviewId);
        setPreviousInterviews((prev) => sortMostRecentInterviewEntries([
          ...prev.filter((item) => String(item?._id || item?.reportId || item?.roomId || '') !== String(interviewId)),
          cancelledEntry,
        ]).slice(0, 20));
        window.dispatchEvent(new CustomEvent('interviewReportUpdated'));

        const nextState = removeCancelledInterviewFromState(interviews, [], interviewId);
        setInterviews(nextState.interviews);
        setToastMessage?.('Interview cancelled and removed from active sessions.');
        setTimeout(() => setToastMessage?.(''), 4000);
      }
    } catch (error) {
      console.error('Failed to cancel interview', error);
      setToastMessage?.('Unable to cancel the interview right now.');
      setTimeout(() => setToastMessage?.(''), 4000);
    }
  };

  const handleJoinLiveRoom = (interview) => {
    const interviewId = interview?._id || interview?.roomId || interview?.sessionId;
    if (!interviewId) return;

    if (!isSessionJoinAllowed(interview)) {
      const scheduledAtValue = interview?.scheduledAt || interview?.startedAt || interview?.createdAt || interview?.time;
      const message = scheduledAtValue
        ? `This interview room opens at ${new Date(scheduledAtValue).toLocaleString()}. Please join when the scheduled time begins.`
        : 'This interview room is not available yet.';
      setToastMessage?.(message);
      setTimeout(() => setToastMessage?.(''), 4000);
      return;
    }

    const completedEntry = {
      _id: interviewId,
      roomId: interview?.roomId || interviewId,
      title: interview?.title || 'Interview Session',
      status: 'completed',
      completedDate: new Date().toISOString(),
      interviewDate: interview?.scheduledAt || interview?.startedAt || new Date().toISOString(),
      candidateName: interview?.candidateName || user?.name || 'Candidate',
      role: interview?.role || user?.role || 'Software Engineer',
      problemTitle: interview?.problemTitle || 'Technical Interview',
      totalQuestions: Number(interview?.totalQuestions || interview?.questionsCount || interview?.questionCount || 0),
      duration: interview?.duration || formatDurationLabel(interview?.durationMinutes || interview?.duration || 45),
      reportSummary: 'Interview session joined successfully and archived under previous reports.',
    };

    const storedReports = (() => {
      try {
        const key = getUserScopedHistoryKey('previousInterviewReports', user);
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(raw) ? raw : [];
      } catch {
        return [];
      }
    })();

    const nextReports = [completedEntry, ...storedReports.filter((item) => String(item?._id || item?.roomId || item?.reportId || '') !== String(interviewId))].slice(0, 20);
    localStorage.setItem(getUserScopedHistoryKey('previousInterviewReports', user), JSON.stringify(nextReports));
    setPreviousInterviews((prev) => sortMostRecentInterviewEntries([
      ...prev.filter((item) => String(item?._id || item?.reportId || item?.roomId || '') !== String(interviewId)),
      completedEntry,
    ]).slice(0, 20));

    setInterviews((prev) => prev.filter((item) => {
      const itemId = item?._id || item?.roomId || item?.sessionId;
      return String(itemId || '') !== String(interviewId);
    }));

    window.dispatchEvent(new CustomEvent('interviewReportUpdated'));
    navigate(`/live-room/${interview?.roomId || interviewId}`);
  };

  const refreshDashboardData = async () => {
    try {
      const [probRes, intRes] = await Promise.allSettled([
        API.get('/problems'),
        API.get('/interviews/my'),
      ]);

      if (probRes.status === 'fulfilled' && probRes.value.data.success) {
        setProblems(probRes.value.data.data);
      }

      const serverInterviews = intRes.status === 'fulfilled' && intRes.value.data.success && Array.isArray(intRes.value.data.data)
        ? intRes.value.data.data.filter(isSessionVisibleInUpcomingList)
        : [];

      const storedInterviews = user?.email || user?.name
        ? getScheduledInterviewsForUser(user.email, user.name)
        : getStoredScheduledInterviews();

      const mergedInterviews = sortMostRecentInterviewEntries(
        mergeUpcomingInterviews(serverInterviews, storedInterviews).filter(isSessionVisibleInUpcomingList)
      );

      setInterviews(mergedInterviews);
    } catch (e) {
      console.warn('API connection offline, utilizing initial seed problem set.', e);
    } finally {
      setLoading(false);
    }
  };

  const debouncedDashboardRefresh = React.useRef(
    debounceRefresh(() => {
      refreshDashboardData();
      fetchPreviousInterviews();
    }, 250)
  );

  useEffect(() => {
    const syncStreak = () => setStreakData(calculateStreak());
    const onLearningStreakUpdated = () => syncStreak();

    syncStreak();
    debouncedDashboardRefresh.current();

    const handleReportUpdate = () => {
      debouncedDashboardRefresh.current();
    };

    const handleInterviewScheduled = () => {
      debouncedDashboardRefresh.current();
    };

    window.addEventListener('learningStreakUpdated', onLearningStreakUpdated);
    window.addEventListener('interviewReportUpdated', handleReportUpdate);
    window.addEventListener('live-room-notification', handleInterviewScheduled);
    window.addEventListener('notification-storage-sync', handleInterviewScheduled);
    window.addEventListener('storage', handleInterviewScheduled);

    if (socket) {
      socket.on('interview-scheduled', handleInterviewScheduled);
    }

    return () => {
      window.removeEventListener('learningStreakUpdated', onLearningStreakUpdated);
      window.removeEventListener('interviewReportUpdated', handleReportUpdate);
      window.removeEventListener('live-room-notification', handleInterviewScheduled);
      window.removeEventListener('notification-storage-sync', handleInterviewScheduled);
      window.removeEventListener('storage', handleInterviewScheduled);
      if (socket) {
        socket.off('interview-scheduled', handleInterviewScheduled);
      }
    };
  }, [socket, user?.email]);

  const performanceMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const firstName = user?.name?.split(' ')[0] || 'Candidate';
  const readinessScore = user?.stats?.averageScore ?? 0;
  const canonicalSolvedEntries = Array.isArray(solvedHistory) && solvedHistory.length > 0
    ? solvedHistory
    : (() => {
        try {
          const storedHistory = JSON.parse(localStorage.getItem('solvedQuestionHistory') || '[]');
          return Array.isArray(storedHistory) ? storedHistory : [];
        } catch {
          return [];
        }
      })();
  const solvedCount = getCanonicalSolvedCount({
    user,
    solvedHistory: canonicalSolvedEntries,
    localSolvedProgress: Number(localStorage.getItem('solvedProgress') || 0),
  });
  const completedInterviewRecords = [...(Array.isArray(interviews) ? interviews : []), ...(Array.isArray(previousInterviews) ? previousInterviews : [])].filter((entry) => {
    if (!entry || isPlaceholderSession(entry)) return false;
    return isHistoryStatusVisible(entry);
  });
  const interviewCount = completedInterviewRecords.length || Number(user?.stats?.interviewsCompleted || 0);
  const completionPercent = Math.min(100, Math.max(0, readinessScore));
  const categoryDistribution = buildCategoryDistribution({ solvedCount: canonicalSolvedEntries.length || solvedCount, solvedHistory: canonicalSolvedEntries, problems });

  useEffect(() => {
    let isMounted = true;

    const loadSolvedHistory = async () => {
      const resetAt = localStorage.getItem('solvedHistoryResetAt');
      const localHistory = (() => {
        try {
          return JSON.parse(localStorage.getItem('solvedQuestionHistory') || '[]');
        } catch {
          return [];
        }
      })();

      if (resetAt) {
        if (isMounted) { setSolvedHistory(localHistory); }
        return;
      }

      try {
        const res = await API.get('/submissions/my');
        const acceptedEntries = Array.isArray(res?.data?.data)
          ? res.data.data.filter((item) => item.status === 'Accepted')
          : [];

        const history = acceptedEntries
          .map((item) => {
            const createdAt = item.createdAt ? new Date(item.createdAt) : null;
            if (!createdAt || Number.isNaN(createdAt.getTime())) return null;

            return {
              date: createdAt.toISOString().slice(0, 10),
              problemTitle: item.problemId?.title || item.problemTitle || 'Solved Problem',
              solvedAt: createdAt.toISOString(),
            };
          })
          .filter(Boolean);

        const mergedHistory = dedupeSolvedHistory([...localHistory, ...history].filter((entry) => entry?.date && entry?.problemTitle));
        const uniqueHistoryCount = mergedHistory.length;
        const canonicalTotal = Math.max(Number(user?.stats?.problemsSolved ?? 0), uniqueHistoryCount);

        if (canonicalTotal > 0) {
          replaceSolvedHistory(mergedHistory, 'live');
        } else {
          replaceSolvedHistory([], 'local');
        }

        if (isMounted) { setSolvedHistory(mergedHistory); }
      } catch (error) {
        try {
          const storedHistory = JSON.parse(localStorage.getItem('solvedQuestionHistory') || '[]');
          const dedupedStoredHistory = dedupeSolvedHistory(Array.isArray(storedHistory) ? storedHistory : []);
          const uniqueHistoryCount = dedupedStoredHistory.length;
          const canonicalTotal = Math.max(Number(user?.stats?.problemsSolved ?? 0), uniqueHistoryCount);

          if (canonicalTotal > 0) {
            replaceSolvedHistory(dedupedStoredHistory, 'local');
          } else {
            replaceSolvedHistory([], 'local');
          }

          if (isMounted) setSolvedHistory(dedupedStoredHistory);
        } catch {
          if (isMounted) setSolvedHistory([]);
        }
      }
    };

    loadSolvedHistory();
    return () => { isMounted = false; };
  }, [user?.id, user?.stats?.problemsSolved]);

  const getMonthSolvedMap = (entries = canonicalSolvedEntries) => {
    const map = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const solvedAt = entry?.solvedAt || entry?.date;
      const date = solvedAt ? new Date(solvedAt) : null;
      if (!date || Number.isNaN(date.getTime())) continue;

      const monthName = date.toLocaleString('en-US', { month: 'short' });
      const currentCount = map.get(monthName) || 0;
      map.set(monthName, currentCount + 1);
    }
    return map;
  };

  const performanceData = performanceMonths.map((month) => {
    const monthSolvedCount = getMonthSolvedMap().get(month) || 0;

    return {
      month,
      questionsAttempted: monthSolvedCount,
      questionTag: monthSolvedCount > 0 ? `Solved ${monthSolvedCount} problem${monthSolvedCount > 1 ? 's' : ''} in ${month}` : 'No activity',
    };
  });

  const currentMonthSolvedData = buildMonthlySolvedByDay(canonicalSolvedEntries, new Date());

  const problemCategories = [
    { id: 'All', name: 'All Problems', icon: Code2 },
    { id: 'Arrays', name: 'Arrays & Hashing', icon: BarChart3 },
    { id: 'Strings', name: 'Strings', icon: BookOpen },
    { id: 'Linked Lists', name: 'Linked Lists', icon: Target },
    { id: 'Trees', name: 'Trees & Graphs', icon: Zap },
    { id: 'DP', name: 'Dynamic Programming', icon: Sparkles },
  ];

  const filteredProblems = selectedCategory === 'All'
    ? problems
    : problems.filter((problem) => problem.category === selectedCategory);

  const getScoreColor = (score = 0) => {
    if (score >= 80) return 'bg-emerald-100 text-emerald-700';
    if (score >= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-rose-100 text-rose-700';
  };

  const formatReportDateTime = (value) => {
    if (!value) return 'Not available';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const openReport = (report) => {
    setSelectedPreviousInterview(report);
    setShowReportModal(true);
  };

  const selectedReportDetails = selectedPreviousInterview || {};

  return (
    <div className={`space-y-8 w-full px-0 py-8 min-h-screen ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {/* Welcome Banner */}
      <div className={`p-8 rounded-3xl border relative overflow-hidden ${isDark ? 'glass-panel bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-lg'}`}>
        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          className={`absolute top-4 right-4 p-2 rounded-lg ${isDark ? 'bg-slate-800 text-slate-300 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'} transition-colors`}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300' : 'bg-indigo-100 border border-indigo-200 text-indigo-700'}`}>
              <Sparkles className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} /> Candidate Mastery Portal
            </div>
            <h1 className={`text-3xl font-heading font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Welcome back, <span className={`gradient-text ${isDark ? '' : 'bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent'}`}>{firstName}</span>!
            </h1>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Your overall readiness score is <strong className={`font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{readinessScore || 0} / 100</strong>. Continue building momentum with AI-led practice and interview prep.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/ai-interview/practice"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-purple-500/25 transition-all"
            >
              <Bot className="w-4 h-4" /> AI Voice Practice
            </Link>
            <Link
              to="/practice"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all ${isDark ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/25' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'}`}
            >
              <Code2 className="w-4 h-4" /> Coding IDE
            </Link>
          </div>
        </div>
      </div>

      {/* Performance Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress Over Time Chart */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
          <h3 className={`text-base font-heading font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <TrendingUp className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} /> Performance Progress
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
              <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={12} />
              <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={12} label={{ value: 'Questions Attempted', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  borderRadius: '8px'
                }}
                formatter={(value, name, props) => [
                  `${value} questions`,
                  props.payload.questionTag
                ]}
              />
              <Line type="monotone" dataKey="questionsAttempted" stroke={isDark ? '#818cf8' : '#6366f1'} strokeWidth={2} dot={{ fill: isDark ? '#818cf8' : '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Solved Problems By Date Chart */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
          <h3 className={`text-base font-heading font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Target className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} /> Solved Problems This Month
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={currentMonthSolvedData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
              <XAxis dataKey="day" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
              <YAxis allowDecimals={false} stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(168, 85, 247, 0.08)' : 'rgba(124, 58, 237, 0.08)' }}
                contentStyle={{
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  color: isDark ? '#e2e8f0' : '#0f172a',
                }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload;
                  return item ? item.label : 'Date';
                }}
                formatter={(value, name, props) => {
                  const questions = props.payload?.questions || [];
                  if (!questions.length) {
                    return [`0 problems`, 'Solved'];
                  }

                  const questionText = questions.join(', ');
                  return [`${value} problem${value === 1 ? '' : 's'}: ${questionText}`, 'Solved'];
                }}
              />
              <Bar dataKey="solved" radius={[8, 8, 0, 0]} fill={isDark ? '#a855f7' : '#7c3aed'} />
            </BarChart>
          </ResponsiveContainer>

          <div className={`mt-4 space-y-2 max-h-32 overflow-y-auto pr-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {currentMonthSolvedData.filter((entry) => entry.solved > 0).length > 0 ? (
              currentMonthSolvedData
                .filter((entry) => entry.solved > 0)
                .map((entry) => (
                  <div key={entry.dateKey} className={`flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 ${isDark ? 'bg-slate-800/80' : 'bg-slate-100'}`}>
                    <span className="font-medium">{entry.label}</span>
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {entry.solved} solved • {entry.questions.join(', ')}
                    </span>
                  </div>
                ))
            ) : (
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No problems solved yet this month.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Category Distribution & Streak */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Distribution */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
          <h3 className={`text-base font-heading font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <PieChart className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} /> Problem Categories
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <RechartsPieChart>
              <Pie data={categoryDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                {categoryDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: isDark ? '#1e293b' : '#ffffff', 
                  border: isDark ? '#334155' : '#e2e8f0',
                  borderRadius: '8px'
                }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {categoryDistribution.slice(0, 3).map((cat) => (
              <div key={cat.name} className="text-center">
                <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ backgroundColor: cat.color }}></div>
                <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Learning Streak */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
          <h3 className={`text-base font-heading font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Flame className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} /> Learning Streak
          </h3>
          <div className="text-center">
            <div className={`text-5xl font-heading font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{streakData.currentStreak}</div>
            <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Day Streak 🔥</div>
            <div className={`mt-4 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              {streakData.currentStreak > 0 ? 'Keep it up! You\'re on fire!' : 'Start solving problems to build your streak!'}
            </div>
          </div>
          <div className="flex justify-center gap-1 mt-4">
            {streakData.weeklyProgress.map((completed, i) => (
              <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${completed ? (isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600') : (isDark ? 'bg-slate-800 text-slate-600' : 'bg-slate-100 text-slate-400')}`}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
          <h3 className={`text-base font-heading font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            <Zap className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} /> Quick Stats
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Problems Solved</span>
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{solvedCount}</span>
            </div>
            <div className={`w-full h-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, solvedCount * 2)}%` }}></div>
            </div>
            <div className="flex justify-between items-center">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Interviews Attended</span>
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{interviewCount}</span>
            </div>
            <div className={`w-full h-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, interviewCount * 10)}%` }}></div>
            </div>
            <div className="flex justify-between items-center">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Readiness</span>
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{completionPercent}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Grid: Scheduled Interviews & Recommended Practice Problems */}
        {/* Left Column: Scheduled & Past Interviews */}
        <div className="lg:col-span-7 space-y-6">
          <div className={`p-6 rounded-2xl border space-y-4 ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
            <div className={`flex items-center justify-between pb-3 ${isDark ? 'border-b border-slate-800' : 'border-b border-slate-200'}`}>
              <h3 className={`text-base font-heading font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Calendar className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} /> Upcoming & Live Interviews
              </h3>
            </div>

            <div className="space-y-3">
              {interviews.filter(isSessionVisibleInUpcomingList).length === 0 ? (
                <div className={`p-4 rounded-xl border border-dashed ${isDark ? 'border-slate-700 bg-slate-900/60 text-slate-400' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>
                  No interviews are scheduled yet. Your upcoming sessions will appear here.
                </div>
              ) : (
                interviews.filter(isSessionVisibleInUpcomingList).map((item, idx) => {
                  const roomId = item.roomId || item.room || `room-${idx + 1}`;
                  const titleStr = resolveInterviewDisplayTitle(item);
                  const durationMinutes = parseInterviewDurationMinutes(item.durationMinutes ?? item.duration ?? item.durationMin ?? 45, 45);
                  const durationStr = Number.isFinite(durationMinutes) && durationMinutes > 0 ? `${durationMinutes} min` : 'Scheduled';
                  const sessionId = item.sessionId || `sess_${item._id?.slice(-8) || 'pending'}`;
                  const interviewerNameValue = item.interviewerName || item.interviewer?.name || item.interviewerId?.name || item.interviewer || 'TBD';
                  const interviewerEmailValue = item.interviewerEmail || item.interviewer?.email || item.interviewerId?.email || 'Not provided';
                  const questionCountValue = Number(item.problems?.length ?? item.questionCount ?? item.totalQuestions ?? 0);
                  const scheduledDateValue = item.startAt || item.scheduledAt || item.startTime || item.time || item.createdAt;
                  const endDateValue = item.endAt || item.endedAt || item.finishedAt || item.completedAt || (scheduledDateValue ? new Date(new Date(scheduledDateValue).getTime() + (Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes * 60 * 1000 : 0)).toISOString() : null);
                  const isCompleted = item.status?.toLowerCase() === 'completed';
                  const timerDisplay = isCompleted ? (item.completedDuration || 'Completed') : (item.demoTimer || (scheduledDateValue ? new Date(scheduledDateValue).toLocaleString() : 'Scheduled'));
                  const timerLabel = isCompleted ? 'Duration' : 'Starts in';

                  return (
                    <div key={item._id || idx} className={`p-4 rounded-xl border hover:border-indigo-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200 hover:border-indigo-300'}`}>
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${isCompleted ? (isDark ? 'bg-slate-500/20 text-slate-400' : 'bg-slate-100 text-slate-600') : (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}`}>
                            {item.status || 'Scheduled'}
                          </span>
                          <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{durationStr}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>
                            Session ID: {sessionId}
                          </span>
                        </div>
                        <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{titleStr}</h4>
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className={`w-3 h-3 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{timerLabel}:</span>
                          <span className={`font-mono font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                            {timerDisplay}
                          </span>
                        </div>

                        {/* Additional metadata: number of questions, interviewer name/email, scheduled date/time */}
                        <div className="mt-1 text-xs space-y-0.5">
                          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Questions: <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{questionCountValue > 0 ? questionCountValue : 'N/A'}</span>
                          </div>
                          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Interviewer: <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{interviewerNameValue}</span>
                          </div>
                          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Email: <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{interviewerEmailValue}</span>
                          </div>
                          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Start: <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{scheduledDateValue ? new Date(scheduledDateValue).toLocaleString() : 'Not scheduled'}</span>
                          </div>
                          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            End: <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{endDateValue ? new Date(endDateValue).toLocaleString() : 'Not scheduled'}</span>
                          </div>
                          <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            Duration: <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{durationMinutes > 0 ? `${durationMinutes} min` : 'Not set'}</span>
                          </div>
                        </div>
                      </div>

                      {isCompleted ? (
                        <button
                          disabled
                          className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all cursor-not-allowed ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-300 text-slate-500'}`}
                        >
                          <Video className="w-3.5 h-3.5" /> View Recording
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelInterview(item)}
                            className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-all"
                          >
                            Cancel
                          </button>
                          {isSessionJoinAllowed(item) ? (
                            <button
                              type="button"
                              onClick={() => handleJoinLiveRoom(item)}
                              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all"
                            >
                              <Video className="w-3.5 h-3.5" /> Join Live Room
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2.5 py-2 rounded-xl border border-slate-200">
                              Opens {new Date(item.scheduledAt || item.startedAt || item.createdAt || item.time).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              <div className={`p-4 rounded-xl border hover:border-purple-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200 hover:border-purple-300'}`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                      AI Practice
                    </span>
                    <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ready</span>
                  </div>
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{firstName ? `${firstName}'s Interview Practice` : 'Interview Practice'}</h4>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Use the practice workspace to continue improving your readiness.</p>
                </div>

                <Link
                  to="/ai-interview/practice"
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all"
                >
                  <Bot className="w-3.5 h-3.5" /> Start Practice
                </Link>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-2xl border ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
            <div className={`flex items-center justify-between pb-3 ${isDark ? 'border-b border-slate-800' : 'border-b border-slate-200'}`}>
              <h3 className={`text-base font-heading font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Award className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} /> Previous Interview Reports
              </h3>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold ${isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                {previousInterviews.length} Completed
              </span>
            </div>

            <div className="space-y-3 pt-4">
              {previousInterviews.length === 0 ? (
                <div className={`p-4 rounded-xl border border-dashed ${isDark ? 'border-slate-700 bg-slate-900/60 text-slate-400' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>
                  No completed interviews have been saved yet. Your scorecards will appear here once a session is finished.
                </div>
              ) : (
                previousInterviews.map((report, index) => {
                  const isCancelled = String(report.status || '').toLowerCase() === 'cancelled';
                  const cancellationText = report.cancellationMessage || report.cancelReason || report.description || 'This session was canceled by you.';
                  const interviewerName = resolveParticipantName(report, 'Interviewer');
                  const interviewerEmail = resolveParticipantEmail(report, 'Not provided');
                  const sessionDateTime = formatReportDateTime(report.completedDate || report.interviewDate || report.scheduledAt || report.createdAt || report.startedAt || report.time || report.cancelledAt || report.canceledAt);
                  const totalQuestions = Number(report.questionsAsked || report.totalQuestions || report.questionMetrics?.length || 0);
                  const reportDisplay = getReportDisplayValues(report);
                  const normalizedScore = Number(reportDisplay.overallScore || 0);
                  const normalizedRating = Number(reportDisplay.rating || 0).toFixed(1);

                  return (
                    <button
                      key={report._id || report.reportId || index}
                      type="button"
                      onClick={() => openReport(report)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${isDark ? 'bg-slate-900/80 border-slate-800 hover:border-purple-500/40' : 'bg-slate-50 border-slate-200 hover:border-purple-300'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${isCancelled ? 'bg-rose-500/15 text-rose-600' : isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                              {isCancelled ? 'Cancelled' : 'Completed'}
                            </span>
                            <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {sessionDateTime}
                            </span>
                          </div>
                          <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {report.title || report.interviewTitle || report.topic || report.problemTitle || 'Interview Report'}
                          </h4>
                          {isCancelled && (
                            <p className={`mt-2 text-xs font-semibold ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                              {cancellationText}
                            </p>
                          )}

                          <div className={`mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            <div><span className="font-semibold uppercase tracking-wide">Interviewer:</span> {interviewerName}</div>
                            <div><span className="font-semibold uppercase tracking-wide">Email:</span> {interviewerEmail}</div>
                            <div><span className="font-semibold uppercase tracking-wide">Date/Time:</span> {sessionDateTime}</div>
                            <div><span className="font-semibold uppercase tracking-wide">Questions:</span> {totalQuestions}</div>
                          </div>

                          <div className={`mt-2 flex items-center gap-3 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <span>{formatDurationLabel(report, 'N/A')}</span>
                            <span>•</span>
                            <span>{report.questionsAsked || report.totalQuestions || 0} questions</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          {isCancelled ? (
                            <div className="px-3 py-1 rounded-lg text-sm font-bold bg-rose-100 text-rose-700">Cancelled</div>
                          ) : (
                            <div className={`px-3 py-1 rounded-lg text-sm font-bold ${normalizedScore >= 80 ? 'bg-emerald-500 text-white' : normalizedScore >= 60 ? 'bg-amber-500 text-white' : 'bg-slate-500 text-white'}`}>
                              {normalizedScore}%
                            </div>
                          )}
                          {!isCancelled && (
                            <div className={`inline-flex items-center gap-1 text-[10px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {normalizedRating}/5.0
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Problem Bank List */}
        <div className="lg:col-span-5 space-y-6">
          <div className={`p-6 rounded-2xl border space-y-4 ${isDark ? 'glass-panel bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-md'}`}>
            <div className={`flex items-center justify-between pb-3 ${isDark ? 'border-b border-slate-800' : 'border-b border-slate-200'}`}>
              <h3 className={`text-base font-heading font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Code2 className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} /> Recommended Problems
              </h3>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {problemCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white'
                      : isDark
                        ? 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  <cat.icon className="w-3 h-3" />
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {filteredProblems.length === 0 ? (
                <div className={`p-3.5 rounded-xl border border-dashed ${isDark ? 'border-slate-700 bg-slate-900/60 text-slate-400' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>
                  No recommended problems are available yet.
                </div>
              ) : (
                filteredProblems.map((prob) => (
                  <Link
                    key={prob._id}
                    to={`/practice?problem=${prob.slug}`}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all group ${isDark ? 'bg-slate-900/60 border-slate-800 hover:border-indigo-500/40' : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-white'}`}
                  >
                    <div>
                      <h4 className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700 group-hover:text-indigo-600'}`}>
                        {prob.title}
                      </h4>
                      <span className={`text-[10px] font-mono mt-0.5 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{prob.category}</span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        prob.difficulty === 'Easy'
                          ? isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                          : prob.difficulty === 'Medium'
                          ? isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
                          : isDark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {prob.difficulty}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {showReportModal && selectedPreviousInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h3 className="text-lg font-heading font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-purple-600" /> Interview Report
                </h3>
                <p className="text-xs text-slate-600">Detailed evaluation and feedback</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-900 text-base font-bold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-slate-900 mb-1">
                      {selectedPreviousInterview.title || selectedPreviousInterview.topic || 'Interview Report'}
                    </h4>
                    <p className="text-xs text-slate-600 mb-2">
                      Candidate: <strong className="text-slate-800">{selectedPreviousInterview.candidateName || user?.name || 'Candidate'}</strong> ({selectedPreviousInterview.role || 'Software Engineer'})
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      <span className="font-mono">{selectedPreviousInterview.completedDate || selectedPreviousInterview.interviewDate || 'Recently'}</span>
                      <span>•</span>
                      <span>{formatDurationLabel(selectedPreviousInterview, 'N/A')}</span>
                      <span>•</span>
                      <span className="font-mono">{selectedPreviousInterview.sessionId || selectedPreviousInterview.roomId || 'session'}</span>
                    </div>
                  </div>
                  {(() => {
                    const reportDisplay = getReportDisplayValues(selectedPreviousInterview);
                    const normalizedScore = Number(reportDisplay.overallScore || 0);
                    return (
                      <div className={`px-4 py-2 rounded-xl text-2xl font-bold ${getScoreColor(normalizedScore)}`}>
                        {normalizedScore}%
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div>
                <h5 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" /> Technical Skills Assessment
                </h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(selectedReportDetails.technicalSkills || {}).map(([skill, score]) => (
                    <div key={skill} className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-medium capitalize mb-1">{skill}</div>
                      <div className="text-xl font-bold text-slate-900">{Number(score || 0)}%</div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                        <div
                          className={`h-1.5 rounded-full ${Number(score || 0) >= 90 ? 'bg-emerald-500' : Number(score || 0) >= 80 ? 'bg-blue-500' : Number(score || 0) >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, Number(score || 0))}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h5 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-purple-600" /> Question Details
                </h5>
                <div className="space-y-3">
                  {(selectedReportDetails.questionMetrics || []).length === 0 ? (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600">No question data was captured for this interview.</div>
                  ) : (
                    (selectedReportDetails.questionMetrics || []).map((metric, idx) => (
                      <div key={`${metric.question || idx}-${idx}`} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-slate-900">Q{idx + 1}: {metric.question || metric.title || 'Question'}</span>
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{metric.score ?? 0}%</span>
                        </div>
                        <div className="text-[11px] text-slate-600 whitespace-pre-wrap">
                          <span className="font-semibold text-slate-800">Candidate Answer:</span> {metric.answer || metric.candidateAnswer || metric.response || 'No answer captured'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h5 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" /> Feedback Summary
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                    <h6 className="text-xs font-bold text-emerald-700 mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Strengths
                    </h6>
                    <ul className="space-y-1">
                      {((selectedReportDetails.feedback?.strengths || []) || []).length === 0 ? (
                        <li className="text-xs text-emerald-800">No strengths captured.</li>
                      ) : (
                        (selectedReportDetails.feedback?.strengths || []).map((strength, idx) => (
                          <li key={idx} className="text-xs text-emerald-800 flex items-start gap-1">
                            <span className="text-emerald-500 mt-0.5">•</span>
                            {strength}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                    <h6 className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                      <Target className="w-3 h-3" /> Areas for Improvement
                    </h6>
                    <ul className="space-y-1">
                      {((selectedReportDetails.feedback?.improvements || []) || []).length === 0 ? (
                        <li className="text-xs text-amber-800">No improvement notes captured.</li>
                      ) : (
                        (selectedReportDetails.feedback?.improvements || []).map((improvement, idx) => (
                          <li key={idx} className="text-xs text-amber-800 flex items-start gap-1">
                            <span className="text-amber-500 mt-0.5">•</span>
                            {improvement}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" /> Interview Notes & Chat
                </h5>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h6 className="text-xs font-bold text-slate-900 mb-2">Interviewer Notes</h6>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{selectedReportDetails.interviewerNotes || 'No notes were saved for this interview.'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h6 className="text-xs font-bold text-slate-900 mb-2">Chat Transcript</h6>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {(selectedReportDetails.chatMessages || []).length === 0 ? (
                        <p className="text-xs text-slate-600">No chat transcript captured.</p>
                      ) : (
                        (selectedReportDetails.chatMessages || []).map((msg, idx) => (
                          <div key={`${msg.sender || 'message'}-${idx}`} className="rounded-lg bg-white border border-slate-200 p-2">
                            <div className="text-[10px] font-bold uppercase text-indigo-600 mb-1">{msg.sender || msg.role || 'Participant'}</div>
                            <div className="text-xs text-slate-700 whitespace-pre-wrap">{msg.text || msg.message || msg.content || 'No content'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-semibold text-slate-700 transition-all"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/results/${selectedPreviousInterview.reportId || selectedPreviousInterview._id || 'report'}`, { state: { reportData: selectedPreviousInterview } })}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-extrabold text-white shadow-md transition-all flex items-center gap-2"
                >
                  <Award className="w-4 h-4" /> Open Full Scorecard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
