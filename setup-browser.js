/**
 * One-time setup: opens a Chrome window with the amplify profile.
 * Log into Reddit and claude.ai, then press Enter to save and exit.
 */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const readline = require('readline');

const PROFILE_DIR = path.join(os.homedir(), '.amplify-browser-profile');

(async () => {
  console.log('Opening Chrome with amplify profile...');
  console.log('Profile saved at:', PROFILE_DIR);
  console.log('');
  console.log('Please:');
  console.log('  1. Log into https://reddit.com');
  console.log('  2. Log into https://claude.ai');
  console.log('  3. Come back here and press Enter to save and close.');
  console.log('');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const page = await context.newPage();
  await page.goto('https://reddit.com');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press Enter when done logging in... ', resolve));
  rl.close();

  await context.close();
  console.log('Done. Sessions saved. Run the bot anytime with:');
  console.log('  node src/index.js --campaign=arrival-pass --dry-run');
})();
