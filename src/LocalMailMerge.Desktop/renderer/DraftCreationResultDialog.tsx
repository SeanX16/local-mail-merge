import { AlertCircle, CheckCircle2, FileText, FolderOpen, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DraftCreationItemResult, DraftCreationResponse, MailRecord } from './types';

interface DraftCreationResultDialogProps {
  response: DraftCreationResponse;
  records: MailRecord[];
  revalidationError?: string;
  onShowReport: () => void;
  onClose: () => void;
}

function findRecord(records: MailRecord[], personId: string): MailRecord | undefined {
  return records.find((record) => record.personId.localeCompare(personId, undefined, { sensitivity: 'accent' }) === 0);
}

function resultLabel(result: DraftCreationItemResult): string {
  return result.outcome === 'Skipped' ? '已跳过' : '失败';
}

export function DraftCreationResultDialog({
  response,
  records,
  revalidationError,
  onShowReport,
  onClose
}: DraftCreationResultDialogProps) {
  const { success, skipped, failed } = response.summary;
  const incompleteResults = response.results.filter((result) => result.outcome !== 'Success');
  const allSucceeded = failed === 0 && skipped === 0;
  const noneSucceeded = success === 0;
  const title = allSucceeded ? '草稿创建完成' : noneSucceeded ? '未创建任何草稿' : '草稿创建部分完成';
  const description = allSucceeded
    ? `已实际保存 ${success} 封 Outlook 草稿。`
    : `实际保存 ${success} 封，跳过 ${skipped} 封，失败 ${failed} 封。`;
  const StatusIcon = allSucceeded ? CheckCircle2 : noneSucceeded ? AlertCircle : TriangleAlert;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="creation-result-dialog">
        <DialogHeader className="creation-result-header">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Alert variant={noneSucceeded && failed > 0 ? 'destructive' : 'default'}>
          <StatusIcon aria-hidden="true" />
          <AlertTitle>实际执行结果</AlertTitle>
          <AlertDescription>
            <span className="creation-result-counts">
              <Badge variant="secondary">成功 {success}</Badge>
              {skipped > 0 ? <Badge variant="outline">跳过 {skipped}</Badge> : null}
              {failed > 0 ? <Badge variant="destructive">失败 {failed}</Badge> : null}
            </span>
          </AlertDescription>
        </Alert>

        {incompleteResults.length > 0 ? (
          <section className="creation-result-details" aria-labelledby="creation-result-details-title">
            <div className="creation-result-section-heading">
              <h3 id="creation-result-details-title">未成功明细</h3>
              <span>{incompleteResults.length} 条</span>
            </div>
            <ScrollArea className="creation-result-scroll">
              <ul className="creation-result-list">
                {incompleteResults.map((result) => {
                  const record = findRecord(records, result.personId);
                  return (
                    <li key={`${result.personId}:${result.outcome}`}>
                      <div className="creation-result-person">
                        <span>
                          <strong>{record?.recipientName || result.personId}</strong>
                          {record?.recipientEmail ? <small>{record.recipientEmail}</small> : null}
                        </span>
                        <Badge variant={result.outcome === 'Failed' ? 'destructive' : 'outline'}>{resultLabel(result)}</Badge>
                      </div>
                      <p>{result.errorMessage || (result.outcome === 'Skipped' ? '该记录未执行。' : '本地助手未返回错误详情。')}</p>
                      <code>{result.personId}</code>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </section>
        ) : null}

        <Alert>
          <FileText aria-hidden="true" />
          <AlertTitle>本地结果报告</AlertTitle>
          <AlertDescription><code className="creation-report-path">{response.reportPath}</code></AlertDescription>
        </Alert>

        {revalidationError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>界面重新校验失败</AlertTitle>
            <AlertDescription>{revalidationError} 当前列表可能仍显示创建前的状态，请重新导入交接包。</AlertDescription>
          </Alert>
        ) : (
          <p className="creation-revalidation-note">当前交接包已重新校验；成功项现在受重复创建保护，失败项仍可重试。</p>
        )}

        <DialogFooter className="creation-result-footer">
          <Button type="button" variant="outline" onClick={onShowReport}>
            <FolderOpen data-icon="inline-start" />
            在文件夹中显示报告
          </Button>
          <Button type="button" onClick={onClose}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
