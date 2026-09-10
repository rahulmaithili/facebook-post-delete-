/**
 * FB AI Post Manager - AI Response Schema Validation & Sanitization
 */

class SchemaValidator {
  /**
   * Strip code fences and parse JSON safely
   */
  static parseJsonSafe(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Empty or non-string AI response received.');
    }

    let cleaned = rawText.trim();
    // Remove markdown code fences if model returned them
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      // Attempt substring extraction between first { and last }
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      }
      throw new Error(`Failed to parse AI response as JSON: ${err.message}`);
    }
  }

  /**
   * Clamp number to min-max bounds
   */
  static clamp(val, min = 0, max = 100, defaultVal = 50) {
    if (val === null || val === undefined || isNaN(val)) return defaultVal;
    const n = Number(val);
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /**
   * Sanitize single AI result object
   */
  static validateSingleResult(res, fallbackId = '') {
    const validRecommendations = ['KEEP', 'REVIEW', 'DELETE'];
    let rec = String(res.recommendation || 'REVIEW').trim().toUpperCase();
    if (!validRecommendations.includes(rec)) {
      rec = 'REVIEW';
    }

    const conf = res.confidence !== undefined && !isNaN(res.confidence)
      ? Math.max(0.0, Math.min(1.0, Number(res.confidence)))
      : 0.80;

    let reason = String(res.reason || 'AI evaluation complete.').trim();
    if (reason.length > 280) reason = reason.substring(0, 277) + '...';

    return {
      id: String(res.id || fallbackId),
      qualityScore: this.clamp(res.quality_score, 0, 100, 50),
      engagementScore: this.clamp(res.engagement_score, 0, 100, 50),
      relevanceScore: this.clamp(res.relevance_score, 0, 100, 50),
      spamScore: this.clamp(res.spam_score, 0, 100, 10),
      duplicateScore: this.clamp(res.duplicate_score, 0, 100, 10),
      overallScore: this.clamp(res.overall_score, 0, 100, 50),
      recommendation: rec,
      reason: reason,
      confidence: conf
    };
  }

  /**
   * Validate full batch response against input posts
   */
  static validateBatchResults(rawResponse, inputPosts = []) {
    const parsed = this.parseJsonSafe(rawResponse);
    const results = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.results) ? parsed.results : []);

    const resultMap = new Map();
    results.forEach((item, idx) => {
      const targetPost = inputPosts[idx] || (item.id ? inputPosts.find(p => p.id === item.id) : null);
      const postId = targetPost ? targetPost.id : (item.id || `idx_${idx}`);
      resultMap.set(postId, this.validateSingleResult(item, postId));
    });

    // Ensure every input post gets a result even if model dropped one
    return inputPosts.map((p, idx) => {
      if (resultMap.has(p.id)) {
        return resultMap.get(p.id);
      }
      // Fallback
      return {
        id: p.id,
        qualityScore: 50,
        engagementScore: 50,
        relevanceScore: 50,
        spamScore: p.isDuplicate ? 80 : 20,
        duplicateScore: p.duplicateScore || 0,
        overallScore: 50,
        recommendation: p.isDuplicate ? 'DELETE' : 'REVIEW',
        reason: p.isDuplicate ? 'Local duplicate match flagged for deletion.' : 'Insufficient AI response data; marked for review.',
        confidence: 0.60
      };
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchemaValidator;
} else {
  window.SchemaValidator = SchemaValidator;
}
