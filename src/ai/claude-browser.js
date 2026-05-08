const DEFAULT_AI_URL = 'https://claude.ai/new';

const INPUT_SELECTORS = [
  'div[contenteditable="true"]',
  '[data-testid="chat-input"]',
  '#prompt-textarea',
  'textarea',
];

const RESPONSE_SELECTORS = [
  '[data-testid="assistant-message"]',
  '.message.assistant .text',
  '[data-message-author-role="assistant"]',
  '.markdown',
];

async function findInput(page) {
  for (const selector of INPUT_SELECTORS) {
    try {
      await page.waitForSelector(selector, { timeout: 2000 });
      return selector;
    } catch {
      // try next
    }
  }
  return null;
}

async function extractResponse(page) {
  for (const selector of RESPONSE_SELECTORS) {
    try {
      const el = page.locator(selector).last();
      const count = await el.count();
      if (count > 0) {
        const text = await el.innerText();
        if (text && text.trim().length > 0) return text.trim();
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function askClaude(browser, promptText, aiUrl = DEFAULT_AI_URL) {
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(aiUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    await page.close();
    throw new Error('AI_NAV_TIMEOUT');
  }

  const inputSelector = await findInput(page);
  if (!inputSelector) {
    await page.close();
    throw new Error('AI_INPUT_NOT_FOUND');
  }

  await page.click(inputSelector);

  if (promptText.length > 500) {
    await page.evaluate(text => navigator.clipboard.writeText(text), promptText);
    await page.keyboard.down('Meta');
    await page.keyboard.press('v');
    await page.keyboard.up('Meta');
    await page.waitForTimeout(300);
  } else {
    await page.keyboard.type(promptText, { delay: 80 });
  }

  await page.keyboard.press('Enter');

  // Wait for response to start appearing
  const responseStartDeadline = Date.now() + 60000;
  let responseStarted = false;
  while (Date.now() < responseStartDeadline) {
    const text = await extractResponse(page);
    if (text && text.length > 0) {
      responseStarted = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!responseStarted) {
    await page.close();
    throw new Error('AI_RESPONSE_TIMEOUT');
  }

  // Wait for response to stop streaming (stable for 3 consecutive 1.5s polls)
  let stableCount = 0;
  let lastText = '';
  const streamDeadline = Date.now() + 60000;
  while (Date.now() < streamDeadline) {
    await page.waitForTimeout(1500);
    const text = await extractResponse(page);
    if (text === lastText) {
      stableCount++;
      if (stableCount >= 3) break;
    } else {
      stableCount = 0;
      lastText = text || '';
    }
  }

  const finalText = await extractResponse(page);
  await page.close();

  if (!finalText || finalText.trim().length === 0) {
    throw new Error('AI_EMPTY_RESPONSE');
  }

  return finalText.trim();
}

module.exports = { askClaude };
