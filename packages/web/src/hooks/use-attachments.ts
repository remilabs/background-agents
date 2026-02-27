import { useState, useRef, useCallback } from "react";
import type { Attachment } from "@open-inspect/shared";
import { processImageFile, MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/image-utils";

export interface UseAttachmentsReturn {
  pendingAttachments: Attachment[];
  attachmentError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
}

export function useAttachments(): UseAttachmentsReturn {
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addAttachments = useCallback(
    async (files: File[]) => {
      setAttachmentError(null);
      const remaining = MAX_ATTACHMENTS_PER_MESSAGE - pendingAttachments.length;
      if (remaining <= 0) {
        setAttachmentError(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} images per message.`);
        return;
      }

      const filesToProcess = files.slice(0, remaining);
      for (const file of filesToProcess) {
        try {
          const attachment = await processImageFile(file);
          setPendingAttachments((prev) => {
            if (prev.length >= MAX_ATTACHMENTS_PER_MESSAGE) return prev;
            return [...prev, attachment];
          });
        } catch (err) {
          setAttachmentError(err instanceof Error ? err.message : "Failed to process image.");
        }
      }
    },
    [pendingAttachments.length]
  );

  const removeAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError(null);
  }, []);

  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
    setAttachmentError(null);
  }, []);

  return {
    pendingAttachments,
    attachmentError,
    fileInputRef,
    addAttachments,
    removeAttachment,
    clearAttachments,
  };
}
