/**
 * Shared string utilities.
 */

/**
 * Count the number of lines in a string.
 *
 * - Returns 0 for empty/falsy input.
 * - A trailing newline does NOT add an extra line
 *   (e.g. `"foo\n"` → 1, matching `wc -l` semantics).
 */
export function countLines(text: string | undefined): number {
  if (!text) return 0;
  const lines = text.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}
