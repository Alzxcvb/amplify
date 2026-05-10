# Multi-Platform Expansion — Ralph Loop Tasks

## Goal
Expand amplify beyond Reddit to cover LinkedIn (prospecting), Quora (Q&A), BlueSky API (trend monitoring), Instagram (trends), Twitter/X (trends + engagement), Threads. All platforms share the same campaign JSON, classifier, and SQLite state. Intelligence-gathering (reading) first, posting second.

## Platform Priority Order
1. Quora — scrape-friendly, Q&A format, good for arrival-pass + hi-im-alex
2. BlueSky — public AT Protocol API, no auth required for search, easiest programmatic access
3. LinkedIn — highest value for hi-im-alex prospecting (CDP browser, logged-in Chrome)
4. Instagram — hashtag trend monitoring (CDP, aggressive bot detection)
5. Twitter/X — trend monitoring + engagement (CDP, Cloudflare-heavy)
6. Threads — trend monitoring (Meta platform, moderate detection)

## Tasks

- [x] TASK-1: DB schema — leads + trends tables added to db.js, logLead/recordTrend/getLeads/getTrends exported
- [x] TASK-2: Quora scraper — scrapeQuoraSearch + scrapeQuoraAnswers in src/platforms/quora/scraper.js
- [x] TASK-3: Quora poster — postQuoraAnswer in same file (browser CDP, clicks Answer btn)
- [x] TASK-4: BlueSky scraper — scrapeBlueSkySearch via public AT Protocol API in src/platforms/bluesky/scraper.js
- [x] TASK-5: BlueSky poster — postBlueSkyReply via AT Protocol API (needs BLUESKY_IDENTIFIER + BLUESKY_APP_PASSWORD env vars)
- [x] TASK-6: LinkedIn scraper — scrapeLinkedInSearch + scrapeLinkedInProspects in src/platforms/linkedin/scraper.js
- [x] TASK-7: LinkedIn leads writer — logLead() called for each LinkedIn prospect/post match
- [x] TASK-8: Instagram trend monitor — scrapeInstagramTrends in src/platforms/instagram/scraper.js, recordTrend() called
- [x] TASK-9: Twitter/X scraper — scrapeTwitterSearch + scrapeTwitterTrends in src/platforms/twitter/scraper.js
- [x] TASK-10: Threads scraper — scrapeThreadsSearch in src/platforms/threads/scraper.js
- [x] TASK-11: bot.js — processOtherPlatforms() wired in, called after Reddit section per campaign
- [x] TASK-12: campaign JSONs — arrival-pass + hi-im-alex updated with quora/bluesky/linkedin/twitter/threads/instagram_trends configs
- [ ] TASK-13: dashboard — add Leads tab + Trends tab (next session)
- [ ] TASK-14: index.js — add --platform=X flag (next session)

## Campaign → Platform Mapping
- hi-im-alex: LinkedIn (prospect), Quora (Q&A), BlueSky (engage), Reddit (Q&A)
- arrival-pass: Reddit (Q&A), Quora (Q&A), Threads (awareness), Twitter/X (trend hop)
- erasure: Reddit (Q&A), Quora (Q&A)
- ns-academy: LinkedIn (prospect), Instagram (trend), Twitter/X (trend), Threads

## Architecture Notes
- All scrapers return `{ posts: [{url, title, body, author, postedAt, subreddit/community}] }`
- Classifier is platform-agnostic — takes post object, campaign, returns {match, confidence, reply}
- Leads table: (campaign_id, platform, profile_url, name, context, found_at, status)
- Trends table: (platform, topic, signal_count, first_seen_at, last_seen_at)
- Bot detection strategy: always CDP to logged-in Chrome, human jitter delays, max 30 req/hr per platform

## Review
