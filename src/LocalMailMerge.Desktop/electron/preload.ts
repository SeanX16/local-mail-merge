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
  createDrafts: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('worker:create-drafts', payload),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  openOutlook: (): Promise<void> => ipcRenderer.invoke('shell:open-outlook')
});
