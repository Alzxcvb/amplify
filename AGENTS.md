# Agent Notes — amplify

Maintained by the Ralph loop. Claude appends discoveries here across iterations
so knowledge accumulates rather than resetting each session.

---

## Verified Commands

```bash
# Syntax check a JS file
node --check src/<file>

# Run smoke test
node test/smoke.js

# Verify campaigns load
node -e "const {loadCampaigns}=require('./src/campaigns/loader');console.log(loadCampaigns().map(c=>c.id))"

# Start bot in dry-run mode (safe, no posting)
node src/index.js --dry-run

# Start bot for one campaign, dry-run
node src/index.js --campaign=arrival-pass --dry-run
```

---

## Known Gotchas

- Chrome must be running with --remote-debugging-port=9222 BEFORE the bot starts. Use `chrome-cdp` alias.
- better-sqlite3 requires native compilation — if `npm install` fails on Node 25, upgrade to latest: `npm install better-sqlite3@latest`. v9.x fails to build (C++20 required by Node 25 headers); v12+ works.
- Playwright CDP connect uses `chromium.connectOverCDP('http://localhost:9222')` — NOT `launch()`
- Reddit comment permalinks look like: https://www.reddit.com/r/{sub}/comments/{postid}/{title}/{commentid}/ — always use the full permalink to navigate directly to a comment
- Claude.ai selector for input may vary — try `div[contenteditable="true"]` first, then `[data-testid="chat-input"]`, then `textarea`
- When typing long prompts into Claude.ai, use `page.keyboard.type(text, {delay: 80})` — direct fill triggers anti-bot detection
- Reddit "new" sort URL: `https://www.reddit.com/r/{subreddit}/new/` — use this for freshest posts

---

## Patterns That Work

- `browser.contexts()[0]` gives the existing Chrome context; fall back to `browser.newContext()` if none exist. This avoids creating duplicate browser contexts when reusing a running Chrome instance.

---

## Patterns That Don't Work

- `waitUntil: 'networkidle'` on claude.ai hangs — claude.ai keeps long-lived SSE/WS connections. Use `domcontentloaded` then `waitForSelector` instead.
- `page.fill()` for prompt input triggers anti-bot detection on claude.ai and ChatGPT — always use `keyboard.type()` (short) or clipboard paste (long).

---

## Reddit Scraper Notes

- `shreddit-post` (new Reddit) uses `permalink` and `post-title` attributes — query these with `el.getAttribute()` in `page.evaluate()`
- `page.locator('shreddit-post, [data-testid="post-container"]').first().waitFor()` works as a unified wait for both Reddit UI versions
- Promoted posts: check `el.getAttribute('promoted') !== null` for shreddit-post; check `el.closest('[data-promoted="true"]')` for old Reddit containers
- `page.locator('body').textContent()` can detect "you are doing that too much" rate-limit pages
- `response.status()` from `page.goto()` is the cleanest way to detect 404/429

## Campaign Loader Notes

- `hi-im-alex.json` exists in campaigns/ but has `active: false` — loader correctly skips it
- loader silently skips campaigns with JSON parse errors, missing required fields, or `active: false`
- campaigns dir path is resolved relative to loader.js: `../../campaigns`
