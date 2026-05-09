const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'amplify.db');

let db;

function getDb() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initTables(db);
  return db;
}

function initTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS seen_posts (
      platform TEXT NOT NULL,
      url      TEXT NOT NULL PRIMARY KEY,
      scraped_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sent_replies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      post_url    TEXT NOT NULL,
      comment_url TEXT NOT NULL,
      reply_text  TEXT NOT NULL,
      posted_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS skipped_posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      post_url    TEXT NOT NULL,
      reason      TEXT NOT NULL,
      skipped_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS injection_attempts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id     TEXT NOT NULL,
      post_url        TEXT NOT NULL,
      comment_url     TEXT NOT NULL,
      pattern_matched TEXT NOT NULL,
      comment_preview TEXT NOT NULL,
      detected_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
}

function hasSeenPost(url) {
  return !!getDb().prepare('SELECT 1 FROM seen_posts WHERE url = ?').get(url);
}

function markPostSeen(platform, url) {
  getDb()
    .prepare('INSERT OR IGNORE INTO seen_posts (platform, url, scraped_at) VALUES (?, ?, ?)')
    .run(platform, url, Math.floor(Date.now() / 1000));
}

function logReply(campaignId, postUrl, commentUrl, replyText) {
  getDb()
    .prepare('INSERT INTO sent_replies (campaign_id, post_url, comment_url, reply_text, posted_at) VALUES (?, ?, ?, ?, ?)')
    .run(campaignId, postUrl, commentUrl, replyText, Math.floor(Date.now() / 1000));
}

function logSkipped(campaignId, postUrl, reason) {
  getDb()
    .prepare('INSERT INTO skipped_posts (campaign_id, post_url, reason, skipped_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, postUrl, reason, Math.floor(Date.now() / 1000));
}

function getRecentReplies(campaignId, hours) {
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  return getDb()
    .prepare('SELECT * FROM sent_replies WHERE campaign_id = ? AND posted_at > ?')
    .all(campaignId, cutoff);
}

function getActivityLog(limit = 50) {
  return getDb().prepare(`
    SELECT 'reply' AS type, campaign_id, post_url, comment_url, reply_text, NULL AS reason, posted_at AS timestamp
    FROM sent_replies
    UNION ALL
    SELECT 'skipped' AS type, campaign_id, post_url, NULL AS comment_url, NULL AS reply_text, reason, skipped_at AS timestamp
    FROM skipped_posts
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit);
}

function getStats() {
  const database = getDb();
  const totalReplies = database.prepare('SELECT COUNT(*) AS n FROM sent_replies').get().n;
  const totalSkipped = database.prepare('SELECT COUNT(*) AS n FROM skipped_posts').get().n;
  const cutoff24h = Math.floor(Date.now() / 1000) - 86400;
  const last24hReplies = database.prepare('SELECT COUNT(*) AS n FROM sent_replies WHERE posted_at > ?').get(cutoff24h).n;
  const byCampaignRows = database.prepare('SELECT campaign_id, COUNT(*) AS n FROM sent_replies GROUP BY campaign_id').all();
  const repliesByCampaign = {};
  for (const row of byCampaignRows) repliesByCampaign[row.campaign_id] = row.n;
  const injectionAttempts = database.prepare('SELECT COUNT(*) AS n FROM injection_attempts').get().n;
  return { totalReplies, totalSkipped, repliesByCampaign, last24hReplies, injectionAttempts };
}

function logInjection(campaignId, postUrl, commentUrl, pattern, commentPreview) {
  getDb()
    .prepare('INSERT INTO injection_attempts (campaign_id, post_url, comment_url, pattern_matched, comment_preview, detected_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(campaignId, postUrl, commentUrl, pattern, commentPreview, Math.floor(Date.now() / 1000));
}

function getInjectionAttempts(limit = 50) {
  return getDb()
    .prepare('SELECT * FROM injection_attempts ORDER BY detected_at DESC LIMIT ?')
    .all(limit);
}

module.exports = { getDb, hasSeenPost, markPostSeen, logReply, logSkipped, getRecentReplies, getActivityLog, getStats, logInjection, getInjectionAttempts };
