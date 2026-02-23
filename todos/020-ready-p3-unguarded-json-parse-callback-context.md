---
status: ready
priority: p3
issue_id: "020"
tags: [code-review, typescript, error-handling]
dependencies: []
---

# Unguarded JSON.parse on Callback Context

## Problem Statement

`JSON.parse(message.callback_context)` is called without try/catch in the callback notification
service. Malformed JSON in callback context will crash the entire notification flow, bypassing retry
logic.

## Findings

**Found by:** kieran-typescript-reviewer

- `packages/control-plane/src/session/callback-notification-service.ts:122`
- `packages/control-plane/src/session/callback-notification-service.ts:209`

## Proposed Solutions

### Option A: Wrap in try/catch with logging

- **Effort:** Small
- **Risk:** Very low

## Acceptance Criteria

- [ ] JSON.parse wrapped in try/catch
- [ ] Malformed context logged as warning, not crash

## Work Log

| Date       | Action                                 | Learnings                                        |
| ---------- | -------------------------------------- | ------------------------------------------------ |
| 2026-02-22 | Created from code review               |                                                  |
| 2026-02-22 | Approved during triage — status: ready | Simple try/catch + warning log at both locations |
