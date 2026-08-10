import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckmarkCircle20Regular,
  ChevronDown16Regular,
  Dismiss20Regular,
  Table20Regular
} from '@fluentui/react-icons';
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
  const recommendedSheet = inspection.sheets.find((sheet) => sheet.name === inspection.recommendedWorksheetName)
    ?? inspection.sheets[0];
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
    try {
      await onConfirm({ worksheetName: sheet.name, headerRowNumber });
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop excel-import-backdrop" role="presentation">
      <section className="excel-import-dialog" role="dialog" aria-modal="true" aria-labelledby="excel-import-title">
        <header className="excel-import-header">
          <div className="excel-import-title-icon"><Table20Regular /></div>
          <div>
            <h2 id="excel-import-title">设置 Excel 导入</h2>
            <p title={filePath}>{fileName}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭 Excel 导入设置"><Dismiss20Regular /></button>
        </header>

        <div className="excel-import-content">
          <div className="excel-import-controls">
            <label>
              <span>选择人员数据所在的 Sheet</span>
              <span className="select-wrap">
                <select
                  data-testid="excel-sheet-select"
                  value={worksheetName}
                  onChange={(event) => {
                    const next = inspection.sheets.find((item) => item.name === event.target.value);
                    setWorksheetName(event.target.value);
                    if (next) setHeaderRowNumber(next.suggestedHeaderRowNumber);
                  }}
                >
                  {inspection.sheets.map((item) => (
                    <option key={item.name} value={item.name}>{item.name} · {item.rowCount} 行</option>
                  ))}
                </select>
                <ChevronDown16Regular aria-hidden="true" />
              </span>
            </label>
            <label>
              <span>选择字段名称所在行</span>
              <span className="select-wrap">
                <select
                  data-testid="excel-header-row-select"
                  value={headerRowNumber}
                  onChange={(event) => setHeaderRowNumber(Number(event.target.value))}
                >
                  {availableHeaderRows.map((row) => (
                    <option key={row.rowNumber} value={row.rowNumber}>第 {row.rowNumber} 行</option>
                  ))}
                </select>
                <ChevronDown16Regular aria-hidden="true" />
              </span>
            </label>
          </div>

          <div className={`excel-import-recommendation${isRecommended ? ' is-recommended' : ''}`}>
            <CheckmarkCircle20Regular />
            <span>{isRecommended
              ? `已自动推荐：${sheet?.name}，第 ${headerRowNumber} 行作为字段名。`
              : '已使用你的手动选择；请核对下方字段和数据预览。'}</span>
          </div>

          <div className="excel-preview-heading">
            <div>
              <strong>数据预览</strong>
              <span>蓝色一行为字段名，下方显示最前面的 5 条记录。</span>
            </div>
            <span>{preview.headers.length} 个字段</span>
          </div>

          <div className="excel-preview-frame">
            {preview.headers.length ? (
              <table className="excel-preview-table">
                <thead>
                  <tr>
                    <th className="excel-row-number">行</th>
                    {preview.headers.map((header, index) => <th key={`${header}:${index}`} title={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="excel-row-number">{row.rowNumber}</td>
                      {preview.headers.map((_, index) => <td key={index} title={row.values[index] ?? ''}>{row.values[index] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="excel-preview-empty">所选行没有可用字段，请选择其他行。</div>
            )}
          </div>
        </div>

        <footer className="excel-import-footer">
          <span>预计导入 <strong>{estimatedDataRowCount}</strong> 条记录；导入后仍会逐行执行邮件安全校验。</span>
          <div>
            <button className="button button--ghost" disabled={busy} onClick={onClose}>取消</button>
            <button className="button button--primary" data-testid="excel-import-confirm" disabled={!canConfirm} onClick={() => void confirm()}>
              {busy ? '正在导入…' : '确认导入'}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
