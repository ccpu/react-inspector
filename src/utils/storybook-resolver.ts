import {
  deriveProjectRootFromAbsolutePath,
  escapeRegex,
  isLikelyLocalFilePath,
  isLikelyRelativeSourcePath,
  isUsableSourcePath,
  normalizeFileSourcePath,
  resolveRelativeImportFromRoot,
} from "./path-utils";
import type { DebugSource, StorybookIndex } from "./types";

const storybookSourceCache = new Map<string, DebugSource | null>();
const storybookRootCache = new Map<string, string | null>();

const getStorybookProjectRoot = async (
  origin: string,
): Promise<string | null> => {
  if (storybookRootCache.has(origin)) {
    return storybookRootCache.get(origin) || null;
  }

  try {
    const mainMapResponse = await fetch(`${origin}/main.iframe.bundle.js.map`);
    if (!mainMapResponse.ok) {
      storybookRootCache.set(origin, null);
      return null;
    }

    const mainMap = (await mainMapResponse.json()) as {
      sources?: string[];
      sourcesContent?: string[];
      sourceRoot?: string;
    };

    const sources = Array.isArray(mainMap.sources) ? mainMap.sources : [];
    for (const source of sources) {
      const normalizedSource = normalizeFileSourcePath(source);
      if (!isLikelyLocalFilePath(normalizedSource)) continue;

      const projectRoot = deriveProjectRootFromAbsolutePath(normalizedSource);
      if (!projectRoot) continue;

      storybookRootCache.set(origin, projectRoot);
      return projectRoot;
    }

    const sourcesContent = Array.isArray(mainMap.sourcesContent)
      ? mainMap.sourcesContent
      : [];
    for (const sourceContent of sourcesContent) {
      const content = String(sourceContent || "");
      const matches = content.match(/[A-Za-z]:[\\/][^\"'\n\r\t )]+/g) || [];
      for (const match of matches) {
        const normalizedMatch = normalizeFileSourcePath(match);
        const projectRoot = deriveProjectRootFromAbsolutePath(normalizedMatch);
        if (!projectRoot) continue;

        storybookRootCache.set(origin, projectRoot);
        return projectRoot;
      }
    }

    storybookRootCache.set(origin, null);
    return null;
  } catch {
    storybookRootCache.set(origin, null);
    return null;
  }
};

export const getStorybookDebugSource =
  async (): Promise<DebugSource | null> => {
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
          columnNumber: 1,
          fileName: directNormalizedImportPath,
          lineNumber: 1,
        };
        storybookSourceCache.set(cacheKey, debugSource);
        return debugSource;
      }

      if (isLikelyRelativeSourcePath(directNormalizedImportPath)) {
        const projectRoot = await getStorybookProjectRoot(url.origin);
        if (projectRoot) {
          const absoluteStoryPath = resolveRelativeImportFromRoot(
            projectRoot,
            directNormalizedImportPath,
          );
          const debugSource = {
            columnNumber: 1,
            fileName: absoluteStoryPath,
            lineNumber: 1,
          };
          storybookSourceCache.set(cacheKey, debugSource);
          return debugSource;
        }
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
      if (!isUsableSourcePath(resolvedImportPath)) {
        storybookSourceCache.set(cacheKey, null);
        return null;
      }

      const fileName = isLikelyLocalFilePath(resolvedImportPath)
        ? resolvedImportPath
        : (() => {
            const projectRoot = storybookRootCache.get(url.origin) || null;
            if (!projectRoot) return resolvedImportPath;
            return resolveRelativeImportFromRoot(
              projectRoot,
              resolvedImportPath,
            );
          })();

      const debugSource = {
        columnNumber: 1,
        fileName,
        lineNumber: 1,
      };
      storybookSourceCache.set(cacheKey, debugSource);
      return debugSource;
    } catch {
      storybookSourceCache.set(cacheKey, null);
      return null;
    }
  };
