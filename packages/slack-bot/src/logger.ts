/**
 * Structured JSON logger for the Slack bot Cloudflare Worker.
 *
 * Delegates to the shared logger with the service name bound to "slack-bot".
 * All existing call sites (`createLogger("component")`) continue to work unchanged.
 */

import { createServiceLogger } from "@open-inspect/shared";

export type { Logger, LogLevel } from "@open-inspect/shared";
export { parseLogLevel } from "@open-inspect/shared";

export const createLogger = createServiceLogger("slack-bot");
