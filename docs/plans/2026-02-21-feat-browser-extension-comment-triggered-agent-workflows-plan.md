---
title: feat: Add browser extension comment-triggered agent workflows
type: feat
status: active
date: 2026-02-21
---

# feat: Add browser extension comment-triggered agent workflows

## Overview ✨

Build a Manifest V3 browser extension that lets users explicitly trigger a background agent from
page comments and track execution status in a side panel, while reusing the existing Open-Inspect
session/prompt pipeline.

## Problem Statement / Motivation

- Users find actionable bugs/tasks in external tools and websites where Open-Inspect is not
  embedded.
- Current trigger adapters cover Slack/GitHub/Linear, but there is no general browser capture
  surface.
- The feature must preserve existing control-plane security boundaries; extension runtime cannot
  hold internal HMAC secrets.

## Research Summary

- Found brainstorm from 2026-02-21: `agent-triggered-fix-workflows`. Using as context for planning.
- Local repo research shows a strong "unified core pipeline + channel adapters" pattern across
  Slack/GitHub/Linear.
- No `docs/solutions/` directory exists; institutional learnings are sourced from existing
  docs/ADR/brainstorms.
- External research was required because this feature touches browser extension security, OAuth, and
  Chrome Web Store policy.
- SpecFlow analysis identified blockers around auth contract, trigger definition, and payload
  privacy boundaries.

## Issue Type & Stakeholders

- **Type:** enhancement (`feat`)
- **Primary stakeholders:** end users, control-plane/backend engineers, web/API engineers,
  security/privacy reviewers, operations/support.

## Proposed Solution

### MVP Scope

- Add a new MV3 extension package (`packages/browser-extension/`) with:
  - content script capture for comment text and page context
  - background service worker for authenticated API calls and queue/state recovery
  - side panel UI for job state + result links
- Use explicit user action only (context menu/button/keyboard command) to trigger runs.
- Route extension requests through authenticated web API routes (server-side proxy) to control-plane
  endpoints:
  - `POST /api/sessions`
  - `POST /api/sessions/:id/prompt`
  - `POST /api/sessions/:id/ws-token`
- Reuse existing control-plane session queue and event stream; do not create a separate
  orchestration path.

### Non-Goals (MVP)

- No "auto-detect every comment box and auto-submit" behavior.
- No direct extension -> Modal calls.
- No cross-browser parity guarantee (Firefox/Safari later).
- No new D1 schema changes unless needed after MVP telemetry.

### Trigger Contract (MVP)

- Extension sends minimal payload:
  - `commentText`
  - `pageUrl`
  - `pageTitle`
  - `source = "extension"`
  - `authorId`
  - `clientRequestId` (idempotency key)
  - optional `selectionContext` (bounded length)
- Backend enforces payload allowlist and size limits.

## Technical Considerations

- **Architecture impact:** extension acts as a new client adapter feeding existing session/prompt
  APIs.
- **Auth/security:** use OAuth Code + PKCE via web authentication boundary; never expose internal
  HMAC secrets to extension context.
- **Permissions:** least-privilege MV3 permissions (`activeTab`, optional host permissions,
  `storage`, `sidePanel`) and explicit permission prompts.
- **Reliability:** service workers are ephemeral; pending jobs must survive worker
  suspension/browser restart.
- **Observability:** propagate correlation IDs extension -> web API -> control plane for
  traceability.
- **Privacy/compliance:** no full-page scrape by default; capture only user-confirmed context.

## System-Wide Impact

- **Interaction graph:** extension content script capture -> extension SW request -> web API proxy
  (`packages/web/src/app/api/...`) -> control-plane session enqueue -> sandbox execution -> event
  broadcast -> extension side panel status update.
- **Error propagation:** auth or permission failures should terminate at extension UX with
  actionable remediation; backend 429/5xx should retry with bounded backoff + idempotency.
- **State lifecycle risks:** worker restart can orphan in-flight local jobs unless queue is
  persisted and reconciled on wake.
- **API surface parity:** extension should use the same request/response semantics as web clients;
  message source typing must stay consistent across shared/control-plane types.
- **Integration test scenarios:** permission denied; token expiry mid-run; duplicate submit retry;
  SPA rerender changing comment node; websocket reconnect after worker restart.

## SpecFlow Findings Applied

- Defined auth contract as MVP gate (token lifecycle, refresh, revocation).
- Defined explicit trigger model (user gesture only) to avoid ambiguous "comment somewhere"
  behavior.
- Added idempotency and durable local job queue requirements to avoid duplicate/ghost runs.
- Added deterministic job states: `queued`, `retrying`, `running`, `failed`, `succeeded`.
- Added payload minimization and schema validation requirements.
- Split implementation into MVP core first, site-specific adapters later.

## Implementation Phases

### Phase 0 - Contracts & Safety (Foundation)

- Finalize auth/session contract for extension-initiated actions.
- Define trigger payload schema and privacy boundaries.
- Confirm source typing and callback behavior for `extension` across shared/control-plane codepaths.

### Phase 1 - Extension MVP (Core)

- Build MV3 extension scaffolding, side panel UX, and explicit trigger action.
- Implement job submission via web API proxy, idempotency keys, and persisted local queue.
- Implement status reconciliation and reconnect behavior.

### Phase 2 - Hardening & Rollout

- Add site adapters for common comment surfaces (GitHub/Linear/web apps).
- Add richer result formatting and retry/cancel UX.
- Add Chrome Web Store packaging, policy docs, and staged rollout telemetry.

## Acceptance Criteria

### Functional

- [ ] `packages/browser-extension/manifest.json` declares only required MV3 permissions and host
      access.
- [ ] `packages/browser-extension/src/content/comment-capture.ts` captures user-selected comment
      content and bounded page context.
- [ ] `packages/browser-extension/src/background/trigger-agent.ts` can create/reuse a session and
      enqueue a prompt via web API.
- [ ] `packages/browser-extension/src/sidepanel/App.tsx` renders deterministic job states and
      result/error actions.
- [ ] `packages/browser-extension/src/background/job-queue.ts` persists pending jobs and restores
      after service-worker restart.
- [ ] `packages/web/src/app/api/extension/trigger/route.ts` (or equivalent) validates extension
      payload and forwards authenticated requests to control-plane.

### Security & Privacy

- [ ] No extension code path stores or transmits internal secrets (`MODAL_API_SECRET`, internal HMAC
      keys).
- [ ] OAuth flow uses Authorization Code + PKCE and enforces session expiry/re-auth.
- [ ] Payload allowlist is enforced server-side; full DOM/page HTML is not collected by default.
- [ ] CSP and MV3 remote-code restrictions pass Chrome Web Store checks.

### Reliability & Quality

- [ ] Duplicate submissions with same `clientRequestId` do not create duplicate backend runs.
- [ ] Transient failures (network/429/5xx) apply bounded exponential backoff with jitter.
- [ ] Connection drop and resume path reconciles job state without data loss.
- [ ] Extension and backend logs share correlation IDs for end-to-end tracing.
- [ ] End-to-end tests cover auth expiry, permission denial, SPA rerender capture drift, and worker
      restart recovery.

## Success Metrics

- Trigger-to-queued median latency under agreed SLO (target to set during implementation kickoff).
- Successful completion rate of extension-triggered jobs.
- Duplicate-run rate near zero via idempotency enforcement.
- Re-auth failure rate and permission-denial rate trend down after onboarding improvements.
- Weekly active users triggering agent runs from extension surfaces.

## Dependencies & Risks

- **Dependency:** finalized extension auth strategy within existing web/control-plane boundaries.
- **Dependency:** product decision on initial supported sites/surfaces for comment capture.
- **Risk:** over-broad permissions may block Chrome Web Store approval.
- **Risk:** inconsistent source typing (`MessageSource`) between packages can cause callback/routing
  bugs.
- **Risk:** callback routing currently defaults unknown sources to Slack binding and must be
  explicit for extension behavior.
- **Risk:** user trust/privacy concerns if capture scope is unclear.

<details>
<summary>Open Questions To Resolve Before Implementation</summary>

1. Should MVP always create a new session per comment, or append to a user-selected existing
   session?
2. Should extension responses be posted back to the originating page comment automatically, or
   remain extension-side initially?
3. Which domains are in MVP allowlist (all pages vs controlled list)?
4. Do we need a dedicated backend route for extension trigger requests, or can existing web routes
   be safely reused as-is?
5. Is enterprise distribution (managed install) required in v1, or Chrome Web Store-only?

</details>

## AI-Era Implementation Notes

- Local analysis used repository pattern research + institutional docs first, then external
  standards.
- External docs were required due security/compliance sensitivity of browser extensions.
- Human review required for auth model, permission scope, and privacy language before rollout.

## Pseudocode (MVP)

### `packages/browser-extension/src/background/job-queue.ts`

```ts
export async function enqueueTrigger(input: TriggerInput): Promise<void> {
  const idempotencyKey = input.clientRequestId;
  await persistPendingJob({ ...input, idempotencyKey, state: "queued" });
  await submitWithRetry(idempotencyKey);
}
```

### `packages/web/src/app/api/extension/trigger/route.ts`

```ts
export async function POST(req: Request) {
  const body = await validateExtensionTrigger(req);
  const sessionId = await ensureSession(body.repo, body.authorId);
  await enqueuePrompt(sessionId, body.prompt, body.clientRequestId, "extension");
  return json({ sessionId, status: "queued" });
}
```

## Data Model / ERD

No new persistent server-side model changes are required for MVP. ERD is not applicable unless Phase
2 introduces extension-specific backend tables.

## References & Research

### Internal References

- `docs/brainstorms/2026-02-21-agent-triggered-fix-workflows-brainstorm.md:24`
- `packages/control-plane/src/router.ts:391`
- `packages/control-plane/src/session/durable-object.ts:128`
- `packages/control-plane/src/session/message-queue.ts:42`
- `packages/control-plane/src/session/callback-notification-service.ts:79`
- `packages/control-plane/src/session/callback-notification-service.ts:86`
- `packages/web/src/app/api/sessions/route.ts:40`
- `packages/web/src/app/api/sessions/[id]/prompt/route.ts:7`
- `packages/web/src/app/api/sessions/[id]/ws-token/route.ts:17`
- `packages/shared/src/auth.ts:38`
- `packages/shared/src/types/index.ts:17`
- `packages/shared/src/types/integrations.ts:3`
- `packages/control-plane/src/types.ts:77`
- `docs/ramp-inspect-agent.md:116`
- `docs/ramp-inspect-agent.md:203`
- `docs/HOW_IT_WORKS.md:153`
- `docs/adr/0001-single-provider-scm-boundaries.md:27`

### External References

- Chrome MV2 deprecation timeline:
  https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline
- Extension service worker lifecycle (MV3):
  https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Messaging model: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Permissions and warnings:
  https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- `activeTab` permission: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Identity API: https://developer.chrome.com/docs/extensions/reference/api/identity
- MV3 remote hosted code policy:
  https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Extension CSP:
  https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- OAuth 2.0 Security BCP (RFC 9700): https://www.rfc-editor.org/rfc/rfc9700
- PKCE (RFC 7636): https://www.rfc-editor.org/rfc/rfc7636

### Related Work

- Related issue: TBD
- Related PR: TBD

## Out of Scope

- Automatic comment posting back to third-party platforms in MVP.
- Full DOM crawling or model-driven autonomous browsing.
- Non-Chrome browser parity in first release.
