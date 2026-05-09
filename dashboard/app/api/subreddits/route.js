import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const campaignsDir = join(__dirname, '../../../../campaigns');

const require = createRequire(import.meta.url);
const { getSubredditStats, getDiscoveredSubreddits } = require('../../../../src/state/db');

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaign');

  if (campaignId) {
    const stats = getSubredditStats(campaignId);
    const discovered = getDiscoveredSubreddits(campaignId);
    const discoveredSet = new Set(discovered);

    let campaignSubreddits = [];
    const filePath = join(campaignsDir, `${campaignId}.json`);
    if (existsSync(filePath)) {
      try {
        const c = JSON.parse(readFileSync(filePath, 'utf8'));
        campaignSubreddits = c.platforms?.reddit ?? [];
      } catch {}
    }

    const result = stats.map(row => ({
      ...row,
      source: discoveredSet.has(row.subreddit) ? 'discovered' : 'campaign',
    }));

    const inStats = new Set(stats.map(r => r.subreddit));
    for (const sub of campaignSubreddits) {
      if (!inStats.has(sub)) {
        result.push({ subreddit: sub, scans: 0, posts_found: 0, comments_checked: 0, matches_found: 0, flagged: 0, source: 'campaign' });
      }
    }
    for (const sub of discovered) {
      if (!inStats.has(sub) && !campaignSubreddits.includes(sub)) {
        result.push({ subreddit: sub, scans: 0, posts_found: 0, comments_checked: 0, matches_found: 0, flagged: 0, source: 'discovered' });
      }
    }

    return NextResponse.json(result);
  }

  // All campaigns — TASK-47 will build the full subreddits dashboard page on top of this
  let campaignFiles = [];
  if (existsSync(campaignsDir)) {
    campaignFiles = readdirSync(campaignsDir).filter(f => f.endsWith('.json'));
  }

  const result = [];
  for (const file of campaignFiles) {
    try {
      const campaign = JSON.parse(readFileSync(join(campaignsDir, file), 'utf8'));
      if (!campaign.id) continue;
      const stats = getSubredditStats(campaign.id);
      const discovered = new Set(getDiscoveredSubreddits(campaign.id));
      for (const row of stats) {
        result.push({
          ...row,
          campaign_id: campaign.id,
          source: discovered.has(row.subreddit) ? 'discovered' : 'campaign',
        });
      }
    } catch {}
  }

  return NextResponse.json(result);
}
