import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/react-fiber", () => ({
  findFiberByHostInstance: vi.fn(),
  getDebugSourceFromFiber: vi.fn(),
}));

vi.mock("../../src/utils/source-map-resolver", () => ({
  getDebugSourceFromStack: vi.fn(),
}));

vi.mock("../../src/utils/storybook-resolver", () => ({
  getStorybookDebugSource: vi.fn(),
}));

import {
  findFiberByHostInstance,
  getDebugSourceFromFiber,
} from "../../src/utils/react-fiber";
import { getDebugSourceFromStack } from "../../src/utils/source-map-resolver";
import { getStorybookDebugSource } from "../../src/utils/storybook-resolver";
import { findDebugSourceByHostInstance } from "../../src/utils/debug-source-resolver";

describe("debug-source-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getStorybookDebugSource as any).mockResolvedValue(null);
    (getDebugSourceFromStack as any).mockResolvedValue(null);
    (getDebugSourceFromFiber as any).mockReturnValue(null);
    (findFiberByHostInstance as any).mockReturnValue(null);
  });

  it("returns direct non-node_modules source first", async () => {
    const target = document.createElement("button");
    const fiber = { _debugSource: { fileName: "src/App.tsx", lineNumber: 1 } };

    (findFiberByHostInstance as any).mockReturnValue(fiber);
    (getDebugSourceFromFiber as any).mockReturnValue({
      fileName: "src/App.tsx",
      lineNumber: 10,
      columnNumber: 2,
    });

    const source = await findDebugSourceByHostInstance(target);
    expect(source?.fileName).toBe("src/App.tsx");
  });

  it("uses storybook fallback when traversal cannot resolve source", async () => {
    const target = document.createElement("button");
    const parent = document.createElement("div");
    parent.appendChild(target);

    (findFiberByHostInstance as any).mockReturnValue(null);
    (getStorybookDebugSource as any).mockResolvedValue({
      fileName: "Z:/repo/stories/Boxes.stories.tsx",
      lineNumber: 1,
      columnNumber: 1,
    });

    const source = await findDebugSourceByHostInstance(target);
    expect(source?.fileName).toContain("Boxes.stories.tsx");
  });

  it("returns node_modules candidate when nothing better exists", async () => {
    const target = document.createElement("button");
    const fiber = {
      _debugSource: { fileName: "/repo/node_modules/pkg/index.js" },
    };

    (findFiberByHostInstance as any).mockReturnValue(fiber);
    (getDebugSourceFromFiber as any).mockReturnValue({
      fileName: "/repo/node_modules/pkg/index.js",
      lineNumber: 3,
      columnNumber: 1,
    });

    const source = await findDebugSourceByHostInstance(target);
    expect(source?.fileName).toContain("node_modules");
  });

  it("prefers non-node stack source over node direct source", async () => {
    const target = document.createElement("button");
    const fiber = {
      _debugSource: { fileName: "/repo/node_modules/pkg/index.js" },
    };

    (findFiberByHostInstance as any).mockReturnValue(fiber);
    (getDebugSourceFromFiber as any).mockReturnValue({
      fileName: "/repo/node_modules/pkg/index.js",
      lineNumber: 1,
      columnNumber: 1,
    });
    (getDebugSourceFromStack as any).mockResolvedValue({
      fileName: "Z:/repo/src/RealSource.tsx",
      lineNumber: 2,
      columnNumber: 1,
    });

    const source = await findDebugSourceByHostInstance(target);
    expect(source?.fileName).toBe("Z:/repo/src/RealSource.tsx");
  });

  it("uses owner debug source when direct and stack sources are unavailable", async () => {
    const target = document.createElement("button");
    const owner = {
      _debugSource: { fileName: "src/Owner.tsx", lineNumber: 6 },
    };
    const fiber = { _debugOwner: owner };

    (findFiberByHostInstance as any).mockReturnValue(fiber);
    (getDebugSourceFromFiber as any).mockImplementation((input: any) => {
      if (input === owner) {
        return {
          fileName: "src/Owner.tsx",
          lineNumber: 6,
          columnNumber: 1,
        };
      }
      return null;
    });

    const source = await findDebugSourceByHostInstance(target);
    expect(source?.fileName).toBe("src/Owner.tsx");
  });

  it("uses parent element when child has no matching fiber", async () => {
    const target = document.createElement("button");
    const parent = document.createElement("div");
    parent.appendChild(target);

    (findFiberByHostInstance as any).mockImplementation((element: Element) => {
      if (element === parent) {
        return { _debugSource: { fileName: "src/Parent.tsx", lineNumber: 1 } };
      }
      return null;
    });
    (getDebugSourceFromFiber as any).mockImplementation((fiber: any) => {
      if (fiber?._debugSource?.fileName === "src/Parent.tsx") {
        return {
          fileName: "src/Parent.tsx",
          lineNumber: 1,
          columnNumber: 1,
        };
      }
      return null;
    });

    const source = await findDebugSourceByHostInstance(target);
    expect(source?.fileName).toBe("src/Parent.tsx");
  });
});
