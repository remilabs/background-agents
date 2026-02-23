---
status: ready
priority: p1
issue_id: "003"
tags: [code-review, architecture, typescript]
dependencies: []
---

# Shared Types Diverged from Control Plane

## Problem Statement

The `@open-inspect/shared` package and control plane define the same types independently and they
have drifted apart. Any consumer importing from shared gets incomplete type coverage, silently
undermining cross-service type safety.

## Findings

**Found by:** kieran-typescript-reviewer, architecture-strategist (confirmed by both with line
numbers)

1. **`SandboxStatus`:**
   - Shared (7 variants): `pending | warming | syncing | ready | running | stopped | failed`
   - Control Plane (11 variants): adds `spawning | connecting | stale | snapshotting`

2. **`MessageSource`:**
   - Shared (4 variants): missing `"linear"`
   - Control Plane (5 variants): includes `"linear"`

3. **`ServerMessage`:**
   - Shared: 11 message types
   - Control Plane: 18+ message types (missing `sandbox_spawning`, `sandbox_status`,
     `sandbox_error`, `artifact_created`, `snapshot_saved`, `sandbox_restored`, `sandbox_warning`,
     `session_status`, `processing_status`, `history_page`)

4. **`SandboxEvent`:**
   - Shared: flat interface with all-optional fields
   - Control Plane: discriminated union with 12 specific variants (structurally incompatible)

5. **`ClientMessage`:**
   - Shared: missing `fetch_history` variant
   - Control Plane: includes `fetch_history`

6. **`SessionState.isProcessing`:** Optional in shared, required in control plane

7. **`ListSessionsResponse`:** Shared has `cursor`, control plane has `total`

## Proposed Solutions

### Option A: Make shared the canonical source (Recommended)

- Move all expanded types from control-plane `types.ts` into `@open-inspect/shared`
- Control plane imports from shared (no local redefinitions)
- Web frontend gets full type safety automatically
- **Pros:** Single source of truth, catches mismatches at compile time
- **Cons:** Breaking change for shared consumers if types narrow
- **Effort:** Medium (1-2 hours)
- **Risk:** Low (types only expand, never narrow)

## Technical Details

- **Affected files:** `packages/shared/src/types/index.ts`, `packages/control-plane/src/types.ts`,
  `packages/web/src/hooks/use-session-socket.ts` (local type redeclarations)
- **Components:** Cross-service type system

## Acceptance Criteria

- [ ] All shared types match control plane types
- [ ] Control plane imports from shared (no local redefinitions)
- [ ] Web client imports from shared instead of local redeclarations
- [ ] All packages build without type errors
- [ ] No `as string` casts for status fields in web client

## Work Log

| Date       | Action                                 | Learnings                                                                       |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue in MEMORY.md and codebase-patterns.md                               |
| 2026-02-22 | Approved during triage — status: ready | Use Option A: make shared canonical. Types only expand, so no breaking changes. |
