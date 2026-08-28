import { useEffect, useMemo, useState } from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type RowSelectionState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { AlertCircle, ArrowUpDown, FileStack, Loader2, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import { HintTooltip } from '@/components/HintTooltip';
import { toast } from 'sonner';
import { applyValidationPolicyToDemoBatch, demoBatch } from './demoData';
import { DraftCreationResultDialog } from './DraftCreationResultDialog';
import { ExcelImportDialog } from './ExcelImportDialog';
import { SettingsDialog, type SettingsTab } from './SettingsDialog';
import { isSettingsTab } from './settingsNavigation';
import { applyAppearanceSettings, defaultAppearanceSettings } from './appearanceSettings';
import { ColumnFilterMenu, ReviewBadge, ValidationBadge } from './features/mail-merge/MailMergeControls';
import { MailMergeWorkspace, type StatusMode } from './features/mail-merge/MailMergeWorkspace';
import { defaultValidationPolicy, moveValidationRuleInPolicy, validationLevelLabels } from './validationRules';
import type {
  BatchViewModel,
  AppearanceSettingsState,
  DraftCreationResponse,
  MailRecord,
  OutlookAccount,
  SignatureInspection,
  TemplateState,
  ValidationPolicyState,
  ValidationRuleId,
  ValidationRuleLevel,
  XlsxImportOptions,
  XlsxWorkbookInspection
} from './types';

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

const previewSignatureInspection: SignatureInspection = {
  kind: 'html',
  previewHtml: `<div style="font-family:'Microsoft YaHei UI','Segoe UI',sans-serif;color:#374151">
    <p>Best regards,</p>
    <p><strong>Example Talent Team</strong><br>Example Company<br><a href="https://example.test">example.test</a></p>
  </div>`,
  previewComplete: true,
  subject: '',
  to: '',
  cc: '',
  bcc: '',
  inlineAttachments: [],
  regularAttachments: [],
  issues: [],
  canUse: true
};

const initialDemoBatch = applyValidationPolicyToDemoBatch(defaultValidationPolicy);

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
        { rowNumber: 1, values: ['Person ID', 'Full Name', 'First Name', 'Last Name', '学生邮箱', 'Organization', 'Department / School', 'Job Category', 'Original Job Title', 'Data Quality Status'] },
        { rowNumber: 2, values: ['demo_001', 'James Anderson', 'James', 'Anderson', 'james.anderson@example.test', 'Example University', 'Graphics Lab', 'Postdoc', 'Postdoctoral Fellow', 'Accepted'] },
        { rowNumber: 3, values: ['demo_002', 'Emily Brown', 'Emily', 'Brown', 'emily.brown@example.test', 'Demo Institute', 'Video Lab', 'RA', 'Research Assistant', 'Accepted'] },
        { rowNumber: 4, values: ['demo_003', 'Michael Chen', 'Michael', 'Chen', 'michael.chen@example.test', 'Sample University', 'Data Science', 'RAP', 'Research Assistant Professor', 'Needs Review'] },
        { rowNumber: 5, values: ['demo_004', 'Sarah Davis', 'Sarah', 'Davis', 'Unknown', 'Example University', 'UX Lab', 'Postdoc', 'Postdoctoral Fellow', 'Needs Review'] }
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

interface CreationResultState {
  response: DraftCreationResponse;
  records: MailRecord[];
  revalidationError?: string;
}

export function App() {
  const [batch, setBatch] = useState<BatchViewModel>(initialDemoBatch);
  const [accounts, setAccounts] = useState<OutlookAccount[]>(() => window.desktopApi ? [] : [fallbackAccount]);
  const [selectedAccountId, setSelectedAccountId] = useState(() => window.desktopApi ? '' : fallbackAccount.storeId);
  const [accountsLoading, setAccountsLoading] = useState(Boolean(window.desktopApi));
  const [accountError, setAccountError] = useState('');
  const [templateState, setTemplateState] = useState<TemplateState>(previewTemplateState);
  const [selectedTemplateId, setSelectedTemplateId] = useState(previewTemplateState.selectedTemplateId);
  const [signatureInspection, setSignatureInspection] = useState<SignatureInspection | null>(() => window.desktopApi ? null : previewSignatureInspection);
  const [signatureInspectionLoading, setSignatureInspectionLoading] = useState(Boolean(window.desktopApi));
  const [signatureInspectionError, setSignatureInspectionError] = useState('');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [globalFilter, setGlobalFilter] = useState('');
  const [debouncedGlobalFilter, setDebouncedGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() => Object.fromEntries(
    initialDemoBatch.records.filter((record) => record.initiallySelected).map((record) => [record.id, true])
  ));
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => Object.fromEntries(
    initialDemoBatch.fields.map((field) => [field.key, field.defaultVisible])
  ));
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => ['__select', ...initialDemoBatch.fields.map((field) => field.key)]);
  const [activeRecordId, setActiveRecordId] = useState(initialDemoBatch.records[0]?.id ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [pendingXlsxImport, setPendingXlsxImport] = useState<{ filePath: string; inspection: XlsxWorkbookInspection } | null>(null);
  const [creationResult, setCreationResult] = useState<CreationResultState | null>(null);
  const [validationPolicy, setValidationPolicy] = useState<ValidationPolicyState>(defaultValidationPolicy);
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettingsState>(defaultAppearanceSettings);
  const [hasImportedPackage, setHasImportedPackage] = useState(false);

  const queryParameters = new URLSearchParams(window.location.search);
  const referenceState = queryParameters.get('referenceState') === '1';
  const settingsStateValue = queryParameters.get('settingsState');
  const settingsState: SettingsTab | null = isSettingsTab(settingsStateValue) ? settingsStateValue : null;
  const importState = queryParameters.get('importState') === '1';
  const warningState = queryParameters.get('warningState') === '1';
  const warningPreviewState = queryParameters.get('warningPreviewState') === '1';
  const accountMenuState = queryParameters.get('accountMenuState') === '1';
  const signatureMenuState = queryParameters.get('signatureMenuState') === '1';
  const fieldMenuState = queryParameters.get('fieldMenuState') === '1';
  const filterMenuState = queryParameters.get('filterMenuState') === '1';
  const statusMenuState = queryParameters.get('statusMenuState') === '1';
  const selectedRowState = queryParameters.get('selectedRowState') === '1';
  const creationResultState = queryParameters.get('creationResultState') === '1';

  useEffect(() => {
    void refreshAccounts(false);
    if (!window.desktopApi) return;
    window.desktopApi.getTemplateState()
      .then((state) => {
        setTemplateState(state);
        setSelectedTemplateId(state.selectedTemplateId);
      })
      .catch((error) => toast.error(safeMessage(error)));
    window.desktopApi.getValidationPolicy()
      .then((policy) => {
        setValidationPolicy(policy);
        resetForBatch(applyValidationPolicyToDemoBatch(policy));
      })
      .catch((error) => toast.error(safeMessage(error)));
    window.desktopApi.getAppearanceSettings()
      .then(setAppearanceSettings)
      .catch((error) => toast.error(safeMessage(error)));
  }, []);

  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSignatureInspection(null);
      setSignatureInspectionLoading(false);
      setSignatureInspectionError('');
      return;
    }
    if (!window.desktopApi) {
      setSignatureInspection(previewSignatureInspection);
      setSignatureInspectionLoading(false);
      setSignatureInspectionError('');
      return;
    }

    let active = true;
    setSignatureInspectionLoading(true);
    setSignatureInspectionError('');
    window.desktopApi.inspectTemplate(selectedTemplateId)
      .then((inspection) => { if (active) setSignatureInspection(inspection); })
      .catch((error) => {
        if (!active) return;
        setSignatureInspection(null);
        setSignatureInspectionError(safeMessage(error));
      })
      .finally(() => { if (active) setSignatureInspectionLoading(false); });
    return () => { active = false; };
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!settingsState) return;
    const timer = window.setTimeout(() => setSettingsTab(settingsState), 90);
    return () => window.clearTimeout(timer);
  }, [settingsState]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedGlobalFilter(globalFilter), 140);
    return () => window.clearTimeout(timer);
  }, [globalFilter]);

  useEffect(() => {
    if (!filterMenuState) return;
    const countries = [...new Set(batch.records.map((record) => record.values.country ?? '').filter(Boolean))];
    setColumnFilters([{ id: 'country', value: countries.slice(0, Math.max(0, countries.length - 2)) }]);
  }, [batch.records, filterMenuState]);

  useEffect(() => {
    const settingsOpen = Boolean(settingsTab);
    document.documentElement.dataset.titlebarDimmed = String(settingsOpen);
    if (!window.desktopApi?.setModalState) return;
    void window.desktopApi.setModalState(settingsOpen).catch(() => {
      document.documentElement.dataset.titlebarDimmed = 'false';
    });
    return () => { if (settingsOpen) void window.desktopApi?.setModalState(false); };
  }, [settingsTab]);

  useEffect(() => {
    if (!importState) return;
    const timer = window.setTimeout(() => setPendingXlsxImport({
      filePath: 'C:\\Data\\Handoff\\Research_Talent_List.xlsx',
      inspection: previewXlsxInspection
    }), 90);
    return () => window.clearTimeout(timer);
  }, [importState]);

  useEffect(() => {
    if (!warningPreviewState && !warningState) return;
    const timer = window.setTimeout(() => {
      const warningRecord = batch.records.find((record) => record.validationKind === 'review');
      if (!warningRecord) return;
      setActiveRecordId(warningRecord.id);
      if (warningState) {
        const selected = Object.fromEntries(batch.records.filter((record) => record.canCreate).slice(0, 2).map((record) => [record.id, true]));
        selected[warningRecord.id] = true;
        setRowSelection(selected);
        setConfirmOpen(true);
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [batch.records, warningPreviewState, warningState]);

  useEffect(() => {
    if (!creationResultState) return;
    const previewRecords = demoBatch.records.slice(0, 3);
    const timer = window.setTimeout(() => setCreationResult({
      response: {
        reportPath: 'C:\\Users\\Example\\AppData\\Local\\SeanX16\\LocalMailMerge\\reports\\demo_batch_20260813_153000.json',
        summary: { success: 2, skipped: 0, failed: 1 },
        results: [
          { personId: previewRecords[0]?.personId ?? 'demo_001', outcome: 'Success', outlookEntryId: 'demo-entry', errorCode: '', errorMessage: '' },
          { personId: previewRecords[1]?.personId ?? 'demo_002', outcome: 'Failed', outlookEntryId: '', errorCode: 'COMException', errorMessage: 'Outlook 暂时无法保存此草稿，请确认经典 Outlook 已启动后重试。' },
          { personId: previewRecords[2]?.personId ?? 'demo_003', outcome: 'Success', outlookEntryId: 'demo-entry-2', errorCode: 'PostSaveWarning', errorMessage: '草稿已保存，但本地重复保护记录写入失败：示例权限错误。' }
        ]
      },
      records: previewRecords
    }), 90);
    return () => window.clearTimeout(timer);
  }, [creationResultState]);

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
      size: 42,
      enableResizing: false,
      enableSorting: false,
      enableColumnFilter: false,
      header: ({ table }) => (
        <Checkbox
          className="row-checkbox"
          aria-label="选择当前可创建记录，包括有警告的记录"
          checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          className="row-checkbox"
          aria-label={`选择 ${row.original.recipientName}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        />
      )
    };

    const dynamic = batch.fields.map<ColumnDef<MailRecord>>((field) => {
      const values = [...new Set(batch.records.map((record) => record.values[field.key] ?? '').filter(Boolean))];
      return {
        id: field.key,
        accessorFn: (record) => record.values[field.key] ?? '',
        size: field.width,
        minSize: field.label === '校验结果' ? 92 : Math.min(76, field.width),
        maxSize: 560,
        enableResizing: true,
        filterFn: (row, columnId, filterValue: string[]) => !filterValue?.length || filterValue.includes(String(row.getValue(columnId))),
        header: ({ column }) => {
          const activeFilter = column.getFilterValue() as string[] | undefined;
          return (
            <div className="column-heading">
              <HintTooltip content={`按${field.label}排序`}>
                <Button type="button" variant="ghost" size="sm" className="column-sort" onClick={column.getToggleSortingHandler()}>
                  <span>{field.label}</span>
                  {column.getIsSorted() ? <ArrowUpDown data-icon="inline-end" aria-label="已排序" /> : null}
                </Button>
              </HintTooltip>
              <ColumnFilterMenu
                fieldKey={field.key}
                label={field.label}
                values={values}
                appliedValues={activeFilter}
                defaultOpen={(referenceState && field.key === 'target_role') || (filterMenuState && field.key === 'country')}
                onApply={(next) => column.setFilterValue(next)}
              />
            </div>
          );
        },
        cell: ({ row, getValue }) => {
          if (field.key === 'review_status') return <ReviewBadge value={String(getValue())} />;
          if (field.key === '__validation' || field.key === '__validation_result' || field.label === '校验结果') return <ValidationBadge record={row.original} />;
          return <HintTooltip content={String(getValue())}><span className="cell-text">{String(getValue())}</span></HintTooltip>;
        }
      };
    });
    return [selection, ...dynamic];
  }, [batch.fields, batch.records, filterMenuState, referenceState]);

  const table = useReactTable({
    data: filteredByStatus,
    columns,
    state: { rowSelection, columnVisibility, columnOrder, columnFilters, globalFilter: debouncedGlobalFilter },
    getRowId: (record) => record.id,
    enableRowSelection: (row) => row.original.canCreate,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnFiltersChange: setColumnFilters,
    columnResizeMode: 'onEnd',
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
  const selectedRecords = batch.records.filter((record) => rowSelection[record.id] && record.canCreate);
  const selectedWarningRecords = selectedRecords.filter((record) => record.validationKind === 'review');
  const signatureWarningCount = signatureInspection?.issues.filter((issue) => issue.severity === 'warning').length ?? 0;
  const aggregate = batch.aggregate ?? {
    total: batch.records.length,
    creatable: batch.records.filter((record) => record.canCreate).length,
    eligible: batch.records.filter((record) => record.validationKind === 'eligible').length,
    review: batch.records.filter((record) => record.validationKind === 'review').length,
    blocked: batch.records.filter((record) => !record.canCreate).length,
    duplicate: batch.records.filter((record) => record.validationKind === 'duplicate').length,
    visible: table.getRowModel().rows.length
  };

  function resetForBatch(nextBatch: BatchViewModel) {
    setBatch(nextBatch);
    setColumnVisibility(Object.fromEntries(nextBatch.fields.map((field) => [field.key, field.defaultVisible])));
    setColumnOrder(['__select', ...nextBatch.fields.map((field) => field.key)]);
    setRowSelection(Object.fromEntries(nextBatch.records.filter((record) => record.initiallySelected ?? record.canCreate).map((record) => [record.id, true])));
    setActiveRecordId(nextBatch.records[0]?.id ?? '');
    setColumnFilters([]);
    setGlobalFilter('');
    setDebouncedGlobalFilter('');
    setStatusMode('all');
  }

  async function importPackage() {
    if (!window.desktopApi) {
      toast.info('当前是浏览器预览模式；Electron 版本中会打开系统文件选择器。');
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
      toast.error(safeMessage(error));
    }
  }

  async function finishImport(filePath: string, options?: XlsxImportOptions) {
    if (!window.desktopApi) return;
    try {
      const imported = await window.desktopApi.importPackage(filePath, options);
      resetForBatch(imported);
      setHasImportedPackage(true);
      setPendingXlsxImport(null);
      const creatable = imported.aggregate?.creatable ?? imported.records.filter((record) => record.canCreate).length;
      const warningCount = imported.aggregate?.review ?? imported.records.filter((record) => record.validationKind === 'review').length;
      const blocked = imported.aggregate?.blocked ?? imported.records.filter((record) => !record.canCreate).length;
      toast.success(`已识别 ${imported.records.length} 条记录：${creatable} 条${validationLevelLabels.pass}，${warningCount} 条${validationLevelLabels.warning}，${blocked} 条${validationLevelLabels.blocking}。`);
    } catch (error) {
      toast.error(safeMessage(error));
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
      if (announce) toast[items.length ? 'success' : 'warning'](items.length ? `已检测到 ${items.length} 个 Outlook 账户。` : '没有检测到经典 Outlook 账户。');
    } catch (error) {
      const message = safeMessage(error);
      setAccounts([]);
      setSelectedAccountId('');
      setAccountError(message);
      if (announce) toast.error(message);
    } finally {
      setAccountsLoading(false);
    }
  }

  async function applyValidationPolicy(nextPolicy: ValidationPolicyState) {
    if (!window.desktopApi) {
      setValidationPolicy(nextPolicy);
      resetForBatch(applyValidationPolicyToDemoBatch(nextPolicy));
      return;
    }

    const saved = await window.desktopApi.saveValidationPolicy(nextPolicy);
    setValidationPolicy(saved);
    if (hasImportedPackage) {
      const options = batch.sourceWorksheetName && batch.headerRowNumber
        ? {
            worksheetName: batch.sourceWorksheetName,
            headerRowNumber: batch.headerRowNumber,
            emailColumnName: batch.sourceEmailColumnName ?? ''
          }
        : undefined;
      const refreshed = await window.desktopApi.importPackage(batch.sourcePath, options);
      setBatch(refreshed);
      setRowSelection(Object.fromEntries(
        refreshed.records
          .filter((record) => record.initiallySelected)
          .map((record) => [record.id, true])
      ));
      setActiveRecordId((current) => refreshed.records.some((record) => record.id === current)
        ? current
        : refreshed.records[0]?.id ?? '');
    } else {
      resetForBatch(applyValidationPolicyToDemoBatch(saved));
    }
  }

  async function moveValidationRule(
    ruleId: ValidationRuleId,
    level: ValidationRuleLevel,
    targetRuleId?: ValidationRuleId,
    edge?: 'before' | 'after'
  ) {
    const nextPolicy = moveValidationRuleInPolicy(validationPolicy, ruleId, level, targetRuleId, edge);
    try {
      await applyValidationPolicy(nextPolicy);
    } catch (error) {
      toast.error(safeMessage(error));
    }
  }

  async function resetValidationPolicy() {
    const nextPolicy: ValidationPolicyState = {
      version: 1,
      rules: { ...defaultValidationPolicy.rules },
      order: [...defaultValidationPolicy.order]
    };
    try {
      await applyValidationPolicy(nextPolicy);
      toast.success('规则设置已恢复为默认值。');
    } catch (error) {
      toast.error(safeMessage(error));
    }
  }

  async function changeAppearanceSettings(nextSettings: AppearanceSettingsState) {
    const previousSettings = appearanceSettings;
    setAppearanceSettings(nextSettings);
    if (!window.desktopApi) return;
    try {
      const saved = await window.desktopApi.saveAppearanceSettings(nextSettings);
      setAppearanceSettings(saved);
    } catch (error) {
      setAppearanceSettings(previousSettings);
      toast.error(safeMessage(error));
      throw error;
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
      toast.error(safeMessage(error));
    }
  }

  async function importNewTemplate() {
    if (!window.desktopApi) {
      toast.info('打包版会把所选签名复制到应用专用目录。');
      return;
    }
    try {
      const state = await window.desktopApi.importTemplate();
      if (!state) return;
      setTemplateState(state);
      setSelectedTemplateId(state.selectedTemplateId);
      toast.success('签名已导入并设为当前签名。');
    } catch (error) {
      toast.error(safeMessage(error));
    }
  }

  async function removeTemplate(id: string) {
    if (!window.desktopApi) return;
    try {
      const state = await window.desktopApi.deleteTemplate(id);
      setTemplateState(state);
      setSelectedTemplateId(state.selectedTemplateId);
      toast.success('已从应用签名库中删除。');
    } catch (error) {
      toast.error(safeMessage(error));
    }
  }

  async function renameTemplate(id: string, name: string) {
    if (!window.desktopApi) {
      setTemplateState((current) => ({
        ...current,
        templates: current.templates.map((template) => template.id === id ? { ...template, name } : template)
      }));
      return;
    }
    try {
      const state = await window.desktopApi.renameTemplate(id, name);
      setTemplateState(state);
      toast.success('签名名称已更新。');
    } catch (error) {
      toast.error(safeMessage(error));
      throw error;
    }
  }

  async function openTemplateFolder() {
    if (!window.desktopApi) {
      toast.info('该目录只在 Electron 打包版中可用。');
      return;
    }
    try { await window.desktopApi.openTemplateFolder(); } catch (error) { toast.error(safeMessage(error)); }
  }

  async function createSignatureTestDraft() {
    if (!window.desktopApi) {
      toast.info('演示模式不会写入 Outlook。');
      return;
    }
    const account = accounts.find((item) => item.storeId === selectedAccountId);
    if (!account) { toast.error('请先在主界面选择 Outlook 发件账户。'); return; }
    if (!selectedTemplateId || !signatureInspection?.canUse) { toast.error('请先选择通过检查的邮件签名。'); return; }
    try {
      await window.desktopApi.createSignatureTestDraft({ templateId: selectedTemplateId, account });
      toast.success('无收件人的签名测试草稿已保存。', {
        description: '请在所选 Outlook 账户的草稿箱中检查文字、Logo、链接和排版，确认后删除，不要发送。'
      });
    } catch (error) {
      toast.error(safeMessage(error));
    }
  }

  async function createDrafts() {
    if (!selectedRecords.length || creating) return;
    if (!window.desktopApi) {
      setConfirmOpen(false);
      toast.info('演示模式不会写入 Outlook；正式版本只调用 Save() 创建草稿。');
      return;
    }
    const account = accounts.find((item) => item.storeId === selectedAccountId);
    if (!account) { toast.error('请先选择 Outlook 发件账户。'); return; }
    if (!selectedTemplateId || !templateState.templates.some((template) => template.id === selectedTemplateId)) {
      toast.error('请先在设置中导入并选择邮件签名。');
      return;
    }
    if (!signatureInspection?.canUse || signatureInspectionLoading || signatureInspectionError) {
      toast.error('当前邮件签名尚未通过检查，请先在设置中处理签名问题。');
      return;
    }
    setCreating(true);
    try {
      const selectedSnapshot = [...selectedRecords];
      const workerResponse = await window.desktopApi.createDrafts({
        packagePath: batch.sourcePath,
        worksheetName: batch.sourceWorksheetName,
        headerRowNumber: batch.headerRowNumber,
        emailColumnName: batch.sourceEmailColumnName,
        templateId: selectedTemplateId,
        selectedPersonIds: selectedRecords.map((record) => record.personId),
        account
      });
      const outcomeCounts = workerResponse.results.reduce((counts, result) => {
        if (result.outcome === 'Success') counts.success += 1;
        else if (result.outcome === 'Skipped') counts.skipped += 1;
        else counts.failed += 1;
        return counts;
      }, { success: 0, skipped: 0, failed: 0 });
      const response: DraftCreationResponse = {
        ...workerResponse,
        summary: outcomeCounts
      };
      setConfirmOpen(false);
      let revalidationError = '';
      try {
        const xlsxOptions = batch.sourceWorksheetName && batch.headerRowNumber
          ? {
              worksheetName: batch.sourceWorksheetName,
              headerRowNumber: batch.headerRowNumber,
              emailColumnName: batch.sourceEmailColumnName ?? ''
            }
          : undefined;
        const refreshed = await window.desktopApi.importPackage(batch.sourcePath, xlsxOptions);
        setBatch(refreshed);
        setRowSelection((current) => Object.fromEntries(
          refreshed.records
            .filter((record) => record.canCreate && current[record.id])
            .map((record) => [record.id, true])
        ));
        setActiveRecordId((current) => refreshed.records.some((record) => record.id === current)
          ? current
          : refreshed.records[0]?.id ?? '');
      } catch (error) {
        revalidationError = safeMessage(error);
      }
      setCreationResult({ response, records: selectedSnapshot, revalidationError: revalidationError || undefined });
    } catch (error) {
      toast.error(safeMessage(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <MailMergeWorkspace
        batch={batch}
        table={table}
        aggregate={{
          total: aggregate.total,
          creatable: aggregate.creatable ?? batch.records.filter((record) => record.canCreate).length,
          review: aggregate.review,
          blocked: aggregate.blocked ?? batch.records.filter((record) => !record.canCreate).length
        }}
        accounts={accounts}
        accountsLoading={accountsLoading}
        selectedAccountId={selectedAccountId}
        onAccountChange={setSelectedAccountId}
        templateState={templateState}
        selectedTemplateId={selectedTemplateId}
        signatureInspection={signatureInspection}
        signatureInspectionLoading={signatureInspectionLoading}
        signatureInspectionError={signatureInspectionError}
        onTemplateChange={(id) => void chooseTemplate(id)}
        onImportPackage={() => void importPackage()}
        statusMode={statusMode}
        onStatusModeChange={setStatusMode}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        columnVisibility={columnVisibility}
        columnOrder={columnOrder}
        onFieldVisibilityChange={(key, visible) => setColumnVisibility((current) => ({ ...current, [key]: visible }))}
        onColumnOrderChange={setColumnOrder}
        onResetFields={() => {
          setColumnVisibility(Object.fromEntries(batch.fields.map((field) => [field.key, field.defaultVisible])));
          setColumnOrder(['__select', ...batch.fields.map((field) => field.key)]);
        }}
        activeRecord={activeRecord}
        onActivateRecord={setActiveRecordId}
        selectedCount={referenceState ? 9 : selectedRecords.length}
        onOpenSettings={setSettingsTab}
        onCreateDrafts={() => setConfirmOpen(true)}
        accountMenuDefaultOpen={accountMenuState}
        signatureMenuDefaultOpen={signatureMenuState}
        fieldManagerDefaultOpen={fieldMenuState}
        statusMenuDefaultOpen={statusMenuState}
        selectedRowState={selectedRowState}
        validationRuleOrder={validationPolicy.order}
        referenceVisibleCount={referenceState ? aggregate.visible : undefined}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogMedia><FileStack /></AlertDialogMedia>
            <AlertDialogTitle>创建 {selectedRecords.length} 封 Outlook 草稿？</AlertDialogTitle>
            <AlertDialogDescription>草稿会保存到所选账户的“草稿箱”，不会打开邮件窗口，也不会自动发送。</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="confirm-details">
            <div><dt>发件账户</dt><dd>{accounts.find((item) => item.storeId === selectedAccountId)?.smtpAddress}</dd></div>
            <div><dt>邮件签名</dt><dd>{templateState.templates.find((template) => template.id === selectedTemplateId)?.name ?? '未选择'}</dd></div>
          </dl>
          {selectedWarningRecords.length ? (
            <Alert className="confirm-warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{selectedWarningRecords.length} 条记录含警告</AlertTitle>
              <AlertDescription>仍会创建草稿，请在 Outlook 中补充或确认后再手动发送。</AlertDescription>
            </Alert>
          ) : null}
          {signatureWarningCount ? (
            <Alert className="confirm-warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>邮件签名含 {signatureWarningCount} 项提示</AlertTitle>
              <AlertDescription>草稿仍可创建；请先用无收件人的测试草稿确认图片、链接和最终排版。</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void createDrafts()} disabled={creating}>
              {creating ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              {creating ? '正在创建…' : '确认创建草稿'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {settingsTab ? (
        <SettingsDialog
          templateState={templateState}
          selectedTemplateId={selectedTemplateId}
          signatureInspection={signatureInspection}
          signatureInspectionLoading={signatureInspectionLoading}
          signatureInspectionError={signatureInspectionError}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          accountsLoading={accountsLoading}
          accountError={accountError}
          initialTab={settingsTab}
          onSelectTemplate={chooseTemplate}
          onImportTemplate={importNewTemplate}
          onRenameTemplate={renameTemplate}
          onDeleteTemplate={removeTemplate}
          onOpenTemplateFolder={openTemplateFolder}
          onCreateSignatureTestDraft={createSignatureTestDraft}
          onRefreshAccounts={() => refreshAccounts(true)}
          validationPolicy={validationPolicy}
          onMoveValidationRule={moveValidationRule}
          onResetValidationPolicy={resetValidationPolicy}
          appearanceSettings={appearanceSettings}
          onChangeAppearanceSettings={changeAppearanceSettings}
          onClose={() => setSettingsTab(null)}
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

      {creationResult ? (
        <DraftCreationResultDialog
          response={creationResult.response}
          records={creationResult.records}
          revalidationError={creationResult.revalidationError}
          onShowReport={() => {
            if (!window.desktopApi) {
              toast.info('结果报告只在 Electron 版本中生成。');
              return;
            }
            void window.desktopApi.showReport(creationResult.response.reportPath).catch((error) => toast.error(safeMessage(error)));
          }}
          onClose={() => setCreationResult(null)}
        />
      ) : null}

      <Toaster position="bottom-right" />
    </>
  );
}
