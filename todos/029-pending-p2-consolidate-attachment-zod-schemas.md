---
status: done
priority: p2
issue_id: "029"
tags: [code-review, architecture, typescript, dry]
dependencies: ["027"]
---

# Consolidate Duplicated Attachment Zod Schemas

## Problem Statement

The attachment Zod schema is defined identically in 4 locations (and the TypeScript type in a 5th).
This violates DRY and has already caused drift -- prior to this PR, `types.ts` used `type: string`
instead of the enum and was missing `mimeType`.

## Findings

- **Source**: TypeScript Reviewer (#1), Architecture Strategist (3a, 3b, 3c)
- **Locations** (all duplicates):
  1. `packages/control-plane/src/router.ts:55-65` (PromptSchema)
  2. `packages/control-plane/src/session/durable-object.ts:112-122` (ClientMessageSchema)
  3. `packages/control-plane/src/session/durable-object.ts:164-174` (EnqueuePromptSchema)
  4. `packages/control-plane/src/session/types.ts:114-120` (PromptCommand inline type)
  5. `packages/control-plane/src/session/durable-object.ts:1219-1225` (handlePromptMessage param)

## Proposed Solutions

### Option A: Define schema once in control-plane, import everywhere (Recommended)

Create `AttachmentSchema` in a control-plane schemas file:

```typescript
// packages/control-plane/src/schemas.ts
export const AttachmentSchema = z.object({
  type: z.enum(["file", "image", "url"]),
  name: z.string().max(255),
  url: z.string().optional(),
  content: z.string().max(1_048_576).optional(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]).optional(),
});
```

Use `Attachment` type from `@open-inspect/shared` for TypeScript interfaces:

```typescript
// types.ts
import type { Attachment } from "@open-inspect/shared";
export interface PromptCommand {
  attachments?: Attachment[]; /* ... */
}
```

- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Single `AttachmentSchema` Zod definition imported in all 3 Zod locations
- [ ] `PromptCommand.attachments` uses `Attachment[]` from shared
- [ ] `handlePromptMessage` parameter uses `Attachment[]` from shared
- [ ] No inline attachment type definitions remain

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
