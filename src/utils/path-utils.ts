const WEBPACK_SOURCE_REGEX = /^webpack:\/\/[^/]+\/(?:\.\/)?(.*)$/;

export const stripQueryAndHash = (value: string): string =>
  value.replace(/[?#].*$/, "");

export const normalizeFileSourcePath = (source: string): string => {
  const normalizedSource = stripQueryAndHash(source);

  const webpackPathMatch = normalizedSource.match(WEBPACK_SOURCE_REGEX);
  if (webpackPathMatch) {
    const webpackPath = webpackPathMatch[1] || "";
    if (webpackPath) {
      return decodeURIComponent(
        webpackPath.startsWith(".") ? webpackPath : `./${webpackPath}`,
      );
    }
  }

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

export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isLikelyLocalFilePath = (filePath: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("/");

export const isLikelyRelativeSourcePath = (filePath: string): boolean =>
  !filePath.includes("://") &&
  (filePath.startsWith("./") ||
    filePath.startsWith("../") ||
    /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.(?:tsx?|jsx?)$/.test(filePath));

export const isUsableSourcePath = (filePath: string): boolean =>
  isLikelyLocalFilePath(filePath) || isLikelyRelativeSourcePath(filePath);

export const isNodeModulesPath = (filePath?: string): boolean => {
  if (!filePath) return false;
  return (
    filePath.includes("/node_modules/") ||
    filePath.includes("\\node_modules\\") ||
    filePath.includes("/.pnpm/") ||
    filePath.includes("\\.pnpm\\")
  );
};

export const toSlashPath = (value: string): string => value.replace(/\\/g, "/");

export const deriveProjectRootFromAbsolutePath = (
  absolutePath: string,
): string | null => {
  const normalized = toSlashPath(absolutePath);
  const nodeModulesIndex = normalized.indexOf("/node_modules/");
  if (nodeModulesIndex > 0) {
    return normalized.slice(0, nodeModulesIndex);
  }

  const storiesIndex = normalized.indexOf("/stories/");
  if (storiesIndex > 0) {
    return normalized.slice(0, storiesIndex);
  }

  return null;
};

export const resolveRelativeImportFromRoot = (
  rootPath: string,
  importPath: string,
): string => {
  const normalizedRoot = toSlashPath(rootPath).replace(/\/+$/, "");
  const normalizedImportPath = importPath
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .replace(/\\/g, "/");

  return `${normalizedRoot}/${normalizedImportPath}`;
};
