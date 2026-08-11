import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Add20Regular,
  ArrowSync20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Document20Regular,
  ErrorCircle20Regular,
  FolderOpen20Regular,
  MailSettings20Regular,
  ShieldCheckmark20Regular,
  Signature20Regular,
  TableSettings20Regular,
  Warning20Regular
} from '@fluentui/react-icons';
import type { OutlookAccount, TemplateState } from './types';

export type SettingsTab = 'signatures' | 'outlook' | 'safety';

export function SettingsDialog({
  templateState,
  accounts,
  accountsLoading,
  accountError,
  initialTab = 'signatures',
  onSelectTemplate,
  onImportTemplate,
  onDeleteTemplate,
  onOpenTemplateFolder,
  onRefreshAccounts,
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
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState('');

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const pendingTemplate = templateState.templates.find((template) => template.id === pendingDeleteId);

  return createPortal(
    <div className="modal-backdrop settings-backdrop" role="presentation">
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <h2 id="settings-title">设置</h2>
            <p>管理邮件签名、Outlook 连接和分级校验规则</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭设置"><Dismiss20Regular /></button>
        </header>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label="设置分类">
            <button data-settings-tab="signatures" className={tab === 'signatures' ? 'is-active' : ''} onClick={() => setTab('signatures')}>
              <Signature20Regular /><span>邮件签名</span>
            </button>
            <button data-settings-tab="outlook" className={tab === 'outlook' ? 'is-active' : ''} onClick={() => setTab('outlook')}>
              <MailSettings20Regular /><span>Outlook 账户</span>
            </button>
            <button data-settings-tab="safety" className={tab === 'safety' ? 'is-active' : ''} onClick={() => setTab('safety')}>
              <ShieldCheckmark20Regular /><span>导入与安全</span>
            </button>
          </nav>

          <div className="settings-content">
            {tab === 'signatures' ? (
              <div className="settings-section">
                <div className="settings-section-heading">
                  <div>
                    <h3>邮件签名</h3>
                    <p>这里保存的签名会出现在主界面下拉框中。导入时会复制进应用专用目录。</p>
                  </div>
                  <button className="button button--primary settings-action" disabled={busy} onClick={() => void run(onImportTemplate)}>
                    <Add20Regular />导入签名
                  </button>
                </div>

                <div className="template-list">
                  {templateState.templates.length ? templateState.templates.map((template) => (
                    <div className={`template-row ${template.id === templateState.selectedTemplateId ? 'is-selected' : ''}`} key={template.id}>
                      <input
                        type="radio"
                        name="default-signature"
                        checked={template.id === templateState.selectedTemplateId}
                        onChange={() => void run(() => onSelectTemplate(template.id))}
                      />
                      <span className="template-file-icon"><Signature20Regular /></span>
                      <span className="template-row-copy">
                        <strong>{template.name}</strong>
                        <small>{template.fileName}</small>
                      </span>
                      <span className={`template-source template-source--${template.source}`}>
                        {template.source === 'bundled' ? '内置' : '已导入'}
                      </span>
                      {template.source === 'user' ? (
                        <button
                          type="button"
                          className="icon-button icon-button--small template-delete"
                          onClick={(event) => { event.preventDefault(); setPendingDeleteId(template.id); }}
                          aria-label={`删除 ${template.name}`}
                        ><Delete20Regular /></button>
                      ) : <span className="template-delete-spacer" />}
                    </div>
                  )) : (
                    <div className="settings-empty"><Signature20Regular /><strong>还没有签名</strong><span>点击“导入签名”添加 .oft 或 HTML 文件。</span></div>
                  )}
                </div>

                <button className="text-button settings-folder-link" disabled={busy} onClick={() => void run(onOpenTemplateFolder)}>
                  <FolderOpen20Regular />打开已导入签名目录
                </button>

                {pendingTemplate ? (
                  <div className="settings-inline-confirm" role="alert">
                    <span>从应用中删除签名“{pendingTemplate.name}”？原始文件不会受到影响。</span>
                    <div>
                      <button className="button button--ghost button--compact" onClick={() => setPendingDeleteId('')}>取消</button>
                      <button className="button button--danger button--compact" disabled={busy} onClick={() => void run(async () => { await onDeleteTemplate(pendingTemplate.id); setPendingDeleteId(''); })}>删除</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === 'outlook' ? (
              <div className="settings-section">
                <div className="settings-section-heading">
                  <div>
                    <h3>Outlook 账户</h3>
                    <p>程序只检测这台电脑上经典 Outlook 已登录的账户。</p>
                  </div>
                  <button className="button button--ghost settings-action" disabled={busy || accountsLoading} onClick={() => void run(onRefreshAccounts)}>
                    <ArrowSync20Regular />{accountsLoading ? '正在检测…' : '重新检测'}
                  </button>
                </div>
                {accountError ? <div className="account-error">{accountError}</div> : null}
                <div className="account-list">
                  {accounts.map((account) => (
                    <div className="account-row" key={account.storeId}>
                      <span className="account-avatar"><MailSettings20Regular /></span>
                      <span><strong>{account.displayName || 'Outlook 账户'}</strong><small>{account.smtpAddress || '未返回 SMTP 地址'}</small></span>
                      <span className="account-status">已检测</span>
                    </div>
                  ))}
                  {!accountsLoading && !accounts.length ? <div className="settings-empty"><MailSettings20Regular /><strong>没有检测到账户</strong><span>请确认经典 Outlook 已安装并完成登录。</span></div> : null}
                </div>
                <p className="settings-note">新版 Outlook 不支持当前本地 COM 草稿流程。账户会在创建草稿前再次核对。</p>
              </div>
            ) : null}

            {tab === 'safety' ? (
              <div className="settings-section">
                <div className="settings-section-heading">
                  <div>
                    <h3>导入与安全</h3>
                    <p>这些规则用于防止普通联系人表被误当作已经批准的邮件任务。</p>
                  </div>
                </div>
                <div className="safety-card">
                  <TableSettings20Regular />
                  <div>
                    <strong>导入 Excel 时确认 Sheet 和字段行</strong>
                    <p>程序会自动推荐人员明细 Sheet 和字段所在行，再由用户根据数据预览确认。导入后把问题分成“硬拦截”和“警告”；警告记录仍可由用户选择并创建草稿。</p>
                  </div>
                </div>
                <div className="safety-tier safety-tier--blocked">
                  <div className="safety-tier-heading"><ErrorCircle20Regular /><strong>硬拦截：不能创建草稿</strong></div>
                  <p>邮箱无效或 Unknown、明确禁止联系、已成功创建过相同内容、已声明的内容哈希与当前邮件不一致，或 person_id 重复导致无法确定选择对象。</p>
                </div>
                <div className="safety-tier safety-tier--warning">
                  <div className="safety-tier-heading"><Warning20Regular /><strong>警告：可以创建，但默认不勾选</strong></div>
                  <p>未批准、主题或正文为空、占位符未替换、来源或内容哈希缺失，以及同一邮箱在批次内重复。创建确认框会再次汇总警告。</p>
                </div>
                <div className="safety-rules">
                  <div className="safety-rule">
                    <ShieldCheckmark20Regular />
                    <span><strong>只保存 Outlook 草稿</strong><small>程序不包含自动发送路径，最终发送仍由用户在 Outlook 中完成。</small></span>
                    <span className="fixed-rule">固定开启</span>
                  </div>
                  <div className="safety-rule">
                    <ShieldCheckmark20Regular />
                    <span><strong>创建前重新校验</strong><small>重新读取交接包并应用同一分级，防止导入后出现未提示的硬拦截。</small></span>
                    <span className="fixed-rule">固定开启</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="settings-footer">
          <span>设置保存在当前 Windows 用户的本地应用目录中。</span>
          <button className="button button--primary" onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
