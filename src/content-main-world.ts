import {
  checkDevtoolsGlobalHook,
  findDebugSourceByHostInstance,
  findFiberByHostInstance,
  getDebugSourceFromFiber,
  getEditorLink,
  isCustomProtocolUrl,
  isReactDevtoolsRunning,
} from "./utils";
import Overlay from "./Overlay";
import { DEFAULT_OPEN_IN_EDITOR_URL } from "./constants";

let overlay: Overlay | null = null;
let inspecting = false;
let openInEditorUrl = DEFAULT_OPEN_IN_EDITOR_URL;
const mousePos = { x: 0, y: 0 };
let openInEditorMethod = "url";
let openEditorRequestCounter = 0;

const OPEN_EDITOR_REQUEST_TYPE = "react-inspector-open-editor";
const OPEN_EDITOR_RESULT_TYPE = "react-inspector-open-editor-result";
const OPEN_EDITOR_ACK_TIMEOUT_MS = 600;

const getEventElement = (target: EventTarget | null): HTMLElement | null => {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  if (target instanceof Element) return target as HTMLElement;
  if (target instanceof Node) return target.parentElement as HTMLElement | null;
  return null;
};

const consumeEvent = (event: Event) => {
  if (event.cancelable) {
    event.preventDefault();
  }
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
};

const openCustomProtocolByBackground = (deepLink: string): Promise<boolean> => {
  const requestId = `open-editor-${Date.now()}-${openEditorRequestCounter++}`;

  return new Promise((resolve) => {
    let done = false;

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", handleResultMessage);
      window.clearTimeout(timeoutId);
      resolve(ok);
    };

    const handleResultMessage = ({ data, source }: MessageEvent) => {
      if (source !== window || !data || typeof data !== "object") return;
      if (
        data.type !== OPEN_EDITOR_RESULT_TYPE ||
        data.requestId !== requestId
      ) {
        return;
      }
      finish(Boolean(data.ok));
    };

    const timeoutId = window.setTimeout(
      () => finish(false),
      OPEN_EDITOR_ACK_TIMEOUT_MS,
    );
    window.addEventListener("message", handleResultMessage);
    window.postMessage(
      { type: OPEN_EDITOR_REQUEST_TYPE, requestId, deepLink },
      "*",
    );
  });
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
  window.addEventListener("pointerdown", handleInspectorPointerDown, true);
};

const exitInspectorMode = () => {
  inspecting = false;
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  window.removeEventListener("pointerover", handleElementPointerOver, true);
  window.removeEventListener("pointerdown", handleInspectorPointerDown, true);
};

const handleElementPointerOver = (e: PointerEvent) => {
  const target = getEventElement(e.target);
  if (!target || !overlay) return;
  overlay.inspect([target], getInspectName(target));
};

const handleInspectorPointerDown = async (e: PointerEvent) => {
  consumeEvent(e);
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
  } else if (isCustomProtocolUrl(deepLink)) {
    const opened = await openCustomProtocolByBackground(deepLink);
    if (!opened) {
      window.open(deepLink);
    }
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
