# Deploy AMS Pro

**Frontend** → [Netlify](https://netlify.com) (static SPA)  
**Backend API** → [Render](https://render.com) (Node/Express)  
**Database & Auth** → [Supabase](https://supabase.com) (already configured)

---

## Architecture

```
Browser  →  Netlify (index.html, js/, css/)
              ↓ Supabase JS client
           Supabase (PostgreSQL, Auth, RLS)
              ↑ optional health/config
           Render API (server/) — /health, /api/config, /api/health
```

The app talks to **Supabase directly** for data. The **Render API** provides health checks, public config, and CORS for production.

---

## 1. Push code to GitHub

```bash
cd c:\backend
git init
git add .
git commit -m "AMS Pro — Netlify frontend + Render API"
git branch -M main
git remote add origin https://github.com/YOUR_USER/ams-pro.git
git push -u origin main
```

---

## 2. Deploy backend on Render

1. Go to [render.com](https://render.com) → **New** → **Blueprint** (or **Web Service**)
2. Connect your GitHub repo
3. If using **Blueprint**, Render reads `render.yaml` automatically
4. If manual **Web Service**:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`

### Render environment variables

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | `https://nwdrnhjlvashisxgputy.supabase.co` |
| `SUPABASE_ANON_KEY` | your Supabase anon/publishable key |
| `FRONTEND_URL` | `https://aws-management.netlify.app` |

5. Deploy → note your API URL, e.g. `https://ams-pro-api.onrender.com`
6. Test: open `https://YOUR-API.onrender.com/health`

---

## 3. Deploy frontend on Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Connect the same GitHub repo
3. Netlify auto-detects `netlify.toml`:
   - **Build command:** `node scripts/build-frontend.js`
   - **Publish directory:** `.` (repo root)

### Netlify environment variables

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | `https://nwdrnhjlvashisxgputy.supabase.co` |
| `SUPABASE_ANON_KEY` | same anon key as Render |
| `API_URL` | `https://ams-pro-api.onrender.com` |

> **Common mistake:** Set the **value** to your actual Supabase publishable key — not the text `SUPABASE_ANON_KEY`.  
> Find it in Supabase → Project Settings → API → `anon` / publishable key.

4. Deploy → your site: `https://aws-management.netlify.app`

---

## 4. Supabase auth URLs (required)

In **Supabase Dashboard** → **Authentication** → **URL Configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://aws-management.netlify.app` |
| **Redirect URLs** | `https://aws-management.netlify.app/**` |
| | `http://localhost:3000/**` (local dev) |

---

## 5. Finish Render CORS

Back on **Render**, set:

```
FRONTEND_URL=https://YOUR-SITE.netlify.app
```

Redeploy the API service so CORS allows your Netlify domain.

---

## 6. Database SQL (one-time)

Run in Supabase SQL Editor (in order):

1. `database/schema.sql`
2. `database/fix_rls.sql`
3. `database/seed_admin.sql`
4. `database/fix_permissions_rls.sql`

Create admin in **Authentication → Users**, then run seed script.

---

## Local development

```bash
# Frontend only
npm start
# → http://localhost:3000

# Backend API
cd server
npm install
SUPABASE_URL=... SUPABASE_ANON_KEY=... npm start
# → http://localhost:10000
```

---

## Verify production

| Check | URL |
|-------|-----|
| Frontend | `https://YOUR-SITE.netlify.app` |
| API health | `https://YOUR-API.onrender.com/health` |
| API + Supabase | `https://YOUR-API.onrender.com/api/health` |
| Login | `admin@acme.in` / `Admin@123456` |

---

## Troubleshooting

**Login fails / "Invalid API key"** — Netlify `SUPABASE_ANON_KEY` was set to the literal text `SUPABASE_ANON_KEY`. Fix in Netlify → Site settings → Environment variables → paste the real key from Supabase Dashboard → API, then redeploy.

**Backend shows offline** — Render API is optional for data; Supabase is the database. Check `https://ams-pro-api.onrender.com/api/health`. Free Render sleeps ~30s on first request.

**Login fails after deploy** — Add `https://aws-management.netlify.app/**` to Supabase redirect URLs.

**CORS errors** — Set `FRONTEND_URL` on Render to exact Netlify URL (no trailing slash).

**Render cold start** — Free tier sleeps after ~15 min; first request may take 30–60s.

**Build fails on Netlify** — Ensure `scripts/build-frontend.js` runs; check env vars are set.
