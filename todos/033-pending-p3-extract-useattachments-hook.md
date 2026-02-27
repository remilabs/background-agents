---
status: done
priority: p3
issue_id: "033"
tags: [code-review, architecture, web, react]
dependencies: []
---

# Extract useAttachments Hook and AttachmentPreviewStrip from page.tsx

## Problem Statement

`page.tsx` is now 1728 lines. This PR added ~200 lines of attachment state/UI. The `SessionContent`
component takes ~38 props. Attachment handling is a good extraction candidate.

## Findings

- **Source**: TypeScript Reviewer (#7), Architecture Strategist (4b), Code Simplicity Reviewer

## Proposed Solutions

Extract:

- `useAttachments()` hook: `pendingAttachments`, `attachmentError`, `fileInputRef`,
  `addAttachments`, `removeAttachment`
- `<AttachmentPreviewStrip>` component: thumbnail previews with remove buttons
- Consider `<ComposerFooter>` component for upload button + model selector

## Acceptance Criteria

- [ ] `useAttachments` hook in its own file
- [ ] `AttachmentPreviewStrip` component in its own file
- [ ] page.tsx prop count reduced
- [ ] No behavior changes

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
