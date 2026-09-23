(() => {
  const $ = selector => document.querySelector(selector);
  const views = ['start', 'verify', 'details', 'complete', 'recover'];
  const errorBox = $('#form-error');
  const notice = $('#service-notice');
  const retryButton = $('#retry-connection');
  const requestStatus = $('#request-status');
  let config = { emailEnabled: false, googleEnabled: false };
  let pendingEmail = '';
  let resendAt = 0;
  let expiresAt = 0;
  let resendTimer;
  let requestInFlight = false;
  let currentView = 'start';
  const storageKey = 'refract-verification';
  const messages = {
    INVALID_OTP: 'That code isn’t right. Check the email and try again.',
    OTP_EXPIRED: 'That code has expired. Request a new one below.',
    TOO_MANY_ATTEMPTS: 'Too many incorrect attempts. Request a new code below.',
    EMAIL_COOLDOWN: 'Please wait before requesting another code.',
    EMAIL_UNAVAILABLE: 'Email registration isn’t available yet. Please check back soon.',
    GOOGLE_UNAVAILABLE: 'Google sign-in isn’t available yet. You can use email when it’s available.',
    EMAIL_DELIVERY_FAILED: 'We couldn’t send your code. Please try again in a minute.',
    SIGN_IN_REQUIRED: 'Your session has ended. Please verify your email again.',
    EMAIL_NOT_VERIFIED: 'Please verify your email before registering.',
    INVALID_EMAIL: 'Enter a valid email address, such as you@example.com.',
    INVALID_DETAILS: 'Enter your name and confirm that you are a current PRISMS student.',
  };
  const readPending = () => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)); } catch { return null; }
  };
  const savePending = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ email: pendingEmail, resendAt, expiresAt })); } catch { /* Storage is optional. */ }
  };
  const clearPending = () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
    clearInterval(resendTimer);
    pendingEmail = '';
    expiresAt = 0;
    $('#code').value = '';
  };
  function showError(error) {
    errorBox.textContent = messages[error.code] || error.message || 'Something went wrong. Please try again.';
    if (error.code === 'EMAIL_COOLDOWN' && error.retryAfter) {
      const minutes = Math.ceil(error.retryAfter / 60);
      errorBox.textContent = `You can request another code in ${minutes === 1 ? 'about a minute' : `about ${minutes} minutes`}. Your most recent code still works until it expires.`;
    }
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
    currentView = view;
    notice.hidden = view !== 'start' || !notice.textContent;
    retryButton.hidden = view !== 'start' || notice.hidden;
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
    const data = await response.json().catch(() => null);
    if (!data) throw new Error('Refract is temporarily unavailable. Please try again.');
    if (!response.ok) {
      const error = new Error(response.status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'We couldn’t complete that request. Please try again.');
      error.code = data.code;
      error.status = response.status;
      error.retryAfter = Math.min(3600, Math.max(0, Number(data.retryAfter || response.headers.get('Retry-After')) || 0));
      throw error;
    }
    return data;
  }
  function updateControls() {
    document.querySelectorAll('.registration-panel button, .registration-panel input').forEach(control => { control.disabled = requestInFlight; });
    $('#google-sign-in').disabled = requestInFlight || !config.googleEnabled;
    $('#email').disabled = requestInFlight || !config.emailEnabled;
    $('#email-form button').disabled = requestInFlight || !config.emailEnabled;
    updateResend();
  }
  async function busy(button, action, status) {
    if (requestInFlight || button.disabled) return;
    clearError();
    requestInFlight = true;
    updateControls();
    button.setAttribute('aria-busy', 'true');
    requestStatus.textContent = status;
    try { await action(); }
    catch (error) {
      if (error.code === 'SIGN_IN_REQUIRED') { clearPending(); showView('start'); }
      if (error.code === 'INVALID_EMAIL') $('#email').setAttribute('aria-invalid', 'true');
      if (error.code === 'INVALID_DETAILS') $('#full-name').setAttribute('aria-invalid', 'true');
      if (['INVALID_OTP', 'OTP_EXPIRED', 'TOO_MANY_ATTEMPTS'].includes(error.code)) $('#code').setAttribute('aria-invalid', 'true');
      if (['OTP_EXPIRED', 'TOO_MANY_ATTEMPTS'].includes(error.code)) { expiresAt = Date.now(); savePending(); }
      if (error.code === 'EMAIL_COOLDOWN' && pendingEmail && error.retryAfter) {
        resendAt = Date.now() + error.retryAfter * 1000;
        savePending();
      }
      showError(error);
    } finally {
      requestInFlight = false;
      requestStatus.textContent = '';
      button.removeAttribute('aria-busy');
      updateControls();
      if (currentView === 'verify' && errorBox.hidden) $('#code').focus({ preventScroll: true });
    }
  }
  function updateResend() {
    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    const button = $('#resend-code');
    button.disabled = requestInFlight || seconds > 0;
    button.textContent = seconds ? `Resend code (${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`})` : 'Resend code';
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    $('#code-help').textContent = remaining ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.` : 'This code has expired. Request a new one below.';
    $('#code-form button').disabled = requestInFlight || !remaining;
    if (!seconds && !remaining) clearInterval(resendTimer);
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
    // Returning from “Use another email” should reopen a valid code rather than
    // request another message and strand the visitor behind the send cooldown.
    if (email === pendingEmail && expiresAt > Date.now()) {
      clearError();
      showVerification();
      return;
    }
    busy(event.currentTarget.querySelector('button'), async () => {
      await api('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' });
      pendingEmail = email;
      resendAt = Date.now() + 60000;
      expiresAt = Date.now() + 600000;
      savePending();
      $('#verification-status').textContent = '';
      showVerification();
    }, 'Sending your verification code…');
  });
  $('#code-form').addEventListener('submit', event => {
    event.preventDefault();
    busy(event.currentTarget.querySelector('button'), async () => {
      try {
        await api('/api/auth/sign-in/email-otp', { email: pendingEmail, otp: $('#code').value.trim() });
      } catch (error) {
        // A lost response may still have established a session. Check it before
        // asking the visitor to submit a potentially consumed code again.
        if (!error.status) showView('recover');
        throw error;
      }
      clearPending();
      try { showAccount(await api('/api/registration')); }
      catch (error) { showView('recover'); throw error; }
    }, 'Verifying your email…');
  });
  $('#resume-registration').addEventListener('click', event => busy(event.currentTarget, async () => {
    try { showAccount(await api('/api/registration')); }
    catch (error) {
      if (error.status !== 401) throw error;
      if (pendingEmail) showVerification();
      else showView('start');
    }
  }, 'Loading your registration…'));
  const cleanCode = value => value.normalize('NFKC').replace(/\D/g, '').slice(0, 6);
  $('#code').addEventListener('input', event => {
    event.target.value = cleanCode(event.target.value);
    event.target.removeAttribute('aria-invalid');
  });
  // Normalize the whole clipboard before maxlength truncates spaces or hyphens.
  $('#code').addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text');
    if (!text) return;
    event.preventDefault();
    event.target.value = cleanCode(text);
    event.target.removeAttribute('aria-invalid');
  });
  $('#resend-code').addEventListener('click', event => busy(event.currentTarget, async () => {
    await api('/api/auth/email-otp/send-verification-otp', { email: pendingEmail, type: 'sign-in' });
    resendAt = Date.now() + 60000;
    expiresAt = Date.now() + 600000;
    savePending();
    $('#code').value = '';
    $('#verification-status').textContent = 'A new code is on its way. Use the most recent email.';
    showVerification();
  }, 'Sending a new verification code…'));
  $('#change-email').addEventListener('click', () => {
    if (requestInFlight) return;
    clearInterval(resendTimer);
    $('#code').value = '';
    clearError(); showView('start', false); updateControls(); $('#email').focus();
  });
  $('#google-sign-in').addEventListener('click', event => busy(event.currentTarget, async () => {
    const data = await api('/api/auth/sign-in/social', { provider: 'google', callbackURL: '/register/', errorCallbackURL: '/register/?error=google', disableRedirect: true });
    const url = new URL(data.url);
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new Error('Couldn’t open Google sign-in. Please try again.');
    window.location.assign(url.href);
  }, 'Opening Google sign-in…'));
  const fullName = $('#full-name');
  fullName.addEventListener('input', () => {
    fullName.setCustomValidity('');
    fullName.removeAttribute('aria-invalid');
  });
  $('#details-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = fullName.value.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
      fullName.setCustomValidity('Please enter your name (at least two characters).');
      fullName.setAttribute('aria-invalid', 'true');
      fullName.reportValidity();
      return;
    }
    busy(event.currentTarget.querySelector('button'), async () => {
      showAccount(await api('/api/registration', { name, student: $('#prisms-student').checked }));
    }, 'Saving your registration…');
  });
  $('#edit-details').addEventListener('click', () => { clearError(); showView('details'); });
  document.querySelectorAll('.sign-out').forEach(button => button.addEventListener('click', () => busy(button, async () => {
    await api('/api/auth/sign-out', {});
    clearPending(); window.location.replace('/register/');
  }, 'Signing out…')));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pendingEmail) updateResend(); });
  async function initialize() {
    if (requestInFlight) return;
    requestInFlight = true;
    clearError();
    updateControls();
    requestStatus.textContent = 'Checking registration…';
    retryButton.hidden = true;
    try {
      config = await api('/api/registration/config');
      notice.textContent = '';
      notice.hidden = true;
      if (!config.googleEnabled || !config.emailEnabled) {
        notice.textContent = !config.googleEnabled && !config.emailEnabled
          ? 'Sign-in is temporarily unavailable. Please try again shortly.'
          : !config.googleEnabled ? 'Google sign-in is unavailable. You can register with email below.' : 'Email verification is unavailable. You can continue with Google.';
        notice.hidden = false;
        retryButton.textContent = 'Check again ↻';
        retryButton.hidden = false;
      }
      try { showAccount(await api('/api/registration'), false); return; }
      catch (error) { if (error.status !== 401) throw error; }
      showView('start', false);
      const pending = readPending();
      if (config.emailEnabled && Number(pending?.expiresAt) > Date.now() - 3600000 && typeof pending.email === 'string') {
        pendingEmail = pending.email; resendAt = Number(pending.resendAt) || 0;
        expiresAt = Number(pending.expiresAt); showVerification(false);
      }
      if (new URLSearchParams(location.search).has('error')) {
        showError(new Error('Google sign-in wasn’t completed. Try again, or use your email.'));
        history.replaceState(null, '', '/register/');
      }
    } catch (error) {
      config = { emailEnabled: false, googleEnabled: false };
      showView('start', false);
      notice.textContent = 'Registration is temporarily unavailable. Please try again shortly.';
      notice.hidden = false;
      retryButton.textContent = 'Try again ↻';
      retryButton.hidden = false;
      showError(error);
    } finally {
      requestInFlight = false;
      requestStatus.textContent = '';
      updateControls();
    }
  }
  retryButton.addEventListener('click', initialize);
  window.addEventListener('pageshow', event => { if (event.persisted) initialize(); });
  initialize();
})();
