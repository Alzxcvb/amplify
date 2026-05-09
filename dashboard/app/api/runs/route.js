import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const runsDir = join(__dirname, '../../../../data/runs');

export async function GET() {
  if (!existsSync(runsDir)) {
    return NextResponse.json([]);
  }

  const files = readdirSync(runsDir).filter(
    f => f.startsWith('run-') && f.endsWith('.json')
  );

  const runs = files
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(runsDir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  runs.sort((a, b) => b.startedAt - a.startedAt);

  return NextResponse.json(runs);
}
