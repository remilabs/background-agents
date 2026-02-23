---
status: ready
priority: p2
issue_id: "014"
tags: [code-review, architecture]
dependencies: []
---

# Model Default Defined in 3+ Places with Different Values

## Problem Statement

The default model is defined in multiple places with inconsistent values, violating
single-source-of-truth.

## Findings

**Found by:** architecture-strategist

- `packages/shared/src/models.ts:32`: `DEFAULT_MODEL = "anthropic/claude-sonnet-4-6"`
- `packages/control-plane/src/session/schema.ts:22`: SQLite default `'anthropic/claude-haiku-4-5'`
- Terraform `main.tf:219`: slack-bot `DEFAULT_MODEL = "claude-haiku-4-5"` (unprefixed!)
- Terraform `main.tf:269`: github-bot `DEFAULT_MODEL = "anthropic/claude-haiku-4-5"`

## Proposed Solutions

### Option A: Single constant, referenced everywhere

- Use shared package constant as canonical default
- Align SQLite schema and Terraform values
- **Effort:** Small
- **Risk:** Low

## Acceptance Criteria

- [ ] All default model references use the same value
- [ ] Terraform variables use consistent prefixed format

## Work Log

| Date       | Action                                 | Learnings                                                            |
| ---------- | -------------------------------------- | -------------------------------------------------------------------- |
| 2026-02-22 | Created from code review               |                                                                      |
| 2026-02-22 | Approved during triage — status: ready | Align all to shared constant. Ensure Terraform uses prefixed format. |
