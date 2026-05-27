# p4ai.in — Product studio (frontend)

Browser-based **3D bottle studio** for [p4ai.in](https://p4ai.in): interactive landing, 3D configurator, bottle mockup with logo upload, and an all-in-one studio. Built with **Vite 7**, **React 18**, **Three.js** / **React Three Fiber**, **Tailwind CSS 4**, and **Sass**.

## What’s in the app

| Path | Description |
|------|-------------|
| `/` | Landing — hero, effects, links into tools |
| `/next`, `/dome` | Landing variants (infinite menu / dome gallery) |
| `/configurator` | 3D bottle — spin, colors |
| `/bottle` | Bottle mockup — upload logo, preview engraving |
| `/configurebottle` | Combined colors + logo in one view |

Local dev maps `/configurator`, `/bottle`, and `/configurebottle` to the right HTML entry (same as `vercel.json` on deploy).

## Prerequisites

- [Node.js](https://nodejs.org/) **20+** (LTS recommended)
- **npm** (ships with Node)

Optional: run the **API** from the repo `server/` folder if you use upload / save-mockup features (see root `Readme.md`).

## Install

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

- App: **http://localhost:3000/** (see `vite.config.js` / `_config.js` if you change host or port)
- API proxy: `/api`, `/uploads`, and `/mockups` are proxied to **http://127.0.0.1:8000** when the FastAPI server is running

## Build & preview (production)

```bash
npm run build
npm run preview
```

`prebuild` copies `src/styles/reload-loader.css` into `public/` so the first paint loader stays in sync.

## Other scripts

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run format` | Prettier |
| `npm run test` | Playwright tests |
| `npm run test:ui` | Playwright UI mode |

## Deploy (Vercel)

This repo includes **`vercel.json`** so clean URLs (`/configurator`, `/bottle`, `/configurebottle`, `/next`, `/dome`) rewrite to the correct HTML files. **Build command:** `npm run build`. **Output directory:** `dist`.

**API host:** `src/lib/api-base.js` sends `/api/*` to **`https://winebottle.onrender.com`** in production builds when `VITE_API_BASE_URL` is unset (demo default). Override with **`VITE_API_BASE_URL`** in Vercel if you move the API.

Locally, leave `VITE_API_BASE_URL` unset so `/api/*` still uses the Vite proxy to `127.0.0.1:8000`.

## License

See `LICENSE` in this folder.
