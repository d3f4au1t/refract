import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { createEmailSender } from './email.mjs';

const staticRoot = fileURLToPath(new URL('../dist', import.meta.url));
const authPaths = new Set(['/get-session', '/sign-in/social', '/callback/google', '/callback/github', '/email-otp/send-verification-otp', '/sign-in/email-otp', '/sign-out', '/ok', '/error']);
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function createApp(config, overrides = {}) {
  if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const sendEmail = Object.hasOwn(overrides, 'sendEmail') ? overrides.sendEmail : createEmailSender(config);
  const googleEnabled = Boolean(config.googleClientId && config.googleClientSecret);
  const githubEnabled = Boolean(config.githubClientId && config.githubClientSecret);
  const emailEnabled = typeof sendEmail === 'function';
  const deliveryContext = new AsyncLocalStorage();
  db.exec(`CREATE TABLE IF NOT EXISTS email_cooldown (
    key TEXT PRIMARY KEY, next_allowed INTEGER NOT NULL, window_start INTEGER NOT NULL, send_count INTEGER NOT NULL
  )`);

  const claimEmailSend = email => {
    const key = createHmac('sha256', config.secret).update(email).digest('hex');
    const now = Date.now();
    const row = db.prepare('SELECT * FROM email_cooldown WHERE key = ?').get(key);
    if (row && (row.next_allowed > now || (row.window_start > now - 3600000 && row.send_count >= 5))) {
      const nextAllowed = Math.max(row.next_allowed, row.send_count >= 5 ? row.window_start + 3600000 : 0);
      const retryAfter = Math.max(1, Math.ceil((nextAllowed - now) / 1000));
      throw new APIError('TOO_MANY_REQUESTS', { code: 'EMAIL_COOLDOWN', message: 'Please wait before requesting another code.', retryAfter }, { 'Retry-After': String(retryAfter) });
    }
    const freshWindow = !row || row.window_start <= now - 3600000;
    db.prepare(`INSERT INTO email_cooldown (key, next_allowed, window_start, send_count) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET next_allowed=excluded.next_allowed, window_start=excluded.window_start, send_count=excluded.send_count`)
      .run(key, now + 60000, freshWindow ? now : row.window_start, freshWindow ? 1 : row.send_count + 1);
  };

  const auth = betterAuth({
    appName: 'Refract', baseURL: config.baseURL, secret: config.secret, database: db,
    trustedOrigins: [config.baseURL],
    socialProviders: {
      ...(googleEnabled ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret, prompt: 'select_account' } } : {}),
      ...(githubEnabled ? { github: { clientId: config.githubClientId, clientSecret: config.githubClientSecret, requireEmailVerification: true } } : {}),
    },
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { encryptOAuthTokens: true },
    advanced: { cookiePrefix: 'refract', useSecureCookies: config.baseURL.startsWith('https:'), ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
    rateLimit: {
      enabled: true, storage: 'database', window: 60, max: 300,
      customRules: { '/email-otp/send-verification-otp': { window: 60, max: 40 }, '/sign-in/email-otp': { window: 60, max: 120 } },
    },
    logger: { disabled: true },
    onAPIError: { errorURL: `${config.baseURL}/register/` },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (ctx.path === '/email-otp/send-verification-otp') {
          if (!emailEnabled) throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_UNAVAILABLE', message: 'Email registration is not available yet.' });
          const email = normalizeEmail(ctx.body?.email);
          if (!validEmail(email) || ctx.body?.type !== 'sign-in') throw new APIError('BAD_REQUEST', { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
          ctx.body.email = email;
          // Reserve before generating a code: a throttled request must not invalidate the previous code.
          claimEmailSend(email);
        }
        if (ctx.path === '/sign-in/social') {
          const provider = ctx.body?.provider;
          if (!['google', 'github'].includes(provider)) throw new APIError('BAD_REQUEST', { code: 'INVALID_PROVIDER', message: 'Choose a supported sign-in method.' });
          if (!(provider === 'google' ? googleEnabled : githubEnabled)) {
            throw new APIError('SERVICE_UNAVAILABLE', { code: `${provider.toUpperCase()}_UNAVAILABLE`, message: 'This sign-in method is not available yet.' });
          }
          // The client cannot request extra access beyond basic profile and email.
          if (ctx.body.scopes?.length) throw new APIError('BAD_REQUEST', { code: 'INVALID_SCOPE', message: 'Additional permissions are not supported.' });
        }
      }),
    },
    plugins: [emailOTP({
      otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed',
      async sendVerificationOTP({ email, otp }) {
        if (!sendEmail) throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_UNAVAILABLE', message: 'Email registration is not available yet.' });
        try { await sendEmail({ email, otp }); }
        catch {
          const delivery = deliveryContext.getStore();
          if (delivery) delivery.failed = true;
          console.warn('Verification email delivery failed. Check the email provider configuration.');
          throw new APIError('SERVICE_UNAVAILABLE', { code: 'EMAIL_DELIVERY_FAILED', message: 'We could not send the code. Please try again in a minute.' });
        }
      },
    })],
  });
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  db.exec(`CREATE TABLE IF NOT EXISTS registrations (
    user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
    reference TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    student_confirmed INTEGER NOT NULL CHECK (student_confirmed = 1),
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  const app = express();
  // Better Auth intentionally absorbs email callback failures. Keep a per-request
  // delivery result so the UI never says a code was sent when Resend rejected it.
  const authHandler = toNodeHandler(request => deliveryContext.run({ failed: false }, async () => {
    const delivery = deliveryContext.getStore();
    const response = await auth.handler(request);
    return delivery.failed
      ? Response.json({ code: 'EMAIL_DELIVERY_FAILED', message: 'We could not send the code. Please try again in a minute.' }, { status: 503 })
      : response;
  }));
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    if (req.path.startsWith('/api/')) {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.baseURL) {
        return res.status(403).json({ code: 'INVALID_ORIGIN', message: 'Please use the registration page to continue.' });
      }
    }
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/registration/config', (_req, res) => res.json({ googleEnabled, githubEnabled, emailEnabled }));
  app.all('/api/auth/*splat', (req, res, next) => {
    const path = req.path.slice('/api/auth'.length);
    if (!authPaths.has(path)) return res.status(404).json({ message: 'Not found.' });
    return authHandler(req, res, next);
  });
  app.use(express.json({ limit: '8kb' }));
  const requireUser = async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) return res.status(401).json({ code: 'SIGN_IN_REQUIRED', message: 'Verify your email to continue.' });
    if (!session.user.emailVerified) return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email first.' });
    req.user = session.user;
    next();
  };
  const registrationFor = userId => db.prepare('SELECT reference, name, status, created_at AS createdAt FROM registrations WHERE user_id = ?').get(userId) || null;
  app.get('/api/registration', requireUser, (req, res) => {
    res.json({ user: { name: req.user.name, email: req.user.email }, registration: registrationFor(req.user.id) });
  });
  app.post('/api/registration', requireUser, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name) || req.body?.student !== true) {
      return res.status(400).json({ code: 'INVALID_DETAILS', message: 'Enter your name and confirm that you are a current PRISMS student.' });
    }
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO registrations (user_id, reference, name, student_confirmed, status, created_at, updated_at)
      VALUES (?, ?, ?, 1, 'pending', ?, ?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`)
      .run(req.user.id, `RF-${randomUUID().slice(0, 8).toUpperCase()}`, name, now, now);
    res.json({ user: { name, email: req.user.email }, registration: registrationFor(req.user.id) });
  });
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found.' }));
  app.use(express.static(resolve(staticRoot), { dotfiles: 'deny', etag: true, setHeaders(res, path) { if (path.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'The request is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request could not be read.' });
    console.error('Registration request failed.');
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  });
  return { app, auth, db, close: () => db.close() };
}
