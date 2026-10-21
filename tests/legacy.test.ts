import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import manifest from '../data/baselines/a37d1d5.manifest.json';
import expected from '../data/baselines/legacy-output-hashes.json';
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
test('archived sources match immutable audited bytes', () => {
  for (const name of ['server.ts', 'simulator.ts']) {
    expect(sha(readFileSync(`legacy/a37d1d5/${name}`))).toBe(manifest.files.find(x => x.path === name)!.sha256);
  }
});
test('historical server rule function preserves nominal commands', () => {
  const source = readFileSync('legacy/a37d1d5/server.ts', 'utf8');
  const core = source.slice(source.indexOf('function getFuzzyAngle'), source.indexOf('// --- EXPRESS SERVER ---'));
  const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(core);
  const fn = new Function(`${js}; return getFuzzyAngle;`)() as (q: number) => number;
  expect(manifest.flowsLMin.map(fn)).toEqual(manifest.serverCommandsDeg);
});
test('full legacy replay matches all 25 CSV byte hashes and known mislabeled initial state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taph-legacy-'));
  try {
    const run = Bun.spawnSync([process.execPath, resolve('legacy/a37d1d5/simulator.ts')], { cwd: dir });
    expect(run.exitCode).toBe(0);
    let rows = 0;
    for (const file of expected.files) {
      const bytes = readFileSync(join(dir, file.path));
      expect(sha(bytes)).toBe(file.sha256);
      const lines = bytes.toString().trimEnd().split('\n');
      expect(lines[0]).toBe(manifest.format.header);
      expect(lines.length - 1).toBe(2404);
      expect(Number(lines[1]!.split(',')[0])).toBe(0);
      expect(Number(lines[1]!.split(',')[5])).toBeGreaterThan(0); // preserves historical time-label defect
      rows += lines.length - 1;
    }
    expect(expected.files).toHaveLength(25);
    expect(readdirSync(dir)).toHaveLength(5);
    expect(rows).toBe(60100);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
