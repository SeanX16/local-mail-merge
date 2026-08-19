import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { FileCode2, ImageOff, Loader2, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { SignatureInspection } from './types';

function previewMarkup(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'html', 'head', 'body', 'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'small',
      'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'ul', 'ol', 'li'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'src', 'alt', 'width', 'height', 'style', 'align', 'valign', 'border',
      'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'bgcolor'
    ],
    ALLOW_DATA_ATTR: false
  });
  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  document.querySelectorAll('script, iframe, frame, object, embed, form, input, button, textarea, select, meta, base, link').forEach((element) => element.remove());
  document.querySelectorAll('a').forEach((anchor) => {
    anchor.removeAttribute('target');
    anchor.setAttribute('rel', 'noreferrer noopener');
  });
  document.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    Array.from(element.style).forEach((property) => {
      if (/url\s*\(/i.test(element.style.getPropertyValue(property))) {
        element.style.removeProperty(property);
      }
    });
  });
  document.querySelectorAll('img').forEach((image) => {
    const source = image.getAttribute('src')?.trim() ?? '';
    const safeEmbeddedImage = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(source);
    if (safeEmbeddedImage) return;
    const placeholder = document.createElement('span');
    placeholder.setAttribute('data-signature-image-placeholder', 'true');
    placeholder.textContent = `[图片需在 Outlook 测试草稿中确认${image.getAttribute('alt') ? `：${image.getAttribute('alt')}` : ''}]`;
    image.replaceWith(placeholder);
  });
  return document.body.innerHTML;
}

export function SignaturePreview({
  inspection,
  loading = false,
  error = '',
  compact = false,
  showIssues = false,
  constrained = false
}: {
  inspection: SignatureInspection | null;
  loading?: boolean;
  error?: string;
  compact?: boolean;
  showIssues?: boolean;
  constrained?: boolean;
}) {
  const html = useMemo(() => inspection ? previewMarkup(inspection.previewHtml) : '', [inspection]);

  if (loading) {
    return (
      <div className={cn('signature-preview', compact && 'is-compact')}>
        <div className="signature-preview-loading"><Loader2 className="animate-spin" /><span>正在检查并加载邮件签名…</span></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={cn('signature-preview-alert', compact && 'is-compact')}>
        <ShieldAlert />
        <AlertTitle>签名无法预览或使用</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!inspection) {
    return (
      <Alert className={cn('signature-preview-alert', compact && 'is-compact')}>
        <FileCode2 />
        <AlertTitle>尚未加载签名</AlertTitle>
        <AlertDescription>选择或导入签名后，这里会显示实际内容。</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn('signature-preview', compact && 'is-compact')}>
      <div className="signature-preview-heading">
        <span>实际签名预览</span>
        <div className="signature-preview-badges">
          <Badge variant="outline">{inspection.kind === 'oft' ? 'Outlook 模板' : 'HTML'}</Badge>
          <Badge variant={inspection.canUse ? 'secondary' : 'destructive'}>{inspection.canUse ? '可使用' : '已拦截'}</Badge>
          {!inspection.previewComplete ? <Badge variant="outline"><ImageOff data-icon="inline-start" />有限预览</Badge> : null}
        </div>
      </div>

      {!inspection.previewComplete ? (
        <Alert className="signature-preview-alert is-compact">
          <TriangleAlert />
          <AlertTitle>APP 只能显示有限预览</AlertTitle>
          <AlertDescription>OFT 内嵌图片或大型签名不会在这里完整加载，请创建无收件人的测试草稿并在 Outlook 中确认。</AlertDescription>
        </Alert>
      ) : null}

      {showIssues && inspection.issues.length ? (
        <div className="signature-issue-list">
          {inspection.issues.map((issue) => (
            <Alert variant={issue.severity === 'blocking' ? 'destructive' : 'default'} className="signature-preview-alert is-compact" key={issue.code}>
              {issue.severity === 'blocking' ? <ShieldAlert /> : <TriangleAlert />}
              <AlertTitle>{issue.severity === 'blocking' ? '必须处理' : '需要确认'}</AlertTitle>
              <AlertDescription>{issue.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      {html ? (
        constrained ? (
          <ScrollArea className="signature-preview-scroll">
            <div
              className="signature-preview-html"
              onClick={(event) => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </ScrollArea>
        ) : (
          <div
            className="signature-preview-html"
            onClick={(event) => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      ) : (
        <div className="signature-preview-unavailable">签名过大或没有可供界面显示的内容，请使用 Outlook 测试草稿确认。</div>
      )}
    </div>
  );
}
