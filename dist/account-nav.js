(() => {
  const labels = document.querySelectorAll('#header [data-registration-label], #mobile-nav [data-registration-label]');
  const signup = document.querySelector('.hero-actions [data-registration]');
  let request;
  const render = signedIn => {
    labels.forEach(label => {
      label.textContent = signedIn ? 'Account' : 'Register';
      label.closest('a').href = signedIn ? '/account/' : '/register/';
    });
    signup.hidden = signedIn;
  };
  async function refreshAccount() {
    request?.abort();
    const current = new AbortController();
    request = current;
    try {
      const response = await fetch('/api/auth/get-session', {
        credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(10000)])
      });
      if (!response.ok) throw new Error('Session unavailable');
      const data = await response.json();
      if (!current.signal.aborted) render(Boolean(data?.session && data?.user));
    } catch {
      // Keep registration accessible if the session cannot be checked.
      if (!current.signal.aborted) render(false);
    }
  }
  window.addEventListener('pageshow', event => { if (event.persisted) refreshAccount(); });
  window.addEventListener('pagehide', () => request?.abort());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAccount(); });
  window.addEventListener('focus', refreshAccount);
  refreshAccount();
})();
