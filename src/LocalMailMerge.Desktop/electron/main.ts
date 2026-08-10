import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  deleteTemplate,
  getTemplateState,
  getUserTemplateDirectory,
  importTemplate,
  resolveTemplatePath,
  selectTemplate
} from './templateCatalog';

type WorkerCommand = 'inspect-xlsx' | 'import' | 'accounts' | 'create-drafts';

let mainWindow: BrowserWindow | null = null;
const isDemo = process.argv.includes('--demo');
const captureArgument = process.argv.find((argument) => argument.startsWith('--capture='));
const capturePath = captureArgument?.slice('--capture='.length);
const captureStateArgument = process.argv.find((argument) => argument.startsWith('--capture-state='));
const captureState = captureStateArgument?.slice('--capture-state='.length) ?? 'reference';
const smokeArgument = process.argv.find((argument) => argument.startsWith('--smoke-test='));
const smokePath = smokeArgument?.slice('--smoke-test='.length);
const templateTestSourceArgument = process.argv.find((argument) => argument.startsWith('--template-test-source='));
const templateTestSource = templateTestSourceArgument?.slice('--template-test-source='.length);
const templateTestResultArgument = process.argv.find((argument) => argument.startsWith('--template-test-result='));
const templateTestResult = templateTestResultArgument?.slice('--template-test-result='.length);
const windowSizeArgument = process.argv.find((argument) => argument.startsWith('--window-size='));
const windowSizeMatch = windowSizeArgument?.slice('--window-size='.length).match(/^(\d{4})x(\d{3,4})$/i);
const initialWindowSize = windowSizeMatch
  ? { width: Math.max(1100, Number(windowSizeMatch[1])), height: Math.max(680, Number(windowSizeMatch[2])) }
  : { width: 1440, height: 860 };

function isTrustedSender(url: string): boolean {
  if (url.startsWith('file://')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.port === '4173';
  } catch {
    return false;
  }
}

function assertTrustedSender(url: string): void {
  if (!isTrustedSender(url)) throw new Error('不受信任的界面请求。');
}

function assertTrustedEvent(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url;
  if (!url) throw new Error('无法确认界面请求来源。');
  assertTrustedSender(url);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function workerCandidates(): string[] {
  const configured = process.env.LOCAL_MAIL_MERGE_WORKER;
  const resources = process.resourcesPath;
  return [
    configured ?? '',
    path.join(resources, 'publish', 'LocalMailMerge.Worker.exe'),
    path.resolve(__dirname, '..', '..', 'LocalMailMerge.Worker', 'publish', 'LocalMailMerge.Worker.exe'),
    path.resolve(__dirname, '..', '..', 'LocalMailMerge.Worker', 'bin', 'Debug', 'net10.0-windows', 'LocalMailMerge.Worker.exe')
  ].filter(Boolean);
}

function resolveWorker(): string {
  const candidate = workerCandidates().find((item) => fs.existsSync(item));
  if (!candidate) throw new Error('尚未找到 LocalMailMerge.Worker。请先构建本地助手程序。');
  return candidate;
}

function runWorker(command: WorkerCommand, payload: unknown): Promise<unknown> {
  const worker = resolveWorker();
  return new Promise((resolve, reject) => {
    const child = spawn(worker, [command], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `本地助手程序退出，代码 ${code ?? -1}。`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('本地助手程序返回了无法识别的数据。'));
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`, 'utf8');
  });
}

function createWindow(): void {
  const rendererConsoleErrors: string[] = [];
  mainWindow = new BrowserWindow({
    title: 'Local Mail Merge',
    width: initialWindowSize.width,
    height: initialWindowSize.height,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#f7f9fc',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f5f8fc', symbolColor: '#283548', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) rendererConsoleErrors.push(message);
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedSender(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const settingsCapture = ['settings', 'templates', 'outlook', 'safety'].includes(captureState);
  const importCapture = captureState === 'import';
  const warningCapture = captureState === 'warning';
  const captureQuery = warningCapture
    ? 'warningState=1'
    : importCapture
    ? 'importState=1'
    : settingsCapture
    ? `settingsState=${captureState === 'settings' ? 'templates' : captureState}`
    : 'referenceState=1';
  if (rendererUrl) {
    const url = capturePath || importCapture || warningCapture ? `${rendererUrl}/?${captureQuery}` : rendererUrl;
    void mainWindow.loadURL(url);
  } else {
    const query: Record<string, string> = warningCapture
      ? { warningState: '1' }
      : importCapture
      ? { importState: '1' }
      : settingsCapture
      ? { settingsState: captureState === 'settings' ? 'templates' : captureState }
      : { referenceState: '1' };
    const options = capturePath || importCapture || warningCapture ? { query } : undefined;
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'), options);
  }

  mainWindow.once('ready-to-show', () => {
    if (!capturePath) mainWindow?.show();
  });
  if (capturePath) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const image = await mainWindow!.webContents.capturePage();
      fs.mkdirSync(path.dirname(capturePath), { recursive: true });
      fs.writeFileSync(capturePath, image.toPNG());
      mainWindow?.destroy();
      app.exit(0);
    });
  } else if (smokePath) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const interactionResult = await mainWindow!.webContents.executeJavaScript(`
        (async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const checks = {};
          if (${captureState === 'import' ? 'true' : 'false'}) {
            await wait(80);
            checks.dialogOpened = Boolean(document.querySelector('.excel-import-dialog'));
            checks.recommendedSelection = Boolean(document.querySelector('.excel-import-recommendation.is-recommended'));
            const sheetSelect = document.querySelector('[data-testid="excel-sheet-select"]');
            checks.allSheetsListed = sheetSelect?.options?.length === 6;
            checks.previewVisible = Boolean(document.querySelector('.excel-preview-table'));
            if (sheetSelect) {
              sheetSelect.value = 'Summary';
              sheetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await wait(60);
            checks.sheetChanged = sheetSelect?.value === 'Summary';
            const headerSelect = document.querySelector('[data-testid="excel-header-row-select"]');
            checks.headerSuggested = headerSelect?.value === '4';
            checks.previewUpdated = (document.querySelector('.excel-preview-table')?.textContent ?? '').includes('Metric');
            if (headerSelect) {
              headerSelect.value = '5';
              headerSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await wait(60);
            checks.headerChanged = headerSelect?.value === '5';
            checks.manualHeaderPreviewUpdated = (document.querySelector('.excel-preview-table thead')?.textContent ?? '').includes('Total records');
            document.querySelector('.excel-import-footer .button--ghost')?.click();
            await wait(40);
            checks.dialogClosed = !document.querySelector('.excel-import-dialog');
            return { checks, passed: Object.values(checks).every(Boolean) };
          }
          const fieldButton = document.querySelector('.field-button');
          fieldButton?.click();
          await wait(40);
          checks.fieldManagerOpened = Boolean(document.querySelector('.field-manager'));
          document.querySelector('.field-row--hidden input')?.click();
          await wait(40);
          checks.fieldVisibilityChanged = document.querySelector('.field-count')?.textContent?.includes('8 / 14') ?? false;
          document.querySelector('.field-manager .button--primary')?.click();
          await wait(40);
          checks.fieldManagerClosed = !document.querySelector('.field-manager');

          const roleFilter = document.querySelector('[data-filter-id="target_role"]');
          roleFilter?.click();
          await wait(40);
          checks.filterOpened = Boolean(document.querySelector('.filter-popover'));
          document.querySelector('.filter-options input')?.click();
          document.querySelector('.filter-footer .button--primary')?.click();
          await wait(60);
          const filteredRows = document.querySelectorAll('tbody tr').length;
          checks.filterApplied = filteredRows > 0 && filteredRows < 16;

          const warningRow = document.querySelector('tbody tr.is-warning');
          const warningCheckbox = warningRow?.querySelector('input[type="checkbox"]');
          checks.warningSelectable = Boolean(warningCheckbox && !warningCheckbox.disabled);
          warningCheckbox?.click();
          await wait(30);
          checks.warningSelected = Boolean(warningCheckbox?.checked);
          warningRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(40);
          checks.rowDrivesPreview = (document.querySelector('.preview-metadata')?.textContent ?? '').length > 20;
          checks.warningBannerVisible = Boolean(document.querySelector('.validation-banner--warning'));

          checks.templateDropdownPopulated = document.querySelectorAll('#template option').length > 0;
          document.querySelector('button[aria-label="设置"]')?.click();
          await wait(50);
          checks.settingsOpened = Boolean(document.querySelector('.settings-dialog'));
          document.querySelector('[data-settings-tab="outlook"]')?.click();
          await wait(30);
          checks.outlookSettingsAvailable = Boolean(document.querySelector('.account-list'));
          document.querySelector('[data-settings-tab="safety"]')?.click();
          await wait(30);
          checks.safetySettingsAvailable = Boolean(document.querySelector('.safety-card'));
          document.querySelector('.settings-header button[aria-label="关闭设置"]')?.click();
          await wait(30);
          checks.settingsClosed = !document.querySelector('.settings-dialog');

          roleFilter?.click();
          await wait(30);
          document.querySelector('.filter-footer .text-button--muted')?.click();
          await wait(50);
          checks.filterCleared = document.querySelectorAll('tbody tr').length === 16;
          const blockedRow = document.querySelector('tbody tr.is-blocked');
          const blockedCheckbox = blockedRow?.querySelector('input[type="checkbox"]');
          checks.blockedNotSelectable = Boolean(blockedCheckbox?.disabled);
          blockedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(30);
          checks.blockReasonVisible = Boolean(document.querySelector('.validation-banner--blocked li'));

          document.querySelector('.create-button')?.click();
          await wait(40);
          checks.draftConfirmationOpened = Boolean(document.querySelector('.confirm-dialog'));
          checks.warningSummarizedBeforeCreate = Boolean(document.querySelector('.confirm-warning'));
          document.querySelector('.confirm-close')?.click();
          await wait(30);
          checks.draftConfirmationClosed = !document.querySelector('.confirm-dialog');
          return { checks, passed: Object.values(checks).every(Boolean) };
        })()
      `, true) as { checks: Record<string, boolean>; passed: boolean };
      const result = {
        ...interactionResult,
        consoleErrors: rendererConsoleErrors,
        passed: interactionResult.passed && rendererConsoleErrors.length === 0
      };
      fs.mkdirSync(path.dirname(smokePath), { recursive: true });
      fs.writeFileSync(smokePath, JSON.stringify(result, null, 2));
      mainWindow?.destroy();
      app.exit(result.passed ? 0 : 1);
    });
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  if (templateTestSource && templateTestResult) {
    try {
      const imported = importTemplate(templateTestSource);
      const importedTemplate = imported.templates.find((template) => template.source === 'user');
      if (!importedTemplate) throw new Error('导入后没有找到用户模板。');
      const resolved = resolveTemplatePath(importedTemplate.id);
      const copiedIntoCatalog = fs.existsSync(resolved);
      const selected = selectTemplate(importedTemplate.id);
      const afterDelete = deleteTemplate(importedTemplate.id);
      const result = {
        checks: {
          copiedIntoCatalog,
          selectedAfterImport: selected.selectedTemplateId === importedTemplate.id,
          removedFromCatalog: !afterDelete.templates.some((template) => template.id === importedTemplate.id)
        }
      };
      const output = { ...result, passed: Object.values(result.checks).every(Boolean) };
      fs.mkdirSync(path.dirname(templateTestResult), { recursive: true });
      fs.writeFileSync(templateTestResult, JSON.stringify(output, null, 2));
      app.exit(output.passed ? 0 : 1);
    } catch (error) {
      fs.mkdirSync(path.dirname(templateTestResult), { recursive: true });
      fs.writeFileSync(templateTestResult, JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
      app.exit(1);
    }
    return;
  }

  ipcMain.handle('dialog:select-package', async (event) => {
    assertTrustedEvent(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择邮件交接包',
      properties: ['openFile'],
      filters: [{ name: '交接包', extensions: ['json', 'csv', 'xlsx'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('templates:get-state', (event) => {
    assertTrustedEvent(event);
    return getTemplateState();
  });
  ipcMain.handle('templates:import', async (event) => {
    assertTrustedEvent(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入公司模板或签名',
      properties: ['openFile'],
      filters: [{ name: '公司模板', extensions: ['oft', 'html', 'htm'] }]
    });
    return result.canceled ? null : importTemplate(result.filePaths[0]);
  });
  ipcMain.handle('templates:delete', (event, id: string) => {
    assertTrustedEvent(event);
    return deleteTemplate(id);
  });
  ipcMain.handle('templates:select', (event, id: string) => {
    assertTrustedEvent(event);
    return selectTemplate(id);
  });
  ipcMain.handle('templates:open-folder', async (event) => {
    assertTrustedEvent(event);
    const error = await shell.openPath(getUserTemplateDirectory());
    if (error) throw new Error(error);
  });

  ipcMain.handle('worker:inspect-xlsx', (event, filePath: string) => {
    assertTrustedEvent(event);
    if (typeof filePath !== 'string' || filePath.length > 4096) throw new Error('交接包路径无效。');
    return runWorker('inspect-xlsx', { path: filePath });
  });
  ipcMain.handle('worker:import', (event, filePath: string, options?: unknown) => {
    assertTrustedEvent(event);
    if (typeof filePath !== 'string' || filePath.length > 4096) throw new Error('交接包路径无效。');
    if (options === undefined) return runWorker('import', { path: filePath });
    const record = requireRecord(options, 'Excel 导入参数无效。');
    const worksheetName = typeof record.worksheetName === 'string' ? record.worksheetName.trim() : '';
    const headerRowNumber = typeof record.headerRowNumber === 'number' ? record.headerRowNumber : 0;
    if (!worksheetName || worksheetName.length > 128 || !Number.isInteger(headerRowNumber) || headerRowNumber < 1 || headerRowNumber > 1_048_576) {
      throw new Error('Excel Sheet 或字段行参数无效。');
    }
    return runWorker('import', { path: filePath, worksheetName, headerRowNumber });
  });
  ipcMain.handle('worker:accounts', (event) => {
    assertTrustedEvent(event);
    if (isDemo) return [{ index: 1, displayName: 'John Doe', smtpAddress: 'john.doe@example.test', storeId: 'demo-store' }];
    return runWorker('accounts', {});
  });
  ipcMain.handle('worker:create-drafts', (event, payload: unknown) => {
    assertTrustedEvent(event);
    const record = requireRecord(payload, '创建草稿参数无效。');
    const templateId = typeof record.templateId === 'string' ? record.templateId : '';
    const templatePath = resolveTemplatePath(templateId);
    const { templateId: _templateId, ...workerPayload } = record;
    return runWorker('create-drafts', { ...workerPayload, templatePath });
  });
  ipcMain.handle('window:minimize', (event) => {
    assertTrustedEvent(event);
    mainWindow?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', (event) => {
    assertTrustedEvent(event);
    if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize();
  });
  ipcMain.handle('window:close', (event) => {
    assertTrustedEvent(event);
    mainWindow?.close();
  });
  ipcMain.handle('shell:open-outlook', async (event) => {
    assertTrustedEvent(event);
    await shell.openExternal('outlook:');
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
