import { useState } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, Rocket, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type { UpdateCheckResult } from './types';
import packageMetadata from '../package.json';
import appIconUrl from '../assets/icons/source/local-mail-merge.svg';

const repositoryUrl = 'https://github.com/SeanX16/local-mail-merge';
const authorUrl = 'https://github.com/SeanX16';
const licenseUrl = 'https://github.com/SeanX16/local-mail-merge/blob/main/LICENSE';
const releaseVersion = `v${packageMetadata.version}`;

function safeUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method 'updates:[^']+': Error:\s*/i, '') || '检查更新失败，请稍后重试。';
}

function openRepository() {
  if (window.desktopApi) {
    void window.desktopApi.openProjectRepository();
    return;
  }
  window.open(repositoryUrl, '_blank', 'noopener,noreferrer');
}

function openAuthorProfile() {
  if (window.desktopApi) {
    void window.desktopApi.openAuthorProfile();
    return;
  }
  window.open(authorUrl, '_blank', 'noopener,noreferrer');
}

function openLicense() {
  if (window.desktopApi) {
    void window.desktopApi.openProjectLicense();
    return;
  }
  window.open(licenseUrl, '_blank', 'noopener,noreferrer');
}

export function AboutDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState('');

  async function checkForUpdates() {
    if (!window.desktopApi) {
      setUpdateError('浏览器预览模式无法检查更新。');
      return;
    }
    setChecking(true);
    setUpdateError('');
    try {
      setUpdateResult(await window.desktopApi.checkForUpdates());
    } catch (error) {
      setUpdateResult(null);
      setUpdateError(safeUpdateError(error));
    } finally {
      setChecking(false);
    }
  }

  async function openUpdateRelease() {
    try {
      await window.desktopApi?.openUpdateRelease();
    } catch (error) {
      setUpdateError(safeUpdateError(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="about-dialog"
        data-testid="about-dialog"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="about-identity">
          <span className="about-logo" aria-hidden="true">
            <img src={appIconUrl} alt="" width={64} height={64} draggable={false} />
          </span>
          <DialogHeader className="about-header">
            <DialogTitle>Local Mail Merge</DialogTitle>
            <DialogDescription>
              {releaseVersion}
            </DialogDescription>
          </DialogHeader>
        </div>

        <p className="about-author">
          由
          <Button type="button" variant="link" className="about-inline-link" onClick={openAuthorProfile}>
            Sean
          </Button>
          开发与维护
        </p>
        <p className="about-legal">
          <span>Copyright © 2026 Sean.</span>
          <span>Licensed under the MIT License.</span>
        </p>

        <section className="about-update" aria-label="应用更新">
          <div className="about-update-control">
            <Button type="button" size="sm" variant="outline" disabled={checking} onClick={checkForUpdates}>
              {checking ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              {checking ? '正在检查' : '检查更新'}
            </Button>
            <span>仅在点击时访问 GitHub</span>
          </div>

          {updateResult ? (
            <Alert className="about-update-alert">
              {updateResult.updateAvailable ? <Rocket aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
              <AlertTitle>{updateResult.updateAvailable ? `发现新版本 ${updateResult.latestVersion}` : '当前已是最新版'}</AlertTitle>
              <AlertDescription>
                <span>
                  {updateResult.updateAvailable
                    ? `GitHub 已发布 ${updateResult.latestVersion}，可以前往查看更新内容并选择安装版或便携版。`
                    : `当前版本 ${updateResult.currentVersion}，已与 GitHub 正式版核对。`}
                </span>
                {updateResult.updateAvailable ? (
                  <Button type="button" size="xs" variant="outline" onClick={openUpdateRelease}>
                    查看并下载
                    <ExternalLink data-icon="inline-end" />
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {updateError ? (
            <Alert variant="destructive" className="about-update-alert">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>无法检查更新</AlertTitle>
              <AlertDescription>{updateError}</AlertDescription>
            </Alert>
          ) : null}
        </section>

        <Separator className="about-separator" />
        <div className="about-links">
          <Button type="button" variant="link" className="about-link" onClick={openRepository}>
            <span>GitHub</span>
            <ExternalLink aria-hidden="true" />
          </Button>
          <Separator orientation="vertical" className="about-link-separator" />
          <Button type="button" variant="link" className="about-link" onClick={openLicense}>
            <span>MIT License</span>
            <ExternalLink aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
