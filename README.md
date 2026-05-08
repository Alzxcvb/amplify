# amplify

Organic marketing bot — monitors Reddit for pain-point signals, classifies intent via browser-controlled AI (no API keys), and posts natural replies recommending the right product.

## Prerequisites

1. **Chrome with remote debugging** — must be running before the bot starts:
   ```bash
   # Add to ~/.zshrc for convenience:
   alias chrome-cdp='open -a "Google Chrome" --args --remote-debugging-port=9222'

   chrome-cdp
   ```

2. **Logged-in accounts** — in that Chrome instance, log into:
   - Reddit (the account that will post replies)
   - claude.ai (for AI classification — no API key needed)

3. **Node.js 20+** and native build tools (for `better-sqlite3`):
   ```bash
   npm install
   ```

## Running the bot

```bash
# Dry run — no posts, just logs matches (safe default)
node src/index.js --dry-run

# Live run — all campaigns
node src/index.js

# Live run — one campaign only
node src/index.js --campaign=arrival-pass
```

## Creating a campaign

Add a JSON file to `campaigns/`:

```json
{
  "id": "my-product",
  "product": "My Product Name",
  "url": "https://myproduct.com",
  "pitch": "One sentence describing what your product does and why it's useful.",
  "pain_points": [
    "keyword that signals someone needs this",
    "another relevant search term"
  ],
  "active": true,
  "platforms": {
    "reddit": ["r/subreddit1", "r/subreddit2"],
    "instagram": [],
    "facebook": []
  }
}
```

- `pain_points` — keywords used for cross-Reddit search (first 3 are scanned per run)
- `platforms.reddit` — subreddits to monitor for new posts
- Set `"active": false` to disable without deleting the file

## Dashboard

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

Shows: live stats, campaign list, and full activity log (replies + skipped posts).

## Smoke test

```bash
node test/smoke.js
```

Verifies DB, campaigns, and config — no Chrome or network required.
