import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getActivityLog } = require('../../../../src/state/db');

export async function GET() {
  const activity = getActivityLog(100);
  return NextResponse.json(activity);
}
