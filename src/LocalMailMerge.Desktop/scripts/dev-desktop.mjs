import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, '..');
const viteBin = path.resolve(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const electronPath = require('electron');
const rendererUrl = 'http://127.0.0.1:4173';
const workerProject = path.resolve(projectRoot, '..', 'LocalMailMerge.Worker', 'LocalMailMerge.Worker.csproj');
const workerExecutable = path.resolve(projectRoot, '..', 'LocalMailMerge.Worker', 'bin', 'Debug', 'net10.0-windows', 'LocalMailMerge.Worker.exe');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? -1}.`));
    });
  });
}

await run('dotnet', ['build', workerProject, '-c', 'Debug']);

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
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
      LOCAL_MAIL_MERGE_WORKER: workerExecutable
    }
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
