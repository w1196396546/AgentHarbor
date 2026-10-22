# React frontend

`npm ci && npm run build` builds three entries: remote (pairing/workspace), admin, and account.
`web/scripts/build.mjs` writes their JS/CSS bundles, copies `index.html`,
`admin.html`, and `account.html`, and generates `THIRD-PARTY-NOTICES.txt`
in `internal/relay/assets/`.
These generated assets stay in the repository for Go embedding; edit `web/src/`,
then rebuild. `make build` performs both frontend and Go builds. Node.js 22.12+
is a build dependency only. No CDN, runtime Node server or external font is used.

- `RemoteApp.jsx`: pairing, workspace, composer controls and native dialogs.
- `controller.jsx`: existing authenticated requests, streaming, owner/generation
  guards and React views for messages, tools, files, queues and approval forms.
- `render.jsx`: React roots for stable live regions; synchronous commits preserve
  measurement/focus behavior, React clears release component resources.
- `views/`: pairing, workspace shell and dialogs; `features/`: controller features
  for sessions, devices, owners, streaming, queues, approvals and files.
- `transport/api.js`: authenticated API calls, cancellation and owner guards;
  `transport/secure.js`: encrypted requests, response records and stream resume.
- `agents/registry.js` and `agents/codex.js`: capability-based adapter selection
  and Codex-specific presentation; `agents/codex-questions.js`: question parsing.
- `sidebar.js`: resize/navigation.
- `account.jsx`: FullCupAI account login and account-owned device management;
  account authentication does not replace per-device encrypted pairing.
- `admin.jsx`: independent administrator authentication, polling and revocation.
- `theme.jsx`: local appearance preference; defaults to Solid Glass dark.
- `styles/`: upstream material plus workspace/admin layout and responsive styles.

The static workspace shell mounts once. Its controller manages stable controls'
values, visibility, focus and native dialogs; live contents belong to React roots.
Clear a live region with `clearView`, never `replaceChildren`, so React can unmount
it. Do not rerender the static shell over controller-owned controls. This keeps
existing cancellation, drafts, protocol boundaries and granular streaming intact.

## Solid Glass source

Source: https://github.com/deeplethe/solid-glass
Snapshot: `6e8903e494a15491ceda38fafea5056c95a74d44` (2026-10-20).
Vendored `solid-glass.css` and the components under `components/ui/` retain
upstream MIT licensing: button, panel, message, bubble, attachment, composer,
ask-card, tool-steps, diff-view, input, textarea, label, field, kbd, alert, card,
table, empty, breadcrumb, dropdown-menu, separator, tag, reasoning,
status-glyph and turn-status. Lucide supplies all application icons.

Local adaptations keep the existing live workspace contracts: shared `cn`
imports, semantic article messages, rich native tool disclosures, a stable
composer surface, complex approval contents, forwarded Reasoning attributes
and translated TurnStatus labels. `components/workspace-surfaces.jsx` supplies the shell,
search field, menu and native modal surfaces. Native dialog/disclosure lifecycles
preserve keyboard focus, cancellation and streamed expansion state.

The official Agent Workspace reference informs the complete layout: edge sidebar,
centered reading column, compact tool steps, floating file inspector, inline
decision cards, single-line expanding composer and settings underneath. Pairing,
file previews, queues, menus, approval forms and administration share its tokens.
`styles/workspace.css` stays in a lower-priority legacy layer for existing behavior;
`styles/remote-glass.css` owns the new presentation and responsive layout.
See `SOLID-GLASS-LICENSE`, `SOLID-GLASS-NOTICE.md` and the root `design-qa.md`.

## Build and checks

Run commands from the repository root with Node.js 22.12+ and Go 1.26.8+:

```sh
npm ci
npm run typecheck
npm run build
# First-time browser setup:
npx playwright install chromium webkit
npm run test:ui
```

`npm run test:ui` rebuilds assets through its pretest hook. Set `BROWSER=chromium`
to limit browser coverage; Node-only tests still run. For Go changes, use
`make test-race` and `make vet`. Choose checks for the affected behavior; a
historical QA report is not a result for the current checkout.

Commit regenerated embedded assets with frontend changes. `make build` rebuilds
both frontend and Go; a running relay only receives new embedded pages after the
new binary is deployed and restarted. Never hand-edit generated bundles.

Browser tests use isolated fake clients and encrypted fixtures, including CSP,
revocation, delayed replies, queue edits, streaming, dark/light themes and mobile
languages. `ARTIFACT_DIR=output/react-ui npm run test:ui` captures screenshots.
Real desktop clients, iPhone keyboards and production deployment require separate
acceptance. No live server configuration is changed by the frontend build.

## UI and protocol changes

Reuse `components/ui/`, `components/RemoteIcon.jsx`, and existing surfaces before
adding components or dependencies. Update `i18n.js` for user-facing copy and
preserve supported languages, keyboard focus, drafts, cancellation and accessible
button labels. Check narrow screens, dark/light themes and both browser engines
for layout changes; simulated mobile viewports do not verify a real phone keyboard.

Keep Agent/owner headers inside the encrypted request and preserve device and
request-generation guards. Use fake clients for protocol fixtures, never production
pairing credentials or desktop sessions. See [architecture](../docs/architecture.md)
for trust boundaries and [development conventions](../AGENTS.md) for scope and checks.

[Design QA](../design-qa.md) and [question compatibility QA](../docs/shared-questions-qa.md)
are historical evidence with their own limitations, not current release sign-off.

Built HTML uses content-versioned JS/CSS URLs so deployments bypass stale browser or proxy caches.
