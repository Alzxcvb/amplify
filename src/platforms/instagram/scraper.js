'use strict';

const { afterPageLoad, scrollPause } = require('../../browser/human');

// Scrape Instagram hashtag page for trending posts/signals
async function scrapeInstagramHashtag(page, hashtag) {
  const tag = hashtag.replace(/^#/, '');
  const url = `https://www.instagram.com/explore/tags/${tag}/`;

  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[instagram] Navigation failed for #${tag}: ${err.message}`);
    return { hashtag: tag, postCount: 0, topPosts: [] };
  }

  if (response) {
    const status = response.status();
    if (status === 404) { console.warn(`[instagram] Hashtag not found: #${tag}`); return { hashtag: tag, postCount: 0, topPosts: [] }; }
    if (status === 429) { console.warn(`[instagram] Rate limited on #${tag}`); return { hashtag: tag, postCount: 0, topPosts: [] }; }
  }

  const currentUrl = page.url();
  if (currentUrl.includes('/accounts/login')) {
    console.warn(`[instagram] Login wall on #${tag} — must be logged in via Chrome CDP`);
    return { hashtag: tag, postCount: 0, topPosts: [] };
  }

  try {
    await page.locator('article, [class*="_aagv"]').first().waitFor({ timeout: 10000 });
  } catch {
    console.warn(`[instagram] No posts found for #${tag}`);
    return { hashtag: tag, postCount: 0, topPosts: [] };
  }

  await afterPageLoad();

  let result;
  try {
    result = await page.evaluate(() => {
      // Post count from header
      const headerText = document.querySelector('header')?.textContent || '';
      const countMatch = headerText.match(/([\d,.]+[KMB]?)\s*posts?/i);
      const postCount = countMatch ? countMatch[1] : '?';

      // Top post captions
      const articles = document.querySelectorAll('article');
      const topPosts = [];
      for (const article of articles) {
        if (topPosts.length >= 6) break;
        const img = article.querySelector('img');
        const alt = img?.getAttribute('alt') || '';
        if (alt && alt.length > 10) topPosts.push(alt.slice(0, 200));
      }

      return { postCount, topPosts };
    });
  } catch (err) {
    console.warn(`[instagram] Evaluate failed for #${tag}: ${err.message}`);
    return { hashtag: tag, postCount: 0, topPosts: [] };
  }

  return { hashtag: tag, postCount: result.postCount, topPosts: result.topPosts };
}

// Monitor a list of hashtags and return trend signals
async function scrapeInstagramTrends(page, hashtags) {
  const trends = [];
  for (const hashtag of hashtags) {
    const result = await scrapeInstagramHashtag(page, hashtag);
    if (result.postCount !== 0) {
      trends.push(result);
    }
    // Human pause between hashtag pages
    await scrollPause();
  }
  return trends;
}

module.exports = { scrapeInstagramHashtag, scrapeInstagramTrends };
