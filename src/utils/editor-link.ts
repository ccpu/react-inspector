import type { DebugSource } from "./types";

export const getEditorLink = (
  openInEditorUrl: string,
  debugSource: DebugSource,
): string => {
  const { fileName, columnNumber, lineNumber } = debugSource;

  return openInEditorUrl
    .replace("{path}", fileName || "")
    .replace("{line}", lineNumber ? lineNumber.toString() : "0")
    .replace("{column}", columnNumber ? columnNumber.toString() : "0");
};
