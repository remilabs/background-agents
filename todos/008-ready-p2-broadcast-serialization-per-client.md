---
status: ready
priority: p2
issue_id: "008"
tags: [code-review, performance]
dependencies: []
---

# Broadcast Serializes Message Once Per Client (Should Be Once Total)

## Problem Statement

The WebSocket broadcast path calls `JSON.stringify(message)` for every connected client. During
streaming (10-50 token events/second with 5+ clients), this causes 50-250 redundant serializations
per second.

## Findings

**Found by:** performance-oracle

- `packages/control-plane/src/session/websocket-manager.ts:235-248` — `send()` calls
  `JSON.stringify` per socket
- `forEachClientSocket` in broadcast iterates all sockets and classifies each one (tag parsing +
  potential SQLite query)

**Additional issue:** `getConnectedClientCount()` scans all WebSockets and classifies each one
instead of maintaining a counter.

## Proposed Solutions

### Option A: Pre-serialize before broadcast loop (Recommended)

- Serialize once, pass string to `sendRaw()` variant
- Maintain Set<WebSocket> for authenticated clients instead of re-classifying on each broadcast
- **Pros:** O(1) serialization, O(1) client set iteration
- **Cons:** Minor refactor of WebSocket manager
- **Effort:** Small (1 hour)
- **Risk:** Low

## Acceptance Criteria

- [ ] `JSON.stringify` called once per broadcast, not once per client
- [ ] Authenticated client set maintained incrementally
- [ ] Token streaming performance measurably improved

## Work Log

| Date       | Action                                 | Learnings                                              |
| ---------- | -------------------------------------- | ------------------------------------------------------ |
| 2026-02-22 | Created from code review               |                                                        |
| 2026-02-22 | Approved during triage — status: ready | Pre-serialize + maintain client Set for O(1) broadcast |
