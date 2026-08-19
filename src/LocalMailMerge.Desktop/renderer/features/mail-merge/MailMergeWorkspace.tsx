import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Row, Table as TanStackTable, VisibilityState, ColumnOrderState } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import DOMPurify from 'dompurify';
import {
  CheckCircle2,
  ChevronDown,
  CircleX,
  FileSpreadsheet,
  FolderOpen,
  Info,
  MailPlus,
  Search,
  Settings,
  TriangleAlert,
  Users
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from '@/components/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { HintTooltip } from '@/components/HintTooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { WindowTitleBar } from '@/components/window/WindowTitleBar';
import { SignaturePreview } from '../../SignaturePreview';
import type {
  BatchViewModel,
  MailRecord,
  OutlookAccount,
  SignatureInspection,
  TemplateState,
  ValidationRuleId
} from '../../types';
import { DEFAULT_SETTINGS_TAB, type SettingsTab } from '../../settingsNavigation';
import { getValidationRuleText, validationLevelLabels } from '../../validationRules';
import {
  CommandDropdown,
  FieldManager,
  MiddleEllipsisPath,
  SummaryMetric
} from './MailMergeControls';

export type StatusMode = 'all' | 'creatable' | 'eligible' | 'review' | 'duplicate' | 'blocked' | 'selected';

const statusOptions: Array<{ value: StatusMode; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'creatable', label: '可创建（含警告）' },
  { value: 'eligible', label: '无警告' },
  { value: 'review', label: '有警告' },
  { value: 'duplicate', label: '仅看重复' },
  { value: 'blocked', label: '仅看已拦截' },
  { value: 'selected', label: '仅看已选择' }
];

function bodyMarkup(record: MailRecord): string {
  if (record.bodyHtml.trim()) {
    return DOMPurify.sanitize(record.bodyHtml, {
      ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a'],
      ALLOWED_ATTR: ['href', 'title'],
      ALLOW_DATA_ATTR: false
    });
  }
  return record.bodyText
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${DOMPurify.sanitize(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

export interface WorkspaceAggregate {
  total: number;
  creatable: number;
  review: number;
  blocked: number;
}

const TABLE_ROW_HEIGHT = 32;
const PREVIEW_FIELD_STORAGE_KEY = 'local-mail-merge.preview-secondary-field';

function readStoredPreviewFieldKey(): string {
  try {
    return window.localStorage.getItem(PREVIEW_FIELD_STORAGE_KEY) ?? 'target_role';
  } catch {
    return 'target_role';
  }
}

function defaultPreviewFieldKey(fields: BatchViewModel['fields']): string {
  return fields.find((field) => field.key === 'target_role')?.key ?? fields[0]?.key ?? '';
}

function previewFieldValue(record: MailRecord, fieldKey: string): string {
  const importedValue = record.values[fieldKey];
  if (importedValue?.trim()) return importedValue;
  if (fieldKey === 'recipient_name') return record.recipientName;
  if (fieldKey === 'recipient_email') return record.recipientEmail;
  if (fieldKey === 'subject') return record.subject;
  if (fieldKey === 'target_role') return record.targetRole;
  return '';
}

const MailPreview = memo(function MailPreview({
  activeRecord,
  fields,
  previewFieldKey,
  onPreviewFieldChange,
  validationRuleOrder,
  signatureInspection,
  signatureInspectionLoading,
  signatureInspectionError
}: {
  activeRecord: MailRecord | undefined;
  fields: BatchViewModel['fields'];
  previewFieldKey: string;
  onPreviewFieldChange: (fieldKey: string) => void;
  validationRuleOrder: ValidationRuleId[];
  signatureInspection: SignatureInspection | null;
  signatureInspectionLoading: boolean;
  signatureInspectionError: string;
}) {
  const sanitizedBody = useMemo(() => activeRecord ? bodyMarkup(activeRecord) : '', [activeRecord]);
  const activeValidationIssues = useMemo(() => {
    if (!activeRecord) return [];
    const issues = activeRecord.validationIssues
      ?? activeRecord.validationDetail.split(/\r?\n/)
        .map((line) => line.replace(/^\s*•\s*/, '').trim())
        .filter(Boolean)
        .map((message) => ({ message, severity: activeRecord.canCreate ? 'warning' as const : 'blocking' as const, code: 'detail' }));
    const orderIndex = new Map(validationRuleOrder.map((ruleId, index) => [ruleId, index]));
    return [...issues].sort((left, right) =>
      (orderIndex.get(left.code as ValidationRuleId) ?? Number.MAX_SAFE_INTEGER)
      - (orderIndex.get(right.code as ValidationRuleId) ?? Number.MAX_SAFE_INTEGER));
  }, [activeRecord, validationRuleOrder]);
  const selectedPreviewField = fields.find((field) => field.key === previewFieldKey);
  const selectedPreviewValue = activeRecord ? previewFieldValue(activeRecord, previewFieldKey) : '';

  return (
    <aside className="preview-pane">
      {activeRecord ? (
        <>
          <header className="preview-header">
            <div>
              <p className="preview-eyebrow">邮件预览</p>
              <h2>{activeRecord.recipientName}</h2>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="preview-position"
                  aria-label={`选择右上角显示字段，当前为${selectedPreviewField?.label ?? '未选择'}`}
                  data-testid="preview-field-trigger"
                >
                  <span className="truncate">{selectedPreviewValue || '—'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" data-testid="preview-field-menu">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>右上角显示字段</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={previewFieldKey} onValueChange={onPreviewFieldChange}>
                    {fields.map((field) => (
                      <DropdownMenuRadioItem key={field.key} value={field.key} data-field-key={field.key}>
                        {field.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <dl className="preview-metadata">
            <div><dt>收件人</dt><dd>{activeRecord.recipientEmail}</dd></div>
            <div><dt>主题</dt><dd>{activeRecord.subject || '未填写主题'}</dd></div>
          </dl>
          {activeValidationIssues.length ? (
            <div className="validation-issue-stack" aria-label="校验提示">
              {activeValidationIssues.map((issue, index) => {
                const ruleText = getValidationRuleText(issue.code);
                const blocking = issue.severity === 'blocking' || (!issue.severity && !activeRecord.canCreate);
                return (
                  <Alert
                    key={`${issue.code}:${index}`}
                    className={cn('validation-issue-card', blocking ? 'validation-issue-card--blocking' : 'validation-issue-card--warning')}
                    variant="default"
                    size="sm"
                  >
                    {blocking ? <CircleX aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
                    <AlertTitle>{ruleText?.name ?? activeRecord.validationText}</AlertTitle>
                    <AlertDescription>{ruleText?.description ?? issue.message}</AlertDescription>
                  </Alert>
                );
              })}
            </div>
          ) : null}
          <Separator />
          <article className="mail-body" dangerouslySetInnerHTML={{ __html: sanitizedBody }} />
          <SignaturePreview
            inspection={signatureInspection}
            loading={signatureInspectionLoading}
            error={signatureInspectionError}
            compact
          />
        </>
      ) : (
        <Empty className="h-full border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon"><MailPlus /></EmptyMedia>
            <EmptyTitle>选择一条记录</EmptyTitle>
            <EmptyDescription>邮件内容和校验提示会显示在这里。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </aside>
  );
});

const VirtualizedTableRow = memo(function VirtualizedTableRow({
  row,
  index,
  start,
  active,
  selected,
  visibleColumnSignature,
  onActivateRecord
}: {
  row: Row<MailRecord>;
  index: number;
  start: number;
  active: boolean;
  selected: boolean;
  visibleColumnSignature: string;
  onActivateRecord: (id: string) => void;
}) {
  void selected;
  void visibleColumnSignature;
  return (
    <TableRow
      data-index={index}
      data-state={active ? 'selected' : undefined}
      className={cn(
        'virtual-table-row',
        active && 'is-active',
        row.original.validationKind === 'review' && 'is-warning',
        !row.original.canCreate && 'is-blocked'
      )}
      style={{ transform: `translateY(${start}px)` }}
      onClick={() => onActivateRecord(row.original.id)}
    >
      {row.getVisibleCells().map((cell, cellIndex) => (
        <TableCell
          key={cell.id}
          style={{
            width: `var(--mail-table-column-${cellIndex}-size)`,
            maxWidth: `var(--mail-table-column-${cellIndex}-size)`
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  );
});

function VirtualizedMailTable({
  table,
  activeRecordId,
  onActivateRecord
}: {
  table: TanStackTable<MailRecord>;
  activeRecordId?: string;
  onActivateRecord: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: useCallback(() => TABLE_ROW_HEIGHT, []),
    getScrollElement: useCallback(() => scrollRef.current, []),
    getItemKey: useCallback((index: number) => rows[index]?.id ?? index, [rows]),
    overscan: 8
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleColumns = table.getVisibleLeafColumns();
  const columnSizing = table.getState().columnSizing;
  const sizingInfo = table.getState().columnSizingInfo;
  const isResizing = Boolean(sizingInfo.isResizingColumn);
  const resizeScale = sizingInfo.deltaPercentage ?? 0;
  const resizeColumnId = sizingInfo.isResizingColumn || '';
  const visibleColumnSignature = visibleColumns.map((column) => column.id).join('|');
  const tableSizingStyle = useMemo(() => {
    const style: CSSProperties & Record<`--mail-table-column-${number}-size`, string> = { width: 0 };
    let totalWidth = 0;
    visibleColumns.forEach((column, index) => {
      const size = column.getSize();
      const liveSize = column.id === resizeColumnId ? size * (1 + resizeScale) : size;
      style[`--mail-table-column-${index}-size`] = `${liveSize}px`;
      totalWidth += liveSize;
    });
    style.width = `${totalWidth}px`;
    style.minWidth = `${totalWidth}px`;
    return style;
  }, [columnSizing, resizeColumnId, resizeScale, visibleColumns]);

  return (
    <div
      ref={scrollRef}
      className={cn('table-frame', isResizing && 'is-resizing')}
      data-testid="virtualized-table-frame"
      data-total-rows={rows.length}
      data-rendered-rows={virtualRows.length}
    >
      <Table className="data-table" style={tableSizingStyle}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="virtual-table-header-row">
              {headerGroup.headers.map((header, headerIndex) => {
                const previewWidth = header.column.id === resizeColumnId
                  ? header.getSize() * (1 + resizeScale)
                  : header.getSize();
                return (
                  <TableHead key={header.id} style={{ width: `var(--mail-table-column-${headerIndex}-size)`, maxWidth: `var(--mail-table-column-${headerIndex}-size)` }}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanResize() ? (
                      <div
                        className={cn('column-resizer', header.column.getIsResizing() && 'is-resizing')}
                        data-column-resizer={header.column.id}
                        role="separator"
                        tabIndex={0}
                        aria-label={`调整${String(header.column.columnDef.id ?? '')}列宽`}
                        aria-orientation="vertical"
                        aria-valuemin={header.column.columnDef.minSize}
                        aria-valuemax={header.column.columnDef.maxSize}
                        aria-valuenow={Math.round(previewWidth)}
                        onDoubleClick={(event) => { event.stopPropagation(); header.column.resetSize(); }}
                        onKeyDown={(event) => {
                          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                          event.preventDefault();
                          const minSize = header.column.columnDef.minSize ?? 20;
                          const maxSize = header.column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER;
                          const nextSize = Math.min(maxSize, Math.max(minSize, header.column.getSize() + (event.key === 'ArrowRight' ? 8 : -8)));
                          table.setColumnSizing((current) => ({ ...current, [header.column.id]: nextSize }));
                        }}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                      />
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className={rows.length ? 'virtual-table-body' : undefined} style={rows.length ? { height: rowVirtualizer.getTotalSize() } : undefined}>
          {rows.length ? virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <VirtualizedTableRow
                key={row.id}
                row={row}
                index={virtualRow.index}
                start={virtualRow.start}
                active={row.original.id === activeRecordId}
                selected={row.getIsSelected()}
                visibleColumnSignature={visibleColumnSignature}
                onActivateRecord={onActivateRecord}
              />
            );
          }) : (
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="h-40">
                <Empty className="border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Search /></EmptyMedia>
                    <EmptyTitle>没有匹配记录</EmptyTitle>
                    <EmptyDescription>调整状态、关键词或列筛选。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function MailMergeWorkspace({
  batch,
  table,
  aggregate,
  accounts,
  accountsLoading,
  selectedAccountId,
  onAccountChange,
  templateState,
  selectedTemplateId,
  signatureInspection,
  signatureInspectionLoading,
  signatureInspectionError,
  onTemplateChange,
  onImportPackage,
  statusMode,
  onStatusModeChange,
  globalFilter,
  onGlobalFilterChange,
  columnVisibility,
  columnOrder,
  onFieldVisibilityChange,
  onColumnOrderChange,
  onResetFields,
  activeRecord,
  onActivateRecord,
  selectedCount,
  onOpenSettings,
  onCreateDrafts,
  accountMenuDefaultOpen,
  signatureMenuDefaultOpen,
  fieldManagerDefaultOpen,
  statusMenuDefaultOpen,
  selectedRowState,
  validationRuleOrder,
  referenceVisibleCount
}: {
  batch: BatchViewModel;
  table: TanStackTable<MailRecord>;
  aggregate: WorkspaceAggregate;
  accounts: OutlookAccount[];
  accountsLoading: boolean;
  selectedAccountId: string;
  onAccountChange: (id: string) => void;
  templateState: TemplateState;
  selectedTemplateId: string;
  signatureInspection: SignatureInspection | null;
  signatureInspectionLoading: boolean;
  signatureInspectionError: string;
  onTemplateChange: (id: string) => void;
  onImportPackage: () => void;
  statusMode: StatusMode;
  onStatusModeChange: (mode: StatusMode) => void;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  columnVisibility: VisibilityState;
  columnOrder: ColumnOrderState;
  onFieldVisibilityChange: (key: string, visible: boolean) => void;
  onColumnOrderChange: (order: ColumnOrderState) => void;
  onResetFields: () => void;
  activeRecord: MailRecord | undefined;
  onActivateRecord: (id: string) => void;
  selectedCount: number;
  onOpenSettings: (tab: SettingsTab) => void;
  onCreateDrafts: () => void;
  accountMenuDefaultOpen: boolean;
  signatureMenuDefaultOpen: boolean;
  fieldManagerDefaultOpen: boolean;
  statusMenuDefaultOpen: boolean;
  selectedRowState: boolean;
  validationRuleOrder: ValidationRuleId[];
  referenceVisibleCount?: number;
}) {
  const [fieldManagerOpen, setFieldManagerOpen] = useState(fieldManagerDefaultOpen);
  const [statusMenuOpen, setStatusMenuOpen] = useState(statusMenuDefaultOpen);
  const [previewFieldKey, setPreviewFieldKey] = useState(readStoredPreviewFieldKey);
  useEffect(() => {
    if (statusMenuDefaultOpen) setStatusMenuOpen(true);
  }, [statusMenuDefaultOpen]);
  useEffect(() => {
    if (batch.fields.some((field) => field.key === previewFieldKey)) return;
    setPreviewFieldKey(defaultPreviewFieldKey(batch.fields));
  }, [batch.fields, previewFieldKey]);
  useEffect(() => {
    if (!previewFieldKey) return;
    try {
      window.localStorage.setItem(PREVIEW_FIELD_STORAGE_KEY, previewFieldKey);
    } catch {
      // The selector still works for this session when storage is unavailable.
    }
  }, [previewFieldKey]);
  const visibleFieldCount = batch.fields.filter((field) => columnVisibility[field.key] !== false).length;
  const canCreate = selectedCount > 0
    && Boolean(selectedAccountId)
    && Boolean(selectedTemplateId)
    && Boolean(signatureInspection?.canUse)
    && !signatureInspectionLoading
    && !signatureInspectionError;

  return (
    <div className="app-shell">
      <WindowTitleBar />

      <main className="app-main">
        <section className="command-bar" aria-label="交接包与发件设置">
          <Button className="import-button" onClick={onImportPackage}>
            <FolderOpen data-icon="inline-start" />
            导入交接包
          </Button>
          <HintTooltip content={batch.sourcePath} side="bottom">
            <div className="path-box">
              <FileSpreadsheet aria-hidden="true" />
              <MiddleEllipsisPath value={batch.sourcePath} />
            </div>
          </HintTooltip>
          <div className="command-field account-field">
            <span className="command-label">Outlook 账户</span>
            <CommandDropdown
              id="account"
              kind="account"
              value={selectedAccountId}
              placeholder={accountsLoading ? '正在检测…' : '未检测到账户'}
              disabled={accountsLoading || !accounts.length}
              defaultOpen={accountMenuDefaultOpen}
              options={accounts.map((account) => ({
                id: account.storeId,
                label: account.smtpAddress || account.displayName,
                description: account.displayName
              }))}
              onChange={onAccountChange}
            />
          </div>
          <div className="command-field signature-field">
            <span className="command-label">邮件签名</span>
            <CommandDropdown
              id="signature"
              kind="signature"
              value={selectedTemplateId}
              placeholder="请添加签名"
              defaultOpen={signatureMenuDefaultOpen}
              options={templateState.templates.map((template) => ({
                id: template.id,
                label: template.name,
                description: template.fileName
              }))}
              onChange={onTemplateChange}
              action={{ label: '添加新签名', onSelect: () => onOpenSettings('signatures') }}
            />
          </div>
          <Button variant="ghost" size="icon" aria-label="关于"><Info /></Button>
          <Button variant="ghost" size="icon" aria-label="设置" onClick={() => onOpenSettings(DEFAULT_SETTINGS_TAB)}><Settings /></Button>
        </section>

        <section className="summary-bar" aria-label="导入汇总">
          <SummaryMetric icon={<Users />} label="全部记录" value={aggregate.total} tone="neutral" />
          <SummaryMetric icon={<CheckCircle2 />} label={validationLevelLabels.pass} value={aggregate.creatable} tone="success" />
          <SummaryMetric icon={<TriangleAlert />} label={validationLevelLabels.warning} value={aggregate.review} tone="warning" />
          <SummaryMetric icon={<CircleX />} label={validationLevelLabels.blocking} value={aggregate.blocked} tone="danger" />
        </section>

        <section className="workspace">
          <div className="table-pane">
            <div className="table-toolbar">
              <div className="table-toolbar-left">
                <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="status-select" aria-label="筛选校验状态">
                      <span>{statusOptions.find((option) => option.value === statusMode)?.label}</span>
                      <ChevronDown data-icon="inline-end" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={6} className="status-menu" data-testid="status-filter-menu">
                    <DropdownMenuLabel>筛选状态</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={statusMode} onValueChange={(value) => onStatusModeChange(value as StatusMode)}>
                      {statusOptions.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value} className="status-menu-item">
                          <span>{option.label}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <InputGroup className="global-search">
                  <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
                  <InputGroupInput value={globalFilter} onChange={(event) => onGlobalFilterChange(event.target.value)} placeholder="搜索姓名或邮箱" />
                </InputGroup>
                <FieldManager
                  open={fieldManagerOpen}
                  onOpenChange={setFieldManagerOpen}
                  fields={batch.fields}
                  visibility={columnVisibility}
                  order={columnOrder}
                  onVisibilityChange={onFieldVisibilityChange}
                  onOrderChange={onColumnOrderChange}
                  onReset={onResetFields}
                />
                <span className="field-count">{visibleFieldCount} / {batch.fields.length} 字段</span>
              </div>
              <span className="visible-count">显示 {referenceVisibleCount ?? table.getRowModel().rows.length} / {aggregate.total} 人</span>
            </div>

            <VirtualizedMailTable table={table} activeRecordId={selectedRowState ? table.getRowModel().rows[1]?.original.id : activeRecord?.id} onActivateRecord={onActivateRecord} />
          </div>

          <MailPreview
            activeRecord={activeRecord}
            fields={batch.fields}
            previewFieldKey={previewFieldKey}
            onPreviewFieldChange={setPreviewFieldKey}
            validationRuleOrder={validationRuleOrder}
            signatureInspection={signatureInspection}
            signatureInspectionLoading={signatureInspectionLoading}
            signatureInspectionError={signatureInspectionError}
          />
        </section>

        <footer className="footer-bar">
          <div className="selection-summary"><strong>{selectedCount}</strong><span>人已选择</span></div>
          <p>只保存到 Outlook 草稿箱，不会自动发送。</p>
          <Button className="create-button" size="lg" disabled={!canCreate} onClick={onCreateDrafts}>创建所选草稿</Button>
        </footer>
      </main>
    </div>
  );
}
