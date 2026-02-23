---
status: ready
priority: p2
issue_id: "025"
tags: [code-review, performance, frontend]
dependencies: [024]
---

# Frontend Events Array Grows Without Bound

## Problem Statement

The events array in the web app's session viewer grows without limit, accumulating all events from
session start indefinitely. In long-running sessions with heavy tool usage, this causes:

1. **Memory exhaustion:** No eviction policy means O(N) memory growth over session lifetime
2. **Rendering performance degradation:** React re-renders all events on each new batch
3. **Search/filter slowdown:** Operations like `groupEvents()` become O(N) with all historical
   events

Additionally, the `groupEvents()` function runs O(N) over all filtered events on every new batch,
with dedup state reset on history prepend causing full reprocessing of already-grouped events.

## Findings

**Found by:** Code review (2026-02-22)

1. **`packages/web/src/hooks/use-session-socket.ts:57-67`** — Unbounded events accumulation:

   ```typescript
   setEvents((prev) => {
     const newEvents = newData.events ?? [];
     if (newData.historyPosition === 0) {
       return [...newEvents, ...prev]; // Prepend history
     }
     return [...prev, ...newEvents]; // Append new events
   });
   ```

   No cap on array size. For a 10-hour session with 1000 events/hour = 10,000 events, all in memory.

2. **`packages/web/src/app/(app)/session/[id]/page.tsx:825`** — O(N) grouping on every batch:

   ```typescript
   const groupedAndFiltered = groupEvents(filteredEvents);
   ```

   Called in render path whenever `filteredEvents` changes. `groupEvents()` internally iterates all
   events and reprocesses dedup state.

3. **`packages/web/src/app/(app)/session/[id]/page.tsx:800-810`** — History prepend resets dedup:
   ```typescript
   if (isLoadingHistory && events.length > currentEvents.length) {
     // History prepended, causes full re-render and re-grouping
     setCurrentEvents(events);
   }
   ```
   Prepending history to the front invalidates cached group boundaries.

## Impact

- **OOM risk:** 10,000+ events = ~10MB+ in memory (events contain nested objects, tool calls, etc.)
- **Jank:** Every new event batch re-renders potentially thousands of items
- **Slow filtering:** Search/filter operations iterate all events
- **Battery drain:** Mobile sessions render full history repeatedly

## Proposed Solutions

### Option A: Cap events array with sliding window (Recommended)

- Keep only the most recent ~5,000 events
- When exceeding cap, trim from front (oldest events)
- Track a `startEventIndex` to know which events were discarded
- **Pros:** Bounded memory, simplest to implement
- **Cons:** Can't scroll infinitely far back in history (but UI paginates anyway)
- **Effort:** Small (cap on setEvents, index tracking)
- **Risk:** Low

### Option B: Virtualized list with lazy loading

- Use a virtualization library (react-window) to render only visible events
- Keep full history in memory but render O(1) viewport
- Load older events on scroll
- **Pros:** Full history available, efficient rendering
- **Cons:** More complex, requires server-side pagination support
- **Effort:** Medium
- **Risk:** Medium (virtualization libraries have edge cases)

### Option C: Incremental grouping (for O(N) issue)

- Cache grouped events and only recompute new batches
- Don't reset dedup state on history prepend
- **Pros:** Fixes O(N) grouping overhead
- **Cons:** Doesn't fix memory growth
- **Effort:** Medium (state management refactor)
- **Risk:** Medium (edge cases in incremental updates)

## Recommended Action

Use Option A + C together:

1. Cap events array at 5,000 items (trim from front on overflow)
2. Refactor `groupEvents()` to be incremental (cache groups, only reprocess new batches)
3. Preserve dedup state across history prepends

## Technical Details

- **Affected files:** `packages/web/src/hooks/use-session-socket.ts`,
  `packages/web/src/app/(app)/session/[id]/page.tsx`
- **Components:** Session viewer, event display, history loading
- **Performance impact:** Reduces re-renders from O(N) to O(1) for new batches

## Acceptance Criteria

- [ ] Events array capped at 5,000 items
- [ ] Oldest events trimmed from front when exceeding cap
- [ ] `groupEvents()` refactored to be incremental
- [ ] Dedup state preserved across history prepends
- [ ] Long-running sessions no longer degrade in performance
- [ ] All existing tests pass
- [ ] Manual testing: 10,000+ event session remains responsive

## Work Log

| Date       | Action                   | Learnings                                                      |
| ---------- | ------------------------ | -------------------------------------------------------------- |
| 2026-02-22 | Created from code review | Events array unbounded — memory O(N) in session duration       |
|            |                          | — `groupEvents()` O(N) on every batch due to full reprocessing |
|            |                          | — History prepend resets dedup, causing repeat work            |
| 2026-02-22 | Approved during triage   | Status changed from pending → ready. Ready to work on.         |

## Resources

- `packages/web/src/hooks/use-session-socket.ts:57-67` — Events accumulation logic
- `packages/web/src/app/(app)/session/[id]/page.tsx:825` — `groupEvents()` call site
- `packages/web/src/app/(app)/session/[id]/page.tsx:800-810` — History prepend logic
- TODO: Related to #024 (type safety will help event processing)
