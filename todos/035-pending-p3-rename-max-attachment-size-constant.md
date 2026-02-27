---
status: done
priority: p3
issue_id: "035"
tags: [code-review, typescript, naming]
dependencies: []
---

# Rename MAX_ATTACHMENT_SIZE_BYTES Constant

## Problem Statement

`MAX_ATTACHMENT_SIZE_BYTES` is compared against `base64.length` (character count), not byte count.
Base64 inflates by ~33%, so 768KB of base64 characters = ~560KB binary. The name misleads readers
into thinking it controls binary size.

## Findings

- **Source**: TypeScript Reviewer (#4)
- **Location**: `packages/web/src/lib/image-utils.ts:16`

## Proposed Solution

Rename to `MAX_ATTACHMENT_BASE64_LENGTH` or `MAX_ATTACHMENT_BASE64_CHARS`.

## Acceptance Criteria

- [ ] Constant name accurately reflects what it bounds (base64 character count, not binary bytes)

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
