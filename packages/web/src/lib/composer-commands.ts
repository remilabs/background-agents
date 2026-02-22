export interface ComposerCommand {
  id: string;
  command: string;
  title: string;
  description: string;
  template: string;
  starterTitle?: string;
  starterDescription?: string;
}

export const COMPOSER_COMMANDS: ComposerCommand[] = [
  {
    id: "plan-feature",
    command: "plan",
    title: "Plan feature",
    description: "Draft a scoped implementation plan before coding",
    template:
      "Create a detailed implementation plan for this request. Include scope, acceptance criteria, risks, and phased rollout.",
    starterTitle: "Plan Feature",
    starterDescription: "Start with a scoped plan and acceptance criteria.",
  },
  {
    id: "implement-plan",
    command: "build",
    title: "Implement plan",
    description: "Execute the current plan with tests and checkpoints",
    template:
      "Implement the active plan step-by-step. Follow existing patterns, run relevant tests after each task, and summarize what changed.",
    starterTitle: "Implement Plan",
    starterDescription: "Execute current plan tasks with test checkpoints.",
  },
  {
    id: "technical-review",
    command: "review",
    title: "Technical review",
    description: "Run a technical review and list required fixes",
    template:
      "Run /technical_review on the current work and list the highest-priority fixes before merge.",
    starterTitle: "Technical Review",
    starterDescription: "Audit current work for risks and gaps.",
  },
  {
    id: "deepen-plan",
    command: "deepen",
    title: "Deepen plan",
    description: "Expand a plan with additional research",
    template:
      "Run /deepen-plan on the active plan file and update it with concrete implementation details.",
  },
  {
    id: "resolve-pr",
    command: "resolve-pr",
    title: "Resolve PR comments",
    description: "Address open review comments in parallel",
    template:
      "Use resolve_pr_parallel to address all open PR review comments and summarize each resolution.",
    starterTitle: "Resolve PR Feedback",
    starterDescription: "Batch-resolve reviewer comments with summaries.",
  },
  {
    id: "setup-reviewers",
    command: "setup",
    title: "Configure reviewers",
    description: "Configure project review agents",
    template:
      "Use the setup skill to configure review agents for this project and explain the resulting configuration.",
  },
];

export function getStarterComposerCommands(
  commands: ComposerCommand[] = COMPOSER_COMMANDS
): ComposerCommand[] {
  return commands.filter((command) => command.starterTitle && command.starterDescription);
}
