import { beforeEach, describe, expect, it, vi } from "vitest";

const response = (status: number, body: string | object) => {
  const textBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    json: async () => JSON.parse(textBody),
    ok: status >= 200 && status < 300,
    status,
    text: async () => textBody,
  };
};

describe("storybook-resolver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const loadResolver = async () => {
    const module = await import("../../src/utils/storybook-resolver");
    return module.getStorybookDebugSource;
  };

  it("returns null when page is not storybook iframe", async () => {
    window.history.replaceState({}, "", "/app");
    const getStorybookDebugSource = await loadResolver();

    expect(await getStorybookDebugSource()).toBeNull();
  });

  it("uses direct local import path from index.json", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        entries: {
          "boxes--default": { importPath: "Z:/repo/stories/Boxes.stories.tsx" },
        },
      }) as any,
    );

    const getStorybookDebugSource = await loadResolver();

    await expect(getStorybookDebugSource()).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/stories/Boxes.stories.tsx",
      lineNumber: 1,
    });
  });

  it("resolves relative import path using webpack map project root", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return response(200, {
            entries: {
              "boxes--default": { importPath: "./stories/Boxes.stories.tsx" },
            },
          }) as any;
        }
        if (url.endsWith("/main.iframe.bundle.js.map")) {
          return response(200, {
            sources: [],
            sourcesContent: [
              "something Z:/repo/node_modules/pkg/index.js other",
            ],
          }) as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const getStorybookDebugSource = await loadResolver();

    await expect(getStorybookDebugSource()).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/stories/Boxes.stories.tsx",
      lineNumber: 1,
    });
  });

  it("falls back to storybook-stories import map for vite projects", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return response(200, {
            entries: {
              "boxes--default": { importPath: "./stories/Boxes.stories.tsx" },
            },
          }) as any;
        }
        if (url.endsWith("/main.iframe.bundle.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("storybook-stories.js")) {
          return response(
            200,
            `export default {"./stories/Boxes.stories.tsx": () => import('/@fs/Z:/repo/stories/Boxes.stories.tsx')}`,
          ) as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const getStorybookDebugSource = await loadResolver();

    await expect(getStorybookDebugSource()).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/stories/Boxes.stories.tsx",
      lineNumber: 1,
    });
  });

  it("returns null when index.json is unavailable", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(500, "x") as any);

    const getStorybookDebugSource = await loadResolver();
    await expect(getStorybookDebugSource()).resolves.toBeNull();
  });

  it("returns null when story import path is missing", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, {
        entries: {
          "boxes--default": {},
        },
      }) as any,
    );

    const getStorybookDebugSource = await loadResolver();
    await expect(getStorybookDebugSource()).resolves.toBeNull();
  });

  it("returns null when virtual stories module cannot be fetched", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return response(200, {
            entries: {
              "boxes--default": { importPath: "./stories/Boxes.stories.tsx" },
            },
          }) as any;
        }
        if (url.endsWith("/main.iframe.bundle.js.map")) {
          return response(404, "not-found") as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const getStorybookDebugSource = await loadResolver();
    await expect(getStorybookDebugSource()).resolves.toBeNull();
  });

  it("returns null when import path mapping is missing in virtual stories module", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return response(200, {
            entries: {
              "boxes--default": { importPath: "./stories/Boxes.stories.tsx" },
            },
          }) as any;
        }
        if (url.endsWith("/main.iframe.bundle.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("storybook-stories.js")) {
          return response(200, "export default {}") as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const getStorybookDebugSource = await loadResolver();
    await expect(getStorybookDebugSource()).resolves.toBeNull();
  });

  it("returns unresolved relative path when root cache is empty", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return response(200, {
            entries: {
              "boxes--default": { importPath: "./stories/Boxes.stories.tsx" },
            },
          }) as any;
        }
        if (url.endsWith("/main.iframe.bundle.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("storybook-stories.js")) {
          return response(
            200,
            `{"./stories/Boxes.stories.tsx": () => import('./src/Boxes.stories.tsx')}`,
          ) as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const getStorybookDebugSource = await loadResolver();
    await expect(getStorybookDebugSource()).resolves.toEqual({
      columnNumber: 1,
      fileName: "./src/Boxes.stories.tsx",
      lineNumber: 1,
    });
  });

  it("extracts project root from main map sources and uses cache", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/index.json")) {
          return response(200, {
            entries: {
              "boxes--default": { importPath: "./stories/Boxes.stories.tsx" },
            },
          }) as any;
        }
        if (url.endsWith("/main.iframe.bundle.js.map")) {
          return response(200, {
            sources: ["file:///Z:/repo/node_modules/pkg/index.js"],
          }) as any;
        }
        return response(404, "not-found") as any;
      });

    const getStorybookDebugSource = await loadResolver();

    await expect(getStorybookDebugSource()).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/stories/Boxes.stories.tsx",
      lineNumber: 1,
    });
    await expect(getStorybookDebugSource()).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/stories/Boxes.stories.tsx",
      lineNumber: 1,
    });

    const indexRequests = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).endsWith("/index.json"),
    );
    expect(indexRequests).toHaveLength(1);
  });

  it("returns null when resolver throws", async () => {
    window.history.replaceState(
      {},
      "",
      "/iframe.html?id=boxes--default&viewMode=story",
    );
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const getStorybookDebugSource = await loadResolver();
    await expect(getStorybookDebugSource()).resolves.toBeNull();
  });
});
