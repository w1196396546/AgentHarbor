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
- `theme.jsx`: persistent light/dark preference; defaults to dark and discards obsolete style presets.
- `styles/`: shared flat tokens and primitives, workspace/admin layout and responsive styles.

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

## Workspace design

The desktop and mobile light/dark references are at
https://remote.facingagi.com/design-previews/20261026-ui/ . The workspace uses a
blue accent, opaque surfaces, a resizable navigation sidebar and a right-hand
inspector. Mobile keeps the navigation drawer, safe-area composer and readable
controls. Pinned, project, latest and current groups use the real session catalog;
status, file changes and execution details only show data reported by the client.
The selected Agent identity follows encrypted discovery, including Codex, Claude
and other supported adapters. Product branding and the SVG favicon use the blue
robot mark from the reference; they do not change Agent capabilities.

The four sidebar sections remain available for legacy and native catalogs, with
independent folds and explicit empty states. Projects include shared folders that
have no native project metadata. Latest orders loaded conversations by update time;
Current shows the selected conversation and other reported running or waiting
conversations. Search and project filters continue to apply to these sections.

The inspector provides Details, Files, Diff, Logs and Artifacts tabs. Details
reuses owner-reported session settings and loaded tool/change records; Logs links
back to the corresponding loaded conversation records. Missing values stay unknown,
and neither view requests a new execution. Keyboard tab navigation keeps the
selected tab visible on narrow screens. Phone controls use one compact toolbar
with icon-only permission/mode controls and a combined model/reasoning picker,
plus viewport-bounded draft height; Latest output stays centered above the composer.

`styles/tokens.css` defines the light/dark palette and Tailwind mappings;
`styles/ui.css` supplies shared surface states; `styles/workspace.css` owns the
remote layout. There are no style presets, glass materials, blur filters or
glass packages. Existing `codex.remote.theme` preferences are preserved; the old
`codex.remote.style` preference is removed. There is no new runtime dependency.
`web/icon.svg` is copied and versioned by the build alongside the HTML entries.

Accessible Base UI primitives and adapted component APIs remain in
`components/ui/`. Their historical MIT attribution is retained in
`SOLID-GLASS-LICENSE` and `SOLID-GLASS-NOTICE.md` for derived code; the previous
Solid Glass CSS and theme engine are no longer included. Lucide supplies the
other application icons. Native dialogs and disclosures preserve focus,
cancellation and streamed expansion state.

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
for trust boundaries. Repository-local development instructions are kept outside
the public repository.

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
API timeouts and cancellation remain active until the complete encrypted response
body is read, so changing Agents or cancelling a connection releases pending reads.
Clients advertising `connection_metadata` provide lightweight `scope=connection`
session and owner metadata. Explicit history selection connects that confirmed
owner while the complete history loads independently; older clients retain the
full-detail confirmation path. Metadata never replaces history cursors, and newer
connection receipts or streamed owners take precedence over late detail reads.
Native `project_id` and sidebar project roots preserve the selected original
project for worktrees outside its directory, including immediately created rows.
Clients advertising `controls_options` provide `scope=controls` for model, effort,
mode and permission controls, including the existing permission requirements.
The session list can advertise the read capabilities (`controls_options`,
`connection_metadata` and `inventory_options`) before initial history selection, avoiding a full inventory
bootstrap; it never grants owner mutations.
Skills and MCP inventory loads on demand when the composer uses `/` or the full
session-info dialog opens. `inventory_options` enables `scope=inventory`, which
reads only those inventories; older clients use full options on demand. Concurrent
reads for the same selection share one request. Only inventory fields merge back,
so a late result cannot replace confirmed control settings. Missing inventory
fields remain not loaded, and a failed read does not disable confirmed controls.
Late catalogs retain the existing selection and
options-sequence guards. Queued native-owner messages inherit its current settings
without replaying stale page preferences.

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
source. The conversation has no search/filter toolbar, turn-index loader or
standalone interaction-history status panel. Historical resources use the optional
indexes described below. Bounded reading metadata preserves
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
| `conversation_index` | `GET /api/threads/{id}/turns?cursor=` | Protocol support; no conversation toolbar entry |
| `full_history_search` | `POST /api/threads/{id}/search` | Protocol support; no conversation search entry |
| `artifact_index` | `GET /api/threads/{id}/artifacts?cursor=` and `/artifacts/{artifactID}` | Historical resources, availability, preview/download and source-record links |
| `interaction_history` | `GET /api/threads/{id}/interactions?cursor=` | Observed past decisions/questions and reasons in tool cards |
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


## Native owner queue and pending plans

Owners may publish explicit `queue_add`, `queue_cancel`, `queue_reorder`, `queue_edit`,
`queue_resume` capabilities; an omitted granular key falls back to legacy `queue`.
Explicit false never falls back. Catalog `queue_read` or any enabled queue action
allows the existing read panel without implying editable or resumable messages.
Queue reorder sends `{over: adjacentUUID}` to `queue/{messageID}/reorder`; no message
is recreated. An unknown queue snapshot preserves observed rows and displays its
paused/error state. Composer uploads and sends use `queue_add` when a turn, request
or queue is pending. Strict steering retains its separate owner capability.

An owner can report `live.pending_plan_approval: true` and `live.pending_plan` to
identify a current native approval, even while the turn is running. The browser
allows its existing plan actions only while the pending ID matches the current
live ID and owner capability. Execute retains `execute-plan`; revision sends
`{plan_id, feedback}` to `revise-plan`, so it answers the original pending request
instead of dispatching a second turn. Ordinary completed-plan behavior is unchanged.
Desktop uses its original permission/input checks; the webpage grants no additional
execution rights.


Native blank creation may advertise `creation_request_id:true` and
`creation_default_permissions_only:true`. Before an authorized create POST the
page saves a UUID plus the exact non-secret creation options in tab-local
`sessionStorage`, keyed by device, Agent, and project. An uncertain manual retry
reuses that UUID; an allocated original ID is recovered instead of creating
another conversation. Late responses cannot select another scope. At most 100
unresolved creation records are retained, without evicting older unknown work;
storage failure blocks a new create. This does not automatically retry writes.
The tab must remain available: closing its browser session or clearing website
storage discards browser receipts, so verify the native conversation before
creating again. Default-only creation rejects preselected Plan or elevated
permissions with the draft preserved; change those after the owner connects.


## Multiple enabled Agents and Desktop creation permissions

The sidebar Agent selector uses the encrypted `/api/agents` inventory and routes
requests with `X-Remote-Agent`. Its selection is remembered per device in the
current browser session. Draft text, attachment references, project and explicit
new-conversation settings are isolated by device and Agent. Switching advances
request generations and cancels previous reads; a late response cannot replace
the current Agent. Agent read and mutation errors (including upstream 503 replies) preserve a confirmed online computer and recheck the authoritative device route;
a failed device probe remains unknown and explicit offline remains offline. These checks never retry a mutation.

Desktop catalogs declare creation-only `creation_default_permission: "auto"` and
`creation_permissions: ["auto", "default"]`. New drafts use Auto unless the user
explicitly selects Manual/default. Creation validates the advertised choices and
includes the permission in its UUID receipt fingerprint. Existing conversation
settings are not migrated. Auto is the native automatic approval mode, separate
from bypass/full access; unsupported creation modes fail while preserving drafts.
Older catalogs retain their existing default-only creation contract.

## Independent Agent connection states

Encrypted `/api/agents` descriptors optionally include `state` (`connecting`,
`connected`, `disconnected`, `unavailable`) and a bounded textual `problem`.
The selector shows each state and the active problem. Older descriptors without
state retain their existing behavior. Initial discovery prefers a connected slot;
subsequent status refreshes preserve the explicitly selected slot, draft and ID.
An unavailable slot stays inspectable but cannot read options/history or submit
operations. The central API and owner/stream guards enforce this, including
a stale click after the visible control changed.

Device checks, focus return and manual refresh update this inventory. A failure
closes only the selected slot's stream and invalidates its pending generations;
it does not reset a healthy peer. Recovery refreshes the same selected ID before
allowing owner actions. Connection and retry remain in desktop agentTools; the
webpage never invokes Agent startup. Polling a healthy selected Agent refreshes
its list once and does not reload options/detail on a peer-only status change.
