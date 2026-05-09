import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getAllSettings, setCampaignSetting, resetCampaignSetting, getTuningHistory } = require('../../../../../../src/state/db');
const { DEFAULTS } = require('../../../../../../src/config');

export async function GET(request, { params }) {
  const { id } = await params;

  const settings = getAllSettings(id);

  const history = getTuningHistory(id, 50);
  const tuningHistoryByKey = {};
  for (const row of history) {
    if (!tuningHistoryByKey[row.setting_key]) tuningHistoryByKey[row.setting_key] = [];
    tuningHistoryByKey[row.setting_key].push(row);
  }

  return NextResponse.json({ defaults: DEFAULTS, settings, tuningHistoryByKey });
}

export async function PUT(request, { params }) {
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'Missing required fields: key, value' }, { status: 400 });
  }
  if (!(key in DEFAULTS)) {
    return NextResponse.json({ error: `Unknown setting key: ${key}` }, { status: 400 });
  }

  setCampaignSetting(id, key, value, { isAutoTuned: false, reason: 'manual' });
  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { key } = body;
  if (!key) {
    return NextResponse.json({ error: 'Missing required field: key' }, { status: 400 });
  }

  resetCampaignSetting(id, key);
  return NextResponse.json({ success: true });
}
