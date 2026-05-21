import { afterEach } from "vitest";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  window.history.replaceState({}, "", "/");
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = undefined;
  (window as any).__REACT_DEVTOOLS_TARGET_WINDOW__ = undefined;
});
