# 🖥️ Kiosk Browser v2
## With Admin Panel + Visitor Access Control

---

## 🚀 Quick Start

### 1. Install Node.js
Download from https://nodejs.org (LTS version)

### 2. Install dependencies
```bash
npm install
```

### 3. Start the server
```bash
npm start
```

---

## 🔗 URLs

| Page | URL |
|------|-----|
| Visitor Kiosk | http://localhost:3000 |
| Admin Panel | http://localhost:3000/admin |

---

## 🔐 Default Login

**Admin Panel:**
- Username: `admin`
- Password: `password`

> ⚠️ Change the password immediately after first login! Go to Admin → Settings → Change Password

---

## 👑 Admin Panel Features

### Apps Management
1. Go to **http://localhost:3000/admin**
2. Click **Apps** in the sidebar
3. Click **Add App** to add a new website:
   - Upload a logo (PNG/JPG/SVG) OR paste an icon URL
   - Enter the app name and URL
   - Set access level (Public / Selected Visitors / Admin Only)
   - Add login cookies (optional — to keep the site logged in)
4. Edit or delete apps anytime

### Visitor Management
1. Click **Visitors** in the sidebar
2. Click **Add Visitor**
3. Set username + password for the visitor
4. Choose what they can access:
   - **All Public Apps** — sees every app marked as Public
   - **Only Selected Apps** — pick specific apps they can see
5. Share the kiosk URL + their credentials with them

### Access Levels for Apps
| Level | Who can see it |
|-------|----------------|
| 🌍 Public | All logged-in visitors |
| 🔐 Selected Visitors | Only visitors you specifically grant |
| 👑 Admin Only | Only you (admin) |

---

## 🍪 Adding Login Cookies (to keep sites logged in)

1. Open Chrome and log into the website normally
2. Press **F12** → **Application** tab → Cookies → click the site URL
3. Copy the important cookie names and values
4. In Admin Panel → Apps → Edit App → add cookies

Common cookies to copy:
- Google/Gmail/YouTube: `SID`, `SSID`, `HSID`, `APISID`, `SAPISID`
- GitHub: `user_session`
- Most sites: `session`, `auth_token`, `remember_token`, `access_token`

---

 🌐 Deploy Online (share with others)

 Railway (recommended — free)
1. Push code to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Railway gives you a public URL automatically

 Render (free)
1. Go to https://render.com → New Web Service
2. Connect your GitHub repo
3. Start Command: `node server.js`
4. Deploy

---

 📁 File Structure

```
kiosk-browser/
├── server.js              ← Express server (proxy + API + auth)
├── package.json
├── data/
│   └── db.json            ← Database (sites, visitors, admin)
├── uploads/               ← Uploaded logos stored here
└── public/
    ├── index.html         ← Visitor kiosk browser
    └── admin.html         ← Admin panel
```

---

 🔒 Security Notes

- All routes are protected — visitors must log in
- Cookies are never exposed to visitors (server-side only)
- Change the default admin password immediately
- Keep `data/db.json` private (contains hashed passwords)
