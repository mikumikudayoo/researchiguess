import { resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
// Execute the unchanged source in a dedicated, NEW directory. Never overwrite research records.
const output = resolve(process.argv[2] ?? 'results/legacy-replay');
if (existsSync(output)) throw new Error(`refusing existing output directory: ${output}`);
mkdirSync(output, { recursive: true });
const child = Bun.spawnSync([process.execPath, resolve('legacy/a37d1d5/simulator.ts')], { cwd: output, stdout: 'inherit', stderr: 'inherit' });
if (child.exitCode !== 0) throw new Error(`legacy replay failed: ${child.exitCode}`);
await Bun.write(resolve(output, 'provenance.json'), JSON.stringify({
  category: 'historical-simulator-replay', sourceCommit: 'a37d1d5abf4d13d775ae206b4cd1c4c59f0e88ce',
  runtime: Bun.version, source: 'legacy/a37d1d5/simulator.ts',
  warning: 'new replay of preserved code; not original manuscript data or physical measurement',
}, null, 2));
