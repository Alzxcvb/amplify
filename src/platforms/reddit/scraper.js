'use strict';

async function scrapeSubreddit(page, subredditName) {
  const sub = subredditName.replace(/^r\//, '');
  const url = `https://www.reddit.com/r/${sub}/new/`;

  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[scraper] Navigation failed for r/${sub}: ${err.message}`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 404) {
      console.warn(`[scraper] Subreddit not found: r/${sub}`);
      return [];
    }
    if (status === 429) {
      console.warn(`[scraper] Rate limited on r/${sub}`);
      return [];
    }
  }

  // Check for rate limit message in page body
  const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  if (bodyText.toLowerCase().includes('you are doing that too much')) {
    console.warn(`[scraper] Rate limited on r/${sub}`);
    return [];
  }

  // Wait for post elements (new Reddit shreddit-post or old Reddit post-container)
  try {
    await page.locator('shreddit-post, [data-testid="post-container"]').first().waitFor({ timeout: 10000 });
  } catch {
    console.warn(`[scraper] No post elements found on r/${sub}`);
    return [];
  }

  // Anti-detection delay before scraping
  await page.waitForTimeout(1000 + Math.random() * 2000);

  // Scroll 3 times to load more posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1500);
  }

  const posts = await page.evaluate((subreddit) => {
    const results = [];

    // Try new Reddit shreddit-post elements first
    const shredditPosts = document.querySelectorAll('shreddit-post');
    if (shredditPosts.length > 0) {
      shredditPosts.forEach(el => {
        // Skip promoted/ad posts
        if (el.getAttribute('promoted') !== null) return;
        if (el.getAttribute('data-promoted') === 'true') return;
        if (el.closest('[data-promoted="true"]')) return;

        const title = el.getAttribute('post-title')
          || el.querySelector('[slot="title"]')?.textContent?.trim()
          || el.querySelector('h3')?.textContent?.trim()
          || '';

        let postUrl = el.getAttribute('permalink') || el.getAttribute('content-href') || '';
        if (postUrl && !postUrl.startsWith('http')) {
          postUrl = 'https://www.reddit.com' + postUrl;
        }

        const postId = el.getAttribute('id')
          || el.getAttribute('data-fullname')
          || el.getAttribute('thingid')
          || '';

        if (title && postUrl) {
          results.push({ title, url: postUrl, id: postId, subreddit });
        }
      });
    }

    // Fall back to old Reddit selectors if nothing scraped
    if (results.length === 0) {
      const containers = document.querySelectorAll('[data-testid="post-container"]');
      containers.forEach(el => {
        // Skip promoted/ad posts
        if (el.closest('[data-promoted="true"]')) return;
        if (el.classList.contains('promotedlink')) return;
        if (el.querySelector('.promotedlink')) return;

        const titleEl = el.querySelector('h3')
          || el.querySelector('[data-click-id="text"] h3');
        const title = titleEl?.textContent?.trim() || '';

        const linkEl = el.querySelector('a[data-click-id="body"]')
          || el.querySelector('a[href*="/comments/"]');
        let postUrl = linkEl?.getAttribute('href') || '';
        if (postUrl && !postUrl.startsWith('http')) {
          postUrl = 'https://www.reddit.com' + postUrl;
        }

        const postId = el.getAttribute('data-fullname') || '';

        if (title && postUrl) {
          results.push({ title, url: postUrl, id: postId, subreddit });
        }
      });
    }

    if (results.length === 0) {
      console.warn('[scraper] No posts matched any selector');
    }

    return results;
  }, sub);

  if (posts.length === 0) {
    console.warn(`[scraper] No posts scraped from r/${sub}`);
  }

  return posts;
}

module.exports = { scrapeSubreddit };
