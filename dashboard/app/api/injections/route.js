import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { getInjectionAttempts } = require('../../../../src/state/db');

export async function GET() {
  const attempts = getInjectionAttempts(100);
  return NextResponse.json(attempts);
}
