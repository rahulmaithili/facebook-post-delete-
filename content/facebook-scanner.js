/**
 * FB AI Post Manager - Facebook Feed Post Scanner
 * Controlled, human-paced scrolling and resilient DOM extraction for Groups & Pages.
 */

class FBScanner {
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
    this.scanLimit = options.scanLimit || 500;
    this.scanDelay = options.scanDelay || 500; // Fast pacing

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
        reason: 'Direct instant scan complete',
        posts: Array.from(this.scannedPosts.values())
      });
      return;
    }

    while (this.isScanning) {
      if (this.isPaused) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // Fast scroll down
      await this.scrollStep();

      const prevCount = this.scannedPosts.size;
      this.extractVisiblePosts();
      const newCount = this.scannedPosts.size;

      this.emitProgress('SCAN_PROGRESS', {
        count: newCount,
        limit: this.scanLimit,
        latestPosts: Array.from(this.scannedPosts.values()).slice(-10)
      });

      // Check scan limit
      if (newCount >= this.scanLimit) {
        this.emitProgress('SCAN_COMPLETED', {
          count: newCount,
          reason: 'Scan limit reached',
          posts: Array.from(this.scannedPosts.values())
        });
        break;
      }

      // Check if new posts were discovered
      if (newCount === prevCount) {
        this.consecutiveEmptyScrolls++;
        if (this.consecutiveEmptyScrolls >= this.maxEmptyScrolls) {
          this.emitProgress('SCAN_COMPLETED', {
            count: newCount,
            reason: 'Feed reached end or no more posts available',
            posts: Array.from(this.scannedPosts.values())
          });
          break;
        }
      } else {
        this.consecutiveEmptyScrolls = 0;
      }
    }

    this.isScanning = false;
  }

  /**
   * Direct instant scan without any page scrolling
   */
  instantScan() {
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
   * Fast scroll increment
   */
  async scrollStep() {
    const scrollAmount = Math.floor(window.innerHeight * 0.9);
    window.scrollBy({
      top: scrollAmount,
      behavior: 'smooth'
    });

    // Rapid delay (e.g. 400ms - 600ms)
    const jitter = Math.floor(Math.random() * 150);
    await new Promise(r => setTimeout(r, this.scanDelay + jitter));
  }

  /**
   * Scan DOM for visible posts and extract metadata
   */
  extractVisiblePosts() {
    // Look inside feed first
    const feed = document.querySelector('[role="feed"]') || document;
    let postElements = Array.from(feed.querySelectorAll('div[role="article"], div[data-pagelet*="FeedUnit"]'));

    if (postElements.length === 0) {
      postElements = FBDOM.findAll(FBDOM.selectors.postArticles);
    }

    for (const postEl of postElements) {
      try {
        // Skip sidebar navigation, menus, or non-feed elements
        if (postEl.closest('[role="navigation"]') || postEl.closest('[aria-label="Manage Page"]') || postEl.closest('[role="banner"]')) {
          continue;
        }

        const postData = this.parsePostElement(postEl);
        if (postData && postData.id && !this.scannedPosts.has(postData.id)) {
          this.scannedPosts.set(postData.id, postData);
        }
      } catch (err) {
        // Continue scanning other posts
      }
    }
  }

  /**
   * Extract metadata from a single post DOM node
   */
  parsePostElement(postEl) {
    // Skip if it's too small to be a post (e.g. icon or badge)
    if (postEl.offsetHeight < 60 && postEl.offsetWidth < 150) {
      return null;
    }

    // 1. Permalink and ID
    const timeLinkEl = FBDOM.findFirst(FBDOM.selectors.postTimeLinks, postEl);
    const rawUrl = timeLinkEl ? (timeLinkEl.href || timeLinkEl.getAttribute('href') || '') : '';
    const cleanUrl = (typeof Helpers !== 'undefined')
      ? Helpers.stripFacebookTrackingParams(rawUrl)
      : rawUrl.split('?')[0];

    const postId = FBDOM.extractPostId(cleanUrl, postEl) || ('fb_post_' + Math.random().toString(36).substr(2, 9));
    
    // Tag the DOM node with unique post manager ID so actions can locate it instantly!
    postEl.setAttribute('data-fb-mgr-id', postId);
    postEl.dataset.fbMgrId = postId;

    // 2. Author Name - Resilient extraction for Facebook Groups and Pages
    let author = '';
    const pageTitle = document.title.split('|')[0].split('–')[0].split('-')[0].trim();

    // 2a. Check avatar image alt text (e.g. "nilam's profile photo" or "Rahul की प्रोफ़ाइल फ़ोटो")
    const avatarImg = postEl.querySelector('a[href*="/user/"] img, a[href*="/profile"] img, img[alt*="profile photo" i], img[alt*="प्रोफ़ाइल फ़ोटो" i]');
    if (avatarImg && avatarImg.alt) {
      const cleanAlt = avatarImg.alt
        .replace(/'s profile photo.*$/i, '')
        .replace(/ की प्रोफ़ाइल फ़ोटो.*$/i, '')
        .replace(/profile picture.*$/i, '')
        .trim();
      if (cleanAlt && cleanAlt.length >= 2 && !cleanAlt.toLowerCase().includes('avatar')) {
        author = cleanAlt;
      }
    }

    // 2b. Check User Profile Links inside the post header
    if (!author) {
      const userLink = postEl.querySelector('a[href*="/user/"] strong, a[href*="/user/"] span, a[href*="/profile.php"] strong');
      if (userLink && userLink.textContent.trim()) {
        const candidate = userLink.textContent.trim();
        if (candidate !== pageTitle && candidate.length >= 2) {
          author = candidate;
        }
      }
    }

    // 2c. Check Heading links (h2, h3, h4)
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

    // 2d. Fallback to FBDOM selectors
    if (!author) {
      const authorEl = FBDOM.findFirst(FBDOM.selectors.postAuthor, postEl);
      if (authorEl && authorEl.textContent.trim()) {
        author = authorEl.textContent.trim();
      }
    }

    // Filter out navigation or generic headings
    if (!author || ['Manage Page', 'Professional dashboard', 'Insights', 'Ad Centre', 'Settings', 'Facebook'].includes(author)) {
      author = pageTitle || 'Facebook Post';
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

// Global scanner instance
const fbScannerInstance = new FBScanner();

// Message listener for scanner commands
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
