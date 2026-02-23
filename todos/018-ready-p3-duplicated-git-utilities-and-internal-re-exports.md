---
status: ready
priority: p3
issue_id: "018"
tags: [code-review, simplicity, duplication]
dependencies: []
---

# Duplicated Git Utilities and Unnecessary internal.ts Re-exports

## Problem Statement

1. `generateNoreplyEmail`/`getCommitEmail` defined in both shared and control-plane with different
   signatures
2. Three bot packages have `internal.ts` files that just re-export `generateInternalToken` from
   shared — unnecessary indirection
3. `verifyCallbackSignature` duplicated across slack-bot and linear-bot

## Findings

**Found by:** code-simplicity-reviewer

- `packages/shared/src/git.ts` vs `packages/control-plane/src/auth/github.ts:195-220`
- `packages/slack-bot/src/utils/internal.ts`, `packages/github-bot/src/utils/internal.ts`,
  `packages/linear-bot/src/utils/internal.ts` — 7 lines each, pure re-exports
- `packages/slack-bot/src/callbacks.ts:42-61` vs `packages/linear-bot/src/callbacks.ts:20-39`

## Proposed Solutions

### Option A: Consolidate

- Make control-plane git utils a thin wrapper over shared
- Delete `internal.ts` files, import directly from shared
- Extract `verifyCallbackSignature` into shared
- **Effort:** Small-Medium
- **Risk:** Very low

## Acceptance Criteria

- [ ] No duplicate implementations of the same logic
- [ ] Direct imports from shared where possible

## Work Log

| Date       | Action                                 | Learnings                                                                         |
| ---------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                                                   |
| 2026-02-22 | Approved during triage — status: ready | Consolidate all three: git utils, internal.ts re-exports, verifyCallbackSignature |
