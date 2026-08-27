import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import packageMetadata from '../package.json';
import appIconUrl from '../assets/icons/source/local-mail-merge.svg';

const repositoryUrl = 'https://github.com/SeanX16/local-mail-merge';
const authorUrl = 'https://github.com/SeanX16';
const licenseUrl = 'https://github.com/SeanX16/local-mail-merge/blob/main/LICENSE';
const releaseVersion = `v${packageMetadata.version}`;

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
