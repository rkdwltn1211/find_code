// background.js
console.log("background loaded");
chrome.runtime.onMessage.addListener((msg) => {
  // no-op
});


chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "MAL_ALERT" && msg?.tabId) {
    chrome.tabs.sendMessage(msg.tabId, { type: "MAL_ALERT", payload: msg.payload });
  }
});
