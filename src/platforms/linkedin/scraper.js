'use strict';

const { afterPageLoad, scrollPause, betweenPages } = require('../../browser/human');

// Search LinkedIn posts for pain-point signals
async function scrapeLinkedInSearch(page, query, limit = 20) {
  const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&sortBy=date_posted`;

  let response;
  try {
    response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[linkedin] Navigation failed for "${query}": ${err.message}`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 429) { console.warn(`[linkedin] Rate limited on "${query}"`); return []; }
    if (status === 999) { console.warn(`[linkedin] Bot-blocked (999) on "${query}"`); return []; }
  }

  // LinkedIn challenge / CAPTCHA check
  const currentUrl = page.url();
  if (currentUrl.includes('/checkpoint/') || currentUrl.includes('/authwall')) {
    console.warn(`[linkedin] Auth wall or checkpoint hit — must be logged in via Chrome CDP`);
    return [];
  }

  try {
    await page.locator('[data-view-name="search-entity-result-universal-template"]').first().waitFor({ timeout: 12000 });
  } catch {
    console.warn(`[linkedin] No results for "${query}" — may need login or query returns nothing`);
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
      const cards = document.querySelectorAll('[data-view-name="search-entity-result-universal-template"]');
      for (const card of cards) {
        if (results.length >= LIMIT) break;

        // Post text
        const textEl = card.querySelector('[class*="feed-shared-update-v2__description"]')
          || card.querySelector('[class*="show-more-less-html__markup"]')
          || card.querySelector('span[dir="ltr"]');
        const body = textEl?.textContent?.trim() || '';
        if (body.length < 30) continue;

        // Author name + profile URL
        const authorEl = card.querySelector('a[href*="/in/"]');
        const profileUrl = authorEl ? (authorEl.getAttribute('href') || '').split('?')[0] : '';
        const name = authorEl?.textContent?.trim() || '';

        // Post URL
        const postLinkEl = card.querySelector('a[href*="/feed/update/"]') || card.querySelector('a[href*="/posts/"]');
        const postUrl = postLinkEl ? (postLinkEl.getAttribute('href') || '').split('?')[0] : profileUrl;

        if (!profileUrl) continue;

        results.push({
          id: postUrl || profileUrl,
          url: postUrl ? `https://www.linkedin.com${postUrl}` : `https://www.linkedin.com${profileUrl}`,
          title: '',
          body,
          author: name,
          profileUrl: profileUrl ? `https://www.linkedin.com${profileUrl}` : '',
          platform: 'linkedin',
          subreddit: 'linkedin',
          postedAt: null,
        });
      }
      return results;
    }, limit);
  } catch (err) {
    if (err.message.includes('Execution context was destroyed')) {
      console.warn(`[linkedin] Context destroyed during evaluate on "${query}"`);
      return [];
    }
    throw err;
  }

  return posts || [];
}

// Prospect mode: search for people by title/keywords, return profile URLs
async function scrapeLinkedInProspects(page, searchQuery, limit = 15) {
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}&network=%5B%22F%22%2C%22S%22%5D`;

  let response;
  try {
    response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[linkedin] Prospect search failed for "${searchQuery}": ${err.message}`);
    return [];
  }

  const currentUrl = page.url();
  if (currentUrl.includes('/checkpoint/') || currentUrl.includes('/authwall')) {
    console.warn(`[linkedin] Auth wall — not logged in`);
    return [];
  }

  try {
    await page.locator('[data-view-name="search-entity-result-universal-template"], .reusable-search__result-container').first().waitFor({ timeout: 12000 });
  } catch {
    console.warn(`[linkedin] No people results for "${searchQuery}"`);
    return [];
  }

  await afterPageLoad();

  const preScrollUrl = page.url();
  for (let i = 0; i < 2; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 1000)); } catch { break; }
    await scrollPause();
    if (page.url() !== preScrollUrl) break;
  }

  let prospects;
  try {
    prospects = await page.evaluate((LIMIT) => {
      const results = [];
      const cards = document.querySelectorAll('[data-view-name="search-entity-result-universal-template"], .reusable-search__result-container li');
      for (const card of cards) {
        if (results.length >= LIMIT) break;

        const profileLink = card.querySelector('a[href*="/in/"]');
        if (!profileLink) continue;
        const profileUrl = (profileLink.getAttribute('href') || '').split('?')[0];
        if (!profileUrl) continue;

        const nameEl = card.querySelector('[aria-hidden="true"]') || card.querySelector('.entity-result__title-text a span');
        const name = nameEl?.textContent?.trim() || '';

        const headlineEl = card.querySelector('.entity-result__primary-subtitle') || card.querySelector('[class*="subtitle"]');
        const headline = headlineEl?.textContent?.trim() || '';

        results.push({
          profileUrl: `https://www.linkedin.com${profileUrl}`,
          name,
          context: headline,
        });
      }
      return results;
    }, limit);
  } catch (err) {
    console.warn(`[linkedin] Evaluate failed for "${searchQuery}": ${err.message}`);
    return [];
  }

  return prospects || [];
}

module.exports = { scrapeLinkedInSearch, scrapeLinkedInProspects };
