import { AlertCircle, CheckCircle2, CircleAlert, FileText, FolderOpen, TriangleAlert } from 'lucide-react';
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
  if (result.outcome === 'Success') return '已保存，有提醒';
  return result.outcome === 'Skipped' ? '已跳过' : '创建失败';
}

export function DraftCreationResultDialog({
  response,
  records,
  revalidationError,
  onShowReport,
  onClose
}: DraftCreationResultDialogProps) {
  const { success, skipped, failed } = response.summary;
  const attentionResults = response.results.filter((result) => result.outcome !== 'Success' || Boolean(result.errorMessage));
  const savedWithWarnings = response.results.filter((result) => result.outcome === 'Success' && Boolean(result.errorMessage)).length;
  const allSucceeded = failed === 0 && skipped === 0;
  const allClean = allSucceeded && savedWithWarnings === 0 && !response.reportError && !revalidationError;
  const noneSucceeded = success === 0;
  const title = allClean ? '草稿创建完成' : noneSucceeded ? '未创建任何草稿' : allSucceeded ? '草稿已保存，请留意提示' : '草稿创建部分完成';
  const description = allSucceeded
    ? `已实际保存 ${success} 封 Outlook 草稿。`
    : `实际保存 ${success} 封，跳过 ${skipped} 封，失败 ${failed} 封。`;
  const StatusIcon = allClean ? CheckCircle2 : noneSucceeded ? AlertCircle : TriangleAlert;
  const statusTone = allClean ? 'success' : noneSucceeded ? 'danger' : 'warning';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="creation-result-dialog" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader className="creation-result-header">
          <span className="creation-result-status-icon" data-tone={statusTone}><StatusIcon aria-hidden="true" /></span>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="creation-result-counts" aria-label="草稿创建数量汇总">
          <div data-tone="success"><span>已保存</span><strong>{success}</strong></div>
          <div data-tone="muted"><span>已跳过</span><strong>{skipped}</strong></div>
          <div data-tone="danger"><span>失败</span><strong>{failed}</strong></div>
        </div>

        {attentionResults.length > 0 ? (
          <section className="creation-result-details" aria-labelledby="creation-result-details-title">
            <div className="creation-result-section-heading">
              <h3 id="creation-result-details-title">需要留意的记录</h3>
              <span>{attentionResults.length} 条</span>
            </div>
            <ScrollArea className="creation-result-scroll">
              <ul className="creation-result-list">
                {attentionResults.map((result) => {
                  const record = findRecord(records, result.personId);
                  return (
                    <li key={`${result.personId}:${result.outcome}`}>
                      <div className="creation-result-person">
                        <span>
                          <strong>{record?.recipientName || result.personId}</strong>
                          {record?.recipientEmail ? <small>{record.recipientEmail}</small> : null}
                        </span>
                        <Badge className={result.outcome === 'Success' ? 'creation-result-warning-badge' : undefined} variant={result.outcome === 'Failed' ? 'destructive' : 'outline'}>{resultLabel(result)}</Badge>
                      </div>
                      <p>{result.errorMessage || (result.outcome === 'Skipped' ? '该记录未执行。' : '本地助手未返回错误详情。')}</p>
                      <small className="creation-result-person-id">人员 ID：{result.personId}</small>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </section>
        ) : null}

        {response.reportPath ? (
          <Alert className="creation-result-report">
            <FileText aria-hidden="true" />
            <AlertTitle>结果报告</AlertTitle>
            <AlertDescription><code className="creation-report-path">{response.reportPath}</code></AlertDescription>
          </Alert>
        ) : response.reportError ? (
          <Alert className="creation-result-report-warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>草稿已处理，但结果报告未保存</AlertTitle>
            <AlertDescription>{response.reportError} Outlook 中实际保存的草稿不受影响。</AlertDescription>
          </Alert>
        ) : null}

        {revalidationError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>界面重新校验失败</AlertTitle>
            <AlertDescription>{revalidationError} 当前列表可能仍显示创建前的状态，请重新导入交接包。</AlertDescription>
          </Alert>
        ) : (
          <p className="creation-revalidation-note"><CircleAlert aria-hidden="true" />当前交接包已重新校验；已记录的成功项受重复创建保护，失败项仍可重试。</p>
        )}

        <DialogFooter className="creation-result-footer">
          {response.reportPath ? (
            <Button type="button" variant="outline" onClick={onShowReport}>
              <FolderOpen data-icon="inline-start" />
              在文件夹中显示报告
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
