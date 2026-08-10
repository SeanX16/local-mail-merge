import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, '..');
const viteBin = require.resolve('vite/bin/vite.js');
const electronPath = require('electron');
const rendererUrl = 'http://127.0.0.1:4173';

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: projectRoot,
  stdio: 'inherit'
});

async function waitForRenderer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Vite renderer did not start in time.');
}

let electron;
try {
  await waitForRenderer();
  electron = spawn(electronPath, ['.', '--demo'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl }
  });
  electron.on('exit', (code) => {
    vite.kill();
    process.exitCode = code ?? 0;
  });
} catch (error) {
  vite.kill();
  throw error;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    electron?.kill();
    vite.kill();
  });
}
