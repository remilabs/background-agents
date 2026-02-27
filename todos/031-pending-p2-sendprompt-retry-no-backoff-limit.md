---
status: done
priority: p2
issue_id: "031"
tags: [code-review, web, typescript, memory-leak]
dependencies: []
---

# sendPrompt Retry Has No Backoff Limit

## Problem Statement

The `sendPrompt` function in `use-session-socket.ts` retries via `setTimeout` with no attempt limit
when `subscribedRef.current` is false. Each retry captures the full `attachments` array in a closure
(~2.8MB for 5 images). If subscription never completes, this creates unbounded closure accumulation.

Pre-existing issue, but this PR makes it materially worse by adding `attachments` to the captured
arguments.

## Findings

- **Source**: TypeScript Reviewer (#2)
- **Location**: `packages/web/src/hooks/use-session-socket.ts:571-575`

## Proposed Solutions

### Option A: Return "rejected" instead of retry (Recommended)

```typescript
if (!subscribedRef.current) {
  console.error("Not subscribed yet");
  return "rejected"; // Let caller handle
}
```

### Option B: Add max retry count

```typescript
const MAX_RETRIES = 3;
// Track retry count and bail after limit
```

- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] sendPrompt does not create unbounded retry chains
- [ ] Attachment data is not captured indefinitely in closures

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
