import type { DebugSource } from "./types";

const URL_SCHEME_REGEX = /^[a-z][a-z\d+\-.]*:/i;

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

export const isCustomProtocolUrl = (url: string): boolean => {
  const normalizedUrl = url.trim().toLowerCase();
  if (!URL_SCHEME_REGEX.test(normalizedUrl)) {
    return false;
  }

  return !(
    normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://")
  );
};
