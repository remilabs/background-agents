import type { Attachment } from "@open-inspect/shared";
import { ALLOWED_MIME_TYPES } from "@/lib/image-utils";

function safeMimeType(mime: string | undefined): string {
  return mime && ALLOWED_MIME_TYPES.has(mime) ? mime : "image/png";
}

interface AttachmentPreviewStripProps {
  attachments: Attachment[];
  error: string | null;
  onRemove: (index: number) => void;
}

export function AttachmentPreviewStrip({
  attachments,
  error,
  onRemove,
}: AttachmentPreviewStripProps) {
  return (
    <>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {attachments.map((att, i) => (
            <div key={i} className="relative group/thumb">
              <img
                src={`data:${safeMimeType(att.mimeType)};base64,${att.content}`}
                alt={att.name}
                className="w-16 h-16 object-cover rounded border border-border"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-background border border-border rounded-full flex items-center justify-center text-secondary-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                aria-label={`Remove ${att.name}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="px-4 pt-2 text-xs text-red-500">{error}</div>}
    </>
  );
}
