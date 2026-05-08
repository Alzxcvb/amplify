# amplify

Organic marketing bot — monitors social platforms for pain-point signals, classifies intent via browser-controlled AI (no API keys), and posts natural replies recommending the right product.

**Method: Ralph (ghuntley/how-to-ralph-wiggum). NOT Gastown.**

## Running

```bash
# Dry run (no posting, just logs matches)
node src/index.js --dry-run

# Live run, all campaigns
node src/index.js

# Live run, one campaign
node src/index.js --campaign=arrival-pass

# Smoke test
node test/smoke.js
```

## Prerequisites

- Chrome must be running with remote debugging on port 9222
  ```bash
  # macOS alias (add to ~/.zshrc):
  # alias chrome-cdp='open -a "Google Chrome" --args --remote-debugging-port=9222'
  chrome-cdp
  ```
- Must be logged into Reddit (and any other target platforms) in that Chrome instance
- Must be logged into claude.ai in that same Chrome instance (for AI calls)

## Architecture

```
src/
  browser/connector.js     — CDP connect to Chrome on port 9222
  ai/claude-browser.js     — open claude.ai tab, paste prompt, return response text
  ai/classifier.js         — classify post + generate reply using claude-browser
  platforms/reddit/
    scraper.js             — scrape subreddit post list + post comments
    poster.js              — post a reply to a Reddit comment
  state/db.js              — SQLite: seen posts, sent replies, rate limit tracking
  campaigns/loader.js      — load campaign JSON files from campaigns/
  config.js                — rate limits, confidence thresholds, delays
  bot.js                   — main loop: per-campaign, per-platform, per-post
  index.js                 — CLI entry point (parse args, call runBot)
campaigns/
  arrival-pass.json        — Arrival Pass campaign config
  erasure.json             — Erasure digital privacy campaign
  ns-academy.json          — NS Academy / hiimalex.ai consulting campaign
data/
  amplify.db               — SQLite state (gitignored)
test/
  smoke.js                 — end-to-end smoke test (no posting)
```

## Agent Rules

- NEVER use the AskUserQuestion tool. Always ask questions as plain text.
- One task per session. Verify. Commit. Exit.
- Keep tasks small and independently verifiable.
- After each task: append any discovered commands, gotchas, or patterns to AGENTS.md.
- NEVER post to any platform unless `--dry-run` is NOT passed. Dry-run is the safe default.
- Use `node --check <file>` to syntax-check all JS files before committing.
- Use `node test/smoke.js` as the final verification once core modules exist.
