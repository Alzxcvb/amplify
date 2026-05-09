import { NextResponse } from 'next/server';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const campaignsDir = join(__dirname, '../../../../../campaigns');

const REQUIRED_FIELDS = ['id', 'product', 'url', 'pitch', 'pain_points', 'platforms'];

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in body)) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  if (!Array.isArray(body.pain_points) || body.pain_points.length === 0) {
    return NextResponse.json({ error: 'pain_points must be a non-empty array' }, { status: 400 });
  }

  if (typeof body.platforms !== 'object' || body.platforms === null) {
    return NextResponse.json({ error: 'platforms must be an object' }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(body.id)) {
    return NextResponse.json({ error: 'id must be a lowercase slug (letters, numbers, hyphens)' }, { status: 400 });
  }

  const filePath = join(campaignsDir, `${body.id}.json`);
  if (existsSync(filePath)) {
    return NextResponse.json({ error: `Campaign "${body.id}" already exists` }, { status: 409 });
  }

  try {
    writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf8');
  } catch (err) {
    return NextResponse.json({ error: `Failed to write campaign: ${err.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: body.id }, { status: 201 });
}
