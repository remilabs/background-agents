---
status: done
priority: p3
issue_id: "034"
tags: [code-review, agent-native, slack-bot, linear-bot, github-bot]
dependencies: ["027"]
---

# Bot Integrations Silently Drop Image Attachments

## Problem Statement

The control plane REST API fully supports image attachments, but none of the 3 bot integrations
(Slack, Linear, GitHub) forward platform-native images. A user pasting a screenshot in Slack has the
image silently dropped -- only text is forwarded.

## Findings

- **Source**: Agent-Native Reviewer (Warnings 1-3)
- **Locations**:
  - `packages/slack-bot/src/index.ts:123-177` (no attachments param in sendPrompt)
  - `packages/linear-bot/src/index.ts:786-798` (no attachments in body)
  - `packages/github-bot/src/handlers.ts:56-73` (no attachments param)
- **Priority order**: Slack (most common image sharing), Linear (bug screenshots), GitHub (PR
  screenshots)

## Proposed Solutions

For each bot: extract image URLs/files from platform payload, download, base64-encode, forward as
`Attachment[]`.

## Acceptance Criteria

- [ ] Slack: `event.files` images forwarded as attachments
- [ ] Linear: markdown `![](url)` images extracted and forwarded
- [ ] GitHub: markdown images extracted and forwarded

## Resources

- PR: https://github.com/remilabs/background-agents/pull/4
