import { useState, type CSSProperties } from 'react';
import {
  CircleCheck,
  FolderOpen,
  Loader2,
  Mail,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Signature,
  Trash2,
  TriangleAlert,
  type LucideIcon
} from 'lucide-react';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type {
  AppearanceSettingsState,
  OutlookAccount,
  TemplateState,
  ValidationPolicyState,
  ValidationRuleId,
  ValidationRuleLevel
} from './types';
import { accentOptions, fontOptions } from './appearanceSettings';
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, type SettingsTab } from './settingsNavigation';
import { ValidationRulesEditor } from './ValidationRulesEditor';

export type { SettingsTab } from './settingsNavigation';

const settingsTabDetails = {
  appearance: { label: '外观', icon: Palette },
  signatures: { label: '邮件签名', icon: Signature },
  outlook: { label: 'Outlook 账户', icon: Mail },
  safety: { label: '导入与安全', icon: ShieldCheck }
} satisfies Record<SettingsTab, { label: string; icon: LucideIcon }>;

const settingsMenuButtonClass = 'data-[active=false]:text-muted-foreground data-[active=false]:[&_svg]:text-muted-foreground data-[active=false]:hover:text-muted-foreground data-[active=false]:hover:[&_svg]:text-muted-foreground data-active:bg-primary/10 data-active:text-foreground data-active:[&_svg]:text-primary data-active:hover:bg-primary/10 data-active:hover:text-foreground data-active:hover:[&_svg]:text-primary';

export function SettingsDialog({
  templateState,
  accounts,
  accountsLoading,
  accountError,
  initialTab = DEFAULT_SETTINGS_TAB,
  onSelectTemplate,
  onImportTemplate,
  onDeleteTemplate,
  onOpenTemplateFolder,
  onRefreshAccounts,
  validationPolicy,
  onMoveValidationRule,
  onResetValidationPolicy,
  appearanceSettings,
  onChangeAppearanceSettings,
  onClose
}: {
  templateState: TemplateState;
  accounts: OutlookAccount[];
  accountsLoading: boolean;
  accountError: string;
  initialTab?: SettingsTab;
  onSelectTemplate: (id: string) => Promise<void>;
  onImportTemplate: () => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onOpenTemplateFolder: () => Promise<void>;
  onRefreshAccounts: () => Promise<void>;
  validationPolicy: ValidationPolicyState;
  onMoveValidationRule: (ruleId: ValidationRuleId, level: ValidationRuleLevel) => Promise<void>;
  onResetValidationPolicy: () => Promise<void>;
  appearanceSettings: AppearanceSettingsState;
  onChangeAppearanceSettings: (value: AppearanceSettingsState) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState('');

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }

  const pendingTemplate = templateState.templates.find((template) => template.id === pendingDeleteId);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="settings-dialog" aria-describedby="settings-description">
        <DialogHeader className="settings-header">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription id="settings-description">管理应用外观、邮件签名、Outlook 连接和导入安全规则。</DialogDescription>
        </DialogHeader>

        <SidebarProvider className="settings-layout" style={{ '--sidebar-width': '196px' } as CSSProperties}>
          <Sidebar collapsible="none" className="settings-sidebar" aria-label="设置分类">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>设置分类</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {SETTINGS_TABS.map((tabId) => {
                      const { icon: Icon, label } = settingsTabDetails[tabId];
                      return (
                        <SidebarMenuItem key={tabId}>
                          <SidebarMenuButton type="button" size="lg" isActive={tab === tabId} className={settingsMenuButtonClass} data-settings-tab={tabId} onClick={() => setTab(tabId)}>
                            <Icon /><span>{label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <SidebarInset className="settings-content">
            <section className={cn('settings-section', tab !== 'appearance' && 'hidden')}>
              <div className="settings-section-heading">
                <div><h3>外观</h3><p>调整字体和重点色，修改会立即应用到整个 APP。</p></div>
              </div>
              <Separator />
              <div className="appearance-settings">
                <FieldSet className="appearance-group">
                  <FieldLegend>应用字体</FieldLegend>
                  <FieldDescription>Noto Sans SC 和仿苹方随 APP 提供；Windows 系统字体缺失时会回退到 Noto Sans SC。</FieldDescription>
                  <RadioGroup
                    value={appearanceSettings.font}
                    onValueChange={(font) => void run(() => onChangeAppearanceSettings({ ...appearanceSettings, font: font as AppearanceSettingsState['font'] }))}
                    className="font-choice-grid"
                    aria-label="应用字体"
                  >
                    {fontOptions.map((option) => (
                      <label
                        className={cn('appearance-choice font-choice', appearanceSettings.font === option.id && 'is-selected')}
                        key={option.id}
                        style={{ '--font-preview-family': option.family, '--font-preview-weight': option.weight } as CSSProperties}
                      >
                        <RadioGroupItem value={option.id} />
                        <span className="font-choice-copy"><strong>{option.label}</strong><small>{option.sample}</small></span>
                        <Badge variant={option.id === 'noto-sans-sc' || option.id === 'pingfang-bold' ? 'secondary' : 'outline'}>
                          {option.id === 'noto-sans-sc' || option.id === 'pingfang-bold' ? '随包' : 'Windows'}
                        </Badge>
                      </label>
                    ))}
                  </RadioGroup>
                </FieldSet>

                <Separator />

                <FieldSet className="appearance-group">
                  <FieldLegend>重点色</FieldLegend>
                  <FieldDescription>用于主按钮、选中状态、链接和界面强调元素，不改变警告与错误颜色。</FieldDescription>
                  <RadioGroup
                    value={appearanceSettings.accent}
                    onValueChange={(accent) => void run(() => onChangeAppearanceSettings({ ...appearanceSettings, accent: accent as AppearanceSettingsState['accent'] }))}
                    className="accent-choice-grid"
                    aria-label="应用重点色"
                  >
                    {accentOptions.map((option) => (
                      <label className={cn('appearance-choice accent-choice', appearanceSettings.accent === option.id && 'is-selected')} key={option.id}>
                        <RadioGroupItem value={option.id} />
                        <span className="accent-swatch" style={{ '--accent-swatch': option.color } as CSSProperties} />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </FieldSet>
              </div>
            </section>

            <section className={cn('settings-section', tab !== 'signatures' && 'hidden')}>
              <div className="settings-section-heading">
                <div><h3>邮件签名</h3><p>签名会显示在主界面下拉框中，导入文件会复制到应用专用目录。</p></div>
                <Button size="sm" disabled={busy} onClick={() => void run(onImportTemplate)}>
                  {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}
                  导入签名
                </Button>
              </div>
              <Separator />
              {templateState.templates.length ? (
                <RadioGroup
                  value={templateState.selectedTemplateId}
                  onValueChange={(id) => void run(() => onSelectTemplate(id))}
                  className="template-list"
                >
                  {templateState.templates.map((template) => (
                    <label className={cn('template-row', template.id === templateState.selectedTemplateId && 'is-selected')} key={template.id}>
                      <RadioGroupItem value={template.id} />
                      <span className="template-icon"><Signature /></span>
                      <span className="template-copy"><strong>{template.name}</strong><small>{template.fileName}</small></span>
                      <Badge variant={template.source === 'bundled' ? 'secondary' : 'outline'}>{template.source === 'bundled' ? '内置' : '已导入'}</Badge>
                      {template.source === 'user' ? (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={(event) => { event.preventDefault(); setPendingDeleteId(template.id); }} aria-label={`删除 ${template.name}`}><Trash2 /></Button>
                      ) : <span className="template-action-spacer" />}
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                <Empty>
                  <EmptyHeader><EmptyMedia variant="icon"><Signature /></EmptyMedia><EmptyTitle>还没有签名</EmptyTitle><EmptyDescription>导入 .oft 或 HTML 文件后即可选择。</EmptyDescription></EmptyHeader>
                </Empty>
              )}
              <Button variant="ghost" size="sm" className="settings-folder-link" disabled={busy} onClick={() => void run(onOpenTemplateFolder)}><FolderOpen data-icon="inline-start" />打开签名目录</Button>
              {pendingTemplate ? (
                <Alert variant="destructive" className="settings-inline-confirm">
                  <TriangleAlert />
                  <AlertTitle>删除“{pendingTemplate.name}”？</AlertTitle>
                  <AlertDescription>
                    原始文件不会受影响。
                    <div className="inline-confirm-actions"><Button variant="outline" size="sm" onClick={() => setPendingDeleteId('')}>取消</Button><Button variant="destructive" size="sm" disabled={busy} onClick={() => void run(async () => { await onDeleteTemplate(pendingTemplate.id); setPendingDeleteId(''); })}>删除</Button></div>
                  </AlertDescription>
                </Alert>
              ) : null}
            </section>

            <section className={cn('settings-section', tab !== 'outlook' && 'hidden')}>
              <div className="settings-section-heading">
                <div><h3>Outlook 账户</h3><p>只检测当前电脑上经典 Outlook 已登录的账户。</p></div>
                <Button variant="outline" size="sm" disabled={busy || accountsLoading} onClick={() => void run(onRefreshAccounts)}>
                  <RefreshCw data-icon="inline-start" className={accountsLoading ? 'animate-spin' : undefined} />
                  {accountsLoading ? '正在检测' : '重新检测'}
                </Button>
              </div>
              <Separator />
              {accountError ? <Alert variant="destructive"><AlertCircleIcon /><AlertTitle>无法读取 Outlook</AlertTitle><AlertDescription>{accountError}</AlertDescription></Alert> : null}
              <div className="account-list">
                {accounts.map((account) => (
                  <div className="account-row" key={account.storeId}>
                    <span className="account-avatar"><Mail /></span>
                    <span className="account-copy"><strong>{account.displayName || 'Outlook 账户'}</strong><small>{account.smtpAddress || '未返回 SMTP 地址'}</small></span>
                    <Badge variant="outline"><CircleCheck data-icon="inline-start" />已检测</Badge>
                  </div>
                ))}
                {!accountsLoading && !accounts.length ? (
                  <Empty><EmptyHeader><EmptyMedia variant="icon"><Mail /></EmptyMedia><EmptyTitle>没有检测到账户</EmptyTitle><EmptyDescription>请确认经典 Outlook 已安装并完成登录。</EmptyDescription></EmptyHeader></Empty>
                ) : null}
              </div>
              <p className="settings-note">新版 Outlook 不支持当前本地 COM 草稿流程。创建草稿前会再次核对账户。</p>
            </section>

            <section className={cn('settings-section', tab !== 'safety' && 'hidden')}>
              <div className="settings-section-heading">
                <div><h3>导入与安全</h3><p>拖动规则即可调整处理方式，修改后会立即用于导入和创建前校验。</p></div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  data-testid="reset-validation-rules"
                  onClick={() => void run(onResetValidationPolicy)}
                >
                  <RotateCcw data-icon="inline-start" />
                  恢复默认
                </Button>
              </div>
              <Separator />
              <ValidationRulesEditor policy={validationPolicy} onMoveRule={onMoveValidationRule} />
            </section>
          </SidebarInset>
        </SidebarProvider>

        <DialogFooter className="settings-footer">
          <span>设置保存在当前 Windows 用户的本地应用目录中。</span>
          <Button onClick={onClose}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlertCircleIcon() {
  return <TriangleAlert aria-hidden="true" />;
}
