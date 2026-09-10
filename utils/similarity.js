/**
 * FB AI Post Manager - Text & Metadata Similarity Engine
 * Fast local duplicate detection before AI processing
 */
class SimilarityEngine {
  /**
   * Normalize text by removing URLs, mentions, emojis, punctuation and lowering case
   */
  static normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .replace(/https?:\/\/[^\s]+/gi, '') // remove links
      .replace(/@[a-zA-Z0-9_.-]+/g, '')    // remove mentions
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '') // remove emojis
      .replace(/[^a-z0-9\s]/g, ' ')       // keep only alphanumeric
      .replace(/\s+/g, ' ')               // collapse spaces
      .trim();
  }

  /**
   * Generate word tokens or n-grams from text
   */
  static getTokens(text, n = 1) {
    const words = this.normalizeText(text).split(' ').filter(w => w.length > 2);
    if (words.length === 0) return new Set();
    if (n === 1) return new Set(words);

    const ngrams = new Set();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  /**
   * Compute Jaccard Similarity between two sets (0.0 to 1.0)
   */
  static jaccard(setA, setB) {
    if (!setA.size && !setB.size) return 1.0;
    if (!setA.size || !setB.size) return 0.0;

    let intersectionSize = 0;
    const smaller = setA.size < setB.size ? setA : setB;
    const larger = setA.size < setB.size ? setB : setA;

    smaller.forEach(val => {
      if (larger.has(val)) intersectionSize++;
    });

    const unionSize = setA.size + setB.size - intersectionSize;
    return unionSize === 0 ? 0 : intersectionSize / unionSize;
  }

  /**
   * Compute Dice Coefficient between two strings
   */
  static dice(strA, strB) {
    const s1 = this.normalizeText(strA);
    const s2 = this.normalizeText(strB);
    if (!s1 && !s2) return 1.0;
    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    const set1 = this.getTokens(s1, 2);
    const set2 = this.getTokens(s2, 2);
    if (!set1.size && !set2.size) {
      return s1 === s2 ? 1.0 : 0.0;
    }

    let matches = 0;
    set1.forEach(token => {
      if (set2.has(token)) matches++;
    });

    return (2 * matches) / (set1.size + set2.size);
  }

  /**
   * Compare two posts for overall similarity (text + media + author)
   */
  static comparePosts(postA, postB) {
    const textA = postA.text || '';
    const textB = postB.text || '';

    // Exact text match check
    const normA = this.normalizeText(textA);
    const normB = this.normalizeText(textB);
    if (normA.length > 20 && normA === normB) {
      return { similarity: 1.0, reason: 'Exact text match' };
    }

    // High n-gram token overlap
    const tokensA = this.getTokens(textA, 1);
    const tokensB = this.getTokens(textB, 1);
    const jaccardScore = this.jaccard(tokensA, tokensB);

    // Bigram Dice score
    const diceScore = this.dice(textA, textB);

    // Image URL check if both have media
    let mediaBonus = 0;
    if (postA.imageUrl && postB.imageUrl && postA.imageUrl === postB.imageUrl) {
      mediaBonus = 0.35;
    }

    const blendedScore = Math.min(1.0, (jaccardScore * 0.5) + (diceScore * 0.5) + mediaBonus);
    return {
      similarity: blendedScore,
      jaccard: jaccardScore,
      dice: diceScore
    };
  }

  /**
   * Cluster posts into duplicate groups
   * Returns copy of posts with duplicate metadata attached
   */
  static clusterDuplicates(posts, threshold = 0.78) {
    const postCount = posts.length;
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < postCount; i++) {
      if (assigned.has(posts[i].id)) continue;

      const currentGroup = [posts[i]];
      assigned.add(posts[i].id);

      for (let j = i + 1; j < postCount; j++) {
        if (assigned.has(posts[j].id)) continue;

        const cmp = this.comparePosts(posts[i], posts[j]);
        if (cmp.similarity >= threshold) {
          currentGroup.push(posts[j]);
          assigned.add(posts[j].id);
        }
      }

      if (currentGroup.length > 1) {
        clusters.push(currentGroup);
      }
    }

    // Process clusters and annotate posts
    const postMap = new Map(posts.map(p => [p.id, { ...p }]));

    clusters.forEach((group, index) => {
      const groupId = 'dup_group_' + (index + 1);

      // Pick canonical post: highest total engagement, then newest
      group.sort((a, b) => {
        const engA = (a.reactions || 0) + (a.comments || 0) * 2 + (a.shares || 0) * 3;
        const engB = (b.reactions || 0) + (b.comments || 0) * 2 + (b.shares || 0) * 3;
        if (engB !== engA) return engB - engA;
        return new Date(b.date || 0) - new Date(a.date || 0);
      });

      const canonical = group[0];

      group.forEach((post, order) => {
        const p = postMap.get(post.id);
        if (!p) return;

        p.duplicateGroupId = groupId;
        p.duplicateClusterSize = group.length;

        if (order === 0) {
          // Canonical post: Keep recommended
          p.isCanonical = true;
          p.isDuplicate = false;
          p.duplicateScore = Math.max(0, (group.length - 1) * 15);
          p.duplicateHint = 'Original/Highest-Engagement post in cluster #' + (index + 1) + ' (' + group.length + ' duplicates detected)';
        } else {
          // Duplicate post
          p.isCanonical = false;
          p.isDuplicate = true;
          p.duplicateOfId = canonical.id;
          p.duplicateScore = Math.min(98, 75 + (order * 5));
          p.duplicateHint = 'Duplicate of post by ' + (canonical.author || 'User') + ' (Group #' + (index + 1) + ')';
        }
      });
    });

    return Array.from(postMap.values());
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimilarityEngine;
} else {
  window.SimilarityEngine = SimilarityEngine;
}
