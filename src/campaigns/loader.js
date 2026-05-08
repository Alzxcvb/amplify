const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['id', 'product', 'url', 'pitch', 'pain_points', 'platforms'];

function validateCampaign(campaign, filePath) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in campaign)) {
      console.warn(`[loader] Skipping ${filePath}: missing required field "${field}"`);
      return false;
    }
  }
  if (!Array.isArray(campaign.pain_points) || campaign.pain_points.length === 0) {
    console.warn(`[loader] Skipping ${filePath}: pain_points must be a non-empty array`);
    return false;
  }
  if (typeof campaign.platforms !== 'object' || campaign.platforms === null) {
    console.warn(`[loader] Skipping ${filePath}: platforms must be an object`);
    return false;
  }
  return true;
}

function loadCampaigns() {
  const campaignsDir = path.join(__dirname, '../../campaigns');
  let files;
  try {
    files = fs.readdirSync(campaignsDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.warn(`[loader] Could not read campaigns dir: ${err.message}`);
    return [];
  }

  const campaigns = [];
  for (const file of files) {
    const filePath = path.join(campaignsDir, file);
    let campaign;
    try {
      campaign = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn(`[loader] Skipping ${file}: JSON parse error — ${err.message}`);
      continue;
    }
    if (!validateCampaign(campaign, file)) continue;
    if (campaign.active === false) continue;
    campaigns.push(campaign);
  }
  return campaigns;
}

module.exports = { loadCampaigns };
