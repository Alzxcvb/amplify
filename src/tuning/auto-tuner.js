'use strict';

const {
  getCampaignSetting,
  setCampaignSetting,
  resetCampaignSetting,
  getTuningHistory,
  getSubredditStats,
  flagSubreddit,
} = require('../state/db');
const { DEFAULTS } = require('../config');

// confidence_threshold is intentionally excluded — manual setting only, never auto-tuned.
const ROTATION = ['post_age_days', 'max_comments_per_post', 'subreddit_set'];

function computeScore(matchRatio, commentsChecked) {
  return matchRatio * Math.log(commentsChecked + 1);
}

function generateCandidate(param, currentVal) {
  if (param === 'post_age_days') {
    const up = currentVal + 3;
    const down = Math.max(1, currentVal - 3);
    if (up === currentVal) return down;
    if (down === currentVal) return up;
    return Math.random() < 0.5 ? up : down;
  }
  if (param === 'confidence_threshold') {
    const up = Math.min(10, currentVal + 1);
    const down = Math.max(1, currentVal - 1);
    if (up === currentVal) return down;
    if (down === currentVal) return up;
    return Math.random() < 0.5 ? up : down;
  }
  if (param === 'max_comments_per_post') {
    const up = currentVal + 10;
    const down = Math.max(5, currentVal - 10);
    if (up === currentVal) return down;
    if (down === currentVal) return up;
    return Math.random() < 0.5 ? up : down;
  }
  return currentVal;
}

function pickNextParam(campaignId) {
  const history = getTuningHistory(campaignId, 40);
  // Look at the most recent pending_experiment SET (new_value contains JSON with a parameter field)
  const expEntries = history.filter(
    h => h.setting_key === 'pending_experiment' && h.new_value && h.new_value !== 'null'
  );
  if (expEntries.length === 0) return ROTATION[0];
  try {
    const lastExp = JSON.parse(expEntries[0].new_value);
    if (lastExp && lastExp.parameter) {
      const idx = ROTATION.indexOf(lastExp.parameter);
      if (idx >= 0) return ROTATION[(idx + 1) % ROTATION.length];
    }
  } catch (_) {
    // malformed history entry — start from beginning
  }
  return ROTATION[0];
}

/**
 * tuneCampaign — hill-climbing A/B tuner.
 *
 * Called after each campaign run. Returns an array of decision objects for
 * the caller to log. Each decision has a `type` field:
 *   'applied'          — candidate beat baseline, now permanent
 *   'reverted'         — baseline beat candidate, restored
 *   'subreddit_flagged'— worst subreddit flagged (one-way; no revert step)
 *   'proposed'         — next experiment queued for the following run
 */
function tuneCampaign(campaignId, currentSettings, recentStats) {
  const decisions = [];

  if (!recentStats || recentStats.length === 0) return decisions;

  const lastRun = recentStats[0];
  const currentScore = computeScore(lastRun.match_ratio, lastRun.comments_checked);

  // --- Step 2: evaluate pending experiment if the experiment run has completed ---
  const pendingRaw = getCampaignSetting(campaignId, 'pending_experiment', null);
  if (pendingRaw && pendingRaw !== 'null') {
    let exp = null;
    try { exp = JSON.parse(pendingRaw); } catch (_) { /* bad JSON */ }

    if (exp && lastRun.run_at > exp.proposedAt) {
      resetCampaignSetting(campaignId, 'pending_experiment');

      if (exp.parameter === 'subreddit_set') {
        // subreddit_set is one-way: flagging can't be undone, so we just record outcome.
        // No win/lose comparison — the bot's discovery machinery handles the replacement.
        decisions.push({
          type: 'subreddit_flagged',
          subreddit: exp.candidateValue,
          ratio: lastRun.match_ratio,
          commentsChecked: lastRun.comments_checked,
        });
      } else if (currentScore >= exp.baselineScore) {
        // Candidate wins — apply permanently
        setCampaignSetting(campaignId, exp.parameter, String(exp.candidateValue), {
          isAutoTuned: true,
          reason: `auto-tuner applied: score ${currentScore.toFixed(3)} >= baseline ${exp.baselineScore.toFixed(3)}`,
          matchRatio: lastRun.match_ratio,
          commentsChecked: lastRun.comments_checked,
          matchesFound: lastRun.matches_found,
        });
        decisions.push({
          type: 'applied',
          parameter: exp.parameter,
          oldValue: exp.baselineValue,
          newValue: exp.candidateValue,
          ratio: lastRun.match_ratio,
          commentsChecked: lastRun.comments_checked,
        });
      } else {
        // Baseline wins — restore baseline value
        setCampaignSetting(campaignId, exp.parameter, String(exp.baselineValue), {
          isAutoTuned: true,
          reason: `auto-tuner reverted: score ${currentScore.toFixed(3)} < baseline ${exp.baselineScore.toFixed(3)}`,
          matchRatio: lastRun.match_ratio,
          commentsChecked: lastRun.comments_checked,
          matchesFound: lastRun.matches_found,
        });
        decisions.push({
          type: 'reverted',
          parameter: exp.parameter,
          oldValue: exp.candidateValue,
          newValue: exp.baselineValue,
          ratio: lastRun.match_ratio,
          commentsChecked: lastRun.comments_checked,
        });
      }
    }
  }

  // --- Steps 3-5: propose next experiment ---
  const nextParam = pickNextParam(campaignId);

  if (nextParam === 'subreddit_set') {
    const subStats = getSubredditStats(campaignId);
    const eligible = subStats.filter(s => !s.flagged && s.scans > 0 && s.comments_checked > 0);
    // Keep at least one subreddit active — never flag the last one
    if (eligible.length > 1) {
      const worst = eligible.slice().sort(
        (a, b) => (a.matches_found / a.comments_checked) - (b.matches_found / b.comments_checked)
      )[0];
      flagSubreddit(campaignId, worst.subreddit, 'auto-tuner: low match ratio');
      const experiment = {
        parameter: 'subreddit_set',
        candidateValue: worst.subreddit,
        baselineValue: null,
        baselineScore: currentScore,
        proposedAt: Math.floor(Date.now() / 1000),
      };
      setCampaignSetting(campaignId, 'pending_experiment', JSON.stringify(experiment), {
        isAutoTuned: true,
        reason: `proposing subreddit_set: flag ${worst.subreddit}`,
        matchRatio: lastRun.match_ratio,
        commentsChecked: lastRun.comments_checked,
        matchesFound: lastRun.matches_found,
      });
      decisions.push({
        type: 'proposed',
        parameter: 'subreddit_set',
        action: `flag ${worst.subreddit}`,
      });
    }
  } else {
    const raw = currentSettings[nextParam];
    const currentVal = Number(raw);
    if (!Number.isFinite(currentVal)) return decisions;

    const candidateVal = generateCandidate(nextParam, currentVal);
    if (candidateVal === currentVal) return decisions;

    const experiment = {
      parameter: nextParam,
      candidateValue: candidateVal,
      baselineValue: currentVal,
      baselineScore: currentScore,
      proposedAt: Math.floor(Date.now() / 1000),
    };
    setCampaignSetting(campaignId, 'pending_experiment', JSON.stringify(experiment), {
      isAutoTuned: true,
      reason: `proposing experiment: ${nextParam} ${currentVal} → ${candidateVal}`,
      matchRatio: lastRun.match_ratio,
      commentsChecked: lastRun.comments_checked,
      matchesFound: lastRun.matches_found,
    });
    decisions.push({
      type: 'proposed',
      parameter: nextParam,
      currentValue: currentVal,
      candidateValue: candidateVal,
    });
  }

  return decisions;
}

module.exports = { tuneCampaign, computeScore };
