import { installAdminSecurity } from './admin-security.mjs';
const csvCell = value => {
  let text = String(value ?? '');
  // Prevent spreadsheet formulas, including formulas preceded by whitespace.
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function installAdminRoutes(app, { db, requireUser, adminUserIds = [] }) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_roles (user_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS admin_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_activity (
      id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL,
      action TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
  // Import the private bootstrap list once. Removed admins stay removed after a restart.
  if (!db.prepare("SELECT 1 FROM admin_settings WHERE key='roles_initialized'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of adminUserIds) db.prepare('INSERT OR IGNORE INTO admin_roles VALUES (?)').run(id);
      db.prepare("INSERT INTO admin_settings VALUES ('roles_initialized','1')").run();
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const isAdmin = id => Boolean(db.prepare('SELECT 1 FROM admin_roles WHERE user_id=?').get(id));
  const audit = (req, action) => db.prepare('INSERT INTO admin_activity(actor_id,target_id,action,created_at) VALUES(?,?,?,?)')
    .run(req.user.id, req.params.id, action, new Date().toISOString());
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { fn(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const requireAdmin = (req, res, next) => {
    if (!isAdmin(req.user.id)) return res.status(403).json({ code: 'ADMIN_REQUIRED', message: 'This account does not have organizer access.' });
    next();
  };
  app.use('/api/admin', requireUser, requireAdmin);
  installAdminSecurity(app, db);
  const accountFields = `u.id, u.name, u.email, u.emailVerified, u.createdAt, u.updatedAt,
    r.name AS registeredName, r.reference, r.status,
    EXISTS(SELECT 1 FROM admin_roles a WHERE a.user_id=u.id) AS isAdmin,
    (SELECT group_concat(DISTINCT providerId) FROM account WHERE userId=u.id) AS providers,
    (SELECT MAX(updatedAt) FROM session WHERE userId=u.id) AS lastActive`;
  const accountFrom = 'FROM user u LEFT JOIN registrations r ON r.user_id=u.id';
  const accountFor = id => db.prepare(`SELECT ${accountFields} ${accountFrom} WHERE u.id=?`).get(id);
  const target = (req, res, next) => {
    req.target = accountFor(req.params.id);
    if (!req.target) return res.status(404).json({ message: 'This account no longer exists.' });
    next();
  };
  const otherAccount = (req, res, next) => {
    if (req.params.id === req.user.id) return res.status(409).json({ message: 'Another admin must make this change to your account.' });
    next();
  };
  const validBody = (body, keys) => body && !Array.isArray(body) && Object.keys(body).every(key => keys.includes(key));
  app.get('/api/admin/accounts', (req, res) => {
    const { q='', role='all', page='1' } = req.query;
    if (typeof q !== 'string' || q.length > 100 || !['all','admin','participant'].includes(role) || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) return res.status(400).json({ message: 'Check your search or page number.' });
    const where = `WHERE (?='' OR instr(lower(u.name),lower(?))>0 OR instr(lower(u.email),lower(?))>0 OR instr(lower(COALESCE(r.name,'')),lower(?))>0 OR instr(lower(COALESCE(r.reference,'')),lower(?))>0)
      AND (?='all' OR EXISTS(SELECT 1 FROM admin_roles a WHERE a.user_id=u.id)=?)`;
    const args = [q.trim(),q.trim(),q.trim(),q.trim(),q.trim(),role,role==='admin'?1:0];
    const matched = db.prepare(`SELECT COUNT(*) AS n ${accountFrom} ${where}`).get(...args).n;
    const pages = Math.max(1,Math.ceil(matched/50)), current = Math.min(Number(page),pages);
    const accounts = db.prepare(`SELECT ${accountFields} ${accountFrom} ${where} ORDER BY u.createdAt DESC,u.id LIMIT 50 OFFSET ?`).all(...args,(current-1)*50);
    const summary = db.prepare(`SELECT COUNT(*) AS accounts, SUM(emailVerified=1) AS verified, (SELECT COUNT(*) FROM admin_roles a JOIN user u ON u.id=a.user_id) AS admins FROM user`).get();
    res.json({ accounts, summary, matched, page:current, pages, pageSize:50, currentUserId:req.user.id });
  });
  app.post('/api/admin/accounts/:id/edit', target, (req, res) => {
    const body = req.body;
    const clean = v => typeof v === 'string' ? v.trim().replace(/\s+/g,' ') : '';
    const name = clean(body?.name), registeredName = clean(body?.registeredName);
    const validName = v => v.length >= 2 && v.length <= 100 && !/[\u0000-\u001f\u007f]/.test(v);
    if (!validBody(body,['name','registeredName','status']) || !validName(name) || (req.target.reference && (!validName(registeredName) || !['pending','approved','waitlisted','declined'].includes(body.status))) || (!req.target.reference && (body.status !== undefined || body.registeredName !== undefined))) return res.status(400).json({ message: 'Enter a name between 2 and 100 characters and a valid registration status.' });
    transaction(() => {
      db.prepare('UPDATE user SET name=?, updatedAt=? WHERE id=?').run(name,Date.now(),req.params.id);
      if (req.target.reference) db.prepare('UPDATE registrations SET name=?,status=?,updated_at=? WHERE user_id=?').run(registeredName,body.status,new Date().toISOString(),req.params.id);
      audit(req,'Account details updated');
    });
    res.json({ account:accountFor(req.params.id) });
  });
  app.post('/api/admin/accounts/:id/admin', target, otherAccount, (req, res) => {
    if (!validBody(req.body,['enabled']) || typeof req.body.enabled !== 'boolean') return res.status(400).json({ message: 'Choose whether this account has admin access.' });
    if (req.body.enabled && !req.target.emailVerified) return res.status(409).json({ message: 'This person must verify their email before becoming an admin.' });
    transaction(() => {
      if (req.body.enabled) db.prepare('INSERT OR IGNORE INTO admin_roles VALUES (?)').run(req.params.id);
      else {
        db.prepare('DELETE FROM admin_roles WHERE user_id=?').run(req.params.id);
        db.prepare('DELETE FROM admin_unlocks WHERE user_id=?').run(req.params.id);
      }
      audit(req,req.body.enabled ? 'Admin access granted' : 'Admin access removed');
    });
    res.json({ account:accountFor(req.params.id) });
  });
  app.post('/api/admin/accounts/:id/revoke-sessions', target, otherAccount, (req, res) => {
    transaction(() => {
      db.prepare('DELETE FROM admin_unlocks WHERE user_id=?').run(req.params.id);
      db.prepare('DELETE FROM session WHERE userId=?').run(req.params.id);
      audit(req,'Signed out on all devices');
    });
    res.json({ ok:true });
  });
  app.post('/api/admin/accounts/:id/delete', target, otherAccount, (req, res) => {
    if (!validBody(req.body,['confirmEmail']) || req.body.confirmEmail !== req.target.email) return res.status(400).json({ message: 'Type the account’s email address exactly to confirm deletion.' });
    transaction(() => {
      audit(req,'Account deleted');
      db.prepare('DELETE FROM admin_roles WHERE user_id=?').run(req.params.id);
      db.prepare('DELETE FROM admin_unlocks WHERE user_id=?').run(req.params.id);
      db.prepare('DELETE FROM session WHERE userId=?').run(req.params.id);
      db.prepare('DELETE FROM account WHERE userId=?').run(req.params.id);
      db.prepare('DELETE FROM registrations WHERE user_id=?').run(req.params.id);
      db.prepare('DELETE FROM verification WHERE identifier=?').run(`sign-in-otp-${req.target.email}`);
      db.prepare('DELETE FROM admin_password_attempts WHERE user_id=?').run(req.params.id);
      db.prepare('DELETE FROM user WHERE id=?').run(req.params.id);
    });
    res.json({ ok:true });
  });
  app.get('/api/admin/activity', (_req,res) => {
    const events = db.prepare(`SELECT a.id,a.action,a.created_at AS createdAt,
      COALESCE(actor.name,'Deleted account') AS actor, COALESCE(target.name,'Deleted account') AS target
      FROM admin_activity a LEFT JOIN user actor ON actor.id=a.actor_id LEFT JOIN user target ON target.id=a.target_id
      ORDER BY a.id DESC LIMIT 50`).all();
    res.json({ events });
  });
  const filters = (req, res, next) => {
    const { q = '', sort = 'newest', page = '1' } = req.query;
    if (typeof q !== 'string' || q.length > 100 || !['newest', 'oldest', 'name'].includes(sort) || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page)) {
      return res.status(400).json({ code: 'INVALID_FILTER', message: 'Check your search or page number.' });
    }
    req.directory = { q: q.trim(), page: Number(page), order: { newest: 'r.created_at DESC, r.reference DESC', oldest: 'r.created_at ASC, r.reference ASC', name: 'r.name COLLATE NOCASE ASC, r.reference ASC' }[sort] };
    next();
  };
  const from = 'FROM registrations r JOIN user u ON u.id = r.user_id';
  const where = 'WHERE (? = \'\' OR instr(lower(r.name), lower(?)) > 0 OR instr(lower(u.email), lower(?)) > 0 OR instr(lower(r.reference), lower(?)) > 0)';
  const fields = 'r.reference, r.name, u.email, r.status, r.created_at AS createdAt, r.updated_at AS updatedAt, r.student_confirmed AS studentConfirmed';
  const args = q => [q, q, q, q];
  app.get('/api/admin/registrations', filters, (req, res) => {
    const { q, page: requestedPage, order } = req.directory;
    const summary = db.prepare(`SELECT COUNT(*) AS total, MAX(r.created_at) AS latest ${from}`).get();
    const matched = db.prepare(`SELECT COUNT(*) AS total ${from} ${where}`).get(...args(q)).total;
    const pageSize = 50;
    const pages = Math.max(1, Math.ceil(matched / pageSize));
    const page = Math.min(requestedPage, pages);
    const registrations = db.prepare(`SELECT ${fields} ${from} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args(q), pageSize, (page - 1) * pageSize);
    res.json({ admin: { name: req.user.name, email: req.user.email }, summary, matched, page, pages, pageSize, registrations });
  });
  app.get('/api/admin/registrations.csv', filters, (req, res) => {
    const { q, order } = req.directory;
    const rows = db.prepare(`SELECT ${fields} ${from} ${where} ORDER BY ${order}`).all(...args(q));
    const headings = ['Name', 'Email', 'Reference', 'Status', 'PRISMS student confirmed', 'Registered at (UTC)', 'Updated at (UTC)'];
    const lines = [headings, ...rows.map(row => [row.name, row.email, row.reference, row.status, row.studentConfirmed ? 'Yes' : 'No', row.createdAt, row.updatedAt])];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="refract-registrations-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.send('\uFEFF' + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n');
  });
  return { isAdmin };
}
