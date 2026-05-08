# Implementation Plan — amplify

## Phase 1: Foundation

- [ ] TASK-01: Project scaffold — package.json with playwright + better-sqlite3 + chalk + dotenv, .gitignore, empty src/index.js placeholder, run npm install, verify node --check src/index.js
- [ ] TASK-02: Playwright CDP connector — src/browser/connector.js with connectBrowser() (connects to port 9222), openNewTab(browser, url), closePage(page). Clear error if Chrome not running. node --check verify.
- [ ] TASK-03: SQLite state manager — src/state/db.js. Tables: seen_posts(platform, url, scraped_at), sent_replies(campaign_id, post_url, comment_url, reply_text, posted_at), skipped_posts(campaign_id, post_url, reason, skipped_at). Functions: hasSeenPost(url), markPostSeen(platform, url), logReply(...), logSkipped(...), getRecentReplies(campaignId, hours). node --check verify.
- [ ] TASK-04: Campaign config loader — src/campaigns/loader.js. loadCampaigns() reads all .json files from campaigns/ dir, validates required fields (id, product, url, pitch, pain_points array, platforms object), returns valid array. Create campaigns/arrival-pass.json with full config per specs/campaign-schema.md. node --check + node -e verify.

## Phase 2: AI Interface (No API Keys)

- [ ] TASK-05: Claude.ai browser interface — src/ai/claude-browser.js. askClaude(browser, promptText) function: opens new tab to https://claude.ai/new, waits for chat input (selector: div[contenteditable="true"], textarea, or #prompt-textarea — try all three with fallback), types prompt with page.keyboard.type() at 80ms/char delay, presses Enter, polls for response completion (stable for 3s), extracts response text, closes tab, returns string. Must handle: page load timeout (30s), response timeout (60s). node --check verify.
- [ ] TASK-06: Intent classifier + reply generator — src/ai/classifier.js. classifyAndReply(browser, post, campaign) function. post = {url, title, body, commentUrl, commentBody, author}. Builds prompt per specs/classifier-prompt.md. Calls askClaude. Parses JSON from response ({match, confidence, reply, reason}). Returns parsed object. If parse fails, returns {match: false, confidence: 0, reply: null, reason: 'parse_error'}. node --check verify.

## Phase 3: Reddit Platform

- [ ] TASK-07: Reddit subreddit scraper — src/platforms/reddit/scraper.js. scrapeSubreddit(page, subredditName) navigates to https://www.reddit.com/r/{sub}/new, scrolls 3x (1500px each, 1.5s between), scrapes post cards: title, permalink URL, post ID. Returns array of {title, url, id, subreddit}. Skip promoted/ad posts. Handle: not found (return []), rate limit page (return []). node --check verify.
- [ ] TASK-08: Reddit comment scraper — add scrapePostComments(page, postUrl) to scraper.js. Navigates to postUrl, waits for comments to load, scrapes top-level comments only: author, body text, comment permalink. Returns array of {author, body, url}. Limit 25 comments. Skip [deleted], [removed], AutoModerator. node --check verify.
- [ ] TASK-09: Reddit reply poster — src/platforms/reddit/poster.js. postReply(page, commentUrl, replyText, options={}) function. options.dryRun defaults to false. Steps: navigate to commentUrl, find reply button on that comment, click it, wait for reply textarea, type replyText at 60ms/char, click Save (submit) button. If dryRun=true: log "[DRY RUN] Would post:" + replyText and return without clicking Save. Throw descriptive errors for: locked post, not logged in, rate limited. node --check verify.

## Phase 4: Core Bot

- [ ] TASK-10: Config + rate limits — src/config.js. Export constants: MAX_REPLIES_PER_CAMPAIGN_PER_HOUR=5, MIN_SECONDS_BETWEEN_REPLIES=120, CONFIDENCE_THRESHOLD=8, TYPING_DELAY_MS=80, SCROLL_PAUSE_MS=1500, AI_RESPONSE_TIMEOUT_MS=60000. node --check verify.
- [ ] TASK-11: Main bot loop — src/bot.js and src/index.js. index.js: parse --dry-run and --campaign=id flags from process.argv, call runBot({dryRun, campaignFilter}). bot.js runBot(): load campaigns (filter if campaignFilter set), connect browser, for each campaign → for each reddit subreddit → scrapeSubreddit → filter seen → for each post → scrapePostComments → for each comment → check rate limit → classifyAndReply → if match+confidence>=threshold → postReply → logReply. Catch per-comment errors (log + continue). Print chalk summary at end. node --check verify.
- [ ] TASK-12: Rate limit enforcement in bot — in bot.js runBot(), before calling postReply: (1) check getRecentReplies(campaignId, 1) < MAX_REPLIES_PER_CAMPAIGN_PER_HOUR, (2) check last sent reply timestamp > MIN_SECONDS_BETWEEN_REPLIES ago. If either check fails: log yellow "rate limit reached, skipping" and break inner loop. Add jitter to delays: multiply any sleep by (0.8 + Math.random()*0.4). node --check verify.

## Phase 5: Campaigns + Smoke Test

- [ ] TASK-13: Full campaign configs — create campaigns/erasure.json (digital privacy pain points, subreddits: r/privacy, r/digitalnomad, r/personalfinance, r/technology) and campaigns/ns-academy.json (AI implementation for small business, subreddits: r/entrepreneur, r/smallbusiness, r/digitalnomad, r/AItools). Update campaigns/arrival-pass.json to add subreddits: r/solotravel, r/expats, r/travel, r/backpacking. Verify all 3 load: node -e "const {loadCampaigns}=require('./src/campaigns/loader');console.log(loadCampaigns().map(c=>c.id))".
- [ ] TASK-14: Smoke test — test/smoke.js. Tests: (1) loadCampaigns() returns 3 campaigns, (2) DB init creates tables, (3) hasSeenPost returns false for new URL, (4) markPostSeen + hasSeenPost round-trip returns true, (5) logReply inserts row, (6) getRecentReplies returns 1 after logReply, (7) config constants are all defined + sane values. Run: node test/smoke.js. All 7 tests must pass with green output.
