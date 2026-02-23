---
status: ready
priority: p2
issue_id: "012"
tags: [code-review, performance, frontend]
dependencies: []
---

# Frontend Events Array Grows Unboundedly with Expensive Re-renders

## Problem Statement

`setEvents((prev) => [...prev, event])` creates ever-growing arrays with spread copies. The
`groupedEvents` `useMemo` recomputes O(N) deduplication on every event change during streaming.
`SafeMarkdown` re-parses on every render with recreated `components` prop.

## Findings

**Found by:** performance-oracle

1. `packages/web/src/hooks/use-session-socket.ts:188-202` — Unbounded array growth with spread
   copies
2. `packages/web/src/app/(app)/session/[id]/page.tsx:750-787` — `groupedEvents` O(N) on every event
3. `packages/web/src/components/safe-markdown.tsx:63-155` — Recreates `components` and plugin arrays
   inline

## Proposed Solutions

### Option A: Batch events + incremental deduplication + memo SafeMarkdown

- Use `requestAnimationFrame` batching for event accumulation
- Compute `groupedEvents` incrementally (only process new events)
- Extract `SafeMarkdown` component/plugin constants to module scope, add `React.memo`
- **Effort:** Medium (3-4 hours)
- **Risk:** Low

## Acceptance Criteria

- [ ] Event array doesn't cause O(N^2) copies during streaming
- [ ] groupedEvents computation is incremental during streaming
- [ ] SafeMarkdown doesn't re-parse unchanged content

## Work Log

| Date       | Action                                 | Learnings                                                                   |
| ---------- | -------------------------------------- | --------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                                             |
| 2026-02-22 | Approved during triage — status: ready | Three-part fix: rAF batching, incremental grouping, React.memo SafeMarkdown |
