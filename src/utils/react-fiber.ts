import type { DebugSource, Fiber } from "./types";

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any;
    __REACT_DEVTOOLS_TARGET_WINDOW__: any;
  }
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

export const checkDevtoolsGlobalHook = (): boolean =>
  hasDevtoolsRenderers() || hasReactFiberInPage();

export const isReactDevtoolsRunning = (): boolean => hasDevtoolsRenderers();

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
