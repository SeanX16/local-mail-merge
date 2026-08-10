# Local Mail Merge

面向公司 Windows 电脑的 Outlook 本地草稿工具。项目目标是读取外部已经审核好的候选人名单、
收件地址和个性化邮件内容，在不调用 AI 的前提下批量创建可人工检查的 Outlook 草稿。

## 已确定的路线

- 公司电脑只负责校验、预览和创建草稿；
- Outlook 本地自动化是正式主路线；
- 批量流程只调用 `Save()`，不调用 `Display()` 或 `Send()`；
- `.eml` 仅作为兼容或应急交付方式；
- Microsoft Graph 因公司邮箱无法登录，不进入当前实现。

## 当前状态

方案 A2 的 Electron 桌面版已经实现。主界面使用 React + TypeScript，保留全部导入记录，支持：

- 自定义显示字段及拖动排序；
- 每列独立的 Excel 式多选筛选；
- 逐行勾选和邮件预览；
- 导入交接包、显式选择 Outlook 账户、二次确认后批量创建草稿；
- 从主界面的“公司模板”下拉框选择应用内模板；
- 在“设置”中导入、删除和设定默认模板，并重新检测经典 Outlook 账户；
- 对导入记录执行分级校验：硬拦截项禁止创建，内容完整性和审核流程问题以警告呈现并保留用户选择权。

模板支持 `.oft`、`.html` 和 `.htm`。导入时文件会复制到当前 Windows 用户的应用专用目录，
主界面只使用模板目录中的已保存项目。内置示例模板只用于演示，不能删除；用户导入的模板可在设置中移除，
不会删除原始文件。

任意 Excel、CSV 或 JSON 都可以先导入查看。应用会尽量保留原始字段和全部人员行。邮箱无效、明确禁止
联系、已成功创建过相同内容、声明的内容哈希不一致或重复 person_id 等确定性风险会硬拦截。未批准、缺少
主题/正文/来源/内容哈希、占位符未替换或批次内邮箱重复会显示警告；警告行默认不勾选，但用户可以主动
选择并创建草稿，确认框会汇总警告并提醒在 Outlook 中逐封检查。
选择 Excel 后，程序会先弹出导入设置，根据姓名、邮箱、人员 ID、机构和岗位等表头自动推荐最可能的人员
明细 Sheet 和字段名称所在行。用户可以修改两个选择，并在确认前预览字段及前 5 条数据；例如人才清单中的
`Talent List` 会优先于首页 `Summary`。CSV 和 JSON 仍会直接导入。

数据解析、校验和 Outlook COM 操作仍由 C# 本地助手承担。旧的 WinForms 原型保留作行为参考，
不再作为主界面。兼容性测试脚本继续保留在 `compatibility_test/`。

## 公司电脑测试（推荐）

最简单的测试方式是从本私有仓库的 GitHub Releases 下载 Windows x64 免安装 ZIP：

1. 下载 ZIP 和同名 SHA-256 校验文件；
2. 将 ZIP 完整解压到本地目录，不要只复制 `LocalMailMerge.exe`；
3. 确保经典 Outlook 已安装、已登录并至少启动过一次；
4. 运行 `LocalMailMerge.exe`，先用随包的 `.test` 虚构数据做单封草稿测试；
5. 在 Outlook 草稿箱核对后删除这封测试草稿，不要发送。

该 ZIP 是“免安装目录版”，不是严格意义上不留本地状态的单文件 portable 应用。
程序会在当前 Windows 用户的 AppData 中保存设置、已导入模板、去重记录和本地报告。
详细步骤、验收清单和故障处理见
[`docs/testing/公司电脑快速测试.md`](docs/testing/公司电脑快速测试.md)。

## 目录

```text
local-mail-merge/
├─ README.md
├─ AGENTS.md
├─ docs/
│  ├─ requirements/
│  ├─ architecture/
│  ├─ decisions/
│  ├─ handoffs/
│  └─ design/
├─ src/
│  ├─ LocalMailMerge.Desktop/  # Electron + React 主程序
│  ├─ LocalMailMerge.Worker/   # C# 进程边界与 Outlook 调用
│  ├─ LocalMailMerge.Core/     # 导入、校验、草稿模型
│  └─ LocalMailMerge.App/      # 旧 WinForms 参考实现
└─ compatibility_test/
```

继续开发前，先阅读：

1. `AGENTS.md`
2. `docs/requirements/邮件外联工具_明确需求整理.md`
3. `docs/architecture/邮件外联工具_技术方案.md`
4. `docs/decisions/ADR-001-邮件草稿交付方式.md`
5. `docs/handoffs/邮件工具开发交接.md`

这些资料从 AI-for-HR 总项目的提交 `24f2c47` 整理而来。今后的邮件工具实现以本独立目录为工作入口；
上游人才名单的数据来源、确认状态和隐私规则仍由 AI-for-HR 总项目负责。

## 本地运行

需要 Windows、Node.js、.NET SDK 和桌面版 Outlook。

```powershell
cd src\LocalMailMerge.Desktop
npm install
npm run desktop
```

生成可独立运行的 Windows 目录：

```powershell
npm run package
```

输出位于 `src\LocalMailMerge.Desktop\out\Local Mail Merge-win32-x64\`。开发预览可使用
`--demo` 数据；真实创建流程始终重新导入并校验交接包，批量操作只保存 Outlook 草稿。

生成 Windows 安装包和免安装 ZIP：

```powershell
npm run make
```

输出位于 `src\LocalMailMerge.Desktop\out\make\`。对公司电脑试用，优先使用 ZIP，避免增加安装权限和卸载步骤。
