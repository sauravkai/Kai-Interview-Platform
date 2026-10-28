import mongoose from 'mongoose';

const interviewSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ['one-to-one', 'ai-mock'],
      required: true,
    },
    interviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CodingProblem',
      default: null,
    },
    problems: {
      type: [String],
      default: [],
    },
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    candidateName: {
      type: String,
      default: 'Candidate',
    },
    interviewerName: {
      type: String,
      default: 'Interviewer',
    },
    candidateTitle: {
      type: String,
      default: 'Candidate',
    },
    interviewerTitle: {
      type: String,
      default: 'Senior Interviewer',
    },
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    scheduledAt: {
      type: Date,
      default: Date.now,
    },
    durationMinutes: {
      type: Number,
      default: 45,
    },
    questionCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    totalQuestions: {
      type: Number,
      default: 1,
      min: 1,
    },
    startedAt: { type: Date },
    endedAt: { type: Date },
    interviewerNotes: { type: String, default: '' },
    chatMessages: [{ type: mongoose.Schema.Types.Mixed, default: [] }],
    transcript: [{ type: mongoose.Schema.Types.Mixed, default: [] }],
  },
  { timestamps: true }
);

interviewSchema.index({ candidateId: 1, status: 1 });
interviewSchema.index({ interviewerId: 1, status: 1 });
interviewSchema.index({ candidateEmail: 1, status: 1 });
interviewSchema.index({ interviewerEmail: 1, status: 1 });
interviewSchema.index({ scheduledAt: -1 });

export const Interview = mongoose.model('Interview', interviewSchema);

