import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { readConfig } from '../server/config.mjs';
import { verificationEmail } from '../server/email.mjs';

async function fixture(t, options = {}) {
  const emails = [];
  const config = { baseURL: 'http://localhost:3001', secret: randomBytes(32).toString('hex'), databasePath: ':memory:', ...options.config };
  const service = await createApp(config, { sendEmail: options.unavailable ? null : options.sendEmail || (async message => emails.push(message)) });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); service.close(); });
  const request = async (path, body, cookie, origin = config.baseURL) => {
    const headers = { 'x-real-ip': '127.0.0.1' };
    if (origin) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers, cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  };
  const send = email => request('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
  const verify = (email, otp) => request('/api/auth/sign-in/email-otp', { email, otp });
  return { ...service, request, send, verify, emails, config };
}

test('unconfigured providers fail honestly and cannot create an account', async t => {
  const f = await fixture(t, { unavailable: true });
  assert.deepEqual((await f.request('/api/registration/config')).data, { googleEnabled: false, emailEnabled: false });
  assert.equal((await f.send('student@example.com')).status, 503);
  assert.equal((await f.request('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/register/' })).status, 503);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
  assert.equal((await f.request('/api/registration')).status, 401);
});

test('email verification, registration, editing and sign-out work end to end', async t => {
  const f = await fixture(t);
  assert.equal((await f.send(' Student@Example.com ')).status, 200);
  const { email, otp } = f.emails[0];
  assert.equal(email, 'student@example.com');
  assert.match(otp, /^\d{6}$/);
  assert.ok(!f.db.prepare('SELECT value FROM verification').get().value.includes(otp));
  const before = f.db.prepare('SELECT value FROM verification').get().value;
  assert.equal((await f.send(email)).status, 429);
  assert.equal(f.db.prepare('SELECT value FROM verification').get().value, before, 'cooldown preserves the already emailed code');
  assert.equal((await f.verify(email, otp === '000000' ? '111111' : '000000')).status, 400);
  const verified = await f.verify(email, otp);
  assert.equal(verified.status, 200);
  assert.ok(verified.data.user.emailVerified);
  assert.match(verified.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(verified.headers.get('set-cookie'), /SameSite=Lax/i);
  const cookie = verified.cookie;
  assert.equal((await f.verify(email, otp)).status, 400, 'codes are single use');
  assert.equal((await f.request('/api/registration', { name: 'Student Name', student: false }, cookie)).status, 400);
  const saved = await f.request('/api/registration', { name: ' Student   Name ', student: true, user_id: 'someone-else' }, cookie);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.registration.name, 'Student Name');
  assert.equal(saved.data.registration.status, 'pending');
  assert.match(saved.data.registration.reference, /^RF-[A-F0-9]{8}$/);
  const edit = await f.request('/api/registration', { name: 'Updated Name', student: true }, cookie);
  assert.equal(edit.data.registration.reference, saved.data.registration.reference);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count, 1);
  assert.equal((await f.request('/api/registration', undefined, cookie)).data.registration.name, 'Updated Name');
  assert.equal((await f.request('/api/auth/sign-out', {}, cookie)).status, 200);
  assert.equal((await f.request('/api/registration', undefined, cookie)).status, 401);
});

test('forged origins, missing verification, and unused auth endpoints are rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/auth/email-otp/send-verification-otp', { email: 'test@example.com', type: 'sign-in' }, null, 'https://attacker.example')).status, 403);
  assert.equal((await f.request('/api/registration', { name: 'Forged Name', student: true }, null, null)).status, 403);
  assert.equal((await f.request('/api/registration', { name: 'Forged Name', student: true })).status, 401);
  assert.equal((await f.request('/api/auth/update-user', { name: 'Forged Name' })).status, 404);
  assert.equal((await f.send('not-an-email')).status, 400);
  assert.equal((await f.request('/api/auth/email-otp/send-verification-otp', { email: 'test@example.com', type: 'forget-password' })).status, 400);
  assert.equal(f.emails.length, 0);
});

test('expired codes and exhausted attempts cannot establish sessions', async t => {
  const f = await fixture(t);
  await f.send('expired@example.com');
  f.db.prepare('UPDATE verification SET expiresAt = ?').run(Date.now() - 10000);
  assert.notEqual((await f.verify('expired@example.com', f.emails[0].otp)).status, 200);
  await f.send('guessed@example.com');
  const otp = f.emails[1].otp;
  for (let attempt = 0; attempt < 6; attempt++) {
    assert.notEqual((await f.verify('guessed@example.com', otp === '000000' ? '111111' : '000000')).status, 200);
  }
  assert.notEqual((await f.verify('guessed@example.com', otp)).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
});

test('provider delivery failures are not reported as successful sends', async t => {
  const f = await fixture(t, { sendEmail: async () => { throw new Error('Provider rejected message'); } });
  const response = await f.send('delivery@example.com');
  assert.equal(response.status, 503);
  assert.equal(response.data.code, 'EMAIL_DELIVERY_FAILED');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 0);
});

test('Google authorization creates a protected OAuth flow and rejects an untrusted callback', async t => {
  const f = await fixture(t, { config: { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'test-client-secret' } });
  const response = await f.request('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/register/', disableRedirect: true });
  assert.equal(response.status, 200);
  const url = new URL(response.data.url);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3001/api/auth/callback/google');
  assert.ok(url.searchParams.get('state'));
  assert.ok(url.searchParams.get('code_challenge'));
  assert.ok(!url.searchParams.get('scope').includes('gmail'));
  assert.equal((await f.request('/api/auth/sign-in/social', { provider: 'google', callbackURL: 'https://attacker.example', disableRedirect: true })).status, 403);
});

test('production configuration requires HTTPS and strong secrets', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production', BETTER_AUTH_URL: 'http://example.com', BETTER_AUTH_SECRET: 'x'.repeat(32) }));
  assert.throws(() => readConfig({ BETTER_AUTH_SECRET: 'short' }));
  const config = readConfig({ NODE_ENV: 'production', BETTER_AUTH_URL: 'https://18.188.82.113', BETTER_AUTH_SECRET: 'x'.repeat(32), GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' });
  assert.equal(config.googleClientId, '', 'Google cannot use a public IP callback');
  assert.match(verificationEmail('123456').text, /123456/);
  assert.throws(() => verificationEmail('<html>'));
});

test('HTTPS deployments issue secure session cookies', async t => {
  const f = await fixture(t, { config: { baseURL: 'https://registration.example' } });
  await f.send('secure@example.com');
  const verified = await f.verify('secure@example.com', f.emails[0].otp);
  assert.equal(verified.status, 200);
  assert.match(verified.headers.get('set-cookie'), /; Secure/i);
  assert.match(verified.headers.get('set-cookie'), /HttpOnly/i);
});
