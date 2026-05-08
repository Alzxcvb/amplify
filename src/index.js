'use strict';

const { runBot } = require('./bot');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const campaignArg = args.find(a => a.startsWith('--campaign='));
const campaignFilter = campaignArg ? campaignArg.split('=')[1] : null;

runBot({ dryRun, campaignFilter }).catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
