'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');

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
const loop = args.includes('--loop');
const campaignArg = args.find(a => a.startsWith('--campaign='));
const campaignFilter = campaignArg ? campaignArg.split('=')[1] : null;
const intervalArg = args.find(a => a.startsWith('--interval='));
const intervalMinutes = intervalArg ? Math.max(5, parseInt(intervalArg.split('=')[1], 10)) : 15;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  let runCount = 0;
  do {
    runCount++;
    if (loop && runCount > 1) {
      console.log(`\n[loop] === Run #${runCount} starting ===`);
    }
    try {
      await runBot({ dryRun, campaignFilter });
    } catch (err) {
      console.error('[fatal]', err.message);
      if (!loop) process.exit(1);
    }
    if (loop) {
      const next = new Date(Date.now() + intervalMinutes * 60 * 1000);
      console.log(`[loop] Next run at ${next.toLocaleTimeString()} (${intervalMinutes}m). Ctrl+C to stop.`);
      await sleep(intervalMinutes * 60 * 1000);
    }
  } while (loop);
}

main().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
