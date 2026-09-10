# FB AI Post Manager — Chrome Extension (Manifest V3)

> **A production-ready Chrome Extension for authorized Facebook Group and Page administrators to scan, analyze with Gemini AI, filter, review, and safely bulk-manage or delete posts.**

---

## 🌟 Key Features

1. **Unified Dashboard for Groups & Pages**:
   - Automatically detects whether the active URL is a **Facebook Group** (`facebook.com/groups/...`) or **Facebook Page** (`facebook.com/pages/...`).
   - Checks admin/management privileges before enabling deletion tools.

2. **Controlled, Anti-Infinite-Loop Feed Scanner**:
   - Resilient multi-tier selector cascading (semantic ARIA roles, `data-pagelet`, text matching, and fallback heuristics).
   - Human-paced scrolling with random jitter (1.8s - 2.6s) to protect feed stability.
   - User-defined scan limits (100, 250, 500, 1000, or unlimited).
   - Instant Pause, Resume, and Stop controls.

3. **Gemini AI Content Quality & Moderation Engine**:
   - Objective, structured scoring:
     - **Quality Score** (0–100)
     - **Engagement Score** (0–100)
     - **Relevance Score** (0–100)
     - **Spam Score** (0–100)
     - **Duplicate Score** (0–100)
     - **Overall Score** (0–100)
     - **Recommendation**: `KEEP`, `REVIEW`, or `DELETE`
     - **Reason & Confidence %**
   - Supports direct Gemini API (`gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`) and secure backend proxies.

4. **Local Text & Metadata Duplicate Detection**:
   - Fast local N-gram / Jaccard token similarity clustering before AI analysis.
   - Identifies canonical original posts and flags duplicate clusters to conserve AI tokens.

5. **Multi-Dimension Smart Filters & AI Auto-Select Rules**:
   - Filter by Recommendation (`ALL`, `KEEP`, `REVIEW`, `DELETE`)
   - Filter by Content Type (`ALL`, `TEXT`, `IMAGE`, `VIDEO`, `LINK`, `REEL`)
   - Interactive Quality & Engagement range sliders
   - Quick filter chips: *Duplicates*, *Low Engagement*, *Spam-like*, *Outdated*
   - Configurable Auto-Select rules (e.g. Select posts where Quality < 40 OR Spam > 75).

6. **Anti-Accident Safe Bulk Deletion Safeguards**:
   - **Zero Silent Deletion**: AI recommendations NEVER delete posts directly.
   - **Double-Confirmation Modal**: Detailed summary with exact post counts and explicit user confirmation.
   - **Pre-action DOM Verification**: Verifies element identity prior to clicking actions. If unverified, it skips safely.
   - **Automatic Security Halt**: Immediately ceases automation if Facebook displays a CAPTCHA, temporary restriction, or login prompt.

7. **Built-in Offline Demo Sandbox**:
   - 100 realistic mock Facebook posts with diverse content: community guides, affiliate spam, phishing giveaways, crypto scams, duplicate bots, outdated events, and media posts.
   - Allows full verification of scanning, AI analysis, filtering, and simulated safe deletion without needing Facebook or an API key.

8. **Export & Activity Logging**:
   - Export full reports in **RFC 4180 CSV** or **structured JSON**.
   - Real-time Activity Log drawer with timestamped entries and text export.

---

## 📁 Project Architecture

```
Facebook Extinson/
├── manifest.json              # Chrome Manifest V3 configuration
├── background/
│   └── service-worker.js     # Tab routing, badge counter, and cross-origin messaging
├── content/
│   ├── dom-utils.js          # Resilient selector dictionary & post verification heuristics
│   ├── facebook-detector.js  # Group/Page auto-detection & admin permissions check
│   ├── facebook-scanner.js   # Controlled feed scanner & metadata extraction
│   └── facebook-actions.js   # Sequential verified post deletion with failsafe stops
├── popup/
│   ├── popup.html            # Quick status & launcher popup
│   ├── popup.css             # Popup styles
│   └── popup.js              # Popup controller
├── dashboard/
│   ├── dashboard.html        # Main SaaS admin dashboard
│   ├── dashboard.css         # Modern dark/light SaaS dashboard styling
│   └── dashboard.js          # Complete state management, tables, filters, and bulk engine
├── options/
│   ├── options.html          # Configuration & AI Rules page
│   ├── options.css           # Options styling
│   └── options.js            # Settings persistence & API testing
├── ai/
│   ├── prompts.js            # System instructions and batch analysis prompts
│   ├── schema.js             # Strict JSON schema validation & sanitization
│   └── analyzer.js           # Gemini API client, rate limiter, retry, and simulation engine
├── storage/
│   └── storage.js            # Abstracted chrome.storage.local with localStorage fallback
├── utils/
│   ├── logger.js             # Structured activity logger
│   ├── similarity.js         # N-gram & Jaccard duplicate clusterer
│   ├── helpers.js            # HTML escaper, CSV/JSON exporters, formatters
│   └── demo-data.js          # 100 realistic mock Facebook posts for sandbox testing
├── icons/                    # Extension icons (16x16, 48x48, 128x128)
└── README.md
```

---

## 🚀 How to Install and Run in Chrome

### Step 1: Load the Unpacked Extension
1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your address bar.
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select this folder: `c:\Users\USER\Music\Facebook Extinson` (or the folder where this project is located).
6. The extension **FB AI Post Manager** will now appear in your extension list!

---

## 🧪 Testing in Demo Mode (No Facebook Account or API Key Needed)

1. Click the **FB AI Post Manager** icon in your Chrome toolbar.
2. Click **Open Demo Mode (100 Posts)** or click **Open Full Dashboard** and toggle the **Demo Sandbox** switch at the top.
3. Click **[SCAN POSTS]**:
   - Watch the real-time progress bar stream 100 realistic posts into the dashboard.
   - Note the duplicate clusters and varied post types (Images, Reels, Videos, Links, Text).
4. Click **[ANALYZE WITH AI]**:
   - The analysis engine evaluates all posts, populating Quality, Engagement, Spam, and Duplicate scores.
   - AI Recommendations (`KEEP`, `REVIEW`, `DELETE`) with confidence percentages and reasoning appear.
5. Test the **Smart Filters**:
   - Click the `[DELETE]` or `[KEEP]` pills to filter recommendations.
   - Click `[Show likely duplicates]` or `[Show spam-like]`.
   - Adjust the **Quality** or **Engagement** sliders.
6. Test **AI Auto-Select**:
   - Toggle the **AI Auto-Select Rules** switch on. Matching delete candidates will automatically be checked.
7. Test **Safe Bulk Deletion**:
   - Click **[DELETE SELECTED]**.
   - Notice the **Anti-Accident Confirmation Modal** requiring explicit verification.
   - Click **[CONFIRM BULK DELETE]**.
   - Watch the live sequential deletion modal tracking Progress, Successful, Failed, and Skipped counts.
8. Test **Export Report**:
   - Click **[EXPORT REPORT]** -> Download CSV or JSON.

---

## 🌐 Running on Live Facebook

1. Navigate to an authorized **Facebook Group** or **Facebook Page** where you have management/admin permissions.
2. Open the **FB AI Post Manager** popup or dashboard.
3. The detector will confirm: `Connected to Facebook: [Group/Page Name]`.
4. Click **[SCAN POSTS]** to scan the live feed.
5. Review AI analysis and select posts.
6. Trigger **[DELETE SELECTED]**; the extension will execute sequential deletion safely, verifying each DOM element before performing any action.

---

## 🔒 Security & Facebook Compliance

- **No Credential Access**: Never asks for or intercepts Facebook passwords, cookies, or private session tokens.
- **Manifest V3 Compliant**: Uses minimal required permissions (`storage`, `activeTab`, `scripting`, `alarms`).
- **Zero Silent Automation**: Destructive operations always require user interaction and explicit confirmation.
- **Fail-Safe Operation**: If Facebook shows a CAPTCHA, temporary block, or if post elements cannot be verified with high certainty, the extension **immediately halts or skips** and records an entry in the Activity Log.
