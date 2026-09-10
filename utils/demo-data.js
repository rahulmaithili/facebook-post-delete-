/**
 * FB AI Post Manager - Realistic Demo Data (100 Posts)
 * Provides comprehensive simulation for Facebook Groups and Pages.
 * Includes: High quality, community discussions, spam, affiliate links,
 * duplicates, outdated events, video, images, reels, and link posts.
 */

const DEMO_AUTHORS = [
  'Alex Rivera', 'Sarah Jenkins', 'CryptoMaster99', 'TechHub Official',
  'Elena Rostova', 'Digital Marketer Pro', 'David Chen', 'Marcus Vance',
  'Lisa Wong', 'FastIncome Bot', 'Dev Community', 'Rachel Green',
  'AffiliateKing', 'Community Moderator', 'James Wilson', 'Growth Hacker'
];

function generate100DemoPosts() {
  const posts = [];
  const now = Date.now();
  const dayMs = 86400000;

  // Base patterns for generating realistic varied posts
  const postTemplates = [
    // 1-15: High Quality Posts (KEEP)
    {
      type: 'TEXT',
      author: 'David Chen',
      text: 'Comprehensive guide to optimizing React 19 server components for high-traffic web applications. Here are 5 key patterns we implemented to reduce bundle size by 42% and improve First Contentful Paint.',
      reactions: 342, comments: 58, shares: 29,
      dateOffset: 2,
      qualityScore: 92, engagementScore: 88, spamScore: 5, duplicateScore: 4, overallScore: 90,
      recommendation: 'KEEP', reason: 'High-value educational technical guide with strong organic engagement.', confidence: 0.96
    },
    {
      type: 'IMAGE',
      author: 'TechHub Official',
      imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60',
      text: 'Infographic: Complete roadmap for Cloud Architecture in 2026. Bookmark this for your certifications and system design interviews! What cloud provider is your primary stack?',
      reactions: 615, comments: 104, shares: 87,
      dateOffset: 5,
      qualityScore: 95, engagementScore: 94, spamScore: 4, duplicateScore: 2, overallScore: 94,
      recommendation: 'KEEP', reason: 'High visual quality infographic and strong community discussion.', confidence: 0.98
    },
    {
      type: 'VIDEO',
      author: 'Elena Rostova',
      imageUrl: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=500&auto=format&fit=crop&q=60',
      text: '10-minute masterclass: How to set up CI/CD pipelines with GitHub Actions and automated security scanning. Watch until the end for the reusable YAML workflow!',
      reactions: 420, comments: 64, shares: 38,
      dateOffset: 8,
      qualityScore: 89, engagementScore: 82, spamScore: 8, duplicateScore: 5, overallScore: 87,
      recommendation: 'KEEP', reason: 'Substantive video tutorial with actionable community value.', confidence: 0.94
    },
    {
      type: 'REEL',
      author: 'Sarah Jenkins',
      imageUrl: 'https://images.unsplash.com/photo-1534972195531-a756b1126f24?w=500&auto=format&fit=crop&q=60',
      text: '3 keyboard shortcuts in VS Code that will save you 2 hours every week! #coding #developer #productivity',
      reactions: 780, comments: 89, shares: 112,
      dateOffset: 3,
      qualityScore: 85, engagementScore: 92, spamScore: 12, duplicateScore: 10, overallScore: 86,
      recommendation: 'KEEP', reason: 'High engagement micro-learning reel.', confidence: 0.91
    },
    {
      type: 'LINK',
      author: 'Community Moderator',
      url: 'https://github.com/trending',
      text: 'Monthly roundup: Top open source developer tools trending this month. We featured projects built by members of this group!',
      reactions: 230, comments: 41, shares: 19,
      dateOffset: 12,
      qualityScore: 90, engagementScore: 78, spamScore: 6, duplicateScore: 3, overallScore: 86,
      recommendation: 'KEEP', reason: 'Community spotlight post fostering active member engagement.', confidence: 0.93
    },

    // 16-35: Spam & Affiliate Links (DELETE)
    {
      type: 'LINK',
      author: 'CryptoMaster99',
      text: 'URGENT: Guaranteed 300% ROI in 48 hours! Join the VIP Telegram group before links are deleted! Click here: http://bit.ly/crypto-moon-pump-999 #crypto #passiveincome #free',
      reactions: 2, comments: 1, shares: 0,
      dateOffset: 1,
      qualityScore: 12, engagementScore: 6, spamScore: 96, duplicateScore: 40, overallScore: 10,
      recommendation: 'DELETE', reason: 'High-risk financial scam / aggressive promotional spam.', confidence: 0.98
    },
    {
      type: 'TEXT',
      author: 'FastIncome Bot',
      text: 'Work from home! Earn $500 to $1200 daily typing captchas and testing apps. No experience needed! WhatsApp me directly at +1-800-FAKE-JOB to start today.',
      reactions: 1, comments: 0, shares: 0,
      dateOffset: 4,
      qualityScore: 8, engagementScore: 4, spamScore: 98, duplicateScore: 82, overallScore: 7,
      recommendation: 'DELETE', reason: 'Classic phishing / job fraud spam with zero community value.', confidence: 0.99
    },
    {
      type: 'IMAGE',
      author: 'AffiliateKing',
      imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=500&auto=format&fit=crop&q=60',
      text: 'CONGRATULATIONS! You have been chosen for a free $1000 Walmart Gift Card! Claim in the next 15 minutes before quota expires: http://free-cards-scam.biz',
      reactions: 3, comments: 2, shares: 0,
      dateOffset: 7,
      qualityScore: 10, engagementScore: 8, spamScore: 95, duplicateScore: 65, overallScore: 9,
      recommendation: 'DELETE', reason: 'Phishing gift-card scam violating group and platform policies.', confidence: 0.99
    },
    {
      type: 'TEXT',
      author: 'Growth Hacker',
      text: 'DM me "LEADS" to steal my secret automated cold outreach method that booked 50 enterprise clients in 7 days! Only taking 3 people. Act fast!',
      reactions: 5, comments: 4, shares: 0,
      dateOffset: 6,
      qualityScore: 22, engagementScore: 15, spamScore: 88, duplicateScore: 45, overallScore: 19,
      recommendation: 'DELETE', reason: 'Unsolicited DM farming and deceptive low-value promotion.', confidence: 0.92
    },

    // 36-50: Repetitive Duplicate Spam Cluster (DELETE / REVIEW)
    {
      type: 'TEXT',
      author: 'SpamBot_A',
      text: 'Special Discount 80% OFF on premium streaming accounts, VPNs and design software! Instant delivery with lifetime warranty. Order here: t.me/cheap_accounts_hub',
      reactions: 0, comments: 0, shares: 0,
      dateOffset: 10,
      qualityScore: 15, engagementScore: 2, spamScore: 94, duplicateScore: 90, overallScore: 12,
      recommendation: 'DELETE', reason: 'Repetitive unauthorized account resale bot spam.', confidence: 0.97
    },

    // 51-70: Ambiguous / Low Engagement (REVIEW)
    {
      type: 'TEXT',
      author: 'Alex Rivera',
      text: 'Has anyone tried the new cursor IDE update? Wondering if the indexing is faster on large monorepos compared to previous releases.',
      reactions: 14, comments: 8, shares: 0,
      dateOffset: 14,
      qualityScore: 62, engagementScore: 42, spamScore: 12, duplicateScore: 10, overallScore: 58,
      recommendation: 'REVIEW', reason: 'Brief community query with modest engagement. May warrant keeping if relevant to current discussions.', confidence: 0.76
    },
    {
      type: 'LINK',
      author: 'Marcus Vance',
      url: 'https://news.ycombinator.com',
      text: 'Interesting discussion today on software architecture and microservices complexity.',
      reactions: 9, comments: 3, shares: 1,
      dateOffset: 20,
      qualityScore: 55, engagementScore: 30, spamScore: 15, duplicateScore: 8, overallScore: 50,
      recommendation: 'REVIEW', reason: 'Short external link without original commentary or deep community participation.', confidence: 0.74
    },
    {
      type: 'IMAGE',
      author: 'Lisa Wong',
      imageUrl: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=500&auto=format&fit=crop&q=60',
      text: 'Working from the cafe today! What does everyone’s workspace look like this Friday?',
      reactions: 28, comments: 14, shares: 0,
      dateOffset: 25,
      qualityScore: 58, engagementScore: 48, spamScore: 10, duplicateScore: 15, overallScore: 55,
      recommendation: 'REVIEW', reason: 'Casual social post. Low informational value but friendly community building.', confidence: 0.70
    },

    // 71-85: Outdated Posts (REVIEW / DELETE)
    {
      type: 'TEXT',
      author: 'TechHub Official',
      text: 'Reminder: Register for our live webinar on "Preparing for Web3 in 2023"! Event starts tomorrow at 6 PM EST. Zoom link provided upon registration.',
      reactions: 15, comments: 2, shares: 1,
      dateOffset: 740, // ~2 years ago
      qualityScore: 40, engagementScore: 20, spamScore: 18, duplicateScore: 20, overallScore: 32,
      recommendation: 'DELETE', reason: 'Outdated past event announcement from 2 years ago with expired links.', confidence: 0.93
    },
    {
      type: 'LINK',
      author: 'Dev Community',
      url: 'https://example.com/expired-hackathon-2023',
      text: 'Submissions are now open for Hackathon Fall 2023! Submit your project by October 15th to win prizes.',
      reactions: 32, comments: 4, shares: 2,
      dateOffset: 850,
      qualityScore: 42, engagementScore: 25, spamScore: 14, duplicateScore: 15, overallScore: 35,
      recommendation: 'DELETE', reason: 'Outdated historical event with expired submission links.', confidence: 0.94
    },

    // 86-100: Low-value one-word/emoji posts
    {
      type: 'TEXT',
      author: 'James Wilson',
      text: 'hi',
      reactions: 0, comments: 0, shares: 0,
      dateOffset: 18,
      qualityScore: 10, engagementScore: 1, spamScore: 60, duplicateScore: 25, overallScore: 12,
      recommendation: 'DELETE', reason: 'Low-effort greeting post with zero substance or context.', confidence: 0.95
    },
    {
      type: 'TEXT',
      author: 'Rachel Green',
      text: '👍👍👍',
      reactions: 1, comments: 0, shares: 0,
      dateOffset: 22,
      qualityScore: 5, engagementScore: 2, spamScore: 70, duplicateScore: 30, overallScore: 8,
      recommendation: 'DELETE', reason: 'Pure emoji post cluttering community timeline.', confidence: 0.97
    }
  ];

  // Populate 100 realistic posts
  for (let i = 1; i <= 100; i++) {
    const templateIndex = (i - 1) % postTemplates.length;
    const tpl = postTemplates[templateIndex];

    const postId = '1000' + (89234500000 + i);
    const postUrl = `https://www.facebook.com/groups/devcommunity/posts/${postId}/`;

    // Add some duplicate variations intentionally for duplicate testing
    let text = tpl.text;
    let author = tpl.author;
    let isDuplicateCandidate = false;

    if (i >= 36 && i <= 42) {
      // Cluster 1: Discount accounts bot spam
      text = 'Special Discount 80% OFF on premium streaming accounts, VPNs and design software! Instant delivery with lifetime warranty. Order here: t.me/cheap_accounts_hub #' + (i % 2);
      author = 'SpamBot_' + (i % 3);
      isDuplicateCandidate = true;
    } else if (i >= 60 && i <= 63) {
      // Cluster 2: Duplicate Hackathon Notice
      text = 'Submissions are now open for Hackathon Fall 2023! Submit your project by October 15th to win prizes.';
      isDuplicateCandidate = true;
    }

    const postDate = new Date(now - (tpl.dateOffset * dayMs) - (i * 3600000)).toISOString();

    posts.push({
      id: postId,
      url: postUrl,
      type: tpl.type,
      author: author,
      date: postDate,
      text: text,
      imageUrl: tpl.imageUrl || null,
      reactions: tpl.reactions + (i % 7),
      comments: tpl.comments + (i % 3),
      shares: tpl.shares + (i % 2),
      // AI attributes
      qualityScore: tpl.qualityScore,
      engagementScore: tpl.engagementScore,
      spamScore: tpl.spamScore,
      duplicateScore: isDuplicateCandidate ? Math.max(tpl.duplicateScore, 85) : tpl.duplicateScore,
      overallScore: tpl.overallScore,
      recommendation: tpl.recommendation,
      reason: tpl.reason,
      confidence: tpl.confidence,
      // Status
      status: 'SCANNED',
      isSelected: false,
      isDemo: true
    });
  }

  return posts;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generate100DemoPosts };
} else {
  window.DemoData = { generate100DemoPosts };
}
