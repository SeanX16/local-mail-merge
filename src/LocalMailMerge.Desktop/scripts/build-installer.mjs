import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageMetadata = JSON.parse(readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const sourceDir = path.join(desktopRoot, 'out', 'Local Mail Merge-win32-x64');
const outputDir = path.join(desktopRoot, 'out', 'make', 'inno');
const installerScript = path.join(desktopRoot, 'installer', 'local-mail-merge.iss');
const outputFile = path.join(outputDir, `Local-Mail-Merge-v${packageMetadata.version}-Setup.exe`);

const compilerCandidates = [
  process.env.INNO_SETUP_COMPILER,
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Inno Setup 6', 'ISCC.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe')
].filter(Boolean);

const compiler = compilerCandidates.find((candidate) => existsSync(candidate));
if (!compiler) {
  throw new Error('未找到 Inno Setup 6 编译器。请安装 Inno Setup，或设置 INNO_SETUP_COMPILER。');
}

const appExecutable = path.join(sourceDir, 'LocalMailMerge.exe');
if (!existsSync(appExecutable)) {
  throw new Error(`未找到已打包应用：${appExecutable}。请先运行 electron-forge make。`);
}

mkdirSync(outputDir, { recursive: true });

const result = spawnSync(compiler, [
  `/DAppVersion=${packageMetadata.version}`,
  `/DSourceDir=${sourceDir}`,
  `/DOutputDir=${outputDir}`,
  installerScript
], {
  cwd: desktopRoot,
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Inno Setup 编译失败，退出码 ${result.status}。`);
if (!existsSync(outputFile)) throw new Error(`安装器编译完成，但未找到预期文件：${outputFile}`);

console.log(`安装器已生成：${outputFile}`);
