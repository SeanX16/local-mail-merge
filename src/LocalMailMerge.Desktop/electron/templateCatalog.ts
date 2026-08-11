import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const supportedExtensions = new Set(['.oft', '.html', '.htm']);
const maximumTemplateBytes = 20 * 1024 * 1024;

export interface TemplateSummary {
  id: string;
  name: string;
  fileName: string;
  extension: string;
  source: 'bundled' | 'user';
}

export interface TemplateState {
  templates: TemplateSummary[];
  selectedTemplateId: string;
}

interface StoredSettings {
  selectedTemplateId?: string;
}

interface TemplateEntry extends TemplateSummary {
  fullPath: string;
}

function userTemplateDirectory(): string {
  const directory = path.join(app.getPath('userData'), 'templates');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function bundledTemplateDirectory(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.resolve(__dirname, '..', '..', '..', 'templates');
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings(): StoredSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as StoredSettings;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(settings: StoredSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function displayName(fileName: string, source: TemplateSummary['source']): string {
  if (source === 'bundled' && fileName.toLowerCase() === 'company_signature.sample.html') {
    return '公司签名示例（仅演示）';
  }
  return path.basename(fileName, path.extname(fileName)).replaceAll('_', ' ').trim();
}

function readDirectory(directory: string, source: TemplateSummary['source']): TemplateEntry[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({
      id: `${source}:${encodeURIComponent(entry.name)}`,
      name: displayName(entry.name, source),
      fileName: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      source,
      fullPath: path.join(directory, entry.name)
    }));
}

function entries(): TemplateEntry[] {
  const bundled = readDirectory(bundledTemplateDirectory(), 'bundled');
  const user = readDirectory(userTemplateDirectory(), 'user')
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  return [...user, ...bundled];
}

function currentState(): TemplateState {
  const catalog = entries();
  const stored = readSettings().selectedTemplateId ?? '';
  const selectedTemplateId = catalog.some((template) => template.id === stored)
    ? stored
    : catalog[0]?.id ?? '';
  if (selectedTemplateId !== stored) writeSettings({ selectedTemplateId });
  return {
    templates: catalog.map(({ fullPath: _fullPath, ...template }) => template),
    selectedTemplateId
  };
}

function requireEntry(id: string): TemplateEntry {
  if (typeof id !== 'string' || id.length > 520) throw new Error('签名标识无效。');
  const template = entries().find((item) => item.id === id);
  if (!template) throw new Error('所选签名已不存在，请重新选择。');
  return template;
}

function uniqueDestination(fileName: string): string {
  const directory = userTemplateDirectory();
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${suffix})${extension}`);
    suffix++;
  }
  return candidate;
}

export function getTemplateState(): TemplateState {
  return currentState();
}

export function importTemplate(sourcePath: string): TemplateState {
  if (typeof sourcePath !== 'string' || sourcePath.length > 4096 || !fs.existsSync(sourcePath)) {
    throw new Error('签名文件不存在。');
  }
  const extension = path.extname(sourcePath).toLowerCase();
  if (!supportedExtensions.has(extension)) throw new Error('邮件签名仅支持 .oft、.html 或 .htm。');
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size === 0) throw new Error('签名文件为空或不可用。');
  if (stat.size > maximumTemplateBytes) throw new Error('签名文件不能超过 20 MB。');

  const destination = uniqueDestination(path.basename(sourcePath));
  fs.copyFileSync(sourcePath, destination);
  const selectedTemplateId = `user:${encodeURIComponent(path.basename(destination))}`;
  writeSettings({ selectedTemplateId });
  return currentState();
}

export function deleteTemplate(id: string): TemplateState {
  const template = requireEntry(id);
  if (template.source !== 'user') throw new Error('应用内置示例不能删除。');
  fs.unlinkSync(template.fullPath);
  const next = currentState();
  if (next.selectedTemplateId === id) {
    const selectedTemplateId = next.templates[0]?.id ?? '';
    writeSettings({ selectedTemplateId });
    return { ...next, selectedTemplateId };
  }
  return next;
}

export function selectTemplate(id: string): TemplateState {
  requireEntry(id);
  writeSettings({ selectedTemplateId: id });
  return currentState();
}

export function resolveTemplatePath(id: string): string {
  return requireEntry(id).fullPath;
}

export function getUserTemplateDirectory(): string {
  return userTemplateDirectory();
}
