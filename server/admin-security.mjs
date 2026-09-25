import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const duration = 30 * 60 * 1000;

export function installAdminSecurity(app, db) {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_password (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_unlocks (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_password_attempts (user_id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);`);
  const passwordFor = () => db.prepare('SELECT * FROM admin_password WHERE id=1').get();
  const unlocked = req => Boolean(db.prepare('SELECT 1 FROM admin_unlocks WHERE session_id=? AND user_id=? AND expires_at>?').get(req.authSessionId,req.user.id,Date.now()));
  const grant = req => {
    db.prepare('DELETE FROM admin_unlocks WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT OR REPLACE INTO admin_unlocks VALUES(?,?,?)').run(req.authSessionId,req.user.id,Date.now()+duration);
  };
  const inFlight = new Set();
  let settingUp = false;
  const protect = async (req,res,fn) => {
    if (inFlight.has(req.user.id)) return res.status(429).json({ message:'A password check is already running.' });
    const attempts = db.prepare('SELECT * FROM admin_password_attempts WHERE user_id=?').get(req.user.id);
    if (attempts?.reset_at>Date.now() && attempts.attempts>=5) {
      res.set('Retry-After',String(Math.ceil((attempts.reset_at-Date.now())/1000)));
      return res.status(429).json({ message:'Too many password attempts. Try again in 15 minutes.' });
    }
    inFlight.add(req.user.id);
    try { await fn(); } finally { inFlight.delete(req.user.id); }
  };
  app.get('/api/admin/security', (req,res) => res.json({ passwordConfigured:!!passwordFor(), unlocked:unlocked(req), email:req.user.email, expiresAt:db.prepare('SELECT expires_at FROM admin_unlocks WHERE session_id=?').get(req.authSessionId)?.expires_at || 0 }));
  app.post('/api/admin/security/setup', (req,res) => protect(req,res,async () => {
    if (passwordFor() || settingUp) return res.status(409).json({ message:'The shared admin password has already been set or is being set. Reload and unlock with that password.' });
    const password = req.body?.password;
    if (typeof password!=='string' || password.length<12 || password.length>128) return res.status(400).json({ message:'Use a password between 12 and 128 characters.' });
    settingUp = true;
    try {
      const salt = randomBytes(32).toString('hex'), hash = (await scrypt(password,salt,64)).toString('hex');
      // The account may have lost admin access while the hash was being calculated.
      if (!db.prepare('SELECT 1 FROM admin_roles WHERE user_id=?').get(req.user.id)) return res.status(403).json({ message:'Admin access was removed.' });
      db.prepare('INSERT INTO admin_password VALUES(1,?,?)').run(salt,hash);
      grant(req); res.json({ ok:true });
    } finally { settingUp = false; }
  }));
  app.post('/api/admin/security/unlock', (req,res) => protect(req,res,async () => {
    const record=passwordFor(), password=req.body?.password;
    if (!record) return res.status(409).json({ message:'Set the shared admin password first.' });
    if (typeof password!=='string' || password.length>128) return res.status(400).json({ message:'Enter your admin password.' });
    const hash=await scrypt(password,record.salt,64);
    if (!timingSafeEqual(hash,Buffer.from(record.hash,'hex'))) {
      const now=Date.now();
      db.prepare(`INSERT INTO admin_password_attempts VALUES(?,1,?) ON CONFLICT(user_id) DO UPDATE SET
        attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,
        reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END`).run(req.user.id,now+900000,now,now);
      return res.status(400).json({ message:'That shared admin password is incorrect.' });
    }
    if (!db.prepare('SELECT 1 FROM admin_roles WHERE user_id=?').get(req.user.id)) return res.status(403).json({ message:'Admin access was removed.' });
    db.prepare('DELETE FROM admin_password_attempts WHERE user_id=?').run(req.user.id);
    grant(req);res.json({ok:true});
  }));
  app.post('/api/admin/security/lock', (req,res) => {
    db.prepare('DELETE FROM admin_unlocks WHERE session_id=?').run(req.authSessionId);
    res.json({ok:true});
  });
  app.use('/api/admin', (req,res,next) => {
    if (!unlocked(req)) return res.status(428).json({ code:'ADMIN_PASSWORD_REQUIRED',message:'Unlock the admin dashboard with your admin password.' });
    next();
  });
}
