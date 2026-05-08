'use strict';

const chalk = require('chalk');
const { connectBrowser, openNewTab, closePage } = require('./browser/connector');
const { loadCampaigns } = require('./campaigns/loader');
const { scrapeSubreddit, scrapePostComments, scrapeRedditSearch } = require('./platforms/reddit/scraper');
const { postReply } = require('./platforms/reddit/poster');
const { classifyAndReply } = require('./ai/classifier');
const { hasSeenPost, markPostSeen, logReply, logSkipped, getRecentReplies, getStats } = require('./state/db');
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

async function processNewPosts(browser, page, posts, campaign, stats, dryRun) {
  for (const post of posts) {
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

    if (rateLimitBroken) return true;
  }
  return false;
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

          await processNewPosts(browser, page, newPosts, campaign, stats, dryRun);
        }

        const keywords = (campaign.pain_points || []).slice(0, 3);
        for (const keyword of keywords) {
          console.log(chalk.blue(`[bot] Keyword search: "${keyword}" for campaign: ${campaign.id}`));

          let searchPosts;
          try {
            searchPosts = await scrapeRedditSearch(page, keyword);
          } catch (err) {
            console.warn(chalk.yellow(`[bot] scrapeRedditSearch error for "${keyword}": ${err.message}`));
            continue;
          }

          const newSearchPosts = searchPosts.filter(p => !hasSeenPost(p.url));
          console.log(chalk.gray(`[bot] Keyword "${keyword}": ${searchPosts.length} posts, ${newSearchPosts.length} new`));

          const rateLimited = await processNewPosts(browser, page, newSearchPosts, campaign, stats, dryRun);
          if (rateLimited) break;
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
  console.log(chalk.bold(headers.map((h, i) => h.padEnd(COL[i])).join('')));
  for (const [id, s] of Object.entries(stats)) {
    const row = [id, s.postsScanned, s.commentsChecked, s.matchesFound, s.repliesPosted, s.skipped];
    console.log(row.map((v, i) => String(v).padEnd(COL[i])).join(''));
  }

  const dbStats = getStats();
  console.log('\n' + chalk.bold('=== All-Time Stats ==='));
  console.log(chalk.gray('Total replies posted : ') + chalk.green(dbStats.totalReplies));
  console.log(chalk.gray('Total skipped        : ') + chalk.yellow(dbStats.totalSkipped));
  console.log(chalk.gray('Replies last 24h     : ') + chalk.cyan(dbStats.last24hReplies));
  if (Object.keys(dbStats.repliesByCampaign).length > 0) {
    console.log(chalk.gray('By campaign:'));
    for (const [cid, n] of Object.entries(dbStats.repliesByCampaign)) {
      console.log('  ' + chalk.gray(cid.padEnd(22)) + chalk.green(n));
    }
  }
}

module.exports = { runBot };
