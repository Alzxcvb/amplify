'use strict';

const chalk = require('chalk');
const { connectBrowser, openNewTab, closePage } = require('./browser/connector');
const { loadCampaigns } = require('./campaigns/loader');
const { scrapeSubreddit, scrapePostComments } = require('./platforms/reddit/scraper');
const { postReply } = require('./platforms/reddit/poster');
const { classifyAndReply } = require('./ai/classifier');
const { hasSeenPost, markPostSeen, logReply, logSkipped, getRecentReplies } = require('./state/db');
const {
  MAX_REPLIES_PER_CAMPAIGN_PER_HOUR,
  MIN_SECONDS_BETWEEN_REPLIES,
  CONFIDENCE_THRESHOLD,
  SCROLL_PAUSE_MS,
} = require('./config');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimited(campaignId) {
  const recent = getRecentReplies(campaignId, 1);
  if (recent.length >= MAX_REPLIES_PER_CAMPAIGN_PER_HOUR) return { limited: true, reason: 'hourly cap' };
  if (recent.length > 0) {
    const lastPostedAt = Math.max(...recent.map(r => r.posted_at));
    const elapsed = Math.floor(Date.now() / 1000) - lastPostedAt;
    if (elapsed < MIN_SECONDS_BETWEEN_REPLIES) return { limited: true, reason: `min gap (${elapsed}s < ${MIN_SECONDS_BETWEEN_REPLIES}s)` };
  }
  return { limited: false };
}

async function runBot({ dryRun = false, campaignFilter = null } = {}) {
  console.log(chalk.cyan('[bot] Starting amplify' + (dryRun ? ' (DRY RUN)' : '')));

  let campaigns = loadCampaigns();
  if (campaignFilter) {
    campaigns = campaigns.filter(c => c.id === campaignFilter);
    if (campaigns.length === 0) {
      console.error(chalk.red(`[bot] No campaign found with id: ${campaignFilter}`));
      process.exit(1);
    }
  }

  console.log(chalk.gray(`[bot] Loaded ${campaigns.length} campaign(s): ${campaigns.map(c => c.id).join(', ')}`));

  let browser;
  try {
    browser = await connectBrowser();
  } catch (err) {
    console.error(chalk.red('[bot] ' + err.message));
    process.exit(1);
  }

  const stats = {};

  try {
    for (const campaign of campaigns) {
      stats[campaign.id] = { postsScanned: 0, commentsChecked: 0, matchesFound: 0, repliesPosted: 0, skipped: 0 };

      const subreddits = campaign.platforms?.reddit || [];
      if (subreddits.length === 0) {
        console.warn(chalk.yellow(`[bot] Campaign ${campaign.id} has no reddit subreddits, skipping`));
        continue;
      }

      const page = await openNewTab(browser, null);

      try {
        for (const subreddit of subreddits) {
          console.log(chalk.blue(`[bot] Scraping ${subreddit} for campaign: ${campaign.id}`));

          let posts;
          try {
            posts = await scrapeSubreddit(page, subreddit);
          } catch (err) {
            console.warn(chalk.yellow(`[bot] scrapeSubreddit error for ${subreddit}: ${err.message}`));
            continue;
          }

          const newPosts = posts.filter(p => !hasSeenPost(p.url));
          console.log(chalk.gray(`[bot] ${subreddit}: ${posts.length} posts, ${newPosts.length} new`));

          for (const post of newPosts) {
            markPostSeen('reddit', post.url);
            stats[campaign.id].postsScanned++;

            let comments;
            try {
              comments = await scrapePostComments(page, post.url);
            } catch (err) {
              console.warn(chalk.yellow(`[bot] scrapePostComments error for ${post.url}: ${err.message}`));
              continue;
            }

            let rateLimitBroken = false;
            for (const comment of comments) {
              stats[campaign.id].commentsChecked++;

              const rl = isRateLimited(campaign.id);
              if (rl.limited) {
                console.log(chalk.yellow(`[bot] Rate limit reached for ${campaign.id}: ${rl.reason}`));
                rateLimitBroken = true;
                break;
              }

              const postData = {
                url: post.url,
                title: post.title,
                body: '',
                commentUrl: comment.url,
                commentBody: comment.body,
                author: comment.author,
                platform: 'reddit',
              };

              let result;
              try {
                result = await classifyAndReply(browser, postData, campaign);
              } catch (err) {
                console.warn(chalk.yellow(`[bot] classifyAndReply error: ${err.message}`));
                continue;
              }

              if (result.match && result.confidence >= CONFIDENCE_THRESHOLD && result.reply) {
                stats[campaign.id].matchesFound++;
                console.log(chalk.green(`[bot] Match (confidence ${result.confidence}): ${comment.url}`));

                try {
                  await postReply(page, comment.url, result.reply, { dryRun });
                  logReply(campaign.id, post.url, comment.url, result.reply);
                  stats[campaign.id].repliesPosted++;
                  console.log(chalk.green(`[bot] Reply posted${dryRun ? ' (dry run)' : ''}`));
                } catch (err) {
                  console.warn(chalk.yellow(`[bot] postReply error: ${err.message}`));
                  logSkipped(campaign.id, post.url, `postReply: ${err.message}`);
                  stats[campaign.id].skipped++;
                }

                await sleep(SCROLL_PAUSE_MS * (0.8 + Math.random() * 0.4));
              } else {
                stats[campaign.id].skipped++;
              }
            }

            if (rateLimitBroken) break;
          }
        }
      } finally {
        await closePage(page);
      }
    }
  } finally {
    await browser.close();
  }

  printSummary(stats, dryRun);
}

function printSummary(stats, dryRun) {
  console.log('\n' + chalk.bold('=== Run Summary' + (dryRun ? ' (DRY RUN)' : '') + ' ==='));
  const COL = [20, 8, 10, 9, 9, 8];
  const headers = ['Campaign', 'Posts', 'Comments', 'Matches', 'Replies', 'Skipped'];
  console.log(
    chalk.bold(headers.map((h, i) => h.padEnd(COL[i])).join(''))
  );
  for (const [id, s] of Object.entries(stats)) {
    const row = [id, s.postsScanned, s.commentsChecked, s.matchesFound, s.repliesPosted, s.skipped];
    console.log(row.map((v, i) => String(v).padEnd(COL[i])).join(''));
  }
}

module.exports = { runBot };
