import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fiber } from "../../src/utils/types";

const response = (status: number, body: string | object) => {
  const textBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    json: async () => JSON.parse(textBody),
    ok: status >= 200 && status < 300,
    status,
    text: async () => textBody,
  };
};

describe("source-map-resolver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const loadResolver = async () => {
    const module = await import("../../src/utils/source-map-resolver");
    return module.getDebugSourceFromStack;
  };

  it("maps direct local file stack frames without fetch", async () => {
    const getDebugSourceFromStack = await loadResolver();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (Z:/repo/src/App.tsx:12:3)",
      },
    } as Fiber;

    const debugSource = await getDebugSourceFromStack(fiber);
    expect(debugSource).toEqual({
      columnNumber: 3,
      fileName: "Z:/repo/src/App.tsx",
      lineNumber: 12,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns node_modules candidate when no better source exists", async () => {
    const getDebugSourceFromStack = await loadResolver();
    const fiber = {
      _debugStack: {
        stack: "Error\n at Lib (/repo/node_modules/pkg/index.js:8:2)",
      },
    } as Fiber;

    const debugSource = await getDebugSourceFromStack(fiber);
    expect(debugSource?.fileName).toContain("node_modules/pkg/index.js");
  });

  it("falls back to inline source maps when external map is unavailable", async () => {
    const getDebugSourceFromStack = await loadResolver();
    const rawMap = {
      file: "chunk.js",
      mappings: "AAAA",
      names: [],
      sources: ["/@fs/Z:/repo/src/Foo.tsx"],
      version: 3,
    };

    const encodedMap = Buffer.from(JSON.stringify(rawMap)).toString("base64");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("chunk.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("chunk.js")) {
          return response(
            200,
            `console.log('x');\n//# sourceMappingURL=data:application/json;base64,${encodedMap}`,
          ) as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (http://localhost:3000/chunk.js:1:1)",
      },
    } as Fiber;

    const debugSource = await getDebugSourceFromStack(fiber);
    expect(debugSource).toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/src/Foo.tsx",
      lineNumber: 1,
    });
  });

  it("returns null when no stack is available", async () => {
    const getDebugSourceFromStack = await loadResolver();
    expect(await getDebugSourceFromStack(null)).toBeNull();
    expect(await getDebugSourceFromStack({} as Fiber)).toBeNull();
  });

  it("maps using external sourcemap url and then reuses cache", async () => {
    const getDebugSourceFromStack = await loadResolver();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("bundle.js.map")) {
          return response(200, {
            file: "bundle.js",
            mappings: "AAAA",
            names: [],
            sources: ["/@fs/Z:/repo/src/Baz.tsx"],
            version: 3,
          }) as any;
        }
        return response(404, "not-found") as any;
      });

    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (http://localhost:3000/bundle.js:1:1)",
      },
    } as Fiber;

    await expect(getDebugSourceFromStack(fiber)).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/src/Baz.tsx",
      lineNumber: 1,
    });
    await expect(getDebugSourceFromStack(fiber)).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/src/Baz.tsx",
      lineNumber: 1,
    });

    const mapFetches = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).endsWith("bundle.js.map"),
    );
    expect(mapFetches).toHaveLength(1);
  });

  it("returns null when generated source has no sourcemap reference", async () => {
    const getDebugSourceFromStack = await loadResolver();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("nomap.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("nomap.js")) {
          return response(200, "console.log('no-map')") as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (http://localhost:3000/nomap.js:2:4)",
      },
    } as Fiber;

    await expect(getDebugSourceFromStack(fiber)).resolves.toBeNull();
  });

  it("handles invalid inline sourcemap payloads", async () => {
    const getDebugSourceFromStack = await loadResolver();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("broken.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("broken.js")) {
          return response(
            200,
            "//# sourceMappingURL=data:application/json;base64,not-valid-base64",
          ) as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (http://localhost:3000/broken.js:1:1)",
      },
    } as Fiber;

    await expect(getDebugSourceFromStack(fiber)).resolves.toBeNull();
  });

  it("uses map reference from generated source file", async () => {
    const getDebugSourceFromStack = await loadResolver();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("assets/ref.js.map")) {
          return response(200, {
            file: "ref.js",
            mappings: "AAAA",
            names: [],
            sources: ["/@fs/Z:/repo/src/Ref.tsx"],
            version: 3,
          }) as any;
        }
        if (url.endsWith("ref.js.map")) {
          return response(404, "not-found") as any;
        }
        if (url.includes("ref.js") && !url.endsWith("assets/ref.js.map")) {
          return response(200, "//# sourceMappingURL=assets/ref.js.map") as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (http://localhost:3000/ref.js:1:1)",
      },
    } as Fiber;

    await expect(getDebugSourceFromStack(fiber)).resolves.toEqual({
      columnNumber: 1,
      fileName: "Z:/repo/src/Ref.tsx",
      lineNumber: 1,
    });
  });

  it("returns null when map cannot resolve an original position", async () => {
    const getDebugSourceFromStack = await loadResolver();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("virtual.js.map")) {
          return response(200, {
            file: "virtual.js",
            mappings: "",
            names: [],
            sources: ["/@fs/Z:/repo/src/Virtual.tsx"],
            version: 3,
          }) as any;
        }
        return response(404, "not-found") as any;
      },
    );

    const fiber = {
      _debugStack: {
        stack: "Error\n at Comp (http://localhost:3000/virtual.js:1:1)",
      },
    } as Fiber;

    await expect(getDebugSourceFromStack(fiber)).resolves.toBeNull();
  });
});
