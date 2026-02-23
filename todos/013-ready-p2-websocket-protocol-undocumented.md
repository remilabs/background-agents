---
status: ready
priority: p2
issue_id: "013"
tags: [code-review, agent-native, documentation]
dependencies: []
---

# WebSocket Protocol Undocumented for Programmatic Clients

## Problem Statement

The primary interaction path for real-time session participation requires a WebSocket with a
specific auth and message protocol. This protocol is defined in types but not documented anywhere
for external automated clients. Agents or CLI tools have no reference for the subscribe handshake,
server message types, or reconnection strategy.

## Findings

**Found by:** agent-native-reviewer

- The protocol is implemented in `packages/web/src/hooks/use-session-socket.ts` but serves as
  implicit documentation only
- WS token endpoint (`POST /sessions/:id/ws-token`) is coupled to NextAuth sessions — no
  machine-to-machine path
- 22+ server message variants with no external documentation

## Proposed Solutions

### Option A: Document protocol + add HTTP SSE alternative (Recommended)

- Write `docs/websocket-protocol.md` with full client/server message contract
- Expose an HTTP SSE endpoint for simpler agent consumption
- **Effort:** Medium
- **Risk:** Low

## Acceptance Criteria

- [ ] WebSocket protocol documented (auth flow, message types, reconnection)
- [ ] External agents can connect programmatically

## Work Log

| Date       | Action                                 | Learnings                                          |
| ---------- | -------------------------------------- | -------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                    |
| 2026-02-22 | Approved during triage — status: ready | Document protocol first, SSE endpoint as follow-up |
