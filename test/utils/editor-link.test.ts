import { describe, expect, it } from "vitest";
import {
  getEditorLink,
  isCustomProtocolUrl,
} from "../../src/utils/editor-link";

describe("editor-link", () => {
  it("replaces placeholders with debug source info", () => {
    const link = getEditorLink("vscode://file/{path}:{line}:{column}", {
      columnNumber: 12,
      fileName: "Z:/repo/src/App.tsx",
      lineNumber: 40,
    });

    expect(link).toBe("vscode://file/Z:/repo/src/App.tsx:40:12");
  });

  it("falls back to zeroes when values are missing", () => {
    const link = getEditorLink("vscode://file/{path}:{line}:{column}", {});
    expect(link).toBe("vscode://file/:0:0");
  });

  it("detects custom protocol links", () => {
    expect(isCustomProtocolUrl("vscode://file/Z:/repo/src/App.tsx:40:12")).toBe(
      true,
    );
    expect(
      isCustomProtocolUrl(
        "http://localhost:63342/api/file/Z:/repo/src/App.tsx:40:12",
      ),
    ).toBe(false);
    expect(isCustomProtocolUrl("https://example.com/open")).toBe(false);
  });
});
