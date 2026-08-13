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
const autoImportArgument = process.argv.find((argument) => argument.startsWith('--auto-import='));
const autoImportPath = autoImportArgument?.slice('--auto-import='.length);
const templateTestSourceArgument = process.argv.find((argument) => argument.startsWith('--template-test-source='));
const templateTestSource = templateTestSourceArgument?.slice('--template-test-source='.length);
const templateTestResultArgument = process.argv.find((argument) => argument.startsWith('--template-test-result='));
const templateTestResult = templateTestResultArgument?.slice('--template-test-result='.length);
const windowSizeArgument = process.argv.find((argument) => argument.startsWith('--window-size='));
const windowSizeMatch = windowSizeArgument?.slice('--window-size='.length).match(/^(\d{4})x(\d{3,4})$/i);
const initialWindowSize = windowSizeMatch
  ? { width: Math.max(1000, Number(windowSizeMatch[1])), height: Math.max(620, Number(windowSizeMatch[2])) }
  : { width: 1366, height: 768 };

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
    minWidth: 1000,
    minHeight: 620,
    backgroundColor: '#f8fafc',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
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
  const publishMaximizedState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
  };
  mainWindow.on('maximize', publishMaximizedState);
  mainWindow.on('unmaximize', publishMaximizedState);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const settingsCapture = ['settings', 'templates', 'signatures', 'outlook', 'safety'].includes(captureState);
  const importCapture = captureState === 'import';
  const realImportCapture = captureState === 'real-import';
  const warningCapture = captureState === 'warning';
  const warningPreviewCapture = captureState === 'warning-preview';
  const validationCapture = captureState === 'validation';
  const longPathCapture = captureState === 'long-path';
  const accountMenuCapture = captureState === 'account-menu';
  const signatureMenuCapture = captureState === 'signature-menu';
  const fieldMenuCapture = captureState === 'field-menu';
  const filterPartialCapture = captureState === 'filter-partial';
  const statusMenuCapture = captureState === 'status-menu';
  const selectedRowCapture = captureState === 'selected-row';
  const shortColumnsCapture = captureState === 'short-columns';
  const settingsCaptureValue = captureState === 'outlook' || captureState === 'safety' ? captureState : 'signatures';
  const captureQuery = accountMenuCapture
    ? 'accountMenuState=1'
    : signatureMenuCapture
    ? 'signatureMenuState=1'
    : fieldMenuCapture
    ? 'fieldMenuState=1'
    : filterPartialCapture
    ? 'filterMenuState=1'
    : statusMenuCapture
    ? 'statusMenuState=1'
    : selectedRowCapture
    ? 'selectedRowState=1'
    : shortColumnsCapture
    ? 'shortColumnsState=1'
    : warningCapture
    ? 'warningState=1'
    : warningPreviewCapture
    ? 'warningPreviewState=1'
    : validationCapture
    ? 'validationState=1'
    : longPathCapture
    ? 'longPathState=1'
    : importCapture
    ? 'importState=1'
    : settingsCapture
    ? `settingsState=${settingsCaptureValue}`
    : captureState === 'reference' ? 'referenceState=1' : '';
  if (rendererUrl) {
    const url = capturePath || importCapture || realImportCapture || warningCapture || accountMenuCapture || signatureMenuCapture || fieldMenuCapture || filterPartialCapture || statusMenuCapture || selectedRowCapture || shortColumnsCapture || settingsCapture
      ? `${rendererUrl}/${captureQuery ? `?${captureQuery}` : ''}`
      : rendererUrl;
    void mainWindow.loadURL(url);
  } else {
    const query: Record<string, string> = warningCapture
      ? { warningState: '1' }
      : warningPreviewCapture
      ? { warningPreviewState: '1' }
      : validationCapture
      ? { validationState: '1' }
      : longPathCapture
      ? { longPathState: '1' }
      : importCapture
      ? { importState: '1' }
      : accountMenuCapture
      ? { accountMenuState: '1' }
      : signatureMenuCapture
      ? { signatureMenuState: '1' }
      : fieldMenuCapture
      ? { fieldMenuState: '1' }
      : filterPartialCapture
      ? { filterMenuState: '1' }
      : statusMenuCapture
      ? { statusMenuState: '1' }
      : selectedRowCapture
      ? { selectedRowState: '1' }
      : shortColumnsCapture
      ? { shortColumnsState: '1' }
      : settingsCapture
      ? { settingsState: settingsCaptureValue }
      : captureState === 'reference' ? { referenceState: '1' } : {};
    const options = capturePath || importCapture || realImportCapture || warningCapture || accountMenuCapture || signatureMenuCapture || fieldMenuCapture || filterPartialCapture || statusMenuCapture || selectedRowCapture || shortColumnsCapture || settingsCapture ? { query } : undefined;
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'), options);
  }

  mainWindow.once('ready-to-show', () => {
    if (!capturePath) mainWindow?.show();
  });
  if (capturePath) {
    const captureLoadedRenderer = async () => {
      if (mainWindow!.webContents.getURL() === 'about:blank') return;
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (realImportCapture) {
        await mainWindow!.webContents.executeJavaScript(`document.querySelector('.import-button')?.click()`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (settingsCapture) {
        const settingsOpened = await mainWindow!.webContents.executeJavaScript(`
          (async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const deadline = performance.now() + 2000;
            while (!document.querySelector('.settings-dialog') && performance.now() < deadline) {
              const settingsButton = document.querySelector('button[aria-label="设置"]');
              if (settingsButton) {
                settingsButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
                settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
              }
              await wait(50);
            }
            return Boolean(document.querySelector('.settings-dialog'));
          })()
        `) as boolean;
        if (!settingsOpened) throw new Error('设置页验收截图未能打开设置弹窗。');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (statusMenuCapture) {
        await mainWindow!.webContents.executeJavaScript(`
          (() => {
            const trigger = document.querySelector('[aria-label="筛选校验状态"]');
            trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
            trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (filterPartialCapture) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      if (validationCapture) {
        await mainWindow!.webContents.executeJavaScript(`
          (() => {
            const tableScroll = document.querySelector('.table-frame');
            if (tableScroll) tableScroll.scrollLeft = tableScroll.scrollWidth;
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (longPathCapture || warningPreviewCapture) {
        await mainWindow!.webContents.executeJavaScript(`
          (() => {
            const pathBox = document.querySelector('.path-box');
            const directory = document.querySelector('.path-directory');
            const filename = document.querySelector('.path-filename');
            if (pathBox) pathBox.setAttribute('title', 'C:\\\\Users\\\\Example\\\\Downloads\\\\HK_University_Research_Talent_List_2026-07-29.xlsx');
            if (directory) directory.textContent = 'C:\\\\Users\\\\Example\\\\Downloads';
            if (filename) filename.textContent = 'HK_University_Research_Talent_List_2026-07-29.xlsx';
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (shortColumnsCapture) {
        await mainWindow!.webContents.executeJavaScript(`
          (() => {
            const table = document.querySelector('.data-table');
            if (!table) return;
            const sizes = [42, 78, 82, 76, 76, 76, 76, 84];
            sizes.forEach((size, index) => table.style.setProperty('--mail-table-column-' + index + '-size', size + 'px'));
            const total = sizes.reduce((sum, size) => sum + size, 0);
            table.style.width = total + 'px';
            table.style.minWidth = total + 'px';
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const image = await mainWindow!.webContents.capturePage();
      fs.mkdirSync(path.dirname(capturePath), { recursive: true });
      fs.writeFileSync(capturePath, image.toPNG());
      mainWindow?.destroy();
      app.exit(0);
    };
    mainWindow.webContents.on('did-finish-load', captureLoadedRenderer);
  } else if (smokePath) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (captureState === 'performance') {
        const performanceResult = await mainWindow!.webContents.executeJavaScript(`
          (async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
            const waitUntil = async (predicate, timeout = 30000) => {
              const started = performance.now();
              while (performance.now() - started < timeout) {
                if (predicate()) return true;
                await wait(25);
              }
              return false;
            };
            const setInputValue = (input, value) => {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
              setter?.call(input, value);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            const checks = {};
            const timings = {};
            const importStarted = performance.now();
            document.querySelector('.import-button')?.click();
            checks.importDialogOpened = await waitUntil(() => Boolean(document.querySelector('.excel-import-dialog')), 15000);
            document.querySelector('[data-testid="excel-import-confirm"]')?.click();
            checks.largeBatchRendered = await waitUntil(() => Number(document.querySelector('[data-testid="virtualized-table-frame"]')?.getAttribute('data-total-rows') ?? 0) >= 700, 60000);
            timings.importAndRenderMs = Math.round(performance.now() - importStarted);

            const frame = document.querySelector('[data-testid="virtualized-table-frame"]');
            const totalRows = Number(frame?.getAttribute('data-total-rows') ?? 0);
            const renderedRows = Number(frame?.getAttribute('data-rendered-rows') ?? 0);
            const fieldCountText = document.querySelector('.field-count')?.textContent ?? '';
            checks.actualLargeBatch = totalRows >= 700;
            checks.rowsAreVirtualized = renderedRows > 0 && renderedRows < 60;
            checks.realFieldsLoaded = Number.parseInt(fieldCountText.split('/').at(-1) ?? '0', 10) >= 20;

            const scrollStarted = performance.now();
            if (frame) frame.scrollTop = frame.scrollHeight;
            await nextFrame();
            await nextFrame();
            await wait(30);
            timings.scrollToEndMs = Math.round(performance.now() - scrollStarted);
            const renderedIndexes = [...document.querySelectorAll('.virtual-table-row')].map((row) => Number(row.getAttribute('data-index')));
            checks.lastRowReachable = renderedIndexes.includes(totalRows - 1);
            checks.scrollResponsive = timings.scrollToEndMs < 250;

            const lastRow = [...document.querySelectorAll('.virtual-table-row')].at(-1);
            const lastRowName = lastRow?.querySelector('[data-slot="table-cell"]:nth-child(2)')?.textContent?.trim() ?? '';
            const previewStarted = performance.now();
            lastRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await nextFrame();
            await wait(20);
            timings.previewSwitchMs = Math.round(performance.now() - previewStarted);
            checks.previewTracksRow = Boolean(lastRowName) && document.querySelector('.preview-header h2')?.textContent?.trim() === lastRowName;
            checks.previewResponsive = timings.previewSwitchMs < 250;

            const searchInput = document.querySelector('.global-search input');
            const searchStarted = performance.now();
            if (searchInput) setInputValue(searchInput, '__no_matching_person__');
            checks.searchCompleted = await waitUntil(() => Number(frame?.getAttribute('data-total-rows') ?? -1) === 0, 2000);
            timings.searchNoMatchMs = Math.round(performance.now() - searchStarted);
            checks.searchResponsive = timings.searchNoMatchMs < 750;
            if (searchInput) setInputValue(searchInput, '');
            await waitUntil(() => Number(frame?.getAttribute('data-total-rows') ?? 0) === totalRows, 2000);
            if (frame) frame.scrollTop = 0;
            await nextFrame();
            await nextFrame();

            const resizer = document.querySelector('[data-column-resizer]');
            const header = resizer?.closest('th');
            const initialWidth = header?.getBoundingClientRect().width ?? 0;
            const startX = resizer?.getBoundingClientRect().right ?? 0;
            resizer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: startX }));
            document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, clientX: startX + 48 }));
            await nextFrame();
            const liveWidth = header?.getBoundingClientRect().width ?? 0;
            checks.columnResizeHasLiveFeedback = liveWidth >= initialWidth + 30;
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: startX + 48 }));
            await nextFrame();
            const committedWidth = header?.getBoundingClientRect().width ?? 0;
            checks.columnResizeCommitted = committedWidth >= initialWidth + 30;

            const firstCheckbox = document.querySelector('.virtual-table-row [data-slot="checkbox"]:not([data-disabled])');
            const selectionStarted = performance.now();
            firstCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await nextFrame();
            timings.selectionMs = Math.round(performance.now() - selectionStarted);
            checks.selectionResponsive = timings.selectionMs < 250;

            return {
              checks,
              metrics: { totalRows, renderedRows, fieldCountText, ...timings },
              passed: Object.values(checks).every(Boolean)
            };
          })()
        `, true) as { checks: Record<string, boolean>; metrics: Record<string, string | number>; passed: boolean };
        const result = {
          ...performanceResult,
          consoleErrors: rendererConsoleErrors,
          passed: performanceResult.passed && rendererConsoleErrors.length === 0
        };
        fs.mkdirSync(path.dirname(smokePath), { recursive: true });
        fs.writeFileSync(smokePath, JSON.stringify(result, null, 2));
        mainWindow?.destroy();
        app.exit(result.passed ? 0 : 1);
        return;
      }
      const interactionResult = await mainWindow!.webContents.executeJavaScript(`
        (async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const checks = {};
          if (${captureState === 'import' ? 'true' : 'false'}) {
            await wait(80);
            checks.dialogOpened = Boolean(document.querySelector('.excel-import-dialog'));
            checks.recommendedSelection = Boolean(document.querySelector('.excel-import-recommendation.is-recommended'));
            checks.previewVisible = Boolean(document.querySelector('.excel-preview-table'));
            const previewFrame = document.querySelector('.excel-preview-frame');
            const previewTable = document.querySelector('.excel-preview-table');
            const previewHeaderCells = [...document.querySelectorAll('.excel-preview-table [data-slot="table-head"]')];
            checks.previewUsesReadableFixedColumns = previewHeaderCells.slice(1).every((cell) => cell.getBoundingClientRect().width >= 140);
            checks.previewScrollsHorizontally = Boolean(previewFrame && previewTable && previewTable.scrollWidth > previewFrame.clientWidth);
            checks.previewKeepsRowsAligned = previewHeaderCells.every((cell, index) => {
              const bodyCell = document.querySelector('.excel-preview-table [data-slot="table-row"]:nth-child(1) [data-slot="table-cell"]:nth-child(' + (index + 1) + ')');
              return !bodyCell || Math.abs(cell.getBoundingClientRect().width - bodyCell.getBoundingClientRect().width) <= 1;
            });
            const sheetSelect = document.querySelector('[data-testid="excel-sheet-select"]');
            const headerSelect = document.querySelector('[data-testid="excel-header-row-select"]');
            checks.usesCustomSheetSelect = sheetSelect?.getAttribute('role') === 'combobox';
            checks.usesCustomHeaderSelect = headerSelect?.getAttribute('role') === 'combobox';
            sheetSelect?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
            sheetSelect?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
            await wait(40);
            checks.allSheetsListed = document.querySelectorAll('[data-slot="select-item"]').length === 6;
            const summaryOption = [...document.querySelectorAll('[data-slot="select-item"]')].find((item) => item.textContent?.includes('Summary'));
            summaryOption?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
            summaryOption?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
            summaryOption?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
            await wait(60);
            checks.sheetChanged = sheetSelect?.textContent?.includes('Summary') ?? false;
            checks.previewUpdated = (document.querySelector('.excel-preview-table')?.textContent ?? '').includes('Metric');
            document.querySelector('.excel-import-footer [data-variant="outline"]')?.click();
            await wait(40);
            checks.dialogClosed = !document.querySelector('.excel-import-dialog');
            return { checks, passed: Object.values(checks).every(Boolean) };
          }
          const heightOf = (selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().height ?? 0);
          checks.commandBarHeight = heightOf('.command-bar') === 54;
          checks.summaryBarHeight = heightOf('.summary-bar') === 40;
          checks.tableToolbarHeight = heightOf('.table-toolbar') === 44;
          const globalSearchRect = document.querySelector('.global-search')?.getBoundingClientRect();
          const statusTriggerRect = document.querySelector('[aria-label="筛选校验状态"]')?.getBoundingClientRect();
          checks.globalSearchUsesMiraDensity = Boolean(globalSearchRect && statusTriggerRect && globalSearchRect.height <= 28 && Math.abs(globalSearchRect.height - statusTriggerRect.height) <= 1);
          checks.tableHeaderHeight = heightOf('thead th') === 34;
          checks.tableRowHeight = heightOf('tbody td') === 32;
          checks.primaryActionHeight = heightOf('.create-button') === 36;

          const activeRow = document.querySelector('.virtual-table-row.is-active');
          const activeRowCells = [...(activeRow?.querySelectorAll('[data-slot="table-cell"]') ?? [])];
          const tableElement = document.querySelector('.data-table');
          const activeRowRect = activeRow?.getBoundingClientRect();
          const tableRect = tableElement?.getBoundingClientRect();
          const activeBackground = activeRow ? getComputedStyle(activeRow).backgroundColor : '';
          checks.activeHighlightSpansEntireRow = Boolean(
            activeRowRect && tableRect && activeRowCells.length > 1 &&
            Math.abs(activeRowRect.width - tableRect.width) <= 1 &&
            activeBackground !== 'rgba(0, 0, 0, 0)' && activeBackground !== 'transparent'
          );
          const firstCell = activeRowCells[0];
          const checkedBox = firstCell?.querySelector('[data-slot="checkbox"]');
          const firstCellRect = firstCell?.getBoundingClientRect();
          const checkedBoxRect = checkedBox?.getBoundingClientRect();
          checks.rowCheckboxCentered = Boolean(firstCellRect && checkedBoxRect && Math.abs((firstCellRect.left + firstCellRect.width / 2) - (checkedBoxRect.left + checkedBoxRect.width / 2)) <= 1);
          checks.checkedCheckboxUsesPrimaryFill = Boolean(checkedBox?.getAttribute('data-state') === 'checked' && getComputedStyle(checkedBox).backgroundColor !== 'rgba(0, 0, 0, 0)');
          const disabledBox = document.querySelector('.virtual-table-row.is-blocked [data-slot="checkbox"]');
          checks.disabledCheckboxIsDistinct = Boolean(disabledBox?.getAttribute('data-disabled') !== null && getComputedStyle(disabledBox).backgroundColor !== getComputedStyle(checkedBox).backgroundColor);

          if (tableElement) {
            const originalTableStyle = tableElement.getAttribute('style') ?? '';
            const headerCells = [...tableElement.querySelectorAll('.virtual-table-header-row [data-slot="table-head"]')];
            const shortSizes = headerCells.map((_cell, index) => index === 0 ? 42 : 76);
            shortSizes.forEach((size, index) => tableElement.style.setProperty('--mail-table-column-' + index + '-size', size + 'px'));
            const shortTotal = shortSizes.reduce((sum, size) => sum + size, 0);
            tableElement.style.width = shortTotal + 'px';
            tableElement.style.minWidth = shortTotal + 'px';
            await wait(30);
            const firstVirtualRowCells = [...(document.querySelector('.virtual-table-row')?.querySelectorAll('[data-slot="table-cell"]') ?? [])];
            checks.headerBodyStayAlignedBelowViewportWidth = headerCells.every((headerCell, index) => {
              const bodyCell = firstVirtualRowCells[index];
              if (!bodyCell) return false;
              const headerRect = headerCell.getBoundingClientRect();
              const bodyRect = bodyCell.getBoundingClientRect();
              return Math.abs(headerRect.left - bodyRect.left) <= 1 && Math.abs(headerRect.width - bodyRect.width) <= 1;
            }) && shortTotal < (document.querySelector('.table-frame')?.clientWidth ?? 0);
            tableElement.setAttribute('style', originalTableStyle);
            await wait(30);
          }

          const pathBox = document.querySelector('.path-box');
          const pathCopy = document.querySelector('.path-copy');
          const pathDirectory = document.querySelector('.path-directory');
          const pathFilename = document.querySelector('.path-filename');
          const accountField = document.querySelector('.account-field');
          const originalDirectory = pathDirectory?.textContent ?? '';
          const originalFilename = pathFilename?.textContent ?? '';
          if (pathDirectory) pathDirectory.textContent = 'C:\\\\Users\\\\Example\\\\Downloads';
          if (pathFilename) pathFilename.textContent = 'HK_University_Research_Talent_List_2026-07-29.xlsx';
          await wait(20);
          const pathBoxRect = pathBox?.getBoundingClientRect();
          const pathCopyRect = pathCopy?.getBoundingClientRect();
          const pathFilenameRect = pathFilename?.getBoundingClientRect();
          const accountRect = accountField?.getBoundingClientRect();
          checks.longPathClippedInsideControl = Boolean(pathBoxRect && pathCopyRect && pathFilenameRect && pathFilenameRect.right <= pathCopyRect.right + 1);
          checks.longPathDoesNotOverlapAccount = Boolean(pathBoxRect && accountRect && pathBoxRect.right <= accountRect.left);
          if (pathDirectory) pathDirectory.textContent = originalDirectory;
          if (pathFilename) pathFilename.textContent = originalFilename;

          const statusTrigger = document.querySelector('[aria-label="筛选校验状态"]');
          statusTrigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          statusTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(30);
          const statusMenu = document.querySelector('[data-testid="status-filter-menu"]');
          checks.statusUsesMiraRadioMenu = Boolean(statusMenu && statusMenu.querySelectorAll('[data-slot="dropdown-menu-radio-item"]').length === 7);
          const statusMenuRect = statusMenu?.getBoundingClientRect();
          checks.statusMenuCompact = Boolean(statusMenuRect && statusMenuRect.width <= 190 && statusMenuRect.height <= 250);
          document.querySelector('.preview-pane')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          await wait(30);

          const fieldButton = document.querySelector('.field-button');
          fieldButton?.click();
          await wait(40);
          checks.fieldManagerOpened = Boolean(document.querySelector('.field-manager'));
          const fieldManagerRect = document.querySelector('.field-manager')?.getBoundingClientRect();
          const fieldManagerFooterRect = document.querySelector('.field-manager .popover-actions')?.getBoundingClientRect();
          checks.fieldManagerCompactAndComplete = Boolean(fieldManagerRect && fieldManagerFooterRect && fieldManagerRect.width <= 270 && fieldManagerRect.height <= 470 && fieldManagerFooterRect.bottom <= fieldManagerRect.bottom + 1);
          const hiddenFieldLabel = [...document.querySelectorAll('.field-list-section')].at(-1);
          hiddenFieldLabel?.querySelector('[data-slot="checkbox"]')?.click();
          await wait(40);
          checks.fieldVisibilityChanged = document.querySelector('.field-count')?.textContent?.includes('8 / 14') ?? false;
          document.querySelector('.field-manager [data-slot="button"]:last-child')?.click();
          await wait(40);
          checks.fieldManagerClosed = !document.querySelector('.field-manager');

          checks.validationEligibleLabel = document.querySelector('.validation-pill--eligible')?.textContent === '可创建';
          checks.validationWarningLabel = document.querySelector('.validation-pill--warning')?.textContent === '警告';
          checks.validationBlockedLabel = document.querySelector('.validation-pill--blocked')?.textContent === '已拦截';

          const nameResizer = document.querySelector('[data-column-resizer="recipient_name"]');
          const nameHeader = nameResizer?.closest('th');
          const initialNameWidth = nameHeader?.getBoundingClientRect().width ?? 0;
          nameResizer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 360 }));
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, clientX: 408 }));
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 408 }));
          await wait(50);
          checks.columnResized = (nameHeader?.getBoundingClientRect().width ?? 0) >= initialNameWidth + 30;

          let roleFilter = document.querySelector('[data-filter-id="target_role"]');
          roleFilter?.click();
          await wait(40);
          checks.filterOpened = Boolean(document.querySelector('.filter-popover'));
          const filterPopoverRect = document.querySelector('.filter-popover')?.getBoundingClientRect();
          const filterFooterRect = document.querySelector('.filter-popover .filter-footer')?.getBoundingClientRect();
          checks.filterCompactAndComplete = Boolean(filterPopoverRect && filterFooterRect && filterPopoverRect.width <= 240 && filterFooterRect.bottom <= filterPopoverRect.bottom + 1);
          document.querySelector('.preview-pane')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          document.querySelector('.preview-pane')?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(40);
          checks.filterClosedOnOutsideClick = !document.querySelector('.filter-popover');
          roleFilter = document.querySelector('[data-filter-id="target_role"]');
          roleFilter?.click();
          await wait(40);
          const filterCheckbox = document.querySelector('.filter-options [data-slot="checkbox"]');
          filterCheckbox?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          filterCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(40);
          const filterMasterCheckbox = document.querySelector('.filter-all-row [data-slot="checkbox"]');
          const filterMasterCheckIcon = filterMasterCheckbox?.querySelector('.checkbox-check-icon');
          const filterMasterMinusIcon = filterMasterCheckbox?.querySelector('.checkbox-indeterminate-icon');
          const filterMasterRect = filterMasterCheckbox?.getBoundingClientRect();
          const filterOptionRect = filterCheckbox?.getBoundingClientRect();
          const filterMasterSeparator = document.querySelector('.filter-master-separator');
          const applyFilterButton = [...document.querySelectorAll('.filter-footer [data-slot="button"]')]
            .find((button) => button.textContent?.trim() === '应用');
          checks.filterSelectionChanged = filterCheckbox?.getAttribute('data-state') === 'unchecked';
          checks.filterMasterBecomesIndeterminate = filterMasterCheckbox?.getAttribute('data-state') === 'indeterminate';
          checks.filterMasterUsesDash = Boolean(filterMasterCheckIcon && filterMasterMinusIcon && getComputedStyle(filterMasterCheckIcon).display === 'none' && getComputedStyle(filterMasterMinusIcon).display !== 'none');
          checks.filterMasterAlignedWithOptions = Boolean(filterMasterRect && filterOptionRect && Math.abs(filterMasterRect.left - filterOptionRect.left) <= 1);
          checks.filterMasterSeparatedFromOptions = Boolean(filterMasterSeparator);
          applyFilterButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
          applyFilterButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(60);
          const filteredRows = document.querySelectorAll('tbody tr').length;
          checks.filterClosedAfterApply = !document.querySelector('.filter-popover');
          checks.filterApplied = filteredRows > 0 && filteredRows < 16;

          const warningRow = document.querySelector('tbody tr.is-warning');
          const warningCheckbox = warningRow?.querySelector('[data-slot="checkbox"]');
          checks.warningSelectable = Boolean(warningCheckbox && warningCheckbox.getAttribute('data-disabled') === null);
          warningCheckbox?.click();
          await wait(30);
          checks.warningSelected = warningCheckbox?.getAttribute('data-state') === 'checked';
          warningRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(40);
          checks.rowDrivesPreview = (document.querySelector('.preview-metadata')?.textContent ?? '').length > 20;
          checks.warningBannerVisible = Boolean(document.querySelector('.validation-banner--warning'));

          checks.pathUsesMiddleEllipsis = Boolean(document.querySelector('.path-directory') && document.querySelector('.path-filename')?.textContent?.includes('.json'));
          checks.accountUsesCustomDropdown = Boolean(document.querySelector('[data-testid="account-dropdown-trigger"]')) && !document.querySelector('#account')?.matches('select');
          const accountDropdown = document.querySelector('[data-testid="account-dropdown-trigger"]');
          for (let attempt = 0; attempt < 20 && accountDropdown?.disabled; attempt++) await wait(50);
          accountDropdown?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
          accountDropdown?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(30);
          checks.accountDropdownOpened = Boolean(document.querySelector('[data-testid="account-dropdown-menu"]'));
          document.querySelector('[data-testid="account-dropdown-option"]')?.click();
          await wait(30);
          checks.accountDropdownClosed = !document.querySelector('[data-testid="account-dropdown-menu"]');

          const signatureDropdown = document.querySelector('[data-testid="signature-dropdown-trigger"]');
          signatureDropdown?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
          signatureDropdown?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(30);
          checks.signatureDropdownPopulated = document.querySelectorAll('[data-testid="signature-dropdown-option"]').length > 0;
          checks.addNewSignatureAvailable = Boolean(document.querySelector('[data-testid="signature-dropdown-action"]'));
          document.querySelector('[data-testid="signature-dropdown-action"]')?.click();
          await wait(50);
          checks.addNewSignatureOpenedSettings = document.querySelector('[data-settings-tab="signatures"]')?.getAttribute('data-active') === 'true';
          document.querySelector('.settings-dialog [data-slot="dialog-close"]')?.click();
          await wait(30);

          document.querySelector('button[aria-label="设置"]')?.click();
          await wait(50);
          checks.settingsOpened = Boolean(document.querySelector('.settings-dialog'));
          checks.settingsDialogConstrained = heightOf('.settings-dialog') <= 610;
          const settingsNavRect = document.querySelector('.settings-sidebar')?.getBoundingClientRect();
          const activeSettingsTab = document.querySelector('.settings-sidebar [data-slot="sidebar-menu-button"][data-active="true"]');
          const settingsDialog = document.querySelector('.settings-dialog');
          const settingsHeaderRect = settingsDialog?.querySelector('.settings-header')?.getBoundingClientRect();
          const settingsLayoutRect = settingsDialog?.querySelector('.settings-layout')?.getBoundingClientRect();
          const settingsFooterRect = settingsDialog?.querySelector('.settings-footer')?.getBoundingClientRect();
          checks.settingsUsesOfficialSidebar = Boolean(document.querySelector('.settings-sidebar [data-slot="sidebar-content"]') && document.querySelector('.settings-sidebar [data-slot="sidebar-menu"]'));
          checks.settingsNavigationFinished = Boolean(settingsNavRect && settingsNavRect.width <= 200 && activeSettingsTab && activeSettingsTab.getBoundingClientRect().height <= 48.5 && getComputedStyle(activeSettingsTab).backgroundColor !== getComputedStyle(document.querySelector('.settings-sidebar')).backgroundColor);
          const settingsTabStyle = activeSettingsTab ? getComputedStyle(activeSettingsTab) : null;
          const settingsTabIcon = activeSettingsTab?.querySelector('svg');
          const settingsTabIconRect = settingsTabIcon?.getBoundingClientRect();
          const settingsTabRect = activeSettingsTab?.getBoundingClientRect();
          checks.settingsMenuUsesShadcnLargeSize = Boolean(activeSettingsTab && settingsTabStyle && settingsTabRect && settingsTabIconRect && activeSettingsTab.getAttribute('data-size') === 'lg' && Math.abs(settingsTabRect.height - 48) <= 0.5 && Math.abs(Number.parseFloat(settingsTabStyle.fontSize) - 14) <= 0.1 && Math.abs(Number.parseFloat(settingsTabStyle.paddingLeft) - 8) <= 0.1 && Math.abs(settingsTabIconRect.width - 16) <= 0.5 && Math.abs(settingsTabIconRect.height - 16) <= 0.5);
          checks.settingsGridGapRemoved = Boolean(settingsDialog && Number.parseFloat(getComputedStyle(settingsDialog).rowGap) === 0);
          checks.settingsSectionsAreContiguous = Boolean(settingsHeaderRect && settingsLayoutRect && settingsFooterRect && Math.abs(settingsHeaderRect.bottom - settingsLayoutRect.top) <= 1 && Math.abs(settingsLayoutRect.bottom - settingsFooterRect.top) <= 1);
          const inactiveSettingsTabs = [...document.querySelectorAll('.settings-sidebar [data-slot="sidebar-menu-button"]')].filter((item) => item !== activeSettingsTab);
          checks.settingsUsesNativeActiveState = Boolean(activeSettingsTab && activeSettingsTab.getAttribute('data-active') === 'true' && getComputedStyle(activeSettingsTab).backgroundColor !== getComputedStyle(document.querySelector('.settings-sidebar')).backgroundColor);
          checks.settingsInactiveTabsDoNotMatchActive = inactiveSettingsTabs.every((item) => item.getAttribute('data-active') === 'false' && getComputedStyle(item).backgroundColor !== getComputedStyle(activeSettingsTab).backgroundColor);
          checks.titlebarDimmedWithSettings = document.documentElement.dataset.titlebarDimmed === 'true';
          document.querySelector('[data-settings-tab="outlook"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          document.querySelector('[data-settings-tab="outlook"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(30);
          checks.outlookSettingsAvailable = Boolean(document.querySelector('.account-list'));
          document.querySelector('[data-settings-tab="safety"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          document.querySelector('[data-settings-tab="safety"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await wait(30);
          checks.safetySettingsAvailable = Boolean(document.querySelector('.safety-card'));
          document.querySelector('.settings-dialog [data-slot="dialog-close"]')?.click();
          await wait(30);
          checks.settingsClosed = !document.querySelector('.settings-dialog');
          checks.titlebarRestoredAfterSettings = document.documentElement.dataset.titlebarDimmed === 'false';

          const selectionRect = document.querySelector('.selection-summary')?.getBoundingClientRect();
          const footerNoteRect = document.querySelector('.footer-bar p')?.getBoundingClientRect();
          checks.footerCopyVerticallyAligned = Boolean(selectionRect && footerNoteRect && Math.abs((selectionRect.top + selectionRect.height / 2) - (footerNoteRect.top + footerNoteRect.height / 2)) <= 1);

          const warningBanner = document.querySelector('.validation-banner');
          const warningDescription = warningBanner?.querySelector('[data-slot="alert-description"]');
          const mailBody = document.querySelector('.mail-body');
          checks.warningTypographyMatchesPreview = Boolean(warningBanner && warningDescription && mailBody && Number.parseFloat(getComputedStyle(warningDescription).fontSize) <= Number.parseFloat(getComputedStyle(mailBody).fontSize));

          roleFilter = document.querySelector('[data-filter-id="target_role"]');
          roleFilter?.click();
          await wait(30);
          const clearFilterButton = [...document.querySelectorAll('.filter-footer [data-slot="button"]')]
            .find((button) => button.textContent?.trim() === '清除');
          clearFilterButton?.click();
          await wait(50);
          checks.filterCleared = document.querySelectorAll('tbody tr').length === 16;
          const blockedRow = document.querySelector('tbody tr.is-blocked');
          const blockedCheckbox = blockedRow?.querySelector('[data-slot="checkbox"]');
          checks.blockedNotSelectable = blockedCheckbox?.getAttribute('data-disabled') !== null;
          blockedRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(30);
          checks.blockReasonVisible = Boolean(document.querySelector('.validation-banner--blocked li'));

          document.querySelector('.create-button')?.click();
          await wait(40);
          checks.draftConfirmationOpened = Boolean(document.querySelector('.confirm-dialog'));
          checks.warningSummarizedBeforeCreate = Boolean(document.querySelector('.confirm-warning'));
          const cancelDraftButton = document.querySelector('.confirm-dialog [data-slot="alert-dialog-cancel"]');
          checks.draftCancelButtonFound = Boolean(cancelDraftButton);
          cancelDraftButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true }));
          cancelDraftButton?.click();
          await wait(180);
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
    if (autoImportPath) {
      if (!fs.existsSync(autoImportPath)) throw new Error('性能测试交接包不存在。');
      return autoImportPath;
    }
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
      title: '导入邮件签名',
      properties: ['openFile'],
      filters: [{ name: '邮件签名', extensions: ['oft', 'html', 'htm'] }]
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
    return mainWindow?.isMaximized() ?? false;
  });
  ipcMain.handle('window:is-maximized', (event) => {
    assertTrustedEvent(event);
    return mainWindow?.isMaximized() ?? false;
  });
  ipcMain.handle('window:close', (event) => {
    assertTrustedEvent(event);
    mainWindow?.close();
  });
  ipcMain.handle('window:set-modal-state', (event, active: boolean) => {
    assertTrustedEvent(event);
    if (typeof active !== 'boolean') throw new Error('窗口遮罩状态无效。');
    return active;
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
