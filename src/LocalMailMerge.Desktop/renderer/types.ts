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

export interface SignatureInspectionIssue {
  code: string;
  message: string;
  severity: 'warning' | 'blocking';
}

export interface SignatureInspection {
  kind: 'html' | 'oft';
  previewHtml: string;
  previewComplete: boolean;
  subject: string;
  to: string;
  cc: string;
  bcc: string;
  inlineAttachments: string[];
  regularAttachments: string[];
  issues: SignatureInspectionIssue[];
  canUse: boolean;
}

export interface SignatureTestDraftResponse {
  outlookEntryId: string;
  inspection: SignatureInspection;
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
  order: ValidationRuleId[];
}

export type AppFontId = 'noto-sans-sc' | 'segoe-ui' | 'microsoft-yahei' | 'pingfang-bold';
export type AccentColorId = 'blue' | 'amber' | 'cyan' | 'emerald' | 'fuchsia' | 'green' | 'indigo' | 'lime' | 'orange' | 'pink';

export interface AppearanceSettingsState {
  version: 1;
  font: AppFontId;
  accent: AccentColorId;
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
  renameTemplate(id: string, name: string): Promise<TemplateState>;
  deleteTemplate(id: string): Promise<TemplateState>;
  selectTemplate(id: string): Promise<TemplateState>;
  inspectTemplate(id: string): Promise<SignatureInspection>;
  openTemplateFolder(): Promise<void>;
  getValidationPolicy(): Promise<ValidationPolicyState>;
  saveValidationPolicy(value: ValidationPolicyState): Promise<ValidationPolicyState>;
  getAppearanceSettings(): Promise<AppearanceSettingsState>;
  saveAppearanceSettings(value: AppearanceSettingsState): Promise<AppearanceSettingsState>;
  createDrafts(payload: CreateDraftsRequest): Promise<DraftCreationResponse>;
  createSignatureTestDraft(payload: { templateId: string; account: OutlookAccount }): Promise<SignatureTestDraftResponse>;
  showReport(reportPath: string): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(listener: (maximized: boolean) => void): void;
  offMaximizedChange(): void;
  close(): Promise<void>;
  setModalState(active: boolean): Promise<boolean>;
  openOutlook(): Promise<void>;
  openAuthorProfile(): Promise<void>;
  openProjectLicense(): Promise<void>;
  openProjectRepository(): Promise<void>;
}

declare global {
  interface Window { desktopApi?: DesktopApi; }
}
