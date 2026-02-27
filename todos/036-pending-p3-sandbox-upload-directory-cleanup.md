---
status: done
priority: p3
issue_id: "036"
tags: [code-review, performance, python, bridge]
dependencies: []
---

# Add Sandbox Upload Directory Cleanup

## Problem Statement

Image files written to `/workspace/.uploads/{messageId}/` are never cleaned up. Over many messages,
disk usage grows unboundedly. Files are also included in filesystem snapshots, inflating
snapshot/restore time.

50 messages with 3 images each = ~82MB of dead files.

## Findings

- **Source**: Performance Oracle (#8)
- **Location**: `packages/modal-infra/src/sandbox/bridge.py:447-448`

## Proposed Solution

Clean up the upload directory after prompt processing completes (images already sent to OpenCode
inline):

```python
import shutil
shutil.rmtree(upload_dir, ignore_errors=True)
```

## Acceptance Criteria

- [ ] Upload directories cleaned up after prompt processing
- [ ] No unbounded disk growth from image uploads

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
