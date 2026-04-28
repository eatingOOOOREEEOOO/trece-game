# TRECE — Cloudflare Pages Deployment Guide

## Project Structure

```
trece-cf/
├── public/
│   └── index.html          ← Your game (served as static site)
├── functions/
│   └── api/
│       └── getkey.js       ← Cloudflare Pages Function (replaces Netlify function)
├── wrangler.toml           ← Cloudflare config
└── README.md
```

---

## Step 1 — Push to GitHub

1. Create a new GitHub repository (e.g. `trece-game`)
2. Upload this entire `trece-cf/` folder contents to the repo root:
   - `public/index.html`
   - `functions/api/getkey.js`
   - `wrangler.toml`

---

## Step 2 — Connect to Cloudflare Pages

1. Go to [https://pages.cloudflare.com](https://pages.cloudflare.com)
2. Click **"Create a project"** → **"Connect to Git"**
3. Select your GitHub repo
4. Set build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
5. Click **"Save and Deploy"**

---

## Step 3 — Add Your Ably API Key (Secret)

After the first deploy:

1. In Cloudflare Pages, go to your project → **Settings** → **Environment Variables**
2. Click **"Add variable"**
3. Set:
   - **Variable name:** `ABLY_API_KEY`
   - **Value:** your Ably API key (e.g. `xVLyHw.xxxxxx:yyyyyyy`)
   - **Encrypt:** ✅ Yes (tick the encrypt checkbox)
4. Click **"Save"**
5. Go to **Deployments** → click **"Retry deployment"** (so the new env var takes effect)

---

## Step 4 — Done!

Your game will be live at:
`https://trece-game.pages.dev` (or your custom domain)

---

## Cloudflare Free Tier Limits (very generous)

| Resource              | Free Limit         |
|-----------------------|--------------------|
| Requests/month        | Unlimited static   |
| Functions requests    | 100,000/day        |
| Bandwidth             | Unlimited          |
| Custom domains        | Unlimited          |

The `/api/getkey` function is only called once per player session (at lobby load),
so 100,000 daily calls = supports ~100,000 game sessions per day for free.

---

## Local Development (optional)

Install Wrangler CLI and test locally:

```bash
npm install -g wrangler
wrangler pages dev public --compatibility-date=2024-01-01
```

Then set a local secret:
```bash
# Create a .dev.vars file (gitignore this!)
echo 'ABLY_API_KEY=your_key_here' > .dev.vars
```
