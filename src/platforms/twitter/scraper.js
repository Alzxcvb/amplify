'use strict';

const { afterPageLoad, scrollPause } = require('../../browser/human');

async function scrapeTwitterSearch(page, query, limit = 20) {
  const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(query)}&f=live`;

  let response;
  try {
    response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[twitter] Navigation failed for "${query}": ${err.message}`);
    return [];
  }

  const currentUrl = page.url();
  if (currentUrl.includes('/i/flow/login') || currentUrl.includes('twitter.com/login')) {
    console.warn(`[twitter] Login wall — must be logged into X/Twitter via Chrome CDP`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 429) { console.warn(`[twitter] Rate limited on "${query}"`); return []; }
  }

  try {
    await page.locator('[data-testid="tweet"]').first().waitFor({ timeout: 12000 });
  } catch {
    console.warn(`[twitter] No tweets found for "${query}"`);
    return [];
  }

  await afterPageLoad();

  const preScrollUrl = page.url();
  for (let i = 0; i < 3; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 1200)); } catch { break; }
    await scrollPause();
    if (page.url() !== preScrollUrl) break;
  }

  let posts;
  try {
    posts = await page.evaluate((LIMIT) => {
      const results = [];
      const tweets = document.querySelectorAll('[data-testid="tweet"]');
      for (const tweet of tweets) {
        if (results.length >= LIMIT) break;

        // Skip ads
        if (tweet.querySelector('[data-testid="promotedIndicator"]')) continue;

        const textEl = tweet.querySelector('[data-testid="tweetText"]');
        const body = textEl?.textContent?.trim() || '';
        if (body.length < 20) continue;

        const authorEl = tweet.querySelector('[data-testid="User-Name"] a');
        const author = authorEl?.textContent?.trim() || '';
        const profileHref = authorEl?.getAttribute('href') || '';

        const timeEl = tweet.querySelector('time');
        const dateStr = timeEl?.getAttribute('datetime') || '';
        const postedAt = dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : null;

        const tweetLinkEl = tweet.querySelector('a[href*="/status/"]');
        const tweetPath = tweetLinkEl?.getAttribute('href') || profileHref;
        const url = tweetPath.startsWith('http') ? tweetPath : `https://twitter.com${tweetPath}`;

        results.push({
          id: url,
          url,
          title: '',
          body,
          author,
          profileUrl: profileHref ? `https://twitter.com${profileHref}` : '',
          platform: 'twitter',
          subreddit: 'twitter',
          postedAt,
        });
      }
      return results;
    }, limit);
  } catch (err) {
    if (err.message.includes('Execution context was destroyed')) {
      console.warn(`[twitter] Context destroyed during evaluate on "${query}"`);
      return [];
    }
    throw err;
  }

  return posts || [];
}

// Extract trending hashtags from Twitter trending page
async function scrapeTwitterTrends(page) {
  const url = 'https://twitter.com/explore/tabs/trending';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[twitter] Trending page failed: ${err.message}`);
    return [];
  }

  if (page.url().includes('/i/flow/login')) {
    console.warn(`[twitter] Login wall on trending page`);
    return [];
  }

  try {
    await page.locator('[data-testid="trend"]').first().waitFor({ timeout: 10000 });
  } catch {
    console.warn(`[twitter] No trending topics found`);
    return [];
  }

  await afterPageLoad();

  let trends;
  try {
    trends = await page.evaluate(() => {
      const results = [];
      const trendEls = document.querySelectorAll('[data-testid="trend"]');
      for (const el of trendEls) {
        const topic = el.querySelector('[dir="ltr"]')?.textContent?.trim() || '';
        const count = el.querySelector('[aria-label]')?.textContent?.trim() || '';
        if (topic) results.push({ topic, count });
      }
      return results;
    });
  } catch {
    return [];
  }

  return trends || [];
}

module.exports = { scrapeTwitterSearch, scrapeTwitterTrends };
