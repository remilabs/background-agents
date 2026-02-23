---
status: ready
priority: p1
issue_id: "005"
tags: [code-review, security, typescript, python]
dependencies: []
---

# No Request Body Validation — 22+ `as T` Casts

## Problem Statement

Request bodies across the codebase are cast with `as T` (TypeScript) or accepted as `dict` (Python)
without any runtime validation. Malformed or malicious payloads silently pass through, causing
runtime crashes deep in the call stack or unexpected behavior.

## Findings

**Found by:** kieran-typescript-reviewer, security-sentinel

**TypeScript (representative examples):**

- `packages/control-plane/src/session/durable-object.ts:738` — `JSON.parse(message) as SandboxEvent`
- `packages/control-plane/src/session/durable-object.ts:752` —
  `JSON.parse(message) as ClientMessage`
- `packages/control-plane/src/session/durable-object.ts:1240` — `as { token: string }`
- `packages/control-plane/src/session/durable-object.ts:1354` — `as { sessionName, repoOwner, ... }`
- `packages/control-plane/src/session/durable-object.ts:1482` —
  `as { content, authorId, source, ... }`
- `packages/control-plane/src/router.ts:537` — `as CreateSessionRequest & { ... }`
- `packages/control-plane/src/router.ts:816` — No type annotation at all on body

**Python:**

- `packages/modal-infra/src/web_api.py:83` — `request: dict` (completely untyped)

**Exception:** `handleCreatePR` validates field types at runtime — this is the correct pattern.

## Proposed Solutions

### Option A: Zod schemas for TypeScript, Pydantic for Python (Recommended)

- Add Zod schemas at API boundaries
- Replace `as T` casts with `schema.parse(body)`
- Replace `dict` params with Pydantic models
- **Pros:** Catches malformed input at boundary, better error messages
- **Cons:** New dependency (Zod), migration effort
- **Effort:** Large (incremental, start with highest-risk endpoints)
- **Risk:** Low per endpoint

### Option B: Manual validation guards

- Follow the `handleCreatePR` pattern for all handlers
- **Pros:** No new dependencies
- **Cons:** More boilerplate, less consistent
- **Effort:** Medium
- **Risk:** Low

## Technical Details

- **Affected files:** `packages/control-plane/src/router.ts`,
  `packages/control-plane/src/session/durable-object.ts`, `packages/modal-infra/src/web_api.py`
- **Components:** All API boundaries

## Acceptance Criteria

- [ ] Session creation endpoint validates request body
- [ ] Prompt submission endpoint validates request body
- [ ] Modal endpoints use Pydantic models instead of `dict`
- [ ] Invalid requests return 400 with helpful error messages
- [ ] No `as T` casts on `request.json()` results

## Work Log

| Date       | Action                                 | Learnings                                                                                      |
| ---------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue in MEMORY.md                                                                       |
| 2026-02-22 | Approved during triage — status: ready | Use Zod + Pydantic. Tackle incrementally starting with session creation and prompt submission. |
