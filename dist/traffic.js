(() => {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  let view = crypto.randomUUID(), visitor, day;
  function ping() {
    if (document.visibilityState !== 'visible') return;
    const nextDay = new Date().toISOString().slice(0,10);
    if (day !== nextDay) {
      day = nextDay; view = crypto.randomUUID();
      try {
        const saved = JSON.parse(localStorage.getItem('refract-visit') || 'null');
        visitor = saved?.day === day && typeof saved.id === 'string' ? saved.id : crypto.randomUUID();
        localStorage.setItem('refract-visit',JSON.stringify({day,id:visitor}));
      } catch { visitor = crypto.randomUUID(); }
    }
    const path = location.pathname.endsWith('/') ? location.pathname : location.pathname+'/';
    fetch('/api/traffic',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor,view,path}),signal:AbortSignal.timeout(8000)}).catch(()=>{});
  }
  ping();
  setInterval(ping,60000);
  document.addEventListener('visibilitychange',ping);
  window.addEventListener('pageshow',event=>{ if (event.persisted) { view=crypto.randomUUID();ping(); } });
})();
