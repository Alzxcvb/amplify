const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE_DIR = path.join(os.homedir(), '.amplify-browser-profile');

async function connectBrowser() {
  // Remove stale lock file left by a previously crashed Chrome instance
  const lockFile = path.join(PROFILE_DIR, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch {}
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return context;
}

// For persistent context, context IS the browser — pages come from it directly
async function openNewTab(browser, url) {
  const page = await browser.newPage();
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  return page;
}

async function closePage(page) {
  await page.close();
}

module.exports = { connectBrowser, openNewTab, closePage, PROFILE_DIR };
