import {
  FlattenMap,
  TraceMap,
  originalPositionFor,
} from "@jridgewell/trace-mapping";
import {
  isNodeModulesPath,
  isUsableSourcePath,
  normalizeFileSourcePath,
  stripQueryAndHash,
} from "./path-utils";
import type { DebugSource, Fiber, GeneratedFrame } from "./types";

const SOURCE_MAP_REF_REGEX = /[#@]\s*sourceMappingURL=([^\s]+)/;
const INLINE_SOURCE_MAP_PREFIX = "data:application/json;base64,";

const sourceMapCache = new Map<string, TraceMap | null>();

const parseStackFrame = (stackLine: string): GeneratedFrame | null => {
  const match = stackLine.match(/(?:at\s+.*?\()?(.+):(\d+):(\d+)\)?$/);
  if (!match) return null;

  const [, url, line, column] = match;
  const parsedLine = Number(line);
  const parsedColumn = Number(column);
  if (!Number.isFinite(parsedLine) || !Number.isFinite(parsedColumn)) {
    return null;
  }

  return {
    column: parsedColumn,
    line: parsedLine,
    url,
  };
};

const findNearestDebugStackFiber = (fiber: Fiber | null): Fiber | null => {
  let currentFiber = fiber;
  while (currentFiber && !currentFiber._debugStack?.stack) {
    currentFiber = currentFiber.return || null;
  }
  return currentFiber && currentFiber._debugStack?.stack ? currentFiber : null;
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
  if (isUsableSourcePath(directFilePath)) {
    return {
      columnNumber: frame.column,
      fileName: directFilePath,
      lineNumber: frame.line,
    };
  }

  const generatedUrlForMap = `${stripQueryAndHash(frame.url)}.map`;
  const traceMap =
    (await getTraceMap(generatedUrlForMap)) ||
    (await getTraceMapFromGeneratedSource(frame.url)) ||
    (await getTraceMapFromGeneratedSource(stripQueryAndHash(frame.url)));
  if (!traceMap) return null;

  const original = originalPositionFor(traceMap, {
    column: Math.max(frame.column - 1, 0),
    line: frame.line,
  });

  if (!original.source || original.line == null || original.column == null) {
    return null;
  }

  const fileName = normalizeFileSourcePath(original.source);
  if (!isUsableSourcePath(fileName)) return null;

  return {
    columnNumber: original.column + 1,
    fileName,
    lineNumber: original.line,
  };
};

export const getDebugSourceFromStack = async (
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
