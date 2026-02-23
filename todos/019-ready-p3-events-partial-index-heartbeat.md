---
status: ready
priority: p3
issue_id: "019"
tags: [code-review, performance]
dependencies: []
---

# Missing Partial Index for Non-Heartbeat Events

## Problem Statement

The events history pagination query uses `WHERE type != 'heartbeat'` but the existing index on
`events(created_at, id)` cannot filter heartbeats efficiently. Heartbeats generate ~2880 events/day
(every 30s), causing linear scan growth.

## Findings

**Found by:** performance-oracle

- `packages/control-plane/src/session/schema.ts:112-118`
- Query at `repository.ts:671-680`

## Proposed Solutions

### Option A: Add partial index (Recommended)

- `CREATE INDEX IF NOT EXISTS idx_events_non_heartbeat ON events(created_at DESC, id DESC) WHERE type != 'heartbeat'`
- **Effort:** Small (15 minutes, single migration)
- **Risk:** Very low

## Acceptance Criteria

- [ ] Partial index added via schema migration
- [ ] History pagination query uses the index

## Work Log

| Date       | Action                                 | Learnings                                               |
| ---------- | -------------------------------------- | ------------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                         |
| 2026-02-22 | Approved during triage — status: ready | Single schema migration, add partial index on DO SQLite |
