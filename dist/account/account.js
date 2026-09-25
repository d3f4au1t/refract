(() => {
  const $ = selector => document.querySelector(selector);
  let registration, busy = false, generation = 0, loading;
  const signedOut = () => { clearPrivateData(); window.location.replace('/register/?next=account'); };
  function clearPrivateData() {
    $('#account').hidden = true; $('#sign-out').hidden = true;
    for (const id of ['profile-name', 'profile-email', 'reference', 'submitted', 'save-status']) $(`#${id}`).textContent = '';
    $('#full-name').value = ''; $('#name-form').hidden = true; registration = null;
  }
  function error(message, retry = false, signIn = false) {
    $('#error-message').textContent = message; $('#error').hidden = false;
    $('#retry').hidden = !retry; $('#sign-in').hidden = !signIn;
  }
  async function api(path, body, signal) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
    });
    if (response.status === 401) { signedOut(); throw new Error('Please sign in again.'); }
    const data = await response.json();
    if (!response.ok) {
      const failure = new Error(data.message || 'Something went wrong. Please try again.');
      failure.status = response.status; throw failure;
    }
    return data;
  }
  function showRegistration(value) {
    registration = value;
    $('#registered').hidden = !value; $('#not-registered').hidden = !!value;
    $('#edit-name').hidden = !value;
    if (!value) return;
    $('#profile-name').textContent = value.name;
    $('#reference').textContent = value.reference;
    $('#submitted').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value.createdAt));
    $('#registration-status').textContent = ({ pending: 'Registration received', approved: 'Registration approved', waitlisted: 'On the waitlist', declined: 'Registration declined' })[value.status] || value.status;
    $('#registration-note').textContent = ({ pending: 'Your form is saved. Registration does not yet confirm an event place.', approved: 'An organizer has approved your registration.', waitlisted: 'An organizer has placed your registration on the waitlist.', declined: 'Your registration was not approved. Contact the organizers if you have questions.' })[value.status] || 'Contact the organizers if you have questions about your registration.';
  }
  async function load() {
    if (busy) return;
    loading?.abort(); loading = new AbortController(); const current = ++generation;
    clearPrivateData(); $('#error').hidden = true;
    $('#page-description').textContent = 'Loading your details…';
    try {
      const data = await api('/api/registration', undefined, loading.signal);
      if (current !== generation) return;
      $('#profile-name').textContent = !data.user.name?.trim() || data.user.name === data.user.email ? 'Not provided' : data.user.name;
      $('#profile-email').textContent = data.user.email;
      $('#organizer-link').hidden = !data.user.isOrganizer;
      showRegistration(data.registration);
      $('#account').hidden = false; $('#sign-out').hidden = false;
      $('#page-description').textContent = 'Manage your details and registration.';
    } catch (failure) {
      if (current !== generation || loading.signal.aborted) return;
      $('#page-description').textContent = 'We couldn’t load your account.';
      error(failure.status === 403 ? 'Verify your email to view your account.' : 'Check your connection and try again.', true, failure.status === 403);
    }
  }
  function editing(open) {
    $('#name-form').hidden = !open; $('#edit-name').hidden = open || !registration;
    $('#error').hidden = true; $('#save-status').textContent = '';
    if (open) { $('#full-name').value = registration.name; $('#full-name').setCustomValidity(''); $('#full-name').focus(); }
    else $('#edit-name').focus();
  }
  function setBusy(value) {
    busy = value;
    for (const control of document.querySelectorAll('button, input')) control.disabled = value;
    $('#name-form').setAttribute('aria-busy', String(value));
  }
  $('#edit-name').addEventListener('click', () => editing(true));
  $('#cancel-edit').addEventListener('click', () => editing(false));
  $('#full-name').addEventListener('input', () => $('#full-name').setCustomValidity(''));
  $('#name-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !registration) return;
    const name = $('#full-name').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
      $('#full-name').setCustomValidity('Enter your name using 2–100 characters.'); $('#full-name').reportValidity(); return;
    }
    $('#error').hidden = true; setBusy(true); $('#save-name').textContent = 'Saving…';
    const current = generation;
    try {
      const data = await api('/api/registration', { name, student: true });
      if (current !== generation) return;
      showRegistration(data.registration); editing(false); $('#save-status').textContent = 'Your registered name has been updated.';
    } catch (failure) { if (current === generation && !$('#account').hidden) error(failure.message || 'Couldn’t save your name. Please try again.'); }
    finally {
      setBusy(false); $('#save-name').textContent = 'Save changes';
      if (current === generation && !$('#edit-name').hidden) $('#edit-name').focus();
    }
  });
  $('#sign-out').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true); $('#error').hidden = true;
    try { await api('/api/auth/sign-out', {}); clearPrivateData(); window.location.replace('/'); }
    catch { error('Couldn’t sign out. Please try again.'); }
    finally { setBusy(false); }
  });
  $('#retry').addEventListener('click', load);
  window.addEventListener('pagehide', () => { ++generation; loading?.abort(); clearPrivateData(); });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  // Recheck the session after returning from another tab, without discarding edits.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || busy) return;
    try { const data = await api('/api/auth/get-session'); if (!data?.user) signedOut(); } catch { /* Retry on the next interaction. */ }
  });
  load();
})();
