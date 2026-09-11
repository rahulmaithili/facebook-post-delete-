/**
 * FB AI Post Manager - Safe Facebook Actions & Verified Sequential Bulk Deletion
 * Enforces Anti-Accident verification, stops on unexpected DOM/CAPTCHA, never fakes success.
 */

if (typeof window.FBActionsClass === 'undefined') {
  window.FBActionsClass = class FBActions {
  constructor() {
    this.isDeleting = false;
    this.isPaused = false;
  }

  stop() {
    this.isDeleting = false;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  /**
   * Sequential verified deletion of a selected list of posts
   */
  async bulkDeletePosts(postsToDelete, options = {}, onProgress = null) {
    if (this.isDeleting) return;
    this.isDeleting = true;
    this.isPaused = false;

    const delayMs = options.deleteBatchDelay || 2500;
    const results = {
      total: postsToDelete.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    // Load trained selectors if passed in options or available in storage
    if (options.trainedSelectors) {
      FBDOM.setTrainedSelectors(options.trainedSelectors);
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const stored = await chrome.storage.local.get(['fb_ai_trained_selectors']);
        const allTrained = stored.fb_ai_trained_selectors || {};
        const groupMatch = window.location.href.match(/facebook\.com\/groups\/([a-zA-Z0-9._-]+)/);
        const gId = groupMatch ? groupMatch[1] : null;
        if (gId && allTrained[gId]) {
          FBDOM.setTrainedSelectors(allTrained[gId]);
        } else if (allTrained._general) {
          FBDOM.setTrainedSelectors(allTrained._general);
        }
      } catch (e) {}
    }

    for (let i = 0; i < postsToDelete.length; i++) {
      if (!this.isDeleting) {
        if (typeof FBLogger !== 'undefined') FBLogger.warn('ACTION', 'Bulk deletion stopped by user.');
        break;
      }

      while (this.isPaused) {
        await new Promise(r => setTimeout(r, 500));
      }

      const post = postsToDelete[i];
      if (onProgress) {
        onProgress(i + 1, postsToDelete.length, results, `Processing post ${i + 1}/${postsToDelete.length}...`);
      }

      try {
        const deleteResult = await this.deleteSinglePostVerified(post);
        
        if (deleteResult.status === 'SUCCESS') {
          results.successful++;
          results.details.push({ id: post.id, status: 'SUCCESS', message: 'Post successfully removed/deleted.' });
        } else if (deleteResult.status === 'SKIPPED') {
          results.skipped++;
          results.details.push({ id: post.id, status: 'SKIPPED', message: deleteResult.reason });
        } else {
          results.failed++;
          results.details.push({ id: post.id, status: 'FAILED', message: deleteResult.reason });
        }
      } catch (err) {
        results.failed++;
        results.details.push({ id: post.id, status: 'FAILED', message: err.message });

        if (err.message.includes('SECURITY_HALT') || err.message.includes('CAPTCHA')) {
          this.isDeleting = false;
          if (typeof FBLogger !== 'undefined') {
            FBLogger.error('SAFETY', `Halting bulk deletion immediately: ${err.message}`);
          }
          break;
        }
      }

      // Safe delay between sequential deletions
      if (i < postsToDelete.length - 1 && this.isDeleting) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    this.isDeleting = false;
    if (onProgress) {
      onProgress(postsToDelete.length, postsToDelete.length, results, 'Deletion process concluded.');
    }

    return results;
  }

  /**
   * Delete a single post with multi-step DOM verification
   */
  async deleteSinglePostVerified(post) {
    // 1. Safety Check: Verify Domain
    if (!window.location.hostname.includes('facebook.com')) {
      return { status: 'SKIPPED', reason: 'Not on Facebook domain. Action aborted.' };
    }

    // 2. Check for security or CAPTCHA dialogs
    if (this.detectCaptchaOrRestriction()) {
      throw new Error('SECURITY_HALT: Facebook CAPTCHA or security restriction dialog detected. Automation halted.');
    }

    // 3. Locate and verify the post element in the DOM
    const postElement = await this.locatePostElement(post);
    if (!postElement) {
      return {
        status: 'SKIPPED',
        reason: 'Post element not located in current feed viewport. Skipped for safety.'
      };
    }

    // Scroll post gently into view
    postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 600));

    // 4. Find and open Action Menu ("...")
    let actionMenuBtn = null;

    // Check by exact stored aria-label (highest accuracy!)
    if (post.actionMenuAria) {
      actionMenuBtn = postElement.querySelector(`div[aria-label="${post.actionMenuAria}"]`) ||
        document.querySelector(`div[aria-label="${post.actionMenuAria}"]`);
    }

    // Check by author name in aria-label: "Actions for this post by Suresh Mishra"
    if (!actionMenuBtn && post.author && post.author !== 'Group Member' && post.author !== 'Facebook Post') {
      actionMenuBtn = postElement.querySelector(`div[role="button"][aria-label*="Actions for this post by ${post.author}"], div[aria-label*="Actions for this post by ${post.author}"], div[aria-label*="${post.author} की इस पोस्ट के लिए"]`) ||
        document.querySelector(`div[role="button"][aria-label*="Actions for this post by ${post.author}"], div[aria-label*="Actions for this post by ${post.author}"]`);
    }

    // Cascading fallback
    if (!actionMenuBtn) {
      actionMenuBtn = FBDOM.findFirst(FBDOM.selectors.actionMenuTriggers, postElement);
    }

    if (!actionMenuBtn) {
      const buttons = Array.from(postElement.querySelectorAll('div[role="button"], button'));
      for (const btn of buttons) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const hasMenu = btn.getAttribute('aria-haspopup') === 'menu' || btn.getAttribute('aria-haspopup') === 'true';
        if (hasMenu || aria.includes('actions') || aria.includes('action') || aria.includes('more') || aria.includes('options') || aria.includes('कार्रवाई') || aria.includes('विकल्प')) {
          actionMenuBtn = btn;
          break;
        }
      }
    }

    // Positional check: Top-Right button with an SVG
    if (!actionMenuBtn) {
      const postRect = postElement.getBoundingClientRect();
      const allBtns = Array.from(postElement.querySelectorAll('div[role="button"], button, [role="button"]'));
      for (const btn of allBtns) {
        if (btn.closest('[role="toolbar"]') || btn.closest('form')) continue;
        const bRect = btn.getBoundingClientRect();
        const isTop = (bRect.top - postRect.top) < 140;
        const isRight = (bRect.right > postRect.left + (postRect.width * 0.5));
        const hasSvg = btn.querySelector('svg') !== null;
        if (isTop && isRight && hasSvg) {
          actionMenuBtn = btn;
          break;
        }
      }
    }

    if (!actionMenuBtn) {
      return {
        status: 'SKIPPED',
        reason: 'Post action menu trigger (...) could not be found. Post was skipped.'
      };
    }

    // Click 3-dots action menu using resilient click helper
    FBDOM.dispatchFullClick(actionMenuBtn);
    await new Promise(r => setTimeout(r, 900));

    // 5. Look for "Remove post", "Delete post", "Move to trash" option in open menu
    let deleteMenuItem = null;
    for (let attempts = 0; attempts < 10; attempts++) {
      deleteMenuItem = FBDOM.findFirst(FBDOM.selectors.deleteMenuItems, document.body);
      if (!deleteMenuItem) {
        const menuItems = Array.from(document.querySelectorAll('div[role="menu"] div[role="menuitem"], div[role="menu"] span, div[role="menuitem"], div[role="menu"] div[role="button"]'));
        const removeTerms = [
          'remove post',
          'delete post',
          'move to trash',
          'move to bin',
          'delete post and remove author',
          'remove post and ban author',
          'remove post and mute',
          'remove from group',
          'decline post',
          'delete',
          'remove',
          'पोस्ट हटाएं',
          'पोस्ट निकालें',
          'हटाएं',
          'ग्रुप से हटाएं',
          'ट्रैश में डालें',
          'कचरा पेटी में भेजें'
        ];

        for (const mi of menuItems) {
          const t = (mi.textContent || mi.getAttribute('aria-label') || '').trim().toLowerCase();
          for (const term of removeTerms) {
            if (t.includes(term)) {
              deleteMenuItem = mi;
              break;
            }
          }
          if (deleteMenuItem) break;
        }
      }
      if (deleteMenuItem) break;
      await new Promise(r => setTimeout(r, 200));
    }

    if (!deleteMenuItem) {
      // Close menu safely
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      document.body.click();
      return {
        status: 'SKIPPED',
        reason: 'No "Remove post" or "Delete post" option in menu. Check Group Admin/Moderator permissions.'
      };
    }

    // Click Remove/Delete option ("Remove post")
    FBDOM.dispatchFullClick(deleteMenuItem);
    await new Promise(r => setTimeout(r, 1000));

    // 6. Look for Facebook's confirmation modal dialog ("Remove post")
    // Wait up to 2.5 seconds for the dialog to appear
    let dialog = null;
    for (let attempts = 0; attempts < 10; attempts++) {
      dialog = document.querySelector('div[role="dialog"]');
      if (dialog) break;
      await new Promise(r => setTimeout(r, 250));
    }

    if (dialog) {
      // Step A: Handle Rule Checkboxes ("Which rules did this post violate?")
      const ruleCheckboxes = Array.from(dialog.querySelectorAll('div[role="checkbox"], input[type="checkbox"]'));
      if (ruleCheckboxes.length > 0) {
        const anyChecked = ruleCheckboxes.some(cb =>
          cb.getAttribute('aria-checked') === 'true' || cb.checked === true
        );
        if (!anyChecked) {
          try {
            FBDOM.dispatchFullClick(ruleCheckboxes[0]);
          } catch (e) {}
          await new Promise(r => setTimeout(r, 400));
        }
      }

      // Also support radio buttons if layout uses radios
      const radios = dialog.querySelectorAll('input[type="radio"], div[role="radio"]');
      if (radios.length > 0) {
        try { FBDOM.dispatchFullClick(radios[0]); } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
      }

      // Step B: Locate the blue "Confirm" / "Delete" / "Remove" button
      let confirmBtn = dialog.querySelector('div[role="button"][aria-label="Confirm"]') ||
        dialog.querySelector('div[aria-label="Confirm"]') ||
        dialog.querySelector('div[role="button"][aria-label="Delete"]') ||
        dialog.querySelector('div[aria-label="Delete"]') ||
        dialog.querySelector('div[role="button"][aria-label="Remove"]') ||
        dialog.querySelector('div[aria-label="Remove"]') ||
        dialog.querySelector('div[role="button"][aria-label="हटाएं"]') ||
        dialog.querySelector('div[aria-label="हटाएं"]') ||
        dialog.querySelector('div[role="button"][aria-label="पुष्टि करें"]') ||
        dialog.querySelector('div[aria-label="पुष्टि करें"]') ||
        dialog.querySelector('button[aria-label="Confirm"]') ||
        dialog.querySelector('button[aria-label="Delete"]') ||
        dialog.querySelector('button[aria-label="Remove"]') ||
        dialog.querySelector('button[aria-label="हटाएं"]');

      if (!confirmBtn) {
        confirmBtn = FBDOM.findFirst(FBDOM.selectors.modalConfirmButtons, dialog);
      }

      if (!confirmBtn) {
        const dialogBtns = Array.from(dialog.querySelectorAll('div[role="button"], button'));
        for (const btn of dialogBtns) {
          const t = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
          if (t.includes('cancel') || t.includes('रद्द') || t.includes('वापस') || t.includes('close')) continue;
          if (t.includes('confirm') || t.includes('delete') || t.includes('remove') || t.includes('move') || t.includes('हटाएं') || t.includes('पुष्टि')) {
            confirmBtn = btn;
            break;
          }
        }
      }

      if (confirmBtn) {
        FBDOM.dispatchFullClick(confirmBtn);
        await new Promise(r => setTimeout(r, 1400));
      }
    }

    // 7. Success verification
    return { status: 'SUCCESS' };
  }

  /**
   * Find post element in current DOM
   */
  async locatePostElement(post) {
    // 1. Exact match by tagged data-fb-mgr-id (Instant match!)
    if (post.id) {
      const elById = document.querySelector(`[data-fb-mgr-id="${post.id}"]`);
      if (elById) {
        return elById;
      }
    }

    // 2. Match by text excerpt in feed
    if (post.text && post.text.length > 15) {
      const excerpt = post.text.substring(0, 30).toLowerCase();
      const articles = document.querySelectorAll('div[role="article"], div[data-pagelet^="FeedUnit"], div[role="feed"] > div');
      for (const a of articles) {
        if (a.textContent && a.textContent.toLowerCase().includes(excerpt)) {
          return a;
        }
      }
    }

    // 3. Exact match by post ID in href
    if (post.id && !post.id.startsWith('fb_post_')) {
      const postLink = document.querySelector(`a[href*="${post.id}"]`);
      if (postLink) {
        const parentArticle = postLink.closest('div[role="article"], div[data-pagelet^="FeedUnit"], div[role="feed"] > div');
        if (parentArticle) return parentArticle;
      }
    }

    // 4. Exact match by stored 3-dots action menu aria label!
    if (post.actionMenuAria) {
      const btn = document.querySelector(`div[aria-label="${post.actionMenuAria}"], div[role="button"][aria-label="${post.actionMenuAria}"]`);
      if (btn) {
        const article = btn.closest('div[role="article"], div[data-pagelet^="FeedUnit"]');
        if (article) return article;
      }
    }

    // 5. Scan all feed articles using FBDOM.verifyPostElement
    const postArticles = FBDOM.findAll(FBDOM.selectors.postArticles);
    for (const el of postArticles) {
      if (FBDOM.verifyPostElement(el, post)) {
        return el;
      }
    }

    // 6. Retry after scrolling slightly
    window.scrollBy({ top: 350, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 500));

    const retryArticles = FBDOM.findAll(FBDOM.selectors.postArticles);
    for (const el of retryArticles) {
      if (FBDOM.verifyPostElement(el, post)) {
        return el;
      }
    }

    return null;
  }

  /**
   * Detect Facebook CAPTCHA, temporary restrictions, or login popups
   */
  detectCaptchaOrRestriction() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (const d of dialogs) {
      const text = (d.textContent || '').toLowerCase();
      if (text.includes('security check') || text.includes('enter the text above') || text.includes('action blocked') || text.includes('account temporarily locked') || text.includes('confirm your identity')) {
        return true;
      }
    }

    // Check for iframe captchas
    const captchaFrames = document.querySelectorAll('iframe[src*="captcha"], iframe[src*="recaptcha"]');
    return captchaFrames.length > 0;
  }
};
}
var FBActions = window.FBActionsClass;

var fbActionsInstance = window.fbActionsInstance || new FBActions();
window.fbActionsInstance = fbActionsInstance;

// Listen for action commands
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'BULK_DELETE') {
      fbActionsInstance.bulkDeletePosts(request.posts || [], request.options || {}, (curr, total, results, msg) => {
        chrome.runtime.sendMessage({
          action: 'DELETE_PROGRESS',
          data: { current: curr, total, results, message: msg }
        });
      }).then(res => {
        sendResponse({ success: true, results: res });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // Keep sendResponse open for async
    } else if (request.action === 'STOP_DELETE') {
      fbActionsInstance.stop();
      sendResponse({ success: true });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBActions;
} else {
  window.FBActions = fbActionsInstance;
}
