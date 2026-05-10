'use strict';

const { afterPageLoad, scrollPause } = require('../../browser/human');

async function scrapeThreadsSearch(page, query, limit = 20) {
  const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=default`;

  let response;
  try {
    response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[threads] Navigation failed for "${query}": ${err.message}`);
    return [];
  }

  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/accounts/login')) {
    console.warn(`[threads] Login wall — must be logged into Threads via Chrome CDP`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 429) { console.warn(`[threads] Rate limited on "${query}"`); return []; }
  }

  try {
    await page.locator('article, [class*="x1lliihq"]').first().waitFor({ timeout: 12000 });
  } catch {
    console.warn(`[threads] No results for "${query}"`);
    return [];
  }

  await afterPageLoad();

  const preScrollUrl = page.url();
  for (let i = 0; i < 2; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 1000)); } catch { break; }
    await scrollPause();
    if (page.url() !== preScrollUrl) break;
  }

  let posts;
  try {
    posts = await page.evaluate((LIMIT) => {
      const results = [];
      const articles = document.querySelectorAll('article');
      for (const article of articles) {
        if (results.length >= LIMIT) break;

        const textEl = article.querySelector('[dir="auto"]');
        const body = textEl?.textContent?.trim() || '';
        if (body.length < 20) continue;

        const authorEl = article.querySelector('a[href*="/@"]');
        const author = authorEl?.textContent?.trim() || '';
        const profilePath = authorEl?.getAttribute('href') || '';

        const postLinkEl = article.querySelector('a[href*="/post/"]');
        const postPath = postLinkEl?.getAttribute('href') || profilePath;
        const url = postPath.startsWith('http') ? postPath : `https://www.threads.net${postPath}`;

        results.push({
          id: url,
          url,
          title: '',
          body,
          author,
          profileUrl: profilePath ? `https://www.threads.net${profilePath}` : '',
          platform: 'threads',
          subreddit: 'threads',
          postedAt: null,
        });
      }
      return results;
    }, limit);
  } catch (err) {
    if (err.message.includes('Execution context was destroyed')) {
      console.warn(`[threads] Context destroyed during evaluate on "${query}"`);
      return [];
    }
    throw err;
  }

  return posts || [];
}

module.exports = { scrapeThreadsSearch };
