import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Host-only compilation and fake I/O. Never flashes a board or opens serial ports.
for (const source of ['core_test.cpp', 'disabled_adapter_test.cpp', 'enabled_adapter_test.cpp', 'unconfigured_adapter_test.cpp']) {
  test(`firmware host verification: ${source}`, async () => {
    const folder = await mkdtemp(join(tmpdir(), 'taph-firmware-'));
    try {
      const output = join(folder, 'test');
      const compile = Bun.spawn(['g++', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
        '-pedantic', '-Ifirmware/core/src',
        ...(source === 'unconfigured_adapter_test.cpp' ? ['-Ifirmware/tests/compile-only'] : []),
        '-Ifirmware/tests/mocks',
        `firmware/tests/${source}`, '-o', output], { stdout: 'pipe', stderr: 'pipe' });
      const diagnostic = await new Response(compile.stderr).text();
      expect(await compile.exited, diagnostic).toBe(0);
      const run = Bun.spawn([output], { stdout: 'pipe', stderr: 'pipe' });
      const [stdout, stderr, code] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text(), run.exited]);
      expect(code, stdout + stderr).toBe(0);
      expect(stdout).toContain(source === 'core_test.cpp' ? 'checks passed' : source === 'disabled_adapter_test.cpp' || source === 'unconfigured_adapter_test.cpp' ? 'zero GPIO' : 'fault outputs passed');
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 30000);
}
