'use strict';

const path = require('path');
const fs = require('fs');

// Guard: must be run from the amplify root, not from dashboard/ or elsewhere
const campaignsDir = path.join(process.cwd(), 'campaigns');
if (!fs.existsSync(campaignsDir)) {
  console.error('[fatal] Wrong directory. Run from the amplify root:');
  console.error('  cd ~/ClaudeProjects/amplify');
  console.error('  node src/index.js --campaign=arrival-pass --dry-run');
  process.exit(1);
}

const { runBot } = require('./bot');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const campaignArg = args.find(a => a.startsWith('--campaign='));
const campaignFilter = campaignArg ? campaignArg.split('=')[1] : null;

runBot({ dryRun, campaignFilter }).catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
