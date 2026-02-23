---
status: ready
priority: p3
issue_id: "010"
tags: [code-review, security]
dependencies: []
---

# No Per-Session Authorization — Any User Can Access Any Session

## Problem Statement

The control plane's auth model is binary: either a request has valid HMAC credentials
(service-to-service) or it doesn't. There is no per-user authorization. Any authenticated user can
list, access, modify, or delete any session. Same applies to repo secrets.

## Findings

**Found by:** security-sentinel

- `packages/control-plane/src/router.ts:428-451` — HMAC auth only, no user identity
- `packages/web/src/app/api/repos/[owner]/[name]/secrets/route.ts` — checks `getServerSession` but
  not repo permissions
- Any logged-in user can: list all sessions, send prompts to any session, delete any session, manage
  secrets for any repo

## Proposed Solutions

### Option A: Thread user identity to control plane (Recommended for multi-tenant)

- Include user ID in HMAC-signed request headers
- Enforce session participant membership at control plane
- Add repo access checks for secret management
- **Pros:** Proper authorization model
- **Cons:** Significant refactor, affects all API routes
- **Effort:** Large
- **Risk:** Medium

### Option B: Accept as single-tenant limitation (Current)

- Document as known limitation
- Rely on `ALLOWED_USERS`/`ALLOWED_GITHUB_ORGS` for access control
- **Pros:** No code changes
- **Cons:** Any authed user can access everything
- **Effort:** None
- **Risk:** Acceptable for single-tenant deployment

## Acceptance Criteria

- [ ] Documented as known single-tenant limitation in project docs

## Work Log

| Date       | Action                                      | Learnings                                                                     |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review                    | Single-tenant design per current architecture                                 |
| 2026-02-22 | Approved during triage — status: ready (p3) | Accepted as single-tenant limitation per user decision. Scope: document only. |
