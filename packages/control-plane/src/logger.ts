/**
 * Structured JSON logger for the control-plane Cloudflare Worker.
 *
 * Delegates to the shared logger with the service name bound to "control-plane".
 * All existing call sites (`createLogger("component")`) continue to work unchanged.
 */

import { createServiceLogger } from "@open-inspect/shared";

export type { Logger, CorrelationContext, LogLevel } from "@open-inspect/shared";
export { parseLogLevel } from "@open-inspect/shared";

export const createLogger = createServiceLogger("control-plane");
