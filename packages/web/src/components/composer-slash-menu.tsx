"use client";

import type { ComposerCommand } from "@/lib/composer-commands";
import type { ComposerAutocompleteState } from "@/lib/composer-autocomplete";

interface ComposerSlashMenuProps {
  listId: string;
  state: ComposerAutocompleteState;
  options: ComposerCommand[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (command: ComposerCommand) => void;
}

export function ComposerSlashMenu({
  listId,
  state,
  options,
  activeIndex,
  onHover,
  onSelect,
}: ComposerSlashMenuProps) {
  if (state === "closed") return null;

  if (state === "loading" || state === "empty" || state === "error") {
    const message =
      state === "loading"
        ? "Loading workflows..."
        : state === "empty"
          ? "No matching workflows"
          : "Unable to load workflows";

    return (
      <div
        id={listId}
        role="listbox"
        aria-label="Composer workflows"
        className="absolute left-3 right-3 bottom-14 z-20 border border-border bg-background shadow-lg px-3 py-2"
      >
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Composer workflows"
      className="absolute left-3 right-3 bottom-14 z-20 border border-border bg-background shadow-lg py-1"
    >
      {options.map((command, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={command.id}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={active}
            type="button"
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(command);
            }}
            className={`w-full px-3 py-2 text-left transition ${
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-secondary-foreground">
                /{command.command}
              </span>
              <span className="text-sm font-medium">{command.title}</span>
            </div>
            <p className="mt-0.5 text-xs text-secondary-foreground">{command.description}</p>
          </button>
        );
      })}
    </div>
  );
}
