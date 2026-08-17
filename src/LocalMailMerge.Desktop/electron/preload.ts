import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopApi', {
  selectPackage: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-package'),
  inspectXlsx: (filePath: string): Promise<unknown> => ipcRenderer.invoke('worker:inspect-xlsx', filePath),
  importPackage: (filePath: string, options?: unknown): Promise<unknown> => ipcRenderer.invoke('worker:import', filePath, options),
  listAccounts: (): Promise<unknown> => ipcRenderer.invoke('worker:accounts'),
  getTemplateState: (): Promise<unknown> => ipcRenderer.invoke('templates:get-state'),
  importTemplate: (): Promise<unknown> => ipcRenderer.invoke('templates:import'),
  deleteTemplate: (id: string): Promise<unknown> => ipcRenderer.invoke('templates:delete', id),
  selectTemplate: (id: string): Promise<unknown> => ipcRenderer.invoke('templates:select', id),
  openTemplateFolder: (): Promise<void> => ipcRenderer.invoke('templates:open-folder'),
  getValidationPolicy: (): Promise<unknown> => ipcRenderer.invoke('validation-policy:get'),
  saveValidationPolicy: (value: unknown): Promise<unknown> => ipcRenderer.invoke('validation-policy:save', value),
  createDrafts: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('worker:create-drafts', payload),
  showReport: (reportPath: string): Promise<void> => ipcRenderer.invoke('shell:show-report', reportPath),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (listener: (maximized: boolean) => void): void => {
    ipcRenderer.removeAllListeners('window:maximized-changed');
    ipcRenderer.on('window:maximized-changed', (_event, maximized: boolean) => listener(maximized));
  },
  offMaximizedChange: (): void => {
    ipcRenderer.removeAllListeners('window:maximized-changed');
  },
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  setModalState: (active: boolean): Promise<boolean> => ipcRenderer.invoke('window:set-modal-state', active),
  openOutlook: (): Promise<void> => ipcRenderer.invoke('shell:open-outlook')
});
