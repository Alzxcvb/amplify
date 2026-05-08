# Reddit Scraper Spec — amplify

## scrapeSubreddit(page, subredditName)

**Input:** Playwright page object (logged-in Reddit session), subreddit string like `r/malaysia` or `malaysia`

**Steps:**
1. Normalize: strip `r/` prefix if present → `malaysia`
2. Navigate to `https://www.reddit.com/r/{sub}/new/`
3. Wait for `[data-testid="post-container"]` or `shreddit-post` (new Reddit) — 10s timeout
4. Scroll 3 times: `window.scrollBy(0, 1500)` with 1.5s between
5. Scrape all visible post elements. For each:
   - Title: `.Post h3`, `[data-click-id="text"] h3`, or `shreddit-post` slot="title"
   - URL: the post permalink `a[data-click-id="body"]` href, or construct from post ID
   - Post ID: from URL or `data-fullname` attribute
6. Return array of `{title, url, id, subreddit}`
7. Handle errors: 404/not found → return []; Reddit rate limit (429 or "you are doing that too much") → return []

## scrapePostComments(page, postUrl)

**Input:** post permalink URL

**Steps:**
1. Navigate to postUrl
2. Wait for comment elements — selector: `[data-testid="comment"]`, `.Comment`, or `shreddit-comment`
3. Scrape top-level comments only (not nested replies). For each:
   - Author: `[data-testid="comment_author_link"]` or `.Comment__author`
   - Body: `[data-testid="comment"]` text content, or `.RichTextJSON-root`
   - Comment permalink: the "share" link or construct from comment ID
4. Skip: `[deleted]`, `[removed]`, AutoModerator author
5. Limit: first 25 comments only
6. Return array of `{author, body, url}`

## Selector Fallback Strategy

Reddit has old and new UI versions. Always try new Reddit selectors first, fall back to old:

```
New Reddit:   shreddit-post, shreddit-comment
Old Reddit:   .Post, .Comment, [data-testid="..."]
Both:         data-fullname, data-click-id attributes
```

If neither matches, return [] with a console.warn.

## Anti-Detection

- After navigation, add random delay: `1000 + Math.random() * 2000` ms before scraping
- Don't navigate faster than one page per 3 seconds
- Use existing logged-in session only — never log in programmatically
