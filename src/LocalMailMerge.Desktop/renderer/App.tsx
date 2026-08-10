import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type RowSelectionState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import DOMPurify from 'dompurify';
import {
  ArrowSort16Regular,
  Checkmark16Regular,
  CheckmarkCircle24Regular,
  ChevronDown16Regular,
  Dismiss16Regular,
  Dismiss20Regular,
  DocumentBulletList20Regular,
  ErrorCircle24Regular,
  Filter16Regular,
  FolderOpen24Regular,
  Info20Regular,
  Mail20Regular,
  MailMultiple24Filled,
  Options20Regular,
  People24Regular,
  ReOrderDotsVertical16Regular,
  Search20Regular,
  Settings20Regular,
  Warning16Regular,
  Warning24Regular
} from '@fluentui/react-icons';
import { demoBatch } from './demoData';
import { ExcelImportDialog } from './ExcelImportDialog';
import { SettingsDialog } from './SettingsDialog';
import type {
  BatchViewModel,
  FieldDefinition,
  MailRecord,
  OutlookAccount,
  TemplateState,
  XlsxImportOptions,
  XlsxWorkbookInspection
} from './types';

type StatusMode = 'all' | 'creatable' | 'eligible' | 'review' | 'duplicate' | 'blocked' | 'selected';

interface AnchorPosition {
  left: number;
  top: number;
  width: number;
}

const fallbackAccount: OutlookAccount = {
  index: 1,
  displayName: 'John Doe',
  smtpAddress: 'john.doe@example.test',
  storeId: 'demo-store'
};

const previewTemplateState: TemplateState = {
  templates: [{
    id: 'bundled:company_signature.sample.html',
    name: '公司签名示例（仅演示）',
    fileName: 'company_signature.sample.html',
    extension: '.html',
    source: 'bundled'
  }],
  selectedTemplateId: 'bundled:company_signature.sample.html'
};

const previewXlsxInspection: XlsxWorkbookInspection = {
  recommendedWorksheetName: 'Talent List',
  sheets: [
    {
      name: 'Summary', index: 0, rowCount: 21, columnCount: 8, suggestedHeaderRowNumber: 4, dataRowCount: 17,
      previewRows: [
        { rowNumber: 1, values: ['University Research Talent List', '', '', '', '', '', '', ''] },
        { rowNumber: 4, values: ['Metric', 'Value', '', 'University', 'Total', 'Postdoc', 'RAP', 'RA'] },
        { rowNumber: 5, values: ['Total records', '327', '', 'Example University', '124', '78', '21', '25'] }
      ]
    },
    {
      name: 'Talent List', index: 1, rowCount: 328, columnCount: 10, suggestedHeaderRowNumber: 1, dataRowCount: 327,
      previewRows: [
        { rowNumber: 1, values: ['Person ID', 'Full Name', 'First Name', 'Last Name', 'Email', 'Organization', 'Department / School', 'Job Category', 'Original Job Title', 'Data Quality Status'] },
        { rowNumber: 2, values: ['demo_001', 'James Anderson', 'James', 'Anderson', 'james.anderson@example.test', 'Example University', 'Graphics Lab', 'Postdoc', 'Postdoctoral Fellow', 'Accepted'] },
        { rowNumber: 3, values: ['demo_002', 'Emily Brown', 'Emily', 'Brown', 'emily.brown@example.test', 'Demo Institute', 'Video Lab', 'RA', 'Research Assistant', 'Accepted'] },
        { rowNumber: 4, values: ['demo_003', 'Michael Chen', 'Michael', 'Chen', 'michael.chen@example.test', 'Sample University', 'Data Science', 'RAP', 'Research Assistant Professor', 'Needs Review'] },
        { rowNumber: 5, values: ['demo_004', 'Sarah Davis', 'Sarah', 'Davis', 'Unknown', 'Example University', 'UX Lab', 'Postdoc', 'Postdoctoral Fellow', 'Needs Review'] },
        { rowNumber: 6, values: ['demo_005', 'David Wilson', 'David', 'Wilson', 'david.wilson@example.test', 'Demo Institute', 'Audio Lab', 'RA', 'Research Assistant', 'Accepted'] }
      ]
    },
    { name: 'Evidence', index: 2, rowCount: 328, columnCount: 7, suggestedHeaderRowNumber: 1, dataRowCount: 327, previewRows: [{ rowNumber: 1, values: ['Person ID', 'Full Name', 'University', 'Job Category', 'Primary Source URL', 'Email Status', 'Collection Date'] }] },
    { name: 'Needs Review', index: 3, rowCount: 33, columnCount: 7, suggestedHeaderRowNumber: 1, dataRowCount: 32, previewRows: [{ rowNumber: 1, values: ['Person ID', 'Full Name', 'University', 'Job Category', 'Email', 'Issue', 'Next Action'] }] },
    { name: 'Coverage', index: 4, rowCount: 17, columnCount: 8, suggestedHeaderRowNumber: 3, dataRowCount: 14, previewRows: [{ rowNumber: 3, values: ['University', 'Total', 'Postdoc', 'RAP', 'RA', 'Accepted', 'Needs Review', 'Email Known'] }] },
    { name: 'Methodology', index: 5, rowCount: 16, columnCount: 2, suggestedHeaderRowNumber: 3, dataRowCount: 13, previewRows: [{ rowNumber: 3, values: ['Snapshot date', '2026-07-29'] }] }
  ]
};

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}

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

function ReviewPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const kind = normalized.includes('批准') && !normalized.includes('未')
    ? 'approved'
    : 'review';
  return <span className={`review-pill review-pill--${kind}`}>{value}</span>;
}

function ValidationCell({ record }: { record: MailRecord }) {
  if (record.validationText === '邮箱无效') {
    return (
      <span className="validation-inline validation-inline--blocked" title={record.validationDetail}>
        <Dismiss16Regular aria-hidden="true" />
        <span className="validation-pill">邮箱无效</span>
      </span>
    );
  }
  if (record.validationKind === 'eligible') {
    return <span className="validation-icon validation-icon--ok" title={record.validationDetail}><Checkmark16Regular aria-label="通过" /></span>;
  }
  if (record.validationKind === 'review') {
    return (
      <span className="validation-inline validation-inline--warning" title={record.validationDetail}>
        <Warning16Regular aria-hidden="true" />
        <span className="validation-pill validation-pill--warning">{record.validationText}</span>
      </span>
    );
  }
  if (record.validationKind === 'duplicate') {
    return <span className="validation-pill validation-pill--duplicate" title={record.validationDetail}>重复</span>;
  }
  return <span className="validation-inline validation-inline--blocked" title={record.validationDetail}><Dismiss16Regular aria-hidden="true" /><span className="validation-pill">{record.validationText}</span></span>;
}

function SummaryItem({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'blue' | 'green' | 'orange' | 'red';
}) {
  return (
    <div className="summary-item">
      <span className={`summary-icon summary-icon--${tone}`}>{icon}</span>
      <span className="summary-label">{label}</span>
      <strong className={`summary-value summary-value--${tone}`}>{value}</strong>
    </div>
  );
}

function FieldManager({
  anchor,
  fields,
  visibility,
  order,
  onVisibilityChange,
  onOrderChange,
  onReset,
  onClose
}: {
  anchor: AnchorPosition;
  fields: FieldDefinition[];
  visibility: VisibilityState;
  order: ColumnOrderState;
  onVisibilityChange: (key: string, visible: boolean) => void;
  onOrderChange: (order: ColumnOrderState) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const fieldByKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields]);
  const orderedFields = order.filter((key) => key !== '__select').map((key) => fieldByKey.get(key)).filter(Boolean) as FieldDefinition[];
  const visibleFields = orderedFields.filter((field) => visibility[field.key] !== false);
  const hiddenFields = orderedFields.filter((field) => visibility[field.key] === false);
  const matches = (field: FieldDefinition) => field.label.toLowerCase().includes(query.trim().toLowerCase());

  function dropBefore(targetKey: string) {
    if (!draggedKey || draggedKey === targetKey) return;
    const next = [...order];
    const from = next.indexOf(draggedKey);
    const to = next.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, draggedKey);
    onOrderChange(next);
    setDraggedKey(null);
  }

  return createPortal(
    <div
      className="popover field-manager"
      style={{ left: anchor.left, top: anchor.top }}
      role="dialog"
      aria-label="字段管理"
    >
      <div className="popover-heading">
        <strong>选择显示字段</strong>
        <button className="icon-button icon-button--small" onClick={onClose} aria-label="关闭字段管理"><Dismiss16Regular /></button>
      </div>
      <label className="popover-search">
        <Search20Regular aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索字段" />
      </label>
      <div className="field-section-label">已显示字段 <span>（拖动调整顺序）</span></div>
      <div className="field-list field-list--visible">
        {visibleFields.filter(matches).map((field) => (
          <label
            className="field-row"
            key={field.key}
            draggable
            onDragStart={() => setDraggedKey(field.key)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropBefore(field.key)}
          >
            <input
              type="checkbox"
              checked
              onChange={(event) => onVisibilityChange(field.key, event.target.checked)}
            />
            <span>{field.label}</span>
            <ReOrderDotsVertical16Regular className="drag-handle" aria-label="拖动排序" />
          </label>
        ))}
      </div>
      <div className="field-section-label field-section-label--hidden">可选字段 <span>（隐藏）</span></div>
      <div className="field-list field-list--hidden">
        {hiddenFields.filter(matches).map((field) => (
          <label className="field-row field-row--hidden" key={field.key}>
            <input
              type="checkbox"
              checked={false}
              onChange={(event) => onVisibilityChange(field.key, event.target.checked)}
            />
            <span>{field.label}</span>
          </label>
        ))}
      </div>
      <div className="popover-footer">
        <button className="text-button" onClick={onReset}>恢复默认</button>
        <button className="button button--primary button--compact" onClick={onClose}>完成</button>
      </div>
    </div>,
    document.body
  );
}

function FilterPopover({
  anchor,
  label,
  values,
  appliedValues,
  onApply,
  onClear,
  onClose
}: {
  anchor: AnchorPosition;
  label: string;
  values: string[];
  appliedValues: string[] | undefined;
  onApply: (values: string[] | undefined) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const initial = appliedValues ?? values;
  const initialKey = initial.join('\u0000');
  const [selected, setSelected] = useState(() => new Set(initial));
  const [query, setQuery] = useState('');
  useEffect(() => setSelected(new Set(initial)), [initialKey]);
  const filtered = values.filter((value) => value.toLowerCase().includes(query.trim().toLowerCase()));
  const allSelected = selected.size === values.length;

  function toggle(value: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(value); else next.delete(value);
      return next;
    });
  }

  return createPortal(
    <div
      className="popover filter-popover"
      style={{ left: Math.min(anchor.left, window.innerWidth - 218), top: anchor.top }}
      role="dialog"
      aria-label={`${label}筛选`}
    >
      <label className="popover-search">
        <Search20Regular aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" />
      </label>
      <label className="filter-option filter-option--all">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(node) => { if (node) node.indeterminate = selected.size > 0 && !allSelected; }}
          onChange={(event) => setSelected(event.target.checked ? new Set(values) : new Set())}
        />
        <span>全选</span>
      </label>
      <div className="filter-options">
        {filtered.map((value) => (
          <label className="filter-option" key={value}>
            <input type="checkbox" checked={selected.has(value)} onChange={(event) => toggle(value, event.target.checked)} />
            <span title={value}>{value}</span>
          </label>
        ))}
      </div>
      <div className="filter-footer">
        <button className="text-button text-button--muted" onClick={onClear}>清除筛选</button>
        <span className="filter-footer-actions">
          <button className="button button--ghost button--compact" onClick={onClose}>取消</button>
          <button
            className="button button--primary button--compact"
            onClick={() => onApply(selected.size === values.length ? undefined : [...selected])}
          >应用</button>
        </span>
      </div>
    </div>,
    document.body
  );
}

export function App() {
  const [batch, setBatch] = useState<BatchViewModel>(demoBatch);
  const [accounts, setAccounts] = useState<OutlookAccount[]>(() => window.desktopApi ? [] : [fallbackAccount]);
  const [selectedAccountId, setSelectedAccountId] = useState(() => window.desktopApi ? '' : fallbackAccount.storeId);
  const [accountsLoading, setAccountsLoading] = useState(Boolean(window.desktopApi));
  const [accountError, setAccountError] = useState('');
  const [templateState, setTemplateState] = useState<TemplateState>(previewTemplateState);
  const [selectedTemplateId, setSelectedTemplateId] = useState(previewTemplateState.selectedTemplateId);
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() => Object.fromEntries(
    demoBatch.records.filter((record) => record.initiallySelected).map((record) => [record.id, true])
  ));
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => Object.fromEntries(
    demoBatch.fields.map((field) => [field.key, field.defaultVisible])
  ));
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => ['__select', ...demoBatch.fields.map((field) => field.key)]);
  const [activeRecordId, setActiveRecordId] = useState(demoBatch.records[0]?.id ?? '');
  const [fieldManagerAnchor, setFieldManagerAnchor] = useState<AnchorPosition | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<(AnchorPosition & { fieldKey: string }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingXlsxImport, setPendingXlsxImport] = useState<{ filePath: string; inspection: XlsxWorkbookInspection } | null>(null);
  const fieldManagerButtonRef = useRef<HTMLButtonElement>(null);
  const referenceState = new URLSearchParams(window.location.search).get('referenceState') === '1';
  const settingsStateValue = new URLSearchParams(window.location.search).get('settingsState');
  const settingsState = settingsStateValue === 'outlook' || settingsStateValue === 'safety' ? settingsStateValue : settingsStateValue ? 'templates' : null;
  const importState = new URLSearchParams(window.location.search).get('importState') === '1';
  const warningState = new URLSearchParams(window.location.search).get('warningState') === '1';

  useEffect(() => {
    void refreshAccounts(false);
    if (!window.desktopApi) return;
    window.desktopApi.getTemplateState()
      .then((state) => {
        setTemplateState(state);
        setSelectedTemplateId(state.selectedTemplateId);
      })
      .catch((error) => setNotice(safeMessage(error)));
  }, []);

  useEffect(() => {
    if (!settingsState) return;
    const timer = window.setTimeout(() => setSettingsOpen(true), 90);
    return () => window.clearTimeout(timer);
  }, [settingsState]);

  useEffect(() => {
    if (!importState) return;
    const timer = window.setTimeout(() => setPendingXlsxImport({
      filePath: 'C:\\Data\\Handoff\\Research_Talent_List.xlsx',
      inspection: previewXlsxInspection
    }), 90);
    return () => window.clearTimeout(timer);
  }, [importState]);

  useEffect(() => {
    if (!warningState) return;
    const timer = window.setTimeout(() => {
      const warningRecord = batch.records.find((record) => record.validationKind === 'review');
      if (!warningRecord) return;
      setActiveRecordId(warningRecord.id);
      setRowSelection({ [warningRecord.id]: true });
      setConfirmOpen(true);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [batch.records, warningState]);

  useEffect(() => {
    if (!referenceState) return;
    const timer = window.setTimeout(() => {
      const fieldButton = fieldManagerButtonRef.current;
      const filterButton = document.querySelector<HTMLButtonElement>('[data-filter-id="target_role"]');
      if (fieldButton) {
        const rect = fieldButton.getBoundingClientRect();
        setFieldManagerAnchor({ left: rect.left, top: rect.bottom + 7, width: rect.width });
      }
      if (filterButton) {
        const buttonRect = filterButton.getBoundingClientRect();
        const headerRect = filterButton.closest('th')?.getBoundingClientRect() ?? buttonRect;
        setFilterAnchor({ left: headerRect.left, top: buttonRect.bottom + 6, width: headerRect.width, fieldKey: 'target_role' });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [referenceState]);

  const filteredByStatus = useMemo(() => batch.records.filter((record) => {
    if (statusMode === 'all') return true;
    if (statusMode === 'selected') return Boolean(rowSelection[record.id]);
    if (statusMode === 'creatable') return record.canCreate;
    if (statusMode === 'blocked') return !record.canCreate;
    return record.validationKind === statusMode;
  }), [batch.records, rowSelection, statusMode]);

  const columns = useMemo<ColumnDef<MailRecord>[]>(() => {
    const selection: ColumnDef<MailRecord> = {
      id: '__select',
      size: 48,
      enableSorting: false,
      enableColumnFilter: false,
      header: ({ table }) => (
        <input
          className="row-checkbox"
          type="checkbox"
          aria-label="选择当前可创建记录，包括有警告的记录"
          checked={table.getIsAllRowsSelected()}
          ref={(node) => { if (node) node.indeterminate = table.getIsSomeRowsSelected(); }}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          className="row-checkbox"
          type="checkbox"
          aria-label={`选择 ${row.original.recipientName}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onClick={(event) => event.stopPropagation()}
          onChange={row.getToggleSelectedHandler()}
        />
      )
    };

    const dynamic = batch.fields.map<ColumnDef<MailRecord>>((field) => ({
      id: field.key,
      accessorFn: (record) => record.values[field.key] ?? '',
      size: field.width,
      minSize: Math.min(96, field.width),
      filterFn: (row, columnId, filterValue: string[]) => !filterValue?.length || filterValue.includes(String(row.getValue(columnId))),
      header: ({ column }) => {
        const activeFilter = column.getFilterValue() as string[] | undefined;
        return (
          <div className="column-heading">
            <button className="column-sort" onClick={column.getToggleSortingHandler()} title={`按${field.label}排序`}>
              <span>{field.label}</span>
              {column.getIsSorted() ? <ArrowSort16Regular aria-label="已排序" /> : null}
            </button>
            <button
              className={`column-filter-button${activeFilter?.length ? ' is-active' : ''}`}
              data-filter-id={field.key}
              aria-label={`筛选${field.label}`}
              onClick={(event) => {
                event.stopPropagation();
                const buttonRect = event.currentTarget.getBoundingClientRect();
                const headerRect = event.currentTarget.closest('th')?.getBoundingClientRect() ?? buttonRect;
                setFilterAnchor({ left: headerRect.left, top: buttonRect.bottom + 6, width: headerRect.width, fieldKey: field.key });
              }}
            >
              {activeFilter?.length ? <span className="filter-count">{activeFilter.length}</span> : null}
              <Filter16Regular />
            </button>
          </div>
        );
      },
      cell: ({ row, getValue }) => {
        if (field.key === 'review_status') return <ReviewPill value={String(getValue())} />;
        if (field.key === '__validation') return <ValidationCell record={row.original} />;
        return <span className="cell-text" title={String(getValue())}>{String(getValue())}</span>;
      }
    }));
    return [selection, ...dynamic];
  }, [batch.fields]);

  const table = useReactTable({
    data: filteredByStatus,
    columns,
    state: { rowSelection, columnVisibility, columnOrder, columnFilters, globalFilter },
    getRowId: (record) => record.id,
    enableRowSelection: (row) => row.original.canCreate,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value: string) => {
      const query = value.trim().toLowerCase();
      if (!query) return true;
      return `${row.original.recipientName} ${row.original.recipientEmail}`.toLowerCase().includes(query);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const activeRecord = batch.records.find((record) => record.id === activeRecordId) ?? batch.records[0];
  const activeValidationIssues = activeRecord
    ? activeRecord.validationIssues
      ?? activeRecord.validationDetail.split(/\r?\n/)
        .map((line) => line.replace(/^\s*•\s*/, '').trim())
        .filter(Boolean)
        .map((message) => ({ message, severity: activeRecord.canCreate ? 'warning' as const : 'blocking' as const, code: 'detail' }))
    : [];
  const selectedRecords = batch.records.filter((record) => rowSelection[record.id] && record.canCreate);
  const selectedWarningRecords = selectedRecords.filter((record) => record.validationKind === 'review');
  const visibleFieldCount = batch.fields.filter((field) => columnVisibility[field.key] !== false).length;
  const aggregate = batch.aggregate ?? {
    total: batch.records.length,
    creatable: batch.records.filter((record) => record.canCreate).length,
    eligible: batch.records.filter((record) => record.validationKind === 'eligible').length,
    review: batch.records.filter((record) => record.validationKind === 'review').length,
    blocked: batch.records.filter((record) => !record.canCreate).length,
    duplicate: batch.records.filter((record) => record.validationKind === 'duplicate').length,
    visible: table.getRowModel().rows.length
  };
  const creatableCount = aggregate.creatable ?? batch.records.filter((record) => record.canCreate).length;
  const blockedCount = aggregate.blocked ?? batch.records.filter((record) => !record.canCreate).length;

  const filterField = filterAnchor ? batch.fields.find((field) => field.key === filterAnchor.fieldKey) : undefined;
  const filterValues = filterField
    ? [...new Set(batch.records.map((record) => record.values[filterField.key] ?? '').filter(Boolean))]
    : [];
  const filterColumn = filterField ? table.getColumn(filterField.key) : undefined;

  function resetForBatch(nextBatch: BatchViewModel) {
    setBatch(nextBatch);
    setColumnVisibility(Object.fromEntries(nextBatch.fields.map((field) => [field.key, field.defaultVisible])));
    setColumnOrder(['__select', ...nextBatch.fields.map((field) => field.key)]);
    setRowSelection(Object.fromEntries(nextBatch.records.filter((record) => record.initiallySelected ?? record.canCreate).map((record) => [record.id, true])));
    setActiveRecordId(nextBatch.records[0]?.id ?? '');
    setColumnFilters([]);
    setGlobalFilter('');
    setStatusMode('all');
  }

  async function importPackage() {
    if (!window.desktopApi) {
      setNotice('当前是浏览器预览模式；Electron 版本中会打开系统文件选择器。');
      return;
    }
    const filePath = await window.desktopApi.selectPackage();
    if (!filePath) return;
    try {
      if (filePath.toLowerCase().endsWith('.xlsx')) {
        const inspection = await window.desktopApi.inspectXlsx(filePath);
        setPendingXlsxImport({ filePath, inspection });
        return;
      }
      await finishImport(filePath);
    } catch (error) {
      setNotice(safeMessage(error));
    }
  }

  async function finishImport(filePath: string, options?: XlsxImportOptions) {
    if (!window.desktopApi) return;
    try {
      const imported = await window.desktopApi.importPackage(filePath, options);
      resetForBatch(imported);
      setPendingXlsxImport(null);
      const creatable = imported.aggregate?.creatable ?? imported.records.filter((record) => record.canCreate).length;
      const warningCount = imported.aggregate?.review ?? imported.records.filter((record) => record.validationKind === 'review').length;
      const blocked = imported.aggregate?.blocked ?? imported.records.filter((record) => !record.canCreate).length;
      const source = imported.sourceWorksheetName ? `（${imported.sourceWorksheetName}，第 ${imported.headerRowNumber} 行为字段）` : '';
      setNotice(`已识别 ${imported.records.length} 条记录${source}；${creatable} 条可创建（其中 ${warningCount} 条有警告），${blocked} 条硬拦截。`);
    } catch (error) {
      setNotice(safeMessage(error));
      throw error;
    }
  }

  async function refreshAccounts(announce = true) {
    if (!window.desktopApi) return;
    setAccountsLoading(true);
    setAccountError('');
    try {
      const items = await window.desktopApi.listAccounts();
      setAccounts(items);
      setSelectedAccountId((current) => items.some((item) => item.storeId === current) ? current : items[0]?.storeId ?? '');
      if (!items.length) setAccountError('没有检测到经典 Outlook 账户。');
      if (announce) setNotice(items.length ? `已检测到 ${items.length} 个 Outlook 账户。` : '没有检测到经典 Outlook 账户。');
    } catch (error) {
      const message = safeMessage(error);
      setAccounts([]);
      setSelectedAccountId('');
      setAccountError(message);
      if (announce) setNotice(message);
    } finally {
      setAccountsLoading(false);
    }
  }

  async function chooseTemplate(id: string) {
    if (!id) return;
    if (!window.desktopApi) {
      setSelectedTemplateId(id);
      setTemplateState((current) => ({ ...current, selectedTemplateId: id }));
      return;
    }
    try {
      const state = await window.desktopApi.selectTemplate(id);
      setTemplateState(state);
      setSelectedTemplateId(state.selectedTemplateId);
    } catch (error) {
      setNotice(safeMessage(error));
    }
  }

  async function importNewTemplate() {
    if (!window.desktopApi) {
      setNotice('当前是浏览器预览模式；打包版会把所选模板复制到应用专用目录。');
      return;
    }
    try {
      const state = await window.desktopApi.importTemplate();
      if (!state) return;
      setTemplateState(state);
      setSelectedTemplateId(state.selectedTemplateId);
      setNotice('模板已导入并设为当前模板。');
    } catch (error) {
      setNotice(safeMessage(error));
    }
  }

  async function removeTemplate(id: string) {
    if (!window.desktopApi) return;
    try {
      const state = await window.desktopApi.deleteTemplate(id);
      setTemplateState(state);
      setSelectedTemplateId(state.selectedTemplateId);
      setNotice('已从应用模板库中删除。');
    } catch (error) {
      setNotice(safeMessage(error));
    }
  }

  async function openTemplateFolder() {
    if (!window.desktopApi) {
      setNotice('该目录只在 Electron 打包版中可用。');
      return;
    }
    try {
      await window.desktopApi.openTemplateFolder();
    } catch (error) {
      setNotice(safeMessage(error));
    }
  }

  async function createDrafts() {
    if (!selectedRecords.length || creating) return;
    if (!window.desktopApi) {
      setConfirmOpen(false);
      setNotice('演示模式不会写入 Outlook；正式 Electron 版本只会调用 Save() 创建草稿。');
      return;
    }
    const account = accounts.find((item) => item.storeId === selectedAccountId);
    if (!account) {
      setNotice('请先选择 Outlook 发件账户。');
      return;
    }
    if (!selectedTemplateId || !templateState.templates.some((template) => template.id === selectedTemplateId)) {
      setNotice('请先在设置中导入并选择公司模板。');
      return;
    }
    setCreating(true);
    try {
      await window.desktopApi.createDrafts({
        packagePath: batch.sourcePath,
        worksheetName: batch.sourceWorksheetName,
        headerRowNumber: batch.headerRowNumber,
        templateId: selectedTemplateId,
        selectedPersonIds: selectedRecords.map((record) => record.personId),
        account
      });
      setNotice(`已保存 ${selectedRecords.length} 封 Outlook 草稿。`);
      setConfirmOpen(false);
    } catch (error) {
      setNotice(safeMessage(error));
    } finally {
      setCreating(false);
    }
  }

  function changeFieldVisibility(key: string, visible: boolean) {
    setColumnVisibility((current) => ({ ...current, [key]: visible }));
  }

  function resetFields() {
    setColumnVisibility(Object.fromEntries(batch.fields.map((field) => [field.key, field.defaultVisible])));
    setColumnOrder(['__select', ...batch.fields.map((field) => field.key)]);
  }

  function openFieldManager(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setFieldManagerAnchor((current) => current ? null : { left: rect.left, top: rect.bottom + 7, width: rect.width });
  }

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-brand">
          <span className="titlebar-logo"><MailMultiple24Filled /></span>
          <span>Local Mail Merge</span>
        </div>
        {!window.desktopApi ? (
          <div className="browser-window-controls" aria-hidden="true"><span>—</span><span>□</span><span>×</span></div>
        ) : null}
      </header>

      <main className="app-main">
        <section className="command-bar">
          <button className="button button--primary import-button" onClick={importPackage}>
            <FolderOpen24Regular />
            <span>导入交接包</span>
          </button>
          <div className="path-box" title={batch.sourcePath}>
            <span>{batch.sourcePath}</span>
            <FolderOpen24Regular aria-hidden="true" />
          </div>
          <div className="command-field account-field">
            <label htmlFor="account">Outlook 账户</label>
            <div className="select-wrap">
              <select id="account" value={selectedAccountId} disabled={accountsLoading || !accounts.length} onChange={(event) => setSelectedAccountId(event.target.value)}>
                {!accounts.length ? <option value="">{accountsLoading ? '正在检测…' : '未检测到账户'}</option> : null}
                {accounts.map((account) => <option key={account.storeId} value={account.storeId}>{account.smtpAddress || account.displayName}</option>)}
              </select>
              <ChevronDown16Regular aria-hidden="true" />
            </div>
          </div>
          <div className="command-field template-field">
            <label htmlFor="template">公司模板</label>
            <div className="select-wrap template-select-wrap">
              <select id="template" value={selectedTemplateId} disabled={!templateState.templates.length} onChange={(event) => void chooseTemplate(event.target.value)}>
                {!templateState.templates.length ? <option value="">请在设置中导入模板</option> : null}
                {templateState.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
              <ChevronDown16Regular />
            </div>
          </div>
          <button className="icon-button" aria-label="关于"><Info20Regular /></button>
          <button className="icon-button" aria-label="设置" onClick={() => setSettingsOpen(true)}><Settings20Regular /></button>
        </section>

        <section className="summary-bar" aria-label="导入汇总">
          <SummaryItem icon={<People24Regular />} label="共" value={aggregate.total} tone="blue" />
          <SummaryItem icon={<CheckmarkCircle24Regular />} label="可创建" value={creatableCount} tone="green" />
          <SummaryItem icon={<Warning24Regular />} label="其中有警告" value={aggregate.review} tone="orange" />
          <SummaryItem icon={<ErrorCircle24Regular />} label="硬拦截" value={blockedCount} tone="red" />
        </section>

        <section className="workspace">
          <div className="table-pane">
            <div className="table-toolbar">
              <div className="toolbar-row toolbar-row--primary">
                <div className="select-wrap status-select">
                  <select value={statusMode} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatusMode(event.target.value as StatusMode)}>
                    <option value="all">全部状态</option>
                    <option value="creatable">可创建（含警告）</option>
                    <option value="eligible">无警告</option>
                    <option value="review">有警告</option>
                    <option value="duplicate">仅看重复</option>
                    <option value="blocked">仅看已拦截</option>
                    <option value="selected">仅看已选择</option>
                  </select>
                  <ChevronDown16Regular aria-hidden="true" />
                </div>
                <label className="global-search">
                  <Search20Regular aria-hidden="true" />
                  <input value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="搜索姓名或邮箱" />
                </label>
              </div>
              <div className="toolbar-row toolbar-row--fields">
                <button ref={fieldManagerButtonRef} className={`button button--secondary field-button${fieldManagerAnchor ? ' is-active' : ''}`} onClick={openFieldManager}>
                  <Options20Regular />
                  <span>字段管理</span>
                </button>
                <span className="field-count">显示 {visibleFieldCount} / {batch.fields.length} 个字段</span>
                <span className="visible-count">当前显示 {referenceState ? aggregate.visible : table.getRowModel().rows.length} / {aggregate.total} 人</span>
              </div>
            </div>

            <div className="table-frame">
              <div className="table-scroll">
                <table style={{ width: table.getCenterTotalSize() }}>
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} style={{ width: header.getSize() }}>
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`${row.original.id === activeRecord?.id ? 'is-active' : ''}${row.original.validationKind === 'review' ? ' is-warning' : ''}${!row.original.canCreate ? ' is-blocked' : ''}`}
                        onClick={() => setActiveRecordId(row.original.id)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize() }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="preview-pane">
            {activeRecord ? (
              <>
                <div className="preview-heading">邮件预览</div>
                <dl className="preview-metadata">
                  <div><dt>收件人：</dt><dd>{activeRecord.recipientName} &lt;{activeRecord.recipientEmail}&gt;</dd></div>
                  <div><dt>主题：</dt><dd>{activeRecord.subject}</dd></div>
                  <div><dt>附件：</dt><dd>Offer_Letter_{activeRecord.recipientName.replaceAll(' ', '_')}.pdf</dd></div>
                </dl>
                {activeRecord.validationKind !== 'eligible' ? (
                  <div className={`validation-banner validation-banner--${activeRecord.canCreate ? 'warning' : 'blocked'}`} role="status">
                    {activeRecord.canCreate ? <Warning24Regular aria-hidden="true" /> : <ErrorCircle24Regular aria-hidden="true" />}
                    <div>
                      <strong>{activeRecord.validationText}</strong>
                      <ul>{activeValidationIssues.map((issue) => {
                        const severity = issue.severity ?? (activeRecord.canCreate ? 'warning' : 'blocking');
                        return (
                          <li className={`validation-issue validation-issue--${severity}`} key={`${issue.code}:${issue.message}`}>
                            <span>{severity === 'blocking' ? '拦截' : '警告'}</span>
                            {issue.message}
                          </li>
                        );
                      })}</ul>
                    </div>
                  </div>
                ) : null}
                <div className="preview-divider" />
                <article className="mail-body" dangerouslySetInnerHTML={{ __html: bodyMarkup(activeRecord) }} />
                <div className="mail-signature">
                  <p>Best regards,</p>
                  <p>Talent Acquisition Team<br />Example Company</p>
                </div>
              </>
            ) : <div className="empty-preview"><Mail20Regular /><span>请选择一条记录预览邮件</span></div>}
          </aside>
        </section>

        <footer className="footer-bar">
          <strong>已选择 {referenceState ? 9 : selectedRecords.length} 人</strong>
          <button className="button button--primary create-button" disabled={!selectedRecords.length || !selectedAccountId || !selectedTemplateId} onClick={() => setConfirmOpen(true)}>
            创建所选草稿
          </button>
        </footer>
      </main>

      {fieldManagerAnchor ? (
        <FieldManager
          anchor={fieldManagerAnchor}
          fields={batch.fields}
          visibility={columnVisibility}
          order={columnOrder}
          onVisibilityChange={changeFieldVisibility}
          onOrderChange={setColumnOrder}
          onReset={resetFields}
          onClose={() => setFieldManagerAnchor(null)}
        />
      ) : null}

      {filterAnchor && filterField ? (
        <FilterPopover
          key={`${filterAnchor.fieldKey}-${filterAnchor.top}`}
          anchor={filterAnchor}
          label={filterField.label}
          values={filterValues}
          appliedValues={referenceState && filterAnchor.fieldKey === 'target_role'
            ? filterValues.slice(0, 3)
            : filterColumn?.getFilterValue() as string[] | undefined}
          onApply={(values) => {
            filterColumn?.setFilterValue(values);
            setFilterAnchor(null);
          }}
          onClear={() => {
            filterColumn?.setFilterValue(undefined);
            setFilterAnchor(null);
          }}
          onClose={() => setFilterAnchor(null)}
        />
      ) : null}

      {confirmOpen ? createPortal(
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="confirm-icon"><DocumentBulletList20Regular /></div>
            <button className="icon-button confirm-close" onClick={() => setConfirmOpen(false)} aria-label="关闭"><Dismiss20Regular /></button>
            <h2 id="confirm-title">创建 {selectedRecords.length} 封 Outlook 草稿？</h2>
            <p>草稿会保存到所选账户的“草稿箱”，不会打开邮件窗口，也不会自动发送。</p>
            <dl className="confirm-details">
              <div><dt>发件账户</dt><dd>{accounts.find((item) => item.storeId === selectedAccountId)?.smtpAddress}</dd></div>
              <div><dt>公司模板</dt><dd>{templateState.templates.find((template) => template.id === selectedTemplateId)?.fileName ?? '未选择'}</dd></div>
            </dl>
            {selectedWarningRecords.length ? (
              <div className="confirm-warning" role="status">
                <Warning24Regular aria-hidden="true" />
                <div>
                  <strong>{selectedWarningRecords.length} 条记录含警告，仍会创建草稿</strong>
                  <p>请在 Outlook 中逐封补充或确认相关内容后再手动发送。</p>
                </div>
              </div>
            ) : null}
            <div className="confirm-actions">
              <button className="button button--ghost" onClick={() => setConfirmOpen(false)}>取消</button>
              <button className="button button--primary" onClick={createDrafts} disabled={creating}>{creating ? '正在创建…' : '确认创建草稿'}</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          templateState={templateState}
          accounts={accounts}
          accountsLoading={accountsLoading}
          accountError={accountError}
          initialTab={settingsState ?? 'templates'}
          onSelectTemplate={chooseTemplate}
          onImportTemplate={importNewTemplate}
          onDeleteTemplate={removeTemplate}
          onOpenTemplateFolder={openTemplateFolder}
          onRefreshAccounts={() => refreshAccounts(true)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {pendingXlsxImport ? (
        <ExcelImportDialog
          filePath={pendingXlsxImport.filePath}
          inspection={pendingXlsxImport.inspection}
          onConfirm={(options) => finishImport(pendingXlsxImport.filePath, options)}
          onClose={() => setPendingXlsxImport(null)}
        />
      ) : null}

      {notice ? (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button className="icon-button icon-button--small" onClick={() => setNotice(null)} aria-label="关闭提示"><Dismiss16Regular /></button>
        </div>
      ) : null}
    </div>
  );
}
