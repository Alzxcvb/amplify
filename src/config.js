const { getCampaignSetting } = require('./state/db');

const MAX_REPLIES_PER_CAMPAIGN_PER_HOUR = 5;
const MIN_SECONDS_BETWEEN_REPLIES = 120;
const CONFIDENCE_THRESHOLD = 8;
const TYPING_DELAY_MS = 80;
const SCROLL_PAUSE_MS = 1500;
const AI_RESPONSE_TIMEOUT_MS = 60000;

const DEFAULTS = {
  post_age_days: 7,
  confidence_threshold: 8,
  max_comments_per_post: 25,
  max_replies_per_hour: 5,
  min_seconds_between_replies: 120,
  reply_style: 'helpful community member',
};

function resolveSettings(campaignId, campaignJson = {}) {
  const result = {};
  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    const jsonVal = campaignJson[key] !== undefined ? campaignJson[key] : defaultVal;
    const dbVal = getCampaignSetting(campaignId, key, null);
    if (dbVal !== null) {
      result[key] = typeof defaultVal === 'number' ? Number(dbVal) : dbVal;
    } else {
      result[key] = jsonVal;
    }
  }
  return result;
}

module.exports = {
  MAX_REPLIES_PER_CAMPAIGN_PER_HOUR,
  MIN_SECONDS_BETWEEN_REPLIES,
  CONFIDENCE_THRESHOLD,
  TYPING_DELAY_MS,
  SCROLL_PAUSE_MS,
  AI_RESPONSE_TIMEOUT_MS,
  DEFAULTS,
  resolveSettings,
};
