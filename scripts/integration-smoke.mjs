/**
 * Start Pure Plinko host, run Suki integration smoke tests, then exit.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const port = process.env.SMOKE_PORT || '5174';
const baseUrl = `http://127.0.0.1:${port}`;
const harness = join(root, 'node_modules', '@kap-solo', 'suki-engine', 'harness', 'smoke.mjs');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await wait(250);
  }
  throw new Error(`Server did not respond at ${url}`);
}

function stopServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: port, HOST: '127.0.0.1' },
  stdio: 'pipe',
});

let exitCode = 1;

try {
  await waitForServer(`${baseUrl}/`);
  const smoke = spawn(process.execPath, [harness], {
    cwd: root,
    env: { ...process.env, SUKI_SMOKE_URL: baseUrl },
    stdio: 'inherit',
  });

  exitCode = await new Promise((resolve) => {
    smoke.on('exit', (code) => resolve(code ?? 1));
  });
} catch (err) {
  console.error(err);
} finally {
  stopServer(server);
  await wait(400);
}

process.exit(exitCode);
