/**
 * FB AI Post Manager - Resilient Facebook DOM Utilities & Cascading Selectors
 * Uses semantic attributes, ARIA roles, text matching, and multi-tier fallbacks.
 * Never relies on a single fragile obfuscated CSS class.
 */

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  try {
    document.documentElement.setAttribute('data-fb-extension-id', chrome.runtime.id);
  } catch (e) {}
}

var FBDOM = window.FBDOM || {
  // Cascading selector dictionaries for different Facebook UI components
  selectors: {
    // Containers holding the posts
    feedContainers: [
      '[role="feed"]',
      'div[data-pagelet*="Feed"]',
      'div[data-pagelet*="GroupFeed"]',
      'div[data-pagelet*="ProfileTimeline"]',
      'div[data-pagelet="Timeline"]',
      '#pagelet_group_mall',
      'div[role="main"]'
    ],

    // Individual post wrapper elements
    postArticles: [
      'div[role="feed"] > div[role="article"]',
      'div[role="feed"] > div:not([role="article"]) div[role="article"]',
      'div[role="feed"] > div',
      'div[data-pagelet*="FeedUnit"]',
      'div[role="article"]',
      'div[data-ad-preview="message"]',
      'div[aria-posinset]',
      'div[data-testid="post_message"]',
      'div.userContentWrapper'
    ],

    // Post author name elements
    postAuthor: [
      'h2 a[role="link"] span',
      'h3 a[role="link"] span',
      'h4 a[role="link"] span',
      'h2 strong a[role="link"]',
      'h3 strong a[role="link"]',
      'h4 strong a[role="link"]',
      'h2 a[role="link"]',
      'h3 a[role="link"]',
      'h4 a[role="link"]',
      'a[role="link"] strong',
      'strong a[role="link"]',
      'a[href*="/user/"] strong',
      'a[href*="/user/"] span',
      'h2 strong',
      'h3 strong',
      'h4 strong',
      'div[data-ad-rendering-role="profile_name"]'
    ],

    // Post permalink & timestamp (Strict matching to prevent catching action buttons)
    postTimeLinks: [
      'a[href*="/posts/"]',
      'a[href*="/permalink/"]',
      'a[href*="story_fbid="]',
      'a[href*="/reel/"]',
      'a[href*="/videos/"]',
      'a[href*="/photo/?fbid="]',
      'a[href*="/photo.php?fbid="]',
      'a[href*="/photos/"]',
      'h2 a[href*="/posts/"], h3 a[href*="/posts/"]',
      'a[role="link"][aria-label*="ago" i]',
      'a[role="link"][aria-label*="minute" i]',
      'a[role="link"][aria-label*="hour" i]',
      'a[role="link"][aria-label*="yesterday" i]',
      'a[role="link"][aria-label*="मिनट" i]',
      'a[role="link"][aria-label*="घंटे" i]',
      'a[role="link"][aria-label*="पहले" i]',
      'span[id*="jsc_c"] a',
      'abbr'
    ],

    // Post text body
    postText: [
      'div[data-ad-preview="message"]',
      'div[data-ad-comet-preview="message"]',
      'div[data-testid="post_message"]',
      'div[dir="auto"][style*="text-align"]',
      'div[dir="auto"]',
      'div.userContent'
    ],

    // "See more" text expansion button
    seeMoreButtons: [
      'div[role="button"]:has-text("See more")',
      'div[role="button"]:has-text("Xem thêm")',
      'div[role="button"]:has-text("Ver más")',
      'div[role="button"]:has-text("और देखें")',
      'span:has-text("See more")',
      'span:has-text("और देखें")'
    ],

    // Post three-dot action menu trigger
    actionMenuTriggers: [
      'div[role="button"][aria-label*="Actions for this post"]',
      'div[aria-label*="Actions for this post"]',
      'div[role="button"][aria-label*="Actions for this"]',
      'div[aria-label*="Actions for this"]',
      'div[role="button"][aria-label*="इस पोस्ट के लिए"]',
      'div[aria-label*="इस पोस्ट के लिए कार्रवाइयां"]',
      'div[aria-label*="इस पोस्ट के लिए कार्रवाई"]',
      'div[role="button"][aria-label*="कार्रवाइयां" i]',
      'div[role="button"][aria-label*="कार्रवाई" i]',
      'div[aria-haspopup="menu"][role="button"]',
      'div[aria-haspopup="menu"]',
      '[aria-haspopup="menu"]',
      'div[aria-label="More"][role="button"]',
      'div[aria-label*="Post options"]',
      'div[aria-label*="अधिक"][role="button"]',
      'div[role="button"][aria-label*="Actions" i]',
      'div[role="button"][aria-label*="विकल्प" i]',
      'div[role="button"][aria-label*="Options" i]',
      'div[aria-label*="विकल्प" i]'
    ],

    // Menu options for post deletion / removal (Facebook Groups & Pages)
    deleteMenuItems: [
      'div[role="menuitem"]:has-text("Remove post")',
      'div[role="menuitem"]:has-text("Delete post")',
      'div[role="menuitem"]:has-text("Remove post and ban author")',
      'div[role="menuitem"]:has-text("Delete post and remove author")',
      'div[role="menuitem"]:has-text("Move to trash")',
      'div[role="menuitem"]:has-text("Move to bin")',
      'div[role="menuitem"]:has-text("Delete")',
      'div[role="menuitem"]:has-text("Remove")',
      'div[role="menuitem"]:has-text("पोस्ट हटाएं")',
      'div[role="menuitem"]:has-text("हटाएं")',
      'div[role="menuitem"]:has-text("पोस्ट निकालें")',
      'div[role="menuitem"]:has-text("ग्रुप से हटाएं")',
      'div[role="menuitem"]:has-text("ट्रैश में डालें")',
      'div[role="menuitem"]:has-text("कचरा पेटी में ले जाएं")',
      'span:has-text("Remove post")',
      'span:has-text("Delete post")',
      'span:has-text("Move to trash")',
      'span:has-text("Move to bin")',
      'span:has-text("Delete")',
      'span:has-text("पोस्ट हटाएं")',
      'span:has-text("हटाएं")',
      'span:has-text("ट्रैश में डालें")'
    ],

    // Facebook Confirmation Modal Buttons
    modalConfirmButtons: [
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
      'div[role="dialog"] div[role="button"]:has-text("Delete")',
      'div[role="dialog"] button:has-text("Delete")',
      'div[role="dialog"] div[aria-label="हटाएं"]',
      'div[role="dialog"] div[aria-label="पुष्टि करें"]',
      'div[role="dialog"] div[role="button"]:has-text("पुष्टि करें")',
      'div[role="dialog"] div[role="button"]:has-text("हटाएं")',
      'div[role="dialog"] div[aria-label="Move"]',
      'div[role="dialog"] div[role="button"]:has-text("Move")'
    ],

    // Reactions, comments, shares, views
    reactionsContainer: [
      'span[aria-label*="reaction" i]',
      'span[aria-label*="reactions" i]',
      'span[aria-label*="like" i]',
      'span[aria-label*="likes" i]',
      'div[aria-label*="See who reacted" i]',
      'div[aria-label*="reactions" i]',
      'div[data-testid="UFI2ReactionsCount/root"]'
    ],
    commentsContainer: [
      'span:has-text("comment")',
      'div[role="button"]:has-text("comment")',
      'span:has-text("bình luận")',
      'span:has-text("comentario")',
      'span:has-text("टिप्पणी")'
    ],
    sharesContainer: [
      'span:has-text("share")',
      'div[role="button"]:has-text("share")',
      'span:has-text("chia sẻ")',
      'span:has-text("veces compartido")',
      'span:has-text("शेयर")'
    ],
    viewsContainer: [
      'span:has-text("view")',
      'span:has-text("plays")',
      'span:has-text("lượt xem")',
      'span:has-text("reproducciones")',
      'span:has-text("व्यू")'
    ]
  },

  trained: null,

  /**
   * Apply trained selectors dynamically learned from live DOM inspection
   */
  setTrainedSelectors(trained) {
    if (!trained) return;
    this.trained = trained;

    if (trained.feedSelector && !this.selectors.feedContainers.includes(trained.feedSelector)) {
      this.selectors.feedContainers.unshift(trained.feedSelector);
    }
    if (trained.postSelector && !this.selectors.postArticles.includes(trained.postSelector)) {
      this.selectors.postArticles.unshift(trained.postSelector);
    }
    if (trained.actionMenuTriggerSelector && !this.selectors.actionMenuTriggers.includes(trained.actionMenuTriggerSelector)) {
      this.selectors.actionMenuTriggers.unshift(trained.actionMenuTriggerSelector);
    }
    if (trained.deleteMenuItemSelector && !this.selectors.deleteMenuItems.includes(trained.deleteMenuItemSelector)) {
      this.selectors.deleteMenuItems.unshift(trained.deleteMenuItemSelector);
    }
    if (Array.isArray(trained.modalConfirmSelectors)) {
      for (const sel of trained.modalConfirmSelectors) {
        if (!this.selectors.modalConfirmButtons.includes(sel)) {
          this.selectors.modalConfirmButtons.unshift(sel);
        }
      }
    }
  },

  /**
   * Dispatches full synthetic event sequence compatible with modern Facebook React 18
   */
  dispatchFullClick(element) {
    if (!element) return;
    try {
      element.focus();
      const opts = { bubbles: true, cancelable: true, view: window };
      element.dispatchEvent(new PointerEvent('pointerdown', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new PointerEvent('pointerup', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
      element.click();
    } catch (e) {
      try { element.click(); } catch (err) {}
    }
  },

  /**
   * Find first matching element across an array of fallback selectors
   */
  findFirst(selectors, root = document) {
    if (!root) return null;
    for (const selector of selectors) {
      try {
        if (selector.includes(':has-text(')) {
          const match = this.findFirstByText(selector, root);
          if (match) return match;
        } else {
          const el = root.querySelector(selector);
          if (el) return el;
        }
      } catch (err) {
        // Continue to next fallback selector
      }
    }
    return null;
  },

  /**
   * Find all matching elements across selector list
   */
  findAll(selectors, root = document) {
    if (!root) return [];
    for (const selector of selectors) {
      try {
        if (!selector.includes(':has-text(')) {
          const els = Array.from(root.querySelectorAll(selector));
          if (els.length > 0) return els;
        }
      } catch (e) {}
    }
    return [];
  },

  /**
   * Pseudo-selector :has-text() implementation
   */
  findFirstByText(pseudoSelector, root = document) {
    const parts = pseudoSelector.split(':has-text(');
    const tag = parts[0] || '*';
    const targetText = parts[1].replace(/["')]/g, '').trim().toLowerCase();

    const candidates = root.querySelectorAll(tag);
    for (const el of candidates) {
      if (el.textContent && el.textContent.toLowerCase().includes(targetText)) {
        return el;
      }
    }
    return null;
  },

  /**
   * Extract numeric count from text (e.g., "42 comments", "1.2K shares", "53 reactions")
   */
  extractCountFromText(text) {
    if (!text || typeof text !== 'string') return 0;
    const clean = text.replace(/,/g, '').trim();
    const match = clean.match(/([\d.]+)\s*([kmKM])?/);
    if (!match) return 0;

    let num = parseFloat(match[1]);
    const multiplier = match[2] ? match[2].toUpperCase() : '';
    if (multiplier === 'K') num *= 1000;
    if (multiplier === 'M') num *= 1000000;
    return Math.round(num);
  },

  /**
   * Comprehensive Post Media & Thumbnail Extractor
   * Distinguishes post content photos/videos from user avatar icons.
   */
  extractPostMedia(postEl, postUrl = '') {
    let imageUrl = null;
    let type = 'TEXT';

    if (postUrl && postUrl.includes('/reel/')) {
      type = 'REEL';
    } else if (postUrl && postUrl.includes('/videos/')) {
      type = 'VIDEO';
    }

    // 1. Check for Video elements
    const videoEl = postEl.querySelector('video');
    if (videoEl) {
      type = type === 'REEL' ? 'REEL' : 'VIDEO';
      if (videoEl.poster) {
        imageUrl = videoEl.poster;
      }
    }

    // 2. Check for Comet Visual Completion Media Image (Used for photos in modern Facebook)
    if (!imageUrl) {
      const vcImg = postEl.querySelector('img[data-visualcompletion="media-vc-image"]');
      if (vcImg && vcImg.src) {
        imageUrl = vcImg.src;
        if (type === 'TEXT') type = 'IMAGE';
      }
    }

    // 3. Check for Photo Link containers
    if (!imageUrl) {
      const photoLinkImg = postEl.querySelector('a[href*="/photo"] img, a[href*="/photos/"] img, a[href*="fbid="] img');
      if (photoLinkImg && photoLinkImg.src) {
        imageUrl = photoLinkImg.src;
        if (type === 'TEXT') type = 'IMAGE';
      }
    }

    // 4. Check for feed media photos (excluding small avatar thumbnails)
    if (!imageUrl) {
      const imgs = Array.from(postEl.querySelectorAll('img'));
      for (const img of imgs) {
        // Skip user avatar icons and emojis
        const isAvatar = img.closest('a[href*="/user/"]') ||
                         img.closest('a[href*="/profile.php"]') ||
                         img.closest('a[aria-label*="profile" i]') ||
                         img.closest('svg') ||
                         (img.alt && (img.alt.includes('profile photo') || img.alt.includes('प्रोफ़ाइल फ़ोटो') || img.alt.includes('emoji') || img.alt.includes('avatar')));

        const isSmall = (img.naturalWidth > 0 && img.naturalWidth <= 75) ||
                        (img.width > 0 && img.width <= 75) ||
                        (img.naturalHeight > 0 && img.naturalHeight <= 75) ||
                        (img.height > 0 && img.height <= 75);

        if (!isAvatar && !isSmall && img.src && (img.src.includes('fbcdn.net') || img.src.includes('facebook.com') || img.src.startsWith('blob:')) && !img.src.includes('rsrc.php')) {
          imageUrl = img.src;
          if (type === 'TEXT') type = 'IMAGE';
          break;
        }
      }
    }

    // 5. Check background image styling if any
    if (!imageUrl) {
      const bgEls = postEl.querySelectorAll('div[style*="background-image"]');
      for (const bgEl of bgEls) {
        const style = bgEl.getAttribute('style') || '';
        const match = style.match(/url\(["']?([^"')]+)["']?\)/);
        if (match && match[1] && !match[1].includes('rsrc.php')) {
          imageUrl = match[1];
          if (type === 'TEXT') type = 'IMAGE';
          break;
        }
      }
    }

    if (type === 'TEXT' && postUrl && (!postUrl.includes('/posts/') && !postUrl.includes('/permalink/'))) {
      type = 'LINK';
    }

    return { type, imageUrl };
  },

  /**
   * Deep extraction of Likes, Comments, Shares, and Views from post DOM
   */
  extractPostEngagement(postEl) {
    let reactions = 0;
    let comments = 0;
    let shares = 0;
    let views = 0;

    // 1. Reactions
    const reactionEl = this.findFirst(this.selectors.reactionsContainer, postEl);
    if (reactionEl) {
      const label = reactionEl.getAttribute('aria-label') || reactionEl.textContent || '';
      reactions = this.extractCountFromText(label);
    } else {
      // Check for reaction counters in toolbar buttons
      const reactionSpans = Array.from(postEl.querySelectorAll('span[role="toolbar"] span, div[aria-label*="reaction" i], span[aria-label*="reaction" i]'));
      for (const s of reactionSpans) {
        const cnt = this.extractCountFromText(s.getAttribute('aria-label') || s.textContent);
        if (cnt > reactions) reactions = cnt;
      }
    }

    // 2. Scan all text elements in the post footer for Comments, Shares, and Views
    const allTextSpans = Array.from(postEl.querySelectorAll('span, div[role="button"]'));
    for (const el of allTextSpans) {
      const raw = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!raw || raw.length > 60) continue;

      // Comments match
      const cMatch = raw.match(/([\d.,]+)\s*([kmKM])?\s*(?:comments?|comment|bình luận|comentarios?|टिप्पणी|टिप्पणियां)/i);
      if (cMatch && comments === 0) {
        comments = this.extractCountFromText(cMatch[0]);
      }

      // Shares match
      const sMatch = raw.match(/([\d.,]+)\s*([kmKM])?\s*(?:shares?|share|chia sẻ|veces compartido|compartidos?|शेयर)/i);
      if (sMatch && shares === 0) {
        shares = this.extractCountFromText(sMatch[0]);
      }

      // Views / Plays match
      const vMatch = raw.match(/([\d.,]+)\s*([kmKM])?\s*(?:views?|view|plays?|play|lượt xem|reproducciones?|व्यू|व्यूज़)/i);
      if (vMatch && views === 0) {
        views = this.extractCountFromText(vMatch[0]);
      }
    }

    return { reactions, comments, shares, views };
  },

  /**
   * Extract unique post ID from URL or DOM attributes
   */
  extractPostId(url, element) {
    if (element) {
      const mgrId = element.getAttribute('data-fb-mgr-id');
      if (mgrId) return mgrId;
    }

    if (url) {
      const postsMatch = url.match(/\/posts\/([a-zA-Z0-9_-]+)/);
      if (postsMatch) return postsMatch[1];

      const permalinkMatch = url.match(/\/permalink\/([a-zA-Z0-9_-]+)/);
      if (permalinkMatch) return permalinkMatch[1];

      const multiMatch = url.match(/\/multi_permalinks\/([a-zA-Z0-9_-]+)/);
      if (multiMatch) return multiMatch[1];

      const storyFbidMatch = url.match(/story_fbid=([0-9]+)/);
      if (storyFbidMatch) return storyFbidMatch[1];

      const fbidMatch = url.match(/fbid=([0-9]+)/);
      if (fbidMatch) return fbidMatch[1];

      const reelMatch = url.match(/\/reel\/([0-9]+)/);
      if (reelMatch) return reelMatch[1];

      const videoMatch = url.match(/\/videos\/([0-9]+)/);
      if (videoMatch) return videoMatch[1];
    }

    // Check DOM attributes
    if (element) {
      const dataFt = element.getAttribute('data-ft');
      if (dataFt) {
        try {
          const parsed = JSON.parse(dataFt);
          if (parsed.top_level_post_id) return String(parsed.top_level_post_id);
        } catch {}
      }

      const idAttr = element.id || element.getAttribute('data-pagelet');
      if (idAttr) {
        const idMatch = idAttr.match(/(\d{8,})/);
        if (idMatch) return idMatch[1];
      }
    }

    return null;
  },

  /**
   * Verify with high confidence that a DOM element matches the expected post
   */
  verifyPostElement(element, expectedPost) {
    if (!element || !expectedPost) return false;

    // Check 0: Match tagged attribute if available
    if (element.getAttribute('data-fb-mgr-id') && element.getAttribute('data-fb-mgr-id') === expectedPost.id) {
      return true;
    }

    // Check 1: Post ID match in element links or attributes
    const extractedId = this.extractPostId(null, element);
    if (extractedId && extractedId === expectedPost.id) {
      return true;
    }

    // Check 2: Link href contains expected post URL or ID
    const links = Array.from(element.querySelectorAll('a[href]'));
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (expectedPost.id && href.includes(expectedPost.id)) return true;
      if (expectedPost.url && expectedPost.url.includes('/posts/') && href.includes(expectedPost.url.split('?')[0])) return true;
      if (expectedPost.url && expectedPost.url.includes('/permalink/') && href.includes(expectedPost.url.split('?')[0])) return true;
    }

    // Check 3: Text excerpt matching
    if (expectedPost.text && expectedPost.text.length > 15) {
      const excerpt = expectedPost.text.substring(0, 35).toLowerCase();
      if (element.textContent && element.textContent.toLowerCase().includes(excerpt)) {
        return true;
      }
    }

    // Check 4: Author name match in header
    if (expectedPost.author && expectedPost.author !== 'Facebook Post' && expectedPost.author !== 'Page Post') {
      const h = element.querySelector('h2, h3, h4');
      if (h && h.textContent.includes(expectedPost.author)) {
        return true;
      }
    }

    return false;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBDOM;
} else {
  window.FBDOM = FBDOM;
}
