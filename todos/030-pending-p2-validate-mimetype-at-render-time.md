---
status: done
priority: p2
issue_id: "030"
tags: [code-review, security, web, xss]
dependencies: []
---

# Validate mimeType at Render Time (XSS Defense)

## Problem Statement

Timeline and composer preview render images using data URLs with unvalidated `mimeType` from event
data. The `mimeType` originates from any authenticated user and is stored/replayed without
server-side validation. Additionally, `att.url || ""` fallback causes an `<img>` with `src=""` which
triggers a request to the current page.

## Findings

- **Source**: Security Sentinel (HIGH-1), TypeScript Reviewer (#6)
- **Locations**:
  - `packages/web/src/app/(app)/session/[id]/page.tsx:1162` (composer preview)
  - `packages/web/src/app/(app)/session/[id]/page.tsx:1608` (timeline rendering)

## Proposed Solutions

### Option A: Frontend MIME allowlist + remove URL fallback (Recommended)

```tsx
const SAFE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const safeMime = SAFE_MIME_TYPES.has(att.mimeType ?? "") ? att.mimeType : "image/png";
const src = att.content ? `data:${safeMime};base64,${att.content}` : undefined;
// Only render img if src is defined
{src && <img src={src} alt={att.name} ... />}
```

- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] mimeType validated against allowlist before constructing data URLs
- [ ] No `att.url` fallback in img src (or validated as HTTPS URL)
- [ ] Attachments with no content AND no valid URL render placeholder/nothing

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
