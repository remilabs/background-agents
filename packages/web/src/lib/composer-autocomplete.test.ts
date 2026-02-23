import { describe, expect, it } from "vitest";
import { COMPOSER_COMMANDS } from "./composer-commands";
import {
  filterComposerCommands,
  getComposerKeyAction,
  isLatestAutocompleteResult,
  nextAutocompleteRequestVersion,
} from "./composer-autocomplete";
import { appendTemplateToComposer, replaceActiveSlashToken } from "./composer-insert";
import { getSlashTokenContext } from "./composer-slash-grammar";

describe("getSlashTokenContext", () => {
  it("matches slash token at start of composer", () => {
    const context = getSlashTokenContext("/rev", 4);
    expect(context).toEqual({ start: 0, end: 4, query: "rev", token: "/rev" });
  });

  it("matches slash token after opening punctuation", () => {
    const context = getSlashTokenContext("Please run (/rev)", 16);
    expect(context).toEqual({ start: 12, end: 16, query: "rev", token: "/rev" });
  });

  it("ignores URL and path-like slashes", () => {
    expect(getSlashTokenContext("https://example.com", 8)).toBeNull();
    expect(getSlashTokenContext("src/foo/bar", 7)).toBeNull();
  });
});

describe("composer insert helpers", () => {
  it("replaces only the active slash token", () => {
    const context = getSlashTokenContext("please run /rev now", 15);
    expect(context).not.toBeNull();

    const result = replaceActiveSlashToken({
      text: "please run /rev now",
      context: context!,
      template: "Run /technical_review and summarize blockers.",
    });

    expect(result.text).toBe("please run Run /technical_review and summarize blockers. now");
    expect(result.caretIndex).toBe(56);
  });

  it("appends template with spacing when prompt has existing content", () => {
    const result = appendTemplateToComposer({ text: "Current draft", template: "Next step" });
    expect(result.text).toBe("Current draft\n\nNext step");
    expect(result.caretIndex).toBe(result.text.length);
  });
});

describe("autocomplete helpers", () => {
  it("filters commands by query", () => {
    const results = filterComposerCommands(COMPOSER_COMMANDS, "rev");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.command).toBe("review");
  });

  it("applies only the latest request version", () => {
    const latest = nextAutocompleteRequestVersion(3);
    expect(latest).toBe(4);
    expect(isLatestAutocompleteResult(4, latest)).toBe(true);
    expect(isLatestAutocompleteResult(3, latest)).toBe(false);
  });
});

describe("getComposerKeyAction", () => {
  it("keeps Enter behavior when menu is closed", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        menuState: "closed",
        optionCount: 0,
      })
    ).toBe("submit_prompt");

    expect(
      getComposerKeyAction({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        menuState: "closed",
        optionCount: 0,
      })
    ).toBe("none");
  });

  it("selects slash option on Enter and Tab when selectable", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        menuState: "open",
        optionCount: 3,
      })
    ).toBe("select_option");

    expect(
      getComposerKeyAction({
        key: "Tab",
        shiftKey: false,
        isComposing: false,
        menuState: "open",
        optionCount: 3,
      })
    ).toBe("select_option");
  });

  it("blocks send when menu is open without selectable options", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        menuState: "loading",
        optionCount: 0,
      })
    ).toBe("block_send");

    expect(
      getComposerKeyAction({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        menuState: "empty",
        optionCount: 0,
      })
    ).toBe("block_send");
  });

  it("moves active option with arrow keys", () => {
    expect(
      getComposerKeyAction({
        key: "ArrowDown",
        shiftKey: false,
        isComposing: false,
        menuState: "open",
        optionCount: 2,
      })
    ).toBe("move_next");

    expect(
      getComposerKeyAction({
        key: "ArrowUp",
        shiftKey: false,
        isComposing: false,
        menuState: "open",
        optionCount: 2,
      })
    ).toBe("move_prev");
  });

  it("suppresses select and send during IME composition", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        menuState: "open",
        optionCount: 2,
      })
    ).toBe("none");

    expect(
      getComposerKeyAction({
        key: "Escape",
        shiftKey: false,
        isComposing: true,
        menuState: "open",
        optionCount: 2,
      })
    ).toBe("close_menu");
  });
});
