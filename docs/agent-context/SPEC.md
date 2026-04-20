# SPEC — anymal-os-marketing-dashboard

Code-level architecture reference for this repo. What exists, where it lives, what it does.

## §1 — One-sentence purpose of this repo

Internal operator dashboard (React + Vite SPA) that lets Carlos review, edit, approve, and publish AI-generated marketing drafts by calling the `anymal-os-marketing` backend; it also exposes manual triggers for the research and content agents.

## §2 — Language, framework, deploy target

- **Language:** JavaScript (ES modules, JSX) — no TypeScript.
- **Framework:** React 19.2 + React Router 7.14 + Vite 8.0 (dev/build).
- **Deploy target:** Vercel. `vercel.json` rewrites every path to `/index.html` so client-side routing survives refresh.
- **How deploys happen:** Vercel auto-deploys from the connected GitHub repo. `main` → production, feature branches → preview URLs. No `railway.toml`, no GitHub Actions workflow in-tree — Vercel is the only deploy pipeline.
- **Lint/build scripts (`package.json`):** `npm run dev` (vite), `npm run build` (vite build), `npm run lint` (eslint), `npm run preview`.

## §3 — File structure

```
/ (repo root)
├── index.html                         (16 LOC — Vite HTML entry; loads IBM Plex fonts, mounts #root, imports /src/main.jsx)
├── package.json                       (29 LOC — deps: react, react-dom, react-router-dom; devDeps: vite, eslint, plugin-react)
├── vite.config.js                     (8 LOC — minimal: @vitejs/plugin-react only)
├── vercel.json                        (3 LOC — SPA rewrite: all paths → /index.html)
├── eslint.config.js                   (lint config — not inspected in detail during audit)
├── README.md                          (17 LOC — default Vite/React template README; not customized for this project)
├── .env.example                       (3 LOC — documents VITE_MARKETING_API_URL, VITE_MARKETING_API_KEY, VITE_DASHBOARD_PASSWORD)
├── .env.local                         (gitignored — local overrides)
├── .gitignore                         (25 LOC — standard Node/Vite ignores + editor dirs)
├── public/
│   ├── favicon.svg                    (static — served as-is)
│   └── icons.svg                      (static — served as-is)
├── dist/                              (build output — gitignored; snapshot from Apr 17 present locally but not tracked)
└── src/
    ├── main.jsx                       (10 LOC — ReactDOM.createRoot, mounts <App/> in StrictMode)
    ├── App.jsx                        (85 LOC — sessionStorage password gate + BrowserRouter with 3 routes; nav bar)
    ├── config.js                      (7 LOC — exports MARKETING_API, API_KEY, DASHBOARD_PASSWORD, headers object)
    ├── index.css                      (4 LOC — global reset + dark-green body color + IBM Plex font-family)
    ├── App.css                        (empty file — 1 blank line; kept from Vite template)
    ├── assets/
    │   ├── hero.png                   (static image asset; not referenced by any .jsx during audit)
    │   ├── react.svg                  (Vite template leftover)
    │   └── vite.svg                   (Vite template leftover)
    ├── components/
    │   ├── ApproveConfirmModal.jsx    (444 LOC — publish-confirmation modal w/ preview, UTM/image/char details, warnings (no image, default UTM, em-dash), focus trap, Esc to cancel)
    │   └── ReplyTargetContext.jsx     (132 LOC — "Replying to" card for facebook_reply drafts; renders target_page_name/target_post_text/target_comment_text links)
    └── pages/
        ├── CampaignDashboard.jsx      (846 LOC — main screen: channel tabs, pending drafts w/ inline editor, approve/reject, recently-published feed; also contains InlineEditor, CampaignCard, PublishedCard sub-components and url/utm helpers)
        ├── ResearchBrief.jsx          (104 LOC — view today's research brief; "Re-run Research" button)
        └── PipelineControl.jsx        (56 LOC — manual triggers for Research Agent + Content Agent)
```

## §4 — HTTP endpoints (frontend: backend routes consumed)

This repo does not expose endpoints — it is a client SPA. It calls a single backend, `MARKETING_API` (default `https://web-production-3f930.up.railway.app`, overridable via `VITE_MARKETING_API_URL`). All requests carry `X-API-Key: ${VITE_MARKETING_API_KEY}` and `Content-Type: application/json` (see `src/config.js:4-7`).

Routes invoked by the frontend, with call sites:

| Method | Path | Called from | Purpose (as understood by client) |
|---|---|---|---|
| GET  | `/campaigns/pending/by-channel?channel={id}` | `src/pages/CampaignDashboard.jsx:656` | List pending drafts, optionally filtered by channel |
| GET  | `/campaigns?status=published&limit=10` | `src/pages/CampaignDashboard.jsx:664` | Fetch recently-published posts |
| PATCH | `/campaigns/{campaign_id}` | `src/pages/CampaignDashboard.jsx:206` | Save inline edits (message, chart_base64) |
| POST | `/campaigns/{campaign_id}/approve` | `src/pages/CampaignDashboard.jsx:696` | Approve + publish draft |
| POST | `/campaigns/{campaign_id}/reject` | `src/pages/CampaignDashboard.jsx:727` | Reject draft |
| POST | `/content/run` | `src/pages/CampaignDashboard.jsx:750`, `PipelineControl.jsx` | Manually run content agent to generate drafts |
| GET  | `/research/brief` | `src/pages/ResearchBrief.jsx:13` | Fetch today's research brief |
| POST | `/research/run` | `src/pages/ResearchBrief.jsx:26`, `PipelineControl.jsx` | Manually run research agent |

Channel IDs sent via `?channel=` (see `CHANNELS` in `CampaignDashboard.jsx:7-14`): `facebook_page`, `anymal_linkedin`, `personal_linkedin`, `anymal_x`, `personal_x` (plus `all` client-side meta).

Additional channel the UI renders but does not list in the tab bar: `facebook_reply` — detected via `campaign.channel === 'facebook_reply'` and given dedicated rendering by `ReplyTargetContext` and special-cased labels in `ApproveConfirmModal`.

## §5 — Firestore collections

This repo does not read from or write to Firestore directly. All persistence is mediated by the backend at `MARKETING_API`. Not applicable.

## §6 — Cron / scheduled jobs

No scheduled work runs in this repo. The dashboard polls `fetchData()` every 60 seconds (`REFRESH_INTERVAL` in `CampaignDashboard.jsx:6`) while the Campaigns page is open; this is a UI auto-refresh, not a cron job. Scheduled content generation runs on the backend:

- Research agent: 8 AM CT (per copy in `PipelineControl.jsx:30` and `ResearchBrief.jsx:59`).
- Content agent: 9 AM CT (per copy in `PipelineControl.jsx:30` and `CampaignDashboard.jsx:800`).
- Post generation: 6 PM CT Tue/Wed (per copy in `PipelineControl.jsx:30`).

These are owned by the backend repo, not this one — noted here only because the UI surfaces them in helper text.

## §7 — Environment variables

All three are Vite build-time env vars (prefixed `VITE_`, read via `import.meta.env` in `src/config.js`). Absent values fall back to baked-in defaults that ship in the bundle — see §9 for the implications.

| Name | Required/Optional | Purpose | Set in |
|---|---|---|---|
| `VITE_MARKETING_API_URL` | optional | Base URL of the marketing backend. Defaults to `https://web-production-3f930.up.railway.app` | `.env.local` / Vercel project env |
| `VITE_MARKETING_API_KEY` | **effectively required** | `X-API-Key` header value for backend auth. Defaults to empty string — calls will 401 without it | `.env.local` / Vercel project env |
| `VITE_DASHBOARD_PASSWORD` | optional | Access code for the sessionStorage gate in `App.jsx`. Defaults to `anymal2026` | `.env.local` / Vercel project env |

## §8 — External service dependencies

- **anymal-os-marketing backend (Railway):** sole backend consumer. All campaign, research, and content endpoints live there. Default URL baked into `src/config.js:1`.
- **Vercel:** hosting + auto-deploy from GitHub. `vercel.json` handles SPA rewrites.
- **Google Fonts (fonts.googleapis.com):** IBM Plex Sans + IBM Plex Mono loaded via `<link>` in `index.html:9`.
- **GitHub (kibble-me-this/anymal-os-marketing-dashboard):** source of truth for deploys.

No direct Firebase, Firestore, Meta Graph, LinkedIn, X, or third-party API calls from this repo — those integrations all live behind the marketing backend.

## §9 — Known limitations / caveats

- **Client-side password gate is cosmetic.** `DASHBOARD_PASSWORD` is checked in `App.jsx:33` against a value bundled into the JS; it is visible to anyone who loads the app. It is a speed bump, not access control. The real auth boundary is the backend `X-API-Key`.
- **`VITE_MARKETING_API_KEY` is embedded in the shipped bundle** (as with any `VITE_` env on a static SPA). Anyone who loads the site can extract it from the built JS. Treat it as a low-trust key; rotate if compromised. Scoping / IP-restriction must happen server-side.
- **Default fallback URL and password are committed** in `src/config.js:1-3`. The Railway prod URL and the literal `anymal2026` password are visible in-repo. If Vercel env vars are ever missing, production quietly falls back to these.
- **No TypeScript, no tests, no CI in-tree.** Lint runs on-demand only (`npm run lint`). Regressions will only be caught by human testing or at build time.
- **Silent fetch failures on Campaigns screen.** `fetchData()` in `CampaignDashboard.jsx:651-671` logs errors to the console but leaves the lists populated from the previous render, so a 60-second period of backend flakiness is invisible to the operator unless they open devtools.
- **`URL_PATTERN` is anymalos.com-specific.** `/https?:\/\/world\.anymalos\.com\/[^\s)]*/` (duplicated in `CampaignDashboard.jsx:29` and `ApproveConfirmModal.jsx:34`). Messages whose CTA points elsewhere won't have destination/UTM fields parsed or editable.
- **`facebook_reply` is not filterable.** The channel tabs (`CHANNELS` in `CampaignDashboard.jsx:7-14`) don't include `facebook_reply`, even though the UI renders reply drafts correctly when they arrive via the "All Channels" or `facebook_page` feed.
- **`App.css` is an empty template leftover.** Safe to delete; kept for reference here.
- **Unused template assets.** `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png` are not referenced by any `.jsx` during audit.

## §10 — Audit metadata

Last audited: 2026-04-20 by agent-context audit (anymal-os-marketing-dashboard).
