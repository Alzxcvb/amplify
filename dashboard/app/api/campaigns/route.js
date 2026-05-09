import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const campaignsDir = join(__dirname, '../../../../campaigns');

const require = createRequire(import.meta.url);
const { getDb } = require('../../../../src/state/db');

function readAllCampaigns() {
  if (!existsSync(campaignsDir)) return [];
  const files = readdirSync(campaignsDir).filter(f => f.endsWith('.json'));
  const campaigns = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(campaignsDir, f), 'utf8'));
      if (data.id) campaigns.push(data);
    } catch {
      // skip unparseable files
    }
  }
  return campaigns;
}

export async function GET() {
  const campaigns = readAllCampaigns();
  const db = getDb();
  const cutoff24h = Math.floor(Date.now() / 1000) - 86400;

  const enriched = campaigns.map(c => {
    const replies24h = db.prepare(
      'SELECT COUNT(*) AS n FROM sent_replies WHERE campaign_id = ? AND posted_at > ?'
    ).get(c.id, cutoff24h)?.n ?? 0;

    const lastRun = db.prepare(
      'SELECT match_ratio FROM run_stats WHERE campaign_id = ? ORDER BY run_at DESC LIMIT 1'
    ).get(c.id);

    return {
      ...c,
      replies24h,
      lastMatchRatio: lastRun?.match_ratio ?? null,
    };
  });

  return NextResponse.json(enriched);
}
