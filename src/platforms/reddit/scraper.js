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

        let postedAt = null;
        const createdTs = el.getAttribute('created-timestamp');
        if (createdTs) {
          const ts = Math.floor(new Date(createdTs).getTime() / 1000);
          if (!isNaN(ts)) postedAt = ts;
        }
        if (!postedAt) {
          const timeEl = el.querySelector('time[datetime]');
          if (timeEl) {
            const ts = Math.floor(new Date(timeEl.getAttribute('datetime')).getTime() / 1000);
            if (!isNaN(ts)) postedAt = ts;
          }
        }

        if (title && postUrl) {
          results.push({ title, url: postUrl, id: postId, subreddit, postedAt });
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

        const timeEl = el.querySelector('time[datetime]');
        let postedAt = null;
        if (timeEl) {
          const ts = Math.floor(new Date(timeEl.getAttribute('datetime')).getTime() / 1000);
          if (!isNaN(ts)) postedAt = ts;
        }

        if (title && postUrl) {
          results.push({ title, url: postUrl, id: postId, subreddit, postedAt });
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

async function scrapePostComments(page, postUrl, limit = 25) {
  let response;
  try {
    response = await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[scraper] Navigation failed for ${postUrl}: ${err.message}`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 404) {
      console.warn(`[scraper] Post not found: ${postUrl}`);
      return [];
    }
    if (status === 429) {
      console.warn(`[scraper] Rate limited: ${postUrl}`);
      return [];
    }
  }

  const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  if (bodyText.toLowerCase().includes('you are doing that too much')) {
    console.warn(`[scraper] Rate limited on ${postUrl}`);
    return [];
  }

  // Wait for comments to load (or accept that there are none)
  try {
    await page.locator('shreddit-comment, .comment').first().waitFor({ timeout: 15000 });
  } catch {
    return [];
  }

  await page.waitForTimeout(1000 + Math.random() * 1500);

  const comments = await page.evaluate((LIMIT) => {
    const results = [];
    const SKIP_AUTHORS = new Set(['[deleted]', '[removed]', 'automoderator']);

    const shredditComments = document.querySelectorAll('shreddit-comment');
    if (shredditComments.length > 0) {
      for (const el of shredditComments) {
        if (results.length >= LIMIT) break;

        // Only top-level comments (depth 0); skip if explicitly nested
        const depth = el.getAttribute('depth');
        if (depth !== null && depth !== '0') continue;

        const author = (el.getAttribute('author') || '').trim();
        if (!author || SKIP_AUTHORS.has(author.toLowerCase())) continue;

        let commentUrl = el.getAttribute('permalink') || el.getAttribute('content-href') || '';
        if (commentUrl && !commentUrl.startsWith('http')) {
          commentUrl = 'https://www.reddit.com' + commentUrl;
        }

        const bodyEl = el.querySelector('[slot="comment"]')
          || el.querySelector('.md')
          || el.querySelector('p');
        const body = bodyEl?.textContent?.trim() || '';
        if (!body || body === '[deleted]' || body === '[removed]') continue;

        results.push({ author, body, url: commentUrl });
      }
    }

    // Fall back to old Reddit selectors
    if (results.length === 0) {
      const commentDivs = document.querySelectorAll('.comment');
      for (const el of commentDivs) {
        if (results.length >= LIMIT) break;

        // Skip nested comments (parent is inside another .comment)
        if (el.parentElement?.closest('.comment')) continue;

        const authorEl = el.querySelector('a.author');
        const author = (authorEl?.textContent?.trim() || '');
        if (!author || SKIP_AUTHORS.has(author.toLowerCase())) continue;

        const bodyEl = el.querySelector('.usertext-body .md');
        const body = bodyEl?.textContent?.trim() || '';
        if (!body || body === '[deleted]' || body === '[removed]') continue;

        const linkEl = el.querySelector('a.bylink');
        let commentUrl = linkEl?.getAttribute('href') || '';
        if (commentUrl && !commentUrl.startsWith('http')) {
          commentUrl = 'https://www.reddit.com' + commentUrl;
        }

        results.push({ author, body, url: commentUrl });
      }
    }

    return results;
  }, limit);

  return comments;
}

async function scrapeRedditSearch(page, query) {
  const searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=new&t=week`;

  let response;
  try {
    response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[scraper] Navigation failed for search "${query}": ${err.message}`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 429) {
      console.warn(`[scraper] Rate limited on search "${query}"`);
      return [];
    }
  }

  const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  if (bodyText.toLowerCase().includes('you are doing that too much')) {
    console.warn(`[scraper] Rate limited on search "${query}"`);
    return [];
  }

  try {
    await page.locator('shreddit-post, [data-testid="post-container"]').first().waitFor({ timeout: 10000 });
  } catch {
    console.warn(`[scraper] No search results found for "${query}"`);
    return [];
  }

  await page.waitForTimeout(1000 + Math.random() * 2000);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1500);
  }

  const posts = await page.evaluate(() => {
    const results = [];

    const shredditPosts = document.querySelectorAll('shreddit-post');
    if (shredditPosts.length > 0) {
      shredditPosts.forEach(el => {
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

        // Extract subreddit from permalink or subreddit-prefixed-name attribute
        let subreddit = el.getAttribute('subreddit-prefixed-name')
          || el.getAttribute('subreddit')
          || '';
        if (!subreddit && postUrl) {
          const m = postUrl.match(/\/r\/([^/]+)\//);
          if (m) subreddit = m[1];
        }

        let postedAt = null;
        const createdTs = el.getAttribute('created-timestamp');
        if (createdTs) {
          const ts = Math.floor(new Date(createdTs).getTime() / 1000);
          if (!isNaN(ts)) postedAt = ts;
        }
        if (!postedAt) {
          const timeEl = el.querySelector('time[datetime]');
          if (timeEl) {
            const ts = Math.floor(new Date(timeEl.getAttribute('datetime')).getTime() / 1000);
            if (!isNaN(ts)) postedAt = ts;
          }
        }

        if (title && postUrl) {
          results.push({ title, url: postUrl, id: postId, subreddit, postedAt });
        }
      });
    }

    if (results.length === 0) {
      const containers = document.querySelectorAll('[data-testid="post-container"]');
      containers.forEach(el => {
        if (el.closest('[data-promoted="true"]')) return;
        if (el.classList.contains('promotedlink')) return;

        const titleEl = el.querySelector('h3') || el.querySelector('[data-click-id="text"] h3');
        const title = titleEl?.textContent?.trim() || '';

        const linkEl = el.querySelector('a[data-click-id="body"]')
          || el.querySelector('a[href*="/comments/"]');
        let postUrl = linkEl?.getAttribute('href') || '';
        if (postUrl && !postUrl.startsWith('http')) {
          postUrl = 'https://www.reddit.com' + postUrl;
        }

        const postId = el.getAttribute('data-fullname') || '';

        let subreddit = '';
        if (postUrl) {
          const m = postUrl.match(/\/r\/([^/]+)\//);
          if (m) subreddit = m[1];
        }

        const timeEl = el.querySelector('time[datetime]');
        let postedAt = null;
        if (timeEl) {
          const ts = Math.floor(new Date(timeEl.getAttribute('datetime')).getTime() / 1000);
          if (!isNaN(ts)) postedAt = ts;
        }

        if (title && postUrl) {
          results.push({ title, url: postUrl, id: postId, subreddit, postedAt });
        }
      });
    }

    return results;
  });

  if (posts.length === 0) {
    console.warn(`[scraper] No posts scraped for search "${query}"`);
  }

  return posts;
}

module.exports = { scrapeSubreddit, scrapePostComments, scrapeRedditSearch };
