const { getDb, getCampaignSetting, setCampaignSetting, resetCampaignSetting, getAllSettings, getTuningHistory } = require('../src/state/db');

const CAMPAIGN = 'CAMPAIGN-' + Date.now();
let passed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  passed++;
}

// default value when no row
const def = getCampaignSetting('CAMPAIGN', 'confidence_threshold', 8);
assert(def === 8, 'default value should be 8, got ' + def);

// round-trip
setCampaignSetting('CAMPAIGN', 'confidence_threshold', 7, { isAutoTuned: true, reason: 'test' });
const val = getCampaignSetting('CAMPAIGN', 'confidence_threshold', 8);
assert(String(val) === '7', 'round-trip should be 7, got ' + val);

// getAllSettings
const all = getAllSettings('CAMPAIGN');
assert(all.confidence_threshold !== undefined, 'getAllSettings missing key');
assert(all.confidence_threshold.is_auto_tuned === 1, 'is_auto_tuned should be 1');
assert(all.confidence_threshold.tune_reason === 'test', 'tune_reason mismatch');

// tuning history
const hist = getTuningHistory('CAMPAIGN');
assert(hist.length >= 1, 'tuning_history should have entries');
assert(hist[0].new_value === '7', 'history new_value mismatch');
assert(hist[0].old_value === null, 'first entry old_value should be null');

// second update — old_value should be set
setCampaignSetting('CAMPAIGN', 'confidence_threshold', 6, { isAutoTuned: false, reason: 'manual' });
const hist2 = getTuningHistory('CAMPAIGN');
assert(hist2[0].old_value === '7', 'second entry old_value should be 7, got ' + hist2[0].old_value);

// reset restores default
resetCampaignSetting('CAMPAIGN', 'confidence_threshold');
const after = getCampaignSetting('CAMPAIGN', 'confidence_threshold', 8);
assert(after === 8, 'after reset should return default, got ' + after);

console.log('TASK-28: All ' + passed + ' assertions passed');
