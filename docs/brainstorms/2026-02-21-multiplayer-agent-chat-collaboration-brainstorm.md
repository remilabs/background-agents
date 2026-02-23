---
date: 2026-02-21
topic: multiplayer-agent-chat-collaboration
---

# Multiplayer Agent Chat Collaboration

## What We're Building

We are adding a multiplayer collaboration layer to session chat so teams can discuss agent outputs
together without losing timeline clarity. V1 centers on public threads attached to any timeline
event (user messages, agent messages, and tool events), plus @mentions so people can pull in
teammates at the right moment.

To make long sessions easier to join, V1 also includes a lightweight context aid: a rolling summary
and an auto-generated table of contents with jump links to key moments. Notifications for mentions
and direct thread replies will be delivered in-app and to Slack so tagged teammates reliably see
what needs attention.

## Why This Approach

We considered two simpler alternatives: collaboration-first (threads/mentions only) and
context-first (summary/TOC first). Collaboration-first ships faster but leaves long-thread catch-up
unresolved, which is a core pain point. Context-first improves reading but under-serves active team
coordination.

The selected approach is a balanced V1: include both collaboration primitives (threads + mentions +
alerts) and minimal context scaffolding (rolling summary + TOC). This matches the stated goal of
making multiplayer "really great" without overbuilding advanced social features in the first
release.

## Key Decisions

- Threads are attached to any timeline event, not standalone topics.
- Threads are session-visible only in V1 (no private side threads).
- @mentions are a core interaction in main timeline and threads.
- Notifications ship in-app and Slack for mentions and direct replies.
- Rolling summary and auto TOC are both included in V1.
- Reactions are deferred to a follow-up release.
- Primary early success metric is improved collaboration satisfaction.

## Resolved Questions

- V1 priority is threaded side discussions.
- Thread anchors should support any timeline event.
- Mention notifications should include Slack (not in-app only).
- Long-thread readability should use both summary and TOC.
- Reactions should not be in core V1 scope.

## Open Questions

- None.

## Next Steps

-> `/workflows:plan` to define implementation details, sequencing, and validation.
