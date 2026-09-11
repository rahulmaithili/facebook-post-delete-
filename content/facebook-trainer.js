/**
 * FB AI Post Manager - Live DOM Path Inspector & Selector Auto-Trainer
 * Dynamically tests and adapts selectors against live Facebook Group/Page markup.
 * Inspects element paths, validates action triggers, and trains bulk deletion paths.
 */

var FBTrainer = window.FBTrainer || {
  /**
   * Quick non-intrusive DOM path inspection
   * Verifies Feed container, post wrappers, and 3-dots action triggers.
   */
  async inspectDOMPaths() {
    const report = {
      timestamp: Date.now(),
      url: window.location.href,
      isGroup: window.location.href.includes('/groups/'),
      groupId: null,
      feed: { found: false, selector: null },
      posts: { found: false, count: 0, selector: null },
      actionTrigger: { found: false, selector: null, sampleAria: null },
      adminSignals: [],
      readyForBulkDelete: false,
      diagnostics: []
    };

    // 1. Group ID check
    const groupMatch = window.location.href.match(/facebook\.com\/groups\/([a-zA-Z0-9._-]+)/);
    if (groupMatch) {
      report.groupId = groupMatch[1];
    }

    // 2. Feed Container Check
    const feedSelectors = [
      'div[role="feed"]',
      'div[aria-label="Feed"]',
      'div[data-pagelet*="GroupFeed"]',
      'div[data-pagelet*="Feed"]',
      'div[role="main"]'
    ];

    for (const sel of feedSelectors) {
      const feedEl = document.querySelector(sel);
      if (feedEl) {
        report.feed.found = true;
        report.feed.selector = sel;
        report.diagnostics.push(`✅ Feed Container: Found (${sel})`);
        break;
      }
    }
    if (!report.feed.found) {
      report.diagnostics.push('⚠️ Feed Container: Using document fallback');
    }

    // 3. Post Articles Check
    const postSelectors = [
      'div[role="article"]',
      'div[data-pagelet^="FeedUnit"]',
      'div[role="feed"] > div[role="article"]',
      'div[role="feed"] > div:not([role="article"]) div[role="article"]',
      'div[data-ad-preview="message"]'
    ];

    let bestPostSel = null;
    let maxPostCount = 0;

    for (const sel of postSelectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > maxPostCount) {
        maxPostCount = count;
        bestPostSel = sel;
      }
    }

    if (maxPostCount > 0) {
      report.posts.found = true;
      report.posts.count = maxPostCount;
      report.posts.selector = bestPostSel;
      report.diagnostics.push(`✅ Post Elements: Detected ${maxPostCount} posts with "${bestPostSel}"`);
    } else {
      report.diagnostics.push('❌ Post Elements: None found on current viewport. Try scrolling slightly.');
    }

    // 4. Action Menu Trigger ("...") Check on visible posts
    const triggerSelectors = [
      'div[role="button"][aria-label*="Actions for this post"]',
      'div[role="button"][aria-label*="Actions for this"]',
      'div[role="button"][aria-label*="इस पोस्ट के लिए"]',
      'div[role="button"][aria-label*="कार्रवाइयां"]',
      'div[aria-haspopup="menu"][role="button"]',
      'div[aria-label="More"][role="button"]',
      'div[role="button"][aria-label*="Post options"]'
    ];

    const firstPost = document.querySelector(report.posts.selector || 'div[role="article"]');
    if (firstPost) {
      for (const tSel of triggerSelectors) {
        const btn = firstPost.querySelector(tSel);
        if (btn) {
          report.actionTrigger.found = true;
          report.actionTrigger.selector = tSel;
          report.actionTrigger.sampleAria = btn.getAttribute('aria-label') || 'aria-haspopup=menu';
          report.diagnostics.push(`✅ Action Menu Trigger: Found "${tSel}" (${report.actionTrigger.sampleAria})`);
          break;
        }
      }

      // If semantic aria selector failed, search for 3-dots SVG icon or role="button" inside post header
      if (!report.actionTrigger.found) {
        const candidateButtons = Array.from(firstPost.querySelectorAll('div[role="button"], button'));
        for (const btn of candidateButtons) {
          const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
          const hasMenu = btn.getAttribute('aria-haspopup') === 'menu';
          if (hasMenu || aria.includes('action') || aria.includes('more') || aria.includes('options') || aria.includes('विकल्प')) {
            report.actionTrigger.found = true;
            report.actionTrigger.selector = 'div[aria-haspopup="menu"][role="button"]';
            report.actionTrigger.sampleAria = btn.getAttribute('aria-label') || 'menu button';
            report.diagnostics.push(`✅ Action Menu Trigger: Identified fallback trigger button (${report.actionTrigger.sampleAria})`);
            break;
          }
        }
      }
    }

    if (!report.actionTrigger.found) {
      report.diagnostics.push('⚠️ Action Menu Trigger: Not detected on top post yet. Open menu test recommended.');
    }

    // 5. Admin / Moderator Signals
    const adminSignals = [
      { sel: 'a[href*="/manage"]', name: 'Manage tab' },
      { sel: 'a[href*="/admin_assist"]', name: 'Admin Assist' },
      { sel: 'a[href*="/membership_requests"]', name: 'Member Requests' },
      { sel: 'div[aria-label*="Manage Group"]', name: 'Manage Group button' },
      { sel: 'a[href*="/moderation_history"]', name: 'Moderation History' }
    ];

    for (const s of adminSignals) {
      if (document.querySelector(s.sel)) {
        report.adminSignals.push(s.name);
      }
    }

    report.readyForBulkDelete = report.posts.found && (report.actionTrigger.found || report.adminSignals.length > 0);
    return report;
  },

  /**
   * Safe, non-destructive live selector trainer:
   * Inspects top post, test-opens 3-dots menu to discover exact delete/remove options,
   * records the precise selector, and immediately closes the menu.
   */
  async trainActionPaths() {
    const inspection = await this.inspectDOMPaths();
    const result = {
      success: false,
      groupId: inspection.groupId,
      feedSelector: inspection.feed.selector || 'div[role="feed"]',
      postSelector: inspection.posts.selector || 'div[role="article"]',
      actionMenuTriggerSelector: inspection.actionTrigger.selector || 'div[role="button"][aria-label*="Actions for this post"]',
      deleteMenuItemText: null,
      deleteMenuItemSelector: null,
      modalConfirmSelectors: [
        'div[role="dialog"] div[role="button"][aria-label="Confirm"]',
        'div[role="dialog"] div[aria-label="Confirm"]',
        'div[role="dialog"] div[role="button"]:has-text("Confirm")',
        'div[role="dialog"] button:has-text("Confirm")',
        'div[role="dialog"] div[role="button"][aria-label="Remove"]',
        'div[role="dialog"] div[aria-label="Remove"]',
        'div[role="dialog"] div[role="button"]:has-text("Remove")',
        'div[role="dialog"] button:has-text("Remove")',
        'div[role="dialog"] div[role="button"][aria-label="Delete"]',
        'div[role="dialog"] div[aria-label="Delete"]',
        'div[role="dialog"] div[aria-label="हटाएं"]',
        'div[role="dialog"] div[aria-label="पुष्टि करें"]'
      ],
      learnedOptions: [],
      message: ''
    };

    // Locate first REAL post element that contains the 3-dots action button
    const candidateArticles = Array.from(document.querySelectorAll('div[role="article"], div[data-pagelet^="FeedUnit"]'));
    let postEl = null;
    let menuBtn = null;

    for (const art of candidateArticles) {
      // Skip composer box ("Write something...")
      if (
        art.querySelector('[data-pagelet="GroupInlineComposer"]') ||
        art.getAttribute('data-pagelet') === 'GroupInlineComposer' ||
        art.querySelector('input[placeholder*="Write something" i]') ||
        art.querySelector('div[aria-label*="Create a public post" i]')
      ) {
        continue;
      }

      // Check for 3-dots action menu trigger
      const btn = art.querySelector('div[role="button"][aria-label*="Actions for this post"], div[aria-label*="Actions for this post"], div[role="button"][aria-label*="इस पोस्ट के लिए"], div[aria-haspopup="menu"][role="button"]');
      if (btn) {
        postEl = art;
        menuBtn = btn;
        result.actionMenuTriggerSelector = 'div[role="button"][aria-label*="Actions for this post"]';
        break;
      }
    }

    if (!postEl || !menuBtn) {
      result.message = 'No post with 3-dots action menu found on screen to train on. Scroll down to show posts.';
      return result;
    }

    // Highlight the inspected post
    this.highlightElement(postEl, 'Training Selectors on this Post');

    try {
      // Test-click the 3-dots action menu to inspect popup menu items
      this.dispatchSafeClick(menuBtn);
      await new Promise(r => setTimeout(r, 900));

      // Locate open menu
      const menuContainer = document.querySelector('div[role="menu"]') || document.body;
      const menuItems = Array.from(menuContainer.querySelectorAll('div[role="menuitem"], span, div[role="button"]'));

      const deleteKeywords = [
        'remove post',
        'delete post',
        'move to trash',
        'move to bin',
        'delete post and remove author',
        'remove post and mute',
        'decline post',
        'delete',
        'remove',
        'पोस्ट हटाएं',
        'पोस्ट निकालें',
        'हटाएं',
        'ट्रैश में डालें',
        'कचरा पेटी में भेजें'
      ];

      for (const item of menuItems) {
        const text = (item.textContent || item.getAttribute('aria-label') || '').trim();
        const lower = text.toLowerCase();
        if (text && text.length < 60 && !result.learnedOptions.includes(text)) {
          result.learnedOptions.push(text);
        }

        for (const kw of deleteKeywords) {
          if (lower.includes(kw) && !result.deleteMenuItemText) {
            result.deleteMenuItemText = text;
            result.deleteMenuItemSelector = `div[role="menuitem"]:has-text("${text}")`;
            break;
          }
        }
      }

      // Close menu safely by pressing Escape or clicking outside
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      document.body.click();
      await new Promise(r => setTimeout(r, 300));

      if (result.deleteMenuItemText) {
        result.success = true;
        result.message = `Successfully trained! Learned removal path: "${result.deleteMenuItemText}"`;
      } else {
        result.success = true; // Partial success
        result.deleteMenuItemText = 'Remove post'; // Default to standard Facebook Group removal
        result.deleteMenuItemSelector = 'div[role="menuitem"]:has-text("Remove post"), div[role="menuitem"]:has-text("Delete post")';
        result.message = `Action menu verified (${result.learnedOptions.length} items detected). Using adaptive fallback.`;
      }
    } catch (err) {
      result.message = `Training error: ${err.message}`;
    } finally {
      this.clearHighlight();
    }

    return result;
  },

  /**
   * Dispatch full synthetic click sequence compatible with Facebook React 18 event system
   */
  dispatchSafeClick(element) {
    if (!element) return;
    element.focus();
    const opts = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new PointerEvent('pointerdown', opts));
    element.dispatchEvent(new MouseEvent('mousedown', opts));
    element.dispatchEvent(new PointerEvent('pointerup', opts));
    element.dispatchEvent(new MouseEvent('mouseup', opts));
    element.click();
  },

  /**
   * Visual feedback: highlight element with training banner
   */
  highlightElement(el, bannerText = 'Inspecting Element') {
    this.clearHighlight();
    if (!el) return;

    el.setAttribute('data-fb-training-highlight', 'true');
    el.style.outline = '3px solid #3b82f6';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '8px';
    el.style.transition = 'all 0.3s ease';

    const badge = document.createElement('div');
    badge.id = 'fb-training-badge';
    badge.textContent = `🎯 FB AI Trainer: ${bannerText}`;
    badge.style.cssText = 'position: absolute; top: -28px; left: 10px; background: #3b82f6; color: white; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 4px; z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); pointer-events: none;';
    
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
    el.appendChild(badge);
  },

  clearHighlight() {
    const existing = document.querySelector('[data-fb-training-highlight]');
    if (existing) {
      existing.removeAttribute('data-fb-training-highlight');
      existing.style.outline = '';
      existing.style.outlineOffset = '';
    }
    const badge = document.getElementById('fb-training-badge');
    if (badge) badge.remove();
  }
};

// Listen for trainer messages
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'INSPECT_DOM_PATHS') {
      FBTrainer.inspectDOMPaths().then(report => {
        sendResponse({ success: true, report });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    } else if (request.action === 'TRAIN_SELECTORS') {
      FBTrainer.trainActionPaths().then(trainingResult => {
        sendResponse({ success: true, training: trainingResult });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBTrainer;
} else {
  window.FBTrainer = FBTrainer;
}
