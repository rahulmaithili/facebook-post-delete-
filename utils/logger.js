/**
 * FB AI Post Manager - Structured Activity Logger
 */
class FBLogger {
  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
    this.logs = [];
    this.listeners = new Set();
    this.storageKey = 'fb_ai_logs';
    this.init();
  }

  async init() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const result = await chrome.storage.local.get([this.storageKey]);
        if (result && Array.isArray(result[this.storageKey])) {
          this.logs = result[this.storageKey];
        }
      } catch (err) {
        console.warn('Logger init error:', err);
      }
    }
  }

  formatTime(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  log(level, category, message, details = null) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      displayTime: this.formatTime(),
      level: level.toUpperCase(), // INFO, SUCCESS, WARN, ERROR
      category: category.toUpperCase(), // SCAN, AI, ACTION, SAFETY, SYSTEM, FILTER
      message,
      details
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.pop();
    }

    const color = level === 'ERROR' ? '#ef4444' :
                  level === 'WARN'  ? '#f59e0b' :
                  level === 'SUCCESS' ? '#10b981' : '#3b82f6';
    console.log(`%c[${entry.displayTime}][${entry.category}] ${message}`, `color:${color}; font-weight:bold;`, details || '');

    this.notify(entry);
    this.saveToStorage();
    return entry;
  }

  info(category, message, details) { return this.log('INFO', category, message, details); }
  success(category, message, details) { return this.log('SUCCESS', category, message, details); }
  warn(category, message, details) { return this.log('WARN', category, message, details); }
  error(category, message, details) { return this.log('ERROR', category, message, details); }

  static info(category, message, details) { return (FBLogger.instance || window.fbLoggerInstance || this).log ? (FBLogger.instance || window.fbLoggerInstance).log('INFO', category, message, details) : null; }
  static success(category, message, details) { return (FBLogger.instance || window.fbLoggerInstance || this).log ? (FBLogger.instance || window.fbLoggerInstance).log('SUCCESS', category, message, details) : null; }
  static warn(category, message, details) { return (FBLogger.instance || window.fbLoggerInstance || this).log ? (FBLogger.instance || window.fbLoggerInstance).log('WARN', category, message, details) : null; }
  static error(category, message, details) { return (FBLogger.instance || window.fbLoggerInstance || this).log ? (FBLogger.instance || window.fbLoggerInstance).log('ERROR', category, message, details) : null; }
  static clear() { if (FBLogger.instance) FBLogger.instance.clear(); }
  static exportAsText() { return FBLogger.instance ? FBLogger.instance.exportAsText() : ''; }
  static getLogs() { return FBLogger.instance ? FBLogger.instance.logs : []; }
  static addListener(cb) { return FBLogger.instance ? FBLogger.instance.addListener(cb) : () => {}; }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(entry) {
    this.listeners.forEach((fn) => {
      try { fn(entry); } catch (e) { console.error('Log listener error:', e); }
    });
  }

  async saveToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set({ [this.storageKey]: this.logs.slice(0, 200) });
      } catch (err) {}
    }
  }

  getLogs() {
    return [...this.logs];
  }

  async clear() {
    this.logs = [];
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.remove([this.storageKey]);
    }
    this.notify({ type: 'CLEAR' });
  }

  exportAsText() {
    return this.logs
      .slice()
      .reverse()
      .map(l => `[${l.displayTime}] [${l.level}] [${l.category}] ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`)
      .join('\n');
  }
}

var defaultLoggerInstance = new FBLogger();
FBLogger.instance = defaultLoggerInstance;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FBLogger;
} else {
  window.FBLogger = FBLogger;
  window.fbLoggerInstance = defaultLoggerInstance;
}
