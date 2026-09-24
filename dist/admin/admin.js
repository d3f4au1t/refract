(() => {
  const $ = selector => document.querySelector(selector);
  let page = 1, pages = 1, controller, exportController, generation = 0, debounce, exportBusy = false;
  const date = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  const parameters = () => new URLSearchParams({ q: $('#search').value.trim(), sort: $('#sort').value, page: String(page) });
  const clearData = () => {
    $('#dashboard').hidden = true; $('#rows').replaceChildren(); $('#account-email').textContent = '';
    $('#total').textContent = '0'; $('#latest').textContent = '—';
  };
  function showGate(status) {
    clearData(); $('#gate').hidden = false; $('#error').hidden = true;
    $('#gate-message').textContent = status === 401 ? 'Sign in with your organizer account to view registrations.' : 'This account doesn’t have organizer access.';
    $('#sign-in').hidden = status !== 401; $('#switch-account').hidden = status === 401;
    $('#sign-out').hidden = status === 401;
  }
  const fail = message => { $('#error-text').textContent = message; $('#error').hidden = false; };
  async function load() {
    clearTimeout(debounce); controller?.abort(); controller = new AbortController();
    const current = ++generation;
    $('#error').hidden = true; $('#results').textContent = 'Loading…';
    $('#refresh').disabled = true; $('#export').disabled = true;
    $('#previous').disabled = true; $('#next').disabled = true;
    $('#rows').replaceChildren(); $('#table-wrap').hidden = true; $('#empty').hidden = true;
    try {
      const response = await fetch(`/api/admin/registrations?${parameters()}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (current !== generation) return;
      if (response.status === 401 || response.status === 403) { showGate(response.status); return; }
      if (!response.ok) throw new Error('Couldn’t load registrations. Please try again.');
      const data = await response.json();
      if (current !== generation) return;
      $('#gate').hidden = true; $('#dashboard').hidden = false; $('#sign-out').hidden = false;
      $('#account-email').textContent = data.admin.email;
      $('#total').textContent = data.summary.total.toLocaleString(); $('#latest').textContent = date(data.summary.latest);
      page = data.page; pages = data.pages;
      const fragment = document.createDocumentFragment();
      data.registrations.forEach(row => {
        const tr = document.createElement('tr');
        const person = document.createElement('td');
        const name = document.createElement('strong'); name.className = 'name'; name.textContent = row.name;
        const email = document.createElement('span'); email.className = 'email'; email.textContent = row.email;
        person.append(name, email); tr.append(person);
        const reference = document.createElement('td'); reference.className = 'reference'; reference.textContent = row.reference; tr.append(reference);
        const registered = document.createElement('td'); registered.textContent = date(row.createdAt); tr.append(registered);
        const status = document.createElement('td'); const badge = document.createElement('span'); badge.className = 'status'; badge.textContent = row.status === 'pending' ? 'Received' : row.status; status.append(badge); tr.append(status);
        fragment.append(tr);
      });
      $('#rows').replaceChildren(fragment);
      $('#table-wrap').hidden = !data.registrations.length; $('#empty').hidden = !!data.registrations.length;
      $('#empty-title').textContent = data.summary.total ? 'No matching registrations.' : 'No registrations yet.';
      $('#empty-text').textContent = data.summary.total ? 'Try a different name, email or reference.' : 'Completed registrations will appear here.';
      const start = data.matched ? (page - 1) * data.pageSize + 1 : 0;
      $('#results').textContent = data.matched ? `${start}–${start + data.registrations.length - 1} of ${data.matched}` : '0 results';
      $('#page-info').textContent = `Page ${page} of ${pages}`;
      $('#previous').disabled = page <= 1; $('#next').disabled = page >= pages;
      $('#export').disabled = exportBusy || !data.matched;
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      $('#results').textContent = 'Couldn’t load results';
      if (!$('#gate').hidden) $('#gate-message').textContent = 'Couldn’t check access. Please try again.';
      fail('Couldn’t load registrations. Please check your connection and try again.');
    } finally { if (current === generation) $('#refresh').disabled = false; }
  }
  async function signOut(button) {
    button.disabled = true; clearTimeout(debounce); controller?.abort(); exportController?.abort(); ++generation; clearData();
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      window.location.replace('/register/?next=admin');
    } catch { showGate(403); fail('Couldn’t sign out. Please try again.'); button.disabled = false; }
  }
  $('#sign-out').addEventListener('click', event => signOut(event.currentTarget));
  $('#switch-account').addEventListener('click', event => signOut(event.currentTarget));
  $('#search').addEventListener('input', () => { page = 1; clearTimeout(debounce); controller?.abort(); ++generation; $('#export').disabled = true; debounce = setTimeout(load, 250); });
  $('#sort').addEventListener('change', () => { page = 1; load(); });
  $('#refresh').addEventListener('click', load); $('#retry').addEventListener('click', load);
  $('#previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('#next').addEventListener('click', () => { if (page < pages) { page++; load(); } });
  $('#export').addEventListener('click', async () => {
    if (exportBusy) return;
    exportBusy = true; exportController = new AbortController(); $('#export').disabled = true; $('#error').hidden = true;
    try {
      const response = await fetch(`/api/admin/registrations.csv?${parameters()}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([exportController.signal, AbortSignal.timeout(20000)]) });
      if (response.status === 401 || response.status === 403) { showGate(response.status); return; }
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `refract-registrations-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (!exportController.signal.aborted) fail('Couldn’t export registrations. Please try again.'); }
    finally { exportBusy = false; if (!$('#dashboard').hidden) load(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearData(); load(); } });
  window.addEventListener('pagehide', () => { clearTimeout(debounce); controller?.abort(); exportController?.abort(); ++generation; clearData(); });
  load();
})();
