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
      chrome.tabs.sendMessage(tabId, { action: 'PING_SCANNER' }, (res) => {
        if (!chrome.runtime.lastError && res && res.success) {
          resolve(true);
        } else {
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId },
              files: [
                'content/dom-utils.js',
                'content/facebook-detector.js',
                'content/facebook-trainer.js',
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

  // Navigate to specific Facebook Group by ID or Link
  if (message.action === 'NAVIGATE_TO_GROUP') {
    (async () => {
      const input = (message.groupIdOrUrl || '').trim();
      if (!input) {
        sendResponse({ success: false, error: 'Group ID or URL cannot be empty.' });
        return;
      }

      let targetUrl = '';
      let groupId = '';

      if (input.startsWith('http://') || input.startsWith('https://')) {
        targetUrl = input;
        const match = input.match(/facebook\.com\/groups\/([a-zA-Z0-9._-]+)/);
        groupId = match ? match[1] : '';
      } else if (input.includes('facebook.com/groups/')) {
        targetUrl = `https://${input.replace(/^\/+/, '')}`;
        const match = input.match(/facebook\.com\/groups\/([a-zA-Z0-9._-]+)/);
        groupId = match ? match[1] : '';
      } else {
        // Raw Group ID or Slug (e.g. 1840651402763977)
        groupId = input.replace(/[^a-zA-Z0-9._-]/g, '');
        targetUrl = `https://www.facebook.com/groups/${groupId}/`;
      }

      // Find existing Facebook tab or use active tab
      const fbTab = await findFacebookTab();
      let tabToUse = fbTab;

      if (tabToUse) {
        await chrome.tabs.update(tabToUse.id, { url: targetUrl, active: true });
        if (tabToUse.windowId) {
          try { await chrome.windows.update(tabToUse.windowId, { focused: true }); } catch (e) {}
        }
      } else {
        tabToUse = await chrome.tabs.create({ url: targetUrl, active: true });
      }

      // Save to recent groups in storage
      try {
        const stored = await chrome.storage.local.get(['fb_ai_recent_groups']);
        const recent = Array.isArray(stored.fb_ai_recent_groups) ? stored.fb_ai_recent_groups : [];
        const existingIdx = recent.findIndex(g => g.id === groupId || g.url === targetUrl);
        const entry = { id: groupId || input, url: targetUrl, name: message.name || `Group ${groupId || ''}`, lastUsed: Date.now() };
        if (existingIdx !== -1) {
          recent[existingIdx] = { ...recent[existingIdx], ...entry };
        } else {
          recent.unshift(entry);
        }
        await chrome.storage.local.set({ fb_ai_recent_groups: recent.slice(0, 15) });
      } catch (e) {}

      sendResponse({ success: true, targetUrl, groupId, tabId: tabToUse.id });
    })();
    return true;
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

  // Forward scan, delete, trainer and inspection messages to Facebook Tab
  if ([
    'START_SCAN', 'INSTANT_SCAN', 'RESET_SCAN', 'PAUSE_SCAN',
    'RESUME_SCAN', 'STOP_SCAN', 'BULK_DELETE', 'PAUSE_DELETE',
    'RESUME_DELETE', 'STOP_DELETE', 'INSPECT_DOM_PATHS', 'TRAIN_SELECTORS',
    'START_AUTOMATION', 'PAUSE_AUTOMATION', 'RESUME_AUTOMATION', 'STOP_AUTOMATION',
    'GET_AUTOMATION_STATE', 'ANALYZE_CURRENT_DIALOG'
  ].includes(message.action)) {
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
