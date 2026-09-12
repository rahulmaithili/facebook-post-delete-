/**
 * FB AI Post Manager - Facebook Context & Permission Detector
 * Detects whether the current page is a Facebook Group or Page,
 * extracts title/ID, and checks for admin/management privileges.
 */

var FBDetector = window.FBDetector || {
  detectContext() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    if (!hostname.includes('facebook.com')) {
      return {
        isFacebook: false,
        type: 'UNSUPPORTED',
        name: 'Not on Facebook',
        id: null,
        url: url,
        isAdmin: false
      };
    }

    let type = 'UNKNOWN';
    let name = document.title ? document.title.replace(/\s*\|\s*Facebook/i, '').trim() : 'Facebook';
    let id = null;

    // Detect Group
    const groupMatch = url.match(/facebook\.com\/groups\/([a-zA-Z0-9._-]+)/);
    if (groupMatch) {
      type = 'GROUP';
      id = groupMatch[1];
      // Try extracting cleaner group title from header
      const headerTitle = document.querySelector('h1 span, div[role="main"] h1');
      if (headerTitle && headerTitle.textContent.trim()) {
        name = headerTitle.textContent.trim();
      }
    }
    // Detect Page
    else if (url.includes('/pages/') || this.isPageUrl(url)) {
      type = 'PAGE';
      const pageMatch = url.match(/facebook\.com\/pages\/[^\/]+\/([0-9]+)/) || url.match(/facebook\.com\/([a-zA-Z0-9._-]+)/);
      id = pageMatch ? pageMatch[1] : null;
      const pageHeader = document.querySelector('h1 span, h1');
      if (pageHeader && pageHeader.textContent.trim()) {
        name = pageHeader.textContent.trim();
      }
    } else {
      type = 'FEED';
    }

    // Check for admin / moderation signals
    const isAdmin = this.checkAdminPermissions();

    return {
      isFacebook: true,
      type,
      name,
      id,
      url,
      isAdmin
    };
  },

  /**
   * Check if current page URL corresponds to a Facebook Page profile
   */
  isPageUrl(url) {
    try {
      const excludedPaths = ['watch', 'marketplace', 'gaming', 'events', 'bookmarks', 'messages', 'notifications', 'friends', 'saved', 'groups'];
      const path = new URL(url).pathname.split('/')[1] || '';
      if (!path || excludedPaths.includes(path.toLowerCase())) return false;

      // Check text signals on page: "Manage Page", "Professional dashboard", "Meta Business Suite"
      const bodyText = (document.body ? document.body.innerText : '') || '';
      if (bodyText.includes('Manage Page') || bodyText.includes('Professional dashboard') || bodyText.includes('पेज प्रबंधित करें')) {
        return true;
      }

      // Look for page action signals in DOM
      return Boolean(
        document.querySelector('a[href*="/professional_dashboard"]') ||
        document.querySelector('a[href*="business.facebook.com"]') ||
        document.querySelector('div[aria-label*="Manage Page"]') ||
        document.querySelector('div[aria-label*="Manage"]')
      );
    } catch (e) {
      return false;
    }
  },

  /**
   * Check if currently logged in user has administrative or post management privileges
   */
  checkAdminPermissions() {
    const adminSelectors = [
      'a[href*="/manage"]',
      'a[href*="/admin_assist"]',
      'a[href*="/moderation_history"]',
      'a[href*="/membership_requests"]',
      'div[aria-label*="Manage Group"]',
      'div[aria-label*="Manage Page"]',
      'div[aria-label*="Admin tools"]',
      'a[href*="/professional_dashboard"]'
    ];

    for (const selector of adminSelectors) {
      try {
        if (document.querySelector(selector)) {
          return true;
        }
      } catch (e) {}
    }

    // Secondary heuristic: check if posts have admin action menu
    const menuButtons = document.querySelectorAll('div[aria-label*="Actions for this post"], div[aria-haspopup="menu"]');
    return menuButtons.length > 0;
  }
};

// Listen for messages from popup or dashboard
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'DETECT_CONTEXT') {
      const context = FBDetector.detectContext();
      sendResponse({ success: true, context });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBDetector;
} else {
  window.FBDetector = FBDetector;
}
