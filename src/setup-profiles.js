'use strict';

require('dotenv').config();
const readline = require('readline');
const { connectBrowser, openNewTab } = require('./browser/connector');

const SITES = [
  { name: 'Reddit',    url: 'https://www.reddit.com/login' },
  { name: 'LinkedIn',  url: 'https://www.linkedin.com/login' },
  { name: 'Quora',     url: 'https://www.quora.com/login' },
  { name: 'Twitter/X', url: 'https://twitter.com/i/flow/login' },
  { name: 'Threads',   url: 'https://www.threads.net/login' },
  { name: 'Instagram', url: 'https://www.instagram.com/accounts/login' },
];

async function main() {
  console.log('Opening the bot browser profile...');
  console.log('Log into each site, then press Enter here to save and close.\n');

  const browser = await connectBrowser();

  for (const site of SITES) {
    const page = await openNewTab(browser, site.url);
    console.log(`Opened ${site.name} — log in now.`);
    await page.waitForTimeout(500);
  }

  console.log('\nAll tabs open. Log in to each one, then press Enter to save and exit.');
  await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => { rl.close(); resolve(); });
  });

  await browser.close();
  console.log('Done. Sessions saved. Run the bot now:');
  console.log('  node src/index.js --scan-only --loop --interval=20');
}

main().catch(err => { console.error(err.message); process.exit(1); });
