const getCurrentTab = async () => {
  const queryOptions = { active: true, currentWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
};

const openEditorUrlInBackground = async (deepLink: string, tabId?: number) => {
  if (typeof tabId === "number") {
    await chrome.tabs.update(tabId, { url: deepLink });
    return;
  }

  await chrome.tabs.create({ url: deepLink, active: false });
};

const sendInspectSignal = async (msg: string, tabId?: number) => {
  const target = tabId || (await (await getCurrentTab()).id) || 0;
  chrome.tabs.sendMessage(target, msg);
};

const reactInspectorMenuItemId = "react-inspector";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: reactInspectorMenuItemId,
    title: "Inspect with React Inspector",
    contexts: ["all"],
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "inspect") {
    sendInspectSignal("inspect");
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === reactInspectorMenuItemId) {
    sendInspectSignal("inspect", tab?.id);
  }
});

chrome.action.onClicked.addListener((tab) => {
  sendInspectSignal("inspect", tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "open-editor-url") {
    return;
  }

  const deepLink = message.deepLink;
  if (typeof deepLink !== "string" || deepLink.length === 0) {
    sendResponse({ ok: false });
    return;
  }

  openEditorUrlInBackground(deepLink, sender.tab?.id)
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));

  return true;
});

export {};
