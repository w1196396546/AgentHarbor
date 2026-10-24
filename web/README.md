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

Each synchronous conversation draw shares one derived index of messages, changes
and turn labels, then discards it in `finally`. Existing-ID content replacements
use a linear merge path; history insertion keeps the original ordering rules.
Markdown leaves reuse unchanged text within their language, device, Agent,
conversation and selection generation. Dynamic requests and owners keep updating
independently, and resource actions still check their current context. These
changes reduce browser computation without adding a stream delay or global cache.

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

Creation preflight requests project options with `scope=creation`, without replacing
the full catalog; older clients can ignore the scope. Newly created conversations
skip a redundant owner connection. A matching creation receipt with a connected
owner, epoch and live snapshot also skips the full detail read before the first
message; older or incomplete receipts keep the detail confirmation path. Selection
generations and newer streamed state still take precedence. Confirmed settings and sends release their UI
controls before history/list refreshes; newer drafts and streamed state win over
late responses. Attachment uploads run in ordered pairs, and new image chips use
temporary local previews instead of downloading the image again. The encrypted
wire format, authorization and uncertain-delivery retry rules remain unchanged.

Confirmed creation receipts appear immediately under the selected App project,
even while native indexing is delayed. These bounded, device/Agent-scoped rows
yield to the native catalog once indexed and are discarded on archive. Windows
project identity recognizes extended drive/UNC paths, separators and case without
matching sibling directories; filesystem authorization remains on the desktop.
Refreshing the options catalog invalidates a pending creation preflight, but never
discards an already-dispatched creation receipt or retries its write. An explicitly
offline owner displays unknown status without changing the last observed turn or
inferring that execution stopped or completed.


## Execution details

The existing conversation shows message phases and summaries for loaded turns,
command actions and terminal input, structured MCP/dynamic results, search actions,
linked requests and agent details, images and system notices. Summaries and the
changes panel share the normalized, deduplicated change inventory. Tool success and
failure counts link to their records. Answers, loaded turn answers, commands,
outputs and diffs can be copied. Raw arguments remain available in disclosures.

New linked requests expand their tool once; later stream updates preserve manual
expansion and in-memory answers. The pending entry shows the request count and the
existing dialog can switch requests without a second dispatcher. Errors display
reported causes and related operations. Automatic model retries remain separate
from browser SSE reconnects; neither implies retrying a control request.

The context dialog separates recent/cumulative token usage from context occupancy;
missing values stay unknown. Session information separates owner-reported settings
from page preferences awaiting confirmation, and computer, stream, owner and task
states. The last successful sync is a browser observation, not an execution time.
Optional `mcp_servers` metadata groups tools by server and distinguishes empty,
unloaded and failed catalogs, with reported runtime and authentication state.

Changes can be filtered by turn or browsed as a tree, with numbered diffs,
reported rename/binary/truncation states and current-file previews. A sibling
artifact view groups real files/images from loaded records and links to their
source. Conversation search defaults to loaded prose and tool output, with turn
navigation and failure/change/artifact filters. Versioned optional indexes add
full-history search, turn navigation and historical resources as described below. Bounded reading metadata preserves
anchors, disclosure state and change filters per device, Agent and session; it
stores no extra messages, answers, attachments or credentials. Refresh restores a
still-authorized conversation as read-only only when the composer has no draft,
attachments, skills, mentions, selected tools or queue edit. A missing saved anchor
prompts loading older records; deliberate navigation cancels pending restoration.
Agent summaries use
loaded collaboration records and authorized read-only details, without model calls
or broader child-session access.

Optional item `turn` metadata (`status`, `started_at_ms`, `duration_ms`) passes
through both history and SSE. Timings come from the client, never browser receipt
time. Loaded summaries cover loaded records only; unpersisted upstream notifications may
be absent after client restart. Resources use encrypted project/registered attachment
access, display unavailable/truncated states and never authorize arbitrary local
paths. Assistant Markdown file/image targets share the existing local-file parser
and encrypted authorization gate; external preview resources are never fetched.
Hook durations use reported `durationMs`; timestamps without confirmed units remain
in raw details. Older clients retain the existing fallback. See the [architecture contract](../docs/architecture.md#会话执行信息与资源展示).

## Optional read indexes v1

The encrypted options catalog advertises boolean capabilities plus an optional
`protocol_versions` object. A feature is enabled only when both
`capabilities[name] === true` and `protocol_versions[name] === 1`; responses must
also declare `version: 1`. Missing or unsupported versions keep the existing
loaded-record behavior. These reads never connect an owner or dispatch a turn,
approval, queue update or file write. The relay forwards ciphertext only.

| Capability | Encrypted client endpoint | Presentation |
| --- | --- | --- |
| `conversation_index` | `GET /api/threads/{id}/turns?cursor=` | Paged turn navigation, including unloaded history |
| `full_history_search` | `POST /api/threads/{id}/search` | Explicit loaded/full search mode; body contains `query`, `filter`, `turn_id`, `cursor`, `limit` |
| `artifact_index` | `GET /api/threads/{id}/artifacts?cursor=` and `/artifacts/{artifactID}` | Historical resources, availability, preview/download and source-record links |
| `interaction_history` | `GET /api/threads/{id}/interactions?cursor=` | Observed past decisions/questions and reasons in tool cards and search |
| `agent_run_graph` | `GET /api/threads/{id}/agent-graph?cursor=` | Confirmed descendant tree, task, activity, operations and result summaries |

Index pages include `next_cursor`, `has_more`, `scope`, and optional `truncated` /
`read_error`. `full` means the client reads real accessible history, while more
pages or cut/error flags still mean incomplete results. `loaded` limits the claim
to read records or observed memory. Read failure remains unknown and preserves
previous results. `indexes.js` isolates requests by device, Agent, conversation,
project, generation and owner epoch, limits collections to 2000 entries, and stops
repeated cursors. The local client separately checks current authorization,
archive state and source generation. Search reads bounded history pages and never
accepts control operations; navigating results preserves drafts and attachments.

Turn `complete` / `partial` describes index metadata, not whether every message is
loaded. Timings and optional counts only come from real source fields. Artifact
IDs are opaque and bound to the session/project/source generation; the browser
does not supply new local paths. Resource reads reuse project or registered
attachment authorization. The preview JSON exposes only a safe filename;
`?raw=1` / `?download=1` use the same authorization for bytes. Availability is
`available`, `unavailable` or `unknown`, with explicit missing, scope, size or cut
reasons. The client limits files to 20 MiB and previews to 256 KiB.

Interaction history includes request/method/item/turn IDs, an evidenced status,
summary/reason and an optional real `resolved_at_ms`; it excludes secret answers.
A missing request or generic upstream completion cannot prove approval. Pending
requests retain the existing `/answer` / `/steer`, owner checks and in-memory
answer drafts. Agent graph pages may repeat stable agent IDs; `agent-graph.js`
merges operation IDs and known summaries, bounds cycles/depth and caps retained
operations at 5000 with a visible incomplete state. Only current-parent operation
links navigate to records. Graph metadata adds no child authorization; details
still require the original `subagents` capability and read-only endpoint.

See the [complete contract](../docs/architecture.md#可选只读历史索引-v1) for field
shapes, source limits and trust boundaries. Focused pure observation regressions
are in `tests/read-observation.test.cjs`; real App and public deployment checks
remain separate from local type checking and regenerated embedded assets.
