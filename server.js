/**
 * KIOSK BROWSER v3
 * Supports: Local, cPanel (Node.js App), Vercel
 *
 * DEFAULT ADMIN LOGIN:
 *   Username: admin
 *   Password: admin123
 */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Detect environment ────────────────────────────────────────────────────
const IS_VERCEL = !!process.env.VERCEL;
const SEED_PATH = path.join(__dirname, 'data', 'db.json');
// Vercel has read-only FS except /tmp; use /tmp for writes
const DB_PATH = IS_VERCEL ? '/tmp/kiosk-db.json' : SEED_PATH;

// ── Ensure data dir exists (local/cPanel) ────────────────────────────────
if (!IS_VERCEL && !fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// ── DB helpers ────────────────────────────────────────────────────────────
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    // On Vercel first cold-start or missing DB: load from seed
    try {
      const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
      if (IS_VERCEL) fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
      return seed;
    } catch {
      return { admin: { username: 'admin', password: '' }, sites: [], visitors: [] };
    }
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionSecret = process.env.SESSION_SECRET || 'kiosk-secret-key-change-in-production';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours
    secure: process.env.NODE_ENV === 'production' && !IS_VERCEL ? true : false
  }
}));

// ── Auth guards ───────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session?.role === 'admin') return next();
  res.status(401).json({ error: 'Admin login required' });
}
function requireAuth(req, res, next) {
  if (req.session?.role === 'admin' || req.session?.role === 'visitor') return next();
  res.status(401).json({ error: 'Login required' });
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/admin-login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  if (username !== db.admin.username) return res.json({ ok: false, error: 'Wrong username or password' });
  const match = await bcrypt.compare(password, db.admin.password);
  if (!match) return res.json({ ok: false, error: 'Wrong username or password' });
  req.session.role = 'admin';
  req.session.username = username;
  res.json({ ok: true });
});

app.post('/api/auth/visitor-login', async (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const visitor = db.visitors.find(v => v.username === username);
  if (!visitor) return res.json({ ok: false, error: 'Wrong username or password' });
  const match = await bcrypt.compare(password, visitor.password);
  if (!match) return res.json({ ok: false, error: 'Wrong username or password' });
  req.session.role = 'visitor';
  req.session.username = username;
  req.session.visitorId = visitor.id;
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.role) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, role: req.session.role, username: req.session.username });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SITES API
// ═══════════════════════════════════════════════════════════════════════════

// Public site list (filtered by visitor access)
app.get('/api/sites', requireAuth, (req, res) => {
  const db = readDB();
  let sites = db.sites;
  if (req.session.role === 'visitor') {
    const visitor = db.visitors.find(v => v.id === req.session.visitorId);
    if (!visitor) return res.status(401).json({ error: 'Session expired' });
    sites = sites.filter(site => {
      if (site.access === 'admin') return false;
      if (site.access === 'public') return true;
      if (site.access === 'selected') {
        return visitor.allowedSites === 'all' || visitor.allowedSites?.includes(site.id);
      }
      return false;
    });
  }
  res.json(sites.map(({ id, name, url, svgLogo, access, createdAt }) =>
    ({ id, name, url, svgLogo, access, createdAt })
  ));
});

// Admin: all sites with cookies
app.get('/api/admin/sites', requireAdmin, (req, res) => {
  res.json(readDB().sites);
});

// Add site
app.post('/api/admin/sites', requireAdmin, (req, res) => {
  const db = readDB();
  const { name, url, svgLogo, cookies, access } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
  const site = {
    id: uuidv4().split('-')[0],
    name: name.trim(),
    url: url.startsWith('http') ? url.trim() : 'https://' + url.trim(),
    svgLogo: svgLogo || null,
    cookies: Array.isArray(cookies) ? cookies : [],
    access: access || 'public',
    createdAt: new Date().toISOString()
  };
  db.sites.push(site);
  writeDB(db);
  res.json({ ok: true, site });
});

// Update site
app.put('/api/admin/sites/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const idx = db.sites.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, url, svgLogo, cookies, access } = req.body;
  const site = db.sites[idx];
  if (name) site.name = name.trim();
  if (url) site.url = url.startsWith('http') ? url.trim() : 'https://' + url.trim();
  if (svgLogo !== undefined) site.svgLogo = svgLogo;
  if (access) site.access = access;
  if (Array.isArray(cookies)) site.cookies = cookies;
  db.sites[idx] = site;
  writeDB(db);
  res.json({ ok: true, site });
});

// Delete site
app.delete('/api/admin/sites/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.sites = db.sites.filter(s => s.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  VISITORS API
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/visitors', requireAdmin, (req, res) => {
  const db = readDB();
  res.json(db.visitors.map(({ id, username, allowedSites, createdAt }) =>
    ({ id, username, allowedSites, createdAt })
  ));
});

app.post('/api/admin/visitors', requireAdmin, async (req, res) => {
  const { username, password, allowedSites } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const db = readDB();
  if (db.visitors.find(v => v.username === username))
    return res.status(400).json({ error: 'Username already exists' });
  const hashed = await bcrypt.hash(password, 10);
  const visitor = {
    id: uuidv4(),
    username: username.trim(),
    password: hashed,
    allowedSites: allowedSites || 'all',
    createdAt: new Date().toISOString()
  };
  db.visitors.push(visitor);
  writeDB(db);
  res.json({ ok: true, visitor: { id: visitor.id, username: visitor.username, allowedSites: visitor.allowedSites } });
});

app.put('/api/admin/visitors/:id', requireAdmin, async (req, res) => {
  const db = readDB();
  const idx = db.visitors.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { password, allowedSites } = req.body;
  if (password) db.visitors[idx].password = await bcrypt.hash(password, 10);
  if (allowedSites !== undefined) db.visitors[idx].allowedSites = allowedSites;
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/visitors/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.visitors = db.visitors.filter(v => v.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = readDB();
  const match = await bcrypt.compare(currentPassword, db.admin.password);
  if (!match) return res.json({ ok: false, error: 'Current password is wrong' });
  if (newPassword.length < 6) return res.json({ ok: false, error: 'Password must be at least 6 characters' });
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

    // Find site + apply access control
    const site = db.sites.find(s => {
      try {
        const sh = new URL(s.url).hostname;
        return sh === hostname || hostname.endsWith('.' + sh.replace(/^www\./, ''));
      } catch { return false; }
    });

    if (req.session.role === 'visitor' && site) {
      const visitor = db.visitors.find(v => v.id === req.session.visitorId);
      if (!visitor) return res.status(403).send('Session expired');
      if (site.access === 'admin') return res.status(403).send('Access denied');
      if (site.access === 'selected' && visitor.allowedSites !== 'all') {
        if (!visitor.allowedSites?.includes(site.id)) return res.status(403).send('Access denied');
      }
    }

    const cookieHeader = (site?.cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': targetUrl,
    };
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const response = await fetch(targetUrl, { headers, redirect: 'follow' });
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) {
      const buf = await response.buffer();
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(buf);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const base = `${parsedUrl.protocol}//${parsedUrl.host}`;

    const rewrite = (href) => {
      if (!href || href.startsWith('data:') || href.startsWith('#') || href.startsWith('javascript:')) return href;
      try { return `/proxy?url=${encodeURIComponent(new URL(href, base).href)}`; }
      catch { return href; }
    };

    $('[href]').each((_, el) => { const h = $(el).attr('href'); if (h) $(el).attr('href', rewrite(h)); });
    $('[src]').each((_, el) => { const s = $(el).attr('src'); if (s) $(el).attr('src', rewrite(s)); });
    $('[action]').each((_, el) => { const a = $(el).attr('action'); if (a) $(el).attr('action', rewrite(a)); });
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
    res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:40px;background:#111;color:#fff;text-align:center;">
        <h2>⚠️ Could not load page</h2><p style="color:#888;">${err.message}</p>
        <p style="color:#666;font-size:13px;">This site may block proxy access. Try navigating directly.</p>
      </body></html>`);
  }
});

// ── Page routes ───────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start server (skip on Vercel — it imports the module) ─────────────────
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════╗');
    console.log('║   🖥️  KIOSK BROWSER v3 RUNNING   ║');
    console.log('╠══════════════════════════════════╣');
    console.log(`║  Kiosk:  http://localhost:${PORT}    ║`);
    console.log(`║  Admin:  http://localhost:${PORT}/admin ║`);
    console.log('╠══════════════════════════════════╣');
    console.log('║  Username: admin                 ║');
    console.log('║  Password: admin123              ║');
    console.log('╚══════════════════════════════════╝\n');
  });
}

// Export for Vercel
module.exports = app;
