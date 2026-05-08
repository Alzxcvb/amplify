# Implementation Plan — amplify

## Phase 1: Foundation

- [x] TASK-01: Project scaffold — package.json with playwright + better-sqlite3 + chalk + dotenv, .gitignore, empty src/index.js placeholder, run npm install, verify node --check src/index.js
- [x] TASK-02: Playwright CDP connector — src/browser/connector.js with connectBrowser() (connects to port 9222), openNewTab(browser, url), closePage(page). Clear error if Chrome not running. node --check verify.
- [x] TASK-03: SQLite state manager — src/state/db.js. Tables: seen_posts(platform, url, scraped_at), sent_replies(campaign_id, post_url, comment_url, reply_text, posted_at), skipped_posts(campaign_id, post_url, reason, skipped_at). Functions: hasSeenPost(url), markPostSeen(platform, url), logReply(...), logSkipped(...), getRecentReplies(campaignId, hours). node --check verify.
- [x] TASK-04: Campaign config loader — src/campaigns/loader.js. loadCampaigns() reads all .json files from campaigns/ dir, validates required fields (id, product, url, pitch, pain_points array, platforms object), returns valid array. Create campaigns/arrival-pass.json with full config per specs/campaign-schema.md. node --check + node -e verify.

## Phase 2: AI Interface (No API Keys)

- [x] TASK-05: Claude.ai browser interface — src/ai/claude-browser.js. askClaude(browser, promptText) function: opens new tab to https://claude.ai/new, waits for chat input (selector: div[contenteditable="true"], textarea, or #prompt-textarea — try all three with fallback), types prompt with page.keyboard.type() at 80ms/char delay, presses Enter, polls for response completion (stable for 3s), extracts response text, closes tab, returns string. Must handle: page load timeout (30s), response timeout (60s). node --check verify.
- [x] TASK-06: Intent classifier + reply generator — src/ai/classifier.js. classifyAndReply(browser, post, campaign) function. post = {url, title, body, commentUrl, commentBody, author}. Builds prompt per specs/classifier-prompt.md. Calls askClaude. Parses JSON from response ({match, confidence, reply, reason}). Returns parsed object. If parse fails, returns {match: false, confidence: 0, reply: null, reason: 'parse_error'}. node --check verify.

## Phase 3: Reddit Platform

- [x] TASK-07: Reddit subreddit scraper — src/platforms/reddit/scraper.js. scrapeSubreddit(page, subredditName) navigates to https://www.reddit.com/r/{sub}/new, scrolls 3x (1500px each, 1.5s between), scrapes post cards: title, permalink URL, post ID. Returns array of {title, url, id, subreddit}. Skip promoted/ad posts. Handle: not found (return []), rate limit page (return []). node --check verify.
- [ ] TASK-08: Reddit comment scraper — add scrapePostComments(page, postUrl) to scraper.js. Navigates to postUrl, waits for comments to load, scrapes top-level comments only: author, body text, comment permalink. Returns array of {author, body, url}. Limit 25 comments. Skip [deleted], [removed], AutoModerator. node --check verify.
- [ ] TASK-09: Reddit reply poster — src/platforms/reddit/poster.js. postReply(page, commentUrl, replyText, options={}) function. options.dryRun defaults to false. Steps: navigate to commentUrl, find reply button on that comment, click it, wait for reply textarea, type replyText at 60ms/char, click Save (submit) button. If dryRun=true: log "[DRY RUN] Would post:" + replyText and return without clicking Save. Throw descriptive errors for: locked post, not logged in, rate limited. node --check verify.

## Phase 4: Core Bot

- [ ] TASK-10: Config + rate limits — src/config.js. Export constants: MAX_REPLIES_PER_CAMPAIGN_PER_HOUR=5, MIN_SECONDS_BETWEEN_REPLIES=120, CONFIDENCE_THRESHOLD=8, TYPING_DELAY_MS=80, SCROLL_PAUSE_MS=1500, AI_RESPONSE_TIMEOUT_MS=60000. node --check verify.
- [ ] TASK-11: Main bot loop — src/bot.js and src/index.js. index.js: parse --dry-run and --campaign=id flags from process.argv, call runBot({dryRun, campaignFilter}). bot.js runBot(): load campaigns (filter if campaignFilter set), connect browser, for each campaign → for each reddit subreddit → scrapeSubreddit → filter seen → for each post → scrapePostComments → for each comment → check rate limit → classifyAndReply → if match+confidence>=threshold → postReply → logReply. Catch per-comment errors (log + continue). Print chalk summary at end. node --check verify.
- [ ] TASK-12: Rate limit enforcement in bot — in bot.js runBot(), before calling postReply: (1) check getRecentReplies(campaignId, 1) < MAX_REPLIES_PER_CAMPAIGN_PER_HOUR, (2) check last sent reply timestamp > MIN_SECONDS_BETWEEN_REPLIES ago. If either check fails: log yellow "rate limit reached, skipping" and break inner loop. Add jitter to delays: multiply any sleep by (0.8 + Math.random()*0.4). node --check verify.

## Phase 5: Campaigns + Smoke Test

- [ ] TASK-13: Full campaign configs — create campaigns/erasure.json (digital privacy pain points, subreddits: r/privacy, r/digitalnomad, r/personalfinance, r/technology) and campaigns/ns-academy.json (AI implementation for small business, subreddits: r/entrepreneur, r/smallbusiness, r/digitalnomad, r/AItools). Update campaigns/arrival-pass.json to add subreddits: r/solotravel, r/expats, r/travel, r/backpacking. Verify all 3 load: node -e "const {loadCampaigns}=require('./src/campaigns/loader');console.log(loadCampaigns().map(c=>c.id))".
- [ ] TASK-14: Smoke test — test/smoke.js. Tests: (1) loadCampaigns() returns 3 campaigns, (2) DB init creates tables, (3) hasSeenPost returns false for new URL, (4) markPostSeen + hasSeenPost round-trip returns true, (5) logReply inserts row, (6) getRecentReplies returns 1 after logReply, (7) config constants are all defined + sane values. Run: node test/smoke.js. All 7 tests must pass with green output.

## Phase 6: Reddit Keyword Search

- [ ] TASK-15: Reddit search scraper — add scrapeRedditSearch(page, query) to src/platforms/reddit/scraper.js. Navigates to https://www.reddit.com/search/?q={encodeURIComponent(query)}&sort=new&t=week, scrolls 3x, scrapes post results same format as scrapeSubreddit. This lets campaigns find posts by keyword across ALL of Reddit, not just specific subreddits. node --check verify.
  - Depends: TASK-07
- [ ] TASK-16: Keyword scan support in bot loop — update bot.js runBot() to also run scrapeRedditSearch for each pain_point keyword in the campaign (first 3 keywords only to avoid overload). Deduplicate results with seen_posts. Add to the same classify-and-reply flow. node --check verify.
  - Depends: TASK-11, TASK-15

## Phase 7: Activity Log + Stats

- [ ] TASK-17: Activity log query functions — add to src/state/db.js: getActivityLog(limit=50) returns last N rows from sent_replies joined with skipped_posts ordered by posted_at desc. getStats() returns {totalReplies, totalSkipped, repliesByCAMPAIGN: {}, last24hReplies}. node --check verify.
  - Depends: TASK-03
- [ ] TASK-18: Console stats report — at end of runBot() in bot.js, after the run completes, print a formatted chalk table: campaign name | posts scanned | comments checked | matches found | replies posted | skipped. node --check verify.
  - Depends: TASK-11, TASK-17

## Phase 8: Web Dashboard (Next.js)

- [ ] TASK-19: Next.js dashboard scaffold — inside amplify/dashboard/ run: npx create-next-app@latest . --yes --no-git --tailwind --app. Add dashboard/ to .gitignore temporarily. Verify: dashboard/ exists with package.json and app/ dir. No node --check needed; just verify the directory structure.
- [ ] TASK-20: Dashboard API routes — create dashboard/app/api/campaigns/route.js (GET: return loadCampaigns()), dashboard/app/api/activity/route.js (GET: return getActivityLog(100)), dashboard/app/api/stats/route.js (GET: return getStats()). API routes import from ../../../src/ using relative paths. node --check verify on each route file.
  - Depends: TASK-17, TASK-19
- [ ] TASK-21: Dashboard home page — dashboard/app/page.js. Shows: stats cards (total replies, today's replies, active campaigns), campaign list with toggle (active/inactive via JSON edit note), last 10 activity rows (campaign, post URL truncated, reply preview, timestamp). Uses fetch() to call the API routes. Tailwind styling. Verify: node --check dashboard/app/page.js.
  - Depends: TASK-20
- [ ] TASK-22: Dashboard activity feed page — dashboard/app/activity/page.js. Full activity log table: timestamp, campaign, post URL (clickable), reply text (first 100 chars), match/skip indicator. Paginated (show 50 at a time). Verify: node --check dashboard/app/activity/page.js.
  - Depends: TASK-20

## Phase 9: Polish

- [ ] TASK-23: README.md — write a clear README covering: (1) what amplify does, (2) prerequisites (Chrome CDP, logged-in accounts), (3) how to create a campaign JSON, (4) how to run (dry-run and live), (5) how to start the dashboard. Under 100 lines. No unnecessary sections.
- [ ] TASK-24: Integration dry-run test — test/dry-run-test.js. Script that: (1) loads campaigns, (2) initializes DB, (3) connects to browser via CDP (skip if Chrome not running — print warning and exit 0), (4) navigates to https://www.reddit.com/r/malaysia/new/, (5) calls scrapeSubreddit, (6) prints first 3 post titles found. Run: node test/dry-run-test.js. Must exit 0. This validates the full Reddit scraping pipeline without posting anything.
  - Depends: TASK-07, TASK-02
