(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const state = { section:'accounts', accountPage:1, registrationPage:1, accountPages:1, registrationPages:1, currentUserId:null, selected:null, action:null, setup:false, busy:false, unlocked:false };
  let controller, epoch=0, debounce, expiryTimer;
  const date = value => value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
  const statusName = status => ({pending:'Received',approved:'Approved',waitlisted:'Waitlisted',declined:'Declined'})[status] || 'Not submitted';
  const el = (tag,text,className) => { const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className) node.className=className; return node; };
  const fail = message => { $('#error-text').textContent=message;$('#error').hidden=false; };
  const notice = message => { $('#notice').textContent=message;$('#notice').hidden=false; };
  const inlineError = (id,message) => { $(id).textContent=message;$(id).hidden=false; };
  const clear = () => {
    state.unlocked=false;state.selected=null;state.action=null;controller?.abort();++epoch;clearTimeout(debounce);clearTimeout(expiryTimer);
    $('#dashboard').hidden=true;$('#lock').hidden=true;$('#account-email').textContent='';$('#notice').hidden=true;
    for(const id of ['account-rows','rows','traffic-chart','traffic-days','traffic-pages','activity-list']) $('#'+id).replaceChildren();
    for(const id of ['account-total','verified-total','admin-total','total','latest','traffic-active','traffic-visitors','traffic-views']) $('#'+id).textContent='—';
    $$('dialog[open]').forEach(d=>d.close());$('#edit-form').reset();$('#confirm-form').reset();$('#edit-email').textContent='';$('#edit-meta').replaceChildren();$('#confirm-message').textContent='';$('#access-description').textContent='';
  };
  function gate(status) {
    clear();$('#gate').hidden=false;$('#password-gate').hidden=true;$('#error').hidden=true;
    $('#gate-message').textContent=status===401?'Sign in with your organizer account to continue.':'This account doesn’t have admin access.';
    $('#sign-in').hidden=status!==401;$('#switch-account').hidden=status===401;$('#sign-out').hidden=status===401;
  }
  async function request(path,body,signal) {
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    if(response.status===401||response.status===403){gate(response.status);throw new Error('Access is no longer available.');}
    if(response.status===428){clear();await checkSecurity();throw new Error('Unlock the dashboard to continue.');}
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'The request failed. Please try again.');}
    return response;
  }
  async function checkSecurity() {
    try {
      const response=await request('/api/admin/security');const data=await response.json();
      $('#gate').hidden=true;$('#sign-out').hidden=false;
      if(!data.unlocked){
        clear();state.setup=!data.passwordConfigured;$('#password-gate').hidden=false;
        $('#password-title').textContent=state.setup?'Set the shared password':'Unlock dashboard';
        $('#password-help').textContent=state.setup?'Set one password for all Refract admins. Use at least 12 characters and share it privately with the other organizers.':'Enter the shared admin password to view accounts and manage the event.';
        $('#admin-password').autocomplete=state.setup?'new-password':'current-password';$('#admin-password').minLength=state.setup?12:1;
        $('#password-repeat').hidden=!state.setup;$('#admin-password-repeat').required=state.setup;
        $('#password-submit').textContent=state.setup?'Set password and unlock':'Unlock';$('#password-form').reset();
        return false;
      }
      state.unlocked=true;$('#password-gate').hidden=true;$('#dashboard').hidden=false;$('#lock').hidden=false;$('#account-email').textContent=data.email;
      clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{clear();checkSecurity();},Math.max(0,data.expiresAt-Date.now()));
      return true;
    }catch(error){if($('#gate').hidden || $('#gate-message').textContent==='Checking your access…')fail(error.message);return false;}
  }
  const params = () => new URLSearchParams({q:$('#search').value.trim(),sort:$('#sort').value,page:String(state.registrationPage)});
  function person(row) { const td=el('td');td.append(el('strong',row.name,'name'),el('span',row.email,'email'));return td; }
  function pagination(prefix,data,key) {
    state[key+'Page']=data.page;state[key+'Pages']=data.pages;
    $('#'+prefix+'previous').disabled=data.page<=1;$('#'+prefix+'next').disabled=data.page>=data.pages;
    $(key==='account'?'#account-page':'#page-info').textContent=`Page ${data.page} of ${data.pages}`;
    const start=data.matched?(data.page-1)*data.pageSize+1:0, count=data.accounts?.length??data.registrations.length;
    $(key==='account'?'#account-results':'#results').textContent=data.matched?`${start}–${start+count-1} of ${data.matched}`:'0 results';
  }
  function renderAccounts(data) {
    state.currentUserId=data.currentUserId;$('#account-total').textContent=data.summary.accounts.toLocaleString();$('#verified-total').textContent=(data.summary.verified||0).toLocaleString();$('#admin-total').textContent=data.summary.admins.toLocaleString();
    const fragment=document.createDocumentFragment();
    for(const row of data.accounts){
      const tr=el('tr');tr.append(person(row));const signin=el('td');
      const providers=(row.providers||'').split(',').filter(Boolean).map(p=>({google:'Google',github:'GitHub',credential:'Email'})[p]||p);
      signin.append(el('span',providers.join(' · ')||'Email'),el('span',row.emailVerified?'Verified email':'Unverified email','cell-note'));tr.append(signin);
      const access=el('td');access.append(el('span',row.isAdmin?'Admin':'Participant','role-badge'+(row.isAdmin?' admin':'')));if(row.id===state.currentUserId)access.append(el('span','You','cell-note'));tr.append(access);
      const registration=el('td',statusName(row.status));if(row.reference)registration.append(el('span',row.reference,'cell-note'));tr.append(registration,el('td',date(row.createdAt)));
      const action=el('td'),button=el('button','Manage','button manage');button.setAttribute('aria-label',`Manage ${row.name}`);button.addEventListener('click',()=>openAccount(row));action.append(button);tr.append(action);fragment.append(tr);
    }
    $('#account-rows').replaceChildren(fragment);$('#account-empty').hidden=!!data.accounts.length;pagination('account-',data,'account');
  }
  function renderRegistrations(data) {
    $('#total').textContent=data.summary.total.toLocaleString();$('#latest').textContent=date(data.summary.latest);
    const fragment=document.createDocumentFragment();
    for(const row of data.registrations){const tr=el('tr');tr.append(person(row),el('td',row.reference,'reference'),el('td',date(row.createdAt)),el('td',statusName(row.status)));fragment.append(tr);}
    $('#rows').replaceChildren(fragment);$('#registration-empty').hidden=!!data.registrations.length;$('#export').disabled=!data.matched;pagination('',data,'registration');
  }
  function renderTraffic(data) {
    $('#traffic-active').textContent=data.active.toLocaleString();$('#traffic-visitors').textContent=data.today.visitors.toLocaleString();$('#traffic-views').textContent=data.today.views.toLocaleString();
    const peak=Math.max(1,...data.days.map(d=>d.visitors)),chart=document.createDocumentFragment(),table=document.createDocumentFragment();
    for(const day of data.days){const column=el('div',undefined,'chart-column');column.title=`${day.day}: ${day.visitors} visitors, ${day.views} views`;const bar=el('div',undefined,'chart-bar');bar.style.height=`${day.visitors/peak*160}px`;column.append(el('strong',day.visitors),bar,el('span',day.day.slice(5)));chart.append(column);const tr=el('tr');tr.append(el('td',day.day),el('td',day.visitors),el('td',day.views));table.append(tr);}
    $('#traffic-chart').replaceChildren(chart);$('#traffic-chart').setAttribute('aria-label',`Daily visitors over the last 14 days. ${data.today.visitors} today. Exact counts are available below.`);$('#traffic-days').replaceChildren(table);
    $('#traffic-pages').replaceChildren(...data.popular.map(row=>{const item=el('div');item.append(el('span',({'/':'Home','/register/':'Registration','/account/':'Account','/privacy/':'Privacy'})[row.path]),el('strong',row.views.toLocaleString()));return item;}));
    if(!data.popular.length)$('#traffic-pages').append(el('p','No visits recorded today','muted'));
    $('#traffic-updated').textContent=`Updated ${date(data.updatedAt)}`;$('#traffic-since').textContent=`Collection started ${date(data.startedAt)}. Earlier dates have no recorded data. Updates every minute while this panel is open.`;
  }
  function renderActivity(data){$('#activity-list').replaceChildren(...data.events.map(event=>{const item=el('div',undefined,'activity-item');item.append(el('strong',event.action),el('time',date(event.createdAt)),el('p',`${event.actor} → ${event.target}`));return item;}));}
  async function load(){
    if(!state.unlocked)return;
    clearTimeout(debounce);controller?.abort();controller=new AbortController();const current=++epoch,section=state.section;
    $('#error').hidden=true;$$('[data-refresh]').forEach(b=>b.disabled=true);
    if(section==='accounts'){$('#account-results').textContent='Loading…';$('#account-rows').replaceChildren();$('#account-empty').hidden=true;$('#account-previous').disabled=true;$('#account-next').disabled=true;}
    if(section==='registrations'){$('#results').textContent='Loading…';$('#rows').replaceChildren();$('#registration-empty').hidden=true;$('#export').disabled=true;$('#previous').disabled=true;$('#next').disabled=true;}
    const url=section==='accounts'?`/api/admin/accounts?${new URLSearchParams({q:$('#account-search').value.trim(),role:$('#role-filter').value,page:state.accountPage})}`:section==='registrations'?`/api/admin/registrations?${params()}`:`/api/admin/${section}`;
    try{const response=await request(url,undefined,controller.signal);const data=await response.json();if(current!==epoch)return;({accounts:renderAccounts,registrations:renderRegistrations,traffic:renderTraffic,activity:renderActivity})[section](data);}
    catch(error){if(current===epoch&&state.unlocked)fail(error.message);}
    finally{if(current===epoch)$$('[data-refresh]').forEach(b=>b.disabled=false);}
  }
  function openAccount(row){
    state.selected={...row};$('#edit-name').value=row.name;$('#edit-email').textContent=row.email;$('#edit-title').textContent='Manage account';$('#edit-error').hidden=true;
    $('#edit-meta').replaceChildren(el('span',row.isAdmin?'Admin':'Participant','role-badge'+(row.isAdmin?' admin':'')),el('span',row.emailVerified?'Verified email':'Unverified email'));
    $('#registration-fields').hidden=!row.reference;$('#no-registration').hidden=!!row.reference;$('#edit-registered-name').required=!!row.reference;$('#edit-registered-name').value=row.registeredName||'';$('#edit-status').value=row.status||'pending';
    $('#access-description').textContent=row.isAdmin?'This account can manage participants, grant admin access and delete accounts.':'This account has participant access.';
    $('#toggle-admin').textContent=row.isAdmin?'Remove admin access':'Make admin';const self=row.id===state.currentUserId;
    $('#toggle-admin').disabled=self||(!row.emailVerified&&!row.isAdmin);$('#revoke-sessions').disabled=self;$('#delete-account').disabled=self;$('#self-protection').hidden=!self;
    if(!$('#account-dialog').open)$('#account-dialog').showModal();
  }
  function confirmAction(action){
    if(state.busy||!state.selected)return;state.action=action;const row=state.selected;
    const content={admin:[row.isAdmin?'Remove admin access':'Make this account an admin',row.isAdmin?`${row.email} will lose dashboard access immediately.`:`${row.email} will be able to edit and delete accounts, view participant information, and manage other admins.`],sessions:['Sign out all devices',`${row.email} will need to sign in again. Their account and registration will remain.`],delete:['Delete this account',`This removes ${row.email}, their registration, linked sign-in accounts and current sessions. It cannot be undone here. Server backups may retain older records. They can create a new account by signing in again.`]};
    $('#confirm-title').textContent=content[action][0];$('#confirm-message').textContent=content[action][1];$('#confirm-submit').textContent=action==='delete'?'Delete account':'Confirm';$('#confirm-submit').classList.toggle('danger',action==='delete');$('#confirm-submit').classList.toggle('primary',action!=='delete');$('#delete-confirmation').hidden=action!=='delete';$('#confirm-email').required=action==='delete';$('#confirm-email').value='';$('#confirm-error').hidden=true;$('#confirm-dialog').showModal();
  }
  const busy = value => {state.busy=value;$('#save-account').disabled=value;$('#confirm-submit').disabled=value;};
  $('#edit-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy||!state.selected)return;const selected=state.selected;busy(true);$('#edit-error').hidden=true;
    try{const body={name:$('#edit-name').value};if(selected.reference){body.registeredName=$('#edit-registered-name').value;body.status=$('#edit-status').value;}await request(`/api/admin/accounts/${encodeURIComponent(selected.id)}/edit`,body);$('#account-dialog').close();notice('Account details saved');await load();}
    catch(error){if($('#account-dialog').open)inlineError('#edit-error',error.message);}finally{busy(false);}
  });
  $('#confirm-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy||!state.selected)return;const selected=state.selected,action=state.action;
    if(action==='delete'&&$('#confirm-email').value!==selected.email){inlineError('#confirm-error','Type the email address exactly as shown.');return;}
    busy(true);$('#confirm-error').hidden=true;
    try{const route={admin:'admin',sessions:'revoke-sessions',delete:'delete'}[action],body=action==='admin'?{enabled:!selected.isAdmin}:action==='delete'?{confirmEmail:$('#confirm-email').value}:{};
      await request(`/api/admin/accounts/${encodeURIComponent(selected.id)}/${route}`,body);$('#confirm-dialog').close();$('#account-dialog').close();notice(action==='delete'?'Account deleted':action==='sessions'?'Account signed out on all devices':selected.isAdmin?'Admin access removed':'Admin access granted');await load();
    }catch(error){if($('#confirm-dialog').open)inlineError('#confirm-error',error.message);}finally{busy(false);}
  });
  $('#toggle-admin').addEventListener('click',()=>confirmAction('admin'));$('#revoke-sessions').addEventListener('click',()=>confirmAction('sessions'));$('#delete-account').addEventListener('click',()=>confirmAction('delete'));
  $$('[data-close]').forEach(button=>button.addEventListener('click',()=>{if(!state.busy)$('#'+button.dataset.close).close();}));$$('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{if(state.busy)event.preventDefault();}));
  $$('[data-section]').forEach(button=>button.addEventListener('click',()=>{state.section=button.dataset.section;$('#notice').hidden=true;$$('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));for(const section of ['accounts','registrations','traffic','activity'])$('#'+section+'-panel').hidden=section!==state.section;load();}));
  $$('[data-refresh]').forEach(b=>b.addEventListener('click',load));$('#retry').addEventListener('click',async()=>{if(await checkSecurity())load();});
  for(const [selector,key] of [['#account-search','account'],['#search','registration']])$(selector).addEventListener('input',()=>{state[key+'Page']=1;controller?.abort();++epoch;clearTimeout(debounce);debounce=setTimeout(load,250);});
  $('#role-filter').addEventListener('change',()=>{state.accountPage=1;load();});$('#sort').addEventListener('change',()=>{state.registrationPage=1;load();});
  for(const [prefix,key] of [['account-','account'],['','registration']])for(const [suffix,delta] of [['previous',-1],['next',1]])$('#'+prefix+suffix).addEventListener('click',()=>{state[key+'Page']=Math.max(1,Math.min(state[key+'Pages'],state[key+'Page']+delta));load();});
  $('#export').addEventListener('click',async()=>{
    $('#export').disabled=true;
    try{const response=await request(`/api/admin/registrations.csv?${params()}`);const url=URL.createObjectURL(await response.blob()),link=el('a');link.href=url;link.download=`refract-registrations-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){if(state.unlocked)fail(error.message);}finally{if(state.unlocked)load();}
  });
  $('#password-form').addEventListener('submit',async event=>{
    event.preventDefault();$('#password-error').hidden=true;
    if(state.setup&&$('#admin-password').value!==$('#admin-password-repeat').value){inlineError('#password-error','The passwords don’t match.');return;}
    $('#password-submit').disabled=true;
    try{await request(`/api/admin/security/${state.setup?'setup':'unlock'}`,{password:$('#admin-password').value});$('#password-form').reset();if(await checkSecurity())load();}
    catch(error){if(!$('#password-gate').hidden)inlineError('#password-error',error.message);}finally{$('#password-submit').disabled=false;}
  });
  $('#lock').addEventListener('click',async()=>{clear();try{await request('/api/admin/security/lock',{});await checkSecurity();}catch(error){fail(error.message);}});
  async function signOut(button){button.disabled=true;try{await request('/api/auth/sign-out',{});clear();location.assign('/register/?next=admin');}catch(error){fail(error.message);button.disabled=false;}}
  $('#sign-out').addEventListener('click',event=>signOut(event.currentTarget));$('#switch-account').addEventListener('click',event=>signOut(event.currentTarget));
  window.addEventListener('pagehide',()=>{clear();$('#password-form').reset();});window.addEventListener('pageshow',async event=>{if(event.persisted&&await checkSecurity())load();});
  document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&!state.busy){const wasUnlocked=state.unlocked;if(await checkSecurity()&&!wasUnlocked)load();}});
  setInterval(async()=>{if(document.visibilityState==='visible'&&state.unlocked&&!state.busy){if(await checkSecurity()&&state.section==='traffic')load();}},60000);
  checkSecurity().then(allowed=>{if(allowed)load();});
})();
