---
status: ready
priority: p2
issue_id: "015"
tags: [code-review, security]
dependencies: []
---

# GitHub App Token Embedded in Git Remote URL

## Problem Statement

The GitHub App installation token is embedded directly in the git clone URL, making it visible to
any process in the sandbox via `git remote -v`, process listings, or verbose git error messages.

## Findings

**Found by:** security-sentinel

- `packages/modal-infra/src/sandbox/entrypoint.py:113,143,669`
  ```python
  clone_url = f"https://x-access-token:{self.github_app_token}@github.com/..."
  ```

## Proposed Solutions

### Option A: Use GIT_ASKPASS credential helper

- Set `GIT_ASKPASS` to a script that reads the token from a protected file
- Token never appears in URLs or process listings
- **Effort:** Medium
- **Risk:** Low

## Acceptance Criteria

- [ ] Token not visible in `git remote -v` output
- [ ] Git operations still work correctly

## Work Log

| Date       | Action                                 | Learnings                                                 |
| ---------- | -------------------------------------- | --------------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                           |
| 2026-02-22 | Approved during triage — status: ready | Use GIT_ASKPASS with protected file for credential helper |
