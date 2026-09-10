/**
 * FB AI Post Manager - General Utilities & Helpers
 */
const Helpers = {
  /**
   * Escape HTML entities to prevent XSS
   */
  escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Format large numbers into human-readable compact strings (e.g. 1.2K, 3.4M)
   */
  formatCount(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    const n = Number(num);
    if (n < 1000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(n % 1000 < 100 ? 0 : 1) + 'K';
    return (n / 1000000).toFixed(1) + 'M';
  },

  /**
   * Format timestamp or date string into readable date and relative time
   */
  formatDate(dateInput) {
    if (!dateInput) return { formatted: 'Unknown Date', relative: '', iso: '' };
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return { formatted: String(dateInput), relative: '', iso: '' };

      const now = new Date();
      const diffSec = Math.floor((now - date) / 1000);

      let relative = '';
      if (diffSec < 60) relative = 'just now';
      else if (diffSec < 3600) relative = Math.floor(diffSec / 60) + 'm ago';
      else if (diffSec < 86400) relative = Math.floor(diffSec / 3600) + 'h ago';
      else if (diffSec < 2592000) relative = Math.floor(diffSec / 86400) + 'd ago';
      else relative = date.toLocaleDateString();

      return {
        formatted: date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        relative,
        iso: date.toISOString()
      };
    } catch {
      return { formatted: String(dateInput), relative: '', iso: '' };
    }
  },

  /**
   * Truncate text with ellipsis
   */
  truncate(text, maxLen = 140) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen).trim() + '...';
  },

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Strip tracking and referral query parameters from Facebook URLs
   */
  stripFacebookTrackingParams(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, 'https://www.facebook.com');
      const paramsToRemove = ['__cft__[0]', '__tn__', 'ref', 'notif_id', 'notif_t', 'fbclid', 'mibextid'];
      paramsToRemove.forEach(p => url.searchParams.delete(p));
      return url.toString();
    } catch {
      return rawUrl;
    }
  },

  /**
   * Export array of post objects to RFC 4180 compliant CSV
   */
  exportToCsv(filename, posts) {
    if (!posts || !posts.length) return;

    const headers = [
      'Post ID',
      'Post URL',
      'Post Type',
      'Author',
      'Date',
      'Reactions',
      'Comments',
      'Shares',
      'Text Snippet',
      'Quality Score',
      'Engagement Score',
      'Spam Score',
      'Duplicate Score',
      'Overall Score',
      'AI Recommendation',
      'AI Confidence',
      'AI Reason',
      'Is Duplicate',
      'Status'
    ];

    const escapeCsvField = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return '"' + str + '"';
    };

    const rows = posts.map(p => [
      escapeCsvField(p.id),
      escapeCsvField(p.url),
      escapeCsvField(p.type),
      escapeCsvField(p.author),
      escapeCsvField(p.date),
      escapeCsvField(p.reactions || 0),
      escapeCsvField(p.comments || 0),
      escapeCsvField(p.shares || 0),
      escapeCsvField(p.text ? p.text.substring(0, 500) : ''),
      escapeCsvField(p.qualityScore ?? ''),
      escapeCsvField(p.engagementScore ?? ''),
      escapeCsvField(p.spamScore ?? ''),
      escapeCsvField(p.duplicateScore ?? ''),
      escapeCsvField(p.overallScore ?? ''),
      escapeCsvField(p.recommendation || 'PENDING'),
      escapeCsvField(p.confidence ? Math.round(p.confidence * 100) + '%' : ''),
      escapeCsvField(p.reason || ''),
      escapeCsvField(p.isDuplicate ? 'YES' : 'NO'),
      escapeCsvField(p.status || 'SCANNED')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    this.downloadBlob(filename, 'text/csv;charset=utf-8;', csvContent);
  },

  /**
   * Export scan data as JSON file
   */
  exportToJson(filename, data) {
    const jsonStr = JSON.stringify(data, null, 2);
    this.downloadBlob(filename, 'application/json;charset=utf-8;', jsonStr);
  },

  /**
   * Helper to trigger client-side file download
   */
  downloadBlob(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  /**
   * Poll for a DOM element with timeout
   */
  async waitForSelector(selector, root = document, timeoutMs = 5000, pollInterval = 250) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const el = root.querySelector(selector);
      if (el) return el;
      await this.sleep(pollInterval);
    }
    return null;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Helpers;
} else {
  window.Helpers = Helpers;
}
