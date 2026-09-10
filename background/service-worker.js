/**
 * FB AI Post Manager - Background Service Worker (Manifest V3)
 * Coordinates tabs, messaging between Dashboard/Popup/Content scripts,
 * and maintains badge counts.
 */

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[FB AI Post Manager] Installed successfully. Reason:', details.reason);
  try {
    const { StorageManager, DEFAULT_SETTINGS } = await import('../storage/storage.js');
    const existing = await StorageManager.getSettings();
    if (!existing.apiKey) {
      await StorageManager.saveSettings(DEFAULT_SETTINGS);
    }
  } catch (err) {
    // import may not be supported directly in service worker without modules, handled via storage fallback
  }
});

// Update extension icon badge
function updateBadge(count) {
  if (count && count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red for delete recommendations
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Open or switch to existing Dashboard tab
async function openDashboardTab() {
  const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
  const tabs = await chrome.tabs.query({ url: dashboardUrl });

  if (tabs.length > 0) {
    // Focus existing dashboard tab
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  } else {
    // Open new tab
    await chrome.tabs.create({ url: dashboardUrl });
  }
}

// Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OPEN_DASHBOARD') {
    openDashboardTab().then(() => sendResponse({ success: true }));
    return true;
  }

  // Pin tool to side of screen as independent popup window (doesn't close on page refresh!)
  if (message.action === 'OPEN_SIDE_PANEL') {
    chrome.windows.getCurrent((currWin) => {
      const width = 450;
      const height = currWin && currWin.height ? currWin.height : 760;
      // Position on the far right edge of the current window/screen so it doesn't block the center
      const left = currWin && currWin.width ? (currWin.left + currWin.width - width - 10) : 980;
      const top = currWin && currWin.top ? currWin.top : 30;

      chrome.windows.create({
        url: chrome.runtime.getURL('popup/popup.html?mode=window'),
        type: 'popup',
        width: width,
        height: height,
        left: Math.max(0, left),
        top: Math.max(0, top),
        focused: true
      }, (win) => {
        sendResponse({ success: true, windowId: win.id });
      });
    });
    return true;
  }

  if (message.action === 'UPDATE_BADGE') {
    updateBadge(message.count);
    sendResponse({ success: true });
    return true;
  }

  // Find any active or open Facebook tab across all browser windows
  async function findFacebookTab() {
    const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
    if (!tabs || !tabs.length) return null;
    return tabs.find(t => t.active) || tabs[0];
  }

  // Ensure content scripts are alive on the Facebook tab
  async function ensureContentScripts(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'DETECT_CONTEXT' }, (res) => {
        if (!chrome.runtime.lastError && res) {
          resolve(true);
        } else {
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId },
              files: [
                'content/dom-utils.js',
                'content/facebook-detector.js',
                'content/facebook-scanner.js',
                'content/facebook-actions.js'
              ]
            }).then(() => {
              setTimeout(() => resolve(true), 250);
            }).catch(() => resolve(false));
          } else {
            resolve(false);
          }
        }
      });
    });
  }

  // Forward context detection query to Facebook tab
  if (message.action === 'GET_ACTIVE_FB_CONTEXT') {
    findFacebookTab().then(async (fbTab) => {
      if (!fbTab) {
        sendResponse({ success: false, reason: 'No active Facebook tab found' });
        return;
      }
      await ensureContentScripts(fbTab.id);
      chrome.tabs.sendMessage(fbTab.id, { action: 'DETECT_CONTEXT' }, (res) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(res);
        }
      });
    });
    return true;
  }

  // Forward scan and delete messages from Dashboard/Popup to Facebook Tab
  if (['START_SCAN', 'INSTANT_SCAN', 'RESET_SCAN', 'PAUSE_SCAN', 'RESUME_SCAN', 'STOP_SCAN', 'BULK_DELETE', 'STOP_DELETE'].includes(message.action)) {
    findFacebookTab().then(async (targetTab) => {
      if (!targetTab) {
        sendResponse({ success: false, reason: 'No active Facebook tab found. Please open Facebook.' });
        return;
      }
      await ensureContentScripts(targetTab.id);
      chrome.tabs.sendMessage(targetTab.id, message, (res) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(res);
        }
      });
    });
    return true;
  }
});
