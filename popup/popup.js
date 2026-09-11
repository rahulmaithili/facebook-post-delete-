/**
 * FB AI Post Manager - Popup Controller
 * Supports in-popup quick scanning, live result browsing, AI analysis, and minimize controls.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const contextTitle = document.getElementById('contextTitle');
  const typeBadge = document.getElementById('typeBadge');
  const adminBadge = document.getElementById('adminBadge');

  const statScanned = document.getElementById('statScanned');
  const statDelete = document.getElementById('statDelete');
  const statReview = document.getElementById('statReview');

  const btnMinimize = document.getElementById('btnMinimize');
  const btnClosePopup = document.getElementById('btnClosePopup');
  const btnOptions = document.getElementById('btnOptions');
  const popupBodyContent = document.getElementById('popupBodyContent');

  const btnInstantScan = document.getElementById('btnInstantScan');
  const instantScanBtnText = document.getElementById('instantScanBtnText');
  const btnQuickScan = document.getElementById('btnQuickScan');
  const scanBtnText = document.getElementById('scanBtnText');
  const btnResetScan = document.getElementById('btnResetScan');
  const btnOpenDashboard = document.getElementById('btnOpenDashboard');

  const popupProgressSection = document.getElementById('popupProgressSection');
  const popupProgressText = document.getElementById('popupProgressText');
  const popupProgressCount = document.getElementById('popupProgressCount');
  const popupProgressFill = document.getElementById('popupProgressFill');
  const btnStopQuickScan = document.getElementById('btnStopQuickScan');

  const dragBar = document.getElementById('dragBar');
  const dragHandle = document.getElementById('dragHandle');
  const btnDockLeft = document.getElementById('btnDockLeft');
  const btnDockRight = document.getElementById('btnDockRight');

  const btnPopoutWindow = document.getElementById('btnPopoutWindow');
  const popupResultsSection = document.getElementById('popupResultsSection');
  const resultsCountBadge = document.getElementById('resultsCountBadge');
  const cbSelectAllPopup = document.getElementById('cbSelectAllPopup');
  const popupPostsList = document.getElementById('popupPostsList');
  const btnPopupAnalyzeAi = document.getElementById('btnPopupAnalyzeAi');
  const btnPopupDelete = document.getElementById('btnPopupDelete');
  const popupSelCount = document.getElementById('popupSelCount');

  // Group Target & DOM Trainer Elements
  const groupInput = document.getElementById('groupInput');
  const btnOpenGroup = document.getElementById('btnOpenGroup');
  const recentGroupsBar = document.getElementById('recentGroupsBar');
  const recentChips = document.getElementById('recentChips');
  const btnTrainSelectors = document.getElementById('btnTrainSelectors');
  const pillFeed = document.getElementById('pillFeed');
  const pillPosts = document.getElementById('pillPosts');
  const pillMenu = document.getElementById('pillMenu');
  const pillRemoval = document.getElementById('pillRemoval');
  const trainerReportText = document.getElementById('trainerReportText');

  let activeTabId = null;
  let currentGroupId = null;
  let isScanning = false;
  let scannedPosts = [];
  let selectedIds = new Set();
  let settings = null;

  // Check if running in dedicated Window mode (pinned to screen edge)
  const urlParams = new URLSearchParams(window.location.search);
  const isWindowMode = urlParams.get('mode') === 'window';
  if (isWindowMode) {
    document.body.classList.add('window-mode');
    if (btnPopoutWindow) btnPopoutWindow.style.display = 'none';
  }

  // Window Docking & Dragging Controls
  if (btnDockLeft) {
    btnDockLeft.addEventListener('click', () => {
      const winHeight = (window.screen && window.screen.availHeight) ? window.screen.availHeight - 40 : 750;
      if (isWindowMode) {
        chrome.windows.getCurrent((win) => {
          chrome.windows.update(win.id, { left: 0, top: 20, width: 450, height: winHeight });
        });
      } else {
        chrome.windows.create({
          url: chrome.runtime.getURL('popup/popup.html?mode=window'),
          type: 'popup',
          width: 450,
          height: winHeight,
          left: 0,
          top: 20,
          focused: true
        }, () => window.close());
      }
    });
  }

  if (btnDockRight) {
    btnDockRight.addEventListener('click', () => {
      const screenW = (window.screen && window.screen.availWidth) ? window.screen.availWidth : 1440;
      const winHeight = (window.screen && window.screen.availHeight) ? window.screen.availHeight - 40 : 750;
      const leftPos = Math.max(0, screenW - 460);

      if (isWindowMode) {
        chrome.windows.getCurrent((win) => {
          chrome.windows.update(win.id, { left: leftPos, top: 20, width: 450, height: winHeight });
        });
      } else {
        chrome.windows.create({
          url: chrome.runtime.getURL('popup/popup.html?mode=window'),
          type: 'popup',
          width: 450,
          height: winHeight,
          left: leftPos,
          top: 20,
          focused: true
        }, () => window.close());
      }
    });
  }

  // Draggable Window handler
  if (dragBar) {
    let isDragging = false;
    let startScreenX = 0;
    let startScreenY = 0;
    let startWinLeft = 0;
    let startWinTop = 0;

    dragBar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.dock-btn')) return;
      if (!isWindowMode) {
        chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
        window.close();
        return;
      }

      chrome.windows.getCurrent((win) => {
        isDragging = true;
        startScreenX = e.screenX;
        startScreenY = e.screenY;
        startWinLeft = win.left || 0;
        startWinTop = win.top || 0;
        document.body.style.userSelect = 'none';
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.screenX - startScreenX;
      const deltaY = e.screenY - startScreenY;
      const newLeft = Math.max(0, startWinLeft + deltaX);
      const newTop = Math.max(0, startWinTop + deltaY);

      chrome.windows.getCurrent((win) => {
        chrome.windows.update(win.id, { left: Math.round(newLeft), top: Math.round(newTop) });
      });
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    });
  }

  // Load Settings
  settings = await StorageManager.getSettings();

  // Load existing posts from storage
  async function loadExistingPosts() {
    scannedPosts = await StorageManager.getPosts();
    updateStatsDisplay();
    if (scannedPosts.length > 0) {
      popupResultsSection.style.display = 'flex';
      renderPostsList();
    }
  }

  function updateStatsDisplay() {
    const total = scannedPosts.length;
    const deleteCount = scannedPosts.filter(p => p.recommendation === 'DELETE').length;
    const reviewCount = scannedPosts.filter(p => p.recommendation === 'REVIEW').length;

    statScanned.textContent = total;
    statDelete.textContent = deleteCount;
    statReview.textContent = reviewCount;
    resultsCountBadge.textContent = total;

    updateSelectionCount();
  }

  function updateSelectionCount() {
    popupSelCount.textContent = selectedIds.size;
    btnPopupDelete.disabled = selectedIds.size === 0;

    if (cbSelectAllPopup) {
      if (scannedPosts.length === 0) {
        cbSelectAllPopup.checked = false;
        cbSelectAllPopup.indeterminate = false;
      } else if (selectedIds.size === scannedPosts.length) {
        cbSelectAllPopup.checked = true;
        cbSelectAllPopup.indeterminate = false;
      } else if (selectedIds.size > 0) {
        cbSelectAllPopup.checked = false;
        cbSelectAllPopup.indeterminate = true;
      } else {
        cbSelectAllPopup.checked = false;
        cbSelectAllPopup.indeterminate = false;
      }
    }
  }

  // Helper to reliably find Facebook tab (whether popup is active or in a side popout window)
  async function getFacebookTab() {
    return new Promise((resolve) => {
      // First check active tab in current window
      chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
        if (activeTabs && activeTabs.length && activeTabs[0].url && activeTabs[0].url.includes('facebook.com')) {
          resolve(activeTabs[0]);
          return;
        }

        // If running in dedicated side window or popout, find any active or open Facebook tab
        chrome.tabs.query({ url: '*://*.facebook.com/*' }, (fbTabs) => {
          if (fbTabs && fbTabs.length) {
            const activeFb = fbTabs.find(t => t.active) || fbTabs[0];
            resolve(activeFb);
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  // Ensure content scripts are active on the Facebook tab (auto-injects if tab was opened before extension reload)
  async function ensureContentScriptsInjected(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'PING_SCANNER' }, (res) => {
        if (!chrome.runtime.lastError && res && res.success) {
          resolve(true);
        } else {
          // If script not injected (e.g. extension was reloaded after tab was loaded), inject programmatically
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
              setTimeout(() => resolve(true), 150);
            }).catch(() => resolve(false));
          } else {
            resolve(false);
          }
        }
      });
    });
  }

  // Detect active Facebook tab
  async function checkActiveTab() {
    const activeTab = await getFacebookTab();
    if (!activeTab) {
      setOfflineState('No Facebook tab detected. Open Facebook Group/Page.');
      return;
    }

    activeTabId = activeTab.id;
    await ensureContentScriptsInjected(activeTab.id);

    // Query content script
    chrome.tabs.sendMessage(activeTab.id, { action: 'DETECT_CONTEXT' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.context) {
        statusDot.className = 'status-dot active';
        statusText.textContent = 'Facebook Detected';
        contextTitle.textContent = activeTab.title || 'Facebook Page';
        typeBadge.textContent = 'FB TAB';
        adminBadge.textContent = 'Permissions Ready';
        adminBadge.className = 'badge admin-badge';
        return;
      }

      const ctx = response.context;
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Connected to Facebook';
      contextTitle.textContent = ctx.name || 'Facebook';

      if (ctx.type === 'GROUP') {
        typeBadge.textContent = 'FB Group';
        typeBadge.className = 'badge group-badge';
        if (ctx.id) {
          currentGroupId = ctx.id;
          if (groupInput && !groupInput.value) {
            groupInput.value = ctx.id;
          }
          StorageManager.saveRecentGroup({ id: ctx.id, name: ctx.name, url: ctx.url }).then(() => {
            loadRecentGroups();
          });
        }
      } else if (ctx.type === 'PAGE') {
        typeBadge.textContent = 'FB Page';
        typeBadge.className = 'badge page-badge';
      } else {
        typeBadge.textContent = ctx.type || 'FB Feed';
        typeBadge.className = 'badge';
      }

      if (ctx.isAdmin) {
        adminBadge.textContent = 'Admin / Manager';
        adminBadge.className = 'badge admin-badge';
      } else {
        adminBadge.textContent = 'Viewer / Member';
        adminBadge.className = 'badge';
      }

      // Live inspect DOM paths on this active tab
      inspectPathsLive(activeTab.id);
    });
  }

  function setOfflineState(msg) {
    statusDot.className = 'status-dot warning';
    statusText.textContent = 'Not Connected';
    contextTitle.textContent = msg;
    typeBadge.textContent = 'OFFLINE';
    adminBadge.textContent = 'Open FB Group/Page';
  }

  // Load Recent Groups into UI chips
  async function loadRecentGroups() {
    if (!recentChips || !recentGroupsBar) return;
    const groups = await StorageManager.getRecentGroups();
    if (!groups || groups.length === 0) {
      recentGroupsBar.style.display = 'none';
      return;
    }

    recentGroupsBar.style.display = 'flex';
    recentChips.innerHTML = groups.slice(0, 6).map(g => {
      const displayName = (g.name && g.name !== 'Facebook' && !g.name.includes('Checking')) ? g.name : (g.id || 'Group');
      const safeName = Helpers.escapeHtml(displayName);
      const safeId = Helpers.escapeHtml(g.id || g.url || '');
      return `
        <span class="group-chip" data-id="${safeId}" title="Target: ${safeName} (${safeId})">
          <span class="group-chip-name">${safeName}</span>
          <span class="group-chip-del" data-del-id="${safeId}" title="Remove from history">✕</span>
        </span>
      `;
    }).join('');

    // Attach click events to chips
    recentChips.querySelectorAll('.group-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('group-chip-del')) {
          e.stopPropagation();
          const delId = e.target.dataset.delId;
          StorageManager.removeRecentGroup(delId).then(() => loadRecentGroups());
          return;
        }
        const targetId = chip.dataset.id;
        if (groupInput) groupInput.value = targetId;
        executeGroupNavigation(targetId);
      });
    });
  }

  // Execute navigation to Facebook Group
  async function executeGroupNavigation(idOrUrl = null) {
    const target = (idOrUrl || (groupInput ? groupInput.value : '')).trim();
    if (!target) {
      alert('Please enter a Facebook Group ID or Link (e.g. 1840651402763977)');
      return;
    }

    if (btnOpenGroup) {
      btnOpenGroup.disabled = true;
      btnOpenGroup.textContent = 'Opening...';
    }

    chrome.runtime.sendMessage({
      action: 'NAVIGATE_TO_GROUP',
      groupIdOrUrl: target
    }, async (res) => {
      if (btnOpenGroup) {
        btnOpenGroup.disabled = false;
        btnOpenGroup.textContent = '🚀 Open';
      }

      if (res && res.success) {
        currentGroupId = res.groupId;
        await loadRecentGroups();
        setTimeout(async () => {
          await checkActiveTab();
        }, 1500);
      } else {
        alert(res ? res.error : 'Failed to navigate to group');
      }
    });
  }

  if (btnOpenGroup) {
    btnOpenGroup.addEventListener('click', () => executeGroupNavigation());
  }

  if (groupInput) {
    groupInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeGroupNavigation();
      }
    });
  }

  // Live inspect DOM paths on active tab
  // Live inspect DOM paths on active tab
  async function inspectPathsLive(tabId = null) {
    const targetTabId = tabId || activeTabId;
    if (!targetTabId) return;

    // Check if trained selectors already exist in storage
    const trained = await StorageManager.getTrainedSelectors(currentGroupId);
    if (trained && pillRemoval) {
      pillRemoval.className = 'trainer-pill success';
      pillRemoval.textContent = `Action: ${trained.deleteMenuItemText || 'Trained'}`;
    }

    const applyReport = (r) => {
      if (!r) return;
      if (pillFeed) {
        pillFeed.className = r.feed && r.feed.found ? 'trainer-pill success' : 'trainer-pill warning';
        pillFeed.textContent = r.feed && r.feed.found ? 'Feed: OK' : 'Feed: Standard';
      }
      if (pillPosts) {
        pillPosts.className = r.posts && r.posts.found ? 'trainer-pill success' : 'trainer-pill';
        pillPosts.textContent = `Posts: ${r.posts ? r.posts.count : 0}`;
      }
      if (pillMenu) {
        pillMenu.className = r.actionTrigger && r.actionTrigger.found ? 'trainer-pill success' : 'trainer-pill warning';
        pillMenu.textContent = r.actionTrigger && r.actionTrigger.found ? 'Menu: OK' : 'Menu: Check';
      }
    };

    chrome.runtime.sendMessage({ action: 'INSPECT_DOM_PATHS' }, (res) => {
      if (res && res.report) {
        applyReport(res.report);
      } else {
        chrome.tabs.sendMessage(targetTabId, { action: 'INSPECT_DOM_PATHS' }, (res2) => {
          if (res2 && res2.report) applyReport(res2.report);
        });
      }
    });
  }

  // Trigger selector auto-trainer
  if (btnTrainSelectors) {
    btnTrainSelectors.addEventListener('click', async () => {
      const fbTab = await getFacebookTab();
      if (!fbTab) {
        alert('Please open or focus the Facebook Group tab first.');
        return;
      }

      btnTrainSelectors.disabled = true;
      btnTrainSelectors.textContent = '⏳ Training...';
      if (trainerReportText) {
        trainerReportText.style.display = 'block';
        trainerReportText.textContent = 'Testing DOM paths and checking 3-dots action menu on active post...';
      }

      await ensureContentScriptsInjected(fbTab.id);

      const handleTrainingResult = async (res) => {
        btnTrainSelectors.disabled = false;
        btnTrainSelectors.textContent = '⚡ Train Selectors';

        if (res && res.success && res.training) {
          const t = res.training;
          await StorageManager.saveTrainedSelectors(currentGroupId || t.groupId, t);

          if (pillRemoval) {
            pillRemoval.className = 'trainer-pill success';
            pillRemoval.textContent = `Action: ${t.deleteMenuItemText || 'Trained'}`;
          }

          if (trainerReportText) {
            trainerReportText.textContent = `✅ ${t.message || 'Paths trained successfully! Ready for bulk post deletion.'}`;
          }

          await inspectPathsLive(fbTab.id);
        } else {
          if (trainerReportText) {
            trainerReportText.textContent = `⚠️ ${res ? res.error || (res.training && res.training.message) : 'Could not train selectors. Ensure feed posts are visible.'}`;
          }
        }
      };

      chrome.runtime.sendMessage({ action: 'TRAIN_SELECTORS' }, async (res) => {
        if (!res || !res.success) {
          chrome.tabs.sendMessage(fbTab.id, { action: 'TRAIN_SELECTORS' }, async (res2) => {
            handleTrainingResult(res2);
          });
        } else {
          handleTrainingResult(res);
        }
      });
    });
  }

  function getTypeIcon(type) {
    if (type === 'IMAGE') return '🖼️';
    if (type === 'VIDEO') return '🎬';
    if (type === 'LINK') return '🔗';
    if (type === 'REEL') return '📱';
    return '📝';
  }

  // Render Post List directly inside the popup
  function renderPostsList() {
    if (scannedPosts.length === 0) {
      popupPostsList.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px;">No posts scanned yet. Click "Quick Scan" above!</div>';
      return;
    }

    popupPostsList.innerHTML = scannedPosts.slice(0, 100).map(post => {
      const isSelected = selectedIds.has(post.id);
      const rec = post.recommendation || 'PENDING';
      const recClass = rec === 'KEEP' ? 'rec-keep' : (rec === 'DELETE' ? 'rec-delete' : 'rec-review');
      const dateInfo = Helpers.formatDate(post.date);

      // Thumbnail preview
      let thumbHtml = '';
      if (post.imageUrl) {
        thumbHtml = `<img src="${Helpers.escapeHtml(post.imageUrl)}" class="mini-thumb-img" alt="Thumbnail" onerror="this.style.display='none';">`;
      } else {
        thumbHtml = `<div class="mini-thumb-placeholder">${getTypeIcon(post.type)}</div>`;
      }

      // Display text caption or photo indicator
      let displayText = post.text ? Helpers.escapeHtml(post.text.substring(0, 110)) : '';
      if (!displayText) {
        if (post.type === 'IMAGE' || post.imageUrl) displayText = '📷 Photo Post';
        else if (post.type === 'VIDEO' || post.type === 'REEL') displayText = '🎬 Video / Reel Post';
        else displayText = '(No text caption)';
      }

      const viewsCount = post.views || 0;

      return `
        <div class="post-card-mini ${isSelected ? 'selected' : ''}" data-id="${post.id}">
          <input type="checkbox" class="mini-cb" data-id="${post.id}" ${isSelected ? 'checked' : ''}>
          <div class="mini-thumb-wrap">
            ${thumbHtml}
          </div>
          <div class="mini-content">
            <div class="mini-meta">
              <span class="mini-author" title="${Helpers.escapeHtml(post.author || 'User')}">${Helpers.escapeHtml(post.author || 'User')}</span>
              <div class="mini-meta-right">
                <span class="type-badge">${post.type || 'TEXT'}</span>
                <a href="${Helpers.escapeHtml(post.url || '#')}" target="_blank" class="mini-link" title="Open on Facebook">↗</a>
              </div>
            </div>
            <div class="mini-text" title="${Helpers.escapeHtml(post.text || '')}">
              ${displayText}
            </div>
            <div class="mini-footer">
              <div class="mini-eng">
                <span title="Likes / Reactions">👍 ${Helpers.formatCount(post.reactions)}</span>
                <span title="Comments">💬 ${Helpers.formatCount(post.comments)}</span>
                <span title="Shares">🔄 ${Helpers.formatCount(post.shares)}</span>
                <span title="Views / Plays">👁️ ${Helpers.formatCount(viewsCount)}</span>
              </div>
              <span class="rec-pill-mini ${recClass}">${rec}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach checkbox events
    popupPostsList.querySelectorAll('.mini-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        const card = popupPostsList.querySelector(`.post-card-mini[data-id="${id}"]`);
        if (card) card.classList.toggle('selected', e.target.checked);
        updateSelectionCount();
      });
    });
  }

  // Select / Deselect All checkbox event in popup
  if (cbSelectAllPopup) {
    cbSelectAllPopup.addEventListener('change', (e) => {
      const shouldSelectAll = e.target.checked;
      if (shouldSelectAll) {
        scannedPosts.forEach(p => selectedIds.add(p.id));
      } else {
        selectedIds.clear();
      }

      // Update UI cards
      popupPostsList.querySelectorAll('.mini-cb').forEach(cb => {
        cb.checked = shouldSelectAll;
      });
      popupPostsList.querySelectorAll('.post-card-mini').forEach(card => {
        card.classList.toggle('selected', shouldSelectAll);
      });

      updateSelectionCount();
    });
  }

  // 1. Direct Instant Scan (Ultra Fast, grabs currently loaded posts in <100ms without waiting for scrolling)
  btnInstantScan.addEventListener('click', async () => {
    if (isScanning) return;
    const fbTab = await getFacebookTab();
    if (!fbTab) {
      alert('Please open an active Facebook Group or Page tab first.');
      return;
    }

    instantScanBtnText.textContent = 'Scanning...';
    btnInstantScan.disabled = true;

    await ensureContentScriptsInjected(fbTab.id);

    const handleInstantResult = async (res) => {
      instantScanBtnText.textContent = '⚡ Direct Scan';
      btnInstantScan.disabled = false;

      if (res && res.success && Array.isArray(res.posts)) {
        scannedPosts = res.posts;
        await StorageManager.savePosts(scannedPosts);
        popupResultsSection.style.display = 'flex';
        updateStatsDisplay();
        renderPostsList();
        if (scannedPosts.length === 0) {
          alert('No posts detected on screen right now. Try scrolling down slightly on the Facebook page or click "Deep Scan" to scan automatically.');
        }
      } else {
        alert('Could not extract posts directly. Please refresh the Facebook page and try again.');
      }
    };

    chrome.runtime.sendMessage({ action: 'INSTANT_SCAN' }, async (res) => {
      if (res && res.success) {
        await handleInstantResult(res);
      } else {
        chrome.tabs.sendMessage(fbTab.id, { action: 'INSTANT_SCAN' }, async (res2) => {
          await handleInstantResult(res2);
        });
      }
    });
  });

  // 2. Deep Scroll Scan (Paced fast scrolling to load older timeline posts)
  btnQuickScan.addEventListener('click', async () => {
    if (isScanning) return;
    const fbTab = await getFacebookTab();
    if (!fbTab) {
      alert('Please open an active Facebook Group or Page tab first.');
      return;
    }

    isScanning = true;
    scanBtnText.textContent = 'Deep Scanning...';
    btnQuickScan.disabled = true;
    btnInstantScan.disabled = true;

    popupProgressSection.style.display = 'flex';
    popupResultsSection.style.display = 'flex';
    popupProgressText.textContent = 'Scanning timeline...';
    popupProgressCount.textContent = '0 posts';
    popupProgressFill.style.width = '0%';

    await ensureContentScriptsInjected(fbTab.id);

    const scanOptions = {
      scanLimit: (settings && settings.scanLimit) || 250,
      scanDelay: 500 // Fast scroll delay
    };

    chrome.runtime.sendMessage({
      action: 'START_SCAN',
      options: scanOptions
    }, (res) => {
      if (!res || !res.success) {
        chrome.tabs.sendMessage(fbTab.id, {
          action: 'START_SCAN',
          options: scanOptions
        }, (res2) => {
          if (!res2 || !res2.success) {
            alert('Could not start scanner on this page. Refresh Facebook and try again.');
            stopScanningUi();
          }
        });
      }
    });
  });

  // 3. Reset Scan (Clears all scanned posts from storage and UI)
  btnResetScan.addEventListener('click', async () => {
    if (scannedPosts.length === 0) {
      alert('No posts to reset.');
      return;
    }

    if (!confirm('Are you sure you want to reset and clear all scanned posts?')) {
      return;
    }

    // Stop scan if currently running
    if (isScanning) {
      const fbTab = await getFacebookTab();
      if (fbTab) {
        chrome.tabs.sendMessage(fbTab.id, { action: 'RESET_SCAN' });
      }
      stopScanningUi();
    }

    // Clear local data and extension storage
    scannedPosts = [];
    selectedIds.clear();
    await StorageManager.clearPosts();

    updateStatsDisplay();
    renderPostsList();
    popupProgressSection.style.display = 'none';
  });

  // Stop scan button in popup
  btnStopQuickScan.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_SCAN' });
      }
    });
    stopScanningUi();
  });

  function stopScanningUi() {
    isScanning = false;
    scanBtnText.textContent = '📜 Deep Scan';
    instantScanBtnText.textContent = '⚡ Direct Scan';
    btnQuickScan.disabled = false;
    btnInstantScan.disabled = false;
    popupProgressSection.style.display = 'none';
  }

  // In-Popup AI Analysis
  btnPopupAnalyzeAi.addEventListener('click', async () => {
    if (scannedPosts.length === 0) return;
    btnPopupAnalyzeAi.disabled = true;
    btnPopupAnalyzeAi.textContent = 'Analyzing...';
    popupProgressSection.style.display = 'flex';
    popupProgressText.textContent = 'Gemini AI Analysis...';

    try {
      const analyzer = new AIAnalyzer(settings);
      scannedPosts = await analyzer.analyzePosts(scannedPosts, (curr, total, msg) => {
        popupProgressCount.textContent = `${curr}/${total}`;
        popupProgressFill.style.width = `${Math.round((curr / total) * 100)}%`;
      });

      await StorageManager.savePosts(scannedPosts);
      updateStatsDisplay();
      renderPostsList();
    } catch (err) {
      alert(`AI Analysis error: ${err.message}`);
    } finally {
      btnPopupAnalyzeAi.disabled = false;
      btnPopupAnalyzeAi.textContent = 'Analyze with AI';
      popupProgressSection.style.display = 'none';
    }
  });

  // In-Popup Delete Selected
  btnPopupDelete.addEventListener('click', async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    if (!confirm(`Are you sure you want to delete ${count} selected post(s)? This will execute on Facebook.`)) {
      return;
    }

    const postsToDelete = scannedPosts.filter(p => selectedIds.has(p.id));
    btnPopupDelete.disabled = true;
    btnPopupDelete.textContent = 'Deleting...';

    const fbTab = await getFacebookTab();
    if (!fbTab) {
      alert('Facebook tab not found. Please keep Facebook tab open.');
      btnPopupDelete.disabled = false;
      btnPopupDelete.textContent = `Delete Selected (${selectedIds.size})`;
      return;
    }

    const handleBulkDeleteResponse = async (res) => {
      btnPopupDelete.textContent = `Delete Selected (${selectedIds.size})`;
      btnPopupDelete.disabled = false;

      if (res && res.success) {
        const successIds = new Set(
          (res.results.details || [])
            .filter(d => d.status === 'SUCCESS')
            .map(d => d.id)
        );

        if (successIds.size > 0) {
          scannedPosts = scannedPosts.filter(p => !successIds.has(p.id));
          successIds.forEach(id => selectedIds.delete(id));
          await StorageManager.savePosts(scannedPosts);
          updateStatsDisplay();
          renderPostsList();
        }

        let summaryMsg = `Deletion results:\n✅ ${res.results.successful} deleted`;
        if (res.results.failed > 0) summaryMsg += `\n❌ ${res.results.failed} failed`;
        if (res.results.skipped > 0) summaryMsg += `\n⚠️ ${res.results.skipped} skipped`;

        if (res.results.details && res.results.details.length > 0) {
          const detailMsgs = res.results.details
            .filter(d => d.status !== 'SUCCESS')
            .map(d => `• ${d.message || d.reason || d.error || 'Skipped'}`)
            .slice(0, 3)
            .join('\n');
          if (detailMsgs) summaryMsg += `\n\nReason:\n${detailMsgs}`;
        }

        alert(summaryMsg);
      } else {
        alert(`Deletion error: ${res ? res.error : 'Could not communicate with Facebook tab'}`);
      }
    };

    chrome.runtime.sendMessage({
      action: 'BULK_DELETE',
      posts: postsToDelete,
      options: { deleteBatchDelay: settings.deleteBatchDelay }
    }, (res) => {
      if (!res || !res.success) {
        chrome.tabs.sendMessage(fbTab.id, {
          action: 'BULK_DELETE',
          posts: postsToDelete,
          options: { deleteBatchDelay: settings.deleteBatchDelay }
        }, handleBulkDeleteResponse);
      } else {
        handleBulkDeleteResponse(res);
      }
    });
  });

  // Runtime progress listener for live scanning
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SCAN_PROGRESS') {
      const data = message.data;
      popupProgressCount.textContent = `${data.count} / ${data.limit}`;
      const pct = Math.round((data.count / data.limit) * 100);
      popupProgressFill.style.width = `${pct}%`;

      if (data.latestPosts && data.latestPosts.length) {
        const postMap = new Map(scannedPosts.map(p => [p.id, p]));
        data.latestPosts.forEach(p => postMap.set(p.id, p));
        scannedPosts = Array.from(postMap.values());
        updateStatsDisplay();
        renderPostsList();
      }
    } else if (message.action === 'SCAN_COMPLETED') {
      stopScanningUi();
      if (message.data && message.data.posts) {
        scannedPosts = message.data.posts;
        StorageManager.savePosts(scannedPosts);
        updateStatsDisplay();
        renderPostsList();
      }
    }
  });

  // Open Full Dashboard ONLY when explicitly clicked!
  btnOpenDashboard.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_DASHBOARD' });
    window.close();
  });

  // Minimize / Compact view toggle
  btnMinimize.addEventListener('click', () => {
    popupBodyContent.classList.toggle('minimized');
    if (popupBodyContent.classList.contains('minimized')) {
      btnMinimize.title = 'Expand View';
    } else {
      btnMinimize.title = 'Minimize / Compact View';
    }
  });

  // Popout / Pin Window (Opens side window that stays open even when Facebook tab is refreshed)
  if (btnPopoutWindow) {
    // Hide popout button if already running in dedicated window
    if (window.location.search.includes('mode=window')) {
      btnPopoutWindow.style.display = 'none';
      document.body.style.maxHeight = '100vh';
      document.body.style.height = '100vh';
    } else {
      btnPopoutWindow.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
        window.close();
      });
    }
  }

  // Close Popup
  btnClosePopup.addEventListener('click', () => {
    window.close();
  });

  // Options Button
  btnOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  // Initialize
  await loadRecentGroups();
  await checkActiveTab();
  await loadExistingPosts();
});
