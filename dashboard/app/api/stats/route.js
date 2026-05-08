import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getStats } = require('../../../../src/state/db');

export async function GET() {
  const stats = getStats();
  return NextResponse.json(stats);
}
