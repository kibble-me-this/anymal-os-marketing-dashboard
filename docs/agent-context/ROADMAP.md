# ROADMAP — anymal-os-marketing-dashboard

Ordered backlog of what's next for this repo. The audit found no formal roadmap file in-tree (no `TODO.md`, no GitHub Issues referenced, no in-code TODO/FIXME markers). The numbered list below is derived from observed gaps and the direction of shipped work; treat it as a starting point, not a committed plan.

## §1 — Current priority order

No active roadmap was explicitly defined for this repo at audit time. See cross-repo roadmap in anymal-os-roadmap (when populated). In the meantime, the items below are the audit's best read of what should be worked on next, ordered by a mix of user-facing impact and risk.

1. **Add a `facebook_reply` tab to the channel filter.**
   The UI already renders reply drafts with full target context (`src/components/ReplyTargetContext.jsx`) but the operator cannot scope the pending list to reply drafts only — `CHANNELS` in `src/pages/CampaignDashboard.jsx:7-14` omits it. With reply drafts now a first-class draft type (PR #1, `de34533`), this is the obvious gap.
   *Scope:* ~5 LOC change. 15-30 min. Touches `src/pages/CampaignDashboard.jsx` only.
   *Blockers:* confirm backend `/campaigns/pending/by-channel?channel=facebook_reply` is supported.

2. **Surface backend fetch errors in the UI.**
   `fetchData()` in `src/pages/CampaignDashboard.jsx:651-671` swallows errors into `console.error`. Same pattern in `ResearchBrief.jsx`. An operator watching the dashboard during a Railway incident would see the page appear normal. Add a small "last refresh failed" indicator near the refresh timer.
   *Scope:* ~30 LOC. 1 session. Touches `CampaignDashboard.jsx`, `ResearchBrief.jsx`.
   *Blockers:* none.

3. **Rotate or IP-scope `VITE_MARKETING_API_KEY` — and remove in-repo fallbacks.**
   The key ships in the bundle (it's a `VITE_` env), and `src/config.js:1-3` also commits the default Railway URL and the literal dashboard password `anymal2026`. Any leak there is permanent. Either move access control to a session-exchange flow served by the backend, or at minimum delete the fallback strings and fail loudly at build time when envs are missing.
   *Scope:* 1-2 sessions (backend coordination required). Touches `src/config.js`, plus backend auth.
   *Blockers:* requires backend decision on auth approach.

4. **Replace client-side password gate with something meaningful, or remove the illusion.**
   The gate in `src/App.jsx:23-62` stores `mkt_auth=true` in sessionStorage after a plain string compare against a bundled value. It is not access control. Options: (a) delete it and rely on Vercel password protection at the project level; (b) gate via a short-lived backend session cookie; (c) Cloudflare Access in front of Vercel. Any of the three is more honest than the current setup.
   *Scope:* ~1 session depending on choice. Touches `src/App.jsx` plus deploy config.
   *Blockers:* product decision on who should be able to reach the SPA.

5. **Replace the stock Vite `README.md` with a project-specific one.**
   Current README is scaffold boilerplate. A 30-line README pointing at the backend repo, deployment URL, env var list, and local dev setup would save future onboarders (human or agent) several minutes of orientation. This audit's `SPEC.md` already covers most of the content — a brief README that links to `docs/agent-context/SPEC.md` would be enough.
   *Scope:* ~30 LOC. 30 min.
   *Blockers:* none.

6. **De-duplicate `URL_PATTERN` and the url-rewriting helpers.**
   `/https?:\/\/world\.anymalos\.com\/[^\s)]*/` is defined in both `src/pages/CampaignDashboard.jsx:29` and `src/components/ApproveConfirmModal.jsx:34`. The companion helpers (`findAnymalUrl`, `extractDestinationFromMessage`, `extractUtmCampaignFromMessage`, `rebuildMessageURL`) live only in `CampaignDashboard.jsx`. Extract into `src/lib/campaignUrl.js` so the modal can reuse them and the pattern lives in one place. This also makes it cheap to support non-anymalos destinations if that ever comes up.
   *Scope:* ~40 LOC move + import updates. 30 min.
   *Blockers:* none.

## §2 — Observed improvement opportunities (agent-discovered, unsorted)

- **Large single-file page: `src/pages/CampaignDashboard.jsx` is 846 LOC** and contains `InlineEditor`, `CampaignCard`, `PublishedCard`, `CampaignDashboard`, plus url/date helpers. Splitting into `components/CampaignCard.jsx`, `components/PublishedCard.jsx`, `components/InlineEditor.jsx`, `lib/campaignUrl.js` would make the file navigable and enable component-level reuse.
- **Massive inline-style usage** across every component (no CSS modules, no styled-components, no Tailwind). Fine for a 1,684-LOC SPA, but if a second operator style or light mode is ever needed, this approach will hurt. Not a priority now; just noted.
- **Channel-color and channel-label maps are duplicated** across `CampaignDashboard.jsx:16-23`, `ApproveConfirmModal.jsx:7-32`. They are slightly different in each place (e.g. `anymal_x` is `#000000` in the dashboard, `#ffffff` in the modal). Consolidate into a single `src/lib/channels.js`.
- **`fetchData()` runs two sequential `fetch` calls** when they could run in parallel (`Promise.all`). Minor latency win on page load, measurable if the backend is slow.
- **No `key` prop collision safety**: the pending list uses `c.campaign_id` as key — fine, assuming IDs are unique, but worth a comment if the backend ever returns duplicates for any reason.
- **`App.css` (empty)**, `src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png` all appear to be unreferenced template leftovers. Safe to delete.
- **No `eslint --max-warnings 0` gate, no pre-commit hook, no GitHub Actions workflow.** A 10-line workflow that runs `npm run lint && npm run build` on PR would catch regressions before they hit production via Vercel.
- **No error boundary at the React tree root.** A thrown error inside any route component currently renders a white screen. A top-level `<ErrorBoundary>` with a helpful "reload" message is cheap insurance.
- **Refresh countdown is wall-clock second-driven** (`setInterval(..., 1000)` in `CampaignDashboard.jsx:675-681`). Works, but drifts and fires when the tab is background-throttled. `document.visibilityState` gating would avoid unnecessary fetches when the tab is hidden.

## §3 — Long-term concerns / technical debt

- **Auth model mismatch with sibling repos.** Per cross-repo context, the backend uses `X-API-Key` on some routes and Bearer tokens on others. This SPA only knows the `X-API-Key` pathway. When the marketing backend consolidates its auth, this app will need a coordinated change — ideally a small session-exchange endpoint the SPA can hit once at boot, then use a short-lived bearer.
- **No TypeScript.** The app is small today but is growing by one substantive feature per day (per §4 of `PROGRESS.md`). Every new field on a campaign doc (e.g. `target_commenter_name`, `target_post_text`, `utm_params`, `posted_url`, `post_id`, `chart_base64`) is currently a silent contract with the backend. Migrating to TypeScript, or at least declaring a shared `Campaign` type via JSDoc, would prevent "backend renamed a field and the UI quietly stopped rendering it" incidents.
- **No tests at all.** For an operator tool that publishes to live social channels, the lack of even a smoke test around the approve/reject/PATCH flows is a risk. Minimum viable coverage: a few Vitest + React Testing Library tests that mount `CampaignCard` in pending state and verify the Approve button triggers the confirm modal.
- **Vercel is the only deploy path and the only hosting.** No fallback, no staging project documented. Worth making sure the Vercel project has `main` protected and the preview environment env vars separated from production, since the API key ships in the bundle per §3 item 3.
- **Bundle-embedded config.** As long as `VITE_*` env is the pattern, every secret and URL ends up in the shipped JS. Long-term, consider a tiny server-side config endpoint (even a Vercel serverless function) that returns runtime config, so rotation doesn't require a rebuild.

## §4 — Audit metadata

Last updated: 2026-04-20 by agent-context audit (anymal-os-marketing-dashboard).
