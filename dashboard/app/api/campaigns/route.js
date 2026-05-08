import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { loadCampaigns } = require('../../../../src/campaigns/loader');

export async function GET() {
  const campaigns = loadCampaigns();
  return NextResponse.json(campaigns);
}
