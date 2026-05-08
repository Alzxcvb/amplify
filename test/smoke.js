'use strict';

const chalk = require('chalk');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(chalk.green('✓') + ' ' + name);
    passed++;
  } catch (err) {
    console.log(chalk.red('✗') + ' ' + name);
    console.log('  ' + chalk.red(err.message));
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Unique per-run identifiers so re-runs don't collide
const ts = Date.now();
const testUrl = `https://smoke-test.example.com/post/${ts}`;
const testPostUrl = `https://smoke-test.example.com/post2/${ts}`;
const testCommentUrl = `https://smoke-test.example.com/comment/${ts}`;
const testCampaignId = `smoke-campaign-${ts}`;

// 1. loadCampaigns() returns 3 campaigns
test('loadCampaigns() returns 3 campaigns', () => {
  const { loadCampaigns } = require('../src/campaigns/loader');
  const campaigns = loadCampaigns();
  assert(
    campaigns.length === 3,
    `Expected 3 campaigns, got ${campaigns.length}: [${campaigns.map(c => c.id).join(', ')}]`
  );
});

// 2. DB init creates tables
test('DB init creates tables', () => {
  const { getDb } = require('../src/state/db');
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map(r => r.name);
  assert(tables.includes('seen_posts'), 'Missing table: seen_posts');
  assert(tables.includes('sent_replies'), 'Missing table: sent_replies');
  assert(tables.includes('skipped_posts'), 'Missing table: skipped_posts');
});

// 3. hasSeenPost returns false for new URL
test('hasSeenPost returns false for new URL', () => {
  const { hasSeenPost } = require('../src/state/db');
  assert(!hasSeenPost(testUrl), `Expected false for unseen URL: ${testUrl}`);
});

// 4. markPostSeen + hasSeenPost round-trip
test('markPostSeen + hasSeenPost round-trip returns true', () => {
  const { hasSeenPost, markPostSeen } = require('../src/state/db');
  markPostSeen('reddit', testUrl);
  assert(hasSeenPost(testUrl), 'Expected true after markPostSeen()');
});

// 5. logReply inserts row
test('logReply inserts row', () => {
  const { logReply, getDb } = require('../src/state/db');
  logReply(testCampaignId, testPostUrl, testCommentUrl, 'Smoke test reply');
  const row = getDb()
    .prepare('SELECT * FROM sent_replies WHERE comment_url = ?')
    .get(testCommentUrl);
  assert(row, 'Expected a row in sent_replies after logReply()');
  assert(row.campaign_id === testCampaignId, `Wrong campaign_id: ${row.campaign_id}`);
  assert(row.reply_text === 'Smoke test reply', `Wrong reply_text: ${row.reply_text}`);
});

// 6. getRecentReplies returns 1 after logReply (unique campaign ID per run)
test('getRecentReplies returns 1 after logReply', () => {
  const { getRecentReplies } = require('../src/state/db');
  const replies = getRecentReplies(testCampaignId, 1);
  assert(replies.length === 1, `Expected 1 reply, got ${replies.length}`);
});

// 7. config constants are all defined + sane values
test('config constants are all defined + sane values', () => {
  const config = require('../src/config');
  const checks = [
    ['MAX_REPLIES_PER_CAMPAIGN_PER_HOUR', v => typeof v === 'number' && v > 0],
    ['MIN_SECONDS_BETWEEN_REPLIES',       v => typeof v === 'number' && v > 0],
    ['CONFIDENCE_THRESHOLD',              v => typeof v === 'number' && v > 0],
    ['TYPING_DELAY_MS',                   v => typeof v === 'number' && v > 0],
    ['SCROLL_PAUSE_MS',                   v => typeof v === 'number' && v > 0],
    ['AI_RESPONSE_TIMEOUT_MS',            v => typeof v === 'number' && v > 0],
  ];
  for (const [key, check] of checks) {
    assert(key in config, `Missing config key: ${key}`);
    assert(check(config[key]), `Config key ${key} has invalid value: ${config[key]}`);
  }
});

// Summary
console.log('');
if (failed === 0) {
  console.log(chalk.green(`All ${passed} tests passed.`));
} else {
  console.log(chalk.red(`${failed} test(s) failed, ${passed} passed.`));
  process.exit(1);
}
