import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const requiredOutputs = ['dist/index.js', 'dist/index.d.ts'];
const missingOutputs = requiredOutputs.filter((path) => !existsSync(resolve(packageRoot, path)));

if (missingOutputs.length > 0) {
  console.error('Prompt compiler build failed: missing output files.');
  for (const output of missingOutputs) {
    console.error(`- ${output}`);
  }
  process.exit(1);
}
