# UI detail pass — 2026-10-27

Scope: local changes on top of `51ad87e`; remote workspace, pairing, account,
administration and shared controls. No deployment or client protocol changes.

## Design direction

A remote workstation should make the conversation and current task easiest to
read. Preserve the blue robot identity and opaque light/dark surfaces; reduce
visual competition from tool chrome, repeated branding and navigation dividers.
This is a design choice, not a claim that every bordered interface is wrong.

| Observation | Decision and implementation |
| --- | --- |
| The 14px root reduced the shared rem-based type/control scale; prose and command output were small. | Restore a 16px rem baseline with a 14px application body, 15px desktop prose and 12px command/code text. Keep the system sans/CJK and monospace stacks without downloading fonts. |
| Wide prose, a large Agent mark and indented answers competed with small tool cards. | Use an 820px reading/composer maximum including gutters, smaller identity marks, a full-width answer alignment and clearer heading/paragraph rhythm. |
| Collapsed reasoning/tools and answers had similar container weight. | Use quiet separators for tool disclosures and a surface only for their expanded content. Remove redundant sidebar rules and the repeated pairing brand line. |
| The management page prioritized a promotional headline and three separate statistic cards. | Use a task-specific overview and a continuous metric band; keep refresh secondary to the device information. |
| Account sign-in repeated the title inside a nested panel. | One task title, grouped labels/fields, a full-width submit action and explicit explanation that account login does not replace device pairing. |

## Usability fixes

- Increase narrow/coarse-pointer shared menus and panel actions
  controls to 44px targets. Removable attachment tags grow only when actionable.
  The composer retains its original compact single row at the user's request,
  including stop/context states; its targets remain at least 24px.
- Restore the original 62px mobile heading and compact navigation buttons after
  user feedback on the taller two-row header. Preserve the single-row composer
  and bounded draft height, including when stop/context controls are present.
  The two-row variants were tried during visual review and reverted following
  explicit user feedback.
- Exempt mobile turn-summary metadata buttons from the shared 44px minimum;
  keep them at 24px with 11px type and tighter gaps. Large tool counts no longer
  create oversized button rows; navigation and copy actions are unchanged.
- Compact the phone sidebar after feedback about the small conversation area:
  one-line branding, search/new-session controls in one row, a compact device
  picker and one row for account/theme/language/disconnect. Keep connection
  messages and independently scrollable navigation. A later desktop follow-up
  reuses the same compact structure with 36px search/new controls, keyboard
  shortcuts and a resizable sidebar; account link labels remain available on
  focus/hover via their translated accessible name and title.
- Remove the separate "All projects" filter and its list-filter state after
  user feedback. All shared project groups remain visible, search still applies,
  and new-conversation folder selection remains in the breadcrumb. Combine the
  redundant workspace/list headers into one count-and-refresh row.
- Deepen light semantic text colors; pair light/dark button backgrounds with
  readable foregrounds. The brand accent itself is unchanged. Computed semantic
  text/background pairs are tested at a minimum 4.5:1; this is not a full WCAG
  conformance certification of all content or component states.
- Distinguish initial state loading, failed reads and confirmed unauthenticated
  responses in account/admin views; allow retry without asking users to sign in
  merely because the state request failed.
- Associate administrator input errors/help with the field, retain the entered
  token after failed login and preserve existing secret clearing on success.
- Keep post-login state-read failures visible. A successful login POST followed
  by a rejected/expired session must not silently return an empty sign-in form.
- Remove the admin navigation's misleading permanent devices selection; keep
  native section links. Emit paragraph markup for shared empty descriptions.

## Evidence and checks

Runtime: Node.js 24.22.1, Go 1.26.8, Playwright 1.62.1, Chromium 151.0.7922.34,
WebKit 26.5. Tests use isolated synthetic clients and temporary relay state.

Screenshots were inspected after rendering, with finite CSS transitions disabled
for capture. Local evidence lives in ignored `output/playwright/`:

- `ui-detail-before/`: baseline pairing and workspace captures.
- `ui-detail-first/`: first visual pass, including account/admin dark and light
  themes; used to identify compact-layout and narrow-device-row follow-ups.
- `ui-detail-final/`: prior-round 320/390/760px toolbar states, 320/390/768/1280px
  account views, 390/768/1280px admin views, and light/dark workspace, pairing,
  inspector, request and queue states. These files are local run evidence, not
  versioned public artifacts.
- `ui-detail-compact/`: latest mobile heading and single-row toolbar, compact
  turn summaries with 108 tools/99 successes/9 failures, light/dark themes and
  320/390/760px viewports, after the user's final compact-layout feedback.

Coverage includes keyboard menu open/close/focus return, Enter submission,
failed state reads and retry, 2FA, rename/revoke/cancel, pairing and revocation,
draft preservation, streaming/queue/stop flows, long names/history, short phone
viewports, five supported languages and reduced motion.

The full suite exposed an existing structured-timeline fixture problem: it
clicked a copy action inside a collapsed native disclosure. The same failure
was reproduced against the unmodified `HEAD` bundles. The test now expands the
tool through its summary before copying; production expansion behavior was not
changed. Both engines passed the corrected case.

Validation results:

- TypeScript check, frontend bundle build and `git diff --check`: passed.
- `go test ./...`: all three packages passed.
- Full Node/browser UI suite, both engines: 493 tests, 491 passed, two failures
  from the pre-existing disclosure fixture above; no skipped tests. Log:
  `output/playwright/ui-detail-full-tests.log`.
- Corrected structured-timeline case: two of two passed. The unchanged cases
  from the full run were not rerun solely because a test now opens a disclosure.
- Final account/admin/mobile checks after correcting post-login error handling:
  18 of 18 passed (`ui-detail-final-targeted.log`).
- Final single-row composer, short phone viewport, theme/keyboard, structured
  timeline and five-language checks after the user's toolbar feedback: 20 of
  20 passed (`ui-detail-final-mobile.log`). Both browser engines were included.
- Latest compact heading/turn-summary checks, plus phone toolbar, short viewport,
  keyboard/theme, timeline and five-language regressions: 22 of 22 passed on
  Chromium and WebKit (`ui-detail-compact-tests.log`). Typecheck, frontend build
  and whitespace checks passed again; no backend tests were repeated for this
  CSS-only follow-up.
- Sidebar follow-up: at the user's request, only one focused WebKit check ran
  at 320x400, 390x720 and 430x780. It passed, including control bounds, search
  and the new-session accessible name. Navigation heights were 140/460/520px;
  the footer was approximately 88px. Build and whitespace checks passed; no
  full suite was repeated. Screenshots: `output/playwright/ui-sidebar-compact/`.
- Project-filter removal: typecheck/build/whitespace checks passed, plus three
  focused WebKit cases (sidebar, unfiltered cross-project list, phone conversation
  flow) and two creation unit cases. No full suite or production deployment.
  Latest sidebar screenshots: `output/playwright/ui-no-project-filter/`.
- Desktop sidebar follow-up: only two focused Chromium cases ran (desktop
  compact layout and phone layout regression), both passed. Desktop checks
  covered 270/220/480px sidebar widths, 1440x850 and 900x600 viewports, both
  themes, footer hit testing, search and collapse/keyboard restore. Navigation
  measured 569px at 850px window height and 319px at 600px; footer about 93px.
  Build, typecheck and whitespace checks passed. No full suite or WebKit rerun;
  screenshots: `output/playwright/ui-desktop-sidebar/`.

## Limits

No production deployment, real desktop pairing, public relay stream, physical
phone keyboard, Windows rendering, screen-reader session or complete WCAG audit
was performed. The simulated viewport and fake-client results do not establish
those outcomes. Go race/vet were not rerun because no Go source changed.
