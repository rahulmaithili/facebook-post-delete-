/**
 * FB AI Post Manager - Storage & Configuration Manager
 * Backed by chrome.storage.local with automatic localStorage fallback for standalone/demo usage.
 */

const DEFAULT_SETTINGS = {
  aiProvider: 'gemini', // 'gemini' or 'custom'
  apiKey: '',
  backendUrl: '',
  aiModel: 'gemini-3.6-flash',
  scanLimit: 500,
  scanDelay: 2200, // ms between scroll increments
  deleteBatchDelay: 2500, // ms between sequential post deletions
  minConfidence: 0.70,
  autoSelectAiDelete: false, // Default: OFF as required by safety specifications
  darkMode: true,
  confirmBeforeDelete: true, // Permanent safety requirement
  rules: {
    minQuality: 40,
    minEngagement: 15,
    maxSpam: 75,
    maxDuplicate: 85
  }
};

const STORAGE_KEYS = {
  SETTINGS: 'fb_ai_settings',
  POSTS: 'fb_ai_posts',
  CURRENT_SCAN: 'fb_ai_scan_info'
};

class StorageManager {
  static isChromeStorageAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  /**
   * Load user settings or default values
   */
  static async getSettings() {
    try {
      if (this.isChromeStorageAvailable()) {
        const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
        return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return item ? { ...DEFAULT_SETTINGS, ...JSON.parse(item) } : { ...DEFAULT_SETTINGS };
      }
    } catch (err) {
      console.error('Failed to get settings:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save user settings
   */
  static async saveSettings(newSettings) {
    try {
      const current = await this.getSettings();
      // Enforce permanent safety rule
      const updated = {
        ...current,
        ...newSettings,
        confirmBeforeDelete: true // cannot be disabled
      };

      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
      } else {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      }
      return updated;
    } catch (err) {
      console.error('Failed to save settings:', err);
      throw err;
    }
  }

  /**
   * Get all scanned posts
   */
  static async getPosts() {
    try {
      if (this.isChromeStorageAvailable()) {
        const result = await chrome.storage.local.get([STORAGE_KEYS.POSTS]);
        return Array.isArray(result[STORAGE_KEYS.POSTS]) ? result[STORAGE_KEYS.POSTS] : [];
      } else {
        const item = localStorage.getItem(STORAGE_KEYS.POSTS);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      console.error('Failed to get posts:', err);
      return [];
    }
  }

  /**
   * Save array of scanned posts
   */
  static async savePosts(posts) {
    try {
      // Keep up to 2,000 posts locally
      const trimmed = posts.slice(0, 2000);
      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.POSTS]: trimmed });
      } else {
        localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(trimmed));
      }
      return trimmed;
    } catch (err) {
      console.error('Failed to save posts:', err);
      throw err;
    }
  }

  /**
   * Update a single post by ID
   */
  static async updatePost(postId, updates) {
    const posts = await this.getPosts();
    const idx = posts.findIndex(p => p.id === postId);
    if (idx !== -1) {
      posts[idx] = { ...posts[idx], ...updates };
      await this.savePosts(posts);
      return posts[idx];
    }
    return null;
  }

  /**
   * Remove a post by ID from local storage (e.g. after deletion)
   */
  static async deletePost(postId) {
    const posts = await this.getPosts();
    const filtered = posts.filter(p => p.id !== postId);
    await this.savePosts(filtered);
    return filtered;
  }

  /**
   * Clear all scanned posts
   */
  static async clearPosts() {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.remove([STORAGE_KEYS.POSTS]);
    } else {
      localStorage.removeItem(STORAGE_KEYS.POSTS);
    }
  }

  /**
   * Save active scan session context (group/page name, url, count)
   */
  static async saveCurrentScan(scanInfo) {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SCAN]: scanInfo });
    } else {
      localStorage.setItem(STORAGE_KEYS.CURRENT_SCAN, JSON.stringify(scanInfo));
    }
  }

  /**
   * Get active scan session context
   */
  static async getCurrentScan() {
    if (this.isChromeStorageAvailable()) {
      const res = await chrome.storage.local.get([STORAGE_KEYS.CURRENT_SCAN]);
      return res[STORAGE_KEYS.CURRENT_SCAN] || null;
    } else {
      const item = localStorage.getItem(STORAGE_KEYS.CURRENT_SCAN);
      return item ? JSON.parse(item) : null;
    }
  }

  /**
   * Wipe all stored data (posts, settings, scan info, logs)
   */
  static async clearAllData() {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.clear();
    } else {
      localStorage.clear();
    }
    // Re-initialize default settings
    return await this.saveSettings(DEFAULT_SETTINGS);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageManager, DEFAULT_SETTINGS };
} else {
  window.StorageManager = StorageManager;
  window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
}
