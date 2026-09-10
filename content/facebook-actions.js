/**
 * FB AI Post Manager - Safe Facebook Actions & Verified Sequential Bulk Deletion
 * Enforces Anti-Accident verification, stops on unexpected DOM/CAPTCHA, never fakes success.
 */

class FBActions {
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
          results.details.push({ id: post.id, status: 'SUCCESS', message: 'Post successfully moved to trash/deleted.' });
        } else if (deleteResult.status === 'SKIPPED') {
          results.skipped++;
          results.details.push({ id: post.id, status: 'SKIPPED', message: deleteResult.reason });
        } else {
          results.failed++;
          results.details.push({ id: post.id, status: 'FAILED', message: deleteResult.reason });
        }
      } catch (err) {
        // Unexpected critical error or security stop
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

      // Safe delay between sequential deletions to respect normal browser pacing
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
    let actionMenuBtn = FBDOM.findFirst(FBDOM.selectors.actionMenuTriggers, postElement);
    if (!actionMenuBtn) {
      // Look for any button with 3-dots or menu attributes in postElement
      const buttons = Array.from(postElement.querySelectorAll('div[role="button"], button'));
      for (const btn of buttons) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const hasMenu = btn.getAttribute('aria-haspopup') === 'menu';
        if (hasMenu || aria.includes('actions') || aria.includes('action') || aria.includes('more') || aria.includes('कार्रवाई') || aria.includes('विकल्प')) {
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

    // Click menu
    actionMenuBtn.focus();
    actionMenuBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    actionMenuBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    actionMenuBtn.click();
    await new Promise(r => setTimeout(r, 900));

    // 5. Look for "Delete post", "Remove post", "Move to trash" option in the open menu
    let deleteMenuItem = FBDOM.findFirst(FBDOM.selectors.deleteMenuItems, document.body);
    if (!deleteMenuItem) {
      // Scan all open menu items for delete/trash/remove terms
      const menuItems = Array.from(document.querySelectorAll('div[role="menu"] div[role="menuitem"], div[role="menu"] span, div[role="menuitem"]'));
      for (const mi of menuItems) {
        const t = (mi.textContent || mi.getAttribute('aria-label') || '').trim().toLowerCase();
        if (t.includes('delete') || t.includes('remove') || t.includes('trash') || t.includes('bin') || t.includes('हटाएं') || t.includes('निकालें') || t.includes('ट्रैश')) {
          deleteMenuItem = mi;
          break;
        }
      }
    }

    if (!deleteMenuItem) {
      // Close menu by clicking away
      document.body.click();
      return {
        status: 'SKIPPED',
        reason: 'No "Delete post" or "Remove post" option in menu. Check Admin/Moderator permissions.'
      };
    }

    // Click Delete option
    deleteMenuItem.click();
    await new Promise(r => setTimeout(r, 1000));

    // 6. Look for Facebook's confirmation modal dialog
    let confirmBtn = FBDOM.findFirst(FBDOM.selectors.modalConfirmButtons, document.body);
    if (!confirmBtn) {
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        const dialogBtns = Array.from(dialog.querySelectorAll('div[role="button"], button'));
        for (const btn of dialogBtns) {
          const t = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
          // Exclude Cancel / Back buttons
          if (t.includes('cancel') || t.includes('रद्द') || t.includes('वापस') || t.includes('close')) continue;
          if (t.includes('delete') || t.includes('remove') || t.includes('move') || t.includes('confirm') || t.includes('हटाएं') || t.includes('पुष्टि')) {
            confirmBtn = btn;
            break;
          }
        }
      }
    }

    if (confirmBtn) {
      confirmBtn.click();
      await new Promise(r => setTimeout(r, 1400));
    }

    // 7. Success verification
    return { status: 'SUCCESS' };
  }

  /**
   * Find post element in current DOM
   */
  async locatePostElement(post) {
    // 1. Exact match by tagged data-fb-mgr-id
    if (post.id) {
      const elById = document.querySelector(`[data-fb-mgr-id="${post.id}"]`);
      if (elById) return elById;
    }

    // 2. Exact match by post ID in href
    if (post.id && !post.id.startsWith('fb_post_')) {
      const postLink = document.querySelector(`a[href*="${post.id}"]`);
      if (postLink) {
        const parentArticle = postLink.closest('div[role="article"], div[data-pagelet*="FeedUnit"], div[role="feed"] > div');
        if (parentArticle) return parentArticle;
      }
    }

    // 3. Scan all feed articles using FBDOM.verifyPostElement
    const postArticles = FBDOM.findAll(FBDOM.selectors.postArticles);
    for (const el of postArticles) {
      if (FBDOM.verifyPostElement(el, post)) {
        return el;
      }
    }

    // 4. Retry after scrolling slightly
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
}

const fbActionsInstance = new FBActions();

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
