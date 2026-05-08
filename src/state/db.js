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

module.exports = { getDb, hasSeenPost, markPostSeen, logReply, logSkipped, getRecentReplies };
