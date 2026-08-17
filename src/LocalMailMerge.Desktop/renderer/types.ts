export type ValidationKind = 'eligible' | 'review' | 'blocked' | 'duplicate';

export interface FieldDefinition {
  key: string;
  label: string;
  defaultVisible: boolean;
  width: number;
}

export interface MailRecord {
  id: string;
  batchId: string;
  personId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  targetRole: string;
  values: Record<string, string>;
  validationKind: ValidationKind;
  validationText: string;
  validationDetail: string;
  validationIssues?: Array<{ code: string; message: string; severity?: 'warning' | 'blocking' }>;
  canCreate: boolean;
  initiallySelected?: boolean;
}

export interface BatchViewModel {
  batchId: string;
  sourcePath: string;
  sourceWorksheetName?: string;
  headerRowNumber?: number;
  fields: FieldDefinition[];
  records: MailRecord[];
  aggregate?: { total: number; creatable?: number; eligible: number; review: number; blocked?: number; duplicate: number; visible: number };
}

export interface XlsxPreviewRow {
  rowNumber: number;
  values: string[];
}

export interface XlsxSheetInspection {
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
  suggestedHeaderRowNumber: number;
  dataRowCount: number;
  previewRows: XlsxPreviewRow[];
}

export interface XlsxWorkbookInspection {
  recommendedWorksheetName: string;
  sheets: XlsxSheetInspection[];
}

export interface XlsxImportOptions {
  worksheetName: string;
  headerRowNumber: number;
}

export interface OutlookAccount {
  index: number;
  displayName: string;
  smtpAddress: string;
  storeId: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  fileName: string;
  extension: string;
  source: 'bundled' | 'user';
}

export interface TemplateState {
  templates: TemplateSummary[];
  selectedTemplateId: string;
}

export type ValidationRuleId =
  | 'invalid_email'
  | 'already_created'
  | 'missing_subject'
  | 'missing_body'
  | 'unresolved_placeholder'
  | 'duplicate_email'
  | 'review_not_approved'
  | 'missing_personalization_source'
  | 'content_hash_mismatch';

export type ValidationRuleLevel = 'blocking' | 'warning' | 'pass';

export interface ValidationPolicyState {
  version: 1;
  rules: Record<ValidationRuleId, ValidationRuleLevel>;
}

export type DraftCreationOutcome = 'Success' | 'Skipped' | 'Failed';

export interface DraftCreationItemResult {
  personId: string;
  outcome: DraftCreationOutcome;
  outlookEntryId: string;
  errorCode: string;
  errorMessage: string;
}

export interface DraftCreationResponse {
  reportPath: string;
  summary: {
    success: number;
    skipped: number;
    failed: number;
  };
  results: DraftCreationItemResult[];
}

export interface CreateDraftsRequest {
  packagePath: string;
  worksheetName?: string;
  headerRowNumber?: number;
  templateId: string;
  selectedPersonIds: string[];
  account: OutlookAccount;
}

export interface DesktopApi {
  selectPackage(): Promise<string | null>;
  inspectXlsx(filePath: string): Promise<XlsxWorkbookInspection>;
  importPackage(filePath: string, options?: XlsxImportOptions): Promise<BatchViewModel>;
  listAccounts(): Promise<OutlookAccount[]>;
  getTemplateState(): Promise<TemplateState>;
  importTemplate(): Promise<TemplateState | null>;
  deleteTemplate(id: string): Promise<TemplateState>;
  selectTemplate(id: string): Promise<TemplateState>;
  openTemplateFolder(): Promise<void>;
  getValidationPolicy(): Promise<ValidationPolicyState>;
  saveValidationPolicy(value: ValidationPolicyState): Promise<ValidationPolicyState>;
  createDrafts(payload: CreateDraftsRequest): Promise<DraftCreationResponse>;
  showReport(reportPath: string): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(listener: (maximized: boolean) => void): void;
  offMaximizedChange(): void;
  close(): Promise<void>;
  setModalState(active: boolean): Promise<boolean>;
  openOutlook(): Promise<void>;
}

declare global {
  interface Window { desktopApi?: DesktopApi; }
}
