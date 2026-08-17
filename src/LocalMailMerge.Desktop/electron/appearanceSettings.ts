import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const appFontIds = ['noto-sans-sc', 'segoe-ui', 'microsoft-yahei', 'pingfang-bold'] as const;
export const accentColorIds = ['blue', 'amber', 'cyan', 'emerald', 'fuchsia', 'green', 'indigo', 'lime', 'orange', 'pink'] as const;

export type AppFontId = typeof appFontIds[number];
export type AccentColorId = typeof accentColorIds[number];

export interface AppearanceSettingsState {
  version: 1;
  font: AppFontId;
  accent: AccentColorId;
}

const defaultAppearanceSettings: AppearanceSettingsState = {
  version: 1,
  font: 'noto-sans-sc',
  accent: 'blue'
};

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'appearance.json');
}

function normalizeChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? value as T : fallback;
}

function normalizeAppearanceSettings(value: unknown): AppearanceSettingsState {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    version: 1,
    font: normalizeChoice(record.font, appFontIds, defaultAppearanceSettings.font),
    accent: normalizeChoice(record.accent, accentColorIds, defaultAppearanceSettings.accent)
  };
}

export function getAppearanceSettings(): AppearanceSettingsState {
  try {
    return normalizeAppearanceSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    return { ...defaultAppearanceSettings };
  }
}

export function saveAppearanceSettings(value: unknown): AppearanceSettingsState {
  const state = normalizeAppearanceSettings(value);
  const destination = settingsPath();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(state, null, 2), 'utf8');
  return state;
}
