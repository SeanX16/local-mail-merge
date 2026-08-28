export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface ResolvedUpdateRelease extends UpdateCheckResult {
  releaseUrl: string;
}

function parseVersion(value: string, label: string): { parts: [number, number, number]; normalized: string } {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) throw new Error(`${label}版本号格式无效。`);
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number];
  if (parts.some((part) => !Number.isSafeInteger(part))) throw new Error(`${label}版本号超出支持范围。`);
  return { parts, normalized: parts.join('.') };
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function requireReleaseUrl(value: string): { url: string; tagName: string } {
  if (!value || value.length > 2048) throw new Error('GitHub Release 链接无效。');
  const parsed = new URL(value);
  const pathMatch = parsed.pathname.match(/^\/SeanX16\/local-mail-merge\/releases\/tag\/(v?\d+\.\d+\.\d+)$/i);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || !pathMatch || parsed.search || parsed.hash) {
    throw new Error('GitHub Release 链接不属于本项目。');
  }
  return { url: parsed.toString(), tagName: pathMatch[1] };
}

export function resolveUpdateReleaseUrl(releaseUrlValue: string, currentVersionValue: string): ResolvedUpdateRelease {
  const release = requireReleaseUrl(releaseUrlValue);
  const currentVersion = parseVersion(currentVersionValue, '当前');
  const latestVersion = parseVersion(release.tagName, '最新');

  return {
    currentVersion: `v${currentVersion.normalized}`,
    latestVersion: `v${latestVersion.normalized}`,
    updateAvailable: compareVersions(latestVersion.parts, currentVersion.parts) > 0,
    releaseUrl: release.url
  };
}
