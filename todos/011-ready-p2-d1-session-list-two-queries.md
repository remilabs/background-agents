---
status: ready
priority: p2
issue_id: "011"
tags: [code-review, performance]
dependencies: []
---

# SessionIndexStore.list() Executes Two Separate D1 Queries

## Problem Statement

`list()` first executes a `COUNT(*)` query, then a separate paginated `SELECT *` query. Two
sequential D1 round-trips (5-20ms each) double the latency for the `/sessions` endpoint.

## Findings

**Found by:** performance-oracle

- `packages/control-plane/src/db/session-index.ts:86-135` — Two sequential queries

## Proposed Solutions

### Option A: Use COUNT(\*) OVER() window function (Recommended)

- Single query gets both count and results
- **Effort:** Small (30 minutes)

### Option B: Use `db.batch()` for parallel execution

- Execute both queries in one round-trip
- **Effort:** Small (30 minutes)

## Acceptance Criteria

- [ ] Session listing uses a single D1 round-trip
- [ ] Sidebar load time measurably reduced

## Work Log

| Date       | Action                                 | Learnings                                                                              |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                                                        |
| 2026-02-22 | Approved during triage — status: ready | Try Option A (window function) first; fall back to db.batch() if D1 doesn't support it |
