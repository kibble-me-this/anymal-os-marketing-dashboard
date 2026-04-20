# PROGRESS — anymal-os-marketing-dashboard

Workstream state: what's live, what's dormant, what's mid-build. Living document — changes frequently.

## §1 — Shipped and running in production

- **Password-gated SPA shell + nav + Vercel deploy.** Campaigns / Today's Brief / Pipeline routes wired in `src/App.jsx`. Shipped initial commit `984113d` (Apr 17 2026) — "anymal-os-marketing-dashboard -- standalone internal ops app".
- **Campaign Dashboard — pending drafts list, channel filter tabs, approve, reject, 60-second auto-refresh.** `src/pages/CampaignDashboard.jsx`. Shipped `984113d` (Apr 17 2026).
- **Today's Research Brief view + "Re-run Research" trigger.** `src/pages/ResearchBrief.jsx`. Shipped `984113d` (Apr 17 2026).
- **Pipeline Control manual triggers for Research Agent and Content Agent.** `src/pages/PipelineControl.jsx`. Shipped `984113d` (Apr 17 2026).
- **Inline draft editor — message, destination (/price, /live, custom), UTM campaign, image upload/replace/remove.** `InlineEditor` component inside `src/pages/CampaignDashboard.jsx:115-374`. PATCHes `/campaigns/{id}` on save. Shipped commit `8534f29` (Apr 18 2026) — "edit drafts before approval".
- **Approve-confirm modal with preview, post details (destination / UTM / image size / char count), brand-guideline warnings (no image → reach warning, default UTM, em-dash block), focus trap, Esc-to-cancel.** `src/components/ApproveConfirmModal.jsx`. Shipped commit `0993743` (Apr 19 2026) — "approve confirm modal, redesigned recently published feed".
- **Recently Published feed redesigned with channel-colored pills, image thumbs, destination + UTM + stakeholder metadata, expand-to-zoom thumbs, "View on Facebook/LinkedIn/X" CTA.** `PublishedCard` in `src/pages/CampaignDashboard.jsx:490-634`. Shipped `0993743` (Apr 19 2026).
- **Facebook Reply draft rendering — "Replying to" context card (commenter, page, comment text, post text, Facebook link) surfaced on both draft cards and publish-confirm modal.** `src/components/ReplyTargetContext.jsx` + integrations in `CampaignDashboard.jsx:425-427, 550-552` and `ApproveConfirmModal.jsx:263-267`. Shipped PR #1 `de34533` / commit `96c56bc` (Apr 19 2026) — "render facebook_reply drafts with target context". This was the first and only merged PR so far.

## §2 — Scaffolded but inert

- **`src/App.css`** — empty file (1 blank line). Vite template leftover, imported nowhere.
- **`src/assets/react.svg`, `src/assets/vite.svg`, `src/assets/hero.png`** — present in the tree but not referenced by any `.jsx`. Dead bundle weight if ever imported accidentally.
- **`README.md`** — still the stock Vite+React template copy. Contains no project-specific information.
- **`facebook_reply` channel is rendered but not filterable.** The UI handles reply drafts wherever they appear, but `CHANNELS` (`src/pages/CampaignDashboard.jsx:7-14`) has no `facebook_reply` tab — an operator cannot scope the pending list to reply drafts only.

## §3 — In-progress workstreams

- No open PRs. `main` is at `de34533`, `origin/main` matches, working tree is clean as of audit.
- No long-lived feature branches other than `feat/facebook-reply-drafts-ui` (already merged via PR #1 and preserved for reference).
- No TODO / FIXME markers found in-tree that indicate mid-build code (none surfaced during grep of source files).

## §4 — Recent PR log (last 20 merged to main)

Only one merge has landed on `main`. The rest of the history is direct commits from initial scaffolding.

```
de34533 Merge pull request #1 from kibble-me-this/feat/facebook-reply-drafts-ui
```

Underlying commit timeline (`git log --oneline`):

```
de34533 Merge pull request #1 from kibble-me-this/feat/facebook-reply-drafts-ui   (Apr 19 2026)
96c56bc feat(dashboard): render facebook_reply drafts with target context          (Apr 19 2026)
0993743 feat(dashboard): approve confirm modal, redesigned recently published feed (Apr 19 2026)
8534f29 feat: edit drafts before approval (message, image, destination, UTMs)      (Apr 18 2026)
984113d feat: anymal-os-marketing-dashboard -- standalone internal ops app         (Apr 17 2026)
```

Five commits total, four days of history (Apr 17 → Apr 19 2026). Shipping cadence so far: approximately one substantive feature per day.

## §5 — Open bugs / follow-ups

- **`VITE_MARKETING_API_KEY` ships in the client bundle.** Any visitor can extract it. Documented in SPEC §9; no mitigation yet. Backend must not rely on key secrecy for authorization — needs IP allowlist, referrer check, or session-exchange flow.
- **Default prod URL + password are hard-coded in `src/config.js:1-3`.** If Vercel env vars ever drop, production silently falls back to the committed `anymal2026` password and the Railway URL. No alerting for misconfig.
- **Silent fetch failures in `CampaignDashboard.fetchData()` (`src/pages/CampaignDashboard.jsx:651-671`).** Errors `console.error` only; UI keeps showing stale data. Operator cannot tell the backend is down for up to 60s without opening devtools.
- **`URL_PATTERN` is hardcoded to `world.anymalos.com`** (duplicated in `src/pages/CampaignDashboard.jsx:29` and `src/components/ApproveConfirmModal.jsx:34`). Any campaign whose CTA points elsewhere will silently skip destination/UTM extraction and editing.
- **`facebook_reply` channel missing from filter tabs.** `CHANNELS` (`src/pages/CampaignDashboard.jsx:7-14`) doesn't expose it; reply drafts are only discoverable via "All Channels" or by happening to show up in the Facebook tab.
- **No test coverage, no CI.** No Vitest/Playwright/Jest config. ESLint runs only when someone types `npm run lint`. Regressions are caught by eye, in production.
- **Stock Vite README.md** untouched since scaffold. Future onboarders will not learn anything about this app from the README.

## §6 — Audit metadata

Last updated: 2026-04-20 by agent-context audit (anymal-os-marketing-dashboard).
