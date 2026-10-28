import mongoose from 'mongoose';

const interviewResultSchema = new mongoose.Schema(
  {
    interviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Interview',
      default: null,
      index: true,
    },
    roomId: {
      type: String,
      default: '',
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    candidateEmail: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },
    interviewerEmail: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },
    interviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    topic: { type: String, default: 'React.js' },
    technicalScore: { type: Number, min: 0, max: 100, default: 0 },
    communicationScore: { type: Number, min: 0, max: 100, default: 0 },
    problemSolvingScore: { type: Number, min: 0, max: 100, default: 0 },
    codeQualityScore: { type: Number, min: 0, max: 100, default: 0 },
    overallScore: { type: Number, min: 0, max: 100, default: 0 },
    hiringRecommendation: {
      type: String,
      enum: ['Accepted', 'Rejected', 'Pending Evaluation', 'Strong Hire', 'Hire', 'Weak Hire', 'Reject'],
      default: 'Pending Evaluation',
    },
    aiSummary: { type: String, default: '' },
    strengths: [{ type: String }],
    improvements: [{ type: String }],
    feedback: { type: String, default: '' },
    interviewerNotes: { type: String, default: '' },
    questionMetrics: [{ type: mongoose.Schema.Types.Mixed, default: [] }],
    transcriptHistory: [{ type: mongoose.Schema.Types.Mixed, default: [] }],
    chatMessages: [{ type: mongoose.Schema.Types.Mixed, default: [] }],
    totalSessionTime: { type: Number, default: 0 },
    avgTimePerQuestion: { type: Number, default: 0 },
    difficultyBreakdown: { type: mongoose.Schema.Types.Mixed, default: { easy: [], medium: [], hard: [] } },
    avgScoreByDifficulty: { type: mongoose.Schema.Types.Mixed, default: { easy: 0, medium: 0, hard: 0 } },
  },
  { timestamps: true }
);

interviewResultSchema.index({ candidateId: 1, createdAt: -1 });
interviewResultSchema.index({ interviewerId: 1, createdAt: -1 });
interviewResultSchema.index({ candidateEmail: 1, createdAt: -1 });
interviewResultSchema.index({ interviewerEmail: 1, createdAt: -1 });
interviewResultSchema.index({ roomId: 1 });

export const InterviewResult = mongoose.model('InterviewResult', interviewResultSchema);
