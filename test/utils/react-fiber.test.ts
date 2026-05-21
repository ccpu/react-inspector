import { beforeEach, describe, expect, it } from "vitest";
import {
  checkDevtoolsGlobalHook,
  findFiberByHostInstance,
  getDebugSourceFromFiber,
  isReactDevtoolsRunning,
} from "../../src/utils/react-fiber";
import type { Fiber } from "../../src/utils/types";

const attachFiber = (element: Element, fiber: Fiber) => {
  Object.defineProperty(element, "__reactFiber$test", {
    configurable: true,
    value: fiber,
  });
};

describe("react-fiber", () => {
  beforeEach(() => {
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = undefined;
    document.body.innerHTML = "";
  });

  it("returns false when no hook or fibers are present", () => {
    expect(checkDevtoolsGlobalHook()).toBe(false);
    expect(isReactDevtoolsRunning()).toBe(false);
  });

  it("detects running devtools renderers", () => {
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map([[1, { findFiberByHostInstance: () => null }]]),
    };

    expect(isReactDevtoolsRunning()).toBe(true);
    expect(checkDevtoolsGlobalHook()).toBe(true);
  });

  it("detects react fibers in page without renderers", () => {
    const div = document.createElement("div");
    attachFiber(div, {});
    document.body.appendChild(div);

    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new Map() };

    expect(isReactDevtoolsRunning()).toBe(false);
    expect(checkDevtoolsGlobalHook()).toBe(true);
  });

  it("uses renderer API first and falls back to dom-internal fibers", () => {
    const target = document.createElement("button");
    const fromRenderer = { _debugSource: { fileName: "src/A.tsx" } } as Fiber;

    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map([
        [
          1,
          {
            findFiberByHostInstance: () => fromRenderer,
          },
        ],
      ]),
    };

    expect(findFiberByHostInstance(target)).toBe(fromRenderer);

    const parent = document.createElement("div");
    parent.appendChild(target);
    attachFiber(parent, { _debugSource: { fileName: "src/B.tsx" } });

    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map([
        [
          1,
          {
            findFiberByHostInstance: () => {
              throw new Error("renderer mismatch");
            },
          },
        ],
      ]),
    };

    const fallbackFiber = findFiberByHostInstance(target);
    expect(fallbackFiber?._debugSource?.fileName).toBe("src/B.tsx");
  });

  it("finds nearest debug source in return chain", () => {
    const fiber = {
      return: {
        _debugSource: {
          columnNumber: 5,
          fileName: "src/App.tsx",
          lineNumber: 10,
        },
      },
    } as Fiber;

    expect(getDebugSourceFromFiber(fiber)).toEqual({
      columnNumber: 5,
      fileName: "src/App.tsx",
      lineNumber: 10,
    });
    expect(getDebugSourceFromFiber(null)).toBeNull();
  });
});
