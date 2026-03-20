import './auto-reload';

const SHEETS_URL_PATTERN = "https://docs.google.com/spreadsheets/d/";

/** Check if a URL is a Google Sheets page */
function isGoogleSheetsUrl(url: string | undefined): boolean {
  return url?.startsWith(SHEETS_URL_PATTERN) ?? false;
}

/** Open the side panel for a given tab */
async function openSidePanel(tabId: number): Promise<void> {
  await chrome.sidePanel.open({ tabId });
}

/** Handle extension icon click - open side panel */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  if (isGoogleSheetsUrl(tab.url)) {
    await openSidePanel(tab.id);
  }
});

/** Enable/disable the action icon based on the current tab URL */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.url) return;

  const isSheets = isGoogleSheetsUrl(tab.url);
  if (isSheets) {
    await chrome.action.enable(tabId);
  } else {
    await chrome.action.disable(tabId);
  }

  // Notify side panel of URL change
  if (changeInfo.status === "complete" && isSheets) {
    chrome.runtime.sendMessage({
      type: "TAB_UPDATED",
      tabId,
      url: tab.url,
    }).catch(() => {
      // Side panel may not be open - ignore
    });
  }
});

/** Handle messages from the side panel */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_CURRENT_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url && isGoogleSheetsUrl(tab.url) ? tab.url : null;
      sendResponse({ type: "CURRENT_URL", url });
    });
    return true; // Keep message channel open for async response
  }
  return false;
});

/** Set side panel behavior - open on action click */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
