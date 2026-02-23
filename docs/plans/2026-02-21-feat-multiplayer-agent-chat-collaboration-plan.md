---
title: feat: Add multiplayer agent chat collaboration (threads, mentions, notifications, summary, TOC)
type: feat
status: active
date: 2026-02-21
---

# feat: Add multiplayer agent chat collaboration (threads, mentions, notifications, summary, TOC)

## Overview

Add a collaboration layer to session chat so multiple users can coordinate around specific timeline
moments without losing execution clarity.

V1 includes:

1. Public threads anchored to timeline events (`user_message`, agent token/result events, tool
   events).
2. `@mentions` in timeline and thread replies.
3. Mention and direct-reply notifications in-app and in Slack.
4. A rolling session summary for late joiners.
5. An auto-generated table of contents (TOC) with jump links to key moments.

V1 explicitly excludes reactions.

## Problem Statement / Motivation

- Sessions are increasingly multi-user, but discussion today happens inline in the main timeline,
  creating noisy context and making investigation threads hard to follow.
- Team members joining mid-session need to reconstruct a long sequence of tool calls and agent
  output manually.
- Mentions are not first-class in session chat, so ownership and response loops are easy to miss.

## Research Summary

- Source brainstorm:
  `docs/brainstorms/2026-02-21-multiplayer-agent-chat-collaboration-brainstorm.md`.
- Existing architecture already supports multi-participant sessions and event replay over WebSocket,
  which is a good foundation for thread anchors and synchronization.
- Existing callback delivery to Slack/Linear establishes a pattern for signed cross-service
  notifications that can be extended for mention/reply alerts.
- SpecFlow analysis identified key flow gaps: idempotency for replies/notifications, cross-channel
  status divergence, anchor lifecycle behavior, and summary/TOC version monotonicity.
- No prior `docs/solutions/` entry was found for this exact feature; implementation should follow
  current session DO, repository, and web socket patterns.

## Issue Type & Stakeholders

- **Type:** enhancement (`feat`)
- **Primary stakeholders:** session participants, support/on-call collaborators, web/frontend
  engineers, control-plane engineers, Slack integration owners.

## Proposed Solution

### MVP Scope

- Add thread model and APIs scoped to a session and anchored to a timeline event ID.
- Add reply model with server-authoritative mention parsing and idempotent write semantics.
- Extend session WebSocket protocol with thread/notification/summary/TOC events.
- Add in-app notification center for mentions and direct replies.
- Add Slack delivery path for the same notification intents (best effort with retry policy).
- Add rolling summary generation and TOC generation with versioned writes.

### Non-Goals (V1)

- No reactions, likes, or emoji acknowledgements.
- No private threads (all threads session-visible).
- No external channel posting of full thread content (Slack receives alerts only).
- No autonomous thread creation by agent heuristics (user-triggered thread creation only).

### Core Interaction Model

- A user opens a thread from any timeline item.
- The thread side panel shows anchor context and replies.
- Users post replies, optionally including `@mentions`.
- Server parses and validates mentions, persists reply, and emits notification requests.
- Notification worker/fanout records per-channel results (in-app, Slack).
- Summary and TOC update asynchronously as session grows; both are visible but non-blocking.

### Thread Anchor Lifecycle Rules

- If anchor event exists: thread is `active`.
- If anchor event is unavailable (pagination gap) but still valid in storage: thread remains active
  and UI shows deferred anchor preview.
- If anchor event is deleted/redacted/invalidated: thread becomes `orphaned_anchor` and stays
  readable with explicit warning.
- Thread ordering is deterministic by `(createdAt, threadId)`.

### Mention and Reply Notification Rules

- Mention notifications fire for valid session members only.
- Direct-reply notifications target thread participants and anchor author, excluding the actor.
- Deduplicate by key: `sessionId:sourceEventId:targetUserId:reason:channel`.
- Use idempotency key (`clientMessageId`) for reply create retries.
- Notification records are canonical with per-channel statuses (`in_app`, `slack`).

### Summary + TOC Update Rules

- Summary and TOC each maintain a monotonic `version` and `coversThroughEventId`.
- Reject regressive writes (older version or older coverage window).
- TOC entries store stable anchor IDs, not array indexes.
- If TOC anchor not available in current client window, UI offers fetch/jump fallback.

## Technical Considerations

- **Architecture impact:** introduces new collaboration entities in the control-plane session data
  model and new websocket event types consumed by the web app.
- **Reliability:** requires idempotent reply writes and notification dedupe to avoid duplicates from
  retries/reconnect.
- **Authorization:** membership must be rechecked at dispatch time for notification delivery.
- **Performance:** thread list and reply list queries need bounded pagination and indexes;
  summary/TOC jobs must avoid blocking prompt/event pipeline.
- **Consistency:** client/server mention parsing should be server-authoritative; client parsing is
  for UX hinting only.
- **Accessibility:** thread panel, mention picker, unread badges, and TOC jump links require robust
  keyboard and screen-reader behavior.
- **Observability:** add traceable event IDs and correlation fields from reply -> mention ->
  notification.

## System-Wide Impact

- **Interaction graph:** timeline event -> thread open/create in web UI -> control-plane DO persists
  thread/reply -> websocket fanout updates all participants -> notification fanout to in-app/Slack
  -> summary/TOC recompute jobs emit updates.
- **Error propagation:** reply write errors remain local to thread composer; notification channel
  failures are surfaced as per-channel statuses, not hard failures of reply creation.
- **State lifecycle risks:** duplicate replies from retries, stale summary overwrite, orphaned
  anchors, and unread drift across reconnect are the main risk surfaces.
- **API surface impact:** shared types must grow to include thread/reply/notification payloads and
  corresponding websocket message variants.
- **Integration boundaries:** Slack alert path should reuse existing callback signature pattern,
  extended for collaboration notification intents.

## SpecFlow Findings Applied

- Added direct-reply recipient rule (anchor author + thread participants, actor excluded).
- Added `clientMessageId` idempotency for reply creation and retry-safe semantics.
- Added canonical notification record with per-channel status for in-app/Slack divergence.
- Added notification dedupe key and suppression policy.
- Added dispatch-time membership check before channel delivery.
- Added `orphaned_anchor` thread state for deleted/redacted anchor events.
- Added monotonic version guards for summary and TOC writes.
- Added explicit trace field (`causedByEventId`) across reply/mention/notification pipeline.
- Explicitly codified reactions as out-of-scope in V1 contracts.

## Implementation Phases

### Phase 0 - Contracts and Data Model

- Define shared types and websocket contracts for thread/reply/notification/summary/TOC.
- Add schema tables/indexes and repository methods for collaboration entities.
- Define idempotency and dedupe contracts.

### Phase 1 - Threads and Mentions MVP

- Implement thread create/list/get and reply create/list APIs.
- Implement server-side mention parsing + validation + event emission.
- Implement web thread panel with reply composer and mention picker.

### Phase 2 - Notification Fanout

- Implement in-app notification persistence/read state.
- Implement Slack channel delivery and retry behavior with per-channel status recording.
- Add notification center and unread indicators in web UI.

### Phase 3 - Context Aids (Summary + TOC)

- Implement rolling summary generation pipeline with monotonic writes.
- Implement TOC generation and jump-link navigation.
- Add fallback UI for stale/missing anchors and summary generation errors.

### Phase 4 - Hardening and Rollout

- Race-condition and reconnect hardening.
- Feature-flagged rollout, telemetry monitoring, and UX tuning.

## Acceptance Criteria

- [ ] Users can create a thread from any visible timeline event type supported in V1.
- [ ] Reply creation with duplicate `clientMessageId` returns existing reply and does not create a
      duplicate row.
- [ ] Retries after network timeout produce at most one persisted reply and one notification request
      per target/channel dedupe key.
- [ ] Mention parsing ignores escaped `\@` and fenced code blocks.
- [ ] Mentions to non-session members are rejected with clear validation feedback and no
      notification.
- [ ] Direct-reply notifications do not notify the acting user.
- [ ] In-app notification records persist unread/read state per user and survive reconnect.
- [ ] Slack `429`, timeout, and `5xx` errors are retried with bounded exponential backoff + jitter.
- [ ] Slack terminal `4xx` errors are marked non-retryable and are not retried.
- [ ] Per-channel notification status is visible in the UI when in-app and Slack outcomes diverge.
- [ ] Thread order and reply order are deterministic across clients using `(createdAt, id)`.
- [ ] Thread with deleted/redacted anchor is still viewable and labeled `orphaned_anchor`.
- [ ] Summary updates reject stale/regressive versions.
- [ ] TOC links jump to anchor event when present; missing anchor yields explicit fallback UX.
- [ ] Keyboard-only users can open thread, compose mention, send reply, and close panel.
- [ ] Screen readers receive announcements for new replies and mention-notification updates.
- [ ] Reactions are absent from V1 API contracts, emitted events, and UI controls.

## Success Metrics

- Increase in sessions with at least one thread and at least two distinct participants posting.
- Decrease in median time for a tagged collaborator to respond after mention.
- Reduction in "hard to catch up" qualitative feedback for long sessions.
- High delivery success rate for in-app notifications; monitored Slack failure and retry rates.
- No material regression in prompt enqueue-to-dispatch latency for normal session traffic.

## Dependencies & Risks

- **Dependency:** clear membership source of truth for mention eligibility.
- **Dependency:** Slack bot/callback integration changes for collaboration notification payloads.
- **Risk:** duplicate notifications from retries/replays; mitigate with dedupe keys and unique
  constraints.
- **Risk:** stale summary/TOC overwrites; mitigate with monotonic write checks.
- **Risk:** anchor lifecycle edge cases create broken navigation; mitigate with orphan-state
  fallback.
- **Risk:** protocol drift between shared/web/control-plane packages; mitigate with shared-type
  first implementation and contract tests.

## Implementation Suggestions (File-Oriented)

- [ ] `packages/shared/src/types/index.ts` - add shared collaboration types (threads, replies,
      mentions, notification events, summary, TOC, websocket message variants).
- [ ] `packages/control-plane/src/session/schema.ts` - add tables/indexes for threads, replies,
      mentions, notification deliveries, summary snapshot, TOC snapshot.
- [ ] `packages/control-plane/src/session/repository.ts` - add CRUD + list/pagination queries and
      monotonic upsert helpers.
- [ ] `packages/control-plane/src/session/durable-object.ts` - handle new websocket message types
      and collaboration fanout events.
- [ ] `packages/control-plane/src/router.ts` - add authenticated REST routes for thread/reply and
      notification read-state updates.
- [ ] `packages/control-plane/src/session/callback-notification-service.ts` - extend callback
      routing to support collaboration notification intents and per-channel status reporting.
- [ ] `packages/web/src/hooks/use-session-socket.ts` - consume new collaboration events and merge
      into client state.
- [ ] `packages/web/src/app/(app)/session/[id]/page.tsx` - integrate thread anchor actions,
      notification badges, summary, and TOC components.
- [ ] `packages/web/src/components/` - add thread panel, reply composer, mention combobox,
      notification center, summary block, TOC block.
- [ ] `packages/control-plane/src/session/*.test.ts` and `packages/web/src/**/*.test.ts*` - add
      contract and flow tests for idempotency, dedupe, ordering, and accessibility-critical
      behavior.

## MVP Pseudocode

### `packages/control-plane/src/session/repository.ts`

```ts
export function createReplyIdempotent(input: {
  threadId: string;
  authorId: string;
  body: string;
  clientMessageId: string;
  createdAt: number;
}): { replyId: string; deduped: boolean } {
  // 1) Lookup existing reply by (thread_id, author_id, client_message_id)
  // 2) Return existing row when found
  // 3) Insert new row + mentions when not found
  return { replyId: "", deduped: false };
}
```

### `packages/control-plane/src/session/durable-object.ts`

```ts
async function handleThreadReplyCreate(ws: WebSocket, data: ReplyCreateMessage) {
  // 1) Validate participant membership + thread anchor state
  // 2) Persist reply idempotently
  // 3) Parse/validate mentions server-side
  // 4) Emit websocket reply event
  // 5) Enqueue notify.requested for in-app + Slack channels
}
```

### `packages/web/src/components/session-thread-panel.tsx`

```tsx
function SessionThreadPanel(props: { threadId: string; onClose: () => void }) {
  // Renders anchor context + reply timeline + mention composer
  // Maintains local draft and retry state for transient failures
  return null;
}
```

## Data Model / ERD

Expected new control-plane collaboration tables (within session DO SQLite):

- `threads` (`id`, `anchor_event_id`, `created_by`, `state`, `created_at`, `updated_at`)
- `thread_replies` (`id`, `thread_id`, `author_id`, `body`, `client_message_id`, `created_at`)
- `thread_reply_mentions` (`reply_id`, `mentioned_participant_id`)
- `notifications` (`id`, `target_participant_id`, `reason`, `source_event_id`, `created_at`,
  `read_at`)
- `notification_deliveries` (`notification_id`, `channel`, `status`, `attempts`, `last_error`,
  `updated_at`)
- `session_summary` (`version`, `covers_through_event_id`, `content`, `generated_at`)
- `session_toc` (`version`, `covers_through_event_id`, `entries_json`, `generated_at`)

## References & Research

### Internal References

- `docs/brainstorms/2026-02-21-multiplayer-agent-chat-collaboration-brainstorm.md:10`
- `packages/shared/src/types/index.ts:31`
- `packages/shared/src/types/index.ts:212`
- `packages/shared/src/types/index.ts:236`
- `packages/control-plane/src/session/schema.ts:29`
- `packages/control-plane/src/session/schema.ts:66`
- `packages/control-plane/src/session/repository.ts`
- `packages/control-plane/src/session/durable-object.ts:914`
- `packages/control-plane/src/session/durable-object.ts:1022`
- `packages/control-plane/src/session/message-queue.ts:45`
- `packages/control-plane/src/session/callback-notification-service.ts:95`
- `packages/web/src/hooks/use-session-socket.ts:136`
- `packages/web/src/app/(app)/session/[id]/page.tsx:140`

### External References

- None required for this initial plan; local architecture and existing callback/realtime patterns
  are sufficient for V1 design.

## Out of Scope

- Reactions and emoji acknowledgements.
- Private or role-restricted threads.
- External posting of full thread transcripts.
- Cross-session/global notifications.
