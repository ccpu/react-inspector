import {
  checkDevtoolsGlobalHook,
  findDebugSourceByHostInstance,
  findFiberByHostInstance,
  getDebugSourceFromFiber,
  getEditorLink,
  isReactDevtoolsRunning,
} from "./utils";
import Overlay from "./Overlay";
import { DEFAULT_OPEN_IN_EDITOR_URL } from "./constants";

let overlay: Overlay | null = null;
let inspecting = false;
let openInEditorUrl = DEFAULT_OPEN_IN_EDITOR_URL;
const mousePos = { x: 0, y: 0 };
let openInEditorMethod = "url";

const getEventElement = (target: EventTarget | null): HTMLElement | null => {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  if (target instanceof Element) return target as HTMLElement;
  if (target instanceof Node) return target.parentElement as HTMLElement | null;
  return null;
};

const getInspectName = (element: HTMLElement) => {
  const fiber = findFiberByHostInstance(element);
  const debugSource = getDebugSourceFromFiber(fiber);
  if (!debugSource) return "Source code could not be identified.";
  const { fileName, columnNumber, lineNumber } = debugSource;
  const path = (fileName || "").split("/");

  return `${path.at(-3) || ""}/${path.at(-2) || ""}/${path.at(-1)}:${
    lineNumber || 0
  }:${columnNumber || 0}`;
};

const startInspectorMode = () => {
  inspecting = true;
  if (!overlay) {
    overlay = new Overlay();
  }
  const element = document.elementFromPoint(
    mousePos.x,
    mousePos.y,
  ) as HTMLElement | null;
  if (element) {
    // highlight the initial point.
    overlay.inspect([element], getInspectName(element));
  }

  window.addEventListener("pointerover", handleElementPointerOver, true);
  window.addEventListener("click", handleInspectorClick, true);
};

const exitInspectorMode = () => {
  inspecting = false;
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  window.removeEventListener("pointerover", handleElementPointerOver, true);
  window.removeEventListener("click", handleInspectorClick, true);
};

const handleElementPointerOver = (e: PointerEvent) => {
  const target = getEventElement(e.target);
  if (!target || !overlay) return;
  overlay.inspect([target], getInspectName(target));
};

const handleInspectorClick = async (e: MouseEvent) => {
  e.preventDefault();
  exitInspectorMode();
  const target = getEventElement(e.target);
  if (!target) return;

  const debugSource = await findDebugSourceByHostInstance(target);
  if (!debugSource) {
    if (!isReactDevtoolsRunning()) {
      alert(`React Developer Tools does not appear to be running.
Please install/enable React Developer Tools, refresh the page, and try again.`);
    } else {
      alert(`This element cannot be opened in React Inspector.
Try selecting a parent React element instead.`);
    }
    return;
  }

  const tmpId = "_TMP";
  document.getElementById(tmpId)?.removeAttribute("id");
  target.id = tmpId;
  window.postMessage("inspected", "*");

  const deepLink = getEditorLink(openInEditorUrl, debugSource);
  if (openInEditorMethod === "fetch") {
    fetch(deepLink);
  } else {
    window.open(deepLink);
  }
};

window.addEventListener("message", ({ data }) => {
  if (data !== "inspect" && data.type !== "options") return;

  if (data === "inspect") {
    if (!checkDevtoolsGlobalHook()) {
      alert(`React was not detected on this page.
If this page uses React, make sure React Developer Tools is installed and running, then refresh.`);
      return;
    }
    if (inspecting) {
      exitInspectorMode();
    } else {
      startInspectorMode();
    }
  }

  if (data.type === "options" && data.openInEditorUrl) {
    openInEditorUrl = data.openInEditorUrl;
    openInEditorMethod = data.openInEditorMethod;
  }
});

const handleInspectElement = (e: KeyboardEvent) => {
  if (e.key?.toLowerCase() === "escape") {
    e.preventDefault();
    exitInspectorMode();
  }
};

window.addEventListener("keydown", handleInspectElement);

window.addEventListener("mousemove", (e: MouseEvent) => {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
});

export {};
