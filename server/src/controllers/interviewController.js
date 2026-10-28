import { Interview } from '../models/Interview.js';
import { InterviewResult } from '../models/InterviewResult.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { generateFinalReport } from '../services/aiService.js';
import { sendInterviewInviteEmail } from '../services/emailService.js';
import { config } from '../config/env.js';
import { v4 as uuidv4 } from 'uuid';

const inMemoryInterviews = [];

const isGenericInterviewValue = (value = '') => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const genericValues = new Set([
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
    'technical evaluation round',
    'technical round',
    'custom technical round',
    'multi-problem technical round',
    'interview report',
  ]);
  return genericValues.has(normalized);
};

const sanitizeInterviewText = (value, fallback) => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  if (isGenericInterviewValue(raw)) return fallback;
  return raw;
};

export const normalizeInterviewStatus = (status) => {
  const raw = typeof status === 'string' ? status : String(status ?? '');
  const normalized = raw.trim().toLowerCase();

  if (!normalized) return 'scheduled';

  const aliasMap = {
    scheduled: 'scheduled',
    'in progress': 'in-progress',
    'in-progress': 'in-progress',
    'in_progress': 'in-progress',
    active: 'live',
    live: 'live',
    ongoing: 'live',
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
  };

  return aliasMap[normalized] ?? normalized;
};

export const matchesInterviewForUser = (interview, user = {}) => {
  if (!interview || !user) return false;

  const candidateEmail = String(interview.candidateEmail || '').trim().toLowerCase();
  const interviewerEmail = String(interview.interviewerEmail || '').trim().toLowerCase();
  const candidateName = String(interview.candidateName || '').trim().toLowerCase();
  const interviewerName = String(interview.interviewerName || '').trim().toLowerCase();

  const userEmail = String(user.email || '').trim().toLowerCase();
  const userName = String(user.name || '').trim().toLowerCase();

  if (userEmail && (candidateEmail === userEmail || interviewerEmail === userEmail)) return true;
  if (userName && (candidateName === userName || interviewerName === userName)) return true;

  return false;
};

export const createInterview = async (req, res, next) => {
  try {
    const {
      title,
      type,
      candidateName,
      candidateEmail,
      role,
      problemTitle,
      problemId,
      problems,
      questionCount,
      totalQuestions,
      scheduledAt,
      durationMinutes,
      sendViaEmail,
    } = req.body;
    const roomId = `room-${uuidv4().substring(0, 8)}`;
    const interviewerName = req.user?.name || 'Interviewer';
    const interviewerTitle = req.user?.title || 'Senior Interviewer';
    const interviewerEmail = req.user?.email ? String(req.user.email).trim().toLowerCase() : '';
    const normalizedCandidateEmail = candidateEmail ? String(candidateEmail).trim().toLowerCase() : '';

    let candidateUser = null;
    if (normalizedCandidateEmail) {
      candidateUser = await User.findOne({ email: normalizedCandidateEmail }).lean().catch(() => null);
    }
    if (!candidateUser && candidateName) {
      candidateUser = await User.findOne({ name: new RegExp(`^${candidateName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean().catch(() => null);
    }

    const candidateDisplayName = candidateUser?.name || candidateName || (normalizedCandidateEmail ? normalizedCandidateEmail.split('@')[0] : 'Candidate');
    const candidateDisplayTitle = candidateUser?.title || role || 'Software Engineer Candidate';
    const candidateUserId = candidateUser?._id || null;
    const resolvedCandidateEmail = normalizedCandidateEmail || (candidateUser?.email ? String(candidateUser.email).trim().toLowerCase() : '');

    const selectedProblemCount = Array.isArray(problems) && problems.length > 0 ? problems.length : Math.max(1, Number(questionCount) || Number(totalQuestions) || 1);
    const normalizedQuestionCount = Math.max(1, Number(questionCount) || selectedProblemCount || 1);
    const normalizedTotalQuestions = Math.max(1, Number(totalQuestions) || normalizedQuestionCount || selectedProblemCount || 1);

    const resolvedTitle = sanitizeInterviewText(title, 'Technical Evaluation Round');
    const resolvedProblemTitle = sanitizeInterviewText(problemTitle, Array.isArray(problems) && problems.length > 0 ? problems[0] : 'Custom Technical Round');

    const newInterview = {
      _id: 'int_' + Date.now(),
      title: resolvedTitle,
      type: type || 'one-to-one',
      interviewerId: req.user?._id || 'i1',
      interviewerName,
      interviewerTitle,
      interviewerEmail,
      candidateId: candidateUserId,
      candidateName: candidateDisplayName,
      candidateTitle: candidateDisplayTitle,
      candidateEmail: resolvedCandidateEmail,
      role: candidateDisplayTitle,
      problemTitle: resolvedProblemTitle,
      problems: problems || [],
      roomId,
      status: 'scheduled',
      time: scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Scheduled',
      scheduledAt: scheduledAt || new Date().toISOString(),
      durationMinutes: durationMinutes || 45,
      questionCount: normalizedQuestionCount,
      totalQuestions: normalizedTotalQuestions,
    };

    try {
      const dbRecord = await Interview.create({
        title: newInterview.title,
        type: newInterview.type,
        interviewerId: req.user?._id && req.user._id !== 'i1' ? req.user._id : null,
        interviewerName,
        interviewerTitle,
        interviewerEmail,
        candidateId: candidateUserId,
        candidateName: candidateDisplayName,
        candidateTitle: candidateDisplayTitle,
        candidateEmail: resolvedCandidateEmail,
        roomId,
        scheduledAt: newInterview.scheduledAt,
        durationMinutes: newInterview.durationMinutes,
        problems: newInterview.problems,
        questionCount: newInterview.questionCount,
        totalQuestions: newInterview.totalQuestions,
      });
      newInterview._id = dbRecord._id.toString();
    } catch (dbErr) {
      console.warn('[Interview Controller] DB save fallback to memory store.', dbErr?.message || dbErr);
    }

    if (sendViaEmail === true && resolvedCandidateEmail) {
      const emailResult = await sendInterviewInviteEmail({
        to: resolvedCandidateEmail,
        candidateName: newInterview.candidateName,
        interviewTitle: newInterview.title,
        roomId: newInterview.roomId,
        scheduledAt: newInterview.scheduledAt,
        roomUrl: `${config.clientUrl}/live-room/${newInterview.roomId}`,
        interviewerName: req.user?.name || 'Your interviewer',
      });

      if (emailResult.sent) {
        console.log(`[Email] Invitation sent to ${resolvedCandidateEmail} for room ${newInterview.roomId}`);
      } else {
        console.warn(`[Email] Invitation not delivered to ${resolvedCandidateEmail}: ${emailResult.reason || 'unknown'}`);
      }
    }

    inMemoryInterviews.unshift(newInterview);

    // Broadcast interview scheduled via Socket.IO so candidates receive notification and real-time refresh
    try {
      const io = req.app?.get('io');
      if (io) {
        io.emit('interview-scheduled', {
          ...newInterview,
          recipientEmail: resolvedCandidateEmail,
          candidateEmail: resolvedCandidateEmail,
          candidateName: candidateDisplayName,
          actionUrl: `/live-room/${newInterview.roomId}`,
          message: `You have been scheduled for an interview: ${newInterview.title}`,
        });
      }
    } catch (sockErr) {
      console.warn('[Interview Controller] Failed to emit interview-scheduled socket event:', sockErr);
    }

    res.status(201).json({ success: true, data: newInterview });
  } catch (error) {
    next(error);
  }
};

export const getUserInterviews = async (req, res, next) => {
  try {
    let dbInterviews = [];
    const userId = req.user?._id || req.user?.id;
    const userEmail = req.user?.email ? String(req.user.email).trim().toLowerCase() : '';

    try {
      const orConditions = [];
      if (userId) {
        orConditions.push({ candidateId: userId });
        orConditions.push({ interviewerId: userId });
      }
      if (userEmail) {
        orConditions.push({ candidateEmail: userEmail });
        orConditions.push({ interviewerEmail: userEmail });
      }

      if (orConditions.length > 0) {
        dbInterviews = await Interview.find({ $or: orConditions })
          .populate('problemId', 'title slug difficulty')
          .populate('candidateId', 'name email avatar')
          .populate('interviewerId', 'name email avatar')
          .sort({ scheduledAt: -1 })
          .lean();
      }
    } catch (e) {
      console.warn('[Interview Controller] Error querying interviews:', e);
      dbInterviews = [];
    }

    // Backfill candidateId if user was not registered at schedule time
    if (userId && userEmail && Array.isArray(dbInterviews)) {
      for (const item of dbInterviews) {
        if (!item.candidateId && item.candidateEmail === userEmail) {
          Interview.updateOne({ _id: item._id }, { $set: { candidateId: userId } }).catch(() => null);
          item.candidateId = userId;
        }
      }
    }

    const combined = [...inMemoryInterviews, ...dbInterviews].filter((item) => {
      if (!item) return false;
      const candidateIdStr = item?.candidateId ? String(item.candidateId?._id || item.candidateId) : '';
      const interviewerIdStr = item?.interviewerId ? String(item.interviewerId?._id || item.interviewerId) : '';
      const cEmail = String(item?.candidateEmail || item?.candidateId?.email || '').trim().toLowerCase();
      const iEmail = String(item?.interviewerEmail || item?.interviewerId?.email || '').trim().toLowerCase();

      const matches =
        (userId && (candidateIdStr === String(userId) || interviewerIdStr === String(userId))) ||
        (userEmail && (cEmail === userEmail || iEmail === userEmail));
      return Boolean(matches);
    });

    const unique = Array.from(
      new Map(combined.map((item) => [item.roomId || item._id?.toString(), item])).values()
    ).map((item) => {
      const derivedProblemCount = Array.isArray(item.problems) && item.problems.length > 0 ? item.problems.length : Math.max(1, Number(item.questionCount || item.totalQuestions || 1));
      return {
        ...item,
        candidateEmail: item.candidateEmail || item.candidateId?.email || '',
        interviewerEmail: item.interviewerEmail || item.interviewerId?.email || '',
        questionCount: Math.max(1, Number(item.questionCount || item.totalQuestions || derivedProblemCount || 1)),
        totalQuestions: Math.max(1, Number(item.totalQuestions || item.questionCount || derivedProblemCount || 1)),
        status: normalizeInterviewStatus(item?.status || item?.state || 'scheduled'),
      };
    });

    return res.json({ success: true, count: unique.length, data: unique });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load interviews.', count: 0, data: [] });
  }
};

export const getUserInterviewReports = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const userEmail = req.user?.email ? String(req.user.email).trim().toLowerCase() : '';
    let dbResults = [];
    let historicalInterviews = [];

    if (userId || userEmail) {
      const orResultConditions = [];
      if (userId) {
        orResultConditions.push({ candidateId: userId });
        orResultConditions.push({ interviewerId: userId });
      }
      if (userEmail) {
        orResultConditions.push({ candidateEmail: userEmail });
        orResultConditions.push({ interviewerEmail: userEmail });
      }

      if (orResultConditions.length > 0) {
        try {
          const query = InterviewResult.find({ $or: orResultConditions });
          const resolvedQuery = query && typeof query.then === 'function' ? await query : query;

          if (resolvedQuery && typeof resolvedQuery.populate === 'function') {
            let populated = resolvedQuery;
            if (typeof populated.populate === 'function') {
              populated = await populated.populate(
                'interviewId',
                'title candidateName candidateEmail interviewerName interviewerEmail role roomId scheduledAt durationMinutes problems interviewerNotes chatMessages transcript'
              );
            }

            if (populated && typeof populated.sort === 'function' && !Array.isArray(populated)) {
              populated = populated.sort({ createdAt: -1 });
            }

            const maybeResults = populated && typeof populated.lean === 'function'
              ? await populated.lean().catch(() => [])
              : populated;

            dbResults = Array.isArray(maybeResults) ? maybeResults : [];
          } else if (Array.isArray(resolvedQuery)) {
            dbResults = resolvedQuery;
          }
        } catch (err) {
          dbResults = [];
        }
      }

      const orInterviewConditions = [];
      if (userId) {
        orInterviewConditions.push({ candidateId: userId });
        orInterviewConditions.push({ interviewerId: userId });
      }
      if (userEmail) {
        orInterviewConditions.push({ candidateEmail: userEmail });
        orInterviewConditions.push({ interviewerEmail: userEmail });
      }

      if (orInterviewConditions.length > 0) {
        try {
          const interviewQuery = {
            $or: orInterviewConditions,
            status: { $in: ['completed', 'finished', 'cancelled', 'canceled', 'ended', 'closed', 'expired', 'done'] },
          };

          const interviewQueryResult = Interview.find(interviewQuery);
          const resolvedInterviewQuery = interviewQueryResult && typeof interviewQueryResult.then === 'function'
            ? await interviewQueryResult
            : interviewQueryResult;

          if (resolvedInterviewQuery && typeof resolvedInterviewQuery.populate === 'function') {
            let populatedInterviews = resolvedInterviewQuery;
            if (typeof populatedInterviews.populate === 'function') {
              populatedInterviews = await populatedInterviews.populate('candidateId', 'name email avatar');
            }
            if (populatedInterviews && typeof populatedInterviews.populate === 'function') {
              populatedInterviews = await populatedInterviews.populate('interviewerId', 'name email avatar');
            }
            if (populatedInterviews && typeof populatedInterviews.sort === 'function' && !Array.isArray(populatedInterviews)) {
              populatedInterviews = populatedInterviews.sort({ endedAt: -1, scheduledAt: -1 });
            }

            const maybeInterviews = populatedInterviews && typeof populatedInterviews.lean === 'function'
              ? await populatedInterviews.lean().catch(() => [])
              : populatedInterviews;

            historicalInterviews = Array.isArray(maybeInterviews) ? maybeInterviews : [];
          } else if (Array.isArray(resolvedInterviewQuery)) {
            historicalInterviews = resolvedInterviewQuery;
          }
        } catch (err) {
          historicalInterviews = [];
        }
      }
    }

    const memoryResults = Array.from(inMemoryResults.values()).filter((result) => {
      if (!result) return false;
      const matchUser = String(result.candidateId || '') === String(userId) || String(result.interviewerId || '') === String(userId);
      const matchEmail = userEmail && (String(result.candidateEmail || '').toLowerCase() === userEmail || String(result.interviewerEmail || '').toLowerCase() === userEmail);
      return matchUser || matchEmail || (result.interviewId && String(result.interviewId) === String(userId));
    });

    const interviewHistory = (Array.isArray(historicalInterviews) ? historicalInterviews : []).map((interview) => {
      const normalizedStatus = normalizeInterviewStatus(interview?.status || (interview?.cancelledAt ? 'cancelled' : 'completed'));
      const endedAt = interview?.endedAt || interview?.cancelledAt || interview?.updatedAt;
      const interviewId = interview?._id ? String(interview._id) : String(interview?.roomId || 'interview');
      const durationMinutes = Number(interview?.durationMinutes || 0);
      const score = Number(interview?.overallScore || 0);
      const savedChat = Array.isArray(interview?.chatMessages) && interview.chatMessages.length
        ? interview.chatMessages
        : (Array.isArray(interview?.transcript) ? interview.transcript : []);
      const savedNotes = interview?.interviewerNotes || '';

      return {
        ...interview,
        _id: interviewId,
        roomId: interview?.roomId || interviewId,
        sessionId: interview?.roomId || interviewId,
        title: interview?.title || interview?.problemTitle || 'Interview Report',
        role: interview?.role || interview?.candidateTitle || 'Software Engineer',
        candidateName: interview?.candidateName || interview?.candidateId?.name || 'Candidate',
        candidateEmail: interview?.candidateEmail || interview?.candidateId?.email || '',
        status: normalizedStatus,
        overallScore: score,
        duration: durationMinutes > 0 ? `${durationMinutes} min` : 'N/A',
        completedDate: endedAt ? new Date(endedAt).toLocaleDateString() : (interview?.scheduledAt ? new Date(interview.scheduledAt).toLocaleDateString() : 'Recently'),
        interviewDate: interview?.scheduledAt || endedAt || new Date().toISOString(),
        questionMetrics: Array.isArray(interview?.questionMetrics) ? interview.questionMetrics : [],
        chatMessages: savedChat,
        transcriptHistory: savedChat,
        interviewerNotes: savedNotes,
        feedback: {
          rating: Number((Math.round((score / 100) * 50) / 10).toFixed(1)) || 0,
          strengths: ['Session completed successfully.', 'Strong technical thinking.'],
          improvements: ['Continue refining communication and delivery.'],
        },
        reportSummary: normalizedStatus === 'cancelled'
          ? (interview?.cancellationMessage || 'This session was cancelled before completion.')
          : 'Interview completed successfully.',
      };
    });

    const normalizedResults = [...dbResults, ...interviewHistory, ...memoryResults].reduce((acc, result) => {
      const rawResult = result && result.toObject ? result.toObject() : result;
      if (!rawResult || !rawResult._id) return acc;
      const interviewMeta = rawResult.interviewId && typeof rawResult.interviewId === 'object' ? rawResult.interviewId : null;
      const questionMetrics = Array.isArray(rawResult.questionMetrics) ? rawResult.questionMetrics : [];
      const chatMessages = (Array.isArray(rawResult.chatMessages) && rawResult.chatMessages.length)
        ? rawResult.chatMessages
        : (Array.isArray(interviewMeta?.chatMessages) && interviewMeta.chatMessages.length
            ? interviewMeta.chatMessages
            : (Array.isArray(interviewMeta?.transcript) && interviewMeta.transcript.length ? interviewMeta.transcript : []));
      const transcriptHistory = (Array.isArray(rawResult.transcriptHistory) && rawResult.transcriptHistory.length)
        ? rawResult.transcriptHistory
        : (chatMessages.length ? chatMessages : []);
      const notes = (typeof rawResult.interviewerNotes === 'string' && rawResult.interviewerNotes.trim())
        ? rawResult.interviewerNotes
        : (typeof interviewMeta?.interviewerNotes === 'string' ? interviewMeta.interviewerNotes : '');
      const durationSeconds = Number(rawResult.totalSessionTime || 0);
      const durationLabel = durationSeconds > 0 ? `${Math.max(1, Math.round(durationSeconds / 60))} min` : (interviewMeta?.durationMinutes ? `${interviewMeta.durationMinutes} min` : rawResult.duration || 'N/A');
      const overallScore = Number(rawResult.overallScore ?? 0);
      const derivedTechnical = Number(rawResult.technicalScore ?? (questionMetrics.length ? questionMetrics.reduce((sum, item) => sum + Number(item.score || 0), 0) / questionMetrics.length : 0));
      const derivedCommunication = Number(rawResult.communicationScore ?? derivedTechnical);
      const derivedProblem = Number(rawResult.problemSolvingScore ?? derivedTechnical);
      const derivedCode = Number(rawResult.codeQualityScore ?? derivedTechnical);

      const item = {
        ...rawResult,
        _id: rawResult._id?.toString ? rawResult._id.toString() : rawResult._id,
        title: interviewMeta?.title || rawResult.title || rawResult.topic || 'Interview Report',
        role: interviewMeta?.role || rawResult.role || 'Software Engineer',
        candidateName: interviewMeta?.candidateName || rawResult.candidateName || 'Candidate',
        candidateEmail: interviewMeta?.candidateEmail || rawResult.candidateEmail || '',
        roomId: interviewMeta?.roomId || rawResult.roomId || 'room-unknown',
        sessionId: interviewMeta?.roomId || rawResult.sessionId || rawResult.interviewId || 'session',
        status: normalizeInterviewStatus(rawResult.status || (rawResult.cancelledAt ? 'cancelled' : 'completed')),
        problemTitle: interviewMeta?.problemTitle || rawResult.problemTitle || questionMetrics[0]?.question || 'Technical Round',
        totalQuestions: questionMetrics.length || rawResult.totalQuestions || 0,
        questionsAsked: questionMetrics.length || rawResult.questionsAsked || 0,
        overallScore,
        duration: durationLabel,
        completedDate: rawResult.updatedAt ? new Date(rawResult.updatedAt).toLocaleDateString() : (interviewMeta?.scheduledAt ? new Date(interviewMeta.scheduledAt).toLocaleDateString() : rawResult.completedDate || 'Recently'),
        interviewDate: interviewMeta?.scheduledAt || rawResult.createdAt || rawResult.interviewDate || new Date().toISOString(),
        technicalSkills: rawResult.technicalSkills || {
          technical: derivedTechnical,
          communication: derivedCommunication,
          problemSolving: derivedProblem,
          codeQuality: derivedCode,
        },
        feedback: typeof rawResult.feedback === 'object' && rawResult.feedback !== null
          ? rawResult.feedback
          : {
              rating: Number((Math.round((overallScore / 100) * 50) / 10).toFixed(1)) || 0,
              strengths: Array.isArray(rawResult.strengths) && rawResult.strengths.length ? rawResult.strengths : ['Strong technical reasoning', 'Clear communication'],
              improvements: Array.isArray(rawResult.improvements) && rawResult.improvements.length ? rawResult.improvements : ['Continue practicing system design tradeoffs'],
            },
        questionMetrics,
        chatMessages: chatMessages.length ? chatMessages : transcriptHistory,
        transcriptHistory: transcriptHistory.length ? transcriptHistory : chatMessages,
        interviewerNotes: notes,
        reportSummary: notes || (chatMessages.length ? chatMessages.map((message) => message?.text || message?.message || '').filter(Boolean).slice(0, 2).join(' • ') : rawResult.reportSummary || 'Interview completed successfully.'),
      };

      if (!acc.some((existing) => String(existing._id) === String(item._id))) {
        acc.push(item);
      }
      return acc;
    }, []);

    if (typeof res.json === 'function') {
      return res.json({ success: true, count: normalizedResults.length, data: normalizedResults });
    }
    return { success: true, count: normalizedResults.length, data: normalizedResults };
  } catch (error) {
    const payload = { success: false, message: 'Unable to load saved interview reports.', count: 0, data: [] };
    if (typeof res.status === 'function') {
      return res.status(500).json(payload);
    }
    if (typeof res.json === 'function') {
      return res.json(payload);
    }
    return payload;
  }
};

export const canRejoinInterview = (status) => {
  const normalized = normalizeInterviewStatus(status);
  return !['completed', 'finished', 'cancelled', 'ended', 'closed', 'expired', 'archived', 'done'].includes(normalized);
};

export const getInterviewByRoomId = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    let interview = null;

    try {
      interview = await Interview.findOne({ roomId })
        .populate('problemId')
        .populate('candidateId', 'name email avatar title')
        .populate('interviewerId', 'name email avatar title');
    } catch (e) {
      interview = null;
    }

    if (!interview) {
      interview = inMemoryInterviews.find((i) => i.roomId === roomId);
    }

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview room not found.',
        data: null,
      });
    }

    if (!canRejoinInterview(interview.status)) {
      return res.status(409).json({
        success: false,
        ended: true,
        message: 'This interview session has already ended and cannot be rejoined.',
        data: interview,
      });
    }

    res.json({ success: true, data: interview });
  } catch (error) {
    next(error);
  }
};

import mongoose from 'mongoose';

const inMemoryResults = new Map();

export const cancelInterview = async (req, res, next) => {
  try {
    const { id } = req.params;
    let interview = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      interview = await Interview.findById(id).catch(() => null);
    }

    if (!interview) {
      interview = await Interview.findOne({ roomId: id }).catch(() => null);
    }

    if (!interview) {
      interview = inMemoryInterviews.find((item) => item.roomId === id || item._id === id);
    }

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    const normalizedStatus = normalizeInterviewStatus(interview.status || 'scheduled');
    if (normalizedStatus === 'cancelled') {
      return res.json({ success: true, message: 'Interview already cancelled.', data: interview });
    }

    interview.status = 'cancelled';
    interview.endedAt = new Date();
    interview.cancelledAt = new Date();
    interview.title = interview.title || 'Technical Evaluation Round';

    if (mongoose.Types.ObjectId.isValid(interview._id)) {
      await Interview.findByIdAndUpdate(interview._id, {
        status: 'cancelled',
        endedAt: interview.endedAt,
        cancelledAt: interview.cancelledAt,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: 'Interview cancelled successfully.',
      data: {
        ...interview.toObject ? interview.toObject() : interview,
        status: 'cancelled',
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const endInterview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      sessionScores = [],
      transcriptHistory = [],
      topic = 'React.js',
      interviewTitle = topic || 'Technical Evaluation Round',
      questionMetrics = [],
      chatMessages = [],
      interviewerNotes = '',
      totalSessionTime = 0,
    } = req.body || {};
    let interview = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      interview = await Interview.findById(id).catch(() => null);
    }

    if (!interview) {
      interview = await Interview.findOne({ roomId: id }).catch(() => null);
    }

    if (!interview) {
      interview = inMemoryInterviews.find((i) => i.roomId === id || i._id === id);
    }

    const resolvedNotes = interviewerNotes || interview?.interviewerNotes || '';
    const resolvedChat = Array.isArray(chatMessages) && chatMessages.length
      ? chatMessages
      : (Array.isArray(transcriptHistory) && transcriptHistory.length
          ? transcriptHistory
          : (Array.isArray(interview?.chatMessages) && interview.chatMessages.length
              ? interview.chatMessages
              : (Array.isArray(interview?.transcript) ? interview.transcript : [])));

    if (interview && mongoose.Types.ObjectId.isValid(interview._id)) {
      interview.status = 'completed';
      interview.endedAt = new Date();
      interview.title = interview.title || interviewTitle || 'Technical Evaluation Round';
      if (resolvedNotes) {
        interview.interviewerNotes = resolvedNotes;
      }
      if (resolvedChat.length) {
        interview.chatMessages = resolvedChat;
        interview.transcript = resolvedChat;
      }
      await interview.save().catch(() => {});
    } else if (interview) {
      interview.status = 'completed';
      interview.title = interview.title || interviewTitle || 'Technical Evaluation Round';
      if (resolvedNotes) interview.interviewerNotes = resolvedNotes;
      if (resolvedChat.length) {
        interview.chatMessages = resolvedChat;
        interview.transcript = resolvedChat;
      }
    }

    if (interview) {
      interview.status = normalizeInterviewStatus(interview.status || 'completed');
    }

    let submissions = [];
    if (mongoose.Types.ObjectId.isValid(id)) {
      submissions = await Submission.find({ interviewId: id }).catch(() => []);
    }

    const reportData = await generateFinalReport({
      interview: interview || { type: 'one-to-one' },
      submissions,
      sessionScores: sessionScores || [],
      transcriptHistory: resolvedChat.length ? resolvedChat : (transcriptHistory || []),
      topic: topic || 'React.js',
      questionMetrics: questionMetrics || [],
      chatMessages: resolvedChat,
      interviewerNotes: resolvedNotes,
      totalSessionTime: totalSessionTime || 0,
    });

    const targetInterviewObjectId = interview?._id && mongoose.Types.ObjectId.isValid(interview._id)
      ? interview._id
      : (mongoose.Types.ObjectId.isValid(id) ? id : null);
    const targetCandidateId = interview?.candidateId || (req.user?.role === 'candidate' ? req.user?._id : null);
    const targetInterviewerId = interview?.interviewerId || (req.user?.role === 'interviewer' ? req.user?._id : null);
    const targetRoomId = interview?.roomId || id;
    const targetCandidateEmail = interview?.candidateEmail || '';
    const targetInterviewerEmail = interview?.interviewerEmail || '';

    let result = null;
    const resultDoc = {
      interviewId: targetInterviewObjectId,
      roomId: targetRoomId,
      candidateId: targetCandidateId,
      candidateEmail: targetCandidateEmail,
      interviewerEmail: targetInterviewerEmail,
      interviewerId: targetInterviewerId,
      topic: interviewTitle || topic || 'React.js',
      title: interviewTitle || interview?.title || topic || 'Technical Evaluation Round',
      interviewerNotes: resolvedNotes,
      questionMetrics: reportData.questionMetrics || [],
      transcriptHistory: reportData.transcriptHistory || resolvedChat,
      chatMessages: resolvedChat,
      totalSessionTime: reportData.totalSessionTime || 0,
      avgTimePerQuestion: reportData.avgTimePerQuestion || 0,
      difficultyBreakdown: reportData.difficultyBreakdown || { easy: [], medium: [], hard: [] },
      avgScoreByDifficulty: reportData.avgScoreByDifficulty || { easy: 0, medium: 0, hard: 0 },
      ...reportData,
    };

    try {
      const orCriteria = [];
      if (targetInterviewObjectId) orCriteria.push({ interviewId: targetInterviewObjectId });
      if (targetRoomId) orCriteria.push({ roomId: targetRoomId });

      if (orCriteria.length > 0) {
        result = await InterviewResult.findOneAndUpdate(
          { $or: orCriteria },
          { $set: resultDoc },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        result = await InterviewResult.create(resultDoc);
      }
    } catch (e) {
      console.warn('[endInterview] InterviewResult save fallback to memory:', e?.message || e);
      result = null;
    }

    if (!result) {
      result = {
        _id: 'res_' + Date.now(),
        ...resultDoc,
      };
    }

    inMemoryResults.set(id, result);
    inMemoryResults.set(targetRoomId, result);
    if (result._id) {
      inMemoryResults.set(String(result._id), result);
    }

    // Update interviewsCompleted stat for the user
    try {
      const actorId = req.user?._id || req.user?.id;
      if (mongoose.Types.ObjectId.isValid(actorId)) {
        const completedCount = await Interview.countDocuments({
          $or: [{ candidateId: actorId }, { interviewerId: actorId }],
          status: 'completed',
        });
        await User.findByIdAndUpdate(actorId, { 'stats.interviewsCompleted': completedCount });
      }
    } catch (statErr) {
      console.warn('[endInterview] Stat update failed:', statErr.message);
    }

    res.json({
      success: true,
      message: 'Interview completed and AI evaluation scorecard generated successfully.',
      result,
    });
  } catch (error) {
    next(error);
  }
};

const buildTruthfulReportFallback = (interview, interviewId) => {
  const savedChat = Array.isArray(interview?.chatMessages) && interview.chatMessages.length
    ? interview.chatMessages
    : (Array.isArray(interview?.transcript) ? interview.transcript : []);

  const savedNotes = typeof interview?.interviewerNotes === 'string' && interview.interviewerNotes.trim()
    ? interview.interviewerNotes
    : '';

  return {
    _id: interview?._id?.toString?.() || interviewId || 'report_unavailable',
    interviewId: interview?._id?.toString?.() || interviewId || 'report_unavailable',
    roomId: interview?.roomId || interviewId || '',
    title: interview?.title || 'Interview session',
    candidateName: interview?.candidateName || 'Candidate',
    candidateEmail: interview?.candidateEmail || '',
    interviewerName: interview?.interviewerName || 'Interviewer',
    interviewerEmail: interview?.interviewerEmail || '',
    interviewerNotes: savedNotes,
    chatMessages: savedChat,
    transcriptHistory: savedChat,
    questionMetrics: [],
    status: normalizeInterviewStatus(interview?.status || 'completed'),
    technicalScore: 0,
    communicationScore: 0,
    problemSolvingScore: 0,
    codeQualityScore: 0,
    overallScore: 0,
    hiringRecommendation: 'Pending Evaluation',
    aiSummary: 'No evaluation data has been generated for this interview yet.',
    strengths: [],
    improvements: [],
    feedback: 'No evaluation data has been generated for this interview yet.',
    totalSessionTime: Number(interview?.durationMinutes || 0) * 60,
    avgTimePerQuestion: 0,
    difficultyBreakdown: { easy: [], medium: [], hard: [] },
    avgScoreByDifficulty: { easy: 0, medium: 0, hard: 0 },
    tagPerformance: [],
    topic: interview?.topic || 'Unknown',
  };
};

export const getInterviewReport = async (req, res, next) => {
  try {
    const { interviewId } = req.params;
    let result = null;

    if (inMemoryResults.has(interviewId)) {
      result = inMemoryResults.get(interviewId);
    }

    if (!result) {
      const orQuery = [];
      if (mongoose.Types.ObjectId.isValid(interviewId)) {
        orQuery.push({ _id: interviewId });
        orQuery.push({ interviewId });
      }
      orQuery.push({ roomId: interviewId });

      try {
        let resultQuery = await InterviewResult.findOne({ $or: orQuery }).catch(() => null);
        if (resultQuery && typeof resultQuery.populate === 'function') {
          resultQuery = await resultQuery.populate('interviewId').catch(() => resultQuery);
        }
        if (resultQuery && typeof resultQuery.lean === 'function') {
          resultQuery = await resultQuery.lean().catch(() => resultQuery);
        }
        result = resultQuery || null;

        if (result && result.interviewId && typeof result.interviewId === 'object') {
          if (!result.interviewerNotes && result.interviewId.interviewerNotes) {
            result.interviewerNotes = result.interviewId.interviewerNotes;
          }
          if ((!Array.isArray(result.chatMessages) || !result.chatMessages.length) && Array.isArray(result.interviewId.chatMessages) && result.interviewId.chatMessages.length) {
            result.chatMessages = result.interviewId.chatMessages;
            result.transcriptHistory = result.interviewId.chatMessages;
          }
        }
      } catch (e) {
        result = null;
      }
    }

    if (!result) {
      const orInterview = [];
      if (mongoose.Types.ObjectId.isValid(interviewId)) {
        orInterview.push({ _id: interviewId });
      }
      orInterview.push({ roomId: interviewId });

      let foundInterview = await Interview.findOne({ $or: orInterview }).catch(() => null);
      if (foundInterview && typeof foundInterview.lean === 'function') {
        foundInterview = await foundInterview.lean().catch(() => foundInterview);
      }
      if (foundInterview) {
        result = buildTruthfulReportFallback(foundInterview, interviewId);
      }
    }

    if (!result) {
      result = buildTruthfulReportFallback(null, interviewId);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
