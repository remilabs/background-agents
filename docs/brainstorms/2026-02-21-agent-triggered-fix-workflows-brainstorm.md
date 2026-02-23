---
date: 2026-02-21
topic: agent-triggered-fix-workflows
---

# Agent-Triggered Fix Workflows

## What We're Building

Build a v1 multi-channel agent workflow where users can @mention the bot in Slack, Linear, or GitHub
with an initial prompt, and also explicitly kick off a fix workflow when needed. The fix workflow
should run in a sandbox, attempt to reproduce and fix issues, run repository tests, retry a limited
number of times, and produce a pre-tested proposal.

The first milestone prioritizes broad channel coverage and reliable fix execution quality: all three
channels supported, automatic PR creation when the fix workflow passes required tests, and
database-backed test execution as a mandatory environment capability. Visual testing and
Sentry-aware validation are explicitly out of the v1 quality gate.

## Why This Approach

We considered three product approaches:

- **Approach A (chosen): Unified core pipeline + channel adapters**. One shared fix-attempt pipeline
  handles policy and execution, while Slack/Linear/GitHub adapters handle trigger intake and
  response formatting.
- **Approach B: GitHub-first then port**. Deep quality in one channel first, then expand to other
  integrations.
- **Approach C: Channel-native loops**. Each integration owns its own orchestration logic.

Approach A is selected because it best matches the stated requirement to launch with all three
channels while keeping behavior consistent, reducing duplicated logic, and preserving room for
per-channel UX differences at the edge.

## Key Decisions

- Multi-channel v1 scope includes Slack, Linear, and GitHub from day one.
- Users can send any initial prompt via mentions, and there is also an explicit fix workflow
  trigger.
- Fix workflow quality gate requires repository tests to pass before proposing a fix.
- PRs are opened automatically when required tests pass.
- Sandbox fidelity priority for v1 is database-backed test support.
- Repositories follow a standard onboarding contract via `.openinspect/setup.sh` and
  `.openinspect/verify.sh`.
- Autonomous retry budget is limited to 2-3 attempts per trigger.
- Visual testing and Sentry-aware validation are intentionally deferred until after v1 reliability
  is established.

## Resolved Questions

- **v1 success definition:** Multi-channel coverage over single-channel depth.
- **v1 channels:** Slack + Linear + GitHub.
- **proposal gate:** Tests must pass before proposal.
- **automation level:** Auto-PR on passing runs.
- **fidelity priority:** Database-backed tests first.
- **repo onboarding:** Standard contract rather than ad hoc per repo.
- **prompt scope:** Any prompt accepted, with a clear fix workflow path.

## Open Questions

- None currently blocking planning.

## Next Steps

Run `/workflows:plan` to define implementation sequencing, ownership, policy model, and rollout
phases for the selected approach.
