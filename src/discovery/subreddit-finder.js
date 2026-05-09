const { askClaude } = require('../ai/claude-browser');

async function discoverSubreddits(browser, campaign, flaggedList) {
  const flaggedStr = flaggedList.length > 0 ? flaggedList.join(', ') : 'none yet';
  const painPoints = campaign.pain_points.slice(0, 3).join(', or ');

  const prompt =
    `I'm promoting ${campaign.product}: ${campaign.pitch}. ` +
    `I tried these subreddits but they weren't relevant: ${flaggedStr}. ` +
    `My target is someone who ${painPoints}. ` +
    `Suggest 5 better subreddits. Return ONLY a JSON array of strings like ["r/name1","r/name2"].`;

  let raw;
  try {
    raw = await askClaude(browser, prompt, campaign.ai_url);
  } catch {
    return [];
  }

  // Strip markdown code fences
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(s => typeof s === 'string' && s.startsWith('r/'))
    .slice(0, 5);
}

module.exports = { discoverSubreddits };
