'use strict';

async function postReply(page, commentUrl, replyText, options = {}) {
  const dryRun = options.dryRun === true;

  let response;
  try {
    response = await page.goto(commentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    throw new Error(`Navigation failed: ${err.message}`);
  }

  if (response) {
    const status = response.status();
    if (status === 429) throw new Error('Rate limited by Reddit');
    if (status === 404) throw new Error('Comment not found (404)');
  }

  await page.waitForTimeout(1500 + Math.random() * 1000);

  const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  const bodyLower = bodyText.toLowerCase();

  if (bodyLower.includes('you are doing that too much')) {
    throw new Error('Rate limited by Reddit');
  }

  if (
    bodyLower.includes('this post is locked') ||
    bodyLower.includes('comments are locked') ||
    bodyLower.includes('this thread is archived')
  ) {
    throw new Error('Post is locked or archived');
  }

  // Extract comment ID from URL to locate the specific comment element
  const urlParts = commentUrl.replace(/\/$/, '').split('/').filter(Boolean);
  const rawCommentId = urlParts[urlParts.length - 1];
  const thingId = `t1_${rawCommentId}`;

  // Count inputs before clicking Reply so we can detect when the reply box appears
  const beforeInputCount = await page
    .locator('textarea, div[contenteditable="true"]')
    .count()
    .catch(() => 0);

  let replyClicked = false;

  // New Reddit (shreddit): find comment by thingid, click its Reply button
  const shredditSel = `shreddit-comment[thingid="${thingId}"]`;
  if ((await page.locator(shredditSel).count().catch(() => 0)) > 0) {
    const replyBtn = page
      .locator(shredditSel)
      .first()
      .locator('button', { hasText: /^reply$/i });
    if ((await replyBtn.count().catch(() => 0)) > 0) {
      await replyBtn.first().click({ timeout: 5000 });
      replyClicked = true;
    }
  }

  // Old Reddit: find comment by data-fullname, click its reply link
  if (!replyClicked) {
    const oldSel = `.comment[data-fullname="${thingId}"]`;
    if ((await page.locator(oldSel).count().catch(() => 0)) > 0) {
      const replyLink = page.locator(`${oldSel} .reply-button a`).first();
      if ((await replyLink.count().catch(() => 0)) > 0) {
        await replyLink.click({ timeout: 5000 });
        replyClicked = true;
      }
    }
  }

  // Fallback: first visible Reply button on page
  if (!replyClicked) {
    const anyReply = page.locator('button', { hasText: /^reply$/i }).first();
    try {
      await anyReply.waitFor({ state: 'visible', timeout: 5000 });
      await anyReply.click();
      replyClicked = true;
    } catch {
      if ((await page.locator('a[href*="/login"]').count().catch(() => 0)) > 0) {
        throw new Error('Not logged in to Reddit');
      }
      throw new Error('Reply button not found — post may be locked');
    }
  }

  // Wait for a new textarea or contenteditable div to appear (the reply box)
  let replyInput;
  try {
    await page.waitForFunction(
      (prev) =>
        document.querySelectorAll('textarea, div[contenteditable="true"]').length > prev,
      beforeInputCount,
      { timeout: 10000 }
    );

    const inputs = page.locator('textarea, div[contenteditable="true"]');
    const inputCount = await inputs.count();
    replyInput = inputs.nth(inputCount - 1);
  } catch {
    if ((await page.locator('a[href*="/login"]').count().catch(() => 0)) > 0) {
      throw new Error('Not logged in to Reddit');
    }
    throw new Error('Reply textarea did not appear after clicking Reply');
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would post: ${replyText}`);
    return;
  }

  await replyInput.click();
  await page.keyboard.type(replyText, { delay: 60 });
  await page.waitForTimeout(300);

  // Click Save/Comment submit button (last one on page — the newly appeared form's button)
  const saveBtn = page
    .locator('button[type="submit"], button.save')
    .last();
  try {
    await saveBtn.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // Fall back to text-based match
    const textBtn = page.locator('button').filter({ hasText: /^(save|comment)$/i }).last();
    await textBtn.waitFor({ state: 'visible', timeout: 5000 });
    await textBtn.click();
    await page.waitForTimeout(2000);
    return;
  }
  await saveBtn.click();

  await page.waitForTimeout(2000);

  const afterBodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
  if (afterBodyText.toLowerCase().includes('you are doing that too much')) {
    throw new Error('Rate limited by Reddit after posting');
  }
}

module.exports = { postReply };
