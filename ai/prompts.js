/**
 * FB AI Post Manager - System Prompts and Analysis Templates
 */

const SYSTEM_INSTRUCTION = `You are a professional Facebook content quality and moderation assistant.
Analyze the supplied Facebook posts objectively and recommend KEEP, REVIEW, or DELETE based strictly on content quality, community value, authenticity, spam/scam indicators, and engagement context.
Do NOT make decisions based on personal identity, protected characteristics, political opinions, or irrelevant personal information.
You must return ONLY a valid JSON object matching the defined schema without extra commentary or markdown code blocks.`;

/**
 * Builds the batch analysis prompt for Gemini
 */
function buildAnalysisPrompt(postsBatch) {
  const formattedPosts = postsBatch.map((p, idx) => ({
    post_index: idx,
    id: p.id,
    type: p.type || 'TEXT',
    author: p.author || 'Unknown',
    date: p.date || 'Unknown',
    reactions: p.reactions || 0,
    comments: p.comments || 0,
    shares: p.shares || 0,
    text: p.text ? p.text.substring(0, 800) : '',
    has_image: Boolean(p.imageUrl),
    image_url: p.imageUrl || null,
    is_duplicate_candidate: Boolean(p.isDuplicate),
    duplicate_hint: p.duplicateHint || null
  }));

  return `
Analyze the following batch of ${postsBatch.length} Facebook posts.

For each post, assess:
1. Content Quality (0-100): Depth, clarity, substance, readability, formatting.
2. Relevance & Value (0-100): Usefulness to group/page followers, educational or conversational merit.
3. Engagement Quality (0-100): Reaction/comment volume compared to post age and intent.
4. Spam Score (0-100): High score indicates aggressive selling, affiliate links, financial scams, phishing, bot behavior, unsolicited DM requests.
5. Duplicate Score (0-100): High score indicates boilerplate, repetitive cross-posting, or identical copy.
6. Overall Score (0-100): Weighted composite of quality, relevance, and community health.
7. Recommendation:
   - "KEEP": Substantive, genuine, high community value, or active authentic discussions.
   - "REVIEW": Borderline, ambiguous context, low-engagement authentic posts, or mild promotional content.
   - "DELETE": Blatant spam, scams, phishing, malware links, repetitive bot duplicates, or outdated expired announcements.
8. Reason: Concise explanation (1-2 sentences).
9. Confidence (0.0 to 1.0): Model certainty in the recommendation.

Input Posts:
${JSON.stringify(formattedPosts, null, 2)}

Respond with a JSON object containing a "results" array of objects with the exact schema:
{
  "results": [
    {
      "post_index": 0,
      "id": "post_id_here",
      "quality_score": 75,
      "engagement_score": 60,
      "relevance_score": 80,
      "spam_score": 10,
      "duplicate_score": 5,
      "overall_score": 78,
      "recommendation": "KEEP",
      "reason": "Clear educational breakdown with positive community engagement.",
      "confidence": 0.95
    }
  ]
}
`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SYSTEM_INSTRUCTION, buildAnalysisPrompt };
} else {
  window.AIPrompts = { SYSTEM_INSTRUCTION, buildAnalysisPrompt };
}
