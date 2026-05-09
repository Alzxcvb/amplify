# amplify

Organic marketing bot — monitors Reddit for pain-point signals, classifies intent via browser-controlled AI (no API keys), and posts natural replies recommending the right product.

## Prerequisites

1. **One-time browser setup** — run this once to save your Reddit + Claude.ai sessions:
   ```bash
   node setup-browser.js
   ```
   Log into Reddit and claude.ai when the browser opens, then press Enter. Sessions are saved permanently — no setup needed on future runs.

2. **Node.js 20+** and native build tools (for `better-sqlite3`):
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

## Dashboard

```bash
cd dashboard && npm install && npm run dev
# Open http://localhost:3000
```

Pages: Home (stats), Campaigns (CRUD + settings), Subreddits (quality scores), Runs (history), Injections (security log).

## Adaptive Tuning

Every run, the bot computes a **match ratio** (matches / comments checked) per campaign and scores it:

```
score = match_ratio × log(commentsChecked + 1)
```

The **auto-tuner** proposes one parameter change per run (A/B style) and keeps the winner:

| Parameter | What it controls |
|---|---|
| `post_age_days` | How old posts can be (±3 days) |
| `confidence_threshold` | AI confidence cutoff (±1 point) |
| `max_comments_per_post` | Comments read per post (±10) |
| `subreddit_set` | Flags low-performing subreddits, discovers niche replacements |

View and override any setting from the dashboard → Campaigns → [campaign] → Settings.
Manual overrides take precedence over auto-tuning. Reset a setting to let the tuner resume.

## Campaign UI

Create and manage campaigns without editing JSON files:

1. Open the dashboard at `http://localhost:3000`
2. Go to **Campaigns → + New Campaign**
3. Follow the 3-step wizard (product info → subreddits → confirm)

The wizard writes a JSON file to `campaigns/` and activates the campaign immediately.

## Prompt Injection Protection

Every comment is screened before it reaches the AI classifier. Detected patterns include:

- "ignore previous instructions" / "forget everything"
- "you are now" / "act as" / "pretend you"
- `[SYSTEM]`, `<<SYS>>`, `### instruction` tags
- Text exceeding 5,000 characters
- Control characters

Flagged comments are logged (not classified) and visible in the dashboard → **Injections** page.

## Adding a campaign manually

Add a JSON file to `campaigns/`:

```json
{
  "id": "my-product",
  "product": "My Product Name",
  "url": "https://myproduct.com",
  "pitch": "One sentence describing what your product does and why it's useful.",
  "pain_points": ["keyword that signals someone needs this", "another relevant search term"],
  "active": true,
  "platforms": {
    "reddit": ["r/subreddit1", "r/subreddit2"]
  }
}
```

- `pain_points` — keywords used for cross-Reddit search
- `platforms.reddit` — subreddits to monitor for new posts
- Set `"active": false` to disable without deleting the file

## Smoke test

```bash
node test/smoke.js
```

14 tests covering DB, campaigns, config, injection detection, settings round-trip, and comment dedup — no Chrome or network required.
