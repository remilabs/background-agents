---
status: ready
priority: p1
issue_id: "001"
tags: [code-review, security]
dependencies: []
---

# Non-Timing-Safe Token Comparisons

## Problem Statement

Three locations use JavaScript's native `===` operator for secret/token comparison instead of
constant-time comparison. This is vulnerable to timing attacks where an attacker on the same network
segment could measure response times to brute-force tokens byte-by-byte.

The codebase already has `timingSafeEqual` exported from `@open-inspect/shared/auth.ts` — it exists
but is not used in these locations.

## Findings

**Found by:** kieran-typescript-reviewer, security-sentinel, architecture-strategist (confirmed by
all three)

1. **`packages/control-plane/src/session/durable-object.ts:570`** — WebSocket upgrade auth:

   ```typescript
   if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
   ```

2. **`packages/control-plane/src/session/durable-object.ts:1270`** — Token verification endpoint:

   ```typescript
   if (body.token !== sandbox.auth_token) {
   ```

3. **`packages/slack-bot/src/callbacks.ts:60`** — Callback signature verification:
   ```typescript
   return signature === expectedHex;
   ```

Note: The Linear bot at `packages/linear-bot/src/callbacks.ts:38` correctly uses `timingSafeEqual` —
showing the inconsistency.

## Proposed Solutions

### Option A: Direct replacement with shared utility (Recommended)

- Import `timingSafeEqual` from `@open-inspect/shared` in all three files
- Replace `===` comparisons with `timingSafeEqual(actual, expected)`
- **Pros:** Minimal change, uses existing infrastructure
- **Cons:** None
- **Effort:** Small (3 one-line changes)
- **Risk:** Very low

## Recommended Action

Import `timingSafeEqual` from `@open-inspect/shared` in all three files. Follow Linear bot's
existing correct implementation as the pattern.

## Technical Details

- **Affected files:** `packages/control-plane/src/session/durable-object.ts`,
  `packages/slack-bot/src/callbacks.ts`
- **Components:** Session auth, callback verification
- **Known Pattern:** Linear bot already implements this correctly at
  `packages/linear-bot/src/callbacks.ts:38`

## Acceptance Criteria

- [ ] All three `===` comparisons replaced with `timingSafeEqual`
- [ ] Existing tests pass
- [ ] Linear bot's correct implementation is preserved

## Work Log

| Date       | Action                                 | Learnings                                         |
| ---------- | -------------------------------------- | ------------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue documented in MEMORY.md               |
| 2026-02-22 | Approved during triage — status: ready | Straightforward 3-line fix using existing utility |

## Resources

- `@open-inspect/shared/src/auth.ts:17-26` — existing `timingSafeEqual` implementation
- MEMORY.md — lists this as known issue
