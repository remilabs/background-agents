---
status: ready
priority: p2
issue_id: "009"
tags: [code-review, performance]
dependencies: []
---

# Event Replay Double JSON Parse/Stringify on Subscribe

## Problem Statement

When a client subscribes, `getReplayData()` fetches up to 500 events and calls
`JSON.parse(row.data)` on each one individually, then the result is re-serialized via
`JSON.stringify` for the WebSocket send. This double-serialization blocks the DO's single-threaded
event loop.

## Findings

**Found by:** performance-oracle

- `packages/control-plane/src/session/durable-object.ts:897-913` — 500 events parsed synchronously
- At ~2KB per payload, this is ~1MB of synchronous JSON parsing during subscribe
- Causes head-of-line blocking for other WebSocket messages during replay

## Proposed Solutions

### Option A: Pass raw JSON strings through (Recommended)

- Skip the parse/re-serialize cycle — send raw `data` column strings directly
- Construct the subscribed message with embedded raw JSON
- **Pros:** 40-60% CPU reduction in subscribe handler
- **Cons:** Requires manual JSON string construction
- **Effort:** Medium (2-3 hours)
- **Risk:** Low

## Acceptance Criteria

- [ ] Event replay no longer double-serializes
- [ ] Subscribe time for 500-event sessions measurably reduced
- [ ] Replay data format unchanged from client perspective

## Work Log

| Date       | Action                                 | Learnings                                                    |
| ---------- | -------------------------------------- | ------------------------------------------------------------ |
| 2026-02-22 | Created from code review               |                                                              |
| 2026-02-22 | Approved during triage — status: ready | Pass raw JSON strings through, skip parse/re-serialize cycle |
