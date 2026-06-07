/**
 * Full math bundle: tune lookup weights → generate books + index.
 * Usage: node scripts/generate_math.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(script) {
  const result = spawnSync(node, [join(__dirname, script)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('tune_weights.mjs');
run('generate_books.mjs');
