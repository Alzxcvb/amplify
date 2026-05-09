import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const campaignsDir = join(__dirname, '../../../../../campaigns');

const require = createRequire(import.meta.url);
const { getDb, getAllSettings } = require('../../../../../src/state/db');

function readCampaign(id) {
  const filePath = join(campaignsDir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export async function GET(request, { params }) {
  const { id } = await params;
  const campaign = readCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  const dbSettings = getAllSettings(id);
  return NextResponse.json({ ...campaign, dbSettings });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const filePath = join(campaignsDir, `${id}.json`);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const existing = readCampaign(id);
  if (!existing) {
    return NextResponse.json({ error: 'Failed to read campaign' }, { status: 500 });
  }

  const updated = { ...existing, ...body, id: existing.id };

  try {
    writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    return NextResponse.json({ error: `Failed to write campaign: ${err.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign: updated });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const filePath = join(campaignsDir, `${id}.json`);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  try {
    unlinkSync(filePath);
  } catch (err) {
    return NextResponse.json({ error: `Failed to delete campaign: ${err.message}` }, { status: 500 });
  }

  try {
    getDb().prepare('DELETE FROM campaign_settings WHERE campaign_id = ?').run(id);
  } catch (err) {
    console.error(`[campaigns/delete] Failed to delete DB settings for ${id}: ${err.message}`);
  }

  return NextResponse.json({ success: true });
}
