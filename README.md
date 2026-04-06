# 🖥️ KIOSK BROWSER  — COMPLETE GUIDE
## Deploy on cPanel or Vercel

---

## 🔐 DEFAULT LOGIN CREDENTIALS

```
╔════════════════════════════════╗
║   ADMIN PANEL LOGIN            ║
║   Username : admin             ║
║   Password : admin123          ║
╚════════════════════════════════╝
```

⚠️ IMPORTANT: Change this password right after first login!
→ Admin Panel → Settings → Change Admin Password

---

## 📁 PROJECT STRUCTURE

```
kiosk-browser/
├── server.js          ← Main server (Express)
├── vercel.json        ← Vercel deployment config
├── .htaccess          ← cPanel Apache/Passenger config
├── package.json       ← Node.js dependencies
├── data/
│   └── db.json        ← Database (sites, visitors, admin)
└── public/
    ├── index.html     ← Visitor Kiosk Browser
    └── admin.html     ← Admin Panel
```

---

## 🌐 URLS AFTER DEPLOY

| Page         | URL                          |
|--------------|------------------------------|
| Visitor Kiosk| https://yourdomain.com/      |
| Admin Panel  | https://yourdomain.com/admin |

---
---

# 🖥️ DEPLOY ON cPANEL

### Prerequisites
- cPanel hosting that supports **Node.js Apps**
- Node.js version **16+** available
- SSH access or cPanel File Manager

---

## STEP 1 — Upload Your Files

### Option A: File Manager (No SSH)
1. Login to cPanel → **File Manager**
2. Go to your home directory (e.g. `/home/yourusername/`)
3. Create a new folder called `kiosk-browser`
4. Upload all project files into that folder
5. Make sure the folder structure matches the one above

### Option B: SSH (Faster)
```bash
# Connect via SSH
ssh username@yourdomain.com

# Create folder
mkdir ~/kiosk-browser
cd ~/kiosk-browser

# Upload via SFTP or run:
# scp -r /local/kiosk-browser/* username@yourdomain.com:~/kiosk-browser/
```

---

## STEP 2 — Set Up Node.js App in cPanel

1. Login to **cPanel**
2. Scroll down → find **"Setup Node.js App"** (in Software section)
3. Click **"Create Application"**
4. Fill in these settings:

```
Node.js version    : 18.x (or latest available)
Application mode   : Production
Application root   : kiosk-browser
Application URL    : yourdomain.com  (or subdomain)
Application startup file : server.js
```

5. Click **"Create"**

---

## STEP 3 — Install Dependencies

After creating the app, cPanel shows a command. Run it:

### Via cPanel Terminal:
1. cPanel → **Terminal** (in Advanced section)
2. Run:
```bash
cd ~/kiosk-browser
npm install
```

### Via SSH:
```bash
cd ~/kiosk-browser
npm install
```

---

## STEP 4 — Set Environment Variables (Optional but recommended)

In cPanel → Setup Node.js App → your app → **Environment Variables**:

```
SESSION_SECRET = any-long-random-string-here-change-this
NODE_ENV       = production
PORT           = 3000
```

---

## STEP 5 — Start the App

1. cPanel → Setup Node.js App → your app
2. Click **"Start App"** or **"Restart"**
3. Visit your domain — the kiosk should be live!

---

## STEP 6 — Verify It Works

Open: `https://yourdomain.com`
→ You should see the login screen

Open: `https://yourdomain.com/admin`
→ Login with `admin` / `admin123`

---

## cPanel TROUBLESHOOTING

### App won't start?
- Check Node.js version is 16+
- Make sure `npm install` ran successfully
- Check cPanel error logs: Setup Node.js App → Logs

### 500 Error?
- Check that `data/db.json` exists and is valid JSON
- Check file permissions: `chmod 755 ~/kiosk-browser`

### Can't find "Setup Node.js App"?
- Contact your hosting provider — not all cPanel hosts support Node.js
- Ask them to enable Node.js / Passenger support

---
---

# ▲ DEPLOY ON VERCEL

### ⚠️ Vercel Note
Vercel is serverless. The database (`db.json`) **resets on each deployment**.
- This means: apps and visitors you add via Admin Panel will persist during a session, but may reset on redeploy.
- **Workaround**: Edit `data/db.json` directly before deploying to pre-configure your apps.
- For permanent storage, consider **Railway** or **Render** instead (see below).

---

## STEP 1 — Push to GitHub

1. Create a GitHub account at https://github.com (if you don't have one)
2. Create a **new repository** (click + → New repository)
3. Name it `kiosk-browser`, make it **Private**
4. Upload all your project files to it

### If you have Git installed:
```bash
cd kiosk-browser
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/kiosk-browser.git
git push -u origin main
```

---

## STEP 2 — Deploy to Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"** → Sign up with GitHub
3. Click **"Add New Project"**
4. Select your `kiosk-browser` repository
5. Vercel will detect Node.js automatically
6. In **Environment Variables** section, add:

```
SESSION_SECRET = any-long-random-string-change-this
```

7. Click **"Deploy"**
8. Wait ~2 minutes
9. Vercel gives you a URL like: `https://kiosk-browser-xyz.vercel.app`

---

## STEP 3 — Set Custom Domain (Optional)

1. Vercel Dashboard → your project → **Domains**
2. Add your custom domain
3. Follow Vercel's DNS instructions

---

## STEP 4 — Verify

Open: `https://your-vercel-url.vercel.app`
→ Login screen appears ✓

Open: `https://your-vercel-url.vercel.app/admin`
→ Admin panel with `admin` / `admin123` ✓

---
---

# 🚀 DEPLOY ON RAILWAY (BEST FOR PERSISTENCE)

Railway is Vercel-like but supports persistent file storage. **Recommended over Vercel for this app.**

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Click **"Deploy from GitHub repo"**
4. Select your `kiosk-browser` repo
5. Add environment variable: `SESSION_SECRET = your-random-string`
6. Railway auto-detects Node.js and deploys
7. Click **"Generate Domain"** to get a public URL

Your database persists between deploys! ✅

---
---

# 🎮 HOW TO USE THE ADMIN PANEL

## Login
- Go to: `https://yourdomain.com/admin`
- Username: `admin`
- Password: `admin123`
- ⚠️ Change password in Settings immediately!

## Adding Apps
1. Click **Apps** in sidebar
2. Click **➕ Add App**
3. Search and click a logo (YouTube, Gmail, Discord, etc.)
4. Enter App Name + Website URL
5. Choose Access Level:
   - **🌍 Public** → All visitors see it
   - **🔐 Selected** → Only chosen visitors see it
   - **👑 Admin Only** → Only you see it
6. Add cookies if you want it auto-logged-in (optional)
7. Click **Save App**

## Adding Login Cookies (to keep sites logged in)
1. Open Chrome → log into the website normally
2. Press **F12** → click **Application** tab
3. Click **Cookies** in left sidebar → click the website URL
4. Copy cookie Name + Value pairs
5. In Admin → Edit App → add cookies

Common cookies:
- **Google/Gmail/YouTube**: `SID`, `SSID`, `HSID`
- **GitHub**: `user_session`
- **Most sites**: `session_id`, `auth_token`, `remember_me`

## Adding Visitors
1. Click **Visitors** in sidebar
2. Click **➕ Add Visitor**
3. Enter username + password
4. Choose what they can access:
   - **All Public Apps** → sees everything marked Public
   - **Only Specific Apps** → pick which ones they can see
5. Click **Save Visitor**
6. Share with them: `Kiosk URL + username + password`

---

# 🍪 COOKIE TIPS

| Website      | Important Cookies                        |
|-------------|------------------------------------------|
| Google       | SID, SSID, HSID, APISID, SAPISID        |
| Gmail        | Same as Google above                     |
| YouTube      | Same as Google above                     |
| GitHub       | user_session, dotcom_user                |
| Twitter/X    | auth_token, ct0                          |
| Facebook     | c_user, xs, datr                         |
| Instagram    | sessionid, csrftoken                     |
| Reddit       | reddit_session, token_v2                 |
| Any site     | session, session_id, auth_token          |

---

# ❓ FAQ

**Q: What's the default password?**
A: Username `admin`, Password `admin123` — change it after first login!

**Q: Can visitors see each other?**
A: No. Each visitor logs in separately.

**Q: Can I have multiple admins?**
A: Currently only one admin account. Use visitors for other people.

**Q: Why does the site look broken in the browser?**
A: Many modern websites (Google, Facebook) use strong anti-proxy protection. They may not load perfectly through a proxy — this is a limitation of all proxy-based browsers.

**Q: My data disappeared on Vercel!**
A: Vercel resets `/tmp` on cold starts. Use Railway or Render for permanent data.

**Q: How do I reset the admin password?**
A: Delete `data/db.json` and restart — it recreates with default password `admin123`.
Or SSH into server and run:
```bash
node -e "const b=require('bcryptjs');console.log(b.hashSync('yournewpassword',10))"
```
Then paste the output into `data/db.json` under `admin.password`.
