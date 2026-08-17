import { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Info, Loader2 } from 'lucide-react';
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
  const [busy, setBusy] = useState(false);
  const sheet = inspection.sheets.find((item) => item.name === worksheetName) ?? recommendedSheet;

  const preview = useMemo(() => {
    if (!sheet) return { headers: [] as string[], rows: [] as XlsxPreviewRow[] };
    const header = sheet.previewRows.find((row) => row.rowNumber === headerRowNumber);
    const headers = (header?.values ?? []).map((value, index) => value.trim() || `Column ${index + 1}`);
    const rows = sheet.previewRows.filter((row) => row.rowNumber > headerRowNumber).slice(0, 5);
    return { headers, rows };
  }, [sheet, headerRowNumber]);

  const availableHeaderRows = sheet?.previewRows.filter((row) => row.values.some((value) => value.trim())) ?? [];
  const isRecommended = sheet?.name === inspection.recommendedWorksheetName && headerRowNumber === sheet.suggestedHeaderRowNumber;
  const estimatedDataRowCount = sheet ? Math.max(0, sheet.rowCount - headerRowNumber) : 0;
  const canConfirm = Boolean(sheet && preview.headers.some((header) => header.trim()) && !busy);
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  async function confirm() {
    if (!canConfirm || !sheet) return;
    setBusy(true);
    try { await onConfirm({ worksheetName: sheet.name, headerRowNumber }); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="excel-import-dialog" aria-describedby="excel-import-description">
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
              if (next) setHeaderRowNumber(next.suggestedHeaderRowNumber);
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
            <Select value={String(headerRowNumber)} onValueChange={(value) => setHeaderRowNumber(Number(value))}>
              <SelectTrigger id="excel-header-row-select" data-testid="excel-header-row-select" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {availableHeaderRows.map((row) => <SelectItem key={row.rowNumber} value={String(row.rowNumber)}>第 {row.rowNumber} 行</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <Alert className={isRecommended ? 'excel-import-recommendation is-recommended' : 'excel-import-recommendation'}>
          <CheckCircle2 />
          <AlertTitle>{isRecommended ? '已应用自动推荐' : '已切换为手动选择'}</AlertTitle>
          <AlertDescription>{isRecommended ? `${sheet?.name}，第 ${headerRowNumber} 行作为字段名。` : '请核对下方字段和数据预览。'}</AlertDescription>
        </Alert>

        <div className="excel-preview-heading">
          <div><strong>数据预览</strong><span>字段行及最前面的 5 条数据</span></div>
          <Badge variant="secondary">{preview.headers.length} 个字段</Badge>
        </div>
        <div className="excel-preview-frame">
          {preview.headers.length ? (
            <Table className="excel-preview-table" style={{ width: 52 + preview.headers.length * 144 }}>
              <TableHeader><TableRow><TableHead className="excel-row-number">行</TableHead>{preview.headers.map((header, index) => <TableHead key={`${header}:${index}`}><HintTooltip content={header}><span>{header}</span></HintTooltip></TableHead>)}</TableRow></TableHeader>
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
