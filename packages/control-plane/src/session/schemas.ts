/**
 * Shared Zod schemas for attachment validation.
 *
 * Single source of truth for attachment constraints — used by both
 * the HTTP router (PromptSchema) and the Durable Object (ClientMessageSchema,
 * EnqueuePromptSchema).
 */

import { z } from "zod";

/** Allowed image MIME types for attachments. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

/** Zod schema for a single attachment with server-side constraints. */
export const AttachmentSchema = z.object({
  type: z.enum(["file", "image", "url"]),
  name: z.string().max(255),
  url: z.string().optional(),
  content: z.string().max(1_048_576).optional(), // ~1 MB base64 limit
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES).optional(),
});

/**
 * Max attachments per message. Set to 1 to fit under the Cloudflare Workers
 * 1 MB WebSocket frame limit. Multi-image support requires R2 upload.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 1;

/** Optional attachment array with max count enforced server-side. */
export const AttachmentsFieldSchema = z
  .array(AttachmentSchema)
  .max(MAX_ATTACHMENTS_PER_MESSAGE)
  .optional();
