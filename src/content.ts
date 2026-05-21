// @ts-ignore
import mainWorld from "./content-main-world?script&module";
import { DEFAULT_OPEN_IN_EDITOR_URL } from "./constants";

const OPEN_EDITOR_REQUEST_TYPE = "react-inspector-open-editor";
const OPEN_EDITOR_RESULT_TYPE = "react-inspector-open-editor-result";

type OpenEditorRequest = {
  type: typeof OPEN_EDITOR_REQUEST_TYPE;
  requestId: string;
  deepLink: string;
};

const script = document.createElement("script");
script.src = chrome.runtime.getURL(mainWorld);
script.type = "module";

script.onload = () => {
  chrome.runtime.onMessage.addListener((request) => {
    if (request === "inspect") {
      window.postMessage(request, "*");
      chrome.storage.sync.get(
        {
          openInEditorUrl: DEFAULT_OPEN_IN_EDITOR_URL,
          openInEditorMethod: "url",
        },
        (items) => {
          window.postMessage({ type: "options", ...items }, "*");
        },
      );
    }
  });
};

window.addEventListener("message", ({ data }) => {
  if (data === "inspected") {
    const res = chrome.runtime.sendMessage(data);
    res.catch(() => {});
    return;
  }

  if (
    data &&
    data.type === OPEN_EDITOR_REQUEST_TYPE &&
    typeof data.requestId === "string" &&
    typeof data.deepLink === "string"
  ) {
    const request = data as OpenEditorRequest;
    chrome.runtime
      .sendMessage({ type: "open-editor-url", deepLink: request.deepLink })
      .then((result) => {
        const ok = !result || result.ok !== false;
        window.postMessage(
          { type: OPEN_EDITOR_RESULT_TYPE, requestId: request.requestId, ok },
          "*",
        );
      })
      .catch(() => {
        window.postMessage(
          {
            type: OPEN_EDITOR_RESULT_TYPE,
            requestId: request.requestId,
            ok: false,
          },
          "*",
        );
      });
  }
});

document.head.append(script);
