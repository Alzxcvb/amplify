'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { connectBrowser, openNewTab, closePage } = require('./browser/connector');
const { loadCampaigns } = require('./campaigns/loader');
const { scrapeSubreddit, scrapePostComments, scrapeRedditSearch } = require('./platforms/reddit/scraper');
const { postReply } = require('./platforms/reddit/poster');
const { classifyAndReply } = require('./ai/classifier');
const { hasSeenPost, markPostSeen, logReply, logSkipped, hasRepliedToComment, getRecentReplies, getStats, logInjection, updateSubredditStats, flagSubreddit, isSubredditFlagged, getSubredditStats, addDiscoveredSubreddit, getDiscoveredSubreddits, getCampaignSetting, setCampaignSetting, getRecentRunStats, logLead, recordTrend, queueReply, getPendingReplies, markPendingPosted, markPendingFailed } = require('./state/db');
const { scrapeQuoraSearch, scrapeQuoraAnswers, postQuoraAnswer } = require('./platforms/quora/scraper');
const { scrapeBlueSkySearch } = require('./platforms/bluesky/scraper');
const { scrapeLinkedInSearch, scrapeLinkedInProspects } = require('./platforms/linkedin/scraper');
const { scrapeInstagramTrends } = require('./platforms/instagram/scraper');
const { scrapeTwitterSearch, scrapeTwitterTrends } = require('./platforms/twitter/scraper');
const { scrapeThreadsSearch } = require('./platforms/threads/scraper');
const { discoverSubreddits, discoverKeywords } = require('./discovery/subreddit-finder');
const { SCROLL_PAUSE_MS, resolveSettings } = require('./config');
const { betweenPages, readingPause } = require('./browser/human');
const { recordRunStats } = require('./tuning/run-stats');
const { tuneCampaign } = require('./tuning/auto-tuner');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimited(campaignId, settings) {
  const recent = getRecentReplies(campaignId, 1);
  if (recent.length >= settings.max_replies_per_hour) return { limited: true, reason: 'hourly cap' };
  if (recent.length > 0) {
    const lastPostedAt = Math.max(...recent.map(r => r.posted_at));
    const elapsed = Math.floor(Date.now() / 1000) - lastPostedAt;
    if (elapsed < settings.min_seconds_between_replies) return { limited: true, reason: `min gap (${elapsed}s < ${settings.min_seconds_between_replies}s)` };
  }
  return { limited: false };
}

async function processNewPosts(browser, page, posts, campaign, stats, dryRun, resolvedSettings, scanOnly = false) {
  for (const post of posts) {
    markPostSeen('reddit', post.url);
    stats[campaign.id].postsScanned++;

    let comments;
    try {
      comments = await scrapePostComments(page, post.url, resolvedSettings.max_comments_per_post);
    } catch (err) {
      console.warn(chalk.yellow(`[bot] scrapePostComments error for ${post.url}: ${err.message}`));
      continue;
    }

    let rateLimitBroken = false;
    for (const comment of comments) {
      stats[campaign.id].commentsChecked++;

      const rl = isRateLimited(campaign.id, resolvedSettings);
      if (rl.limited) {
        console.log(chalk.yellow(`[bot] Rate limit reached for ${campaign.id}: ${rl.reason}`));
        rateLimitBroken = true;
        break;
      }

      if (hasRepliedToComment(comment.url)) {
        console.log(chalk.dim(`[bot] already replied to this comment: ${comment.url}`));
        continue;
      }

      // Human-like pause between comments (simulate reading)
      await readingPause();

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
        result = await classifyAndReply(browser, postData, campaign, resolvedSettings);
      } catch (err) {
        if (err.message && err.message.includes('AI_NOT_LOGGED_IN')) {
          console.error(chalk.red('\n[bot] ⚠️  Not logged into Claude.ai. Run: node setup-browser.js'));
          console.error(chalk.red('[bot] Log into claude.ai in the browser that opens, then press Enter.\n'));
          await browser.close();
          process.exit(1);
        }
        console.warn(chalk.yellow(`[bot] classifyAndReply error: ${err.message}`));
        continue;
      }

      if (result.reason === 'injection_detected') {
        console.log(chalk.red(`[bot] Injection detected (${result.pattern}) in comment: ${comment.url}`));
        logInjection(campaign.id, post.url, comment.url, result.pattern, (comment.body || '').slice(0, 200));
        stats[campaign.id].injectionAttempts++;
        stats[campaign.id].skipped++;
        continue;
      }

      // Log every classification result so operator can see what's happening
      if (result.confidence > 0 || result.match) {
        const label = result.match && result.confidence >= resolvedSettings.confidence_threshold
          ? chalk.green(`MATCH conf=${result.confidence}`)
          : chalk.dim(`skip conf=${result.confidence}`);
        console.log(`[bot] ${label} | ${(result.reason || '').slice(0, 60)} | ${comment.url.slice(-50)}`);
      }

      if (result.match && result.confidence >= resolvedSettings.confidence_threshold && result.reply) {
        stats[campaign.id].matchesFound++;
        console.log(chalk.green(`[bot] Match (confidence ${result.confidence}): ${comment.url}`));

        queueReply(campaign.id, 'reddit', post.url, comment.url, result.reply);
        if (dryRun || scanOnly) {
          console.log(chalk.yellow(`[bot] ${scanOnly ? 'Queued (scan-only)' : '[DRY RUN] Would reply'}: ${comment.url.slice(-50)}`));
          stats[campaign.id].repliesPosted++;
        } else {
          try {
            await postReply(page, comment.url, result.reply, {});
            logReply(campaign.id, post.url, comment.url, result.reply);
            markPendingPosted(comment.url);
            stats[campaign.id].repliesPosted++;
            console.log(chalk.green(`[bot] Reply posted`));
          } catch (err) {
            markPendingFailed(comment.url, err.message);
            console.warn(chalk.yellow(`[bot] Post failed, kept in queue: ${err.message.slice(0, 80)}`));
            stats[campaign.id].skipped++;
          }
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

async function processOtherPlatforms(browser, campaign, stats, dryRun, resolvedSettings) {
  const platforms = campaign.platforms || {};

  // --- Quora: search for questions, classify, post answers ---
  const quoraKeywords = platforms.quora || [];
  if (quoraKeywords.length > 0) {
    const quoraPage = await openNewTab(browser, null);
    try {
      for (const keyword of quoraKeywords.slice(0, 4)) {
        console.log(chalk.blue(`[bot] Quora search: "${keyword}" for campaign: ${campaign.id}`));
        const posts = await scrapeQuoraSearch(quoraPage, keyword).catch(() => []);
        const newPosts = posts.filter(p => !hasSeenPost(p.url));
        for (const post of newPosts.slice(0, 5)) {
          markPostSeen('quora', post.url);
          stats[campaign.id].postsScanned++;
          const answers = await scrapeQuoraAnswers(quoraPage, post.url, 8).catch(() => []);
          for (const answer of answers) {
            if (hasRepliedToComment(answer.url)) continue;
            const rl = isRateLimited(campaign.id, resolvedSettings);
            if (rl.limited) break;
            await readingPause();
            const postData = { url: post.url, title: post.title, body: '', commentUrl: answer.url, commentBody: answer.body, author: answer.author, platform: 'quora' };
            let result;
            try { result = await classifyAndReply(browser, postData, campaign, resolvedSettings); } catch { continue; }
            stats[campaign.id].commentsChecked++;
            if (result.confidence > 0) {
              const label = result.match && result.confidence >= resolvedSettings.confidence_threshold ? chalk.green(`MATCH conf=${result.confidence}`) : chalk.dim(`skip conf=${result.confidence}`);
              console.log(`[bot] Quora ${label} | ${(result.reason || '').slice(0, 50)}`);
            }
            if (result.match && result.confidence >= resolvedSettings.confidence_threshold && result.reply) {
              stats[campaign.id].matchesFound++;
              if (!dryRun) {
                try { await postQuoraAnswer(quoraPage, post.url, result.reply); logReply(campaign.id, post.url, answer.url, result.reply); stats[campaign.id].repliesPosted++; console.log(chalk.green(`[bot] Quora answer posted`)); } catch (err) { console.warn(chalk.yellow(`[bot] Quora post error: ${err.message}`)); }
              } else { console.log(`[DRY RUN] Would answer Quora: ${post.url}`); }
            }
          }
          await betweenPages();
        }
      }
    } finally { await closePage(quoraPage); }
  }

  // --- BlueSky: public API search, classify, log (posting requires env vars) ---
  const bskyKeywords = platforms.bluesky || [];
  if (bskyKeywords.length > 0) {
    for (const keyword of bskyKeywords.slice(0, 4)) {
      console.log(chalk.blue(`[bot] BlueSky search: "${keyword}" for campaign: ${campaign.id}`));
      const posts = await scrapeBlueSkySearch(keyword, 20).catch(() => []);
      const newPosts = posts.filter(p => !hasSeenPost(p.url));
      for (const post of newPosts.slice(0, 8)) {
        markPostSeen('bluesky', post.url);
        stats[campaign.id].postsScanned++;
        if (hasRepliedToComment(post.url)) continue;
        const rl = isRateLimited(campaign.id, resolvedSettings);
        if (rl.limited) break;
        const postData = { url: post.url, title: '', body: post.body, commentUrl: post.url, commentBody: post.body, author: post.author, platform: 'bluesky' };
        let result;
        try { result = await classifyAndReply(browser, postData, campaign, resolvedSettings); } catch { continue; }
        stats[campaign.id].commentsChecked++;
        if (result.confidence > 0) {
          const label = result.match && result.confidence >= resolvedSettings.confidence_threshold ? chalk.green(`MATCH conf=${result.confidence}`) : chalk.dim(`skip conf=${result.confidence}`);
          console.log(`[bot] BlueSky ${label} | ${(result.reason || '').slice(0, 50)} | @${post.author}`);
        }
        if (result.match && result.confidence >= resolvedSettings.confidence_threshold && result.reply) {
          stats[campaign.id].matchesFound++;
          const bskyId = process.env.BLUESKY_IDENTIFIER;
          const bskyPass = process.env.BLUESKY_APP_PASSWORD;
          if (!dryRun && bskyId && bskyPass) {
            try {
              const { postBlueSkyReply } = require('./platforms/bluesky/scraper');
              await postBlueSkyReply(bskyId, bskyPass, post._uri, post._cid, result.reply);
              logReply(campaign.id, post.url, post.url, result.reply); stats[campaign.id].repliesPosted++;
              console.log(chalk.green(`[bot] BlueSky reply posted`));
            } catch (err) { console.warn(chalk.yellow(`[bot] BlueSky post error: ${err.message}`)); }
          } else { console.log(`[DRY RUN / no creds] Would reply on BlueSky: ${post.url}`); }
        }
      }
    }
  }

  // --- LinkedIn: prospect search, log leads ---
  const linkedinConfig = platforms.linkedin || {};
  const linkedinKeywords = Array.isArray(linkedinConfig) ? linkedinConfig : (linkedinConfig.prospect_queries || []);
  const linkedinPostKeywords = linkedinConfig.post_queries || linkedinKeywords;
  if (linkedinKeywords.length > 0 || linkedinPostKeywords.length > 0) {
    const liPage = await openNewTab(browser, null);
    try {
      for (const query of linkedinKeywords.slice(0, 3)) {
        console.log(chalk.blue(`[bot] LinkedIn prospect search: "${query}" for campaign: ${campaign.id}`));
        const prospects = await scrapeLinkedInProspects(liPage, query, 10).catch(() => []);
        for (const p of prospects) {
          logLead(campaign.id, 'linkedin', p.profileUrl, { name: p.name, context: p.context });
        }
        if (prospects.length > 0) console.log(chalk.cyan(`[bot] LinkedIn: found ${prospects.length} prospects for "${query}"`));
        await betweenPages();
      }
      for (const query of linkedinPostKeywords.slice(0, 3)) {
        console.log(chalk.blue(`[bot] LinkedIn post search: "${query}" for campaign: ${campaign.id}`));
        const posts = await scrapeLinkedInSearch(liPage, query, 10).catch(() => []);
        const newPosts = posts.filter(p => !hasSeenPost(p.url));
        for (const post of newPosts.slice(0, 5)) {
          markPostSeen('linkedin', post.url);
          stats[campaign.id].postsScanned++;
          if (post.profileUrl) logLead(campaign.id, 'linkedin', post.profileUrl, { name: post.author, context: post.body.slice(0, 200), postUrl: post.url });
          const rl = isRateLimited(campaign.id, resolvedSettings);
          if (rl.limited) break;
          const postData = { url: post.url, title: '', body: post.body, commentUrl: post.url, commentBody: post.body, author: post.author, platform: 'linkedin' };
          let result;
          try { result = await classifyAndReply(browser, postData, campaign, resolvedSettings); } catch { continue; }
          stats[campaign.id].commentsChecked++;
          if (result.confidence > 0) {
            const label = result.match && result.confidence >= resolvedSettings.confidence_threshold ? chalk.green(`MATCH conf=${result.confidence}`) : chalk.dim(`skip conf=${result.confidence}`);
            console.log(`[bot] LinkedIn ${label} | ${(result.reason || '').slice(0, 50)}`);
          }
        }
        await betweenPages();
      }
    } finally { await closePage(liPage); }
  }

  // --- Instagram: hashtag trend monitoring ---
  const igHashtags = platforms.instagram_trends || [];
  if (igHashtags.length > 0) {
    const igPage = await openNewTab(browser, null);
    try {
      const trends = await scrapeInstagramTrends(igPage, igHashtags.slice(0, 5)).catch(() => []);
      for (const t of trends) {
        recordTrend('instagram', `#${t.hashtag}`);
        console.log(chalk.cyan(`[bot] IG trend: #${t.hashtag} (${t.postCount} posts)`));
      }
    } finally { await closePage(igPage); }
  }

  // --- Twitter/X: keyword search + trends ---
  const twitterKeywords = platforms.twitter || [];
  if (twitterKeywords.length > 0) {
    const twPage = await openNewTab(browser, null);
    try {
      const twitterTrends = await scrapeTwitterTrends(twPage).catch(() => []);
      for (const t of twitterTrends.slice(0, 10)) { recordTrend('twitter', t.topic); }
      if (twitterTrends.length > 0) console.log(chalk.cyan(`[bot] Twitter trends: ${twitterTrends.slice(0, 5).map(t => t.topic).join(', ')}`));

      for (const keyword of twitterKeywords.slice(0, 3)) {
        console.log(chalk.blue(`[bot] Twitter search: "${keyword}" for campaign: ${campaign.id}`));
        const posts = await scrapeTwitterSearch(twPage, keyword, 15).catch(() => []);
        const newPosts = posts.filter(p => !hasSeenPost(p.url));
        for (const post of newPosts.slice(0, 5)) {
          markPostSeen('twitter', post.url);
          stats[campaign.id].postsScanned++;
          const rl = isRateLimited(campaign.id, resolvedSettings);
          if (rl.limited) break;
          const postData = { url: post.url, title: '', body: post.body, commentUrl: post.url, commentBody: post.body, author: post.author, platform: 'twitter' };
          let result;
          try { result = await classifyAndReply(browser, postData, campaign, resolvedSettings); } catch { continue; }
          stats[campaign.id].commentsChecked++;
          if (result.confidence > 0) {
            const label = result.match && result.confidence >= resolvedSettings.confidence_threshold ? chalk.green(`MATCH conf=${result.confidence}`) : chalk.dim(`skip conf=${result.confidence}`);
            console.log(`[bot] Twitter ${label} | ${(result.reason || '').slice(0, 50)}`);
          }
        }
        await betweenPages();
      }
    } finally { await closePage(twPage); }
  }

  // --- Threads: keyword search ---
  const threadsKeywords = platforms.threads || [];
  if (threadsKeywords.length > 0) {
    const thPage = await openNewTab(browser, null);
    try {
      for (const keyword of threadsKeywords.slice(0, 3)) {
        console.log(chalk.blue(`[bot] Threads search: "${keyword}" for campaign: ${campaign.id}`));
        const posts = await scrapeThreadsSearch(thPage, keyword, 15).catch(() => []);
        const newPosts = posts.filter(p => !hasSeenPost(p.url));
        for (const post of newPosts.slice(0, 5)) {
          markPostSeen('threads', post.url);
          stats[campaign.id].postsScanned++;
          const rl = isRateLimited(campaign.id, resolvedSettings);
          if (rl.limited) break;
          const postData = { url: post.url, title: '', body: post.body, commentUrl: post.url, commentBody: post.body, author: post.author, platform: 'threads' };
          let result;
          try { result = await classifyAndReply(browser, postData, campaign, resolvedSettings); } catch { continue; }
          stats[campaign.id].commentsChecked++;
          if (result.confidence > 0) {
            const label = result.match && result.confidence >= resolvedSettings.confidence_threshold ? chalk.green(`MATCH conf=${result.confidence}`) : chalk.dim(`skip conf=${result.confidence}`);
            console.log(`[bot] Threads ${label} | ${(result.reason || '').slice(0, 50)}`);
          }
        }
        await betweenPages();
      }
    } finally { await closePage(thPage); }
  }
}

async function postQueue({ campaignFilter = null, dryRun = false } = {}) {
  let campaigns = loadCampaigns();
  if (campaignFilter) campaigns = campaigns.filter(c => c.id === campaignFilter);

  let browser;
  try { browser = await connectBrowser(); } catch (err) { console.error(chalk.red('[postQueue] ' + err.message)); process.exit(1); }

  try {
    for (const campaign of campaigns) {
      const resolvedSettings = resolveSettings(campaign.id, campaign);
      const pending = getPendingReplies(campaign.id, { limit: 50 });
      if (pending.length === 0) { console.log(chalk.gray(`[postQueue] ${campaign.id}: nothing queued`)); continue; }
      console.log(chalk.cyan(`[postQueue] ${campaign.id}: ${pending.length} queued replies to attempt`));
      const page = await openNewTab(browser, null);
      try {
        for (const p of pending) {
          if (hasRepliedToComment(p.comment_url)) { markPendingPosted(p.comment_url); continue; }
          const rl = isRateLimited(campaign.id, resolvedSettings);
          if (rl.limited) { console.log(chalk.yellow(`[postQueue] Rate limit reached for ${campaign.id}`)); break; }
          try {
            await postReply(page, p.comment_url, p.reply_text, { dryRun });
            logReply(campaign.id, p.post_url, p.comment_url, p.reply_text);
            markPendingPosted(p.comment_url);
            console.log(chalk.green(`[postQueue] Posted: ${p.comment_url.slice(-60)}`));
          } catch (err) {
            markPendingFailed(p.comment_url, err.message);
            console.warn(chalk.yellow(`[postQueue] Failed (attempt ${p.retry_count + 1}): ${err.message.slice(0, 80)}`));
          }
          await sleep(2500 + Math.random() * 2000);
        }
      } finally { await closePage(page); }
    }
  } finally { await browser.close(); }
}

async function runBot({ dryRun = false, campaignFilter = null, scanOnly = false } = {}) {
  const startedAt = Date.now();
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
      stats[campaign.id] = { postsScanned: 0, commentsChecked: 0, matchesFound: 0, repliesPosted: 0, skipped: 0, injectionAttempts: 0, subredditsScanned: 0, flaggedSubreddits: [], newSubredditsDiscovered: [], tuningChanges: [], resolvedSettings: null };

      const resolvedSettings = resolveSettings(campaign.id, campaign);

      // Apply any pending A/B experiment in-memory before this run
      const pendingExpRaw = getCampaignSetting(campaign.id, 'pending_experiment', null);
      if (pendingExpRaw && pendingExpRaw !== 'null') {
        try {
          const exp = JSON.parse(pendingExpRaw);
          if (exp && exp.parameter && exp.parameter !== 'subreddit_set') {
            resolvedSettings[exp.parameter] = exp.candidateValue;
            console.log(chalk.yellow(`[bot] Applying experiment: ${exp.parameter} = ${exp.candidateValue} (baseline: ${exp.baselineValue})`));
          }
        } catch (_) { /* malformed experiment JSON — ignore */ }
      }

      stats[campaign.id].resolvedSettings = resolvedSettings;

      console.log(chalk.dim(`[bot] ${campaign.id} settings: confidence_threshold=${resolvedSettings.confidence_threshold} max_comments=${resolvedSettings.max_comments_per_post} max_replies_per_hour=${resolvedSettings.max_replies_per_hour} min_gap=${resolvedSettings.min_seconds_between_replies}s post_age_days=${resolvedSettings.post_age_days} reply_style="${resolvedSettings.reply_style}"`));

      const campaignSubreddits = campaign.platforms?.reddit || [];
      const discoveredSubs = getDiscoveredSubreddits(campaign.id);
      const allSubreddits = [...new Set([...campaignSubreddits, ...discoveredSubs])];

      if (allSubreddits.length === 0) {
        console.warn(chalk.yellow(`[bot] Campaign ${campaign.id} has no reddit subreddits, skipping`));
        continue;
      }

      const page = await openNewTab(browser, null);
      const newlyFlagged = [];

      try {
        // Retry any queued replies from previous failed attempts
        const pending = getPendingReplies(campaign.id, 10);
        if (pending.length > 0) {
          console.log(chalk.cyan(`[bot] Retrying ${pending.length} queued replies for ${campaign.id}`));
          for (const p of pending) {
            const rl = isRateLimited(campaign.id, resolvedSettings);
            if (rl.limited) break;
            if (hasRepliedToComment(p.comment_url)) { clearPendingReply(p.comment_url); continue; }
            try {
              await postReply(page, p.comment_url, p.reply_text, { dryRun });
              logReply(campaign.id, p.post_url, p.comment_url, p.reply_text);
              markPendingPosted(p.comment_url);
              stats[campaign.id].repliesPosted++;
              console.log(chalk.green(`[bot] Queued reply posted: ${p.comment_url.slice(-50)}`));
            } catch (err) {
              markPendingFailed(p.comment_url, err.message);
              console.warn(chalk.yellow(`[bot] Queued reply still failing (attempt ${p.retry_count + 1}): ${err.message}`));
            }
            await sleep(2000);
          }
        }

        for (const subreddit of allSubreddits) {
          if (isSubredditFlagged(campaign.id, subreddit)) {
            console.log(chalk.red(`[bot] Skipping flagged subreddit: ${subreddit}`));
            stats[campaign.id].flaggedSubreddits.push(subreddit);
            continue;
          }

          stats[campaign.id].subredditsScanned++;
          console.log(chalk.blue(`[bot] Scraping ${subreddit} for campaign: ${campaign.id}`));

          let posts;
          try {
            posts = await scrapeSubreddit(page, subreddit);
          } catch (err) {
            console.warn(chalk.yellow(`[bot] scrapeSubreddit error for ${subreddit}: ${err.message}`));
            continue;
          }

          const maxAgeSeconds = resolvedSettings.post_age_days * 86400;
          const nowSeconds = Math.floor(Date.now() / 1000);
          const freshPosts = posts.filter(p => !p.postedAt || (nowSeconds - p.postedAt) <= maxAgeSeconds);
          const filteredByAge = posts.length - freshPosts.length;
          if (filteredByAge > 0) {
            console.log(chalk.dim(`[bot] ${subreddit}: filtered ${filteredByAge} posts older than ${resolvedSettings.post_age_days}d`));
          }
          const newPosts = freshPosts.filter(p => !hasSeenPost(p.url));
          console.log(chalk.gray(`[bot] ${subreddit}: ${posts.length} posts, ${newPosts.length} new`));

          const beforeComments = stats[campaign.id].commentsChecked;
          const beforeMatches = stats[campaign.id].matchesFound;

          await processNewPosts(browser, page, newPosts, campaign, stats, dryRun, resolvedSettings, scanOnly);

          // Human-like pause before moving to next subreddit
          await betweenPages();

          const deltaComments = stats[campaign.id].commentsChecked - beforeComments;
          const deltaMatches = stats[campaign.id].matchesFound - beforeMatches;

          updateSubredditStats(campaign.id, subreddit, {
            postsFound: posts.length,
            commentsChecked: deltaComments,
            matchesFound: deltaMatches,
          });

          const subRow = getSubredditStats(campaign.id).find(s => s.subreddit === subreddit);
          const FLAG_AFTER_SCANS = 10;
          if (subRow && subRow.scans >= FLAG_AFTER_SCANS && subRow.matches_found === 0) {
            flagSubreddit(campaign.id, subreddit, `no_matches_after_${FLAG_AFTER_SCANS}_scans`);
            console.log(chalk.red(`[bot] Auto-flagged ${subreddit}: no matches after ${subRow.scans} scans`));
            stats[campaign.id].flaggedSubreddits.push(subreddit);
            newlyFlagged.push(subreddit);
          }
        }

        // Proactive subreddit discovery — always expand the list if room remains
        const MAX_SUBREDDITS = 20;
        const currentSubCount = allSubreddits.length;
        if (currentSubCount < MAX_SUBREDDITS) {
          const reason = newlyFlagged.length > 0
            ? `replacing ${newlyFlagged.length} flagged`
            : `expanding from ${currentSubCount}`;
          console.log(chalk.cyan(`[bot] Discovering new subreddits (${reason})...`));
          let discovered = [];
          try {
            discovered = await discoverSubreddits(browser, campaign, newlyFlagged, allSubreddits);
          } catch (err) {
            console.warn(chalk.yellow(`[bot] discoverSubreddits error: ${err.message}`));
          }
          for (const sub of discovered) {
            addDiscoveredSubreddit(campaign.id, sub, 'groq');
          }
          if (discovered.length > 0) {
            console.log(chalk.cyan(`[bot] Queued ${discovered.length} new subreddits: ${discovered.join(', ')}`));
            stats[campaign.id].newSubredditsDiscovered = discovered;
          }
        }

        // Load discovered keywords from DB (persisted across runs)
        let discoveredKeywords = [];
        const savedKeywords = getCampaignSetting(campaign.id, 'discovered_keywords', null);
        if (savedKeywords) {
          try { discoveredKeywords = JSON.parse(savedKeywords); } catch {}
        }
        const baseKeywords = campaign.pain_points || [];
        const allKeywords = [...new Set([...baseKeywords, ...discoveredKeywords])];
        const keywords = allKeywords.slice(0, 6);
        for (const keyword of keywords) {
          console.log(chalk.blue(`[bot] Keyword search: "${keyword}" for campaign: ${campaign.id}`));

          let searchPosts;
          try {
            searchPosts = await scrapeRedditSearch(page, keyword);
          } catch (err) {
            console.warn(chalk.yellow(`[bot] scrapeRedditSearch error for "${keyword}": ${err.message}`));
            continue;
          }

          const maxAgeSeconds = resolvedSettings.post_age_days * 86400;
          const nowSeconds = Math.floor(Date.now() / 1000);
          const freshSearchPosts = searchPosts.filter(p => !p.postedAt || (nowSeconds - p.postedAt) <= maxAgeSeconds);
          const filteredByAge = searchPosts.length - freshSearchPosts.length;
          if (filteredByAge > 0) {
            console.log(chalk.dim(`[bot] Keyword "${keyword}": filtered ${filteredByAge} posts older than ${resolvedSettings.post_age_days}d`));
          }
          const newSearchPosts = freshSearchPosts.filter(p => !hasSeenPost(p.url));
          console.log(chalk.gray(`[bot] Keyword "${keyword}": ${searchPosts.length} posts, ${newSearchPosts.length} new`));

          const rateLimited = await processNewPosts(browser, page, newSearchPosts, campaign, stats, dryRun, resolvedSettings, scanOnly);
          if (rateLimited) break;

          // Human-like pause between keyword searches
          await betweenPages();
        }

        // Discover new keywords for future runs (cap at 20 total)
        const MAX_KEYWORDS = 20;
        if (allKeywords.length < MAX_KEYWORDS) {
          console.log(chalk.cyan(`[bot] Discovering new search keywords (have ${allKeywords.length})...`));
          try {
            const newKw = await discoverKeywords(campaign, allKeywords);
            if (newKw.length > 0) {
              const merged = [...new Set([...discoveredKeywords, ...newKw])].slice(0, MAX_KEYWORDS - baseKeywords.length);
              setCampaignSetting(campaign.id, 'discovered_keywords', JSON.stringify(merged), { reason: 'keyword_discovery' });
              console.log(chalk.cyan(`[bot] Saved ${newKw.length} new keywords: ${newKw.join(', ')}`));
            }
          } catch (err) {
            console.warn(chalk.yellow(`[bot] discoverKeywords error: ${err.message}`));
          }
        }
      } finally {
        await closePage(page);
      }

      // Process non-Reddit platforms (Quora, BlueSky, LinkedIn, Instagram, Twitter, Threads)
      try {
        await processOtherPlatforms(browser, campaign, stats, dryRun, resolvedSettings);
      } catch (err) {
        console.warn(chalk.yellow(`[bot] processOtherPlatforms error: ${err.message}`));
      }

      recordRunStats(campaign.id, stats[campaign.id], resolvedSettings);

      const recentStats = getRecentRunStats(campaign.id, 3);
      const decisions = tuneCampaign(campaign.id, resolvedSettings, recentStats);
      stats[campaign.id].tuningChanges = decisions;
      for (const d of decisions) {
        if (d.type === 'applied') {
          console.log(chalk.yellow(`[bot] Auto-tuned ${d.parameter}: ${d.oldValue} → ${d.newValue} (ratio: ${(d.ratio * 100).toFixed(1)}%, n=${d.commentsChecked})`));
        } else if (d.type === 'reverted') {
          console.log(chalk.yellow(`[bot] Auto-tuner reverted ${d.parameter}: ${d.oldValue} → ${d.newValue} (ratio: ${(d.ratio * 100).toFixed(1)}%, n=${d.commentsChecked})`));
        } else if (d.type === 'subreddit_flagged') {
          console.log(chalk.yellow(`[bot] Auto-tuner flagged subreddit: ${d.subreddit} (ratio: ${(d.ratio * 100).toFixed(1)}%, n=${d.commentsChecked})`));
        } else if (d.type === 'proposed') {
          if (d.parameter === 'subreddit_set') {
            console.log(chalk.yellow(`[bot] Auto-tuner proposed: ${d.action}`));
          } else {
            console.log(chalk.yellow(`[bot] Auto-tuner proposed: ${d.parameter} = ${d.candidateValue} (current: ${d.currentValue})`));
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  printSummary(stats, dryRun);

  const finishedAt = Date.now();
  const runsDir = path.join(__dirname, '..', 'data', 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const report = {
    startedAt,
    finishedAt,
    dryRun,
    totalPostsScanned: Object.values(stats).reduce((a, s) => a + s.postsScanned, 0),
    totalCommentsChecked: Object.values(stats).reduce((a, s) => a + s.commentsChecked, 0),
    totalMatchesFound: Object.values(stats).reduce((a, s) => a + s.matchesFound, 0),
    totalRepliesPosted: Object.values(stats).reduce((a, s) => a + s.repliesPosted, 0),
    injectionAttempts: Object.values(stats).reduce((a, s) => a + s.injectionAttempts, 0),
    newSubredditsDiscovered: Object.values(stats).reduce((a, s) => a + s.newSubredditsDiscovered.length, 0),
    campaigns: Object.entries(stats).map(([id, s]) => ({
      id,
      subredditsScanned: s.subredditsScanned,
      postsScanned: s.postsScanned,
      commentsChecked: s.commentsChecked,
      matchesFound: s.matchesFound,
      repliesPosted: s.repliesPosted,
      flaggedSubreddits: s.flaggedSubreddits,
      discoveredSubreddits: s.newSubredditsDiscovered,
      tuningChanges: s.tuningChanges,
      matchRatio: s.commentsChecked > 0 ? s.matchesFound / s.commentsChecked : 0,
      resolvedSettings: s.resolvedSettings,
    })),
  };
  const reportPath = path.join(runsDir, `run-${startedAt}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(chalk.gray(`[bot] Run report saved: ${reportPath}`));
}

function printSummary(stats, dryRun) {
  console.log('\n' + chalk.bold('=== Run Summary' + (dryRun ? ' (DRY RUN)' : '') + ' ==='));
  const COL = [20, 8, 10, 9, 9, 8];
  const headers = ['Campaign', 'Posts', 'Comments', 'Matches', 'Replies', 'Skipped'];
  console.log(chalk.bold(headers.map((h, i) => h.padEnd(COL[i])).join('')));
  for (const [id, s] of Object.entries(stats)) {
    const row = [id, s.postsScanned, s.commentsChecked, s.matchesFound, s.repliesPosted, s.skipped];
    console.log(row.map((v, i) => String(v).padEnd(COL[i])).join(''));
    if (s.flaggedSubreddits && s.flaggedSubreddits.length > 0) {
      console.log(chalk.red(`  [FLAGGED] ${s.flaggedSubreddits.join(', ')}`));
    }
    if (s.newSubredditsDiscovered && s.newSubredditsDiscovered.length > 0) {
      console.log(chalk.cyan(`  [DISCOVERED] ${s.newSubredditsDiscovered.join(', ')}`));
    }
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

module.exports = { runBot, postQueue };
