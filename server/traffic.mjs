import { createHmac } from 'node:crypto';

const paths = new Set(['/', '/register/', '/account/', '/privacy/']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function installTraffic(app, { db, secret }) {
  db.exec(`CREATE TABLE IF NOT EXISTS traffic_views (
    day TEXT NOT NULL, visitor TEXT NOT NULL, view_id TEXT NOT NULL, path TEXT NOT NULL,
    first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY(day,visitor,view_id)
  );
  CREATE INDEX IF NOT EXISTS traffic_recent ON traffic_views(last_seen);
  CREATE TABLE IF NOT EXISTS traffic_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  db.prepare("INSERT OR IGNORE INTO traffic_settings VALUES ('started',?)").run(new Date().toISOString());
  const hash = value => createHmac('sha256',secret).update(value).digest('hex');
  const limits = new Map();
  let cleaned = 0;
  const clean = now => {
    if (now-cleaned < 3600000) return;
    db.prepare('DELETE FROM traffic_views WHERE day < ?').run(new Date(now-29*86400000).toISOString().slice(0,10));
    cleaned = now;
  };
  clean(Date.now());
  app.post('/api/traffic', (req,res) => {
    if (req.get('dnt') === '1' || req.get('sec-gpc') === '1') return res.sendStatus(204);
    const { visitor, view, path } = req.body || {};
    if (typeof visitor !== 'string' || typeof view !== 'string' || !uuid.test(visitor) || !uuid.test(view) || !paths.has(path)) return res.status(400).json({ message:'Invalid visit.' });
    const now = Date.now(), day = new Date(now).toISOString().slice(0,10);
    for (const [key,value] of limits) if (value.reset <= now) limits.delete(key);
    const key = hash(req.ip), limit = limits.get(key) || { count:0, reset:now+60000 };
    if (++limit.count > 120 || (!limits.has(key) && limits.size >= 10000)) return res.status(429).json({ message:'Too many visits.' });
    limits.set(key,limit); clean(now);
    // Repeated heartbeats never increase the page-view count or change its path.
    db.prepare(`INSERT INTO traffic_views VALUES (?,?,?,?,?,?) ON CONFLICT(day,visitor,view_id) DO UPDATE SET last_seen=excluded.last_seen`)
      .run(day,hash(day+':'+visitor),view,path,now,now);
    res.sendStatus(204);
  });
  // Registered after /api/admin's verified-admin middleware.
  app.get('/api/admin/traffic', (_req,res) => {
    const now = Date.now(), today = new Date(now).toISOString().slice(0,10);
    clean(now);
    const summary = db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM traffic_views WHERE day=?`).get(today);
    const active = db.prepare('SELECT COUNT(DISTINCT visitor) AS n FROM traffic_views WHERE last_seen>?').get(now-300000).n;
    const rows = db.prepare(`SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM traffic_views GROUP BY day ORDER BY day`).all();
    const byDay = new Map(rows.map(row=>[row.day,row]));
    const days = Array.from({length:14},(_,i)=>{
      const day = new Date(now-(13-i)*86400000).toISOString().slice(0,10);
      return byDay.get(day) || {day,views:0,visitors:0};
    });
    const popular = db.prepare('SELECT path,COUNT(*) AS views FROM traffic_views WHERE day=? GROUP BY path ORDER BY views DESC').all(today);
    res.json({ today:summary, active, days, popular, startedAt:db.prepare("SELECT value FROM traffic_settings WHERE key='started'").get().value, updatedAt:new Date(now).toISOString() });
  });
}
