'use strict';

const { afterPageLoad, scrollPause } = require('../../browser/human');

async function scrapeQuoraSearch(page, query) {
  const searchUrl = `https://www.quora.com/search?q=${encodeURIComponent(query)}&type=question`;

  let response;
  try {
    response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[quora] Navigation failed for "${query}": ${err.message}`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 429) { console.warn(`[quora] Rate limited on "${query}"`); return []; }
    if (status === 403) { console.warn(`[quora] Blocked (403) on "${query}"`); return []; }
  }

  const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  if (bodyText.toLowerCase().includes('sign up to view') || bodyText.toLowerCase().includes('captcha')) {
    console.warn(`[quora] Login wall or captcha on "${query}" — skipping`);
    return [];
  }

  try {
    await page.locator('[class*="q-box"][class*="qu-borderBottom"]').first().waitFor({ timeout: 10000 });
  } catch {
    console.warn(`[quora] No results found for "${query}"`);
    return [];
  }

  await afterPageLoad();

  const preScrollUrl = page.url();
  for (let i = 0; i < 2; i++) {
    try { await page.evaluate(() => window.scrollBy(0, 1200)); } catch { break; }
    await scrollPause();
    if (page.url() !== preScrollUrl) break;
  }

  let posts;
  try {
    posts = await page.evaluate(() => {
      const results = [];
      // Quora question links in search results
      const links = document.querySelectorAll('a[href*="/What-"], a[href*="/How-"], a[href*="/Why-"], a[href*="/Is-"], a[href*="/Can-"], a[href*="/Should-"], a[href*="/Are-"], a[href^="/"]');
      const seen = new Set();
      for (const el of links) {
        const href = el.getAttribute('href') || '';
        if (!href.startsWith('/') || href.includes('/profile/') || href.includes('/search') || href.includes('/topic/')) continue;
        const fullUrl = href.startsWith('http') ? href : 'https://www.quora.com' + href;
        if (seen.has(fullUrl)) continue;
        if (href.split('/').length < 2) continue;
        const title = el.textContent?.trim() || '';
        if (title.length < 15) continue;
        seen.add(fullUrl);
        results.push({ title, url: fullUrl, id: fullUrl, subreddit: 'quora', postedAt: null });
        if (results.length >= 20) break;
      }
      return results;
    });
  } catch (err) {
    console.warn(`[quora] Evaluate failed for "${query}": ${err.message}`);
    return [];
  }

  return posts || [];
}

async function scrapeQuoraAnswers(page, questionUrl, limit = 10) {
  let response;
  try {
    response = await page.goto(questionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[quora] Navigation failed for ${questionUrl}: ${err.message}`);
    return [];
  }

  if (response) {
    const status = response.status();
    if (status === 404) { console.warn(`[quora] 404: ${questionUrl}`); return []; }
    if (status === 429) { console.warn(`[quora] Rate limited: ${questionUrl}`); return []; }
  }

  const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  if (bodyText.toLowerCase().includes('sign up to view') || bodyText.toLowerCase().includes('log in')) {
    console.warn(`[quora] Login wall on ${questionUrl}`);
    return [];
  }

  await afterPageLoad();
  await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
  await scrollPause();

  try {
    await page.locator('[class*="qu-textAlign--left"]').first().waitFor({ timeout: 8000 });
  } catch {
    console.warn(`[quora] No answers found on ${questionUrl}`);
    return [];
  }

  let answers;
  try {
    answers = await page.evaluate((LIMIT) => {
      const results = [];
      const SKIP_AUTHORS = new Set(['quora user', 'anonymous']);
      const answerBlocks = document.querySelectorAll('[class*="qu-textAlign--left"]');
      for (const el of answerBlocks) {
        if (results.length >= LIMIT) break;
        const text = el.textContent?.trim() || '';
        if (text.length < 50) continue;
        results.push({ author: 'quora-user', body: text.slice(0, 800), url: window.location.href, commentUrl: window.location.href });
      }
      return results;
    }, limit);
  } catch (err) {
    console.warn(`[quora] Evaluate failed for ${questionUrl}: ${err.message}`);
    return [];
  }

  return answers || [];
}

async function postQuoraAnswer(page, questionUrl, answerText) {
  try {
    await page.goto(questionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    throw new Error(`Quora navigation failed: ${err.message}`);
  }

  await afterPageLoad();

  // Click "Answer" button
  const answerBtn = page.locator('button', { hasText: /^answer$/i }).first();
  try {
    await answerBtn.waitFor({ state: 'visible', timeout: 8000 });
    await answerBtn.click();
  } catch {
    throw new Error('Quora Answer button not found — may not be logged in or question is closed');
  }

  // Wait for editor
  const editor = page.locator('[contenteditable="true"]').last();
  try {
    await editor.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    throw new Error('Quora answer editor did not appear');
  }

  await editor.click();
  await page.keyboard.type(answerText, { delay: 55 });
  await page.waitForTimeout(400);

  // Submit
  const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /^(submit|post|answer)$/i }).last();
  try {
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
    await submitBtn.click();
  } catch {
    throw new Error('Quora submit button not found');
  }

  await page.waitForTimeout(1500);
}

module.exports = { scrapeQuoraSearch, scrapeQuoraAnswers, postQuoraAnswer };
