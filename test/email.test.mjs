import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailSender } from '../server/email.mjs';

const config = { resendKey: 're_test_only', sender: 'Refract <register@example.com>' };

test('Resend receives the code and a timeout without exposing credentials in the message', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.get('authorization'), 'Bearer re_test_only');
    assert.ok(options.signal instanceof AbortSignal);
    payload = JSON.parse(options.body);
    return Response.json({ id: 'test-message-id' });
  });
  await createEmailSender(config)({ email: 'student@example.com', otp: '123456' });
  assert.deepEqual(payload.to, ['student@example.com']);
  assert.equal(payload.from, config.sender);
  assert.match(payload.text, /123456/);
  assert.ok(!payload.text.includes(config.resendKey));
  assert.ok(!payload.html.includes(config.resendKey));
});

test('unconfirmed provider responses cannot be presented as a sent email', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(createEmailSender(config)({ email: 'student@example.com', otp: '123456' }), /did not confirm/);
});

test('a timed-out provider fails instead of leaving the browser waiting indefinitely', async t => {
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 12000);
    return AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => { options.signal.throwIfAborted(); });
  t.mock.method(console, 'error', () => {});
  await assert.rejects(createEmailSender(config)({ email: 'student@example.com', otp: '123456' }), /did not confirm/);
});
