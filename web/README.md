# React frontend

`npm ci && npm run build` compiles the pairing/workspace and admin entries into
`internal/relay/assets/{index.html,remote.js,remote.css,admin.html,admin.js,admin.css}`.
These generated assets stay in the repository for Go embedding; edit `web/src/`,
then rebuild. `make build` performs both frontend and Go builds. Node.js 22.12+
is a build dependency only. No CDN, runtime Node server or external font is used.

- `RemoteApp.jsx`: pairing, workspace, composer controls and native dialogs.
- `controller.jsx`: existing authenticated requests, streaming, owner/generation
  guards and React views for messages, tools, files, queues and approval forms.
- `render.jsx`: React roots for stable live regions; synchronous commits preserve
  measurement/focus behavior, React clears release component resources.
- `secure.js`: unchanged encrypted transport; `sidebar.js`: resize/navigation.
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
and translated TurnStatus labels. `workspace-surfaces.jsx` supplies the shell,
search field, menu and native modal surfaces. Native dialog/disclosure lifecycles
preserve keyboard focus, cancellation and streamed expansion state.

The official Agent Workspace reference informs the complete layout: edge sidebar,
centered reading column, compact tool steps, floating file inspector, inline
decision cards, single-line expanding composer and settings underneath. Pairing,
file previews, queues, menus, approval forms and administration share its tokens.
`styles/workspace.css` stays in a lower-priority legacy layer for existing behavior;
`styles/remote-glass.css` owns the new presentation and responsive layout.
See `SOLID-GLASS-LICENSE`, `SOLID-GLASS-NOTICE.md` and the root `design-qa.md`.

## Checks

`npm run typecheck`, `npm run test:ui`, `make test-race`, `make vet`.
Browser tests use isolated fake clients and encrypted fixtures, including CSP,
revocation, delayed replies, queue edits, streaming, dark/light themes and mobile
languages. `ARTIFACT_DIR=output/react-ui npm run test:ui` captures screenshots.
Real desktop clients, iPhone keyboards and production deployment require separate
acceptance. No live server configuration is changed by the frontend build.
