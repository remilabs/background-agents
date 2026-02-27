"use client";

import { useParams, useSearchParams } from "next/navigation";
import { mutate } from "swr";
import useSWRMutation from "swr/mutation";
import {
  Suspense,
  memo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { useSessionSocket } from "@/hooks/use-session-socket";
import { SafeMarkdown } from "@/components/safe-markdown";
import { ToolCallGroup } from "@/components/tool-call-group";
import { ComposerSlashMenu } from "@/components/composer-slash-menu";
import { useSidebarContext } from "@/components/sidebar-layout";
import { SidebarToggleIcon } from "@/components/sidebar-toggle-icon";
import {
  SessionRightSidebar,
  SessionRightSidebarContent,
} from "@/components/session-right-sidebar";
import { ActionBar } from "@/components/action-bar";
import { copyToClipboard, formatModelNameLower } from "@/lib/format";
import { SHORTCUT_LABELS } from "@/lib/keyboard-shortcuts";
import {
  filterComposerCommands,
  getComposerKeyAction,
  isLatestAutocompleteResult,
  nextAutocompleteRequestVersion,
  type ComposerAutocompleteState,
} from "@/lib/composer-autocomplete";
import { COMPOSER_COMMANDS, type ComposerCommand } from "@/lib/composer-commands";
import { replaceActiveSlashToken } from "@/lib/composer-insert";
import { getSlashTokenContext } from "@/lib/composer-slash-grammar";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  DEFAULT_MODEL,
  getDefaultReasoningEffort,
  type ModelDisplayInfo,
  type ModelCategory,
} from "@open-inspect/shared";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { ReasoningEffortPills } from "@/components/reasoning-effort-pills";
import type { SandboxEvent, Attachment } from "@open-inspect/shared";
import type { ToolCallEvent } from "@/lib/tool-formatters";
import { useAttachments } from "@/hooks/use-attachments";
import { AttachmentPreviewStrip } from "@/components/attachment-preview-strip";
import {
  generatePastedImageName,
  MAX_ATTACHMENTS_PER_MESSAGE,
  ALLOWED_MIME_TYPES,
} from "@/lib/image-utils";

/** Return the MIME type only if it's in the allowlist; default to image/png. */
function safeMimeType(mime: string | undefined): string {
  return mime && ALLOWED_MIME_TYPES.has(mime) ? mime : "image/png";
}

// Event grouping types
type EventGroup =
  | { type: "tool_group"; events: ToolCallEvent[]; id: string }
  | { type: "single"; event: SandboxEvent; id: string };

// Group consecutive tool calls of the same type
function groupEvents(events: SandboxEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  let currentToolGroup: ToolCallEvent[] = [];
  let groupIndex = 0;

  const flushToolGroup = () => {
    if (currentToolGroup.length > 0) {
      groups.push({
        type: "tool_group",
        events: [...currentToolGroup],
        id: `tool-group-${groupIndex++}`,
      });
      currentToolGroup = [];
    }
  };

  for (const event of events) {
    if (event.type === "tool_call") {
      // Check if same tool as current group
      if (currentToolGroup.length > 0 && currentToolGroup[0].tool === event.tool) {
        currentToolGroup.push(event);
      } else {
        // Flush previous group and start new one
        flushToolGroup();
        currentToolGroup = [event];
      }
    } else {
      // Flush any tool group before non-tool event
      flushToolGroup();
      const eventId =
        "messageId" in event ? event.messageId : String(event.timestamp ?? groupIndex);
      groups.push({
        type: "single",
        event,
        id: `single-${event.type}-${eventId}-${groupIndex++}`,
      });
    }
  }

  // Flush final group
  flushToolGroup();

  return groups;
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ModelOptionButton({
  model,
  isSelected,
  onSelect,
}: {
  model: ModelDisplayInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition ${
        isSelected ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <div className="flex flex-col items-start">
        <span className="font-medium">{model.name}</span>
        <span className="text-xs text-secondary-foreground">{model.description}</span>
      </div>
      {isSelected && <CheckIcon />}
    </button>
  );
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionPageContent />
    </Suspense>
  );
}

function SessionPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;

  const {
    connected,
    connecting,
    replaying,
    authError,
    connectionError,
    sessionState,
    events,
    participants,
    artifacts,
    currentParticipantId,
    isProcessing,
    lastPromptQueuedRequestId,
    loadingHistory,
    sendPrompt,
    stopExecution,
    sendTyping,
    reconnect,
    loadOlderEvents,
  } = useSessionSocket(sessionId);

  const fallbackSessionInfo = useMemo(
    () => ({
      repoOwner: searchParams.get("repoOwner") || null,
      repoName: searchParams.get("repoName") || null,
      title: searchParams.get("title") || null,
    }),
    [searchParams]
  );

  const { trigger: handleArchive } = useSWRMutation(
    `/api/sessions/${sessionId}/archive`,
    (url: string) =>
      fetch(url, { method: "POST" }).then((r) => {
        if (r.ok) mutate("/api/sessions");
        else console.error("Failed to archive session");
      }),
    { throwOnError: false }
  );

  const { trigger: handleUnarchive } = useSWRMutation(
    `/api/sessions/${sessionId}/unarchive`,
    (url: string) =>
      fetch(url, { method: "POST" }).then((r) => {
        if (r.ok) mutate("/api/sessions");
        else console.error("Failed to unarchive session");
      }),
    { throwOnError: false }
  );

  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<string | undefined>(
    getDefaultReasoningEffort(DEFAULT_MODEL)
  );
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const pendingDraftClearRef = useRef<{ requestId: string; submittedText: string } | null>(null);
  const autocompleteRequestVersionRef = useRef(0);
  const [isAwaitingPromptAck, setIsAwaitingPromptAck] = useState(false);
  const {
    pendingAttachments,
    attachmentError,
    fileInputRef,
    addAttachments,
    removeAttachment,
    clearAttachments,
  } = useAttachments();
  const [slashMenuState, setSlashMenuState] = useState<ComposerAutocompleteState>("closed");
  const [slashOptions, setSlashOptions] = useState<ComposerCommand[]>([]);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);

  const { enabledModels, enabledModelOptions } = useEnabledModels();

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    setReasoningEffort(getDefaultReasoningEffort(model));
  }, []);

  const closeSlashMenu = useCallback(() => {
    autocompleteRequestVersionRef.current = nextAutocompleteRequestVersion(
      autocompleteRequestVersionRef.current
    );
    setSlashMenuState("closed");
    setSlashOptions([]);
    setActiveSlashIndex(0);
  }, []);

  const updateSlashAutocomplete = useCallback(
    (nextPrompt: string, caretIndex: number | null) => {
      const context = getSlashTokenContext(nextPrompt, caretIndex ?? nextPrompt.length);

      if (!context || isProcessing) {
        closeSlashMenu();
        return;
      }

      setSlashMenuState("loading");
      const requestVersion = nextAutocompleteRequestVersion(autocompleteRequestVersionRef.current);
      autocompleteRequestVersionRef.current = requestVersion;

      try {
        const options = filterComposerCommands(COMPOSER_COMMANDS, context.query);

        if (!isLatestAutocompleteResult(requestVersion, autocompleteRequestVersionRef.current)) {
          return;
        }

        setSlashOptions(options);
        setActiveSlashIndex(0);
        setSlashMenuState(options.length > 0 ? "open" : "empty");
      } catch {
        if (!isLatestAutocompleteResult(requestVersion, autocompleteRequestVersionRef.current)) {
          return;
        }

        setSlashOptions([]);
        setSlashMenuState("error");
      }
    },
    [closeSlashMenu, isProcessing]
  );

  const focusComposerAt = useCallback((caretIndex: number) => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(caretIndex, caretIndex);
    });
  }, []);

  const insertSlashCommand = useCallback(
    (command: ComposerCommand) => {
      const input = inputRef.current;
      const caretIndex = input?.selectionStart ?? prompt.length;
      const context = getSlashTokenContext(prompt, caretIndex);

      if (!context) {
        closeSlashMenu();
        return;
      }

      const next = replaceActiveSlashToken({
        text: prompt,
        context,
        template: command.template,
      });

      setPrompt(next.text);
      closeSlashMenu();
      focusComposerAt(next.caretIndex);
    },
    [closeSlashMenu, focusComposerAt, prompt]
  );

  // Reset to default if the selected model is no longer enabled
  useEffect(() => {
    if (enabledModels.length > 0 && !enabledModels.includes(selectedModel)) {
      const fallback = enabledModels[0] ?? DEFAULT_MODEL;
      setSelectedModel(fallback);
      setReasoningEffort(getDefaultReasoningEffort(fallback));
    }
  }, [enabledModels, selectedModel]);

  // Sync selectedModel and reasoningEffort with session state when it loads
  useEffect(() => {
    if (sessionState?.model) {
      setSelectedModel(sessionState.model);
      setReasoningEffort(
        sessionState.reasoningEffort ?? getDefaultReasoningEffort(sessionState.model)
      );
    }
  }, [sessionState?.model, sessionState?.reasoningEffort]);

  useEffect(() => {
    if (!lastPromptQueuedRequestId) return;

    const pending = pendingDraftClearRef.current;
    if (!pending || pending.requestId !== lastPromptQueuedRequestId) {
      return;
    }

    pendingDraftClearRef.current = null;
    if (pendingAckTimeoutRef.current) {
      clearTimeout(pendingAckTimeoutRef.current);
      pendingAckTimeoutRef.current = null;
    }
    setIsAwaitingPromptAck(false);
    setPrompt((current) => (current === pending.submittedText ? "" : current));
    mutate("/api/sessions");
  }, [lastPromptQueuedRequestId]);

  useEffect(() => {
    if (!isProcessing) return;
    closeSlashMenu();
  }, [closeSlashMenu, isProcessing]);

  useEffect(() => {
    return () => {
      if (pendingAckTimeoutRef.current) {
        clearTimeout(pendingAckTimeoutRef.current);
      }
    };
  }, []);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt.trim() && pendingAttachments.length === 0) || isProcessing || isAwaitingPromptAck)
      return;

    const requestId = crypto.randomUUID();
    const attachments = pendingAttachments.length > 0 ? pendingAttachments : undefined;
    const sendOutcome = sendPrompt(
      prompt || "(image)",
      selectedModel,
      reasoningEffort,
      requestId,
      attachments
    );

    if (sendOutcome === "rejected") {
      setIsAwaitingPromptAck(false);
      return;
    }

    // Clear attachments immediately on send (they're included in the WS message)
    clearAttachments();

    pendingDraftClearRef.current = {
      requestId,
      submittedText: prompt,
    };

    setIsAwaitingPromptAck(true);
    if (pendingAckTimeoutRef.current) {
      clearTimeout(pendingAckTimeoutRef.current);
    }
    pendingAckTimeoutRef.current = setTimeout(() => {
      setIsAwaitingPromptAck(false);
    }, 10000);

    closeSlashMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent & { keyCode?: number };
    const isImeComposing =
      nativeEvent.isComposing || e.key === "Process" || nativeEvent.keyCode === 229;
    const input = inputRef.current;
    const caretIndex = input?.selectionStart ?? prompt.length;
    const hasActiveSlashToken = Boolean(getSlashTokenContext(prompt, caretIndex));
    const effectiveMenuState = hasActiveSlashToken ? slashMenuState : "closed";

    if (!hasActiveSlashToken && slashMenuState !== "closed") {
      closeSlashMenu();
    }

    const selectedCommand = slashOptions[activeSlashIndex] || slashOptions[0];
    const keyAction = getComposerKeyAction({
      key: e.key,
      shiftKey: e.shiftKey,
      isComposing: isImeComposing,
      menuState: effectiveMenuState,
      optionCount: slashOptions.length,
    });

    if (keyAction === "close_menu") {
      e.preventDefault();
      closeSlashMenu();
      return;
    }

    if (keyAction === "move_next") {
      e.preventDefault();
      setActiveSlashIndex((current) => (current + 1) % slashOptions.length);
      return;
    }

    if (keyAction === "move_prev") {
      e.preventDefault();
      setActiveSlashIndex((current) =>
        current === 0 ? slashOptions.length - 1 : Math.max(0, current - 1)
      );
      return;
    }

    if (keyAction === "select_option") {
      e.preventDefault();
      if (selectedCommand) {
        insertSlashCommand(selectedCommand);
      }
      return;
    }

    if (keyAction === "block_send") {
      e.preventDefault();
      return;
    }

    if (keyAction === "submit_prompt") {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextPrompt = e.target.value;
    setPrompt(nextPrompt);
    updateSlashAutocomplete(nextPrompt, e.target.selectionStart);

    // Send typing indicator (debounced)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping();
    }, 300);
  };

  const slashListId = "composer-slash-listbox";
  const activeSlashOption = slashOptions[activeSlashIndex] || null;
  const slashResultsAnnouncement = useMemo(() => {
    if (slashMenuState === "loading") return "Loading workflow suggestions";
    if (slashMenuState === "error") return "Unable to load workflow suggestions";
    if (slashMenuState === "empty") return "No matching workflows";
    if (slashMenuState === "open") {
      const activeText = activeSlashOption ? ` Active ${activeSlashOption.title}.` : "";
      return `${slashOptions.length} workflow suggestions available.${activeText}`;
    }
    return "";
  }, [activeSlashOption, slashMenuState, slashOptions.length]);

  return (
    <SessionContent
      sessionState={sessionState}
      connected={connected}
      connecting={connecting}
      replaying={replaying}
      authError={authError}
      connectionError={connectionError}
      reconnect={reconnect}
      participants={participants}
      events={events}
      artifacts={artifacts}
      currentParticipantId={currentParticipantId}
      messagesEndRef={messagesEndRef}
      prompt={prompt}
      isProcessing={isProcessing}
      isAwaitingPromptAck={isAwaitingPromptAck}
      selectedModel={selectedModel}
      reasoningEffort={reasoningEffort}
      modelDropdownOpen={modelDropdownOpen}
      modelDropdownRef={modelDropdownRef}
      inputRef={inputRef}
      pendingAttachments={pendingAttachments}
      attachmentError={attachmentError}
      fileInputRef={fileInputRef}
      addAttachments={addAttachments}
      removeAttachment={removeAttachment}
      handleSubmit={handleSubmit}
      handleInputChange={handleInputChange}
      handleKeyDown={handleKeyDown}
      handleSlashOptionHover={setActiveSlashIndex}
      handleSlashOptionSelect={insertSlashCommand}
      closeSlashMenu={closeSlashMenu}
      setModelDropdownOpen={setModelDropdownOpen}
      setSelectedModel={handleModelChange}
      setReasoningEffort={setReasoningEffort}
      stopExecution={stopExecution}
      handleArchive={handleArchive}
      handleUnarchive={handleUnarchive}
      loadingHistory={loadingHistory}
      loadOlderEvents={loadOlderEvents}
      modelOptions={enabledModelOptions}
      fallbackSessionInfo={fallbackSessionInfo}
      slashMenuState={slashMenuState}
      slashOptions={slashOptions}
      slashActiveIndex={activeSlashIndex}
      slashListId={slashListId}
      slashResultsAnnouncement={slashResultsAnnouncement}
    />
  );
}

function SessionContent({
  sessionState,
  connected,
  connecting,
  replaying,
  authError,
  connectionError,
  reconnect,
  participants,
  events,
  artifacts,
  currentParticipantId,
  messagesEndRef,
  prompt,
  isProcessing,
  isAwaitingPromptAck,
  selectedModel,
  reasoningEffort,
  modelDropdownOpen,
  modelDropdownRef,
  inputRef,
  pendingAttachments,
  attachmentError,
  fileInputRef,
  addAttachments,
  removeAttachment,
  handleSubmit,
  handleInputChange,
  handleKeyDown,
  handleSlashOptionHover,
  handleSlashOptionSelect,
  closeSlashMenu,
  setModelDropdownOpen,
  setSelectedModel,
  setReasoningEffort,
  stopExecution,
  handleArchive,
  handleUnarchive,
  loadingHistory,
  loadOlderEvents,
  modelOptions,
  fallbackSessionInfo,
  slashMenuState,
  slashOptions,
  slashActiveIndex,
  slashListId,
  slashResultsAnnouncement,
}: {
  sessionState: ReturnType<typeof useSessionSocket>["sessionState"];
  connected: boolean;
  connecting: boolean;
  replaying: boolean;
  authError: string | null;
  connectionError: string | null;
  reconnect: () => void;
  participants: ReturnType<typeof useSessionSocket>["participants"];
  events: ReturnType<typeof useSessionSocket>["events"];
  artifacts: ReturnType<typeof useSessionSocket>["artifacts"];
  currentParticipantId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  prompt: string;
  isProcessing: boolean;
  isAwaitingPromptAck: boolean;
  selectedModel: string;
  reasoningEffort: string | undefined;
  modelDropdownOpen: boolean;
  modelDropdownRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  pendingAttachments: Attachment[];
  attachmentError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (index: number) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSlashOptionHover: (index: number) => void;
  handleSlashOptionSelect: (command: ComposerCommand) => void;
  closeSlashMenu: () => void;
  setModelDropdownOpen: (open: boolean) => void;
  setSelectedModel: (model: string) => void;
  setReasoningEffort: (value: string | undefined) => void;
  stopExecution: () => void;
  handleArchive: () => void | Promise<void>;
  handleUnarchive: () => void | Promise<void>;
  loadingHistory: boolean;
  loadOlderEvents: () => void;
  modelOptions: ModelCategory[];
  slashMenuState: ComposerAutocompleteState;
  slashOptions: ComposerCommand[];
  slashActiveIndex: number;
  slashListId: string;
  slashResultsAnnouncement: string;
  fallbackSessionInfo: {
    repoOwner: string | null;
    repoName: string | null;
    title: string | null;
  };
}) {
  const { isOpen, toggle } = useSidebarContext();
  const isBelowLg = useMediaQuery("(max-width: 1023px)");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetDragYRef = useRef(0);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const sheetTouchStartYRef = useRef<number | null>(null);

  // Scroll pagination refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const isPrependingRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const isNearBottomRef = useRef(true);

  const closeDetails = useCallback(() => {
    setIsDetailsOpen(false);
    setSheetDragY(0);
    sheetDragYRef.current = 0;
    detailsButtonRef.current?.focus();
  }, []);

  const toggleDetails = useCallback(() => {
    setIsDetailsOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSheetDragY(0);
        sheetDragYRef.current = 0;
      }
      return next;
    });
  }, []);

  const handleSheetTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const startY = event.touches[0]?.clientY;
    sheetTouchStartYRef.current = startY ?? null;
  }, []);

  const handleSheetTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const startY = sheetTouchStartYRef.current;
    const currentY = event.touches[0]?.clientY;

    if (startY === null || currentY === undefined) return;

    const delta = currentY - startY;
    if (delta > 0) {
      const nextDragY = Math.min(delta, 180);
      sheetDragYRef.current = nextDragY;
      setSheetDragY(nextDragY);
    } else {
      sheetDragYRef.current = 0;
      setSheetDragY(0);
    }
  }, []);

  const handleSheetTouchEnd = useCallback(() => {
    if (sheetDragYRef.current > 100) {
      closeDetails();
      sheetTouchStartYRef.current = null;
      return;
    }

    sheetDragYRef.current = 0;
    setSheetDragY(0);
    sheetTouchStartYRef.current = null;
  }, [closeDetails]);

  useEffect(() => {
    if (isBelowLg) return;
    setIsDetailsOpen(false);
    setSheetDragY(0);
    sheetDragYRef.current = 0;
  }, [isBelowLg]);

  useEffect(() => {
    if (!isDetailsOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDetails();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeDetails, isDetailsOpen]);

  useEffect(() => {
    if (!isDetailsOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailsOpen]);

  // Track user scroll
  const handleScroll = useCallback(() => {
    hasScrolledRef.current = true;
    const el = scrollContainerRef.current;
    if (el) {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    }
  }, []);

  // IntersectionObserver to trigger loading older events
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          hasScrolledRef.current &&
          container.scrollHeight > container.clientHeight
        ) {
          // Capture scroll height BEFORE triggering load
          prevScrollHeightRef.current = container.scrollHeight;
          isPrependingRef.current = true;
          loadOlderEvents();
        }
      },
      { root: container, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlderEvents]);

  // Maintain scroll position when older events are prepended
  useLayoutEffect(() => {
    if (isPrependingRef.current && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      isPrependingRef.current = false;
    }
  }, [events]);

  // Auto-scroll to bottom only when near bottom (not when prepending older history)
  useEffect(() => {
    if (isNearBottomRef.current && !isPrependingRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [events, messagesEndRef]);

  // Incremental deduplication and grouping of events.
  // Tracks processing state across renders via refs so only new events are scanned.
  const dedupStateRef = useRef<{
    /** Source array identity from last computation */
    sourceEvents: SandboxEvent[] | null;
    /** Number of source events already processed */
    processedCount: number;
    /** Deduplication lookup maps (indices into filteredEvents) */
    seenToolCalls: Map<string, number>;
    seenCompletions: Set<string>;
    seenTokens: Map<string, number>;
    /** Accumulated deduplicated events */
    filteredEvents: (SandboxEvent | null)[];
    /** Cached final result */
    grouped: EventGroup[];
  }>({
    sourceEvents: null,
    processedCount: 0,
    seenToolCalls: new Map(),
    seenCompletions: new Set(),
    seenTokens: new Map(),
    filteredEvents: [],
    grouped: [],
  });

  const groupedEvents = useMemo(() => {
    const state = dedupStateRef.current;

    // If the events array identity changed (full replacement, e.g. reconnect / history prepend),
    // reset all incremental state and reprocess from scratch.
    if (state.sourceEvents !== events) {
      state.sourceEvents = events;
      state.processedCount = 0;
      state.seenToolCalls = new Map();
      state.seenCompletions = new Set();
      state.seenTokens = new Map();
      state.filteredEvents = [];
    }

    const startIdx = state.processedCount;
    if (startIdx >= events.length && state.grouped.length > 0) {
      return state.grouped;
    }

    const changed = startIdx < events.length;

    for (let i = startIdx; i < events.length; i++) {
      const event = events[i] as SandboxEvent;
      if (event.type === "tool_call" && event.callId) {
        const existingIdx = state.seenToolCalls.get(event.callId);
        if (existingIdx !== undefined) {
          state.filteredEvents[existingIdx] = event;
        } else {
          state.seenToolCalls.set(event.callId, state.filteredEvents.length);
          state.filteredEvents.push(event);
        }
      } else if (event.type === "execution_complete" && event.messageId) {
        if (!state.seenCompletions.has(event.messageId)) {
          state.seenCompletions.add(event.messageId);
          state.filteredEvents.push(event);
        }
      } else if (event.type === "token" && event.messageId) {
        const existingIdx = state.seenTokens.get(event.messageId);
        if (existingIdx !== undefined) {
          state.filteredEvents[existingIdx] = null;
        }
        state.seenTokens.set(event.messageId, state.filteredEvents.length);
        state.filteredEvents.push(event);
      } else {
        state.filteredEvents.push(event);
      }
    }

    state.processedCount = events.length;

    if (changed) {
      state.grouped = groupEvents(state.filteredEvents.filter(Boolean) as SandboxEvent[]);
    }

    return state.grouped;
  }, [events]);

  const resolvedRepoOwner = sessionState?.repoOwner ?? fallbackSessionInfo.repoOwner;
  const resolvedRepoName = sessionState?.repoName ?? fallbackSessionInfo.repoName;
  const fallbackRepoLabel =
    resolvedRepoOwner && resolvedRepoName
      ? `${resolvedRepoOwner}/${resolvedRepoName}`
      : "Loading session...";
  const resolvedTitle = sessionState?.title || fallbackSessionInfo.title || fallbackRepoLabel;
  const showTimelineSkeleton = events.length === 0 && (connecting || replaying);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="border-b border-border-muted flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isOpen && (
              <button
                onClick={toggle}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition"
                title={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
                aria-label={`Open sidebar (${SHORTCUT_LABELS.TOGGLE_SIDEBAR})`}
              >
                <SidebarToggleIcon />
              </button>
            )}
            <div>
              <h1 className="font-medium text-foreground">{resolvedTitle}</h1>
              <p className="text-sm text-muted-foreground">{fallbackRepoLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              ref={detailsButtonRef}
              type="button"
              onClick={toggleDetails}
              className="lg:hidden px-3 py-1.5 text-sm text-muted-foreground border border-border-muted hover:text-foreground hover:bg-muted transition"
              aria-label="Toggle session details"
              aria-controls="session-details-dialog"
              aria-expanded={isDetailsOpen}
            >
              Details
            </button>
            {/* Mobile: single combined status dot */}
            <div className="md:hidden">
              <CombinedStatusDot
                connected={connected}
                connecting={connecting}
                sandboxStatus={sessionState?.sandboxStatus}
              />
            </div>
            {/* Desktop: full status indicators */}
            <div className="hidden md:contents">
              <ConnectionStatus connected={connected} connecting={connecting} />
              <SandboxStatus status={sessionState?.sandboxStatus} />
              <ParticipantsList participants={participants} />
            </div>
          </div>
        </div>
      </header>

      {/* Connection error banner */}
      {(authError || connectionError) && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-400">{authError || connectionError}</p>
          <button
            onClick={reconnect}
            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Event timeline */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden p-4"
        >
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Scroll sentinel for loading older history */}
            <div ref={topSentinelRef} className="h-1" />
            {loadingHistory && (
              <div className="text-center text-muted-foreground text-sm py-2">Loading...</div>
            )}
            {showTimelineSkeleton ? (
              <TimelineSkeleton />
            ) : (
              groupedEvents.map((group) =>
                group.type === "tool_group" ? (
                  <ToolCallGroup key={group.id} events={group.events} groupId={group.id} />
                ) : (
                  <EventItem
                    key={group.id}
                    event={group.event}
                    currentParticipantId={currentParticipantId}
                  />
                )
              )
            )}
            {isProcessing && <ThinkingIndicator />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Right sidebar */}
        <SessionRightSidebar
          sessionState={sessionState}
          participants={participants}
          events={events}
          artifacts={artifacts}
        />
      </main>

      {isBelowLg && (
        <div
          className={`fixed inset-0 z-50 lg:hidden ${isDetailsOpen ? "" : "pointer-events-none"}`}
        >
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
              isDetailsOpen ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeDetails}
          />

          {isPhone ? (
            <div
              id="session-details-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Session details"
              className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-background border-t border-border-muted shadow-xl flex flex-col"
              style={{
                transform: isDetailsOpen ? `translateY(${sheetDragY}px)` : "translateY(100%)",
                transition: sheetDragY > 0 ? "none" : "transform 200ms ease-in-out",
              }}
            >
              <div
                className="px-4 pt-3 pb-2 border-b border-border-muted"
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
                onTouchCancel={handleSheetTouchEnd}
              >
                <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted" />
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-foreground">Session details</h2>
                  <button
                    type="button"
                    onClick={closeDetails}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto">
                <SessionRightSidebarContent
                  sessionState={sessionState}
                  participants={participants}
                  events={events}
                  artifacts={artifacts}
                />
              </div>
            </div>
          ) : (
            <div
              id="session-details-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Session details"
              className="absolute inset-y-0 right-0 w-80 max-w-[85vw] bg-background border-l border-border-muted shadow-xl flex flex-col transition-transform duration-200 ease-in-out"
              style={{ transform: isDetailsOpen ? "translateX(0)" : "translateX(100%)" }}
            >
              <div className="px-4 py-3 border-b border-border-muted flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">Session details</h2>
                <button
                  type="button"
                  onClick={closeDetails}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SessionRightSidebarContent
                  sessionState={sessionState}
                  participants={participants}
                  events={events}
                  artifacts={artifacts}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <footer className="border-t border-border-muted flex-shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto p-4 pb-6"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer.files).filter((f) =>
              ALLOWED_MIME_TYPES.has(f.type)
            );
            if (files.length > 0) addAttachments(files);
          }}
        >
          {/* Hidden file input for image picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) addAttachments(files);
              e.target.value = ""; // Reset so same file can be re-selected
            }}
          />

          {/* Action bar above input */}
          <div className="mb-3">
            <ActionBar
              sessionId={sessionState?.id || ""}
              sessionStatus={sessionState?.status || ""}
              artifacts={artifacts}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
            />
          </div>

          {/* Input container */}
          <div className="border border-border bg-input">
            <AttachmentPreviewStrip
              attachments={pendingAttachments}
              error={attachmentError}
              onRemove={removeAttachment}
            />

            {/* Text input area with floating send button */}
            <div className="relative">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={closeSlashMenu}
                onPaste={(e) => {
                  const items = Array.from(e.clipboardData.items);
                  const imageItems = items.filter(
                    (item) => item.kind === "file" && ALLOWED_MIME_TYPES.has(item.type)
                  );
                  if (imageItems.length > 0) {
                    e.preventDefault();
                    const files = imageItems
                      .map((item) => item.getAsFile())
                      .filter((f): f is File => f !== null)
                      .map((f) => {
                        // Pasted files have no name, generate one
                        if (!f.name || f.name === "image.png") {
                          const name = generatePastedImageName(f.type);
                          return new File([f], name, { type: f.type });
                        }
                        return f;
                      });
                    addAttachments(files);
                  }
                }}
                placeholder={isProcessing ? "Type your next message..." : "Ask or build anything"}
                className="w-full resize-none bg-transparent px-4 pt-4 pb-12 focus:outline-none text-foreground placeholder:text-secondary-foreground"
                rows={3}
                aria-controls={slashMenuState !== "closed" ? slashListId : undefined}
                aria-expanded={slashMenuState !== "closed"}
                aria-activedescendant={
                  slashMenuState === "open" && slashOptions[slashActiveIndex]
                    ? `${slashListId}-option-${slashActiveIndex}`
                    : undefined
                }
              />
              <ComposerSlashMenu
                listId={slashListId}
                state={slashMenuState}
                options={slashOptions}
                activeIndex={slashActiveIndex}
                onHover={handleSlashOptionHover}
                onSelect={handleSlashOptionSelect}
              />
              <div className="sr-only" aria-live="polite" aria-atomic="true">
                {slashResultsAnnouncement}
              </div>
              {/* Floating action buttons */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {(isProcessing || isAwaitingPromptAck) && prompt.trim() && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {isProcessing ? "Waiting..." : "Queueing..."}
                  </span>
                )}
                {isProcessing && (
                  <button
                    type="button"
                    onClick={stopExecution}
                    className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    title="Stop"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" strokeWidth={2} />
                    </svg>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={
                    (!prompt.trim() && pendingAttachments.length === 0) ||
                    isProcessing ||
                    isAwaitingPromptAck
                  }
                  className="p-2 text-secondary-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition"
                  title={
                    isAwaitingPromptAck
                      ? "Waiting for queue acknowledgement"
                      : isProcessing && prompt.trim()
                        ? "Wait for execution to complete"
                        : `Send (${SHORTCUT_LABELS.SEND_PROMPT})`
                  }
                  aria-label={
                    isAwaitingPromptAck
                      ? "Waiting for queue acknowledgement"
                      : isProcessing && prompt.trim()
                        ? "Wait for execution to complete"
                        : `Send (${SHORTCUT_LABELS.SEND_PROMPT})`
                  }
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Footer row with upload, model selector, reasoning pills, and agent label */}
            <div className="flex flex-col gap-2 px-4 py-2 border-t border-border-muted sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              {/* Left side - Upload + Model selector + Reasoning pills */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0">
                {/* Image upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={
                    isProcessing || pendingAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE
                  }
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                  title="Attach image"
                  aria-label="Attach image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                </button>
                <div className="relative min-w-0" ref={modelDropdownRef}>
                  <button
                    type="button"
                    onClick={() => !isProcessing && setModelDropdownOpen(!modelDropdownOpen)}
                    disabled={isProcessing}
                    className="flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                    <span className="truncate max-w-[9rem] sm:max-w-none">
                      {formatModelNameLower(selectedModel)}
                    </span>
                  </button>

                  {/* Dropdown menu */}
                  {modelDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-background shadow-lg border border-border py-1 z-50">
                      {modelOptions.map((group, groupIdx) => (
                        <div key={group.category}>
                          <div
                            className={`px-3 py-1.5 text-xs font-medium text-secondary-foreground uppercase tracking-wider ${
                              groupIdx > 0 ? "border-t border-border-muted mt-1" : ""
                            }`}
                          >
                            {group.category}
                          </div>
                          {group.models.map((model) => (
                            <ModelOptionButton
                              key={model.id}
                              model={model}
                              isSelected={selectedModel === model.id}
                              onSelect={() => {
                                setSelectedModel(model.id);
                                setModelDropdownOpen(false);
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reasoning effort pills */}
                <ReasoningEffortPills
                  selectedModel={selectedModel}
                  reasoningEffort={reasoningEffort}
                  onSelect={setReasoningEffort}
                  disabled={isProcessing}
                />
              </div>

              {/* Right side - Agent label */}
              <span className="hidden sm:inline text-sm text-muted-foreground">build agent</span>
            </div>
          </div>
        </form>
      </footer>
    </div>
  );
}

function ConnectionStatus({ connected, connecting }: { connected: boolean; connecting: boolean }) {
  if (connecting) {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-500">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        Connecting...
      </span>
    );
  }

  if (connected) {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <span className="w-2 h-2 rounded-full bg-success" />
        Connected
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-500">
      <span className="w-2 h-2 rounded-full bg-red-500" />
      Disconnected
    </span>
  );
}

function SandboxStatus({ status }: { status?: string }) {
  if (!status) return null;

  const colors: Record<string, string> = {
    pending: "text-muted-foreground",
    warming: "text-yellow-600 dark:text-yellow-500",
    syncing: "text-accent",
    ready: "text-success",
    running: "text-accent",
    stopped: "text-muted-foreground",
    failed: "text-red-600 dark:text-red-500",
  };

  return <span className={`text-xs ${colors[status] || colors.pending}`}>Sandbox: {status}</span>;
}

function CombinedStatusDot({
  connected,
  connecting,
  sandboxStatus,
}: {
  connected: boolean;
  connecting: boolean;
  sandboxStatus?: string;
}) {
  let color: string;
  let pulse = false;
  let label: string;

  if (!connected && !connecting) {
    color = "bg-red-500";
    label = "Disconnected";
  } else if (connecting) {
    color = "bg-yellow-500";
    pulse = true;
    label = "Connecting...";
  } else if (sandboxStatus === "failed") {
    color = "bg-red-500";
    label = `Connected · Sandbox: ${sandboxStatus}`;
  } else if (["pending", "warming", "syncing"].includes(sandboxStatus || "")) {
    color = "bg-yellow-500";
    label = `Connected · Sandbox: ${sandboxStatus}`;
  } else {
    color = "bg-success";
    label = sandboxStatus ? `Connected · Sandbox: ${sandboxStatus}` : "Connected";
  }

  return (
    <span title={label} className="flex items-center">
      <span className={`w-2.5 h-2.5 rounded-full ${color}${pulse ? " animate-pulse" : ""}`} />
    </span>
  );
}

function ThinkingIndicator() {
  return (
    <div className="bg-card p-4 flex items-center gap-2">
      <span className="inline-block w-2 h-2 bg-accent rounded-full animate-pulse" />
      <span className="text-sm text-muted-foreground">Thinking...</span>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3 py-2 animate-pulse">
      <div className="bg-card p-4 space-y-2">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-5/6 bg-muted rounded" />
      </div>
      <div className="bg-accent-muted p-4 ml-8 space-y-2">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-3 w-4/5 bg-muted rounded" />
      </div>
      <div className="bg-card p-4 space-y-2">
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="h-3 w-3/4 bg-muted rounded" />
      </div>
    </div>
  );
}

function ParticipantsList({
  participants,
}: {
  participants: { userId: string; name: string; status: string }[];
}) {
  if (participants.length === 0) return null;

  // Deduplicate participants by userId (same user may have multiple connections)
  const uniqueParticipants = Array.from(new Map(participants.map((p) => [p.userId, p])).values());

  return (
    <div className="flex -space-x-2">
      {uniqueParticipants.slice(0, 3).map((p) => (
        <div
          key={p.userId}
          className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-xs font-medium text-foreground border-2 border-white"
          title={p.name}
        >
          {p.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {uniqueParticipants.length > 3 && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground border-2 border-white">
          +{uniqueParticipants.length - 3}
        </div>
      )}
    </div>
  );
}

const EventItem = memo(function EventItem({
  event,
  currentParticipantId,
}: {
  event: SandboxEvent;
  currentParticipantId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ts = "timestamp" in event ? event.timestamp : undefined;
  const time = ts ? new Date(ts * 1000).toLocaleTimeString() : "";

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyContent = useCallback(async (content: string) => {
    const success = await copyToClipboard(content);
    if (!success) return;

    setCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, 1500);
  }, []);

  switch (event.type) {
    case "user_message": {
      // Display user's prompt with correct author attribution
      if (!event.content) return null;
      const messageContent = event.content;

      // Determine if this message is from the current user
      const isCurrentUser =
        event.author?.participantId && currentParticipantId
          ? event.author.participantId === currentParticipantId
          : !event.author; // Messages without author are assumed to be from current user (local)

      const authorName = isCurrentUser ? "You" : event.author?.name || "Unknown User";

      return (
        <div className="group bg-accent-muted p-4 ml-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {!isCurrentUser && event.author?.avatar && (
                <img src={event.author.avatar} alt={authorName} className="w-5 h-5 rounded-full" />
              )}
              <span className="text-xs text-accent">{authorName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleCopyContent(messageContent)}
                className="p-1 text-secondary-foreground hover:text-foreground hover:bg-muted/60 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-colors"
                title={copied ? "Copied" : "Copy markdown"}
                aria-label={copied ? "Copied" : "Copy markdown"}
              >
                {copied ? (
                  <CopyCheckIcon className="w-3.5 h-3.5" />
                ) : (
                  <CopyIcon className="w-3.5 h-3.5" />
                )}
              </button>
              <span className="text-xs text-secondary-foreground">{time}</span>
            </div>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-foreground">{messageContent}</pre>
          {event.attachments && event.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {event.attachments.map((att, i) =>
                att.content ? (
                  <img
                    key={i}
                    src={`data:${safeMimeType(att.mimeType)};base64,${att.content}`}
                    alt={att.name}
                    className="max-w-xs max-h-48 rounded border border-border object-contain"
                  />
                ) : (
                  <span key={i} className="text-xs text-muted-foreground">
                    {att.name}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      );
    }

    case "token": {
      // Display the model's text response with safe markdown rendering
      if (!event.content) return null;
      const messageContent = event.content;
      return (
        <div className="group bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Assistant</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleCopyContent(messageContent)}
                className="p-1 text-secondary-foreground hover:text-foreground hover:bg-muted opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-colors"
                title={copied ? "Copied" : "Copy markdown"}
                aria-label={copied ? "Copied" : "Copy markdown"}
              >
                {copied ? (
                  <CopyCheckIcon className="w-3.5 h-3.5" />
                ) : (
                  <CopyIcon className="w-3.5 h-3.5" />
                )}
              </button>
              <span className="text-xs text-secondary-foreground">{time}</span>
            </div>
          </div>
          <SafeMarkdown content={messageContent} className="text-sm" />
        </div>
      );
    }

    case "tool_call":
      // Tool calls are handled by ToolCallGroup component
      return null;

    case "tool_result":
      // Tool results are now shown inline with tool calls
      // Only show standalone results if they're errors
      if (!event.error) return null;
      return (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="truncate">{event.error}</span>
          <span className="text-xs text-secondary-foreground ml-auto">{time}</span>
        </div>
      );

    case "git_sync":
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-accent" />
          Git sync: {event.status}
          <span className="text-xs">{time}</span>
        </div>
      );

    case "error":
      return (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Error{event.error ? `: ${event.error}` : ""}
          <span className="text-xs text-secondary-foreground">{time}</span>
        </div>
      );

    case "execution_complete":
      if (event.success === false) {
        return (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Execution failed{event.error ? `: ${event.error}` : ""}
            <span className="text-xs text-secondary-foreground">{time}</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-sm text-success">
          <span className="w-2 h-2 rounded-full bg-success" />
          Execution complete
          <span className="text-xs text-secondary-foreground">{time}</span>
        </div>
      );

    default:
      return null;
  }
});

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="9" y="9" width="11" height="11" rx="2" ry="2" strokeWidth={2} />
      <rect x="4" y="4" width="11" height="11" rx="2" ry="2" strokeWidth={2} />
    </svg>
  );
}

function CopyCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
