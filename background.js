chrome.action.onClicked.addListener(tab => {
  const sourceTabId = Number.isInteger(tab?.id) ? tab.id : "";
  const url = new URL(chrome.runtime.getURL("app.html"));
  if (sourceTabId !== "") url.searchParams.set("sourceTabId", String(sourceTabId));
  chrome.tabs.create({ url: url.href });
});
