'use strict';

const { saveRunStats } = require('../state/db');

function recordRunStats(campaignId, campaignStats, resolvedSettings) {
  const { postsScanned, commentsChecked, matchesFound, repliesPosted } = campaignStats;
  const matchRatio = matchesFound / Math.max(commentsChecked, 1);
  saveRunStats(campaignId, {
    postsScanned,
    commentsChecked,
    matchesFound,
    repliesPosted,
    matchRatio,
    settingsSnapshot: JSON.stringify(resolvedSettings),
  });
}

module.exports = { recordRunStats };
