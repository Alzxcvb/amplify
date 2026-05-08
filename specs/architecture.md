# Architecture — amplify

## Overview

Amplify monitors social platforms for pain-point signals and posts natural product recommendations. No API keys required — AI calls use a browser-controlled ChatGPT/Claude.ai session.

## Browser Strategy

Two browser contexts run simultaneously inside the same Chrome instance (port 9222):

1. **Platform context** — logged into Reddit/Instagram/Facebook
2. **AI context** — logged into ChatGPT custom GPT or claude.ai

This mirrors the working AppleScript pattern (Safari = platform, Firefox = ChatGPT), but implemented entirely in Playwright via CDP.

## Data Flow

```
Campaign JSON
     ↓
loadCampaigns()
     ↓
For each campaign → For each platform → For each target location
     ↓
scrapeSubreddit(page, subreddit)  →  array of posts
     ↓
filter: hasSeenPost(url) → skip seen
     ↓
markPostSeen(platform, url)
     ↓
scrapePostComments(page, postUrl)  →  array of comments
     ↓
For each comment:
  check rate limit (getRecentReplies)
  classifyAndReply(browser, post, campaign)
       ↓ (opens AI tab, pastes prompt, reads response, closes tab)
  if match && confidence >= CONFIDENCE_THRESHOLD (8):
    postReply(page, commentUrl, replyText, {dryRun})
    logReply(campaignId, postUrl, commentUrl, replyText)
  else:
    logSkipped(campaignId, postUrl, reason)
```

## Key Design Decisions

- **No API keys**: AI calls via browser, same as user's existing LinkedIn/birthday bots
- **Dry-run default**: `--dry-run` flag logs instead of posting. Safe for testing.
- **Per-campaign rate limits**: Max 5 replies/hour/campaign, 2min minimum between any two posts
- **Confidence threshold 8/10**: Claude must be highly confident it's a genuine pain point
- **SQLite for state**: No external DB, runs entirely locally
- **One campaign per run (optional)**: `--campaign=id` flag for targeted runs
