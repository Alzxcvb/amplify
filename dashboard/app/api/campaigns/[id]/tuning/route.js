import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getTuningHistory } = require('../../../../../../src/state/db');

export async function GET(request, { params }) {
  const { id } = await params;
  const history = getTuningHistory(id, 50);
  return NextResponse.json(history);
}
