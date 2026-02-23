---
title: feat: Add composer slash-command autocomplete and starter workflow buttons
type: feat
status: completed
date: 2026-02-21
---

# feat: Add composer slash-command autocomplete and starter workflow buttons

## Overview

Add a discoverable workflow UX to the active session composer:

1. Typing `/` opens an autocomplete menu of skill/workflow commands.
2. Starter workflow buttons appear above the composer for one-click prompt templates.

This improves discoverability and reduces prompt-writing friction while preserving the existing
message pipeline (free-form text prompt over WebSocket).

## Problem Statement / Motivation

Today, users must remember skill names and manually write workflow prompts. The composer has no
command discovery, no inline workflow suggestions, and no starter shortcuts. This slows first-time
users and increases prompt variance.

## Research Summary

- No relevant brainstorm docs were found in `docs/brainstorms/`.
- Local repo research found strong existing patterns for dropdowns, keyboard behavior, and prompt
  dispatch.
- No `docs/solutions/` institutional learnings were found in this repo; implementation should follow
  existing production patterns in `packages/web`.
- External research was intentionally skipped: this is low-risk UI behavior and local patterns are
  sufficient for a first implementation.

## Proposed Solution

### Scope

- Add slash-command autocomplete in `packages/web/src/app/(app)/session/[id]/page.tsx`.
- Add starter workflow buttons in the same composer region (near `ActionBar`).
- Keep prompt transport unchanged: selected commands insert plain text templates into the textarea
  and send through existing `sendPrompt` flow.
- Deliver in phased rollout to reduce risk: reliability guard first, local static catalog MVP
  second, API-backed catalog and home-composer parity later.

### Interaction Model

- Trigger menu when the user types `/` in the active token near caret.
- Filter commands as user types after `/`.
- Keyboard behavior:
  - Menu open with selectable option: `Enter` or `Tab` selects command.
  - Menu open with no selectable option (`loading`, `empty`, `error`): `Enter` does not send.
  - Menu closed: keep current behavior (`Enter` send, `Shift+Enter` newline).
- Respect IME composition guard (`isComposing`) before opening/selecting/sending; while composing,
  `Enter` should neither select autocomplete nor send prompt.
- Starter button click inserts template text (no auto-send), keeps focus in textarea.

### Slash Token Grammar (Deterministic)

- A slash command token is eligible only when `/` is the first char of a token and the preceding
  char is start-of-text, whitespace, or opening punctuation (`(`, `[`, `{`, `"`, `'`).
- Do not open slash menu for URL/path-like contexts where preceding char indicates structure (for
  example `:`, `.`, alphanumeric, or another `/`), such as `https://` and `src/foo/bar`.
- Active token is resolved at caret position and replacement boundaries are confined to that token
  only, preserving all surrounding draft text.
- Mid-text slash is supported when it matches grammar; otherwise input remains plain text.

### Keyboard Precedence Matrix

| Composer Context                                             | Enter                                    | Shift+Enter                                                     | Tab                                      | Esc                    | Click on option                       |
| ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | ---------------------- | ------------------------------------- |
| `isComposing === true`                                       | No select, no send                       | Native IME/newline behavior                                     | Native behavior                          | Close menu if open     | No-op until composition ends          |
| Menu open + selectable option                                | Select active option, `preventDefault()` | Insert newline, `preventDefault()` only if browser would submit | Select active option, `preventDefault()` | Close menu, keep draft | Select option, keep focus in textarea |
| Menu open + no selectable option (`loading`/`empty`/`error`) | Do not send, `preventDefault()`          | Insert newline                                                  | Native focus traversal                   | Close menu             | No-op                                 |
| Menu closed                                                  | Send prompt (existing behavior)          | Insert newline                                                  | Native focus traversal                   | No-op                  | N/A                                   |

### Autocomplete State Machine and Async Safety

- States: `closed` -> `loading` -> `open` or `empty` or `error`.
- `Esc` transitions any non-closed state to `closed` without mutating draft text.
- Selecting a command transitions to `closed` after token replacement.
- Keep explicit `hasSelectableOption` derived from visible options; keyboard behavior checks this
  instead of only checking `menuOpen`.
- Use request versioning to avoid stale results:
  - Increment `requestVersion` for each query or data-source refresh.
  - Apply response only when `response.version === latestRequestVersion`.
  - Ignore stale responses to prevent option flicker and incorrect active item.

### Reliability Guard (Phase 0)

- Do not clear composer text immediately on submit.
- Include a client-generated `requestId` in prompt send payload and clear draft only after matching
  server acknowledgement (`prompt_queued.requestId`) confirms queueing.
- If WebSocket is closed, not subscribed, or ack is not observed, preserve draft and show retry
  guidance; never silently drop user text.
- Define explicit send outcomes for UI state handling: `accepted`, `rejected`, `local_enqueued`.

### Data Strategy (MVP then extension)

- Phase 1 MVP: local command/workflow catalog in web package with synchronous client-side filtering.
- Phase 2 extension: optional API-backed catalog (repo-aware skills/workflows) using a new web API
  route and control-plane endpoint.
- Keep API-backed behavior behind a feature flag until MVP keyboard and reliability criteria pass.

## Technical Considerations

- **Architecture impact**: UI-layer feature first; no change to control-plane prompt command schema
  required (`content`, `model`, `reasoningEffort` already supported).
- **Performance**: client-side filtering with small catalog, debounced keystroke handling, bounded
  result list, and stale-response protection for async lookups.
- **Reliability**: draft is retained until queue ack to avoid text loss in disconnect/no-op paths.
- **Protocol contract**: finalize FE/BE contract for `requestId`, ack payload shape, timeout/retry,
  and fallback behavior before implementation.
- **Security**: command templates treated as plain text only; no privileged execution semantics.
- **Accessibility**: combobox/listbox semantics, screen-reader announcements, full keyboard
  navigation.
- **Mobile**: touch-friendly starter buttons and suggestion list behavior above virtual keyboard.
- **Testing**: MVP tests stay logic-only (`.test.ts`) unless jsdom/`.test.tsx` support is added to
  `packages/web/vitest.config.ts`.
- **Observability**: add telemetry for menu interactions and reliability behavior.

## System-Wide Impact

- **Interaction graph**: User types in `packages/web/src/app/(app)/session/[id]/page.tsx` -> local
  slash menu state updates -> selected template inserts into draft -> `sendPrompt` in
  `packages/web/src/hooks/use-session-socket.ts` -> WS `prompt` message -> control-plane
  queue/dispatch in `packages/control-plane/src/session/message-queue.ts` -> sandbox execution
  events stream back.
- **Error propagation**: UI data-source errors (future API-backed catalog) stay local and
  non-blocking; send failures continue to use current WebSocket error handling and must preserve
  draft content.
- **State lifecycle risks**: Incorrect Enter arbitration can accidentally send prompt while menu is
  open; caret replacement bugs can corrupt draft; premature draft clearing can drop unsent user
  text; all require explicit state-machine and reliability tests.
- **API surface parity**: Active session composer must be updated first; decide and document whether
  homepage composer (`packages/web/src/app/(app)/page.tsx`) also gets slash UX in this phase.
- **Integration test scenarios**:
  - Slash menu open + Enter should select command, not send.
  - Menu closed + Enter should send.
  - IME composition should suppress send/select side effects.
  - WebSocket reconnect path should preserve inserted draft if send fails.
  - Mobile keyboard open should not hide actionable suggestions/buttons.
  - Matching `requestId` ack should be required before draft clear.

## SpecFlow Findings Applied

The plan explicitly addresses these flow gaps identified by SpecFlow analysis:

- Defined Enter precedence when menu is open vs closed.
- Added explicit keyboard matrix for `Enter`, `Tab`, `Shift+Enter`, `Esc`, and click-select.
- Added error/fallback states (loading, empty, error, offline) for command source.
- Added async race handling rules so stale autocomplete responses are discarded.
- Defined insertion boundary at active slash token near caret.
- Added accessibility and mobile acceptance criteria.
- Chose insert-only starter behavior for safe MVP (no auto-send).

## Implementation Phases

### Phase 0 - Composer Reliability Guard (Low risk)

- Keep existing UI behavior but move draft clearing to post-ack (`prompt_queued`).
- Add explicit no-op/disconnect handling so failed sends do not clear text.

### Phase 1 - Slash + Starter MVP (Medium risk)

- Local static command catalog, deterministic slash grammar, keyboard matrix implementation, starter
  buttons, and logic-only tests.

### Phase 2 - API Catalog and Personalization (Medium-High risk)

- Optional `/api/skills` + control-plane route for dynamic catalog and ranking.
- Keep fallback to local catalog for resilience.

### Phase 3 - Surface Parity (Medium risk)

- Decide and implement parity for homepage composer (`packages/web/src/app/(app)/page.tsx`) after
  active session composer hardening.

## Acceptance Criteria

- [x] Typing `/` in the active session composer opens a command menu within 100 ms on typical local
      usage.
- [x] Slash trigger grammar is deterministic: URL/path-like slashes (for example `https://`,
      `src/foo/bar`) do not open command menu.
- [x] Filtering works as user types after `/`, and list is keyboard navigable.
- [x] While menu is open, `Enter` selects highlighted command and does not send prompt.
- [x] While menu is open and there is no selectable command (`loading`, `empty`, `error`), `Enter`
      does not send prompt.
- [x] While menu is closed, existing behavior remains: `Enter` sends and `Shift+Enter` inserts
      newline.
- [x] `Tab` selects highlighted command only when menu is open with selectable results; otherwise,
      native focus behavior is preserved.
- [x] IME composition users do not trigger send/select until composition completes; `Enter` during
      composition does not accept autocomplete or send.
- [x] Selected command replaces only the active slash token, preserves surrounding text, and places
      caret predictably.
- [x] Clicking an autocomplete option selects it without losing textarea focus.
- [x] Clicking autocomplete options uses `onMouseDown` with `preventDefault()` so textarea focus and
      selection state remain stable.
- [x] Clicking a starter workflow button inserts template text into composer without auto-send.
- [x] Starter workflow buttons are disabled while processing, consistent with existing composer
      disabled behavior.
- [x] Empty/error states for command source are visible and non-blocking; user can always continue
      free-form prompting.
- [x] Stale async autocomplete responses are ignored via request version checks.
- [x] Composer draft is cleared only after `prompt_queued` acknowledgement; disconnected or
      unsubscribed sends preserve draft.
- [x] Draft clear requires matching `requestId`; non-matching/stale acks do not clear current draft.
- [x] No regression to existing model selector, reasoning pills, and send/stop controls.
- [x] Keyboard-only and screen-reader navigation for menu pass implementation QA checks.
- [x] Screen-reader experience includes result-count and active-option announcements via live region
      or equivalent accessible pattern.

## Success Metrics

- Increase in sessions where first prompt uses a starter workflow or slash command.
- Reduced time-to-first-prompt after session open.
- Lower abandonment rate from empty draft to no-send.
- No increase in accidental prompt sends (menu-open Enter collisions).
- Track telemetry events: `menu_open`, `command_selected`, `enter_blocked`, `draft_cleared_on_ack`,
  and `draft_preserved_on_send_failure`.

## Dependencies & Risks

- **Dependency**: clear command/workflow catalog ownership (product/content decisions).
- **Dependency**: if API-backed catalog is included, requires new control-plane route and auth-safe
  proxy path.
- **Risk**: key handling regressions in textarea; mitigate with focused unit/integration tests.
- **Risk**: draft loss in edge network states if clear-on-submit remains; mitigate via Phase 0 ack
  gate before clear.
- **Risk**: UI complexity creep in `session/[id]/page.tsx`; mitigate with extracted composer
  subcomponents.
- **Risk**: inconsistent behavior between active session composer and home composer if parity
  decision is deferred.
- **Risk**: test harness mismatch for UI tests; current `packages/web/vitest.config.ts` only runs
  Node env `.test.ts`.

## Implementation Suggestions (File-Oriented)

- [x] `packages/web/src/app/(app)/session/[id]/page.tsx` - extract composer slash-menu state and key
      arbitration logic.
- [x] `packages/web/src/hooks/use-session-socket.ts` - emit usable queue ack signal from
      `prompt_queued` so composer can safely clear draft.
- [x] `packages/shared/src/types/index.ts` and `packages/control-plane/src/types.ts` - extend prompt
      and `prompt_queued` message shapes with optional `requestId`.
- [x] `packages/control-plane/src/session/durable-object.ts` and
      `packages/control-plane/src/session/message-queue.ts` - pass through and echo `requestId` in
      queue acknowledgements.
- [x] `packages/web/src/components/composer-slash-menu.tsx` - add reusable menu UI (listbox
      behavior, mouse + keyboard support).
- [x] `packages/web/src/components/composer-starter-workflows.tsx` - add large starter workflow
      buttons with descriptions.
- [x] `packages/web/src/lib/composer-commands.ts` - define typed local command/workflow catalog and
      insertion templates.
- [x] `packages/web/src/lib/composer-slash-grammar.ts` - define token eligibility and boundary
      parsing rules for slash trigger/replacement.
- [x] `packages/web/src/lib/composer-insert.ts` - implement token-boundary replacement and caret
      positioning utilities.
- [x] `packages/web/src/lib/composer-autocomplete.ts` - implement state machine helpers and stale
      response guards (`requestVersion` matching).
- [x] `packages/web/src/lib/composer-autocomplete.test.ts` - logic-only tests for grammar, boundary
      replacement, keyboard precedence, and stale-response rejection.
- [x] `packages/web/src/components/settings/keyboard-shortcuts-settings.tsx` - document slash
      workflow behavior and key interactions.
- [x] `packages/web/src/lib/keyboard-shortcuts.ts` - reconcile shortcut label copy with actual send
      behavior in composer UI.
- [x] `packages/web/src/app/(app)/page.tsx` - explicitly document parity decision or implement same
      command UX if in scope.
- [x] `packages/web/src/app/api/skills/route.ts` (optional extension) - auth-protected route for
      dynamic catalog fetch.

## MVP Pseudocode

### `packages/web/src/lib/composer-insert.ts`

```ts
export function replaceActiveSlashToken(input: {
  text: string;
  caretIndex: number;
  template: string;
}): { text: string; caretIndex: number } {
  // 1) Locate active token that starts with '/'
  // 2) Replace token with template text
  // 3) Return updated text + deterministic caret position
  return { text: input.text, caretIndex: input.caretIndex };
}
```

### `packages/web/src/components/composer-slash-menu.tsx`

```tsx
// Renders listbox for commands, supports ArrowUp/ArrowDown/Enter/Escape,
// exposes onSelect(command) and onClose().
export function ComposerSlashMenu() {
  return null;
}
```

### `packages/web/src/app/(app)/session/[id]/page.tsx` (draft clear guard)

```ts
// Submit does not clear prompt immediately.
handleSubmit() {
  const requestId = crypto.randomUUID();
  sendPrompt(prompt, selectedModel, reasoningEffort, requestId);
  markDraftPendingClear();
}

// On prompt_queued ack, clear only when requestId matches current pending draft.
onPromptQueued(ack) {
  if (ack.requestId !== currentPendingRequestId) return;
  clearPromptDraft();
}
```

## References & Research

### Internal References

- Session composer state and submit path: `packages/web/src/app/(app)/session/[id]/page.tsx:184`
- Session Enter key behavior: `packages/web/src/app/(app)/session/[id]/page.tsx:242`
- Session textarea render location: `packages/web/src/app/(app)/session/[id]/page.tsx:779`
- Existing dropdown interaction style: `packages/web/src/app/(app)/session/[id]/page.tsx:852`
- Prompt send API over WS: `packages/web/src/hooks/use-session-socket.ts:523`
- Prompt queue ack currently no-op in client handler:
  `packages/web/src/hooks/use-session-socket.ts:253`
- Prompt command schema: `packages/control-plane/src/types.ts:89`
- Prompt queue dispatch: `packages/control-plane/src/session/message-queue.ts:162`
- Prompt queue ack emission site: `packages/control-plane/src/session/message-queue.ts:116`
- Prompt message handling entrypoint: `packages/control-plane/src/session/durable-object.ts:952`
- Home composer for parity decisions: `packages/web/src/app/(app)/page.tsx:392`
- Keyboard shortcuts behavior: `packages/web/src/lib/keyboard-shortcuts.ts:34`
- Keyboard shortcut label copy: `packages/web/src/lib/keyboard-shortcuts.ts:2`
- Web test runner constraints: `packages/web/vitest.config.ts:5`
- Action bar button styling baseline: `packages/web/src/components/action-bar.tsx:49`
- Authenticated API route pattern: `packages/web/src/app/api/repos/route.ts:13`

### Institutional Learnings

- No relevant `docs/solutions/` entries found in this repository as of 2026-02-21.

### External References

- Not used for this plan; local codebase patterns were sufficient for MVP design.

## Out of Scope

- New backend execution semantics for slash commands.
- Automatic command execution on selection.
- Database schema changes (no ERD required for this feature).
