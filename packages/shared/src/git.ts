/**
 * Git utilities for branch management.
 */

/**
 * Branch naming convention for Rove sessions.
 */
export const BRANCH_PREFIX = "rove";

/**
 * Generate a branch name for a session.
 *
 * @param sessionId - Session ID
 * @param title - Optional title for the branch
 * @returns Branch name in format: rove/{session-id}
 */
export function generateBranchName(sessionId: string, _title?: string): string {
  // Use just session ID to keep it short and unique
  return `${BRANCH_PREFIX}/${sessionId}`;
}

/**
 * Extract session ID from a branch name.
 *
 * @param branchName - Branch name
 * @returns Session ID or null if not a Rove branch
 */
export function extractSessionIdFromBranch(branchName: string): string | null {
  const prefix = `${BRANCH_PREFIX}/`;
  if (!branchName.startsWith(prefix)) {
    return null;
  }
  return branchName.slice(prefix.length);
}

/**
 * Check if a branch name is a Rove branch.
 */
export function isRoveBranch(branchName: string): boolean {
  return branchName.startsWith(`${BRANCH_PREFIX}/`);
}
