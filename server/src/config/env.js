import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Production security check: ensure default development JWT secret is never used in production
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'ai_interview_platform_super_secret_jwt_key_2026');
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'ai_interview_platform_super_secret_jwt_key_2026')) {
  console.error('[SECURITY FATAL] In production mode, JWT_SECRET must be explicitly configured and not use the default dev secret!');
  process.exit(1);
}

const normalizeOrigin = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    return new URL(raw).origin;
  } catch {
    const withoutTrailingSlash = raw.replace(/\/+$/, '');
    const schemeIndex = withoutTrailingSlash.indexOf('://');
    if (schemeIndex === -1) return withoutTrailingSlash;

    const rest = withoutTrailingSlash.slice(schemeIndex + '://'.length);
    const slashIndex = rest.indexOf('/');
    return slashIndex === -1 ? withoutTrailingSlash : `${withoutTrailingSlash.slice(0, schemeIndex + '://'.length + slashIndex)}`;
  }
};

// Parse allowed CORS origins
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:3001,http://localhost:3002,http://localhost:3003';
const allowedOrigins = rawAllowedOrigins.split(',').map(normalizeOrigin).filter(Boolean);

const defaultMongoDatabase = 'ai-interview-platform';
const rawMongoUri = process.env.MONGO_URI || `mongodb://localhost:27017/${defaultMongoDatabase}`;

const normalizeMongoUri = (uri) => {
  try {
    const parsed = new URL(uri);
    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = `/${defaultMongoDatabase}`;
    }
    return parsed.toString();
  } catch {
    const trimmed = uri.replace(/\/+$/, '');
    return trimmed.endsWith(`/${defaultMongoDatabase}`)
      ? trimmed
      : `${trimmed}/${defaultMongoDatabase}`;
  }
};

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: normalizeMongoUri(rawMongoUri),
  jwtSecret: jwtSecret || 'fallback_secret_for_dev_mode_only',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  nodeEnv,
  isProduction,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  vapiApiKey: process.env.VAPI_API_KEY || '',
  vapiAssistantId: process.env.VAPI_ASSISTANT_ID || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayEnabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  mailerHost: process.env.SMTP_HOST || process.env.MAIL_HOST || '',
  mailerPort: parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10),
  mailerSecure: process.env.SMTP_SECURE === 'true' || process.env.MAIL_SECURE === 'true',
  mailerUser: process.env.SMTP_USER || process.env.MAIL_USER || '',
  mailerPass: process.env.SMTP_PASS || process.env.MAIL_PASS || '',
  mailerFrom: process.env.MAIL_FROM || process.env.SMTP_FROM || 'AI Interview Platform <noreply@localhost>',
  mailerEnabled: Boolean((process.env.SMTP_HOST || process.env.MAIL_HOST) && (process.env.SMTP_USER || process.env.MAIL_USER) && (process.env.SMTP_PASS || process.env.MAIL_PASS)),
  clientUrl: normalizeOrigin(process.env.CLIENT_URL || allowedOrigins[0] || 'http://localhost:3001'),
  allowedOrigins,
  allowDemoLogin: process.env.ALLOW_DEMO_LOGIN === 'true' || !isProduction,
  serveStatic: process.env.SERVE_STATIC === undefined ? isProduction : process.env.SERVE_STATIC === 'true',
  maxCodeLength: parseInt(process.env.MAX_CODE_LENGTH || '65536', 10), // 64KB max submission
};

