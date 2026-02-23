---
status: ready
priority: p1
issue_id: "004"
tags: [code-review, security, python]
dependencies: []
---

# Modal API Returns HTTP 200 for Errors and Leaks Exception Details

## Problem Statement

All error handlers in the Modal web API return HTTP 200 with `{"success": false, "error": str(e)}`.
This leaks internal implementation details via `str(e)` and defeats HTTP-level monitoring, alerting,
and circuit breakers.

## Findings

**Found by:** security-sentinel, architecture-strategist

**Locations (all in `packages/modal-infra/src/web_api.py`):**

- Line 183-187: `api_create_sandbox`
- Line 257-261: `api_warm_sandbox`
- Line 323-327: `api_snapshot`
- Line 421-425: `api_snapshot_sandbox`
- Line 550-554: `api_restore_sandbox`

Pattern:

```python
except Exception as e:
    outcome = "error"
    http_status = 500  # Logged but not returned!
    log.error("api.error", exc=e, endpoint_name="...")
    return {"success": False, "error": str(e)}
```

`http_status` is set to 500 for logging but the actual HTTP response is 200.

## Proposed Solutions

### Option A: Raise HTTPException with sanitized message (Recommended)

- Replace `return {"success": False, "error": str(e)}` with
  `raise HTTPException(status_code=500, detail="Internal error")`
- Keep full error logging server-side
- **Pros:** Proper HTTP semantics, no info leakage, monitoring works
- **Cons:** Control plane must handle non-200 responses (it already does via
  `classifyErrorWithStatus`)
- **Effort:** Small
- **Risk:** Low (control plane already handles HTTP errors)

## Technical Details

- **Affected files:** `packages/modal-infra/src/web_api.py`
- **Components:** Modal HTTP API

## Acceptance Criteria

- [ ] All error handlers return proper HTTP status codes (4xx/5xx)
- [ ] Error responses contain only generic messages, not `str(e)`
- [ ] Full exception details logged server-side
- [ ] Control plane error classification still works

## Work Log

| Date       | Action                                 | Learnings                                                                                                       |
| ---------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               | Known issue in MEMORY.md                                                                                        |
| 2026-02-22 | Approved during triage — status: ready | Use Option A: HTTPException with sanitized messages. Verify control plane classifyErrorWithStatus handles 500s. |
