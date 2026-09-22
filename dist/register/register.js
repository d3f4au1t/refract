(() => {
  const $ = selector => document.querySelector(selector);
  const views = ['start', 'verify', 'details', 'complete'];
  const errorBox = $('#form-error');
  const notice = $('#service-notice');
  let config = { emailEnabled: false, googleEnabled: false };
  let pendingEmail = '';
  let resendAt = 0;
  let resendTimer;
  let account = null;
  const storageKey = 'refract-verification';
  const messages = {
    INVALID_OTP: 'That code isn’t right. Check the email and try again.',
    OTP_EXPIRED: 'That code has expired. Request a new one below.',
    TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Request a new code below.',
    EMAIL_COOLDOWN: 'Please wait a minute before requesting another code. After several requests, try again in an hour.',
    EMAIL_UNAVAILABLE: 'Email registration isn’t available yet. Please check back soon.',
    GOOGLE_UNAVAILABLE: 'Google sign-in isn’t available yet. You can use email when it’s available.',
    EMAIL_DELIVERY_FAILED: 'We couldn’t send your code. Please try again in a minute.',
    SIGN_IN_REQUIRED: 'Your session has ended. Please verify your email again.',
    EMAIL_NOT_VERIFIED: 'Please verify your email before registering.',
  };
  const readPending = () => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)); } catch { return null; }
  };
  const savePending = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ email: pendingEmail, resendAt, expiresAt: Date.now() + 600000 })); } catch { /* Storage is optional. */ }
  };
  const clearPending = () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
    clearInterval(resendTimer);
    pendingEmail = '';
    $('#code').value = '';
  };
  function showError(error) {
    errorBox.textContent = messages[error.code] || error.message || 'Something went wrong. Please try again.';
    errorBox.hidden = false;
    errorBox.focus({ preventScroll: true });
    errorBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
    document.querySelectorAll('[aria-invalid]').forEach(element => element.removeAttribute('aria-invalid'));
  }
  function showView(view, focus = true) {
    notice.hidden = view !== 'start' || !notice.textContent;
    views.forEach(name => { $(`#${name}-view`).hidden = name !== view; });
    const title = view === 'start' ? $('#registration-title') : $(`#${view}-title`);
    $('.registration-panel').setAttribute('aria-labelledby', title.id);
    $('.registration-panel').classList.toggle('is-complete', view === 'complete');
    document.querySelectorAll('[data-step]').forEach(step => {
      const active = (view === 'start' || view === 'verify') ? '1' : '2';
      if (step.dataset.step === active) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    if (focus) title.focus({ preventScroll: true });
  }
  async function api(path, body) {
    let response;
    try {
      response = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
    } catch { throw new Error('Couldn’t reach Refract. Check your connection and try again.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(response.status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'We couldn’t complete that request. Please try again.');
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  async function busy(button, action) {
    if (button.disabled) return;
    clearError();
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try { await action(); }
    catch (error) {
      if (error.code === 'SIGN_IN_REQUIRED') { account = null; clearPending(); showView('start'); }
      if (['INVALID_OTP', 'OTP_EXPIRED', 'TOO_MANY_ATTEMPTS'].includes(error.code)) $('#code').setAttribute('aria-invalid', 'true');
      showError(error);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
  function updateResend() {
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    const button = $('#resend-code');
    if (button.getAttribute('aria-busy') === 'true') return;
    button.disabled = seconds > 0;
    button.textContent = seconds ? `Resend code (${seconds}s)` : 'Resend code';
    if (!seconds) clearInterval(resendTimer);
  }
  function showVerification(focus = true) {
    $('#verification-email').textContent = pendingEmail;
    showView('verify', false);
    clearInterval(resendTimer);
    updateResend();
    resendTimer = setInterval(updateResend, 1000);
    if (focus) $('#code').focus({ preventScroll: true });
  }
  function showAccount(data, focus = true) {
    account = data;
    clearPending();
    document.querySelectorAll('.account-email').forEach(element => { element.textContent = data.user.email; });
    $('#full-name').value = data.registration?.name || (data.user.name !== data.user.email ? data.user.name : '') || '';
    $('#prisms-student').checked = Boolean(data.registration);
    if (data.registration) {
      $('#registered-name').textContent = data.registration.name;
      $('#registration-reference').textContent = data.registration.reference;
      showView('complete', focus);
    } else showView('details', focus);
    notice.hidden = true;
  }
  $('#email-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!config.emailEnabled) return;
    const email = $('#email').value.trim().toLowerCase();
    busy(event.currentTarget.querySelector('button'), async () => {
      await api('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
      pendingEmail = email;
      resendAt = Date.now() + 60000;
      savePending();
      $('#verification-status').textContent = '';
      showVerification();
    });
  });
  $('#code-form').addEventListener('submit', event => {
    event.preventDefault();
    busy(event.currentTarget.querySelector('button'), async () => {
      await api('/api/auth/sign-in/email-otp', { email: pendingEmail, otp: $('#code').value.trim() });
      showAccount(await api('/api/registration'));
    });
  });
  $('#code').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
    event.target.removeAttribute('aria-invalid');
  });
  $('#resend-code').addEventListener('click', event => busy(event.currentTarget, async () => {
    await api('/api/auth/email-otp/send-verification-otp', { email: pendingEmail, type: 'sign-in' });
    resendAt = Date.now() + 60000;
    savePending();
    $('#code').value = '';
    $('#verification-status').textContent = 'A new code is on its way. Use the most recent email.';
    showVerification();
  }).then(updateResend));
  $('#change-email').addEventListener('click', () => {
    clearPending(); clearError(); showView('start', false); $('#email').focus();
  });
  $('#google-sign-in').addEventListener('click', event => busy(event.currentTarget, async () => {
    const data = await api('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/register/', errorCallbackURL: '/register/?error=google', disableRedirect: true });
    const url = new URL(data.url);
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new Error('Couldn’t open Google sign-in. Please try again.');
    window.location.assign(url.href);
  }));
  $('#details-form').addEventListener('submit', event => {
    event.preventDefault();
    busy(event.currentTarget.querySelector('button'), async () => {
      showAccount(await api('/api/registration', { name: $('#full-name').value.trim(), student: $('#prisms-student').checked }));
    });
  });
  $('#edit-details').addEventListener('click', () => { clearError(); showView('details'); });
  document.querySelectorAll('.sign-out').forEach(button => button.addEventListener('click', () => busy(button, async () => {
    await api('/api/auth/sign-out', {});
    account = null; clearPending(); window.location.replace('/register/');
  })));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pendingEmail) updateResend(); });
  async function initialize() {
    try {
      config = await api('/api/registration/config');
      $('#google-sign-in').disabled = !config.googleEnabled;
      $('#email').disabled = !config.emailEnabled;
      $('#email-form button').disabled = !config.emailEnabled;
      if (!config.googleEnabled || !config.emailEnabled) {
        notice.textContent = !config.googleEnabled && !config.emailEnabled
          ? 'Registration is being set up. Please check back soon.'
          : !config.googleEnabled ? 'Google sign-in is coming soon. You can register with email below.' : 'Email verification is coming soon. You can continue with Google.';
        notice.hidden = false;
      }
      try { showAccount(await api('/api/registration'), false); return; }
      catch (error) { if (error.status !== 401) throw error; }
      const pending = readPending();
      if (config.emailEnabled && pending?.expiresAt > Date.now() && typeof pending.email === 'string') {
        pendingEmail = pending.email; resendAt = Number(pending.resendAt) || 0; showVerification(false);
      }
      if (new URLSearchParams(location.search).has('error')) {
        showError(new Error('Google sign-in wasn’t completed. Try again, or use your email.'));
        history.replaceState(null, '', '/register/');
      }
    } catch (error) {
      notice.textContent = 'Registration is temporarily unavailable. Please try again shortly.';
      notice.hidden = false;
      showError(error);
    }
  }
  initialize();
})();
