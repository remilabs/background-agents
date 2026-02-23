---
status: ready
priority: p2
issue_id: "007"
tags: [code-review, architecture, duplication]
dependencies: []
---

# Logger Duplicated 4x Across TypeScript Packages

## Problem Statement

The structured JSON logger is copied verbatim across four packages (~400 lines total), differing
only in the `service` string. The linear-bot copy is missing `error_code` extraction — showing how
copy-paste leads to feature drift.

## Findings

**Found by:** code-simplicity-reviewer, kieran-typescript-reviewer, architecture-strategist

- `packages/control-plane/src/logger.ts` (135 lines, has `CorrelationContext`, `parseLogLevel`)
- `packages/slack-bot/src/logger.ts` (117 lines)
- `packages/github-bot/src/logger.ts` (117 lines)
- `packages/linear-bot/src/logger.ts` (89 lines, **missing `error_code` extraction**)

## Proposed Solutions

### Option A: Extract to `@open-inspect/shared` (Recommended)

- Parameterize `service` name in `createLogger()`
- Delete 4 duplicates
- Fix linear-bot's missing `error_code` extraction in the process
- **Pros:** Single source of truth, ~350 LOC reduction
- **Cons:** None (all packages already depend on shared)
- **Effort:** Small-Medium
- **Risk:** Low

## Acceptance Criteria

- [ ] Logger in `@open-inspect/shared` with parameterized service name
- [ ] All 4 package-specific loggers deleted
- [ ] `error_code` extraction works in all services
- [ ] All packages build and test successfully

## Work Log

| Date       | Action                                 | Learnings                                                                                 |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue in MEMORY.md                                                                  |
| 2026-02-22 | Approved during triage — status: ready | Extract to shared with createLogger(). Use control-plane version as base (most complete). |
