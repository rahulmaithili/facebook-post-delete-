/**
 * FB AI Post Manager - AI Content Analyzer (Gemini API & Backend Proxy)
 */

class AIAnalyzer {
  constructor(settings = {}) {
    this.provider = settings.aiProvider || 'gemini';
    this.apiKey = settings.apiKey || '';
    this.backendUrl = settings.backendUrl || '';
    this.model = settings.aiModel || 'gemini-3.6-flash';
    this.batchSize = 6;
    this.isAborted = false;
  }

  abort() {
    this.isAborted = true;
  }

  /**
   * Main analysis entry point
   */
  async analyzePosts(posts, onProgress = null) {
    this.isAborted = false;
    const total = posts.length;
    const analyzedPosts = [];

    // Filter out posts that already have valid AI analysis to save quota, unless forced
    const postsToAnalyze = posts.filter(p => !p.qualityScore || p.recommendation === 'PENDING');

    if (postsToAnalyze.length === 0) {
      if (onProgress) onProgress(total, total, 'All posts already analyzed.');
      return posts;
    }

    const batchCount = Math.ceil(postsToAnalyze.length / this.batchSize);

    for (let i = 0; i < batchCount; i++) {
      if (this.isAborted) {
        if (typeof FBLogger !== 'undefined') FBLogger.warn('AI', 'AI analysis stopped by user.');
        break;
      }

      const startIdx = i * this.batchSize;
      const currentBatch = postsToAnalyze.slice(startIdx, startIdx + this.batchSize);

      if (onProgress) {
        onProgress(analyzedPosts.length, total, `Analyzing batch ${i + 1} of ${batchCount}...`);
      }

      try {
        const batchResults = await this.analyzeBatchWithRetry(currentBatch);
        
        // Merge results with batch posts
        currentBatch.forEach((post, bIdx) => {
          const res = batchResults[bIdx] || {};
          const merged = {
            ...post,
            qualityScore: res.qualityScore,
            engagementScore: res.engagementScore,
            relevanceScore: res.relevanceScore,
            spamScore: res.spamScore,
            duplicateScore: res.duplicateScore,
            overallScore: res.overallScore,
            recommendation: res.recommendation,
            reason: res.reason,
            confidence: res.confidence,
            status: 'ANALYZED'
          };
          analyzedPosts.push(merged);
        });

        if (typeof FBLogger !== 'undefined') {
          FBLogger.info('AI', `Batch ${i + 1}/${batchCount} analyzed (${currentBatch.length} posts).`);
        }
      } catch (err) {
        if (typeof FBLogger !== 'undefined') {
          FBLogger.error('AI', `Error analyzing batch ${i + 1}: ${err.message}`);
        }
        // Fallback for failed batch
        currentBatch.forEach(post => {
          analyzedPosts.push({
            ...post,
            qualityScore: 50,
            engagementScore: 50,
            spamScore: 30,
            duplicateScore: 10,
            overallScore: 50,
            recommendation: 'REVIEW',
            reason: `AI analysis failed: ${err.message}. Marked for manual review.`,
            confidence: 0.50,
            status: 'ANALYSIS_FAILED'
          });
        });
      }

      // Small throttling pause between API batches
      if (i < batchCount - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    // Merge analyzed back into original post array
    const analyzedMap = new Map(analyzedPosts.map(p => [p.id, p]));
    const finalPosts = posts.map(p => analyzedMap.get(p.id) || p);

    if (onProgress) {
      onProgress(finalPosts.length, total, 'Analysis completed.');
    }

    return finalPosts;
  }

  /**
   * Execute batch with exponential backoff
   */
  async analyzeBatchWithRetry(batch, maxRetries = 3) {
    // If Demo Mode or No API Key provided, use high-fidelity simulation
    if (!this.apiKey && !this.backendUrl) {
      await new Promise(r => setTimeout(r, 800)); // realistic thinking delay
      return this.simulateAnalysis(batch);
    }

    let attempt = 0;
    let delay = 1500;

    while (attempt < maxRetries) {
      try {
        if (this.provider === 'custom' && this.backendUrl) {
          return await this.callCustomBackend(batch);
        } else {
          return await this.callGeminiApi(batch);
        }
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) throw err;

        if (typeof FBLogger !== 'undefined') {
          FBLogger.warn('AI', `Attempt ${attempt} failed (${err.message}). Retrying in ${delay}ms...`);
        }
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // exponential backoff
      }
    }
  }

  /**
   * Direct Gemini API Call
   */
  async callGeminiApi(batch) {
    const prompt = (typeof AIPrompts !== 'undefined')
      ? AIPrompts.buildAnalysisPrompt(batch)
      : `Analyze these posts: ${JSON.stringify(batch)}`;

    const systemInstruction = (typeof AIPrompts !== 'undefined')
      ? AIPrompts.SYSTEM_INSTRUCTION
      : 'You are a Facebook content quality and moderation assistant.';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = errText;
      try {
        const jsonErr = JSON.parse(errText);
        parsedErr = jsonErr.error ? jsonErr.error.message : errText;
      } catch {}
      throw new Error(`Gemini API error (${response.status}): ${parsedErr}`);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('No candidate content returned by Gemini.');
    }

    return (typeof SchemaValidator !== 'undefined')
      ? SchemaValidator.validateBatchResults(candidateText, batch)
      : JSON.parse(candidateText);
  }

  /**
   * Custom Proxy / Backend Call
   */
  async callCustomBackend(batch) {
    const response = await fetch(this.backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        posts: batch
      })
    });

    if (!response.ok) {
      throw new Error(`Custom backend returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return (typeof SchemaValidator !== 'undefined')
      ? SchemaValidator.validateBatchResults(data, batch)
      : data;
  }

  /**
   * High-fidelity simulated analysis for offline/demo operation
   */
  simulateAnalysis(batch) {
    return batch.map(p => {
      // If post already has pre-computed demo values, use them
      if (p.qualityScore && p.recommendation) {
        return {
          id: p.id,
          qualityScore: p.qualityScore,
          engagementScore: p.engagementScore,
          relevanceScore: Math.max(30, p.qualityScore - 5),
          spamScore: p.spamScore,
          duplicateScore: p.duplicateScore,
          overallScore: p.overallScore,
          recommendation: p.recommendation,
          reason: p.reason,
          confidence: p.confidence
        };
      }

      // Dynamic heuristic simulation
      const text = (p.text || '').toLowerCase();
      const isSpam = text.includes('whatsapp') || text.includes('roi') || text.includes('gift card') || text.includes('crypto') || text.includes('telegram') || text.includes('earn $');
      const isOutdated = text.includes('2022') || text.includes('2023') || text.includes('webinar');
      const isDuplicate = Boolean(p.isDuplicate);

      let rec = 'KEEP';
      let reason = 'Constructive community content with organic interaction.';
      let quality = 78;
      let spam = 10;
      let dup = isDuplicate ? 88 : 5;

      if (isSpam) {
        rec = 'DELETE';
        reason = 'Aggressive promotional spam / high-risk solicitation.';
        quality = 15;
        spam = 92;
      } else if (isDuplicate) {
        rec = 'DELETE';
        reason = 'Repetitive duplicate post matching existing group content.';
        quality = 30;
        dup = 90;
      } else if (isOutdated) {
        rec = 'DELETE';
        reason = 'Outdated historical notice with expired details.';
        quality = 35;
        spam = 20;
      } else if (p.reactions < 3 && (!p.text || p.text.length < 25)) {
        rec = 'REVIEW';
        reason = 'Low-substance brief query with low engagement.';
        quality = 48;
      }

      return {
        id: p.id,
        qualityScore: quality,
        engagementScore: Math.min(95, Math.max(5, (p.reactions || 0) * 3)),
        relevanceScore: Math.max(20, quality - 5),
        spamScore: spam,
        duplicateScore: dup,
        overallScore: Math.round((quality * 0.5) + ((100 - spam) * 0.3) + ((100 - dup) * 0.2)),
        recommendation: rec,
        reason: reason,
        confidence: 0.90
      };
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIAnalyzer;
} else {
  window.AIAnalyzer = AIAnalyzer;
}
