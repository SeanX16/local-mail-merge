import type { AccentColorId, AppearanceSettingsState, AppFontId } from './types';

export const defaultAppearanceSettings: AppearanceSettingsState = {
  version: 1,
  font: 'noto-sans-sc',
  accent: 'blue'
};

export const fontOptions: Array<{
  id: AppFontId;
  label: string;
  sample: string;
  family: string;
  weight: number;
}> = [
  { id: 'noto-sans-sc', label: 'Noto Sans SC', sample: '简洁现代，适合中英文混排', family: '"Noto Sans SC Variable", "Noto Sans SC", sans-serif', weight: 400 },
  { id: 'segoe-ui', label: 'Segoe UI', sample: 'Windows 原生界面风格', family: '"Segoe UI Variable", "Segoe UI", sans-serif', weight: 400 },
  { id: 'microsoft-yahei', label: '微软雅黑', sample: '清晰稳重，中文阅读熟悉', family: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif', weight: 400 },
  { id: 'pingfang-bold', label: '仿苹方', sample: '清爽轻盈，接近苹方观感', family: '"App PingFang Bold", "苹方 粗体", "PingFang SC", sans-serif', weight: 400 }
];

export const accentOptions: Array<{ id: AccentColorId; label: string; color: string }> = [
  { id: 'blue', label: '蓝色', color: 'oklch(0.546 0.245 262.881)' },
  { id: 'amber', label: '琥珀', color: 'oklch(0.666 0.179 58.318)' },
  { id: 'cyan', label: '青色', color: 'oklch(0.715 0.143 215.221)' },
  { id: 'emerald', label: '翡翠', color: 'oklch(0.696 0.17 162.48)' },
  { id: 'fuchsia', label: '紫红', color: 'oklch(0.667 0.295 322.15)' },
  { id: 'green', label: '绿色', color: 'oklch(0.723 0.219 149.579)' },
  { id: 'indigo', label: '靛蓝', color: 'oklch(0.585 0.233 277.117)' },
  { id: 'lime', label: '青柠', color: 'oklch(0.768 0.233 130.85)' },
  { id: 'orange', label: '橙色', color: 'oklch(0.705 0.213 47.604)' },
  { id: 'pink', label: '粉色', color: 'oklch(0.656 0.241 354.308)' }
];

export function applyAppearanceSettings(value: AppearanceSettingsState): void {
  const root = document.documentElement;
  root.dataset.appFont = value.font;
  root.dataset.accent = value.accent;
}
