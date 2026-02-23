---
status: ready
priority: p2
issue_id: "006"
tags: [code-review, architecture]
dependencies: []
---

# Callback Routing Defaults to Slack for Unknown Message Sources

## Problem Statement

The `getBinding()` method in `CallbackNotificationService` defaults to `SLACK_BOT` for any
unrecognized message source. Messages originating from `"web"`, `"extension"`, `"github"`, or
unknown sources are silently routed to the Slack bot, which expects Slack-specific context
(`channel`, `threadTs`).

## Findings

**Found by:** kieran-typescript-reviewer, architecture-strategist, security-sentinel

- **`packages/control-plane/src/session/callback-notification-service.ts:79-88`**:

  ```typescript
  default:
    // Default to SLACK_BOT for backward compatibility (web sources, etc.)
    return this.env.SLACK_BOT;
  ```

- `"github"` is a valid `MessageSource` but has no callback binding
- Web-originated messages will cause Slack callbacks that fail on payload validation

## Proposed Solutions

### Option A: Return undefined for unknown sources (Recommended)

- Change default to `return undefined`
- Log a warning for unrecognized sources
- **Pros:** Fail-safe, prevents silent misrouting
- **Cons:** None (callers already handle `undefined`)
- **Effort:** Small
- **Risk:** Very low

## Technical Details

- **Affected files:** `packages/control-plane/src/session/callback-notification-service.ts`

## Acceptance Criteria

- [ ] Default case returns `undefined`
- [ ] Warning logged for unrecognized sources
- [ ] Slack callbacks still work for Slack-originated messages
- [ ] Linear callbacks still work for Linear-originated messages
- [ ] Web/GitHub messages don't produce spurious Slack callbacks

## Work Log

| Date       | Action                                 | Learnings                                     |
| ---------- | -------------------------------------- | --------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue in MEMORY.md                      |
| 2026-02-22 | Approved during triage — status: ready | Small fix: default to undefined + warning log |
