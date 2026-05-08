const { chromium } = require('playwright');

const CDP_URL = 'http://localhost:9222';

async function connectBrowser() {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    return browser;
  } catch (err) {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
      throw new Error(
        'Cannot connect to Chrome. Start Chrome with remote debugging:\n' +
        '  open -a "Google Chrome" --args --remote-debugging-port=9222\n' +
        '  (or use the chrome-cdp alias)'
      );
    }
    throw err;
  }
}

async function openNewTab(browser, url) {
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  return page;
}

async function closePage(page) {
  await page.close();
}

module.exports = { connectBrowser, openNewTab, closePage };
