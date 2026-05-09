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

    CREATE TABLE IF NOT EXISTS campaign_settings (
      campaign_id   TEXT NOT NULL,
      setting_key   TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      is_auto_tuned INTEGER NOT NULL DEFAULT 0,
      tuned_at      INTEGER,
      tune_reason   TEXT,
      PRIMARY KEY (campaign_id, setting_key)
    );

    CREATE TABLE IF NOT EXISTS tuning_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id      TEXT NOT NULL,
      setting_key      TEXT NOT NULL,
      old_value        TEXT,
      new_value        TEXT NOT NULL,
      match_ratio      REAL,
      comments_checked INTEGER,
      matches_found    INTEGER,
      reason           TEXT,
      changed_at       INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS subreddit_stats (
      campaign_id       TEXT NOT NULL,
      subreddit         TEXT NOT NULL,
      scans             INTEGER NOT NULL DEFAULT 0,
      posts_found       INTEGER NOT NULL DEFAULT 0,
      comments_checked  INTEGER NOT NULL DEFAULT 0,
      matches_found     INTEGER NOT NULL DEFAULT 0,
      last_scanned_at   INTEGER,
      flagged           INTEGER NOT NULL DEFAULT 0,
      flag_reason       TEXT,
      PRIMARY KEY (campaign_id, subreddit)
    );

    CREATE TABLE IF NOT EXISTS discovered_subreddits (
      campaign_id   TEXT NOT NULL,
      subreddit     TEXT NOT NULL,
      discovered_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      source        TEXT NOT NULL DEFAULT 'claude',
      PRIMARY KEY (campaign_id, subreddit)
    );

    CREATE TABLE IF NOT EXISTS run_stats (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id       TEXT NOT NULL,
      run_at            INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      posts_scanned     INTEGER NOT NULL DEFAULT 0,
      comments_checked  INTEGER NOT NULL DEFAULT 0,
      matches_found     INTEGER NOT NULL DEFAULT 0,
      replies_posted    INTEGER NOT NULL DEFAULT 0,
      match_ratio       REAL NOT NULL DEFAULT 0,
      settings_snapshot TEXT
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

function getCampaignSetting(campaignId, key, defaultVal) {
  const row = getDb()
    .prepare('SELECT setting_value FROM campaign_settings WHERE campaign_id = ? AND setting_key = ?')
    .get(campaignId, key);
  return row ? row.setting_value : defaultVal;
}

function setCampaignSetting(campaignId, key, value, { isAutoTuned = false, reason = null } = {}) {
  const database = getDb();
  const existing = database
    .prepare('SELECT setting_value FROM campaign_settings WHERE campaign_id = ? AND setting_key = ?')
    .get(campaignId, key);
  const now = Math.floor(Date.now() / 1000);
  database
    .prepare(`INSERT INTO campaign_settings (campaign_id, setting_key, setting_value, is_auto_tuned, tuned_at, tune_reason)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(campaign_id, setting_key) DO UPDATE SET
                setting_value = excluded.setting_value,
                is_auto_tuned = excluded.is_auto_tuned,
                tuned_at = excluded.tuned_at,
                tune_reason = excluded.tune_reason`)
    .run(campaignId, key, String(value), isAutoTuned ? 1 : 0, now, reason);
  database
    .prepare(`INSERT INTO tuning_history (campaign_id, setting_key, old_value, new_value, reason, changed_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(campaignId, key, existing ? existing.setting_value : null, String(value), reason, now);
}

function resetCampaignSetting(campaignId, key) {
  getDb()
    .prepare('DELETE FROM campaign_settings WHERE campaign_id = ? AND setting_key = ?')
    .run(campaignId, key);
}

function getAllSettings(campaignId) {
  const rows = getDb()
    .prepare('SELECT * FROM campaign_settings WHERE campaign_id = ?')
    .all(campaignId);
  const result = {};
  for (const row of rows) result[row.setting_key] = row;
  return result;
}

function getTuningHistory(campaignId, limit = 20) {
  return getDb()
    .prepare('SELECT * FROM tuning_history WHERE campaign_id = ? ORDER BY changed_at DESC, id DESC LIMIT ?')
    .all(campaignId, limit);
}

function updateSubredditStats(campaignId, subreddit, { postsFound = 0, commentsChecked = 0, matchesFound = 0 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare(`
    INSERT INTO subreddit_stats (campaign_id, subreddit, scans, posts_found, comments_checked, matches_found, last_scanned_at)
    VALUES (?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, subreddit) DO UPDATE SET
      scans            = scans + 1,
      posts_found      = posts_found + excluded.posts_found,
      comments_checked = comments_checked + excluded.comments_checked,
      matches_found    = matches_found + excluded.matches_found,
      last_scanned_at  = excluded.last_scanned_at
  `).run(campaignId, subreddit, postsFound, commentsChecked, matchesFound, now);
}

function flagSubreddit(campaignId, subreddit, reason) {
  getDb().prepare(`
    INSERT INTO subreddit_stats (campaign_id, subreddit, flagged, flag_reason)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(campaign_id, subreddit) DO UPDATE SET
      flagged     = 1,
      flag_reason = excluded.flag_reason
  `).run(campaignId, subreddit, reason);
}

function isSubredditFlagged(campaignId, subreddit) {
  const row = getDb()
    .prepare('SELECT flagged FROM subreddit_stats WHERE campaign_id = ? AND subreddit = ?')
    .get(campaignId, subreddit);
  return row ? row.flagged === 1 : false;
}

function getSubredditStats(campaignId) {
  return getDb()
    .prepare('SELECT * FROM subreddit_stats WHERE campaign_id = ? ORDER BY subreddit ASC')
    .all(campaignId);
}

function getSubredditMatchRatio(campaignId, subreddit) {
  const row = getDb()
    .prepare('SELECT comments_checked, matches_found FROM subreddit_stats WHERE campaign_id = ? AND subreddit = ?')
    .get(campaignId, subreddit);
  if (!row || row.comments_checked === 0) return 0;
  return row.matches_found / row.comments_checked;
}

function addDiscoveredSubreddit(campaignId, subreddit, source = 'claude') {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare('INSERT OR IGNORE INTO discovered_subreddits (campaign_id, subreddit, discovered_at, source) VALUES (?, ?, ?, ?)')
    .run(campaignId, subreddit, now, source);
}

function getDiscoveredSubreddits(campaignId) {
  return getDb()
    .prepare('SELECT subreddit FROM discovered_subreddits WHERE campaign_id = ? ORDER BY discovered_at ASC')
    .all(campaignId)
    .map(r => r.subreddit);
}

function saveRunStats(campaignId, { postsScanned = 0, commentsChecked = 0, matchesFound = 0, repliesPosted = 0, matchRatio = 0, settingsSnapshot = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(`INSERT INTO run_stats (campaign_id, run_at, posts_scanned, comments_checked, matches_found, replies_posted, match_ratio, settings_snapshot)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(campaignId, now, postsScanned, commentsChecked, matchesFound, repliesPosted, matchRatio, settingsSnapshot);
}

function getRecentRunStats(campaignId, limit = 5) {
  return getDb()
    .prepare('SELECT * FROM run_stats WHERE campaign_id = ? ORDER BY run_at DESC, id DESC LIMIT ?')
    .all(campaignId, limit);
}

module.exports = {
  getDb,
  hasSeenPost, markPostSeen,
  logReply, logSkipped, getRecentReplies,
  getActivityLog, getStats,
  logInjection, getInjectionAttempts,
  getCampaignSetting, setCampaignSetting, resetCampaignSetting, getAllSettings, getTuningHistory,
  updateSubredditStats, flagSubreddit, isSubredditFlagged, getSubredditStats, getSubredditMatchRatio,
  addDiscoveredSubreddit, getDiscoveredSubreddits,
  saveRunStats, getRecentRunStats,
};
