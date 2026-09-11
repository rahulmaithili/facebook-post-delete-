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
  CURRENT_SCAN: 'fb_ai_scan_info',
  RECENT_GROUPS: 'fb_ai_recent_groups',
  TRAINED_SELECTORS: 'fb_ai_trained_selectors'
};

const _memoryStore = new Map();

function getStorageFallback(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {}
  return _memoryStore.get(key) || null;
}

function setStorageFallback(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch (e) {}
  _memoryStore.set(key, value);
}

function removeStorageFallback(key) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch (e) {}
  _memoryStore.delete(key);
}

function clearStorageFallback() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      return;
    }
  } catch (e) {}
  _memoryStore.clear();
}

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
        const item = getStorageFallback(STORAGE_KEYS.SETTINGS);
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
        setStorageFallback(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
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
        const item = getStorageFallback(STORAGE_KEYS.POSTS);
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
        setStorageFallback(STORAGE_KEYS.POSTS, JSON.stringify(trimmed));
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
      removeStorageFallback(STORAGE_KEYS.POSTS);
    }
  }

  /**
   * Save active scan session context (group/page name, url, count)
   */
  static async saveCurrentScan(scanInfo) {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SCAN]: scanInfo });
    } else {
      setStorageFallback(STORAGE_KEYS.CURRENT_SCAN, JSON.stringify(scanInfo));
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
      const item = getStorageFallback(STORAGE_KEYS.CURRENT_SCAN);
      return item ? JSON.parse(item) : null;
    }
  }

  /**
   * Get recent groups history
   */
  static async getRecentGroups() {
    try {
      if (this.isChromeStorageAvailable()) {
        const res = await chrome.storage.local.get([STORAGE_KEYS.RECENT_GROUPS]);
        return Array.isArray(res[STORAGE_KEYS.RECENT_GROUPS]) ? res[STORAGE_KEYS.RECENT_GROUPS] : [];
      } else {
        const item = getStorageFallback(STORAGE_KEYS.RECENT_GROUPS);
        return item ? JSON.parse(item) : [];
      }
    } catch (err) {
      console.error('Failed to get recent groups:', err);
      return [];
    }
  }

  /**
   * Save a group to recent groups history (keeps up to 15 unique entries)
   */
  static async saveRecentGroup(group) {
    if (!group || (!group.id && !group.url)) return;
    try {
      const groups = await this.getRecentGroups();
      const existingIdx = groups.findIndex(g => (group.id && g.id === group.id) || (group.url && g.url === group.url));
      if (existingIdx !== -1) {
        groups[existingIdx] = { ...groups[existingIdx], ...group, lastUsed: Date.now() };
      } else {
        groups.unshift({ ...group, lastUsed: Date.now() });
      }
      // Sort by recent and keep top 15
      groups.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
      const trimmed = groups.slice(0, 15);

      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.RECENT_GROUPS]: trimmed });
      } else {
        setStorageFallback(STORAGE_KEYS.RECENT_GROUPS, JSON.stringify(trimmed));
      }
      return trimmed;
    } catch (err) {
      console.error('Failed to save recent group:', err);
    }
  }

  /**
   * Remove a group from recent groups history
   */
  static async removeRecentGroup(groupId) {
    try {
      const groups = await this.getRecentGroups();
      const filtered = groups.filter(g => g.id !== groupId && g.url !== groupId);
      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.RECENT_GROUPS]: filtered });
      } else {
        setStorageFallback(STORAGE_KEYS.RECENT_GROUPS, JSON.stringify(filtered));
      }
      return filtered;
    } catch (err) {
      console.error('Failed to remove recent group:', err);
      return [];
    }
  }

  /**
   * Get trained DOM selectors (per groupId or general fallback)
   */
  static async getTrainedSelectors(groupId = null) {
    try {
      if (this.isChromeStorageAvailable()) {
        const res = await chrome.storage.local.get([STORAGE_KEYS.TRAINED_SELECTORS]);
        const all = res[STORAGE_KEYS.TRAINED_SELECTORS] || {};
        if (groupId && all[groupId]) return all[groupId];
        return all._general || null;
      } else {
        const item = getStorageFallback(STORAGE_KEYS.TRAINED_SELECTORS);
        const all = item ? JSON.parse(item) : {};
        if (groupId && all[groupId]) return all[groupId];
        return all._general || null;
      }
    } catch (err) {
      console.error('Failed to get trained selectors:', err);
      return null;
    }
  }

  /**
   * Save trained DOM selectors for a group or general layout
   */
  static async saveTrainedSelectors(groupId = null, selectors = {}) {
    try {
      let all = {};
      if (this.isChromeStorageAvailable()) {
        const res = await chrome.storage.local.get([STORAGE_KEYS.TRAINED_SELECTORS]);
        all = res[STORAGE_KEYS.TRAINED_SELECTORS] || {};
      } else {
        const item = getStorageFallback(STORAGE_KEYS.TRAINED_SELECTORS);
        all = item ? JSON.parse(item) : {};
      }

      const payload = {
        ...selectors,
        updatedAt: Date.now()
      };

      if (groupId) {
        all[groupId] = payload;
      }
      // Also update general fallback
      all._general = payload;

      if (this.isChromeStorageAvailable()) {
        await chrome.storage.local.set({ [STORAGE_KEYS.TRAINED_SELECTORS]: all });
      } else {
        setStorageFallback(STORAGE_KEYS.TRAINED_SELECTORS, JSON.stringify(all));
      }
      return payload;
    } catch (err) {
      console.error('Failed to save trained selectors:', err);
    }
  }

  /**
   * Wipe all stored data (posts, settings, scan info, logs)
   */
  static async clearAllData() {
    if (this.isChromeStorageAvailable()) {
      await chrome.storage.local.clear();
    } else {
      clearStorageFallback();
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
