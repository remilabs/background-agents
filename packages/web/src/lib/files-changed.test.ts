import { describe, it, expect } from "vitest";
import { extractFilesChanged } from "./files-changed";

function makeToolCall(tool: string, args: Record<string, unknown>, timestamp = 1000) {
  return { type: "tool_call" as const, tool, args, timestamp };
}

describe("extractFilesChanged", () => {
  it("returns empty array for no events", () => {
    expect(extractFilesChanged([])).toEqual([]);
  });

  it("ignores non-tool_call events", () => {
    const events = [
      { type: "token", content: "hello", timestamp: 1 },
      { type: "execution_complete", timestamp: 2 },
    ];
    expect(extractFilesChanged(events)).toEqual([]);
  });

  it("ignores tool_call events without filePath", () => {
    const events = [makeToolCall("Edit", { oldString: "a", newString: "b" })];
    expect(extractFilesChanged(events)).toEqual([]);
  });

  it("ignores tool_call events for non-Edit/Write tools", () => {
    const events = [
      makeToolCall("Read", { filePath: "/src/foo.ts" }),
      makeToolCall("Bash", { command: "echo hi" }),
      makeToolCall("Grep", { pattern: "foo", filePath: "/src/bar.ts" }),
    ];
    expect(extractFilesChanged(events)).toEqual([]);
  });

  describe("Edit tool", () => {
    it("counts additions and deletions from oldString/newString (camelCase)", () => {
      const events = [
        makeToolCall("Edit", {
          filePath: "/src/foo.ts",
          oldString: "line1\nline2",
          newString: "line1\nline2\nline3",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/foo.ts", additions: 3, deletions: 2 }]);
    });

    it("handles snake_case arg names", () => {
      const events = [
        makeToolCall("Edit", {
          file_path: "/src/bar.ts",
          old_string: "a",
          new_string: "b\nc",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/bar.ts", additions: 2, deletions: 1 }]);
    });

    it("handles missing oldString/newString gracefully", () => {
      const events = [makeToolCall("Edit", { filePath: "/src/foo.ts" })];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/foo.ts", additions: 0, deletions: 0 }]);
    });

    it("handles empty strings", () => {
      const events = [
        makeToolCall("Edit", {
          filePath: "/src/foo.ts",
          oldString: "",
          newString: "",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/foo.ts", additions: 0, deletions: 0 }]);
    });

    it("handles trailing newlines correctly", () => {
      const events = [
        makeToolCall("Edit", {
          filePath: "/src/foo.ts",
          oldString: "line1\n",
          newString: "line1\nline2\n",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/foo.ts", additions: 2, deletions: 1 }]);
    });
  });

  describe("Write tool", () => {
    it("counts content lines as additions", () => {
      const events = [
        makeToolCall("Write", {
          filePath: "/src/new-file.ts",
          content: "line1\nline2\nline3",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/new-file.ts", additions: 3, deletions: 0 }]);
    });

    it("handles snake_case file_path", () => {
      const events = [
        makeToolCall("Write", {
          file_path: "/src/new-file.ts",
          content: "hello",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/new-file.ts", additions: 1, deletions: 0 }]);
    });

    it("handles missing content", () => {
      const events = [makeToolCall("Write", { filePath: "/src/empty.ts" })];
      const result = extractFilesChanged(events);
      expect(result).toEqual([{ filename: "/src/empty.ts", additions: 0, deletions: 0 }]);
    });
  });

  describe("aggregation", () => {
    it("sums multiple edits to the same file", () => {
      const events = [
        makeToolCall("Edit", {
          filePath: "/src/foo.ts",
          oldString: "a",
          newString: "b\nc",
        }),
        makeToolCall("Edit", {
          filePath: "/src/foo.ts",
          oldString: "x\ny",
          newString: "z",
        }),
      ];
      const result = extractFilesChanged(events);
      // First edit: +2 -1, second edit: +1 -2 => total: +3 -3
      expect(result).toEqual([{ filename: "/src/foo.ts", additions: 3, deletions: 3 }]);
    });

    it("sums Write and Edit to the same file", () => {
      const events = [
        makeToolCall("Write", {
          filePath: "/src/foo.ts",
          content: "line1\nline2",
        }),
        makeToolCall("Edit", {
          filePath: "/src/foo.ts",
          oldString: "line1",
          newString: "LINE1",
        }),
      ];
      const result = extractFilesChanged(events);
      // Write: +2, Edit: +1 -1 => total: +3 -1
      expect(result).toEqual([{ filename: "/src/foo.ts", additions: 3, deletions: 1 }]);
    });

    it("tracks multiple files separately", () => {
      const events = [
        makeToolCall("Edit", {
          filePath: "/src/a.ts",
          oldString: "old",
          newString: "new",
        }),
        makeToolCall("Write", {
          filePath: "/src/b.ts",
          content: "hello\nworld",
        }),
      ];
      const result = extractFilesChanged(events);
      expect(result).toEqual([
        { filename: "/src/a.ts", additions: 1, deletions: 1 },
        { filename: "/src/b.ts", additions: 2, deletions: 0 },
      ]);
    });
  });

  describe("ordering", () => {
    it("sorts results alphabetically by filename", () => {
      const events = [
        makeToolCall("Write", { filePath: "/src/z.ts", content: "z" }),
        makeToolCall("Write", { filePath: "/src/a.ts", content: "a" }),
        makeToolCall("Write", { filePath: "/src/m.ts", content: "m" }),
      ];
      const result = extractFilesChanged(events);
      expect(result.map((f) => f.filename)).toEqual(["/src/a.ts", "/src/m.ts", "/src/z.ts"]);
    });
  });
});
