import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  return { ...service, request, send, verify, emails, config, url: `http://127.0.0.1:${server.address().port}` };
}

test('unconfigured providers fail honestly and cannot create an account', async t => {
  const f = await fixture(t, { unavailable: true });
  assert.deepEqual((await f.request('/api/registration/config')).data, { googleEnabled: false, githubEnabled: false, emailEnabled: false });
  assert.equal((await f.send('student@example.com')).status, 503);
  assert.equal((await f.request('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/register/' })).status, 503);
  const github = await f.request('/api/auth/sign-in/social', { provider: 'github', callbackURL: '/register/' });
  assert.equal(github.status, 503);
  assert.equal(github.data.code, 'GITHUB_UNAVAILABLE');
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
  const throttled = await f.send(email);
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
  assert.ok(throttled.data.retryAfter <= 60);
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
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['email', 'openid', 'profile']);
  assert.equal((await f.request('/api/auth/sign-in/social', { provider: 'google', scopes: ['https://www.googleapis.com/auth/drive'] })).status, 400);
  assert.equal((await f.request('/api/auth/sign-in/social', { provider: 'google', callbackURL: 'https://attacker.example', disableRedirect: true })).status, 403);
});

test('production configuration requires HTTPS and strong secrets', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production', BETTER_AUTH_URL: 'http://example.com', BETTER_AUTH_SECRET: 'x'.repeat(32) }));
  assert.throws(() => readConfig({ BETTER_AUTH_SECRET: 'short' }));
  const config = readConfig({ NODE_ENV: 'production', BETTER_AUTH_URL: 'https://18.188.82.113', BETTER_AUTH_SECRET: 'x'.repeat(32), GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' });
  assert.equal(config.googleClientId, '', 'Google cannot use a public IP callback');
  const ipv6 = readConfig({ NODE_ENV: 'production', BETTER_AUTH_URL: 'https://[2001:db8::1]', BETTER_AUTH_SECRET: 'x'.repeat(32), GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' });
  assert.equal(ipv6.googleClientId, '', 'IPv6 literals also cannot be Google callback hosts');
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

test('parallel requests send only one code and preserve its validity', async t => {
  const f = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.send('parallel@example.com')));
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 429).length, 7);
  assert.equal(f.emails.length, 1);
  assert.equal((await f.verify('parallel@example.com', f.emails[0].otp)).status, 200);
});

test('resending replaces the previous code and hourly limits report the actual wait', async t => {
  const f = await fixture(t);
  const email = 'resend@example.com';
  for (let i = 0; i < 5; i++) {
    f.db.prepare('UPDATE email_cooldown SET next_allowed = 0').run();
    assert.equal((await f.send(email)).status, 200);
  }
  assert.equal(f.emails.length, 5);
  f.db.prepare('UPDATE email_cooldown SET next_allowed = 0').run();
  const throttled = await f.send(email);
  assert.equal(throttled.status, 429);
  assert.ok(throttled.data.retryAfter > 3500, 'hourly limit is not presented as a one-minute wait');
  assert.equal(Number(throttled.headers.get('retry-after')), throttled.data.retryAfter);
  const latest = f.emails[4].otp;
  const old = f.emails.find(message => message.otp !== latest)?.otp;
  assert.ok(old);
  assert.equal((await f.verify(email, old)).status, 400);
  assert.equal((await f.verify(email, latest)).status, 200);
});

test('verified participants can only read and edit their own registration', async t => {
  const f = await fixture(t);
  await f.send('first@example.com');
  const first = await f.verify('first@example.com', f.emails[0].otp);
  const firstRecord = await f.request('/api/registration', { name: 'First Student', student: true }, first.cookie);
  await f.send('second@example.com');
  const second = await f.verify('second@example.com', f.emails[1].otp);
  assert.equal((await f.request('/api/registration', undefined, second.cookie)).data.registration, null);
  const secondRecord = await f.request('/api/registration', { name: 'Second Student', student: true, user_id: first.data.user.id }, second.cookie);
  assert.notEqual(secondRecord.data.registration.reference, firstRecord.data.registration.reference);
  const unchanged = await f.request('/api/registration', undefined, first.cookie);
  assert.equal(unchanged.data.registration.name, 'First Student');
  assert.equal(unchanged.data.user.email, 'first@example.com');
});

test('simultaneous verification requests consume a code only once', async t => {
  const f = await fixture(t);
  await f.send('race@example.com');
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.verify('race@example.com', f.emails[0].otp)));
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 1);
});

test('expired sessions and unverified accounts cannot read or change a registration', async t => {
  const f = await fixture(t);
  await f.send('session@example.com');
  const { cookie } = await f.verify('session@example.com', f.emails[0].otp);
  await f.request('/api/registration', { name: 'Session Student', student: true }, cookie);
  f.db.prepare('UPDATE user SET emailVerified = 0').run();
  assert.equal((await f.request('/api/registration', undefined, cookie)).status, 403);
  assert.equal((await f.request('/api/registration', { name: 'Not Allowed', student: true }, cookie)).status, 403);
  f.db.prepare('UPDATE user SET emailVerified = 1').run();
  f.db.prepare('UPDATE session SET expiresAt = ?').run(Date.now() - 1000);
  assert.equal((await f.request('/api/registration', undefined, cookie)).status, 401);
  assert.equal((await f.request('/api/registration', { name: 'Not Allowed', student: true }, cookie)).status, 401);
  assert.equal(f.db.prepare('SELECT name FROM registrations').get().name, 'Session Student');
});

test('parallel registration submissions keep one receipt and do not accept forged status', async t => {
  const f = await fixture(t);
  await f.send('duplicate@example.com');
  const { cookie } = await f.verify('duplicate@example.com', f.emails[0].otp);
  const results = await Promise.all(Array.from({ length: 8 }, () => f.request('/api/registration', {
    name: 'Duplicate Student', student: true, status: 'approved', reference: 'FORGED',
  }, cookie)));
  assert.ok(results.every(r => r.status === 200 && r.data.registration.status === 'pending'));
  assert.equal(new Set(results.map(r => r.data.registration.reference)).size, 1);
  assert.notEqual(results[0].data.registration.reference, 'FORGED');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count, 1);
});

test('invalid details, malformed JSON, and oversized requests fail without saving data', async t => {
  const f = await fixture(t);
  await f.send('validation@example.com');
  const { cookie } = await f.verify('validation@example.com', f.emails[0].otp);
  for (const name of ['', '  ', 'A', 'x'.repeat(101), 'Invalid\u0000Name', null, { name: 'object' }]) {
    assert.equal((await f.request('/api/registration', { name, student: true }, cookie)).status, 400);
  }
  for (const student of [false, 'true', 1, null]) {
    assert.equal((await f.request('/api/registration', { name: 'Valid Name', student }, cookie)).status, 400);
  }
  const headers = { origin: f.config.baseURL, cookie, 'content-type': 'application/json' };
  assert.equal((await fetch(`${f.url}/api/registration`, { method: 'POST', headers, body: '{"name":' })).status, 400);
  assert.equal((await fetch(`${f.url}/api/registration`, { method: 'POST', headers, body: JSON.stringify({ name: 'x'.repeat(9000), student: true }) })).status, 413);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count, 0);
});

test('IP throttling limits sends across different addresses', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 40; i++) assert.equal((await f.send(`limit-${i}@example.com`)).status, 200);
  const blocked = await f.send('over-limit@example.com');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('x-retry-after')) > 0);
  assert.equal(f.emails.length, 40);
});

test('cross-origin writes cannot consume a valid code or sign out a session', async t => {
  const f = await fixture(t);
  await f.send('origin@example.com');
  const body = { email: 'origin@example.com', otp: f.emails[0].otp };
  assert.equal((await f.request('/api/auth/sign-in/email-otp', body, null, 'https://untrusted.example')).status, 403);
  const verified = await f.verify(body.email, body.otp);
  assert.equal(verified.status, 200);
  assert.equal((await f.request('/api/auth/sign-out', {}, verified.cookie, 'https://untrusted.example')).status, 403);
  assert.equal((await f.request('/api/registration', undefined, verified.cookie)).status, 200);
});

test('a SQLite backup restores registrations and sessions in a fresh service', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'refract-restore-'));
  const f = await fixture(t);
  await f.send('restore@example.com');
  const { cookie } = await f.verify('restore@example.com', f.emails[0].otp);
  const saved = await f.request('/api/registration', { name: 'Restore Student', student: true }, cookie);
  const databasePath = join(directory, 'restored.sqlite');
  f.db.prepare('VACUUM INTO ?').run(databasePath);
  const restored = await createApp({ ...f.config, databasePath }, { sendEmail: null });
  try {
    const session = await restored.auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session.user.email, 'restore@example.com');
    const registration = restored.db.prepare('SELECT reference, name, status FROM registrations WHERE user_id = ?').get(session.user.id);
    assert.equal(registration.reference, saved.data.registration.reference);
    assert.equal(registration.name, 'Restore Student');
    assert.equal(registration.status, 'pending');
  } finally { restored.close(); rmSync(directory, { recursive: true, force: true }); }
});

const githubConfig = { githubClientId: 'test-github-client', githubClientSecret: 'test-github-secret' };

// Mock only GitHub's network responses; exercise the real OAuth state, token
// exchange, profile mapping, cookies, database and registration endpoints.
function mockGitHub(t, { verified = true, email = 'github-student@example.com' } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!['github.com', 'api.github.com'].includes(url.hostname)) return originalFetch(input, init);
    calls.push(url.href);
    if (url.href === 'https://github.com/login/oauth/access_token') {
      assert.match(String(init.body), /code=test-code/);
      return Response.json({ access_token: 'test-only-github-token', token_type: 'bearer', scope: 'read:user,user:email' });
    }
    if (url.href === 'https://api.github.com/user') return Response.json({ id: 12345, login: 'test-student', name: 'GitHub Student', email: null, avatar_url: 'https://avatars.githubusercontent.com/u/12345' });
    if (url.href === 'https://api.github.com/user/emails') return Response.json([{ email, verified, primary: true }]);
    throw new Error('Unexpected GitHub request');
  });
  return calls;
}

async function githubStart(f) {
  return f.request('/api/auth/sign-in/social', { provider: 'github', callbackURL: '/register/', errorCallbackURL: '/register/?error=github', disableRedirect: true });
}

test('GitHub works independently, uses limited scopes and protects callbacks', async t => {
  const f = await fixture(t, { unavailable: true, config: githubConfig });
  assert.deepEqual((await f.request('/api/registration/config')).data, { googleEnabled: false, githubEnabled: true, emailEnabled: false });
  const start = await githubStart(f);
  assert.equal(start.status, 200);
  const url = new URL(start.data.url);
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3001/api/auth/callback/github');
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['read:user', 'user:email']);
  assert.ok(url.searchParams.get('state'));
  assert.ok(url.searchParams.get('code_challenge'));
  assert.ok(start.cookie);
  for (const body of [{ provider: 'github', callbackURL: 'https://attacker.example' }, { provider: 'github', errorCallbackURL: 'https://attacker.example' }]) {
    assert.equal((await f.request('/api/auth/sign-in/social', body)).status, 403);
  }
  const extra = await fixture(t, { unavailable: true, config: githubConfig });
  assert.equal((await extra.request('/api/auth/sign-in/social', { provider: 'github', scopes: ['repo'] })).status, 400);
  assert.equal((await extra.request('/api/auth/sign-in/social', { provider: 'discord' })).status, 400);
  const denied = await f.request(`/api/auth/callback/github?error=access_denied&state=${url.searchParams.get('state')}`, undefined, start.cookie);
  assert.equal(denied.status, 302);
  assert.ok(denied.headers.get('location').includes('/register/?error='));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
});

test('GitHub private verified email completes registration and links an existing email account', async t => {
  const calls = mockGitHub(t);
  const f = await fixture(t, { config: githubConfig });
  await f.send('github-student@example.com');
  const emailSession = await f.verify('github-student@example.com', f.emails[0].otp);
  const saved = await f.request('/api/registration', { name: 'Existing Student', student: true }, emailSession.cookie);
  await f.request('/api/auth/sign-out', {}, emailSession.cookie);
  const start = await githubStart(f);
  const state = new URL(start.data.url).searchParams.get('state');
  const callback = await f.request(`/api/auth/callback/github?code=test-code&state=${state}`, undefined, start.cookie);
  assert.equal(callback.status, 302);
  assert.equal(new URL(callback.headers.get('location'), f.config.baseURL).href, 'http://localhost:3001/register/');
  assert.match(callback.cookie, /refract.session_token=/);
  const account = await f.request('/api/registration', undefined, callback.cookie);
  assert.equal(account.status, 200);
  assert.equal(account.data.user.email, 'github-student@example.com');
  assert.equal(account.data.registration.reference, saved.data.registration.reference);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 1);
  assert.notEqual(f.db.prepare("SELECT accessToken FROM account WHERE providerId = 'github'").get().accessToken, 'test-only-github-token');
  assert.equal(calls.length, 3);
  await f.request('/api/auth/callback/github?code=test-code&state=forged', undefined, start.cookie);
  assert.equal(calls.length, 3, 'invalid state must never exchange a token');
});

test('GitHub cannot register with an unverified email address', async t => {
  mockGitHub(t, { verified: false });
  const f = await fixture(t, { unavailable: true, config: githubConfig });
  const start = await githubStart(f);
  const state = new URL(start.data.url).searchParams.get('state');
  const callback = await f.request(`/api/auth/callback/github?code=test-code&state=${state}`, undefined, start.cookie);
  assert.equal(callback.status, 302);
  assert.notEqual((await f.request('/api/registration', { name: 'Unverified Student', student: true }, callback.cookie)).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM session').get().count, 0);
});


test('a new GitHub participant can register, return to the same account and sign out', async t => {
  mockGitHub(t);
  const f = await fixture(t, { unavailable: true, config: githubConfig });
  const login = async () => {
    const start = await githubStart(f);
    const state = new URL(start.data.url).searchParams.get('state');
    return f.request(`/api/auth/callback/github?code=test-code&state=${state}`, undefined, start.cookie);
  };
  const first = await login();
  assert.equal(first.status, 302);
  assert.equal((await f.request('/api/registration', undefined, first.cookie)).data.registration, null);
  const saved = await f.request('/api/registration', { name: 'GitHub Student', student: true }, first.cookie);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.registration.status, 'pending');
  assert.equal((await f.request('/api/auth/sign-out', {}, first.cookie)).status, 200);
  assert.equal((await f.request('/api/registration', undefined, first.cookie)).status, 401);
  const second = await login();
  const account = await f.request('/api/registration', undefined, second.cookie);
  assert.equal(account.data.registration.reference, saved.data.registration.reference);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM user').get().count, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count, 1);
});

function seedUser(f, id, email, name = 'Test participant') {
  f.db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').run(id, name, email, Date.now(), Date.now());
}
async function organizerFixture(t) {
  const f = await fixture(t, { config: { adminUserIds: ['organizer'] } });
  seedUser(f, 'organizer', 'organizer@example.com');
  await f.send('organizer@example.com');
  f.adminCookie = (await f.verify('organizer@example.com', f.emails.at(-1).otp)).cookie;
  assert.equal((await f.request('/api/admin/security/setup', { password: 'test-only-admin-password' }, f.adminCookie)).status, 200);
  return f;
}
test('admin data and CSV require a verified, allowlisted account and valid session', async t => {
  const f = await organizerFixture(t);
  assert.equal((await f.request('/api/registration', undefined, f.adminCookie)).data.user.isOrganizer, true);
  for (const path of ['/api/admin/registrations', '/api/admin/registrations.csv']) {
    assert.equal((await f.request(path)).status, 401);
    assert.equal((await f.request(path, undefined, f.adminCookie)).status, 200);
  }
  await f.send('other@example.com');
  const other = await f.verify('other@example.com', f.emails.at(-1).otp);
  assert.equal((await f.request('/api/registration', undefined, other.cookie)).data.user.isOrganizer, false);
  for (const path of ['/api/admin/registrations?role=admin&user_id=organizer', '/api/admin/registrations.csv']) {
    const denied = await f.request(path, undefined, other.cookie);
    assert.equal(denied.status, 403);
    assert.equal(denied.data.registrations, undefined);
  }
  f.db.prepare('UPDATE user SET emailVerified = 0 WHERE id = ?').run('organizer');
  assert.equal((await f.request('/api/admin/registrations', undefined, f.adminCookie)).status, 403);
  f.db.prepare('UPDATE user SET emailVerified = 1 WHERE id = ?').run('organizer');
  await f.request('/api/auth/sign-out', {}, f.adminCookie);
  assert.equal((await f.request('/api/admin/registrations', undefined, f.adminCookie)).status, 401);
});
test('admin access defaults to nobody, including a signed-in account', async t => {
  const f = await fixture(t);
  await f.send('owner@example.com');
  const user = await f.verify('owner@example.com', f.emails.at(-1).otp);
  assert.equal((await f.request('/api/admin/registrations', undefined, user.cookie)).status, 403);
});
test('admin directory counts submitted registrations, paginates, and searches literal input', async t => {
  const f = await organizerFixture(t);
  for (let i = 0; i < 51; i++) {
    seedUser(f, `participant-${i}`, `student${i}@example.com`);
    f.db.prepare('INSERT INTO registrations VALUES(?,?,?,1,?,?,?)').run(`participant-${i}`, `RF-${String(i).padStart(8, '0')}`, i === 0 ? 'Avery %_ Special' : `Participant ${i}`, 'pending', new Date(1700000000000 + i * 1000).toISOString(), new Date().toISOString());
  }
  const get = query => f.request(`/api/admin/registrations${query}`, undefined, f.adminCookie);
  const first = await get('');
  assert.equal(first.data.summary.total, 51, 'organizer who only signed in is excluded');
  assert.equal(first.data.registrations.length, 50);
  assert.equal(first.data.registrations[0].email, 'student50@example.com');
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const last = await get('?page=9999');
  assert.equal(last.data.page, 2); assert.equal(last.data.registrations.length, 1);
  assert.equal((await get('?q=AVERY')).data.matched, 1);
  assert.equal((await get('?q=%25_')).data.matched, 1);
  assert.equal((await get('?q=%27%20OR%201%3D1--')).data.matched, 0);
  assert.equal((await get('?sort=oldest')).data.registrations[0].email, 'student0@example.com');
  assert.equal((await get('?sort=name')).data.registrations[0].name, 'Avery %_ Special');
  for (const query of ['?page=0', '?page=-1', '?page=1&page=2', '?sort=DROP', '?q=a&q=b']) assert.equal((await get(query)).status, 400);
  const csv = await f.request('/api/admin/registrations.csv', undefined, f.adminCookie);
  assert.equal(csv.status, 200);
  assert.equal(csv.data.trim().split('\r\n').length, 52, 'export includes all pages');
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert.equal(csv.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(first.data.registrations[0]).sort(), ['createdAt','email','name','reference','status','studentConfirmed','updatedAt'].sort());
});
test('CSV quotes participant content and prevents spreadsheet formula execution', async t => {
  const f = await organizerFixture(t);
  seedUser(f, 'csv-user', 'csv@example.com');
  f.db.prepare('INSERT INTO registrations VALUES(?,?,?,1,?,?,?)').run('csv-user', 'RF-12345678', '  =SUM(1,2)\n"name"', 'pending', new Date().toISOString(), new Date().toISOString());
  const csv = await f.request('/api/admin/registrations.csv?q=csv%40', undefined, f.adminCookie);
  assert.equal(csv.status, 200);
  assert.ok(csv.data.includes('"\'  =SUM(1,2)\n""name"""'));
  assert.ok(csv.data.includes('csv@example.com'));
});

test('all admin data and mutations require the extra session-bound password', async t => {
  const f = await organizerFixture(t);
  const get = (path, body) => f.request(path,body,f.adminCookie);
  assert.equal((await get('/api/admin/security')).data.unlocked,true);
  const stored=f.db.prepare('SELECT * FROM admin_password').get();
  assert.notEqual(stored.hash,'test-only-admin-password');assert.equal(stored.hash.length,128);
  assert.equal((await get('/api/admin/security/setup',{password:'overwrite-admin-password'})).status,409);
  await get('/api/admin/security/lock',{});
  seedUser(f,'target','target@example.com');
  for(const path of ['/api/admin/accounts','/api/admin/traffic','/api/admin/activity','/api/admin/registrations','/api/admin/registrations.csv']) assert.equal((await get(path)).status,428);
  for(const action of ['edit','admin','delete','revoke-sessions']) assert.equal((await get(`/api/admin/accounts/target/${action}`,{})).status,428);
  assert.equal((await get('/api/admin/security/unlock',{password:'wrong-password'})).status,400);
  assert.equal((await get('/api/admin/security/unlock',{password:'test-only-admin-password'})).status,200);
  assert.equal((await get('/api/admin/accounts')).status,200);
  f.db.prepare('UPDATE admin_unlocks SET expires_at=0').run();
  assert.equal((await get('/api/admin/accounts')).status,428);
  for(let i=0;i<5;i++)assert.equal((await get('/api/admin/security/unlock',{password:'wrong-password'})).status,400);
  assert.equal((await get('/api/admin/security/unlock',{password:'test-only-admin-password'})).status,429);
  f.db.prepare('DELETE FROM admin_password_attempts').run();
  assert.equal((await f.request('/api/admin/security/unlock',{password:'test-only-admin-password'},f.adminCookie,'https://attacker.example')).status,403);
  // A second sign-in does not inherit an existing session's unlock.
  await get('/api/admin/security/unlock',{password:'test-only-admin-password'});
  f.db.prepare('DELETE FROM email_cooldown').run();await f.send('organizer@example.com');
  const otherSession=await f.verify('organizer@example.com',f.emails.at(-1).otp);
  assert.equal((await f.request('/api/admin/accounts',undefined,otherSession.cookie)).status,428);
});

test('admins can edit names and registration status, grant and revoke access immediately',async t=>{
  const f=await organizerFixture(t);
  await f.send('participant@example.com');const member=await f.verify('participant@example.com',f.emails.at(-1).otp),id=member.data.user.id;
  const registration=await f.request('/api/registration',{name:'Original Student',student:true},member.cookie);
  const url=`/api/admin/accounts/${id}`,admin=(path,body)=>f.request(path,body,f.adminCookie);
  let result=await admin('/api/admin/accounts');assert.equal(result.data.summary.accounts,2);assert.equal(result.data.summary.admins,1);
  assert.equal(result.data.accounts.find(a=>a.id===id).isAdmin,0);
  result=await admin(url+'/edit',{name:'New Profile',registeredName:'New Registration',status:'approved'});assert.equal(result.status,200);
  assert.equal(result.data.account.reference,registration.data.registration.reference);
  result=await f.request('/api/registration',undefined,member.cookie);assert.equal(result.data.registration.status,'approved');assert.equal(result.data.registration.name,'New Registration');
  assert.equal((await admin(url+'/edit',{name:'New Profile',email:'attacker@example.com',registeredName:'New Registration',status:'approved'})).status,400);
  assert.equal((await admin(url+'/edit',{name:'X',registeredName:'New Registration',status:'approved'})).status,400);
  assert.equal((await admin(url+'/admin',{enabled:true})).status,200);
  assert.equal((await f.request('/api/registration',undefined,member.cookie)).data.user.isOrganizer,true);
  assert.equal((await f.request('/api/admin/accounts',undefined,member.cookie)).status,428);
  assert.equal((await f.request('/api/admin/security/unlock',{password:'test-only-admin-password'},member.cookie)).status,200);
  assert.equal((await f.request('/api/admin/accounts',undefined,member.cookie)).status,200);
  assert.equal((await admin(url+'/admin',{enabled:false})).status,200);
  assert.equal((await f.request('/api/admin/accounts',undefined,member.cookie)).status,403);
  assert.equal((await f.request('/api/registration',undefined,member.cookie)).data.user.isOrganizer,false);
  for(const [action,body] of [['admin',{enabled:false}],['delete',{confirmEmail:'organizer@example.com'}],['revoke-sessions',{}]]) assert.equal((await admin(`/api/admin/accounts/organizer/${action}`,body)).status,409);
  f.db.prepare('UPDATE user SET emailVerified=0 WHERE id=?').run(id);
  assert.equal((await admin(url+'/admin',{enabled:true})).status,409);
  assert.equal((await admin('/api/admin/accounts?role=admin')).data.matched,1);
  assert.equal((await admin('/api/admin/accounts?q=NEW')).data.matched,1);
  assert.equal((await admin('/api/admin/accounts?page=0')).status,400);
  assert.equal((await admin('/api/admin/activity')).data.events.length,3);
});

test('activity records identities, immutable changed values, no-op edits and legacy entries',async t=>{
  const f=await organizerFixture(t);seedUser(f,'audit-target','audit@example.com','Original Profile');
  const stamp=new Date().toISOString();
  f.db.prepare('INSERT INTO registrations VALUES(?,?,?,1,?,?,?)').run('audit-target','RF-ABC12345','Original Student','pending',stamp,stamp);
  const admin=(path,body)=>f.request(path,body,f.adminCookie),url='/api/admin/accounts/audit-target';
  const update={name:'Updated Profile',registeredName:'Updated Student',status:'approved'};
  assert.equal((await admin(url+'/edit',update)).status,200);
  let events=(await admin('/api/admin/activity')).data.events,event=events[0];
  assert.equal(event.actorId,'organizer');assert.equal(event.actorEmail,'organizer@example.com');
  assert.equal(event.targetId,'audit-target');assert.equal(event.targetEmail,'audit@example.com');assert.equal(event.reference,'RF-ABC12345');
  assert.ok(Number.isFinite(Date.parse(event.createdAt)));
  assert.deepEqual(event.details.changes,[
    {field:'Account name',before:'Original Profile',after:'Updated Profile'},
    {field:'Registration name',before:'Original Student',after:'Updated Student'},
    {field:'Registration status',before:'pending',after:'approved'}
  ]);
  await admin(url+'/edit',update);
  events=(await admin('/api/admin/activity')).data.events;
  assert.deepEqual(events[0].details.changes,[]);assert.deepEqual(events[1].details,event.details);
  await admin(url+'/admin',{enabled:true});
  assert.deepEqual((await admin('/api/admin/activity')).data.events[0].details.changes,[{field:'Admin access',before:'Participant',after:'Admin'}]);
  await admin(url+'/admin',{enabled:false});
  assert.deepEqual((await admin('/api/admin/activity')).data.events[0].details.changes,[{field:'Admin access',before:'Admin',after:'Participant'}]);
  f.db.prepare('INSERT INTO admin_activity(actor_id,target_id,action,created_at) VALUES(?,?,?,?)').run('organizer','audit-target','Account details updated',stamp);
  assert.equal((await admin('/api/admin/activity')).data.events[0].details,null);
});

test('account deletion requires exact confirmation, removes sign-ins, and invalidates sessions',async t=>{
  const f=await organizerFixture(t);
  await f.send('delete@example.com');const member=await f.verify('delete@example.com',f.emails.at(-1).otp),id=member.data.user.id;
  await f.request('/api/registration',{name:'Delete Student',student:true},member.cookie);
  f.db.prepare('INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('linked-github','test-provider-id','github',id,Date.now(),Date.now());
  const url=`/api/admin/accounts/${id}`;
  await f.request(url+'/edit',{name:'Private Previous Name',registeredName:'Private Registration Name',status:'approved'},f.adminCookie);
  const sessionCount=f.db.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get(id).n;
  const providerCount=f.db.prepare('SELECT COUNT(*) AS n FROM account WHERE userId=?').get(id).n;
  assert.equal((await f.request(url+'/delete',{confirmEmail:'wrong@example.com'},f.adminCookie)).status,400);
  assert.equal((await f.request(url+'/delete',{confirmEmail:'delete@example.com'},member.cookie)).status,403);
  assert.equal((await f.request(url+'/delete',{confirmEmail:'delete@example.com'},f.adminCookie,'https://attacker.example')).status,403);
  assert.equal((await f.request(url+'/delete',{confirmEmail:'delete@example.com'},f.adminCookie)).status,200);
  for(const [table,col] of [['user','id'],['account','userId'],['session','userId'],['registrations','user_id']])assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col}=?`).get(id).n,0);
  assert.equal((await f.request('/api/registration',undefined,member.cookie)).status,401);
  assert.equal((await f.request(url+'/delete',{confirmEmail:'delete@example.com'},f.adminCookie)).status,404);
  const log=(await f.request('/api/admin/activity',undefined,f.adminCookie)).data.events;
  assert.equal(log[0].target,'Deleted account');assert.equal(JSON.stringify(log).includes('delete@example.com'),false);
  assert.equal(JSON.stringify(log).includes('Private Previous Name'),false);assert.equal(JSON.stringify(log).includes('Private Registration Name'),false);
  assert.equal(log[1].details,null);
  assert.deepEqual(log[0].details.facts,[{label:'Registration removed',value:'Yes'},{label:'Provider links removed',value:providerCount},{label:'Sessions revoked',value:sessionCount},{label:'Admin access removed',value:'No'}]);
});

test('sign out all devices preserves the account and registration',async t=>{
  const f=await organizerFixture(t);await f.send('sessions@example.com');const member=await f.verify('sessions@example.com',f.emails.at(-1).otp);
  await f.request('/api/registration',{name:'Session Student',student:true},member.cookie);
  const count=f.db.prepare('SELECT COUNT(*) AS n FROM session WHERE userId=?').get(member.data.user.id).n;
  assert.equal((await f.request(`/api/admin/accounts/${member.data.user.id}/revoke-sessions`,{},f.adminCookie)).status,200);
  assert.equal((await f.request('/api/registration',undefined,member.cookie)).status,401);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM registrations').get().n,1);
  assert.deepEqual((await f.request('/api/admin/activity',undefined,f.adminCookie)).data.events[0].details.facts,[{label:'Sessions revoked',value:count}]);
});

test('admin roles persist across restart without re-importing removed bootstrap admins',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'refract-roles-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const config={databasePath:join(directory,'test.sqlite'),baseURL:'http://localhost:3001',secret:randomBytes(32).toString('hex'),adminUserIds:['first','second']};
  const first=await createApp(config,{sendEmail:null});
  assert.equal(first.db.prepare('SELECT COUNT(*) AS n FROM admin_roles').get().n,2);
  first.db.prepare('DELETE FROM admin_roles WHERE user_id=?').run('second');first.db.prepare('INSERT INTO admin_roles VALUES(?)').run('third');first.close();
  const second=await createApp(config,{sendEmail:null});
  try{assert.deepEqual(second.db.prepare('SELECT user_id FROM admin_roles ORDER BY user_id').all().map(r=>r.user_id),['first','third']);}finally{second.close();}
});

test('traffic deduplicates heartbeats, separates visitors, limits collection and protects reports',async t=>{
  const f=await organizerFixture(t);
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
  const ping=body=>f.request('/api/traffic',body);
  for(let i=0;i<3;i++)assert.equal((await ping({visitor:a,view:a,path:'/'})).status,204);
  await ping({visitor:a,view:b,path:'/account/'});await ping({visitor:b,view:c,path:'/'});
  let report=await f.request('/api/admin/traffic',undefined,f.adminCookie);
  assert.deepEqual(report.data.today,{views:3,visitors:2});assert.equal(report.data.active,2);assert.equal(report.data.days.length,14);
  const rows=f.db.prepare('SELECT * FROM traffic_views').all();assert.ok(rows.every(r=>r.visitor!==a&&r.visitor!==b));
  assert.equal((await ping({visitor:a,view:c,path:'/admin/'})).status,400);
  assert.equal((await ping({visitor:a,view:c,path:'/account/?email=private@example.com'})).status,400);
  assert.equal((await ping({visitor:'bad',view:c,path:'/'})).status,400);
  assert.equal((await f.request('/api/admin/traffic')).status,401);
  assert.equal((await f.request('/api/traffic',{visitor:a,view:c,path:'/'},null,'https://attacker.example')).status,403);
  const headers={'origin':f.config.baseURL,'content-type':'application/json',dnt:'1'};
  assert.equal((await fetch(f.url+'/api/traffic',{method:'POST',headers,body:JSON.stringify({visitor:c,view:c,path:'/'})})).status,204);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM traffic_views').get().n,3);
  f.db.prepare('UPDATE traffic_views SET last_seen=?').run(Date.now()-360000);
  report=await f.request('/api/admin/traffic',undefined,f.adminCookie);assert.equal(report.data.active,0);
});

test('ordinary users cannot configure or use the shared password and invalid setup stays unset',async t=>{
  const f=await fixture(t,{config:{adminUserIds:['organizer']}});seedUser(f,'organizer','organizer@example.com');
  await f.send('organizer@example.com');const admin=await f.verify('organizer@example.com',f.emails.at(-1).otp);
  assert.equal((await f.request('/api/admin/security/setup',{password:'short'},admin.cookie)).status,400);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM admin_password').get().n,0);
  await f.send('ordinary@example.com');const member=await f.verify('ordinary@example.com',f.emails.at(-1).otp);
  for(const action of ['setup','unlock','lock'])assert.equal((await f.request('/api/admin/security/'+action,{password:'shared-test-password'},member.cookie)).status,403);
  assert.equal((await f.request('/api/admin/security/setup',{password:'shared-test-password'},admin.cookie)).status,200);
  assert.equal((await f.request('/api/admin/security/unlock',{password:'shared-test-password'},member.cookie)).status,403);
});
