export const SETTINGS_TABS = ['appearance', 'signatures', 'outlook', 'safety'] as const;

export type SettingsTab = typeof SETTINGS_TABS[number];

export const DEFAULT_SETTINGS_TAB: SettingsTab = SETTINGS_TABS[0];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && SETTINGS_TABS.some((tab) => tab === value);
}
