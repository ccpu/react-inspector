import { describe, expect, it } from "vitest";
import {
  deriveProjectRootFromAbsolutePath,
  escapeRegex,
  isLikelyLocalFilePath,
  isLikelyRelativeSourcePath,
  isNodeModulesPath,
  isUsableSourcePath,
  normalizeFileSourcePath,
  resolveRelativeImportFromRoot,
  stripQueryAndHash,
  toSlashPath,
} from "../../src/utils/path-utils";

describe("path-utils", () => {
  it("strips query/hash suffix", () => {
    expect(stripQueryAndHash("/a/b.tsx?x=1#hash")).toBe("/a/b.tsx");
  });

  it("normalizes webpack and protocol based sources", () => {
    expect(normalizeFileSourcePath("webpack://app/./src/main.tsx")).toBe(
      "./src/main.tsx",
    );
    expect(normalizeFileSourcePath("webpack-internal:///src/file.tsx")).toBe(
      "src/file.tsx",
    );
    expect(normalizeFileSourcePath("vite://src/file.tsx")).toBe("src/file.tsx");
  });

  it("normalizes file and @fs style sources", () => {
    expect(normalizeFileSourcePath("file:///Z:/repo/src/App.tsx")).toBe(
      "Z:/repo/src/App.tsx",
    );
    expect(normalizeFileSourcePath("/@fs/Z:/repo/src/App.tsx")).toBe(
      "Z:/repo/src/App.tsx",
    );
    expect(
      normalizeFileSourcePath("http://localhost:3000/@fs/Z:/repo/src/App.tsx"),
    ).toBe("Z:/repo/src/App.tsx");
  });

  it("escapes regex characters", () => {
    expect(escapeRegex("a+b(c)")).toBe("a\\+b\\(c\\)");
  });

  it("detects local and relative paths", () => {
    expect(isLikelyLocalFilePath("Z:/repo/src/a.ts")).toBe(true);
    expect(isLikelyLocalFilePath("/repo/src/a.ts")).toBe(true);
    expect(isLikelyLocalFilePath("./src/a.ts")).toBe(false);

    expect(isLikelyRelativeSourcePath("./stories/A.stories.tsx")).toBe(true);
    expect(isLikelyRelativeSourcePath("../stories/A.stories.tsx")).toBe(true);
    expect(isLikelyRelativeSourcePath("src/a.tsx")).toBe(true);
    expect(isLikelyRelativeSourcePath("http://x/y.ts")).toBe(false);

    expect(isUsableSourcePath("./stories/A.stories.tsx")).toBe(true);
    expect(isUsableSourcePath("Z:/repo/src/a.tsx")).toBe(true);
    expect(isUsableSourcePath("webpack://foo")).toBe(false);
  });

  it("detects node_modules style paths", () => {
    expect(isNodeModulesPath("/repo/node_modules/pkg/index.js")).toBe(true);
    expect(isNodeModulesPath("C:/repo/.pnpm/pkg/index.js")).toBe(true);
    expect(isNodeModulesPath("/repo/src/App.tsx")).toBe(false);
    expect(isNodeModulesPath(undefined)).toBe(false);
  });

  it("derives project roots and resolves relative imports", () => {
    expect(
      deriveProjectRootFromAbsolutePath("Z:/repo/node_modules/pkg/index.js"),
    ).toBe("Z:/repo");
    expect(
      deriveProjectRootFromAbsolutePath("Z:/repo/stories/A.stories.tsx"),
    ).toBe("Z:/repo");
    expect(deriveProjectRootFromAbsolutePath("Z:/repo/src/App.tsx")).toBeNull();

    expect(toSlashPath("Z:\\repo\\src\\App.tsx")).toBe("Z:/repo/src/App.tsx");
    expect(
      resolveRelativeImportFromRoot("Z:/repo/", "./stories/A.stories.tsx"),
    ).toBe("Z:/repo/stories/A.stories.tsx");
  });
});
