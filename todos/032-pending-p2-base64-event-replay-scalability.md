---
status: done
priority: p2
issue_id: "032"
tags: [code-review, performance, architecture, scalability]
dependencies: ["028"]
---

# Base64 Event Storage Causes Unbounded Replay Growth

## Problem Statement

Full base64 image data is stored in `user_message` events in DO SQLite. On reconnect, up to 500
events are replayed. With image-heavy sessions, replay payload can reach 10-50MB+, exceeding DO
memory (128MB), CF WS frame limits, and causing browser OOM.

Additionally, base64 is stored twice per message: in the `messages` table AND the `events` table.

## Findings

- **Source**: Performance Oracle (CRITICAL-2), Architecture Strategist (4a)
- **Locations**:
  - `packages/control-plane/src/session/message-queue.ts:258` (event storage)
  - `packages/control-plane/src/session/message-queue.ts:87` (message storage)
  - `packages/control-plane/src/session/message-queue.ts:265` (broadcast)

**Projections**: 20 messages with 3 images each = ~46MB replay. 100 messages = ~230MB (session
becomes unrecoverable).

## Proposed Solutions

### Option A: Strip content from events, keep only metadata (Short-term, Recommended)

Store full base64 only in the `messages` table. In events, store only attachment metadata (name,
mimeType, messageId). Clients display a placeholder or fetch image data separately.

- **Effort**: Medium
- **Risk**: Low-Medium (requires UI change for image display)

### Option B: Upload to R2, store URLs everywhere (Long-term)

Upload images to Cloudflare R2 via HTTP, store signed URLs in events and messages.

- **Effort**: Large
- **Risk**: Medium (new infrastructure)

## Acceptance Criteria

- [ ] Event replay payload does not grow proportionally with image uploads
- [ ] Historical sessions with images remain accessible
- [ ] Images are still visible to all session participants

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
- Related: Todo #025 (frontend unbounded events array)
