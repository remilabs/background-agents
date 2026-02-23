---
status: ready
priority: p1
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

# CORS Wildcard on All Control Plane Responses

## Problem Statement

Every response from the control plane is served with `Access-Control-Allow-Origin: *`, including
authenticated endpoints that manage sessions, secrets, and sandbox infrastructure. Any website on
the internet can make cross-origin requests to the control plane API.

## Findings

**Found by:** security-sentinel, architecture-strategist, kieran-typescript-reviewer

- **`packages/control-plane/src/router.ts:49-51`** — `withCorsAndTraceHeaders`:
  ```typescript
  headers.set("Access-Control-Allow-Origin", "*");
  ```
- **`packages/control-plane/src/router.ts:414-425`** — CORS preflight handler also uses `"*"`

**Impact:** If combined with any auth bypass or token leakage, CORS provides zero barrier. Session
management, secret CRUD, and sandbox operations are all exposed.

## Proposed Solutions

### Option A: Restrict to WEB_APP_URL origin (Recommended)

- Replace `"*"` with `env.WEB_APP_URL` from environment
- Add Service Binding origins for bot services
- **Pros:** Defense-in-depth, minimal code change
- **Cons:** Requires `WEB_APP_URL` to be set in all environments
- **Effort:** Small
- **Risk:** Low (test locally first)

### Option B: Dynamic origin validation

- Check `Origin` header against an allowlist
- Return the matched origin in the response
- **Pros:** Supports multiple origins
- **Cons:** More complex
- **Effort:** Medium
- **Risk:** Low

## Technical Details

- **Affected files:** `packages/control-plane/src/router.ts`
- **Components:** CORS middleware

## Acceptance Criteria

- [ ] CORS origin restricted to known origins
- [ ] Preflight handler updated
- [ ] Web app still connects successfully
- [ ] Bot service bindings unaffected (they use in-process RPC, not HTTP)

## Work Log

| Date       | Action                                 | Learnings                                                                         |
| ---------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue in MEMORY.md                                                          |
| 2026-02-22 | Approved during triage — status: ready | Use Option A: restrict to WEB_APP_URL. Verify env var exists in Terraform config. |
