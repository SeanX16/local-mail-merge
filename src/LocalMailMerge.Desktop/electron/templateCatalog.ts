import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const supportedExtensions = new Set(['.oft', '.html', '.htm']);
const maximumTemplateBytes = 20 * 1024 * 1024;
const maximumEmbeddedImageBytes = 10 * 1024 * 1024;
const embeddedImageMimeTypes = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);

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
  templateNames?: Record<string, string>;
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
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), ...settings }, null, 2), 'utf8');
}

function displayName(fileName: string, source: TemplateSummary['source']): string {
  if (source === 'bundled' && fileName.toLowerCase() === 'company_signature.sample.html') {
    return '公司签名示例（仅演示）';
  }
  return path.basename(fileName, path.extname(fileName)).replaceAll('_', ' ').trim();
}

function readDirectory(
  directory: string,
  source: TemplateSummary['source'],
  templateNames: Record<string, string>
): TemplateEntry[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const id = `${source}:${encodeURIComponent(entry.name)}`;
      const customName = source === 'user' ? templateNames[id]?.trim() : '';
      return {
        id,
        name: customName || displayName(entry.name, source),
        fileName: entry.name,
        extension: path.extname(entry.name).toLowerCase(),
        source,
        fullPath: path.join(directory, entry.name)
      };
    });
}

function entries(templateNames = readSettings().templateNames ?? {}): TemplateEntry[] {
  const bundled = readDirectory(bundledTemplateDirectory(), 'bundled', templateNames);
  const user = readDirectory(userTemplateDirectory(), 'user', templateNames)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  return [...user, ...bundled];
}

function currentState(): TemplateState {
  const settings = readSettings();
  const catalog = entries(settings.templateNames ?? {});
  const stored = settings.selectedTemplateId ?? '';
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

function decodeHtmlAttribute(value: string): string {
  const decodedEntities = value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
  try {
    return decodeURIComponent(decodedEntities);
  } catch {
    return decodedEntities;
  }
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  const relative = path.relative(directory, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function embedLocalHtmlImages(sourcePath: string, html: string): string {
  const sourceDirectory = fs.realpathSync(path.dirname(sourcePath));
  const imageSourcePattern = /(<img\b[^>]*\bsrc\s*=\s*)(?:(["'])(.*?)\2|([^\s>]+))/gi;
  const packaged = html.replace(imageSourcePattern, (match, prefix: string, quote: string | undefined, quotedValue: string | undefined, bareValue: string | undefined) => {
    const originalValue = (quotedValue ?? bareValue ?? '').trim();
    const normalizedValue = decodeHtmlAttribute(originalValue);
    if (!normalizedValue
      || /^data:image\//i.test(normalizedValue)
      || /^https?:\/\//i.test(normalizedValue)
      || /^\/\//.test(normalizedValue)) return match;
    if (/^cid:/i.test(normalizedValue)) {
      throw new Error('HTML 签名引用了 CID 图片，但单独的 HTML 文件不包含该图片。请改用含内嵌资源的 .oft，或导出为自包含 HTML。');
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedValue)) {
      throw new Error(`HTML 签名包含不支持的图片地址：${originalValue}`);
    }

    const fileReference = normalizedValue.split(/[?#]/, 1)[0].replaceAll('/', path.sep);
    const resolvedPath = path.resolve(sourceDirectory, fileReference);
    if (!isInsideDirectory(resolvedPath, sourceDirectory)) {
      throw new Error(`图片必须位于 HTML 所在文件夹或其子文件夹中：${originalValue}`);
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`签名引用的图片不存在：${originalValue}。请把对应图片文件夹与 HTML 放在一起后重新导入。`);
    }

    const realImagePath = fs.realpathSync(resolvedPath);
    if (!isInsideDirectory(realImagePath, sourceDirectory)) {
      throw new Error(`图片必须位于 HTML 所在文件夹或其子文件夹中：${originalValue}`);
    }
    const stat = fs.statSync(realImagePath);
    if (!stat.isFile() || stat.size === 0) throw new Error(`签名引用的图片为空或不可用：${originalValue}`);
    if (stat.size > maximumEmbeddedImageBytes) throw new Error(`单张签名图片不能超过 10 MB：${originalValue}`);
    const mimeType = embeddedImageMimeTypes.get(path.extname(realImagePath).toLowerCase());
    if (!mimeType) throw new Error(`签名图片仅支持 PNG、JPEG、GIF 或 WebP：${originalValue}`);

    const dataUri = `data:${mimeType};base64,${fs.readFileSync(realImagePath).toString('base64')}`;
    const outputQuote = quote || '"';
    return `${prefix}${outputQuote}${dataUri}${outputQuote}`;
  });

  if (Buffer.byteLength(packaged, 'utf8') > maximumTemplateBytes) {
    throw new Error('图片打包后的签名文件不能超过 20 MB。');
  }
  return packaged;
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
  if (extension === '.html' || extension === '.htm') {
    const packagedHtml = embedLocalHtmlImages(sourcePath, fs.readFileSync(sourcePath, 'utf8'));
    fs.writeFileSync(destination, packagedHtml, 'utf8');
  } else {
    fs.copyFileSync(sourcePath, destination);
  }
  const selectedTemplateId = `user:${encodeURIComponent(path.basename(destination))}`;
  writeSettings({ selectedTemplateId });
  return currentState();
}

export function renameTemplate(id: string, name: string): TemplateState {
  const template = requireEntry(id);
  if (template.source !== 'user') throw new Error('应用内置示例不能重命名。');
  if (typeof name !== 'string') throw new Error('签名名称无效。');
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (!normalizedName) throw new Error('请输入签名名称。');
  if (normalizedName.length > 60) throw new Error('签名名称不能超过 60 个字符。');
  if (/[\u0000-\u001f\u007f]/.test(normalizedName)) throw new Error('签名名称包含不允许的控制字符。');

  const settings = readSettings();
  writeSettings({ templateNames: { ...(settings.templateNames ?? {}), [id]: normalizedName } });
  return currentState();
}

export function deleteTemplate(id: string): TemplateState {
  const template = requireEntry(id);
  if (template.source !== 'user') throw new Error('应用内置示例不能删除。');
  fs.unlinkSync(template.fullPath);
  const settings = readSettings();
  const templateNames = { ...(settings.templateNames ?? {}) };
  delete templateNames[id];
  writeSettings({ templateNames });
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
