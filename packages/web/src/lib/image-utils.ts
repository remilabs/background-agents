/**
 * Client-side image processing utilities for chat image upload.
 *
 * Handles resize, compression, and validation before sending images
 * over the WebSocket connection (1 MB limit on Cloudflare Workers).
 */

import type { Attachment } from "@open-inspect/shared";

// ── Constants ──

/** Anthropic's recommended max dimension for vision inputs. */
export const MAX_IMAGE_DIMENSION = 1568;

/** Max base64 size per attachment (~560 KB binary). */
export const MAX_ATTACHMENT_SIZE_BYTES = 768 * 1024;

/** Max attachments per message (1 to fit under Cloudflare Workers 1 MB WS frame limit). */
export const MAX_ATTACHMENTS_PER_MESSAGE = 1;

/** Allowed MIME types for image uploads. */
export const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Magic byte signatures for allowed image types. */
const MAGIC_BYTES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
];

// ── Validation ──

/**
 * Validate image type by checking magic bytes of the file content.
 * More reliable than trusting `file.type` which can be spoofed.
 */
export async function validateImageType(file: File): Promise<boolean> {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  return MAGIC_BYTES.some(({ bytes: magic }) => magic.every((byte, i) => bytes[i] === byte));
}

/**
 * Detect MIME type from magic bytes. Returns null if unrecognized.
 */
async function detectMimeType(file: File): Promise<string | null> {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Special case: WebP has RIFF header + "WEBP" at offset 8
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  for (const { mime, bytes: magic } of MAGIC_BYTES) {
    if (mime === "image/webp") continue; // Handled above
    if (magic.every((byte, i) => bytes[i] === byte)) {
      return mime;
    }
  }

  return null;
}

// ── Resize & Compress ──

/**
 * Load an image from a File/Blob into an HTMLImageElement.
 */
function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

/**
 * Resize and compress an image file for upload.
 *
 * - Scales down to `maxDimension` on the longest side (default 1568px)
 * - Uses JPEG at 85% quality for photos, keeps PNG for screenshots
 * - Returns base64 data URL content (without the `data:...;base64,` prefix)
 */
export async function resizeAndCompress(
  file: File,
  maxDimension = MAX_IMAGE_DIMENSION,
  maxSizeBytes = MAX_ATTACHMENT_SIZE_BYTES
): Promise<{ base64: string; mimeType: string }> {
  const detectedMime = await detectMimeType(file);
  if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
    throw new Error(`Unsupported image type: ${file.type || "unknown"}`);
  }

  // GIFs: don't resize (would lose animation), just validate size
  if (detectedMime === "image/gif") {
    const base64 = await fileToBase64(file);
    if (base64.length > maxSizeBytes) {
      throw new Error("GIF is too large. Maximum size is ~560 KB.");
    }
    return { base64, mimeType: "image/gif" };
  }

  const img = await loadImage(file);
  const { width, height } = img;

  // Calculate scaled dimensions
  let targetWidth = width;
  let targetHeight = height;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    targetWidth = Math.round(width * scale);
    targetHeight = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Choose output format: keep PNG for screenshots (likely has text/sharp edges)
  // Use JPEG for photos (better compression)
  const outputMime = detectedMime === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputMime === "image/jpeg" ? 0.85 : undefined;

  let dataUrl = canvas.toDataURL(outputMime, quality);
  let base64 = dataUrl.split(",")[1];

  // If PNG is too large, fall back to JPEG
  if (outputMime === "image/png" && base64.length > maxSizeBytes) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    base64 = dataUrl.split(",")[1];
    return { base64, mimeType: "image/jpeg" };
  }

  // If still too large, reduce quality progressively
  if (base64.length > maxSizeBytes && outputMime === "image/jpeg") {
    for (const q of [0.7, 0.5, 0.3]) {
      dataUrl = canvas.toDataURL("image/jpeg", q);
      base64 = dataUrl.split(",")[1];
      if (base64.length <= maxSizeBytes) break;
    }
  }

  if (base64.length > maxSizeBytes) {
    throw new Error("Image is too large even after compression. Try a smaller image.");
  }

  const finalMime = dataUrl.startsWith("data:image/png") ? "image/png" : "image/jpeg";
  return { base64, mimeType: finalMime };
}

// ── Helpers ──

/**
 * Convert a File to base64 string (without data URL prefix).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Process a File into an Attachment ready for sending.
 * Validates, resizes, and compresses the image.
 */
export async function processImageFile(file: File): Promise<Attachment> {
  const isValid = await validateImageType(file);
  if (!isValid) {
    throw new Error(
      `"${file.name}" is not a supported image type. Supported: PNG, JPEG, GIF, WebP.`
    );
  }

  const { base64, mimeType } = await resizeAndCompress(file);

  return {
    type: "image",
    name: file.name || `image-${Date.now()}.${mimeType.split("/")[1]}`,
    content: base64,
    mimeType,
  };
}

/**
 * Generate a filename for a pasted image (no original name).
 */
export function generatePastedImageName(mimeType: string): string {
  const ext = mimeType.split("/")[1] || "png";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `paste-${timestamp}.${ext}`;
}
