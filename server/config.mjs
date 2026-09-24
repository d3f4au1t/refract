import { resolve } from 'node:path';
import { isIP } from 'node:net';

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const url = new URL(env.BETTER_AUTH_URL || 'http://localhost:3001');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BETTER_AUTH_URL must be a plain http(s) origin.');
  }
  if (production && url.protocol !== 'https:') throw new Error('Production requires an HTTPS BETTER_AUTH_URL.');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const googleHostAllowed = !isIP(hostname) || ['127.0.0.1', '::1'].includes(hostname);
  return {
    production, port, host: env.HOST || '127.0.0.1', baseURL: url.origin,
    secret: env.BETTER_AUTH_SECRET,
    databasePath: resolve(env.DATABASE_PATH || '.data/refract.sqlite'),
    githubClientId: env.GITHUB_CLIENT_ID || '',
    githubClientSecret: env.GITHUB_CLIENT_SECRET || '',
    resendKey: env.RESEND_API_KEY || '', sender: env.RESEND_FROM_EMAIL || '',
    googleClientId: googleHostAllowed ? env.GOOGLE_CLIENT_ID || '' : '',
    googleClientSecret: googleHostAllowed ? env.GOOGLE_CLIENT_SECRET || '' : '',
  };
}
