import { describe, it, expect } from "vitest";
import { countLines } from "./strings";

describe("countLines", () => {
  it("returns 0 for undefined", () => {
    expect(countLines(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(countLines("")).toBe(0);
  });

  it("returns 1 for single line without newline", () => {
    expect(countLines("hello")).toBe(1);
  });

  it("returns 1 for single line with trailing newline", () => {
    expect(countLines("hello\n")).toBe(1);
  });

  it("returns 2 for two lines without trailing newline", () => {
    expect(countLines("a\nb")).toBe(2);
  });

  it("returns 2 for two lines with trailing newline", () => {
    expect(countLines("a\nb\n")).toBe(2);
  });

  it("handles multiple trailing newlines", () => {
    // "a\n\n" = lines ["a", "", ""] -> last is empty -> 2 lines
    expect(countLines("a\n\n")).toBe(2);
  });

  it("counts blank lines in the middle", () => {
    expect(countLines("a\n\nb")).toBe(3);
  });
});
