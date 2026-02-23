/**
 * File change extraction utilities for deriving changed files from sandbox events.
 *
 * Scans tool_call events (Edit, Write) to build a summary of which files
 * were modified and approximate addition/deletion counts.
 *
 * Known limitations:
 * - Only structured tool calls (Edit, Write) are tracked. File modifications
 *   via Bash commands (e.g. `sed -i`, `echo >`, `cp`) are not detected.
 * - Write tool overwrites replace the entire file, but we can only count
 *   the new content as additions since the old content is not in the event.
 * - Edit with `replaceAll: true` may replace N occurrences, but we count
 *   oldString/newString lines only once (occurrence count is unavailable).
 */

import { countLines } from "./strings";
import type { SandboxEvent } from "./tool-formatters";
import type { FileChange } from "@/types/session";

/**
 * Extract aggregated file change stats from sandbox events.
 *
 * - **Edit** tool calls contribute additions (newString lines) and deletions (oldString lines).
 * - **Write** tool calls contribute additions equal to the content line count.
 *   Deletions from overwriting an existing file are not counted (old content
 *   is not available in the event payload).
 *
 * Multiple edits to the same file are summed together.
 */
export function extractFilesChanged(events: SandboxEvent[]): FileChange[] {
  const fileMap = new Map<string, { additions: number; deletions: number }>();

  for (const event of events) {
    if (event.type !== "tool_call") continue;

    const filePath = (event.args?.filePath ?? event.args?.file_path) as string | undefined;
    if (!filePath) continue;

    if (event.tool === "Edit") {
      const oldString = (event.args?.oldString ?? event.args?.old_string) as string | undefined;
      const newString = (event.args?.newString ?? event.args?.new_string) as string | undefined;

      const oldLines = countLines(oldString);
      const newLines = countLines(newString);

      const entry = fileMap.get(filePath) ?? { additions: 0, deletions: 0 };
      entry.additions += newLines;
      entry.deletions += oldLines;
      fileMap.set(filePath, entry);
    } else if (event.tool === "Write") {
      const content = event.args?.content as string | undefined;
      const lines = countLines(content);

      const entry = fileMap.get(filePath) ?? { additions: 0, deletions: 0 };
      entry.additions += lines;
      fileMap.set(filePath, entry);
    }
  }

  // Sort by filename for stable ordering
  return Array.from(fileMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filename, stats]) => ({
      filename,
      additions: stats.additions,
      deletions: stats.deletions,
    }));
}
