/**
 * Structured JSON logger for the control-plane Cloudflare Worker.
 *
 * Delegates to the shared logger with the service name bound to "control-plane".
 * All existing call sites (`createLogger("component")`) continue to work unchanged.
 */

import { createServiceLogger } from "@open-inspect/shared";

export type { Logger, LogLevel } from "@open-inspect/shared";
export { parseLogLevel } from "@open-inspect/shared";

export const createLogger = createServiceLogger("control-plane");

/**
 * Correlation context propagated through request headers.
 * Used to trace a request across service boundaries.
 */
export interface CorrelationContext {
  /** End-to-end trace ID (UUID), propagated via x-trace-id header */
  trace_id: string;
  /** Per-hop request ID (short UUID), propagated via x-request-id header */
  request_id: string;
  /** Optional session ID for deeper correlation in downstream services. */
  session_id?: string;
  /** Optional sandbox ID for sandbox-scoped operations. */
  sandbox_id?: string;
}
