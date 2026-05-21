import {
  FlattenMap,
  TraceMap,
  originalPositionFor,
} from "@jridgewell/trace-mapping";

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any;
    __REACT_DEVTOOLS_TARGET_WINDOW__: any;
  }
}

interface DebugSource {
  columnNumber?: number;
  fileName?: string;
  lineNumber?: number;
}

interface Fiber {
  _debugSource?: DebugSource;
  _debugStack?: { stack?: string } | null;
  _debugOwner?: Fiber | null;
  return?: Fiber | null;
}

const REACT_FIBER_KEY_PREFIXES = ["__reactFiber$", "__reactInternalInstance$"];

const hasReactFiberKey = (key: string): boolean =>
  REACT_FIBER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

const getFiberFromElement = (element: Element): Fiber | null => {
  const hostInstance = element as unknown as Record<string, unknown>;
  const fiberKey =
    Object.getOwnPropertyNames(hostInstance).find(hasReactFiberKey);
  if (!fiberKey) return null;
  return (hostInstance[fiberKey] as Fiber | undefined) || null;
};

const hasDevtoolsRenderers = (): boolean =>
  !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ &&
  !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers &&
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size > 0;

const hasReactFiberInPage = (): boolean => {
  const root = document.body || document.documentElement;
  if (!root) return false;

  if (getFiberFromElement(root as Element)) return true;

  // Scan only a small subset to keep this check fast.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  let scanned = 0;
  while (node && scanned < 200) {
    if (getFiberFromElement(node)) return true;
    node = walker.nextNode() as Element | null;
    scanned += 1;
  }

  return false;
};

export const checkDevtoolsGlobalHook = (): boolean =>
  hasDevtoolsRenderers() || hasReactFiberInPage();

export const isReactDevtoolsRunning = (): boolean => hasDevtoolsRenderers();

const getDevtoolsGlobalHookRenderers = (): any[] => {
  if (!hasDevtoolsRenderers()) return [];
  return Array.from(window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.values());
};

const getFiberByDomInternalKey = (target: Element): Fiber | null => {
  let current: Element | null = target;
  while (current) {
    const fiber = getFiberFromElement(current);
    if (fiber) return fiber;
    current = current.parentElement;
  }
  return null;
};

const findNearestDebugSourceFiber = (fiber: Fiber | null): Fiber | null => {
  let currentFiber = fiber;
  while (currentFiber && !currentFiber._debugSource) {
    currentFiber = currentFiber.return || null;
  }
  return currentFiber && currentFiber._debugSource ? currentFiber : null;
};

const findNearestDebugStackFiber = (fiber: Fiber | null): Fiber | null => {
  let currentFiber = fiber;
  while (currentFiber && !currentFiber._debugStack?.stack) {
    currentFiber = currentFiber.return || null;
  }
  return currentFiber && currentFiber._debugStack?.stack ? currentFiber : null;
};

export const findFiberByHostInstance = (target: Element): Fiber | null => {
  for (const renderer of getDevtoolsGlobalHookRenderers()) {
    if (typeof renderer?.findFiberByHostInstance !== "function") continue;

    try {
      const fiber = renderer.findFiberByHostInstance(target) || null;
      if (fiber) return fiber as Fiber;
    } catch {
      // Ignore renderer mismatches and continue with other strategies.
    }
  }

  // React can expose the fiber directly on DOM nodes when renderer helpers are unavailable.
  return getFiberByDomInternalKey(target);
};

export const getDebugSourceFromFiber = (
  fiber: Fiber | null,
): DebugSource | null =>
  findNearestDebugSourceFiber(fiber)?._debugSource || null;

interface GeneratedFrame {
  url: string;
  line: number;
  column: number;
}

interface StorybookIndexEntry {
  importPath?: string;
}

interface StorybookIndex {
  entries?: Record<string, StorybookIndexEntry>;
}

const sourceMapCache = new Map<string, TraceMap | null>();
const storybookSourceCache = new Map<string, DebugSource | null>();

const stripQueryAndHash = (value: string): string =>
  value.replace(/[?#].*$/, "");

const SOURCE_MAP_REF_REGEX = /[#@]\s*sourceMappingURL=([^\s]+)/;
const INLINE_SOURCE_MAP_PREFIX = "data:application/json;base64,";

const parseStackFrame = (stackLine: string): GeneratedFrame | null => {
  const match = stackLine.match(/(?:at\s+.*?\()?(.+):(\d+):(\d+)\)?$/);
  if (!match) return null;

  const [, url, line, column] = match;
  const parsedLine = Number(line);
  const parsedColumn = Number(column);
  if (!Number.isFinite(parsedLine) || !Number.isFinite(parsedColumn))
    return null;

  return {
    url,
    line: parsedLine,
    column: parsedColumn,
  };
};

const normalizeFileSourcePath = (source: string): string => {
  const normalizedSource = stripQueryAndHash(source);

  if (normalizedSource.startsWith("webpack-internal:///")) {
    return decodeURIComponent(
      normalizedSource.replace("webpack-internal:///", ""),
    );
  }

  if (normalizedSource.startsWith("vite://")) {
    return decodeURIComponent(normalizedSource.replace("vite://", ""));
  }

  if (normalizedSource.startsWith("file://")) {
    try {
      let pathname = decodeURIComponent(new URL(normalizedSource).pathname);
      if (/^\/[A-Za-z]:\//.test(pathname)) {
        pathname = pathname.slice(1);
      }
      return pathname;
    } catch {
      return normalizedSource;
    }
  }

  if (normalizedSource.startsWith("/@fs/")) {
    return decodeURIComponent(normalizedSource.slice(5));
  }

  if (
    normalizedSource.startsWith("http://") ||
    normalizedSource.startsWith("https://")
  ) {
    try {
      const parsed = new URL(normalizedSource);
      if (parsed.pathname.startsWith("/@fs/")) {
        return decodeURIComponent(parsed.pathname.slice(5));
      }
    } catch {
      return normalizedSource;
    }
  }

  return normalizedSource;
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isLikelyLocalFilePath = (filePath: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("/");

const isNodeModulesPath = (filePath?: string): boolean => {
  if (!filePath) return false;
  return (
    filePath.includes("/node_modules/") ||
    filePath.includes("\\node_modules\\") ||
    filePath.includes("/.pnpm/") ||
    filePath.includes("\\.pnpm\\")
  );
};

const getTraceMap = async (mapUrl: string): Promise<TraceMap | null> => {
  if (sourceMapCache.has(mapUrl)) return sourceMapCache.get(mapUrl) || null;

  try {
    const response = await fetch(mapUrl);
    if (!response.ok) {
      sourceMapCache.set(mapUrl, null);
      return null;
    }
    const rawMap = await response.json();
    const traceMap = FlattenMap(rawMap, mapUrl);
    sourceMapCache.set(mapUrl, traceMap);
    return traceMap;
  } catch {
    sourceMapCache.set(mapUrl, null);
    return null;
  }
};

const getTraceMapFromGeneratedSource = async (
  generatedUrl: string,
): Promise<TraceMap | null> => {
  const cacheKey = `generated:${generatedUrl}`;
  if (sourceMapCache.has(cacheKey)) return sourceMapCache.get(cacheKey) || null;

  try {
    const response = await fetch(generatedUrl);
    if (!response.ok) {
      sourceMapCache.set(cacheKey, null);
      return null;
    }

    const content = await response.text();
    const sourceMapRefMatch = content.match(SOURCE_MAP_REF_REGEX);
    if (!sourceMapRefMatch) {
      sourceMapCache.set(cacheKey, null);
      return null;
    }

    const sourceMapRef = sourceMapRefMatch[1].trim();
    if (sourceMapRef.startsWith(INLINE_SOURCE_MAP_PREFIX)) {
      try {
        const encodedMap = sourceMapRef.slice(INLINE_SOURCE_MAP_PREFIX.length);
        const decodedMapJson = atob(encodedMap);
        const rawMap = JSON.parse(decodedMapJson);
        const traceMap = FlattenMap(rawMap, generatedUrl);
        sourceMapCache.set(cacheKey, traceMap);
        return traceMap;
      } catch {
        sourceMapCache.set(cacheKey, null);
        return null;
      }
    }

    const resolvedMapUrl = new URL(sourceMapRef, generatedUrl).toString();
    const traceMap = await getTraceMap(resolvedMapUrl);
    sourceMapCache.set(cacheKey, traceMap);
    return traceMap;
  } catch {
    sourceMapCache.set(cacheKey, null);
    return null;
  }
};

const mapGeneratedFrameToSource = async (
  frame: GeneratedFrame,
): Promise<DebugSource | null> => {
  const directFilePath = normalizeFileSourcePath(frame.url);
  if (isLikelyLocalFilePath(directFilePath)) {
    return {
      fileName: directFilePath,
      lineNumber: frame.line,
      columnNumber: frame.column,
    };
  }

  const generatedUrlForMap = `${stripQueryAndHash(frame.url)}.map`;
  const traceMap =
    (await getTraceMap(generatedUrlForMap)) ||
    (await getTraceMapFromGeneratedSource(frame.url)) ||
    (await getTraceMapFromGeneratedSource(stripQueryAndHash(frame.url)));
  if (!traceMap) return null;

  const original = originalPositionFor(traceMap, {
    line: frame.line,
    column: Math.max(frame.column - 1, 0),
  });

  if (!original.source || original.line == null || original.column == null) {
    return null;
  }

  const fileName = normalizeFileSourcePath(original.source);
  if (!isLikelyLocalFilePath(fileName)) return null;

  return {
    fileName,
    lineNumber: original.line,
    columnNumber: original.column + 1,
  };
};

const getDebugSourceFromStack = async (
  fiber: Fiber | null,
): Promise<DebugSource | null> => {
  const debugStack = findNearestDebugStackFiber(fiber)?._debugStack?.stack;
  if (!debugStack) return null;

  let nodeModulesCandidate: DebugSource | null = null;
  const stackLines = debugStack.split("\n").map((line) => line.trim());
  for (const stackLine of stackLines) {
    const frame = parseStackFrame(stackLine);
    if (!frame) continue;

    const mapped = await mapGeneratedFrameToSource(frame);
    if (!mapped) continue;

    if (isNodeModulesPath(mapped.fileName)) {
      if (!nodeModulesCandidate) nodeModulesCandidate = mapped;
      continue;
    }

    return mapped;
  }

  return nodeModulesCandidate;
};

const getStorybookDebugSource = async (): Promise<DebugSource | null> => {
  const url = new URL(window.location.href);
  const storyId = url.searchParams.get("id") || "";
  const isStorybookIframe =
    url.pathname.endsWith("/iframe.html") &&
    !!storyId &&
    !!url.searchParams.get("viewMode");

  if (!isStorybookIframe) return null;

  const cacheKey = `${url.origin}|${storyId}`;
  if (storybookSourceCache.has(cacheKey)) {
    return storybookSourceCache.get(cacheKey) || null;
  }

  try {
    const indexResponse = await fetch(`${url.origin}/index.json`);
    if (!indexResponse.ok) {
      storybookSourceCache.set(cacheKey, null);
      return null;
    }

    const indexJson = (await indexResponse.json()) as StorybookIndex;
    const importPath = indexJson.entries?.[storyId]?.importPath || "";
    if (!importPath) {
      storybookSourceCache.set(cacheKey, null);
      return null;
    }

    const directNormalizedImportPath = normalizeFileSourcePath(importPath);
    if (isLikelyLocalFilePath(directNormalizedImportPath)) {
      const debugSource = {
        fileName: directNormalizedImportPath,
        lineNumber: 1,
        columnNumber: 1,
      };
      storybookSourceCache.set(cacheKey, debugSource);
      return debugSource;
    }

    const storybookStoriesResponse = await fetch(
      `${url.origin}/@id/__x00__virtual:/@storybook/builder-vite/storybook-stories.js`,
    );
    if (!storybookStoriesResponse.ok) {
      storybookSourceCache.set(cacheKey, null);
      return null;
    }

    const storybookStoriesModule = await storybookStoriesResponse.text();
    const importPathRegex = new RegExp(
      `["']${escapeRegex(importPath)}["']\\s*:\\s*\\(\\)\\s*=>\\s*import\\((?:["'])([^"']+)(?:["'])\\)`,
    );
    const importPathMatch = storybookStoriesModule.match(importPathRegex);
    if (!importPathMatch) {
      storybookSourceCache.set(cacheKey, null);
      return null;
    }

    const resolvedImportPath = normalizeFileSourcePath(importPathMatch[1]);
    if (!isLikelyLocalFilePath(resolvedImportPath)) {
      storybookSourceCache.set(cacheKey, null);
      return null;
    }

    const debugSource = {
      fileName: resolvedImportPath,
      lineNumber: 1,
      columnNumber: 1,
    };
    storybookSourceCache.set(cacheKey, debugSource);
    return debugSource;
  } catch {
    storybookSourceCache.set(cacheKey, null);
    return null;
  }
};

const getBestDebugSourceForFiber = async (
  fiber: Fiber | null,
): Promise<DebugSource | null> => {
  if (!fiber) return null;

  let nodeModulesCandidate: DebugSource | null = null;

  const directSource = getDebugSourceFromFiber(fiber);
  if (directSource) {
    if (!isNodeModulesPath(directSource.fileName)) return directSource;
    nodeModulesCandidate = directSource;
  }

  const stackSource = await getDebugSourceFromStack(fiber);
  if (stackSource) {
    if (!isNodeModulesPath(stackSource.fileName)) return stackSource;
    if (!nodeModulesCandidate) nodeModulesCandidate = stackSource;
  }

  let owner = fiber._debugOwner || null;
  let ownerDepth = 0;
  while (owner && ownerDepth < 20) {
    const ownerSource = getDebugSourceFromFiber(owner);
    if (ownerSource) {
      if (!isNodeModulesPath(ownerSource.fileName)) return ownerSource;
      if (!nodeModulesCandidate) nodeModulesCandidate = ownerSource;
    }

    owner = owner._debugOwner || null;
    ownerDepth += 1;
  }

  return nodeModulesCandidate;
};

export const findDebugSourceByHostInstance = async (
  target: Element,
): Promise<DebugSource | null> => {
  let nodeModulesCandidate: DebugSource | null = null;
  let currentElement: Element | null = target;
  let checkedDepth = 0;

  while (currentElement && checkedDepth < 30) {
    const fiber = findFiberByHostInstance(currentElement);
    const debugSource = await getBestDebugSourceForFiber(fiber);

    if (debugSource) {
      if (!isNodeModulesPath(debugSource.fileName)) return debugSource;
      if (!nodeModulesCandidate) nodeModulesCandidate = debugSource;
    }

    currentElement = currentElement.parentElement;
    checkedDepth += 1;
  }

  const storybookDebugSource = await getStorybookDebugSource();
  if (storybookDebugSource) return storybookDebugSource;

  return nodeModulesCandidate;
};

export const getEditorLink = (
  openInEditorUrl: string,
  debugSource: DebugSource,
) => {
  const { fileName, columnNumber, lineNumber } = debugSource;
  return openInEditorUrl
    .replace("{path}", fileName || "")
    .replace("{line}", lineNumber ? lineNumber.toString() : "0")
    .replace("{column}", columnNumber ? columnNumber.toString() : "0");
};

export {};
