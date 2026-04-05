const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ── Ensure directories exist ──────────────────────────────────────────────
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

// ── DB helpers ────────────────────────────────────────────────────────────
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { admin: {}, sites: [], visitors: [] }; }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Multer (logo upload) ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `logo-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'kiosk-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// ── Auth middleware ───────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session?.role === 'admin') return next();
  res.status(401).json({ error: 'Admin login required' });
}

function requireAuth(req, res, next) {
  if (req.session?.role === 'admin' || req.session?.role === 'visitor') return next();
  res.status(401).json({ error: 'Login required' });
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Admin login
app.post('/api/auth/admin-login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  if (username !== db.admin.username) return res.json({ ok: false, error: 'Wrong credentials' });
  const match = await bcrypt.compare(password, db.admin.password);
  if (!match) return res.json({ ok: false, error: 'Wrong credentials' });
  req.session.role = 'admin';
  req.session.username = username;
  res.json({ ok: true });
});

// Visitor login
app.post('/api/auth/visitor-login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const visitor = db.visitors.find(v => v.username === username);
  if (!visitor) return res.json({ ok: false, error: 'Wrong credentials' });
  const match = await bcrypt.compare(password, visitor.password);
  if (!match) return res.json({ ok: false, error: 'Wrong credentials' });
  req.session.role = 'visitor';
  req.session.username = username;
  req.session.visitorId = visitor.id;
  res.json({ ok: true });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Get current session info
app.get('/api/auth/me', (req, res) => {
  if (!req.session?.role) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, role: req.session.role, username: req.session.username });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SITES API
// ═══════════════════════════════════════════════════════════════════════════

// Get sites (filtered by access level)
app.get('/api/sites', requireAuth, (req, res) => {
  const db = readDB();
  let sites = db.sites;

  if (req.session.role === 'visitor') {
    const visitor = db.visitors.find(v => v.id === req.session.visitorId);
    if (!visitor) return res.status(401).json({ error: 'Session expired' });

    // Filter by what visitor is allowed to see
    sites = sites.filter(site => {
      if (site.access === 'public') return true;
      if (site.access === 'admin') return false;
      if (site.access === 'selected') {
        return visitor.allowedSites?.includes(site.id);
      }
      return false;
    });
  }

  // Strip cookies from response (security)
  res.json(sites.map(({ id, name, url, icon, iconUrl, access, createdAt }) =>
    ({ id, name, url, icon, iconUrl, access, createdAt })
  ));
});

// Get ALL sites (admin)
app.get('/api/admin/sites', requireAdmin, (req, res) => {
  const db = readDB();
  res.json(db.sites);
});

// Add site
app.post('/api/admin/sites', requireAdmin, upload.single('logo'), (req, res) => {
  const db = readDB();
  const { name, url, access, cookies } = req.body;

  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });

  const id = uuidv4().split('-')[0];
  const site = {
    id,
    name: name.trim(),
    url: url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim(),
    icon: req.file ? `/uploads/${req.file.filename}` : null,
    iconUrl: req.body.iconUrl || null,
    cookies: (() => {
      try { return JSON.parse(cookies || '[]'); } catch { return []; }
    })(),
    access: access || 'public',
    createdAt: new Date().toISOString()
  };

  db.sites.push(site);
  writeDB(db);
  res.json({ ok: true, site });
});

// Update site
app.put('/api/admin/sites/:id', requireAdmin, upload.single('logo'), (req, res) => {
  const db = readDB();
  const idx = db.sites.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Site not found' });

  const { name, url, access, cookies, iconUrl } = req.body;
  const site = db.sites[idx];

  if (name) site.name = name.trim();
  if (url) site.url = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
  if (access) site.access = access;
  if (iconUrl) site.iconUrl = iconUrl;
  if (cookies) {
    try { site.cookies = JSON.parse(cookies); } catch {}
  }
  if (req.file) {
    // Delete old uploaded logo
    if (site.icon && site.icon.startsWith('/uploads/')) {
      const old = path.join(__dirname, site.icon);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    site.icon = `/uploads/${req.file.filename}`;
  }

  db.sites[idx] = site;
  writeDB(db);
  res.json({ ok: true, site });
});

// Delete site
app.delete('/api/admin/sites/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const site = db.sites.find(s => s.id === req.params.id);
  if (!site) return res.status(404).json({ error: 'Not found' });

  // Delete logo file
  if (site.icon && site.icon.startsWith('/uploads/')) {
    const fp = path.join(__dirname, site.icon);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  db.sites = db.sites.filter(s => s.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  VISITORS API
// ═══════════════════════════════════════════════════════════════════════════

// Get all visitors
app.get('/api/admin/visitors', requireAdmin, (req, res) => {
  const db = readDB();
  res.json(db.visitors.map(({ id, username, allowedSites, createdAt }) =>
    ({ id, username, allowedSites, createdAt })
  ));
});

// Create visitor
app.post('/api/admin/visitors', requireAdmin, async (req, res) => {
  const { username, password, allowedSites } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = readDB();
  if (db.visitors.find(v => v.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const visitor = {
    id: uuidv4(),
    username: username.trim(),
    password: hashed,
    allowedSites: allowedSites || 'all', // 'all' or array of site IDs
    createdAt: new Date().toISOString()
  };

  db.visitors.push(visitor);
  writeDB(db);
  res.json({ ok: true, visitor: { id: visitor.id, username: visitor.username, allowedSites: visitor.allowedSites } });
});

// Update visitor
app.put('/api/admin/visitors/:id', requireAdmin, async (req, res) => {
  const db = readDB();
  const idx = db.visitors.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Visitor not found' });

  const { password, allowedSites } = req.body;
  if (password) db.visitors[idx].password = await bcrypt.hash(password, 10);
  if (allowedSites !== undefined) db.visitors[idx].allowedSites = allowedSites;

  writeDB(db);
  res.json({ ok: true });
});

// Delete visitor
app.delete('/api/admin/visitors/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.visitors = db.visitors.filter(v => v.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Change admin password
app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = readDB();
  const match = await bcrypt.compare(currentPassword, db.admin.password);
  if (!match) return res.json({ ok: false, error: 'Current password is wrong' });
  db.admin.password = await bcrypt.hash(newPassword, 10);
  writeDB(db);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PROXY
// ═══════════════════════════════════════════════════════════════════════════
app.get('/proxy', requireAuth, async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');

  try {
    const parsedUrl = new URL(targetUrl);
    const hostname = parsedUrl.hostname;
    const db = readDB();

    // Match site cookies
    const site = db.sites.find(s => {
      try {
        const sh = new URL(s.url).hostname;
        return sh === hostname || hostname.endsWith('.' + sh.replace(/^www\./, ''));
      } catch { return false; }
    });

    // Check visitor access
    if (req.session.role === 'visitor' && site) {
      const visitor = db.visitors.find(v => v.id === req.session.visitorId);
      if (!visitor) return res.status(403).send('Access denied');
      if (site.access === 'admin') return res.status(403).send('Admin only');
      if (site.access === 'selected' && visitor.allowedSites !== 'all') {
        if (!visitor.allowedSites?.includes(site.id)) return res.status(403).send('Access denied');
      }
    }

    const cookieHeader = (site?.cookies || []).map(c => `${c.name}=${c.value}`).join('; ');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': targetUrl,
    };
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const response = await fetch(targetUrl, { headers, redirect: 'follow' });
    const contentType = response.headers.get('content-type') || 'text/html';

    if (!contentType.includes('text/html')) {
      const buffer = await response.buffer();
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    }

    let html = await response.text();
    const $ = cheerio.load(html);
    const base = `${parsedUrl.protocol}//${parsedUrl.host}`;

    function resolveUrl(href) {
      if (!href || href.startsWith('data:') || href.startsWith('#') || href.startsWith('javascript:')) return href;
      try { return `/proxy?url=${encodeURIComponent(new URL(href, base).href)}`; }
      catch { return href; }
    }

    $('[href]').each((_, el) => { const h = $(el).attr('href'); if (h) $(el).attr('href', resolveUrl(h)); });
    $('[src]').each((_, el) => { const s = $(el).attr('src'); if (s) $(el).attr('src', resolveUrl(s)); });
    $('[action]').each((_, el) => { const a = $(el).attr('action'); if (a) $(el).attr('action', resolveUrl(a)); });
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('script').each((_, el) => {
      const c = $(el).html() || '';
      if (c.includes('top.location') || c.includes('self == top')) $(el).remove();
    });
    $('head').prepend(`<base href="${base}/">`);

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());

  } catch (err) {
    res.status(500).send(`<html><body style="font-family:sans-serif;padding:40px;background:#111;color:#fff;"><h2>⚠️ Error</h2><p>${err.message}</p></body></html>`);
  }
});

// ── Page routes ───────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🖥️  Kiosk Browser v2 running at http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`   Default login → username: admin | password: password\n`);
});
