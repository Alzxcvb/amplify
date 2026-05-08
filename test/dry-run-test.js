'use strict';

const chalk = require('chalk');
const { loadCampaigns } = require('../src/campaigns/loader');
const { getDb } = require('../src/state/db');
const { connectBrowser, openNewTab, closePage } = require('../src/browser/connector');
const { scrapeSubreddit } = require('../src/platforms/reddit/scraper');

async function main() {
  // 1. Load campaigns
  const campaigns = loadCampaigns();
  console.log(chalk.green('✓') + ` Campaigns loaded: [${campaigns.map(c => c.id).join(', ')}]`);

  // 2. Initialize DB
  getDb();
  console.log(chalk.green('✓') + ' DB initialized');

  // 3. Connect to browser via CDP (skip gracefully if Chrome not running)
  let browser;
  try {
    browser = await connectBrowser();
    console.log(chalk.green('✓') + ' Connected to Chrome via CDP');
  } catch (err) {
    console.warn(chalk.yellow('⚠') + ' Chrome not running — skipping live scrape test');
    console.warn('  ' + err.message.split('\n')[0]);
    process.exit(0);
  }

  let page;
  try {
    // 4. Navigate to r/malaysia/new/
    page = await openNewTab(browser, null);
    console.log(chalk.green('✓') + ' Opened new tab');

    // 5. Call scrapeSubreddit
    console.log('  Scraping r/malaysia/new/ ...');
    const posts = await scrapeSubreddit(page, 'malaysia');

    // 6. Print first 3 post titles
    if (posts.length === 0) {
      console.warn(chalk.yellow('⚠') + ' No posts found (Reddit may have changed layout or rate-limited)');
    } else {
      console.log(chalk.green('✓') + ` Scraped ${posts.length} posts. First 3 titles:`);
      posts.slice(0, 3).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.title}`);
      });
    }
  } finally {
    if (page) await closePage(page);
    await browser.close();
  }

  console.log('');
  console.log(chalk.green('Dry-run integration test complete. Exit 0.'));
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
