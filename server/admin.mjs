const csvCell = value => {
  let text = String(value ?? '');
  // Prevent spreadsheet formulas, including formulas preceded by whitespace.
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function installAdminRoutes(app, { db, requireUser, adminUserIds = [] }) {
  const allowed = new Set(adminUserIds);
  const requireAdmin = (req, res, next) => {
    if (!allowed.has(req.user.id)) return res.status(403).json({ code: 'ADMIN_REQUIRED', message: 'This account does not have organizer access.' });
    next();
  };
  app.use('/api/admin', requireUser, requireAdmin);
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
}
