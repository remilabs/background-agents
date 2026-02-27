---
status: done
priority: p3
issue_id: "037"
tags: [code-review, simplicity, typescript, web]
dependencies: []
---

# Simplify image-utils.ts Validation Pipeline

## Problem Statement

`processImageFile` calls `validateImageType` (reads 12 bytes, loops MAGIC_BYTES) then
`resizeAndCompress` which calls `detectMimeType` (reads same 12 bytes, same loop). Two reads, same
data, same logic. `validateImageType` is redundant since `detectMimeType` returning null serves the
same purpose.

## Findings

- **Source**: Code Simplicity Reviewer (#1, #2), TypeScript Reviewer (#5)
- **Location**: `packages/web/src/lib/image-utils.ts:38-74, 195-203`

## Proposed Solution

Remove `validateImageType`. Have `processImageFile` call `resizeAndCompress` directly (it already
throws for unsupported types). Also consider simplifying WebP special-case detection (~15 LOC) and
removing the progressive JPEG quality loop (~8 LOC).

Estimated reduction: ~40 lines (18% of file).

## Acceptance Criteria

- [ ] Single magic byte read per image
- [ ] `validateImageType` removed or merged into `detectMimeType`
- [ ] All supported formats still work

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
