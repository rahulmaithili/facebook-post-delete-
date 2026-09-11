/**
 * FB AI Post Manager - Production Facebook Post Deletion Engine & State Machine
 * Complies with strict anti-accident rules, human-paced state transitions,
 * dynamic DOM heuristics (Profiles, Pages, Groups), and session refresh recovery.
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
    }

    /**
     * Detects current Facebook context: GROUP, PAGE, or PROFILE
     */
    detectContext() {
      const url = window.location.href;
      if (url.includes('/groups/')) return 'GROUP';
      if (url.includes('/pages/') || (typeof FBDetector !== 'undefined' && FBDetector.isPageUrl && FBDetector.isPageUrl(url))) {
        return 'PAGE';
      }
      return 'PROFILE';
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
          // Real Facebook posts have a minimum height and width
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

      // 1. Tagged attribute if already tagged
      const existingKey = postEl.getAttribute('data-fb-post-key');
      if (existingKey) return existingKey;

      // 2. Extract from permalink or post ID links
      const link = postEl.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/reel/"], a[href*="/videos/"]');
      if (link && link.href) {
        const match = link.href.match(/\/(?:posts|permalink|reel|videos)\/([a-zA-Z0-9._-]+)/) ||
                      link.href.match(/story_fbid=([0-9]+)/) ||
                      link.href.match(/fbid=([0-9]+)/);
        if (match && match[1]) {
          return `post_${match[1]}`;
        }
      }

      // 3. Extract from data-ft or DOM attributes
      const dataFt = postEl.getAttribute('data-ft');
      if (dataFt) {
        try {
          const parsed = JSON.parse(dataFt);
          if (parsed.top_level_post_id) return `post_${parsed.top_level_post_id}`;
        } catch (e) {}
      }

      // 4. Stable content hash fallback: Author + text excerpt
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

      // Check 1: Button with explicit aria-haspopup="menu"
      const menuBtn = postEl.querySelector('div[aria-haspopup="menu"][role="button"], div[aria-haspopup="menu"], [aria-haspopup="menu"]');
      if (menuBtn && FBDOM.isElementVisible(menuBtn)) return menuBtn;

      // Check 2: Buttons with action/options aria-labels
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

      // Check 3: Top-Right header button containing an SVG
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

      // Scroll menu button smoothly into view
      menuBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, TIMEOUTS.INTER_STEP_DELAY));

      FBLog.log('OPENING_MENU', 'Clicking post menu button...');
      FBDOM.dispatchFullClick(menuBtn);

      // Wait for menu layer to appear in the DOM
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
     */
    findRemoveAction(menuLayer) {
      if (!menuLayer) return null;

      const items = Array.from(menuLayer.querySelectorAll('div[role="menuitem"], span, div[role="button"]'));
      const context = this.detectContext();

      // Pass 1: Exact matches for "Remove post" / Hindi equivalents
      for (const item of items) {
        const text = (item.textContent || item.getAttribute('aria-label') || '').trim().toLowerCase();
        if (
          text === 'remove post' ||
          text === 'delete post' ||
          text === 'move to trash' ||
          text === 'move to bin' ||
          text === 'पोस्ट हटाएं' ||
          text === 'ग्रुप से हटाएं' ||
          text === 'ट्रैश में डालें'
        ) {
          return item;
        }
      }

      // Pass 2: Contextual search
      for (const item of items) {
        const text = (item.textContent || item.getAttribute('aria-label') || '').trim().toLowerCase();

        if (context === 'GROUP') {
          // In groups, match "remove post" but strictly avoid "ban author"
          if (text.includes('remove post') && !text.includes('ban')) {
            return item;
          }
        } else {
          // In Profile / Page, match "move to trash" or "delete"
          if (text.includes('trash') || text.includes('bin') || text.includes('delete post') || text === 'delete') {
            return item;
          }
        }
      }

      // Pass 3: General fallback removal terms
      const generalTerms = ['remove post', 'delete post', 'move to trash', 'delete', 'remove', 'हटाएं'];
      for (const item of items) {
        const text = (item.textContent || item.getAttribute('aria-label') || '').trim().toLowerCase();
        if (generalTerms.some(term => text.includes(term)) && !text.includes('ban')) {
          return item;
        }
      }

      return null;
    }

    /**
     * Detect newly appeared visible confirmation dialog
     * Verifies that this is actually the post deletion confirmation dialog!
     */
    async waitForConfirmationDialog(timeout = TIMEOUTS.DIALOG_DETECT) {
      const startTime = Date.now();
      const deletionKeywords = [
        'remove post',
        'delete post',
        'move to trash',
        'which rules did this post violate',
        'rules did this post violate',
        'are you sure',
        'delete',
        'remove',
        'trash',
        'post will be removed',
        'गोपनीयता',
        'सहिष्णु',
        'हटाएं',
        'पुष्टि करें',
        'नियम'
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
     * Dynamically inspect dialog for confirmation / rule checkboxes
     * Handles: <input type="checkbox">, role="checkbox", and aria-checked controls
     */
    findConfirmationCheckboxes(dialog) {
      if (!dialog) return [];

      const rawControls = Array.from(dialog.querySelectorAll('div[role="checkbox"], input[type="checkbox"], [role="checkbox"], [aria-checked]'));
      const validCheckboxes = [];

      for (const ctrl of rawControls) {
        // Exclude inputs that are not checkboxes
        if (ctrl.tagName === 'INPUT' && ctrl.type !== 'checkbox') continue;

        // Verify visibility
        if (FBDOM.isElementVisible(ctrl) || (ctrl.parentElement && FBDOM.isElementVisible(ctrl.parentElement))) {
          validCheckboxes.push(ctrl);
        }
      }

      return validCheckboxes;
    }

    /**
     * Process all required confirmation checkboxes in DOM order (Rule 1, Rule 2, etc.)
     * Verifies state after clicking. NEVER clicks an already checked checkbox!
     */
    async processCheckboxes(dialog) {
      const checkboxes = this.findConfirmationCheckboxes(dialog);
      FBLog.log('PROCESSING_CONFIRMATIONS', `Detected ${checkboxes.length} confirmation checkbox control(s).`);

      for (let idx = 0; idx < checkboxes.length; idx++) {
        const cb = checkboxes[idx];
        const isChecked = cb.checked === true || cb.getAttribute('aria-checked') === 'true';

        if (isChecked) {
          FBLog.log('PROCESSING_CONFIRMATIONS', `Checkbox #${idx + 1} is already selected. Skipping.`);
          continue;
        }

        FBLog.log('PROCESSING_CONFIRMATIONS', `Clicking unchecked Checkbox #${idx + 1}...`);
        
        // Scroll checkbox into view
        cb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        await new Promise(r => setTimeout(r, 200));

        // Click target: label or wrapper button if available, else checkbox itself
        const clickTarget = cb.closest('label') || cb.closest('[role="button"]') || cb;
        FBDOM.dispatchFullClick(clickTarget);

        // Wait for state change to be registered in DOM / React
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
          // Retry direct click on the checkbox element itself
          FBDOM.dispatchFullClick(cb);
          await new Promise(r => setTimeout(r, 300));
        }

        FBLog.log('PROCESSING_CONFIRMATIONS', `Checkbox #${idx + 1} verified selected.`);
        await new Promise(r => setTimeout(r, TIMEOUTS.INTER_STEP_DELAY));
      }

      return true;
    }

    /**
     * Locate the final confirmation button INSIDE the active dialog
     * Verifies that the button is visible and enabled.
     */
    async findFinalDeleteButton(dialog) {
      if (!dialog) return null;

      const confirmLabels = ['confirm', 'delete', 'remove', 'move to trash', 'move', 'continue', 'पुष्टि करें', 'हटाएं'];
      const cancelLabels = ['cancel', 'close', 'back', 'रद्द करें', 'वापस'];

      const startTime = Date.now();

      while (Date.now() - startTime < TIMEOUTS.DELETE_BUTTON_ENABLE) {
        const buttons = Array.from(dialog.querySelectorAll('div[role="button"], button'));

        for (const btn of buttons) {
          if (!FBDOM.isElementVisible(btn)) continue;

          const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();

          // Exclude cancel / close buttons
          if (cancelLabels.some(c => text.includes(c))) continue;

          const isMatch = confirmLabels.some(l => text === l || text.includes(l));
          if (!isMatch) continue;

          // Check whether button is enabled
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

      // Fallback: check FBDOM modal confirm selectors
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
        // 1. Dialog disappeared
        const dialogGone = !dialog || !document.body.contains(dialog) || !FBDOM.isElementVisible(dialog);

        // 2. Post element removed or hidden
        const postGone = !postEl || !document.body.contains(postEl) || !FBDOM.isElementVisible(postEl);

        if (dialogGone && (postGone || Date.now() - startTime > 1500)) {
          return { verified: true, reason: 'Dialog closed and post removed from DOM.' };
        }

        // Check for Facebook error / restriction message
        const errorAlert = document.querySelector('div[role="alert"]');
        if (errorAlert && FBDOM.isElementVisible(errorAlert)) {
          const errText = errorAlert.textContent || '';
          if (errText.includes('error') || errText.includes('could not') || errText.includes('failed')) {
            return { verified: false, reason: `Facebook error: ${errText.substring(0, 100)}` };
          }
        }

        await new Promise(r => setTimeout(r, 200));
      }

      // Final check: Is dialog still open?
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

      // Floating panel reference
      this.panelEl = null;

      // Check for saved session recovery on startup
      this.initRecoveryCheck();
    }

    /**
     * Checks storage for interrupted sessions across page refreshes
     */
    async initRecoveryCheck() {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

      try {
        const stored = await chrome.storage.local.get([STORAGE_SESSION_KEY]);
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

      // Trigger auto-scan & continue deletion loop
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

      let postQueue = [...postsToDelete];

      // Main Deletion State Machine Loop
      let currentIndex = 0;

      while (this.isDeleting && (currentIndex < postQueue.length || options.autoDiscovered)) {
        // 1. Handle Pause State
        while (this.isPaused) {
          if (!this.isDeleting) break;
          this.updateFloatingPanelUI('⏸️ Deletion Paused');
          await new Promise(r => setTimeout(r, 400));
        }

        if (!this.isDeleting) break;

        // 2. Discover post to delete
        let targetPost = postQueue[currentIndex];
        let postContainerEl = null;

        // If auto-discovering or post not located, dynamically scan currently visible feed
        const visibleContainers = this.adapter.findPostContainers();
        const available = visibleContainers.filter(c => !c.isProcessed);

        if (available.length > 0) {
          // Pick next unprocessed post
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
          // Scroll slightly to discover more posts
          FBLog.log('SCANNING', 'No unprocessed post visible in viewport. Scrolling down...');
          this.updateFloatingPanelUI('Scrolling to load more posts...');
          window.scrollBy({ top: 450, behavior: 'smooth' });
          await new Promise(r => setTimeout(r, 1200));

          const refreshed = this.adapter.findPostContainers().filter(c => !c.isProcessed);
          if (refreshed.length === 0) {
            FBLog.warn('SCANNING', 'No further posts found after scroll. Concluding.');
            break;
          }
          postContainerEl = refreshed[0].element;
          targetPost = { id: refreshed[0].postKey, postKey: refreshed[0].postKey };
        }

        const postKey = targetPost.postKey || targetPost.id;
        results.processed++;

        this.updateFloatingPanelUI(`Processing post ${results.processed} of ${results.total || '...'}`);
        this.emitProgress(results.processed, results.total, results, `Processing post ${results.processed}...`);

        // 3. Execute Single Post Deletion via State Machine
        try {
          const outcome = await this.deleteSinglePostVerified(targetPost, postContainerEl);

          if (outcome.status === 'SUCCESS') {
            results.successful++;
            this.adapter.processedPostKeys.add(postKey);
            results.details.push({ id: postKey, status: 'SUCCESS', message: outcome.message });
          } else if (outcome.status === 'SKIPPED') {
            results.skipped++;
            this.adapter.processedPostKeys.add(postKey);
            results.details.push({ id: postKey, status: 'SKIPPED', message: outcome.reason });
          } else {
            results.failed++;
            results.details.push({ id: postKey, status: 'FAILED', message: outcome.reason });
          }
        } catch (err) {
          results.failed++;
          results.details.push({ id: postKey, status: 'FAILED', message: err.message });
          FBLog.error('DELETE_STEP', `Error on post ${postKey}: ${err.message}`);

          // Close any open dangling menus/dialogs safely
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }

        await this.saveSessionState({
          processedCount: results.processed,
          deletedCount: results.successful,
          failedCount: results.failed,
          skippedCount: results.skipped
        });

        currentIndex++;

        // Controlled human-like pacing between deletions
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
    async deleteSinglePostVerified(post, postElement = null) {
      // Step 1: Ensure valid domain
      if (!window.location.hostname.includes('facebook.com')) {
        return { status: 'SKIPPED', reason: 'Not on facebook.com domain.' };
      }

      // Step 2: Ensure post container is alive in DOM
      const targetElement = postElement || document.querySelector(`[data-fb-post-key="${post.id}"]`);
      if (!targetElement) {
        return { status: 'SKIPPED', reason: 'Post container not found in current DOM.' };
      }

      const postKey = post.id || post.postKey;
      FBLog.log('POST_FOUND', `Targeting post: ${postKey}`);

      // Step 3: Find and open post menu ("...")
      let menuLayer = null;
      try {
        menuLayer = await this.adapter.openPostMenu(targetElement);
      } catch (err) {
        return { status: 'FAILED', reason: `Menu open failed: ${err.message}` };
      }

      // Step 4: Find Remove/Delete action in open menu
      const removeAction = this.adapter.findRemoveAction(menuLayer);
      if (!removeAction) {
        // Safely close menu
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return { status: 'SKIPPED', reason: 'No Remove/Delete option found in menu.' };
      }

      FBLog.log('REMOVE_OPTION_FOUND', `Clicking removal action: "${(removeAction.textContent || '').trim()}"`);
      FBDOM.dispatchFullClick(removeAction);

      // Step 5: Wait for confirmation dialog (DYNAMIC MODAL DETECTION)
      this.state = 'WAITING_CONFIRMATION';
      const dialog = await this.adapter.waitForConfirmationDialog(TIMEOUTS.DIALOG_DETECT);

      if (dialog) {
        // Step 6: Process Confirmation & Rule Checkboxes (Rule 1, Rule 2, etc.)
        this.state = 'PROCESSING_CONFIRMATIONS';
        await this.adapter.processCheckboxes(dialog);

        // Step 7: Locate enabled final confirmation button
        this.state = 'FINAL_DELETE';
        const finalBtn = await this.adapter.findFinalDeleteButton(dialog);

        if (!finalBtn) {
          throw new Error('Final confirmation button could not be located or remained disabled.');
        }

        FBLog.log('FINAL_DELETE', 'Clicking final confirmation button...');
        FBDOM.dispatchFullClick(finalBtn);

        // Step 8: Verify Deletion
        this.state = 'VERIFYING';
        const verifyResult = await this.adapter.waitForDeletionResult(postKey, targetElement, dialog, TIMEOUTS.DELETION_VERIFY);

        if (!verifyResult.verified) {
          return { status: 'FAILED', reason: verifyResult.reason };
        }
      } else {
        // If no modal appeared, check if deletion was immediate or moved to trash
        FBLog.warn('WAITING_CONFIRMATION', 'No confirmation modal displayed. Verifying if immediate deletion occurred.');
        await new Promise(r => setTimeout(r, 1200));
      }

      FBLog.log('DELETED', `Post ${postKey} successfully deleted & verified.`);
      return { status: 'SUCCESS', message: 'Post successfully deleted & verified.' };
    }

    /**
     * =========================================================================
     * 3. Draggable, Minimizable Floating Control Panel on Facebook DOM
     * =========================================================================
     */
    ensureFloatingPanel() {
      if (this.panelEl && document.body.contains(this.panelEl)) return;

      const existing = document.getElementById('fb-deleter-floating-panel');
      if (existing) {
        this.panelEl = existing;
        return;
      }

      const panel = document.createElement('div');
      panel.id = 'fb-deleter-floating-panel';
      panel.style.cssText = `
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        width: 320px !important;
        background: #18191a !important;
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-radius: 12px !important;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        z-index: 2147483647 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        user-select: none !important;
      `;

      panel.innerHTML = `
        <!-- Header (Draggable Handle) -->
        <div id="fb-deleter-header" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255, 255, 255, 0.06); cursor: move; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="fb-deleter-status-dot" style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #ef4444;"></span>
            <strong style="font-size: 13px; font-weight: 700; color: #fff;">FB POST DELETER</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="btnPanelDiag" title="Analyze Current Dialog" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; font-size: 11px; padding: 2px 6px; border-radius: 4px; cursor: pointer;">🔍</button>
            <button id="btnPanelMin" title="Minimize" style="background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; font-size: 12px; padding: 1px 6px; border-radius: 4px; cursor: pointer;">_</button>
          </div>
        </div>

        <!-- Body -->
        <div id="fb-deleter-body" style="padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span id="fb-panel-status-label" style="color: #cbd5e1;">Status: Running</span>
            <strong id="fb-panel-counter" style="color: #fff;">0 / 0</strong>
          </div>

          <!-- Progress Track -->
          <div style="height: 6px; width: 100%; background: rgba(255, 255, 255, 0.15); border-radius: 3px; overflow: hidden;">
            <div id="fb-panel-progress-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, #ef4444, #f97316); transition: width 0.3s ease;"></div>
          </div>

          <!-- Stats Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 11px; text-align: center;">
            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 4px;">
              <span style="color: #10b981; font-weight: 700;" id="fb-panel-deleted">0</span>
              <div style="color: #94a3b8; font-size: 10px;">Deleted</div>
            </div>
            <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 4px;">
              <span style="color: #ef4444; font-weight: 700;" id="fb-panel-failed">0</span>
              <div style="color: #94a3b8; font-size: 10px;">Failed</div>
            </div>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 4px;">
              <span style="color: #f59e0b; font-weight: 700;" id="fb-panel-skipped">0</span>
              <div style="color: #94a3b8; font-size: 10px;">Skipped</div>
            </div>
          </div>

          <!-- Controls -->
          <div style="display: flex; gap: 8px; margin-top: 2px;">
            <button id="btnPanelPause" style="flex: 1; background: #f59e0b; color: #000; font-weight: 700; font-size: 11px; padding: 6px; border: none; border-radius: 6px; cursor: pointer;">
              ⏸️ PAUSE
            </button>
            <button id="btnPanelResume" style="flex: 1; display: none; background: #10b981; color: #000; font-weight: 700; font-size: 11px; padding: 6px; border: none; border-radius: 6px; cursor: pointer;">
              ▶️ RESUME
            </button>
            <button id="btnPanelStop" style="flex: 1; background: rgba(239, 68, 68, 0.25); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.5); font-weight: 600; font-size: 11px; padding: 6px; border-radius: 6px; cursor: pointer;">
              ⏹️ STOP
            </button>
          </div>
        </div>

        <!-- Compact Minimized Pill (Hidden by default) -->
        <div id="fb-deleter-minimized-pill" style="display: none; padding: 8px 12px; align-items: center; justify-content: space-between; font-size: 11px; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span id="fb-min-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
            <span id="fb-min-text">FB Deleter | Running</span>
          </div>
          <span style="color: #60a5fa; font-size: 10px; margin-left: 8px;">[Expand]</span>
        </div>
      `;

      document.body.appendChild(panel);
      this.panelEl = panel;

      // Make Panel Draggable
      this.setupDraggable(panel, panel.querySelector('#fb-deleter-header'));

      // Event Listeners
      const btnPause = panel.querySelector('#btnPanelPause');
      const btnResume = panel.querySelector('#btnPanelResume');
      const btnStop = panel.querySelector('#btnPanelStop');
      const btnMin = panel.querySelector('#btnPanelMin');
      const btnDiag = panel.querySelector('#btnPanelDiag');
      const minPill = panel.querySelector('#fb-deleter-minimized-pill');
      const body = panel.querySelector('#fb-deleter-body');
      const header = panel.querySelector('#fb-deleter-header');

      btnPause.onclick = () => {
        this.pause();
        btnPause.style.display = 'none';
        btnResume.style.display = 'inline-block';
      };

      btnResume.onclick = () => {
        this.resume();
        btnResume.style.display = 'none';
        btnPause.style.display = 'inline-block';
      };

      btnStop.onclick = () => {
        this.stop();
      };

      btnMin.onclick = () => {
        body.style.display = 'none';
        header.style.display = 'none';
        minPill.style.display = 'flex';
        panel.style.width = '240px';
      };

      minPill.onclick = () => {
        minPill.style.display = 'none';
        header.style.display = 'flex';
        body.style.display = 'flex';
        panel.style.width = '320px';
      };

      btnDiag.onclick = () => {
        this.analyzeCurrentDialog();
      };
    }

    /**
     * Setup drag handling for floating panel
     */
    setupDraggable(panel, handle) {
      let isDragging = false;
      let startX = 0, startY = 0;
      let initRight = 24, initBottom = 24;

      handle.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
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
      const delEl = this.panelEl.querySelector('#fb-panel-deleted');
      const failEl = this.panelEl.querySelector('#fb-panel-failed');
      const skipEl = this.panelEl.querySelector('#fb-panel-skipped');
      const dotEl = this.panelEl.querySelector('#fb-deleter-status-dot');
      const minText = this.panelEl.querySelector('#fb-min-text');
      const minDot = this.panelEl.querySelector('#fb-min-dot');

      if (statusLabel) statusLabel.textContent = `Status: ${this.isPaused ? 'Paused' : this.state}`;
      if (delEl) delEl.textContent = s.deletedCount || 0;
      if (failEl) failEl.textContent = s.failedCount || 0;
      if (skipEl) skipEl.textContent = s.skippedCount || 0;

      const current = (s.deletedCount || 0) + (s.failedCount || 0) + (s.skippedCount || 0);
      const total = s.totalCount || current;
      const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

      if (counterEl) counterEl.textContent = `${current} / ${total}`;
      if (fillEl) fillEl.style.width = `${pct}%`;

      const color = this.isPaused ? '#f59e0b' : '#ef4444';
      if (dotEl) dotEl.style.background = color;
      if (minDot) minDot.style.background = color;
      if (minText) minText.textContent = `FB Deleter | ${this.isPaused ? 'Paused' : 'Running'} | ${current}/${total}`;
    }

    destroyFloatingPanel() {
      if (this.panelEl && this.panelEl.parentElement) {
        this.panelEl.parentElement.removeChild(this.panelEl);
        this.panelEl = null;
      }
    }

    /**
     * Developer Diagnostic: Safely analyze current open dialog
     */
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
      } else if (request.action === 'ANALYZE_CURRENT_DIALOG') {
        const diag = fbActionsInstance.analyzeCurrentDialog();
        sendResponse({ success: true, diagnostic: diag });
      } else if (request.action === 'GET_AUTOMATION_STATE') {
        sendResponse({
          success: true,
          isDeleting: fbActionsInstance.isDeleting,
          isPaused: fbActionsInstance.isPaused,
          state: fbActionsInstance.state,
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
