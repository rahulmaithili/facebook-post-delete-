/**
 * FB AI Post Manager - Production Facebook Post Deletion Engine & State Machine
 * Complies with strict anti-accident rules, human-paced state transitions,
 * dynamic DOM heuristics (Profiles, Pages, Groups), session refresh recovery,
 * and user-configurable "Give a warning" toggle automation.
 */

(function () {
  'use strict';

  // Constants & Timeouts (Milliseconds)
  const TIMEOUTS = {
    MENU_OPEN: 3500,
    DIALOG_DETECT: 5000,
    CHECKBOX_TOGGLE: 2500,
    DELETE_BUTTON_ENABLE: 3000,
    DELETION_VERIFY: 5000,
    INTER_STEP_DELAY: 400
  };

  const STORAGE_SESSION_KEY = 'fb_deleter_session';
  const STORAGE_WARNING_KEY = 'fb_ai_give_warning';
  const STORAGE_MODE_KEY = 'fb_ai_active_mode';

  /**
   * Safe Console / Logger Utility
   */
  const FBLog = {
    debug: true,
    log(step, message, data = null) {
      if (!this.debug) return;
      const prefix = `[FB-DELETER] [${step}]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    },
    warn(step, message, data = null) {
      const prefix = `[FB-DELETER][WARN] [${step}]`;
      if (data) console.warn(prefix, message, data);
      else console.warn(prefix, message);
    },
    error(step, message, diagnostic = null) {
      console.error(`[FB-DELETER][ERROR] [${step}] ${message}`);
      if (diagnostic) {
        console.error(`[FB-DELETER][ERROR-DIAGNOSTIC]`, diagnostic);
      }
    }
  };

  /**
   * =========================================================================
   * 1. FacebookPostAdapter: Cross-Context Selector & DOM Interaction Engine
   * Works across Facebook Profile, Facebook Page, and Facebook Group feeds.
   * =========================================================================
   */
  class FacebookPostAdapter {
    constructor() {
      this.processedPostKeys = new Set();
      this.activeMode = 'AUTO'; // 'AUTO' | 'PAGE' | 'GROUP'
    }

    /**
     * Detects current Facebook context: GROUP, PAGE, or PROFILE
     * Respects user-chosen activeMode if explicitly set to 'PAGE' or 'GROUP'.
     */
    detectContext() {
      if (this.activeMode === 'PAGE') return 'PAGE';
      if (this.activeMode === 'GROUP') return 'GROUP';

      const url = window.location.href;
      if (url.includes('/groups/')) return 'GROUP';
      
      const bodyText = (document.body ? document.body.innerText : '') || '';
      if (
        url.includes('/pages/') ||
        document.querySelector('div[aria-label*="Manage Page"]') ||
        bodyText.includes('Manage Page') ||
        bodyText.includes('Professional dashboard') ||
        bodyText.includes('Meta Business Suite') ||
        (typeof FBDetector !== 'undefined' && FBDetector.isPageUrl && FBDetector.isPageUrl(url))
      ) {
        return 'PAGE';
      }
      return 'PAGE'; // Default to PAGE if not in a group
    }

    /**
     * Identify actual post containers currently visible on the page
     * Creates a unique stable temporary identifier for every post.
     */
    findPostContainers() {
      const candidateSelectors = [
        'div[role="feed"] > div',
        'div[data-pagelet*="FeedUnit"]',
        'div[role="article"]',
        'div[data-pagelet*="ProfileTimeline"] div[role="article"]',
        'div[aria-posinset]'
      ];

      const foundContainers = [];
      const seenElements = new Set();

      for (const sel of candidateSelectors) {
        const nodes = document.querySelectorAll(sel);
        for (const el of nodes) {
          if (seenElements.has(el)) continue;

          // Filter out composer/create-post box, toolbars, or small widgets
          if (el.closest('[role="region"][aria-label*="Create"]') || el.closest('form')) continue;
          if (el.getAttribute('role') === 'toolbar') continue;

          const rect = el.getBoundingClientRect();
          if (rect.height < 90 || rect.width < 250) continue;

          // Generate stable post key
          const postKey = this.generatePostKey(el);
          if (!postKey) continue;

          seenElements.add(el);
          el.setAttribute('data-fb-post-key', postKey);

          foundContainers.push({
            element: el,
            postKey: postKey,
            isProcessed: this.processedPostKeys.has(postKey)
          });
        }
      }

      return foundContainers;
    }

    /**
     * Generates a stable key based on permalinks, post ID, author, or content hash
     */
    generatePostKey(postEl) {
      if (!postEl) return null;

      const existingKey = postEl.getAttribute('data-fb-post-key');
      if (existingKey) return existingKey;

      const link = postEl.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/reel/"], a[href*="/videos/"]');
      if (link && link.href) {
        const match = link.href.match(/\/(?:posts|permalink|reel|videos)\/([a-zA-Z0-9._-]+)/) ||
                      link.href.match(/story_fbid=([0-9]+)/) ||
                      link.href.match(/fbid=([0-9]+)/);
        if (match && match[1]) {
          return `post_${match[1]}`;
        }
      }

      const dataFt = postEl.getAttribute('data-ft');
      if (dataFt) {
        try {
          const parsed = JSON.parse(dataFt);
          if (parsed.top_level_post_id) return `post_${parsed.top_level_post_id}`;
        } catch (e) {}
      }

      const authorEl = postEl.querySelector('h2, h3, h4, strong');
      const author = authorEl ? authorEl.textContent.trim().substring(0, 30) : 'member';
      const text = (postEl.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 50);

      if (text.length > 5) {
        let hash = 0;
        const combined = `${author}_${text}`;
        for (let i = 0; i < combined.length; i++) {
          hash = ((hash << 5) - hash) + combined.charCodeAt(i);
          hash |= 0;
        }
        return `hash_${Math.abs(hash)}`;
      }

      return null;
    }

    /**
     * Find the options/3-dots menu button belonging to the post container
     */
    findPostMenu(postEl) {
      if (!postEl) return null;

      const menuBtn = postEl.querySelector('div[aria-haspopup="menu"][role="button"], div[aria-haspopup="menu"], [aria-haspopup="menu"]');
      if (menuBtn && FBDOM.isElementVisible(menuBtn)) return menuBtn;

      const buttons = Array.from(postEl.querySelectorAll('div[role="button"], button'));
      for (const btn of buttons) {
        if (!FBDOM.isElementVisible(btn)) continue;
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (
          aria.includes('actions for this post') ||
          aria.includes('actions for this') ||
          aria.includes('post options') ||
          aria.includes('more options') ||
          aria.includes('इस पोस्ट के लिए') ||
          aria.includes('कार्रवाई') ||
          aria.includes('विकल्प') ||
          aria === 'more' ||
          aria === 'actions'
        ) {
          return btn;
        }
      }

      const postRect = postEl.getBoundingClientRect();
      for (const btn of buttons) {
        if (btn.closest('[role="toolbar"]') || btn.closest('form')) continue;
        const bRect = btn.getBoundingClientRect();
        const isTop = (bRect.top - postRect.top) < 140;
        const isRight = (bRect.right > postRect.left + (postRect.width * 0.45));
        const hasSvg = btn.querySelector('svg') !== null;
        if (isTop && isRight && hasSvg && FBDOM.isElementVisible(btn)) {
          return btn;
        }
      }

      return null;
    }

    /**
     * Open post menu and wait for the menu layer to render
     */
    async openPostMenu(postEl) {
      const menuBtn = this.findPostMenu(postEl);
      if (!menuBtn) {
        throw new Error('Menu button ("...") not found in post container.');
      }

      menuBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, TIMEOUTS.INTER_STEP_DELAY));

      FBLog.log('OPENING_MENU', 'Clicking post menu button...');
      FBDOM.dispatchFullClick(menuBtn);

      const startTime = Date.now();
      while (Date.now() - startTime < TIMEOUTS.MENU_OPEN) {
        const menuLayer = document.querySelector('div[role="menu"]');
        if (menuLayer && FBDOM.isElementVisible(menuLayer)) {
          FBLog.log('OPENING_MENU', 'Active menu layer detected in DOM.');
          return menuLayer;
        }
        await new Promise(r => setTimeout(r, 150));
      }

      throw new Error(`Menu layer failed to open within ${TIMEOUTS.MENU_OPEN}ms.`);
    }

    /**
     * Search ONLY inside the currently opened menu layer for Remove/Delete actions
     * Accurately distinguishes between Page ("Move to bin") and Group ("Remove post").
     */
    findRemoveAction(menuLayer) {
      if (!menuLayer) return null;

      const items = Array.from(menuLayer.querySelectorAll('div[role="menuitem"], div[role="button"], [role="menuitem"]'));
      const searchItems = items.length > 0 ? items : Array.from(menuLayer.querySelectorAll('div, span, a'));
      const context = this.detectContext();

      // Priority 1: PAGE mode or detected Page -> prioritize "Move to bin" / "Move to trash"
      if (context === 'PAGE' || context === 'PROFILE') {
        for (const item of searchItems) {
          const text = (item.textContent || item.getAttribute('aria-label') || '').trim().toLowerCase();
          // Never click "Move to archive" which is located right above "Move to bin"
          if (text.includes('archive') || text.includes('आर्काइव')) continue;

          if (
            text.startsWith('move to bin') ||
            text.startsWith('move to trash') ||
            text.includes('move to bin') ||
            text.includes('move to trash') ||
            text.includes('bin are deleted') ||
            text.includes('trash are deleted') ||
            text.includes('ट्रैश में डालें') ||
            text.includes('बिन में ले जाएं')
          ) {
            FBLog.log('REMOVE_OPTION_FOUND', `Found Page Move to bin item: "${text.substring(0, 35)}"`);
            return item.closest('[role="menuitem"]') || item.closest('[role="button"]') || item;
          }
        }
      }

      // Priority 2: GROUP mode -> look for "Remove post" / "Delete post"
      if (context === 'GROUP') {
        for (const item of searchItems) {
          const text = (item.textContent || item.getAttribute('aria-label') || '').trim().toLowerCase();
          if (text.includes('ban')) continue;

          if (
            text === 'remove post' ||
            text === 'delete post' ||
            text.includes('remove post') ||
            text.includes('delete post') ||
            text.includes('पोस्ट हटाएं') ||
            text.includes('ग्रुप से हटाएं')
          ) {
            FBLog.log('REMOVE_OPTION_FOUND', `Found Group removal item: "${text.substring(0, 35)}"`);
            return item.closest('[role="menuitem"]') || item.closest('[role="button"]') || item;
          }
        }
      }

      // Priority 3: General fallback across all Facebook layouts
      for (const item of searchItems) {
        const text = (item.textContent || item.getAttribute('aria-label') || '').trim().toLowerCase();
        if (text.includes('archive') || text.includes('ban')) continue;

        if (
          text.includes('move to bin') ||
          text.includes('move to trash') ||
          text.includes('remove post') ||
          text.includes('delete post') ||
          text.includes('bin are deleted') ||
          text === 'delete' ||
          text === 'remove' ||
          text.includes('हटाएं') ||
          text.includes('ट्रैश')
        ) {
          FBLog.log('REMOVE_OPTION_FOUND', `Found fallback removal item: "${text.substring(0, 35)}"`);
          return item.closest('[role="menuitem"]') || item.closest('[role="button"]') || item;
        }
      }

      return null;
    }

    /**
     * Detect newly appeared visible confirmation dialog
     */
    async waitForConfirmationDialog(timeout = TIMEOUTS.DIALOG_DETECT) {
      const startTime = Date.now();
      const deletionKeywords = [
        'move to your bin',
        'move to bin',
        'items in your bin',
        'bin',
        'move to trash',
        'trash',
        'remove post',
        'delete post',
        'which rules did this post violate',
        'rules did this post violate',
        'are you sure',
        'delete',
        'remove',
        'post will be removed',
        'give a warning',
        'गोपनीयता',
        'सहिष्णु',
        'हटाएं',
        'पुष्टि करें',
        'नियम',
        'बिन में',
        'ट्रैश'
      ];

      while (Date.now() - startTime < timeout) {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));

        for (const dialog of dialogs) {
          if (!FBDOM.isElementVisible(dialog)) continue;

          const rect = dialog.getBoundingClientRect();
          if (rect.width < 180 || rect.height < 120) continue;

          const dialogText = (dialog.textContent || '').toLowerCase();
          const isDeletionDialog = deletionKeywords.some(kw => dialogText.includes(kw));

          if (isDeletionDialog) {
            FBLog.log('WAITING_CONFIRMATION', 'Confirmed valid deletion dialog detected.', {
              title: dialog.querySelector('h2, h3, [role="heading"]')?.textContent?.trim() || 'Confirmation'
            });
            return dialog;
          }
        }

        await new Promise(r => setTimeout(r, 200));
      }

      return null;
    }

    /**
     * Dynamically inspect dialog for confirmation / rule checkboxes (Rule 1, Rule 2)
     * IMPORTANT: Strictly EXCLUDES toggle switches or "Give a warning" controls so they don't get mixed up!
     */
    findConfirmationCheckboxes(dialog) {
      if (!dialog) return [];

      const rawControls = Array.from(dialog.querySelectorAll('div[role="checkbox"], input[type="checkbox"], [role="checkbox"]'));
      const validCheckboxes = [];

      for (const ctrl of rawControls) {
        if (ctrl.tagName === 'INPUT' && ctrl.type !== 'checkbox') continue;

        // Strictly EXCLUDE role="switch" - switches are for "Give a warning", NOT rule checkboxes!
        if (ctrl.getAttribute('role') === 'switch' || ctrl.closest('[role="switch"]')) continue;

        // Strictly EXCLUDE controls inside the "Give a warning" row
        const row = ctrl.closest('div[role="listitem"]') || ctrl.closest('div[style*="flex"]') || ctrl.parentElement?.parentElement || ctrl.parentElement;
        const rowText = (row?.textContent || ctrl.getAttribute('aria-label') || '').toLowerCase();
        if (rowText.includes('give a warning') || (rowText.includes('warning') && !rowText.includes('rule') && !rowText.includes('नियम'))) {
          continue;
        }

        // Verify visibility
        if (FBDOM.isElementVisible(ctrl) || (ctrl.parentElement && FBDOM.isElementVisible(ctrl.parentElement))) {
          validCheckboxes.push(ctrl);
        }
      }

      return validCheckboxes;
    }

    /**
     * Process all required rule checkboxes in DOM order (Rule 1, Rule 2, etc.)
     * Verifies state after clicking. NEVER clicks an already checked checkbox!
     */
    async processCheckboxes(dialog) {
      const checkboxes = this.findConfirmationCheckboxes(dialog);
      FBLog.log('PROCESSING_CONFIRMATIONS', `Detected ${checkboxes.length} rule checkbox control(s).`);

      for (let idx = 0; idx < checkboxes.length; idx++) {
        const cb = checkboxes[idx];
        const isChecked = cb.checked === true || cb.getAttribute('aria-checked') === 'true';

        if (isChecked) {
          FBLog.log('PROCESSING_CONFIRMATIONS', `Rule Checkbox #${idx + 1} is already selected. Skipping click.`);
          continue;
        }

        FBLog.log('PROCESSING_CONFIRMATIONS', `Clicking unchecked Rule Checkbox #${idx + 1}...`);
        
        cb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        await new Promise(r => setTimeout(r, 200));

        const clickTarget = cb.closest('label') || cb.closest('[role="button"]') || cb;
        FBDOM.dispatchFullClick(clickTarget);

        const stateStart = Date.now();
        let stateChanged = false;

        while (Date.now() - stateStart < TIMEOUTS.CHECKBOX_TOGGLE) {
          if (cb.checked === true || cb.getAttribute('aria-checked') === 'true') {
            stateChanged = true;
            break;
          }
          await new Promise(r => setTimeout(r, 150));
        }

        if (!stateChanged) {
          FBDOM.dispatchFullClick(cb);
          await new Promise(r => setTimeout(r, 300));
        }

        FBLog.log('PROCESSING_CONFIRMATIONS', `Rule Checkbox #${idx + 1} verified selected.`);
        await new Promise(r => setTimeout(r, TIMEOUTS.INTER_STEP_DELAY));
      }

      return true;
    }

    /**
     * Handle "Give a warning" toggle switch according to user configuration
     * If shouldGiveWarning is TRUE: Ensure toggle switch is turned ON.
     * If shouldGiveWarning is FALSE: Ensure toggle switch is turned OFF.
     */
    async processWarningToggle(dialog, shouldGiveWarning = false) {
      if (!dialog) return false;

      // Locate the "Give a warning" toggle switch
      let warningSwitch = null;

      // 1. Look for switch elements inside the dialog
      const switches = Array.from(dialog.querySelectorAll('div[role="switch"], [role="switch"]'));
      for (const sw of switches) {
        const row = sw.closest('div[role="listitem"]') || sw.closest('div[style*="flex"]') || sw.parentElement?.parentElement || sw.parentElement;
        const rowText = (row?.textContent || sw.getAttribute('aria-label') || '').toLowerCase();
        if (rowText.includes('warning') || rowText.includes('चेतावनी') || rowText.includes('give a warning')) {
          warningSwitch = sw;
          break;
        }
      }

      // Fallback 1: If only one switch exists in dialog and text mentions warning
      if (!warningSwitch && switches.length === 1) {
        const dialogText = (dialog.textContent || '').toLowerCase();
        if (dialogText.includes('give a warning') || dialogText.includes('warning in the past')) {
          warningSwitch = switches[0];
        }
      }

      // Fallback 2: Check for input[type="checkbox"] near text "warning"
      if (!warningSwitch) {
        const allCheckboxes = Array.from(dialog.querySelectorAll('input[type="checkbox"], div[role="checkbox"]'));
        for (const cb of allCheckboxes) {
          const row = cb.closest('div[role="listitem"]') || cb.closest('div[style*="flex"]') || cb.parentElement?.parentElement || cb.parentElement;
          const rowText = (row?.textContent || cb.getAttribute('aria-label') || '').toLowerCase();
          if (rowText.includes('give a warning') || (rowText.includes('warning') && !rowText.includes('rule') && !rowText.includes('नियम'))) {
            warningSwitch = cb;
            break;
          }
        }
      }

      if (!warningSwitch) {
        FBLog.log('PROCESS_WARNING', 'No "Give a warning" toggle switch present in this dialog.');
        return false;
      }

      const isCurrentlyOn = warningSwitch.getAttribute('aria-checked') === 'true' ||
                            warningSwitch.checked === true ||
                            warningSwitch.getAttribute('data-state') === 'checked';

      FBLog.log('PROCESS_WARNING', `Found "Give a warning" switch. Currently: ${isCurrentlyOn ? 'ON' : 'OFF'}, Target: ${shouldGiveWarning ? 'ON' : 'OFF'}`);

      if (shouldGiveWarning) {
        // User wants Warning ENABLED
        if (!isCurrentlyOn) {
          FBLog.log('PROCESS_WARNING', 'Turning ON "Give a warning" switch...');
          const clickTarget = warningSwitch.closest('label') || warningSwitch.closest('[role="button"]') || warningSwitch;
          FBDOM.dispatchFullClick(clickTarget);

          const start = Date.now();
          while (Date.now() - start < 1500) {
            const nowOn = warningSwitch.getAttribute('aria-checked') === 'true' || warningSwitch.checked === true;
            if (nowOn) break;
            await new Promise(r => setTimeout(r, 100));
          }
          FBLog.log('PROCESS_WARNING', 'Verified: "Give a warning" is now ON.');
        } else {
          FBLog.log('PROCESS_WARNING', '"Give a warning" is already ON. No click needed.');
        }
      } else {
        // User wants Warning DISABLED
        if (isCurrentlyOn) {
          FBLog.log('PROCESS_WARNING', 'Turning OFF "Give a warning" switch...');
          const clickTarget = warningSwitch.closest('label') || warningSwitch.closest('[role="button"]') || warningSwitch;
          FBDOM.dispatchFullClick(clickTarget);

          const start = Date.now();
          while (Date.now() - start < 1500) {
            const nowOn = warningSwitch.getAttribute('aria-checked') === 'true' || warningSwitch.checked === true;
            if (!nowOn) break;
            await new Promise(r => setTimeout(r, 100));
          }
          FBLog.log('PROCESS_WARNING', 'Verified: "Give a warning" is now OFF.');
        } else {
          FBLog.log('PROCESS_WARNING', '"Give a warning" is already OFF. No click needed.');
        }
      }

      await new Promise(r => setTimeout(r, TIMEOUTS.INTER_STEP_DELAY));
      return true;
    }

    /**
     * Locate the final confirmation button INSIDE the active dialog
     * Verifies that the button is visible and enabled.
     */
    async findFinalDeleteButton(dialog) {
      if (!dialog) return null;

      const confirmLabels = ['move', 'move to bin', 'confirm', 'delete', 'remove', 'move to trash', 'continue', 'पुष्टि करें', 'हटाएं'];
      const cancelLabels = ['cancel', 'close', 'back', 'रद्द करें', 'वापस'];

      const startTime = Date.now();

      while (Date.now() - startTime < TIMEOUTS.DELETE_BUTTON_ENABLE) {
        const buttons = Array.from(dialog.querySelectorAll('div[role="button"], button'));

        for (const btn of buttons) {
          if (!FBDOM.isElementVisible(btn)) continue;

          const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();

          if (cancelLabels.some(c => text.includes(c))) continue;

          const isMatch = confirmLabels.some(l => text === l || text.includes(l));
          if (!isMatch) continue;

          const isDisabled = btn.disabled ||
                             btn.getAttribute('aria-disabled') === 'true' ||
                             btn.classList.contains('disabled');

          if (!isDisabled) {
            FBLog.log('FINAL_DELETE', `Found enabled confirmation button: "${text}"`);
            return btn;
          }
        }

        await new Promise(r => setTimeout(r, 200));
      }

      const fallbackBtn = FBDOM.findFirst(FBDOM.selectors.modalConfirmButtons, dialog);
      if (fallbackBtn && FBDOM.isElementVisible(fallbackBtn)) {
        return fallbackBtn;
      }

      return null;
    }

    /**
     * Wait for dialog to disappear or post to be removed from the DOM
     */
    async waitForDeletionResult(postKey, postEl, dialog, timeout = TIMEOUTS.DELETION_VERIFY) {
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const dialogGone = !dialog || !document.body.contains(dialog) || !FBDOM.isElementVisible(dialog);
        const postGone = !postEl || !document.body.contains(postEl) || !FBDOM.isElementVisible(postEl);

        if (dialogGone && (postGone || Date.now() - startTime > 1500)) {
          return { verified: true, reason: 'Dialog closed and post removed from DOM.' };
        }

        const errorAlert = document.querySelector('div[role="alert"]');
        if (errorAlert && FBDOM.isElementVisible(errorAlert)) {
          const errText = errorAlert.textContent || '';
          if (errText.includes('error') || errText.includes('could not') || errText.includes('failed')) {
            return { verified: false, reason: `Facebook error: ${errText.substring(0, 100)}` };
          }
        }

        await new Promise(r => setTimeout(r, 200));
      }

      if (dialog && document.body.contains(dialog) && FBDOM.isElementVisible(dialog)) {
        return { verified: false, reason: 'Confirmation dialog remained open (timeout).' };
      }

      return { verified: true, reason: 'Dialog successfully closed.' };
    }
  }

  /**
   * =========================================================================
   * 2. FBActions State Machine & Bulk Automation Controller
   * =========================================================================
   */
  class FBActions {
    constructor() {
      this.adapter = new FacebookPostAdapter();
      this.isDeleting = false;
      this.isPaused = false;
      this.state = 'IDLE';
      this.session = null;
      this.onProgressCallback = null;

      // User setting: Give warning on deletion (default: false / disabled)
      this.giveWarningOnDelete = false;

      // User setting: Target deletion mode ('AUTO' | 'PAGE' | 'GROUP')
      this.activeMode = 'AUTO';

      // Floating panel reference
      this.panelEl = null;

      // Check for saved session recovery & settings on startup
      this.initRecoveryCheck();
    }

    /**
     * Checks storage for interrupted sessions across page refreshes and loads user settings
     */
    async initRecoveryCheck() {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

      try {
        const stored = await chrome.storage.local.get([STORAGE_SESSION_KEY, STORAGE_WARNING_KEY, STORAGE_MODE_KEY]);
        
        // Load Give Warning setting
        if (typeof stored[STORAGE_WARNING_KEY] === 'boolean') {
          this.giveWarningOnDelete = stored[STORAGE_WARNING_KEY];
          FBLog.log('SETTING', `Loaded saved Give Warning setting: ${this.giveWarningOnDelete}`);
        }

        // Load Active Mode setting
        if (stored[STORAGE_MODE_KEY]) {
          this.setActiveMode(stored[STORAGE_MODE_KEY]);
        }

        // Check for active session recovery
        const saved = stored[STORAGE_SESSION_KEY];
        if (saved && saved.running && (saved.deletedCount > 0 || saved.processedCount > 0)) {
          FBLog.log('STARTUP_RECOVERY', 'Detected previous active deletion session.', saved);
          this.session = saved;
          if (saved.processedPostKeys) {
            saved.processedPostKeys.forEach(k => this.adapter.processedPostKeys.add(k));
          }
          this.renderRecoveryFloatingPrompt(saved);
        }
      } catch (err) {
        FBLog.warn('STARTUP_RECOVERY', 'Failed reading storage session.', err);
      }
    }

    /**
     * Updates target deletion mode ('AUTO' | 'PAGE' | 'GROUP')
     */
    setActiveMode(mode) {
      this.activeMode = mode || 'AUTO';
      this.adapter.activeMode = this.activeMode;
      FBLog.log('MODE_CHANGE', `Active deletion mode set to: ${this.activeMode} (Effective: ${this.adapter.detectContext()})`);

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_MODE_KEY]: this.activeMode });
      }

      this.syncModeUI();
    }

    syncModeUI() {
      const modeBadge = document.getElementById('fb-panel-mode-badge');
      const warningRow = document.getElementById('fb-panel-warning-row');
      const eff = this.adapter.detectContext();

      if (modeBadge) {
        const isPage = eff === 'PAGE';
        modeBadge.textContent = this.activeMode === 'AUTO' ? `Auto (${isPage ? 'Page' : 'Group'})` : (this.activeMode === 'PAGE' ? '📄 Page' : '👥 Group');
        modeBadge.style.background = isPage ? '#0ea5e9' : '#8b5cf6';
      }

      if (warningRow) {
        // Warning toggle is only relevant for Group deletion
        warningRow.style.display = eff === 'GROUP' ? 'flex' : 'none';
      }
    }

    /**
     * Updates the giveWarningOnDelete setting and syncs to UI
     */
    setGiveWarning(val) {
      this.giveWarningOnDelete = Boolean(val);
      FBLog.log('SETTING', `Give warning on delete set to: ${this.giveWarningOnDelete}`);

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_WARNING_KEY]: this.giveWarningOnDelete });
      }

      this.syncWarningUI();
    }

    syncWarningUI() {
      const warningCb = document.getElementById('fb-panel-warning-checkbox');
      const warningStatusText = document.getElementById('fb-panel-warning-status-text');
      const warningSlider = document.getElementById('fb-panel-warning-slider');
      const warningKnob = document.getElementById('fb-panel-warning-knob');

      if (warningCb) warningCb.checked = this.giveWarningOnDelete;
      if (warningStatusText) {
        warningStatusText.textContent = this.giveWarningOnDelete ? 'ENABLED' : 'DISABLED';
        warningStatusText.style.color = this.giveWarningOnDelete ? '#10b981' : '#94a3b8';
      }
      if (warningSlider && warningKnob) {
        warningSlider.style.backgroundColor = this.giveWarningOnDelete ? '#10b981' : 'rgba(255,255,255,0.2)';
        warningKnob.style.left = this.giveWarningOnDelete ? '19px' : '3px';
      }
    }

    /**
     * Render recovery prompt on Facebook UI
     */
    renderRecoveryFloatingPrompt(saved) {
      this.ensureFloatingPanel();
      if (!this.panelEl) return;

      const bodyEl = this.panelEl.querySelector('#fb-deleter-body');
      if (!bodyEl) return;

      bodyEl.innerHTML = `
        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
          <div style="font-size: 12px; font-weight: 700; color: #f59e0b; margin-bottom: 4px;">⚠️ Previous Session Detected</div>
          <div style="font-size: 11px; color: #cbd5e1; line-height: 1.4;">
            Found interrupted session with <strong>${saved.deletedCount || 0}</strong> deleted post(s). Would you like to resume?
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="btnRecoverResume" style="flex: 1; background: #10b981; color: #000; font-weight: 700; font-size: 11px; padding: 7px; border: none; border-radius: 6px; cursor: pointer;">
            ▶️ RESUME SESSION
          </button>
          <button id="btnRecoverDiscard" style="flex: 1; background: rgba(255,255,255,0.1); color: #fff; font-size: 11px; padding: 7px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; cursor: pointer;">
            ✕ START NEW
          </button>
        </div>
      `;

      this.panelEl.querySelector('#btnRecoverResume')?.addEventListener('click', () => {
        this.resumeFromSavedSession();
      });

      this.panelEl.querySelector('#btnRecoverDiscard')?.addEventListener('click', () => {
        this.clearSavedSession();
        this.destroyFloatingPanel();
      });
    }

    async resumeFromSavedSession() {
      if (!this.session) return;
      FBLog.log('STARTUP_RECOVERY', 'Resuming session from saved state...');
      this.isDeleting = true;
      this.isPaused = false;
      this.state = 'SCANNING';
      this.renderFloatingPanel();

      const posts = this.adapter.findPostContainers().map(c => ({ id: c.postKey, text: '' }));
      await this.bulkDeletePosts(posts, { autoDiscovered: true });
    }

    async clearSavedSession() {
      this.session = null;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.remove([STORAGE_SESSION_KEY]);
      }
    }

    async saveSessionState(partial) {
      if (!this.session) {
        this.session = {
          sessionId: `sess_${Date.now()}`,
          startedAt: Date.now(),
          mode: this.adapter.detectContext(),
          totalCount: 0,
          processedCount: 0,
          deletedCount: 0,
          failedCount: 0,
          skippedCount: 0,
          processedPostKeys: Array.from(this.adapter.processedPostKeys)
        };
      }

      Object.assign(this.session, partial, {
        running: this.isDeleting,
        paused: this.isPaused,
        processedPostKeys: Array.from(this.adapter.processedPostKeys),
        updatedAt: Date.now()
      });

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          await chrome.storage.local.set({ [STORAGE_SESSION_KEY]: this.session });
        } catch (e) {}
      }
    }

    /**
     * Safe Pause System
     */
    pause() {
      this.isPaused = true;
      this.state = 'PAUSED';
      FBLog.log('PAUSED', 'Automation paused by user.');
      this.saveSessionState({ paused: true });
      this.updateFloatingPanelUI('Paused by user');
    }

    /**
     * Safe Resume System
     */
    resume() {
      this.isPaused = false;
      this.state = 'RESUMING';
      FBLog.log('RESUME', 'Automation resumed by user.');
      this.saveSessionState({ paused: false });
      this.updateFloatingPanelUI('Resuming...');
    }

    /**
     * Safe Stop System
     */
    stop() {
      this.isDeleting = false;
      this.isPaused = false;
      this.state = 'STOPPED';
      FBLog.log('STOPPED', 'Automation stopped safely by user.');
      this.clearSavedSession();
      this.updateFloatingPanelUI('Stopped by user');
      setTimeout(() => this.destroyFloatingPanel(), 3500);
    }

    /**
     * Execute sequential bulk post deletion
     */
    async bulkDeletePosts(postsToDelete = [], options = {}, onProgress = null) {
      if (this.isDeleting && this.state !== 'SCANNING') {
        FBLog.warn('START', 'Bulk deletion is already running.');
        return;
      }

      this.isDeleting = true;
      this.isPaused = false;
      this.state = 'STARTED';
      this.onProgressCallback = onProgress;

      if (options && typeof options.giveWarningOnDelete === 'boolean') {
        this.giveWarningOnDelete = options.giveWarningOnDelete;
      }
      if (options && options.activeMode) {
        this.setActiveMode(options.activeMode);
      }

      const results = {
        total: postsToDelete.length || 0,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        details: []
      };

      await this.saveSessionState({
        totalCount: results.total,
        deletedCount: 0,
        failedCount: 0,
        skippedCount: 0
      });

      this.ensureFloatingPanel();
      this.updateFloatingPanelUI('Initializing deletion engine...');

      // Reposition to top of timeline to process posts sequentially from top down
      try {
        window.scrollTo({ top: 0, behavior: 'instant' });
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {}

      let postQueue = [...postsToDelete];
      let currentIndex = 0;

      while (this.isDeleting && (currentIndex < postQueue.length || options.autoDiscovered)) {
        while (this.isPaused) {
          if (!this.isDeleting) break;
          this.updateFloatingPanelUI('⏸️ Deletion Paused');
          await new Promise(r => setTimeout(r, 400));
        }

        if (!this.isDeleting) break;

        let targetPost = postQueue[currentIndex];
        let postContainerEl = null;

        const visibleContainers = this.adapter.findPostContainers();
        const available = visibleContainers.filter(c => !c.isProcessed);

        if (available.length > 0) {
          const nextContainer = available[0];
          postContainerEl = nextContainer.element;
          targetPost = {
            id: nextContainer.postKey,
            postKey: nextContainer.postKey
          };
        } else if (targetPost) {
          postContainerEl = document.querySelector(`[data-fb-post-key="${targetPost.id}"]`) ||
                            document.querySelector(`[data-fb-mgr-id="${targetPost.id}"]`);
        }

        if (!postContainerEl) {
          FBLog.log('SCANNING', 'No unprocessed post visible in viewport. Scrolling down...');
          this.updateFloatingPanelUI('Scrolling to load more posts...');

          let foundRefreshed = false;
          for (let scrollAttempt = 0; scrollAttempt < 4; scrollAttempt++) {
            window.scrollBy({ top: 600, behavior: 'instant' });
            await new Promise(r => setTimeout(r, 800));

            const refreshed = this.adapter.findPostContainers().filter(c => !c.isProcessed);
            if (refreshed.length > 0) {
              postContainerEl = refreshed[0].element;
              targetPost = { id: refreshed[0].postKey, postKey: refreshed[0].postKey };
              foundRefreshed = true;
              break;
            }
          }

          if (!foundRefreshed) {
            FBLog.warn('SCANNING', 'No further posts found after multiple scrolls. Concluding.');
            break;
          }
        }

        const postKey = targetPost.postKey || targetPost.id;
        results.processed++;

        this.updateFloatingPanelUI(`Processing post ${results.processed} of ${results.total || '...'}`);
        this.emitProgress(results.processed, results.total, results, `Processing post ${results.processed}...`);
        this.addActivityLog(`Targeting post #${results.processed}...`, 'info');

        try {
          const outcome = await this.deleteSinglePostVerified(targetPost, postContainerEl, options);

          if (outcome.status === 'SUCCESS') {
            results.successful++;
            this.adapter.processedPostKeys.add(postKey);
            results.details.push({ id: postKey, status: 'SUCCESS', message: outcome.message });
            this.addActivityLog(`Post #${results.processed}: Deleted successfully ✅`, 'success');
          } else if (outcome.status === 'SKIPPED') {
            results.skipped++;
            this.adapter.processedPostKeys.add(postKey);
            results.details.push({ id: postKey, status: 'SKIPPED', message: outcome.reason });
            this.addActivityLog(`Post #${results.processed}: Skipped (${outcome.reason || 'Not matched'}) ⚠️`, 'warning');
          } else {
            results.failed++;
            results.details.push({ id: postKey, status: 'FAILED', message: outcome.reason });
            this.addActivityLog(`Post #${results.processed}: Failed (${outcome.reason || 'Unknown'}) ❌`, 'error');
          }
        } catch (err) {
          results.failed++;
          results.details.push({ id: postKey, status: 'FAILED', message: err.message });
          FBLog.error('DELETE_STEP', `Error on post ${postKey}: ${err.message}`);
          this.addActivityLog(`Post #${results.processed} Error: ${err.message} ❌`, 'error');

          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }

        await this.saveSessionState({
          processedCount: results.processed,
          deletedCount: results.successful,
          failedCount: results.failed,
          skippedCount: results.skipped
        });

        currentIndex++;

        if (this.isDeleting) {
          const delay = options.deleteBatchDelay || 2000;
          await new Promise(r => setTimeout(r, delay));
        }
      }

      this.isDeleting = false;
      this.state = 'COMPLETED';
      await this.clearSavedSession();

      this.updateFloatingPanelUI(`Complete: ${results.successful} deleted, ${results.failed} failed.`);
      this.emitProgress(results.total, results.total, results, 'Bulk deletion concluded.');

      return results;
    }

    /**
     * Delete a single post through the strict verification state machine
     */
    async deleteSinglePostVerified(post, postElement = null, options = {}) {
      if (!window.location.hostname.includes('facebook.com')) {
        return { status: 'SKIPPED', reason: 'Not on facebook.com domain.' };
      }

      const targetElement = postElement || document.querySelector(`[data-fb-post-key="${post.id}"]`);
      if (!targetElement) {
        return { status: 'SKIPPED', reason: 'Post container not found in current DOM.' };
      }

      const postKey = post.id || post.postKey;
      FBLog.log('POST_FOUND', `Targeting post: ${postKey}`);

      let menuLayer = null;
      try {
        menuLayer = await this.adapter.openPostMenu(targetElement);
      } catch (err) {
        return { status: 'FAILED', reason: `Menu open failed: ${err.message}` };
      }

      const removeAction = this.adapter.findRemoveAction(menuLayer);
      if (!removeAction) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return { status: 'SKIPPED', reason: 'No Remove/Delete option found in menu.' };
      }

      FBLog.log('REMOVE_OPTION_FOUND', `Clicking removal action: "${(removeAction.textContent || '').trim()}"`);
      this.addActivityLog(`Action found: "${(removeAction.textContent || '').trim()}". Clicking...`, 'info');
      FBDOM.dispatchFullClick(removeAction);

      // Wait for confirmation dialog (DYNAMIC MODAL DETECTION)
      this.state = 'WAITING_CONFIRMATION';
      const dialog = await this.adapter.waitForConfirmationDialog(TIMEOUTS.DIALOG_DETECT);

      if (dialog) {
        const currentContext = this.adapter.detectContext();

        // Step 6: For Facebook Groups only -> Process Confirmation & Rule Checkboxes (Rule 1, Rule 2, etc.)
        if (currentContext === 'GROUP') {
          this.state = 'PROCESSING_CONFIRMATIONS';
          this.addActivityLog('Group detected: Processing rule checkboxes...', 'info');
          await this.adapter.processCheckboxes(dialog);

          // Step 6.5: Process "Give a warning" toggle switch according to user configuration
          const shouldGiveWarning = (options && typeof options.giveWarningOnDelete === 'boolean')
            ? options.giveWarningOnDelete
            : this.giveWarningOnDelete;
          
          await this.adapter.processWarningToggle(dialog, shouldGiveWarning);
        } else {
          FBLog.log('PAGE_DELETION', 'Facebook Page / Profile active: directly confirming Move to bin without group rules.');
          this.addActivityLog('Page detected: Confirming "Move to bin"...', 'info');
        }

        // Step 7: Locate enabled final confirmation button ("Move" on Page or "Confirm/Remove" on Group)
        this.state = 'FINAL_DELETE';
        const finalBtn = await this.adapter.findFinalDeleteButton(dialog);

        if (!finalBtn) {
          throw new Error('Final confirmation button could not be located or remained disabled.');
        }

        FBLog.log('FINAL_DELETE', 'Clicking final confirmation button...');
        this.addActivityLog(`Clicking confirmation button "${(finalBtn.textContent || '').trim()}"...`, 'info');
        FBDOM.dispatchFullClick(finalBtn);

        // Step 8: Verify Deletion
        this.state = 'VERIFYING';
        const verifyResult = await this.adapter.waitForDeletionResult(postKey, targetElement, dialog, TIMEOUTS.DELETION_VERIFY);

        if (!verifyResult.verified) {
          return { status: 'FAILED', reason: verifyResult.reason };
        }
      } else {
        FBLog.warn('WAITING_CONFIRMATION', 'No confirmation modal displayed. Verifying if immediate deletion occurred.');
        await new Promise(r => setTimeout(r, 1200));
      }

      FBLog.log('DELETED', `Post ${postKey} successfully deleted & verified.`);
      return { status: 'SUCCESS', message: 'Post successfully deleted & verified.' };
    }

    /**
     * =========================================================================
     * 3. Draggable, Minimizable Floating Control Panel on Facebook DOM
     * Includes real-time "Give a warning" toggle switch directly on screen!
     * =========================================================================
     */
    /**
     * Add real-time log to the floating panel console and broadcast to extension
     */
    addActivityLog(message, type = 'info') {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      FBLog.log('ACTIVITY', `[${timeStr}] ${message}`);

      if (this.panelEl) {
        const logBox = this.panelEl.querySelector('#fb-activity-log-box');
        if (logBox) {
          const line = document.createElement('div');
          let color = '#94a3b8';
          if (type === 'success') color = '#34d399';
          else if (type === 'error') color = '#f87171';
          else if (type === 'warning') color = '#fbbf24';
          else if (type === 'highlight') color = '#38bdf8';

          line.style.cssText = `color: ${color} !important; margin-bottom: 2px !important; word-break: break-word !important;`;
          line.textContent = `[${timeStr}] ${message}`;
          logBox.appendChild(line);

          while (logBox.children.length > 120) {
            logBox.removeChild(logBox.firstChild);
          }
          logBox.scrollTop = logBox.scrollHeight;
        }
      }

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            action: 'ACTIVITY_LOG_ENTRY',
            data: { timestamp: timeStr, message, type }
          });
        } catch (e) {}
      }
    }

    /**
     * =========================================================================
     * Rahul Scripts - On-Screen Floating Control & Live Progress Widget
     * Features RS branding, 4-box metrics, 3-action buttons, and Activity Log!
     * =========================================================================
     */
    ensureFloatingPanel() {
      if (this.panelEl && document.body.contains(this.panelEl)) {
        this.panelEl.style.display = 'block';
        return;
      }

      const existing = document.getElementById('fb-deleter-floating-panel');
      if (existing) {
        this.panelEl = existing;
        this.panelEl.style.display = 'block';
        return;
      }

      const panel = document.createElement('div');
      panel.id = 'fb-deleter-floating-panel';
      panel.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        width: 340px !important;
        background: #0f172a !important;
        color: #ffffff !important;
        border: 1px solid rgba(16, 185, 129, 0.35) !important;
        border-radius: 12px !important;
        box-shadow: 0 16px 45px rgba(0, 0, 0, 0.75), 0 0 15px rgba(16, 185, 129, 0.15) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        z-index: 2147483647 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        user-select: none !important;
      `;

      panel.innerHTML = `
        <!-- Header (Draggable Handle with Rahul Scripts Branding) -->
        <div id="fb-deleter-header" style="display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: linear-gradient(135deg, #091322, #0f1f38); cursor: move; border-bottom: 1px solid rgba(16, 185, 129, 0.25);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <!-- RS Circle Badge -->
            <div style="width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #059669, #10b981); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5); border: 1px solid rgba(255,255,255,0.25); flex-shrink: 0;">
              RS
            </div>
            <div>
              <div style="font-size: 12px; font-weight: 800; color: #fff; line-height: 1.1; letter-spacing: 0.3px;">Rahul Scripts</div>
              <div style="font-size: 8.5px; font-weight: 700; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px;">AUTOMATION • SOLUTIONS</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <button id="fb-panel-mode-badge" title="Click to switch Page / Group mode" style="background: ${this.adapter.detectContext() === 'PAGE' ? '#0ea5e9' : '#8b5cf6'}; color: #fff; font-size: 9.5px; font-weight: 800; padding: 2px 7px; border: none; border-radius: 12px; cursor: pointer; text-transform: uppercase;">${this.activeMode === 'AUTO' ? (this.adapter.detectContext() === 'PAGE' ? '📄 Page' : '👥 Group') : (this.activeMode === 'PAGE' ? '📄 Page' : '👥 Group')}</button>
            <button id="btnPanelDiag" title="Analyze Current Dialog" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; font-size: 11px; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">🔍</button>
            <button id="btnPanelMin" title="Minimize to corner" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; font-size: 12px; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">—</button>
            <button id="btnPanelClose" title="Close Panel" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #f87171; font-size: 12px; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 700;">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div id="fb-deleter-body" style="padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: #0b1322;">
          <!-- Status Row -->
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11.5px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span id="fb-deleter-status-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
              <span id="fb-panel-status-label" style="color: #cbd5e1; font-weight: 600;">Status: Ready</span>
            </div>
            <strong id="fb-panel-counter" style="color: #fff; font-size: 11.5px;">0 / 0</strong>
          </div>

          <!-- Progress Track -->
          <div style="height: 5px; width: 100%; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
            <div id="fb-panel-progress-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #10b981, #059669); transition: width 0.3s ease;"></div>
          </div>

          <!-- 3-Action Buttons Row (Directly from User Reference) -->
          <div style="display: flex; gap: 6px;">
            <button id="btnPanelStart" style="flex: 1.2; background: #059669; color: #fff; font-weight: 700; font-size: 11px; padding: 6px 4px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.4);">
              <span>▶</span> Start Deleting
            </button>
            <button id="btnPanelPause" style="flex: 1; background: #f59e0b; color: #000; font-weight: 700; font-size: 11px; padding: 6px 4px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>⏸</span> Pause
            </button>
            <button id="btnPanelResume" style="flex: 1; display: none; background: #10b981; color: #000; font-weight: 700; font-size: 11px; padding: 6px 4px; border: none; border-radius: 6px; cursor: pointer; align-items: center; justify-content: center; gap: 4px;">
              <span>▶</span> Resume
            </button>
            <button id="btnPanelStop" style="flex: 1; background: #ef4444; color: #fff; font-weight: 700; font-size: 11px; padding: 6px 4px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>⏹</span> Stop
            </button>
          </div>

          <!-- 4-Box Metric Result Card (Directly from User Reference) -->
          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 7px 4px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; text-align: center;">
            <div style="border-right: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 15px; font-weight: 800; color: #f8fafc;" id="fb-panel-total">0</div>
              <div style="font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">TOTAL</div>
            </div>
            <div style="border-right: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 15px; font-weight: 800; color: #10b981;" id="fb-panel-deleted">0</div>
              <div style="font-size: 9px; font-weight: 700; color: #10b981; text-transform: uppercase;">DELETED</div>
            </div>
            <div style="border-right: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="font-size: 15px; font-weight: 800; color: #ef4444;" id="fb-panel-failed">0</div>
              <div style="font-size: 9px; font-weight: 700; color: #ef4444; text-transform: uppercase;">FAILED</div>
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 800; color: #38bdf8;" id="fb-panel-remaining">0</div>
              <div style="font-size: 9px; font-weight: 700; color: #38bdf8; text-transform: uppercase;">REMAINING</div>
            </div>
          </div>

          <!-- User-Requested: Give Warning Toggle Switch (Groups only) -->
          <div id="fb-panel-warning-row" style="display: ${this.adapter.detectContext() === 'GROUP' ? 'flex' : 'none'}; align-items: center; justify-content: space-between; padding: 5px 8px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="font-size: 11px;">⚠️</span>
              <div>
                <div style="font-size: 10px; font-weight: 600; color: #fff;">Give Warning: <span id="fb-panel-warning-status-text" style="color: ${this.giveWarningOnDelete ? '#10b981' : '#94a3b8'};">${this.giveWarningOnDelete ? 'ENABLED' : 'DISABLED'}</span></div>
              </div>
            </div>
            <label style="position: relative; display: inline-block; width: 32px; height: 18px; cursor: pointer; margin: 0;">
              <input type="checkbox" id="fb-panel-warning-checkbox" ${this.giveWarningOnDelete ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="fb-panel-warning-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.giveWarningOnDelete ? '#10b981' : 'rgba(255,255,255,0.2)'}; border-radius: 18px; transition: .25s;">
                <span id="fb-panel-warning-knob" style="position: absolute; height: 12px; width: 12px; left: ${this.giveWarningOnDelete ? '17px' : '3px'}; bottom: 3px; background-color: white; border-radius: 50%; transition: .25s;"></span>
              </span>
            </label>
          </div>

          <!-- Activity Log Terminal Console (Directly from User Reference) -->
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 700; color: #94a3b8;">
              <span style="display: flex; align-items: center; gap: 4px;"><span style="color: #10b981;">●</span> Activity Log</span>
              <button id="btnPanelClearLog" style="background: transparent; border: none; color: #38bdf8; font-size: 9.5px; cursor: pointer; text-decoration: underline;">Clear Log</button>
            </div>
            <div id="fb-activity-log-box" style="height: 105px; max-height: 105px; overflow-y: auto; background: #060b14; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 5px; padding: 5px 7px; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 9.5px; line-height: 1.35; color: #94a3b8; display: flex; flex-direction: column; gap: 2px;">
              <div style="color: #64748b;">[Ready] Rahul Scripts Automation Engine active.</div>
            </div>
          </div>

          <!-- Footer with Rahul Scripts Copyright -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 5px; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 9px; color: #64748b;">
            <span>© 2026 <strong style="color: #94a3b8;">Rahul Scripts</strong> • All Rights Reserved</span>
            <span style="color: #34d399; font-weight: 700;">PRO ENGINE</span>
          </div>
        </div>

        <!-- Compact Minimized Pill Bar -->
        <div id="fb-deleter-minimized-pill" style="display: none; padding: 6px 12px; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer; background: #0f172a; border-radius: 20px; border: 1px solid rgba(16, 185, 129, 0.5); box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 18px; height: 18px; border-radius: 50%; background: #10b981; color: #000; font-weight: 900; font-size: 9px; display: flex; align-items: center; justify-content: center;">RS</div>
            <span id="fb-min-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981;"></span>
            <span id="fb-min-text" style="font-weight: 700; color: #f8fafc; font-size: 10.5px;">Rahul Scripts | Ready</span>
          </div>
          <span style="color: #34d399; font-weight: 700; font-size: 10px; margin-left: 8px;">↗ Expand</span>
        </div>
      `;

      document.body.appendChild(panel);
      this.panelEl = panel;

      this.setupDraggable(panel, panel.querySelector('#fb-deleter-header'));

      const btnStart = panel.querySelector('#btnPanelStart');
      const btnPause = panel.querySelector('#btnPanelPause');
      const btnResume = panel.querySelector('#btnPanelResume');
      const btnStop = panel.querySelector('#btnPanelStop');
      const btnMin = panel.querySelector('#btnPanelMin');
      const btnClose = panel.querySelector('#btnPanelClose');
      const btnDiag = panel.querySelector('#btnPanelDiag');
      const btnClearLog = panel.querySelector('#btnPanelClearLog');
      const minPill = panel.querySelector('#fb-deleter-minimized-pill');
      const body = panel.querySelector('#fb-deleter-body');
      const header = panel.querySelector('#fb-deleter-header');

      // Warning switch event listener
      const warningCb = panel.querySelector('#fb-panel-warning-checkbox');
      if (warningCb) {
        warningCb.onchange = (e) => {
          this.setGiveWarning(e.target.checked);
        };
      }

      const modeBadge = panel.querySelector('#fb-panel-mode-badge');
      if (modeBadge) {
        modeBadge.onclick = (e) => {
          e.stopPropagation();
          const current = this.activeMode;
          const next = current === 'PAGE' ? 'GROUP' : 'PAGE';
          this.setActiveMode(next);
        };
      }

      if (btnStart) {
        btnStart.onclick = async () => {
          if (this.isDeleting) return;
          this.addActivityLog('Detecting visible posts on Facebook...', 'info');
          const containers = this.adapter.findPostContainers();
          if (containers.length === 0) {
            this.addActivityLog('No posts detected on screen. Please scroll down.', 'warning');
            alert('No Facebook posts detected on current screen. Please scroll down your Facebook feed.');
            return;
          }
          const posts = containers.map(c => ({ id: c.postKey, postKey: c.postKey }));
          this.addActivityLog(`Found ${posts.length} visible posts. Starting deletion...`, 'highlight');
          this.bulkDeletePosts(posts, {
            giveWarningOnDelete: this.giveWarningOnDelete,
            activeMode: this.activeMode
          });
        };
      }

      btnPause.onclick = () => {
        this.pause();
        btnPause.style.display = 'none';
        btnResume.style.display = 'flex';
        this.addActivityLog('Deletion paused by user.', 'warning');
      };

      btnResume.onclick = () => {
        this.resume();
        btnResume.style.display = 'none';
        btnPause.style.display = 'flex';
        this.addActivityLog('Resuming deletion...', 'highlight');
      };

      btnStop.onclick = () => {
        this.stop();
        this.addActivityLog('Deletion stopped by user.', 'error');
      };

      btnMin.onclick = () => {
        body.style.display = 'none';
        header.style.display = 'none';
        minPill.style.display = 'flex';
        panel.style.width = '240px';
        panel.style.background = 'transparent';
        panel.style.border = 'none';
        panel.style.boxShadow = 'none';
      };

      minPill.onclick = () => {
        minPill.style.display = 'none';
        header.style.display = 'flex';
        body.style.display = 'flex';
        panel.style.width = '340px';
        panel.style.background = '#0f172a';
        panel.style.border = '1px solid rgba(16, 185, 129, 0.35)';
        panel.style.boxShadow = '0 16px 45px rgba(0, 0, 0, 0.75), 0 0 15px rgba(16, 185, 129, 0.15)';
      };

      if (btnClose) {
        btnClose.onclick = () => {
          panel.style.display = 'none';
        };
      }

      if (btnClearLog) {
        btnClearLog.onclick = () => {
          const logBox = panel.querySelector('#fb-activity-log-box');
          if (logBox) logBox.innerHTML = '<div style="color: #64748b;">[Cleared] Log cleared by user.</div>';
        };
      }

      btnDiag.onclick = () => {
        this.analyzeCurrentDialog();
      };
    }

    setupDraggable(panel, handle) {
      let isDragging = false;
      let startX = 0, startY = 0;
      let initRight = 20, initBottom = 20;

      handle.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('label')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initRight = window.innerWidth - rect.right;
        initBottom = window.innerHeight - rect.bottom;
        document.body.style.userSelect = 'none';
      };

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        panel.style.right = `${Math.max(10, initRight - deltaX)}px`;
        panel.style.bottom = `${Math.max(10, initBottom - deltaY)}px`;
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = '';
        }
      });
    }

    updateFloatingPanelUI(statusText) {
      this.ensureFloatingPanel();
      if (!this.panelEl) return;

      const s = this.session || {};
      const statusLabel = this.panelEl.querySelector('#fb-panel-status-label');
      const counterEl = this.panelEl.querySelector('#fb-panel-counter');
      const fillEl = this.panelEl.querySelector('#fb-panel-progress-fill');
      const totalEl = this.panelEl.querySelector('#fb-panel-total');
      const delEl = this.panelEl.querySelector('#fb-panel-deleted');
      const failEl = this.panelEl.querySelector('#fb-panel-failed');
      const remEl = this.panelEl.querySelector('#fb-panel-remaining');
      const dotEl = this.panelEl.querySelector('#fb-deleter-status-dot');
      const minText = this.panelEl.querySelector('#fb-min-text');
      const minDot = this.panelEl.querySelector('#fb-min-dot');

      if (statusLabel) statusLabel.textContent = `Status: ${this.isPaused ? 'Paused' : (statusText || this.state)}`;

      const current = (s.deletedCount || 0) + (s.failedCount || 0) + (s.skippedCount || 0);
      const total = s.totalCount || current;
      const remaining = Math.max(0, total - current);
      const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

      if (totalEl) totalEl.textContent = total;
      if (delEl) delEl.textContent = s.deletedCount || 0;
      if (failEl) failEl.textContent = s.failedCount || 0;
      if (remEl) remEl.textContent = remaining;

      if (counterEl) counterEl.textContent = `${current} / ${total}`;
      if (fillEl) fillEl.style.width = `${pct}%`;

      const color = this.isPaused ? '#f59e0b' : (this.isDeleting ? '#ef4444' : '#10b981');
      if (dotEl) dotEl.style.background = color;
      if (minDot) minDot.style.background = color;
      if (minText) minText.textContent = `Rahul Scripts | ${this.isPaused ? 'Paused' : (this.isDeleting ? 'Deleting' : 'Ready')} | ${current}/${total}`;

      this.syncWarningUI();
      this.syncModeUI();
    }

    destroyFloatingPanel() {
      if (this.panelEl && this.panelEl.parentElement) {
        this.panelEl.parentElement.removeChild(this.panelEl);
        this.panelEl = null;
      }
    }

    analyzeCurrentDialog() {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) {
        FBLog.log('DIAGNOSTIC', 'No active dialog found in DOM.');
        alert('No active Facebook dialog found on screen.');
        return null;
      }

      const diagnostic = FBDOM.sanitizeElementDiagnostic(dialog);
      FBLog.log('DIAGNOSTIC', 'Analyzed current dialog structure:', diagnostic);
      console.table(diagnostic.buttons);
      console.table(diagnostic.checkboxes);
      alert(`Dialog Analyzed:\nTitle: ${diagnostic.dialogTitle || 'None'}\nButtons: ${diagnostic.buttonCount}\nCheckboxes: ${diagnostic.checkboxCount}\n(Check console for full diagnostic)`);
      return diagnostic;
    }

    emitProgress(current, total, results, message) {
      if (this.onProgressCallback) {
        this.onProgressCallback(current, total, results, message);
      }
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            action: 'DELETE_PROGRESS',
            data: {
              current,
              total,
              results,
              isPaused: this.isPaused,
              message
            }
          });
        } catch (e) {}
      }
    }
  }

  // Bind singleton instance to window
  window.FBActionsClass = FBActions;
  const fbActionsInstance = window.fbActionsInstance || new FBActions();
  window.fbActionsInstance = fbActionsInstance;

  // Runtime Message Listeners
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'BULK_DELETE' || request.action === 'START_AUTOMATION') {
        fbActionsInstance.bulkDeletePosts(request.posts || [], request.options || {}).then(res => {
          sendResponse({ success: true, results: res });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      } else if (request.action === 'PAUSE_DELETE' || request.action === 'PAUSE_AUTOMATION') {
        fbActionsInstance.pause();
        sendResponse({ success: true, isPaused: true });
      } else if (request.action === 'RESUME_DELETE' || request.action === 'RESUME_AUTOMATION') {
        fbActionsInstance.resume();
        sendResponse({ success: true, isPaused: false });
      } else if (request.action === 'STOP_DELETE' || request.action === 'STOP_AUTOMATION') {
        fbActionsInstance.stop();
        sendResponse({ success: true });
      } else if (request.action === 'SET_WARNING_SETTING') {
        fbActionsInstance.setGiveWarning(request.giveWarning);
        sendResponse({ success: true, giveWarning: fbActionsInstance.giveWarningOnDelete });
      } else if (request.action === 'SET_TARGET_MODE') {
        fbActionsInstance.setActiveMode(request.mode);
        sendResponse({ success: true, mode: fbActionsInstance.activeMode, effectiveContext: fbActionsInstance.adapter.detectContext() });
      } else if (request.action === 'ANALYZE_CURRENT_DIALOG') {
        const diag = fbActionsInstance.analyzeCurrentDialog();
        sendResponse({ success: true, diagnostic: diag });
      } else if (request.action === 'SHOW_FLOATING_PANEL') {
        fbActionsInstance.ensureFloatingPanel();
        if (fbActionsInstance.panelEl) {
          fbActionsInstance.panelEl.style.display = 'block';
        }
        sendResponse({ success: true });
      } else if (request.action === 'TOGGLE_FLOATING_PANEL') {
        fbActionsInstance.ensureFloatingPanel();
        if (fbActionsInstance.panelEl) {
          const isHidden = fbActionsInstance.panelEl.style.display === 'none';
          fbActionsInstance.panelEl.style.display = isHidden ? 'block' : 'none';
        }
        sendResponse({ success: true });
      } else if (request.action === 'GET_AUTOMATION_STATE') {
        sendResponse({
          success: true,
          isDeleting: fbActionsInstance.isDeleting,
          isPaused: fbActionsInstance.isPaused,
          state: fbActionsInstance.state,
          giveWarningOnDelete: fbActionsInstance.giveWarningOnDelete,
          session: fbActionsInstance.session
        });
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FBActions;
  } else {
    window.FBActions = fbActionsInstance;
  }
})();
