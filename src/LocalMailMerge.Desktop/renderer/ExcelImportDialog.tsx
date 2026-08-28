import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Info, Loader2, Mail } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/HintTooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { XlsxImportOptions, XlsxPreviewRow, XlsxWorkbookInspection } from './types';

const noEmailColumnValue = '__no_email_column__';
const emailHeaderAliases = new Set([
  'recipient_email', 'email', 'e-mail', 'email_address', 'emailaddress', 'e-mail_address', 'email_id', 'emailid',
  '邮箱', '邮箱地址', '邮件地址', '电子邮箱', '电子邮件', '电子邮件地址', '联系邮箱', '工作邮箱'
].map(normalizeHeader));
const emailHeaderKeywords = ['email', '邮箱', '电子邮件', '电邮'].map(normalizeHeader);
const emailHeaderNegativeKeywords = [
  'status', 'state', 'valid', 'validity', 'verified', 'verification', 'reason', 'type', 'domain',
  'optout', 'unsubscribe', 'consent', 'bounce', 'bounced', '是否', '状态', '有效', '验证', '原因',
  '类型', '域名', '退订', '拒收', '许可', '同意', '标记'
].map(normalizeHeader);
const emailValuePattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeader(value: string): string {
  return Array.from(value.trim().toLowerCase()).filter((character) => /[\p{L}\p{N}]/u.test(character)).join('');
}

function makeUniqueHeaders(values: string[]): string[] {
  const counts = new Map<string, number>();
  return values.map((rawValue, index) => {
    const value = rawValue.trim() || `Column ${index + 1}`;
    const normalized = value.toLowerCase();
    const count = (counts.get(normalized) ?? 0) + 1;
    counts.set(normalized, count);
    return count === 1 ? value : `${value} (${count})`;
  });
}

function headersForRow(
  sheet: XlsxWorkbookInspection['sheets'][number] | undefined,
  headerRowNumber: number
): string[] {
  const header = sheet?.previewRows.find((row) => row.rowNumber === headerRowNumber);
  return makeUniqueHeaders(header?.values ?? []);
}

function findEmailHeader(headers: string[], rows: XlsxPreviewRow[]): string {
  const candidates = headers.map((header, index) => {
    const normalizedHeader = normalizeHeader(header);
    const exactAlias = emailHeaderAliases.has(normalizedHeader);
    const hasKeyword = emailHeaderKeywords.some((keyword) => normalizedHeader.includes(keyword));
    const hasNegativeKeyword = emailHeaderNegativeKeywords.some((keyword) => normalizedHeader.includes(keyword));
    const samples = rows.map((row) => row.values[index]?.trim() ?? '').filter(Boolean).slice(0, 50);
    const validCount = samples.filter((value) => emailValuePattern.test(value)).length;
    const validRatio = samples.length ? validCount / samples.length : 0;
    const eligible = exactAlias ||
      (!hasNegativeKeyword && hasKeyword && (samples.length === 0 || validCount > 0 && validRatio >= 0.5)) ||
      (!hasNegativeKeyword && !hasKeyword && samples.length >= 2 && validCount >= 2 && validRatio >= 0.8);
    const score = (exactAlias ? 1000 : 0) + (hasKeyword ? 400 : 0) + Math.round(validRatio * 400) + Math.min(validCount, 20) * 5 - (hasNegativeKeyword ? 1000 : 0);
    return { header, index, exactAlias, eligible, score };
  }).filter((candidate) => candidate.eligible).sort((left, right) => right.score - left.score || left.index - right.index);
  if (!candidates.length) return '';
  if (candidates.length === 1) return candidates[0].header;
  if (candidates[0].exactAlias && !candidates[1].exactAlias) return candidates[0].header;
  return candidates[0].score - candidates[1].score >= 150 ? candidates[0].header : '';
}

function detectEmailHeader(
  sheet: XlsxWorkbookInspection['sheets'][number] | undefined,
  headerRowNumber: number
): string {
  const headers = headersForRow(sheet, headerRowNumber);
  const rows = sheet?.previewRows.filter((row) => row.rowNumber > headerRowNumber) ?? [];
  return findEmailHeader(headers, rows);
}

export function ExcelImportDialog({
  filePath,
  inspection,
  onConfirm,
  onClose
}: {
  filePath: string;
  inspection: XlsxWorkbookInspection;
  onConfirm: (options: XlsxImportOptions) => Promise<void>;
  onClose: () => void;
}) {
  const recommendedSheet = inspection.sheets.find((sheet) => sheet.name === inspection.recommendedWorksheetName) ?? inspection.sheets[0];
  const [worksheetName, setWorksheetName] = useState(recommendedSheet?.name ?? '');
  const [headerRowNumber, setHeaderRowNumber] = useState(recommendedSheet?.suggestedHeaderRowNumber ?? 1);
  const [emailColumnName, setEmailColumnName] = useState(() => detectEmailHeader(recommendedSheet, recommendedSheet?.suggestedHeaderRowNumber ?? 1));
  const [busy, setBusy] = useState(false);
  const sheet = inspection.sheets.find((item) => item.name === worksheetName) ?? recommendedSheet;

  const preview = useMemo(() => {
    if (!sheet) return { headers: [] as string[], rows: [] as XlsxPreviewRow[], sampleRows: [] as XlsxPreviewRow[] };
    const headers = headersForRow(sheet, headerRowNumber);
    const sampleRows = sheet.previewRows.filter((row) => row.rowNumber > headerRowNumber).slice(0, 50);
    return { headers, rows: sampleRows.slice(0, 5), sampleRows };
  }, [sheet, headerRowNumber]);

  const availableHeaderRows = sheet?.previewRows.filter((row) => row.values.some((value) => value.trim())) ?? [];
  const isRecommended = sheet?.name === inspection.recommendedWorksheetName && headerRowNumber === sheet.suggestedHeaderRowNumber;
  const emailWasAutoMatched = Boolean(emailColumnName && emailColumnName === findEmailHeader(preview.headers, preview.sampleRows));
  const estimatedDataRowCount = sheet ? Math.max(0, sheet.rowCount - headerRowNumber) : 0;
  const canConfirm = Boolean(sheet && preview.headers.some((header) => header.trim()) && emailColumnName && !busy);
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  async function confirm() {
    if (!canConfirm || !sheet) return;
    setBusy(true);
    try { await onConfirm({ worksheetName: sheet.name, headerRowNumber, emailColumnName }); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="excel-import-dialog" aria-describedby="excel-import-description" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader className="excel-import-header">
          <span className="dialog-title-icon"><FileSpreadsheet /></span>
          <div>
            <DialogTitle>设置 Excel 导入</DialogTitle>
            <HintTooltip content={filePath} side="bottom">
              <DialogDescription id="excel-import-description">{fileName}</DialogDescription>
            </HintTooltip>
          </div>
        </DialogHeader>

        <FieldGroup className="excel-import-controls">
          <Field>
            <FieldLabel htmlFor="excel-sheet-select">人员数据所在的 Sheet</FieldLabel>
            <Select value={worksheetName} onValueChange={(value) => {
              const next = inspection.sheets.find((item) => item.name === value);
              setWorksheetName(value);
              if (next) {
                setHeaderRowNumber(next.suggestedHeaderRowNumber);
                setEmailColumnName(detectEmailHeader(next, next.suggestedHeaderRowNumber));
              }
            }}>
              <SelectTrigger id="excel-sheet-select" data-testid="excel-sheet-select" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {inspection.sheets.map((item) => <SelectItem key={item.name} value={item.name}>{item.name} · {item.rowCount} 行</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="excel-header-row-select">字段名称所在行</FieldLabel>
            <Select value={String(headerRowNumber)} onValueChange={(value) => {
              const nextHeaderRowNumber = Number(value);
              setHeaderRowNumber(nextHeaderRowNumber);
              setEmailColumnName(detectEmailHeader(sheet, nextHeaderRowNumber));
            }}>
              <SelectTrigger id="excel-header-row-select" data-testid="excel-header-row-select" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {availableHeaderRows.map((row) => <SelectItem key={row.rowNumber} value={String(row.rowNumber)}>第 {row.rowNumber} 行</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="excel-email-column-select">邮箱字段</FieldLabel>
            <Select value={emailColumnName || noEmailColumnValue} onValueChange={(value) => setEmailColumnName(value === noEmailColumnValue ? '' : value)}>
              <SelectTrigger id="excel-email-column-select" data-testid="excel-email-column-select" className="w-full">
                <Mail aria-hidden="true" />
                <SelectValue placeholder="请选择邮箱字段" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value={noEmailColumnValue} disabled>请选择邮箱字段</SelectItem>
                  {preview.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <Alert variant={emailColumnName ? 'default' : 'destructive'} className={isRecommended && emailColumnName ? 'excel-import-recommendation is-recommended' : 'excel-import-recommendation'}>
          {emailColumnName ? <CheckCircle2 /> : <AlertCircle />}
          <AlertTitle>{emailColumnName ? '导入字段已就绪' : '尚未识别邮箱字段'}</AlertTitle>
          <AlertDescription>
            {emailColumnName
              ? `${sheet?.name} · 第 ${headerRowNumber} 行；邮箱使用“${emailColumnName}”${emailWasAutoMatched ? '（自动匹配）' : '（手动指定）'}。`
              : '请在上方“邮箱字段”中选择实际存放邮箱地址的列，确认后才能导入。'}
          </AlertDescription>
        </Alert>

        <div className="excel-preview-heading">
          <div><strong>数据预览</strong><span>字段行及最前面的 5 条数据</span></div>
          <span className="excel-preview-badges">
            {emailColumnName ? <Badge variant="outline">邮箱：{emailColumnName}</Badge> : null}
            <Badge variant="secondary">{preview.headers.length} 个字段</Badge>
          </span>
        </div>
        <div className="excel-preview-frame">
          {preview.headers.length ? (
            <Table className="excel-preview-table" style={{ width: 52 + preview.headers.length * 144 }}>
              <TableHeader><TableRow><TableHead className="excel-row-number">行</TableHead>{preview.headers.map((header, index) => <TableHead className={header === emailColumnName ? 'is-email-column' : undefined} key={`${header}:${index}`}><HintTooltip content={header}><span>{header}</span></HintTooltip></TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {preview.rows.map((row) => <TableRow key={row.rowNumber}><TableCell className="excel-row-number">{row.rowNumber}</TableCell>{preview.headers.map((_, index) => <TableCell key={index}><HintTooltip content={row.values[index] ?? ''}><span>{row.values[index] || '—'}</span></HintTooltip></TableCell>)}</TableRow>)}
              </TableBody>
            </Table>
          ) : <div className="excel-preview-empty">所选行没有可用字段，请选择其他行。</div>}
        </div>

        <DialogFooter className="excel-import-footer">
          <span><Info aria-hidden="true" />预计导入 <strong>{estimatedDataRowCount}</strong> 条记录，随后逐行执行安全校验。</span>
          <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button data-testid="excel-import-confirm" disabled={!canConfirm} onClick={() => void confirm()}>{busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{busy ? '正在导入' : '确认导入'}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
