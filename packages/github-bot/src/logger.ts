/**
 * Structured JSON logger for the GitHub bot Cloudflare Worker.
 *
 * Delegates to the shared logger with the service name bound to "github-bot".
 * All existing call sites (`createLogger("component")`) continue to work unchanged.
 */

import { createServiceLogger } from "@open-inspect/shared";

export type { Logger, LogLevel } from "@open-inspect/shared";
export { parseLogLevel } from "@open-inspect/shared";

export const createLogger = createServiceLogger("github-bot");
