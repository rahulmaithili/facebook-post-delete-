/**
 * FB AI Post Manager - Facebook Feed Post Scanner
 * Controlled, human-paced scrolling and resilient DOM extraction for Groups & Pages.
 */

if (typeof window.FBScannerClass === 'undefined') {
  window.FBScannerClass = class FBScanner {
  constructor() {
    this.isScanning = false;
    this.isPaused = false;
    this.scannedPosts = new Map();
    this.scanLimit = 500;
    this.scanDelay = 2200;
    this.consecutiveEmptyScrolls = 0;
    this.maxEmptyScrolls = 4;
  }

  /**
   * Start post scanning
   */
  async startScan(options = {}) {
    if (this.isScanning) return;
    this.isScanning = true;
    this.isPaused = false;
    this.scannedPosts.clear();
    this.consecutiveEmptyScrolls = 0;
    this.scanLimit = options.scanLimit || 50;
    this.scanDelay = options.scanDelay || 800; // Human & network paced

    this.emitProgress('SCAN_STARTED', { count: 0, limit: this.scanLimit });

    // Step 1: Immediate extraction of all currently loaded posts in DOM
    this.extractVisiblePosts();
    const initialCount = this.scannedPosts.size;
    this.emitProgress('SCAN_PROGRESS', {
      count: initialCount,
      limit: this.scanLimit,
      latestPosts: Array.from(this.scannedPosts.values())
    });

    // If instant scan requested or limit reached, finish immediately
    if (options.instant || initialCount >= this.scanLimit) {
      this.isScanning = false;
      this.emitProgress('SCAN_COMPLETED', {
        count: initialCount,
        reason: 'Target limit reached',
        posts: Array.from(this.scannedPosts.values())
      });
      return;
    }

    while (this.isScanning) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      const prevCount = this.scannedPosts.size;
      const isStuck = this.consecutiveEmptyScrolls >= 2;

      // Dynamic Facebook infinite feed scroll step
      await this.scrollStep(isStuck);

      // Extract new posts rendered in DOM
      this.extractVisiblePosts();
      const newCount = this.scannedPosts.size;

      if (newCount > prevCount) {
        this.consecutiveEmptyScrolls = 0;
        this.emitProgress('SCAN_PROGRESS', {
          count: newCount,
          limit: this.scanLimit,
          latestPosts: Array.from(this.scannedPosts.values()).slice(-15)
        });
      } else {
        this.consecutiveEmptyScrolls++;
      }

      // Check scan limit (e.g. 50 or 100 posts reached!)
      if (newCount >= this.scanLimit) {
        this.emitProgress('SCAN_COMPLETED', {
          count: newCount,
          reason: 'Scan limit reached',
          posts: Array.from(this.scannedPosts.values())
        });
        break;
      }

      // Allow up to 18 attempts (gives Facebook ~25-30s to fetch & load older posts from network)
      if (this.consecutiveEmptyScrolls >= 18) {
        this.emitProgress('SCAN_COMPLETED', {
          count: newCount,
          reason: 'End of timeline reached',
          posts: Array.from(this.scannedPosts.values())
        });
        break;
      }
    }

    this.isScanning = false;
    this.emitProgress('SCAN_COMPLETED', {
      count: this.scannedPosts.size,
      reason: 'Scan completed',
      posts: Array.from(this.scannedPosts.values())
    });
  }

  /**
   * Direct instant scan without any page scrolling
   */
  instantScan() {
    this.scannedPosts.clear();
    this.extractVisiblePosts();
    const posts = Array.from(this.scannedPosts.values());
    this.emitProgress('SCAN_COMPLETED', {
      count: posts.length,
      reason: 'Direct instant scan complete',
      posts
    });
    return posts;
  }

  pauseScan() {
    this.isPaused = true;
    this.emitProgress('SCAN_PAUSED', { count: this.scannedPosts.size });
  }

  resumeScan() {
    this.isPaused = false;
    this.emitProgress('SCAN_RESUMED', { count: this.scannedPosts.size });
  }

  stopScan() {
    this.isScanning = false;
    this.emitProgress('SCAN_STOPPED', {
      count: this.scannedPosts.size,
      posts: Array.from(this.scannedPosts.values())
    });
  }

  /**
   * Facebook Infinite Feed Scroll Increment
   * Automatically triggers Facebook's GraphQL IntersectionObserver sentinel.
   */
  async scrollStep(isStuck = false) {
    const feed = document.querySelector('[role="feed"], div[data-pagelet*="GroupFeed"], div[data-pagelet*="Feed"], div[role="main"]');
    const articles = Array.from(document.querySelectorAll('div[role="feed"] > div, div[role="article"]'));

    // 1. Scroll the very last article or child into view so Facebook triggers loader
    if (articles.length > 0) {
      const lastArticle = articles[articles.length - 1];
      try {
        lastArticle.scrollIntoView({ behavior: 'instant', block: 'end' });
      } catch (e) {}
    } else if (feed && feed.lastElementChild) {
      try {
        feed.lastElementChild.scrollIntoView({ behavior: 'instant', block: 'end' });
      } catch (e) {}
    }

    // 2. Scroll window to document bottom
    const docHeight = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0,
      window.scrollY + window.innerHeight
    );

    if (isStuck) {
      // Jiggle: scroll up slightly, then jump back to bottom to re-activate Facebook IntersectionObserver
      window.scrollTo(0, Math.max(0, docHeight - 450));
      await new Promise(r => setTimeout(r, 120));
      window.scrollTo(0, docHeight + 800);
    } else {
      window.scrollTo(0, docHeight + 400);
    }

    // 3. Scroll feed container if it has internal scrollbar
    if (feed && feed.scrollHeight > feed.clientHeight) {
      feed.scrollTop = feed.scrollHeight;
    }

    // 4. Dispatch synthetic scroll & wheel events to wake Facebook's listeners
    window.dispatchEvent(new Event('scroll', { bubbles: true }));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, bubbles: true }));

    // 5. Adaptive network delay
    const spinner = document.querySelector('[role="progressbar"], div[role="feed"] svg circle, div[role="feed"] [aria-label*="loading" i]');
    const delay = spinner ? 1800 : (isStuck ? 1400 : Math.max(800, this.scanDelay));
    await new Promise(r => setTimeout(r, delay));
  }

  /**
   * Scan DOM for visible posts and extract metadata
   */
  extractVisiblePosts() {
    const candidateNodes = new Set();

    // 1. Look inside feed container children
    const feed = document.querySelector('[role="feed"], div[data-pagelet*="GroupFeed"], div[data-pagelet*="Feed"], div[role="main"]');
    if (feed) {
      const feedChildren = feed.children;
      for (let i = 0; i < feedChildren.length; i++) {
        const child = feedChildren[i];
        if (child && child.offsetHeight > 70 && child.offsetWidth > 150) {
          const innerArticle = child.querySelector('div[role="article"]');
          candidateNodes.add(innerArticle || child);
        }
      }
    }

    // 2. All role="article" elements
    const articles = document.querySelectorAll('div[role="article"], div[data-pagelet^="FeedUnit"], div[data-ad-preview="message"], div[aria-posinset]');
    articles.forEach(el => candidateNodes.add(el));

    // 3. Fallback from FBDOM
    if (candidateNodes.size === 0) {
      const fbDomEls = FBDOM.findAll(FBDOM.selectors.postArticles);
      fbDomEls.forEach(el => candidateNodes.add(el));
    }

    for (const postEl of candidateNodes) {
      try {
        if (postEl.closest('[role="navigation"]') || postEl.closest('[aria-label="Manage Page"]') || postEl.closest('[role="banner"]')) {
          continue;
        }

        const postData = this.parsePostElement(postEl);
        if (postData && postData.id && !this.scannedPosts.has(postData.id)) {
          this.scannedPosts.set(postData.id, postData);
        }
      } catch (err) {}
    }
  }

  /**
   * Extract metadata from a single post DOM node
   */
  parsePostElement(postEl) {
    if (!postEl) return null;

    // Skip if it's too small to be a post (e.g. icon or badge)
    if (postEl.offsetHeight < 60 && postEl.offsetWidth < 150) {
      return null;
    }

    // Skip composer ("Write something..."), announcement banners, navigation
    if (
      postEl.querySelector('[data-pagelet="GroupInlineComposer"]') ||
      postEl.getAttribute('data-pagelet') === 'GroupInlineComposer' ||
      postEl.closest('[role="navigation"]') ||
      postEl.closest('[role="banner"]')
    ) {
      return null;
    }

    // 0. Locate Action Menu Trigger ("...") with resilient multi-tier fallback
    let actionMenuBtn = FBDOM.findFirst(FBDOM.selectors.actionMenuTriggers, postEl);
    if (!actionMenuBtn) {
      const btns = postEl.querySelectorAll('div[role="button"], button, [role="button"]');
      for (const btn of btns) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const hasPopup = btn.getAttribute('aria-haspopup') === 'menu' || btn.getAttribute('aria-haspopup') === 'true';
        if (hasPopup || aria.includes('action') || aria.includes('more') || aria.includes('option') || aria.includes('कार्रवाई') || aria.includes('अधिक') || aria.includes('विकल्प')) {
          actionMenuBtn = btn;
          break;
        }
      }
    }

    const actionMenuAria = actionMenuBtn ? (actionMenuBtn.getAttribute('aria-label') || '') : '';

    // 1. Permalink and ID
    let timeLinkEl = FBDOM.findFirst(FBDOM.selectors.postTimeLinks, postEl);
    if (!timeLinkEl) {
      const anchors = Array.from(postEl.querySelectorAll('a[role="link"], a[href], span[dir="auto"]'));
      const timeRegex = /\b(\d+\s*(?:s|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?|y|yrs|years?)|just now|yesterday|\d+\s*(?:दिन|घंटे|मिनट)\s*पहले)\b/i;
      for (const a of anchors) {
        if (a.closest('h2, h3, h4')) continue;
        if (timeRegex.test(a.textContent || '') || timeRegex.test(a.getAttribute('aria-label') || '')) {
          timeLinkEl = a;
          break;
        }
      }
    }

    // Safety: Post must have at least author, content, or action menu/interactions
    const hasAuthorSignal = postEl.querySelector('h2, h3, h4, a[href*="/user/"], a[href*="/profile"], strong a');
    const hasContentSignal = postEl.querySelector('div[dir="auto"], img, video, a[href*="youtube.com"], a[href*="youtu.be"], [data-ad-preview="message"]');
    const hasInteractionSignal = postEl.querySelector('[role="toolbar"], div[aria-label*="Like" i], div[aria-label*="Comment" i], div[aria-label*="Share" i], div[aria-label*="पसंद" i]');

    if (!hasAuthorSignal && !hasContentSignal && !actionMenuBtn && !hasInteractionSignal) {
      return null;
    }

    const rawUrl = timeLinkEl ? (timeLinkEl.href || timeLinkEl.getAttribute('href') || '') : '';
    const cleanUrl = (typeof Helpers !== 'undefined')
      ? Helpers.stripFacebookTrackingParams(rawUrl)
      : rawUrl.split('?')[0];

    let postId = FBDOM.extractPostId(cleanUrl, postEl);
    if (!postId) {
      // Create a collision-free deterministic seed from URL, post text, media, and action attributes
      const mediaEl = postEl.querySelector('img:not([alt*="profile photo" i]), video');
      const mediaSrc = mediaEl ? (mediaEl.src || mediaEl.getAttribute('poster') || '') : '';
      const textSample = (postEl.textContent || '').replace(/\s+/g, ' ').substring(0, 120).trim();

      const seed = `${cleanUrl}|${textSample}|${mediaSrc.slice(-35)}|${actionMenuAria}`;
      if (seed.replace(/\|/g, '').length > 5) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
          hash = ((hash << 5) - hash) + seed.charCodeAt(i);
          hash |= 0;
        }
        postId = 'fb_post_' + Math.abs(hash);
      }
    }
    if (!postId) {
      postId = 'fb_post_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    }
    
    // Tag the DOM node with unique post manager ID so actions can locate it instantly!
    postEl.setAttribute('data-fb-mgr-id', postId);
    postEl.dataset.fbMgrId = postId;

    // 2. Author Name - Resilient extraction for Facebook Groups and Pages
    let author = '';
    const pageTitle = document.title.split('|')[0].split('–')[0].split('-')[0].trim();

    // 2a. Check 3-dots aria-label: "Actions for this post by Suresh Mishra"
    if (actionMenuAria) {
      const matchEn = actionMenuAria.match(/Actions for this post by (.+)$/i);
      if (matchEn && matchEn[1].trim()) {
        author = matchEn[1].trim();
      } else {
        const matchHi = actionMenuAria.match(/(.+) की इस पोस्ट के लिए/i);
        if (matchHi && matchHi[1].trim()) {
          author = matchHi[1].trim();
        }
      }
    }

    // 2b. Check avatar image alt text (e.g. "nilam's profile photo" or "Rahul की प्रोफ़ाइल फ़ोटो")
    if (!author) {
      const avatarImg = postEl.querySelector('a[href*="/user/"] img, a[href*="/profile"] img, img[alt*="profile photo" i], img[alt*="प्रोफ़ाइल फ़ोटो" i]');
      if (avatarImg && avatarImg.alt) {
        const cleanAlt = avatarImg.alt
          .replace(/'s profile photo.*$/i, '')
          .replace(/ की प्रोफ़ाइल फ़ोटो.*$/i, '')
          .replace(/profile picture.*$/i, '')
          .trim();
        if (cleanAlt && cleanAlt.length >= 2 && !cleanAlt.toLowerCase().includes('avatar') && cleanAlt !== pageTitle) {
          author = cleanAlt;
        }
      }
    }

    // 2c. Check User Profile Links inside the post header
    if (!author) {
      const userLink = postEl.querySelector('a[href*="/user/"] strong, a[href*="/user/"] span, a[href*="/profile.php"] strong');
      if (userLink && userLink.textContent.trim()) {
        const candidate = userLink.textContent.trim();
        if (candidate !== pageTitle && candidate.length >= 2) {
          author = candidate;
        }
      }
    }

    // 2d. Check Heading links (h2, h3, h4)
    if (!author) {
      const headerLinks = Array.from(postEl.querySelectorAll('h2 a[role="link"], h3 a[role="link"], h4 a[role="link"], strong a[role="link"]'));
      for (const hl of headerLinks) {
        const candidate = hl.textContent.trim();
        const href = hl.getAttribute('href') || '';
        // Skip links pointing to the group itself or hashtags
        if (candidate && candidate !== pageTitle && !href.includes('/groups/') && !href.includes('/hashtag/')) {
          author = candidate;
          break;
        } else if (candidate && candidate !== pageTitle && candidate.length > 2 && !author) {
          author = candidate;
        }
      }
    }

    // 2e. Fallback to FBDOM selectors
    if (!author) {
      const authorEl = FBDOM.findFirst(FBDOM.selectors.postAuthor, postEl);
      if (authorEl && authorEl.textContent.trim()) {
        const candidate = authorEl.textContent.trim();
        if (candidate !== pageTitle) author = candidate;
      }
    }

    // Never default author to page title for group posts
    if (!author || author === pageTitle || ['Manage Page', 'Professional dashboard', 'Insights', 'Ad Centre', 'Settings', 'Facebook'].includes(author)) {
      author = 'Group Member';
    }

    // 3. Post Text & Expand "See more" if needed
    const seeMoreBtn = FBDOM.findFirst(FBDOM.selectors.seeMoreButtons, postEl);
    if (seeMoreBtn) {
      try { seeMoreBtn.click(); } catch (e) {}
    }

    let text = '';
    // Look specifically for dedicated message containers first
    const textEl = postEl.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[data-testid="post_message"]');
    if (textEl && textEl.textContent) {
      text = textEl.textContent.trim();
    } else {
      // Fallback: search for dir="auto" inside the post content body
      const dirAutos = Array.from(postEl.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
      for (const d of dirAutos) {
        // Skip toolbar, buttons, comments input, author headings
        if (d.closest('h2, h3, h4, [role="button"], [role="toolbar"], form, [aria-label*="comment" i], [aria-label*="reaction" i]')) {
          continue;
        }
        const candidate = d.textContent.trim();
        // Ignore single-word action labels
        const isActionLabel = /^(like|comment|share|reply|send|reactions?|likes?|views?|shares?)$/i.test(candidate);
        if (!isActionLabel && candidate.length > text.length) {
          text = candidate;
        }
      }
    }

    // Clean up "See more" or "और देखें" from end of text
    text = text.replace(/See more$/i, '').replace(/और देखें$/i, '').trim();

    // 4. Date / Timestamp
    let dateStr = new Date().toISOString();
    if (timeLinkEl) {
      const ariaLabel = timeLinkEl.getAttribute('aria-label') || timeLinkEl.textContent || '';
      if (ariaLabel) {
        dateStr = ariaLabel;
      }
    }

    // 5. Media & Post Type (Photo/Video Thumbnail)
    const media = FBDOM.extractPostMedia(postEl, cleanUrl);
    const type = media.type;
    const imageUrl = media.imageUrl;

    // 6. Complete Engagement Counters (Reactions, Comments, Shares, Views)
    const engagement = FBDOM.extractPostEngagement(postEl);
    const reactions = engagement.reactions;
    const comments = engagement.comments;
    const shares = engagement.shares;
    const views = engagement.views;

    return {
      id: postId,
      url: cleanUrl || window.location.href,
      type,
      author,
      date: dateStr,
      text,
      imageUrl,
      reactions,
      comments,
      shares,
      views,
      actionMenuAria: actionMenuAria || '',
      // Initial status
      status: 'SCANNED',
      isSelected: false,
      recommendation: 'PENDING',
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Helper to send events to dashboard / popup
   */
  emitProgress(action, data) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action, data });
      } catch (err) {}
    }
  }
}
}
var FBScanner = window.FBScannerClass;

// Global scanner instance
var fbScannerInstance = window.fbScannerInstance || new FBScanner();
window.fbScannerInstance = fbScannerInstance;

// Message listener for scanner commands
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING_SCANNER') {
      sendResponse({ success: true, status: 'ALIVE' });
      return;
    }
    if (request.action === 'INSTANT_SCAN') {
      const posts = fbScannerInstance.instantScan();
      sendResponse({ success: true, count: posts.length, posts });
    } else if (request.action === 'START_SCAN') {
      fbScannerInstance.startScan(request.options || {});
      sendResponse({ success: true, status: 'SCANNING' });
    } else if (request.action === 'RESET_SCAN') {
      fbScannerInstance.stopScan();
      fbScannerInstance.scannedPosts.clear();
      sendResponse({ success: true });
    } else if (request.action === 'PAUSE_SCAN') {
      fbScannerInstance.pauseScan();
      sendResponse({ success: true, status: 'PAUSED' });
    } else if (request.action === 'RESUME_SCAN') {
      fbScannerInstance.resumeScan();
      sendResponse({ success: true, status: 'RESUMED' });
    } else if (request.action === 'STOP_SCAN') {
      fbScannerInstance.stopScan();
      sendResponse({ success: true, status: 'STOPPED' });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBScanner;
} else {
  window.FBScanner = fbScannerInstance;
}
