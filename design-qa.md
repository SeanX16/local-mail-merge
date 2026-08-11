# 方案 A2 笔记本紧凑布局、分级校验与邮件签名交互设计验收

## 对比对象

- source visual truth path: `docs/design/mockups/local-mail-merge-vA2-custom-columns-and-filters.png`
- implementation screenshot path: `docs/design/implementation/local-mail-merge-electron-compact-1366x768-normalized.png`
- latest implementation screenshot path: `docs/design/implementation/local-mail-merge-signature-ui-1366x768-normalized.png`
- table interaction screenshot path: `docs/design/implementation/local-mail-merge-table-validation-resize-1366x768-normalized.png`
- validation label screenshot path: `docs/design/implementation/local-mail-merge-validation-labels-1366x768-normalized.png`
- dimmed settings screenshot path: `docs/design/implementation/local-mail-merge-settings-dimmed-1366x768-normalized.png`
- custom dropdown screenshots:
  - `docs/design/implementation/local-mail-merge-account-menu-1366x768-normalized.png`
  - `docs/design/implementation/local-mail-merge-signature-menu-1366x768-normalized.png`
- signature settings screenshot: `docs/design/implementation/local-mail-merge-signature-settings-1366x768-normalized.png`
- warning confirmation screenshot: `docs/design/implementation/local-mail-merge-electron-warning-confirm-1366x768-normalized.png`
- tiered safety screenshot: `docs/design/implementation/local-mail-merge-electron-safety-1366x768-normalized.png`
- settings screenshots:
  - `docs/design/implementation/local-mail-merge-electron-settings-normalized.png`
  - `docs/design/implementation/local-mail-merge-electron-settings-outlook-normalized.png`
  - `docs/design/implementation/local-mail-merge-electron-settings-safety-normalized.png`
- Excel import dialog screenshot: `docs/design/implementation/local-mail-merge-electron-import-dialog-normalized.png`
- viewport: Electron `BrowserWindow` 1366 × 768 CSS px，Windows 笔记本屏幕状态
- source dimensions: 1581 × 995 px，1×
- implementation dimensions: 原始捕获 2732 × 1536 px，约 2× 系统密度；使用高质量双三次缩放归一化为 1366 × 768 px 后验收
- latest implementation dimensions: 原始捕获 2634 × 1483 px，当前系统接近 2× 密度；使用高质量双三次缩放归一化为 1366 × 768 px 后验收
- Excel import dialog dimensions: 原始捕获 2880 × 1705 px；窗口受当前 Windows 工作区限制，使用高质量双三次缩放归一化到与设计稿相同的 1581 × 995 px 画布后比较，未把密度/工作区差异作为视觉缺陷
- state: 演示数据；字段管理和“目标岗位”筛选同时展开；另行验收了账户下拉、邮件签名下拉、“添加新签名”入口及邮件签名设置页。
- Excel import state: 选择多 Sheet XLSX 后，推荐 `Talent List` 与第 1 行字段名；弹窗显示 10 个字段和前 5 条记录预览

## Findings

- 没有剩余可执行的 P0、P1 或 P2 差异。
- 本轮把内置“校验结果”统一渲染为绿色“可创建”、橙色“警告”和红色“已拦截”，不再依赖交接包可选的“审核状态”字段。右侧滚动后的表格截图确认三种标签在同一列中对齐，长内容仍保持单行省略。
- 表头列边界增加了 7 px 可拖拽命中区，拖动时显示企业蓝定位线；字段筛选支持按钮再次点击收起，以及点击弹层外任意页面区域自动关闭。
- 主界面、邮件预览、导入弹窗和设置页的基础字号收敛到 12–14 px，主要按钮收敛到 38–42 px 高；表格正文提升到 12.5 px，避免此前局部 9.5–11.5 px 与默认 16 px 控件混用造成的不协调。
- 设置打开时，渲染区域与 Electron 原生标题栏覆盖层同步切换为压暗色；关闭设置后恢复。`capturePage()` 仍不包含 Windows 原生按钮，但 IPC 冒烟测试已验证开关状态随设置打开/关闭正确切换。
- 本轮增量没有改变方案 A2 的主页面比例、表格密度或预览层级。路径省略发生在目录中部，`Q2_Transition_Handoff_20250515.json` 完整保留；两个顶部下拉均使用同一套非原生弹层样式。
- [P3] 批准的方案 A2 是 1581 × 995，本轮实现验收是 1366 × 768，两者纵横比不同。
  - Location: 整体工作区。
  - Evidence: `docs/design/implementation/qa-compact-source-left-implementation-right.png`
  - Impact: 这是用户要求的响应式压缩，不是逐像素复制差异；信息架构、主操作和双弹层关系保持不变。
  - Fix: 无需修复；已针对该尺寸单独检查。
- [P3] 表格中的部分长邮箱比设计稿更早出现省略号。
  - Location: 左侧数据表。
  - Evidence: 设计稿使用较窄的生成字体；实现使用 Windows 原生 Segoe UI 字体度量并保留真实列宽。
  - Impact: 不改变行识别、筛选或右侧完整收件人预览；单元格仍有完整值提示。
  - Fix: 暂不改用非系统窄体字体，避免牺牲公司电脑上的一致性和可读性。
- [P3] `capturePage()` 不包含 Windows 原生窗口按钮覆盖层。
  - Location: 标题栏右侧。
  - Evidence: 设计稿显示最小化、最大化、关闭；对比截图只包含 WebContents。实际 Electron 窗口已启用原生 `titleBarOverlay`。
  - Impact: 仅是截图工具边界，不是运行时缺失。
  - Fix: 无代码修复需要。

## Required fidelity surfaces

- Fonts and typography: 采用 Segoe UI / Microsoft YaHei UI；标题、统计数字、标签和正文层级与设计稿一致。设置页沿用同一字体层级，长说明使用较低对比度而不抢主操作。
- Spacing and layout rhythm: 1366 × 768 下顶栏、统计区、主分栏、表格、预览和底部操作区全部可见。按钮、下拉框、表格行、工具栏和标题栏高度已统一压缩；字段管理、筛选、警告确认和设置弹层没有裁切、碰撞或主按钮移位。
- Custom dropdown layout: 账户和邮件签名弹层从对应触发器向下展开，宽度覆盖完整主要信息；选中态、悬停态、圆角、描边和阴影与字段筛选弹层属于同一视觉系统。邮件签名底部操作区有明确分隔线，未与签名选项混在一起。
- Excel import layout: 弹窗在方案 A2 主界面上使用居中宽幅工作区；Sheet/字段行控制、推荐提示、横向可滚动表格与固定底部操作区分层清楚，在当前窗口工作区内没有遮挡或按钮移位。
- Colors and visual tokens: 使用设计稿的冷白背景、企业蓝主操作色和绿/橙/红语义状态色；设置页复用相同边框、浅蓝选中态、圆角和阴影层级。
- Image quality and asset fidelity: 本应用没有照片或插图。所有可见功能图标来自 Fluent UI React Icons，没有使用 emoji、手绘 SVG、CSS 图形或占位资产替代。
- Copy and content: 页面、创建确认框、导入提示及设置页已统一使用“邮件签名/签名”，不再混用“公司模板”。主界面继续使用“可创建（含警告）/无警告/有警告/硬拦截”的分级文案。
- Accessibility and states: 自定义下拉使用按钮、`listbox`、`option`、`aria-expanded` 和 `aria-selected` 语义，支持 Escape 关闭、方向键打开及可见焦点；警告记录默认不勾选但用户可主动勾选，硬拦截记录不可勾选。

## Comparison evidence

- full-view comparison: `docs/design/implementation/qa-full-reference-left-implementation-right.png`（左为设计稿，右为实现）
- compact laptop comparison: `docs/design/implementation/qa-compact-source-left-implementation-right.png`（左为 1581 × 995 方案 A2，右为 1366 × 768 紧凑实现）
- current main comparison: `docs/design/implementation/qa-previous-left-signature-ui-right.png`（左为此前已通过的 1366 × 768 方案 A2 实现，右为本轮路径、账户和邮件签名增量实现）
- table interaction comparison: `docs/design/implementation/qa-source-left-table-validation-resize-right.png`（左为方案 A2，右为本轮统一字号、表头交互与紧凑表格实现）
- validation label comparison: `docs/design/implementation/qa-source-left-validation-labels-right.png`（左为方案 A2，右为横向滚动至内置“校验结果”列后的三档固定标签）
- settings density comparison: `docs/design/implementation/qa-previous-settings-left-current-dimmed-right.png`（左为此前已通过的设置页，右为本轮统一字号与遮罩后的设置页）
- custom dropdown comparison: `docs/design/implementation/qa-account-menu-left-signature-menu-right.png`（左为账户下拉，右为邮件签名下拉；用于核对同一位置、密度、选中态、阴影及底部分隔操作）
- tiered validation comparison: `docs/design/implementation/qa-compact-warning-confirm-left-safety-right.png`（左为警告记录创建确认，右为设置中的分级规则）
- Excel import full-view comparison: `docs/design/implementation/qa-import-dialog-source-left-implementation-right.png`（左为批准的方案 A2，右为导入弹窗实现）
- Excel import modal-language comparison: `docs/design/implementation/qa-import-dialog-modal-language-left-implementation-right.png`（左为已验收设置弹窗，右为导入弹窗；用于检查同一产品内的字体、色彩、圆角、阴影与操作层级）
- focused table comparison: `docs/design/implementation/qa-table-reference-left-implementation-right.png`
- focused preview comparison: `docs/design/implementation/qa-preview-reference-left-implementation-right.png`
- 设置框和顶部自定义下拉不是原 A2 设计图中的展开状态；因此以已批准 A2 及此前已通过的 1366 × 768 实现作为视觉约束，分别检查邮件签名、Outlook、导入与安全状态。
- Excel 导入弹窗同样不是原 A2 设计图中的展开状态，因此不做不存在的逐像素断言；以 A2 主界面和已验收设置弹窗作为可见视觉约束。字段表格在全屏对比中已足够清晰，另一个弹窗语言对比图覆盖了关键表面，未再增加裁剪图。

## Comparison history

1. Baseline P1: 旧 WinForms 界面出现控件裁切、字号过大、表格密度和邮件预览与方案 A2 明显不一致。
   - Earlier evidence: `docs/design/implementation/local-mail-merge-preview.png`
   - Fix: 用 Electron + React + TypeScript 重建界面外壳，并保持 C# Core/Outlook Worker 作为进程边界。
   - Post-fix evidence: 最终全屏对比图。
2. Electron iteration P2: 首轮 Electron 截图中右侧邮件正文和元数据偏小，分隔线与正文起点比设计稿高。
   - Fix: 调整预览内边距、元数据间距、分隔线和正文的字号、行高与段距。
   - Post-fix evidence: 最终预览局部对比图。
3. Electron iteration P2: 参考状态的筛选弹层最初显示全部七项勾选，而设计稿只勾选前三项。
   - Fix: 同步筛选弹层的当前应用值，并让参考捕获状态显示前三个已选值；正式筛选行为不变。
   - Post-fix evidence: 最终表格局部对比图。
4. Settings iteration P2: 原主界面“公司模板”是文件路径框，设置按钮没有行为，不能表达“选择应用内模板”的产品模型。
   - Fix: 顶部改为真实模板下拉框；新增同一设计系统的设置对话框，集中管理公司模板、Outlook 账户以及固定导入安全规则。
   - Post-fix evidence: 三张设置页标准化截图；主界面截图中的模板下拉框显示当前应用内模板。
5. Excel import extension: 本轮初次并排比较未发现可执行的 P0、P1 或 P2 视觉差异。
   - Functional refinement: 将底部“预计导入”数量改为随用户所选字段行实时重新计算，避免用户手动切换字段行后仍显示自动推荐行对应的旧数量。
   - Post-fix evidence: `docs/design/implementation/local-mail-merge-electron-import-dialog-normalized.png`；默认推荐状态的视觉布局不变，构建和打包态交互均重新通过。
6. Laptop-density iteration P1: 默认窗口、按钮、下拉框、统计区、表格行和底部操作区在笔记本屏幕上偏大。
   - User evidence: 2026-08-10 用户明确指出“UI 尺寸偏大，按钮高度等在笔记本上显示不好”。
   - Fix: 默认窗口改为 1440 × 860，最小 1100 × 680；新增 1440 宽度与 820 高度响应式密度规则，同步压缩所有主要控件。
   - Post-fix evidence: `docs/design/implementation/local-mail-merge-electron-compact-1366x768-normalized.png`；底部 CTA 、右侧预览、字段管理和筛选弹层均完整可见。
7. Validation-autonomy iteration P1: 旧校验把未批准、内容不完整、来源或哈希缺失全部作为禁止创建，用户无法主动处理。
   - User evidence: 2026-08-10 用户要求区分真正拦截与警告提示。
   - Fix: 只对无效邮箱、禁止联系、已声明内容哈希不匹配、person_id 重复和已成功创建的同内容硬拦截；其余转为默认不勾选、但可人工选中继续的警告。
   - Post-fix evidence: `docs/design/implementation/qa-compact-warning-confirm-left-safety-right.png`；打包态交互验收覆盖警告选择、预览、创建确认与硬拦截禁选。
8. Signature and account dropdown iteration: 首次并排比较没有发现可执行的 P0、P1 或 P2 差异。
   - User request: 路径中间省略但保留完整文件名；“公司模板”统一改为“邮件签名”；账户和签名使用非 Windows 原生下拉；签名菜单底部增加分隔的“添加新签名”。
   - Fix: 新增目录可收缩、文件名固定显示的路径布局；账户和签名改为可访问的 React 自定义下拉；“添加新签名”直接打开邮件签名设置页；同步主页面、设置、对话框及错误提示术语。
   - Post-fix evidence: `docs/design/implementation/qa-previous-left-signature-ui-right.png`、`docs/design/implementation/qa-account-menu-left-signature-menu-right.png` 和邮件签名设置截图。
9. Table interaction and typography iteration: 首次实现后自动化与并排视觉检查均未发现可执行的 P0、P1 或 P2 差异。
   - User request: 内置校验结果使用三档固定标签；列宽可拖拽；筛选点击外部关闭；全局字号和控件密度统一；设置遮罩覆盖原生标题栏按钮。
   - Fix: 校验结果改为绿/橙/红语义标签；TanStack Table 使用 `onChange` 列宽模式并增加表头拖拽条；筛选弹层监听外部 `pointerdown`；统一基础字号与主要控件尺寸；通过受限 IPC 调用 `BrowserWindow.setTitleBarOverlay()` 同步标题栏颜色。
   - Post-fix evidence: `docs/design/implementation/qa-source-left-table-validation-resize-right.png`、`docs/design/implementation/qa-source-left-validation-labels-right.png`、`docs/design/implementation/qa-previous-settings-left-current-dimmed-right.png`；33 项开发态交互检查全部通过。

## Functional evidence

- primary interactions tested: 字段管理打开/关闭、显示字段增减、目标岗位筛选打开/应用、点击行更新邮件预览、邮件签名下拉框加载、设置打开/切换三页/关闭、已拦截原因显示、创建草稿确认框打开/关闭。
- latest incremental smoke result: `docs/design/implementation/electron-signature-ui-smoke.json`，路径结构、自定义账户下拉、自定义邮件签名下拉、“添加新签名”跳转及原有核心流程共 26 项全部通过，`consoleErrors: []`。
- current table interaction smoke result: `docs/design/implementation/electron-table-interactions-smoke.json`，三档校验标签、拖拽列宽、筛选外部点击关闭、设置标题栏遮罩开关及原有核心流程共 33 项全部通过，`consoleErrors: []`。
- packaged v0.1.3 smoke result: `src/LocalMailMerge.Desktop/out/qa/packaged-smoke-v0.1.3.json`，从新生成的便携 ZIP 独立解压后运行，33 项全部通过，`consoleErrors: []`；可执行文件版本为 `0.1.3`。
- development smoke result: `docs/design/implementation/electron-compact-validation-smoke.json`，20 项核心交互全部通过，`consoleErrors: []`。
- packaged EXE smoke result: `docs/design/implementation/packaged-compact-validation-smoke.json`，20 项核心交互全部通过，`consoleErrors: []`。
- Excel import dialog development smoke: `docs/design/implementation/electron-import-dialog-smoke.json`，Sheet 列表、自动推荐、预览、切换和关闭均通过。
- Excel import dialog packaged EXE smoke: `docs/design/implementation/packaged-import-dialog-smoke.json`，全部检查通过且 `consoleErrors: []`。
- packaged template catalog result: `docs/design/implementation/packaged-template-catalog-smoke.json`，导入复制、设为当前项、删除均通过。
- packaged multi-sheet import smoke: `docs/design/implementation/packaged-multisheet-import-smoke.json`，全部界面交互通过且 `consoleErrors: []`。
- console errors checked: 开发态和打包态均为 `consoleErrors: []`。
- data/worker check: Core 回归测试 7/7 通过。打包版 Worker 对用户提供的 6 工作表人才清单选择 `Talent List` 第 1 行后读取 737 人：644 条可创建且均作为警告记录供人工选择，93 条因缺少或无效邮箱硬拦截；没有修改原始工作簿。
- Outlook environment check: 当前测试机未检测到经典 Outlook；设置页会显示检测失败/空状态，创建草稿前仍会再次校验账户。此环境结果不影响演示态视觉验收。

## Implementation checklist

- [x] 顶部“公司模板”统一改为“邮件签名”，并使用应用内自定义签名下拉框。
- [x] 设置中支持导入、选择、删除用户签名和打开签名目录。
- [x] 交接包路径在目录中间省略，完整保留末尾文件名。
- [x] Outlook 账户使用与应用风格一致的自定义下拉菜单。
- [x] 邮件签名下拉底部提供分隔的“添加新签名”，并打开邮件签名设置页。
- [x] 设置中支持重新检测经典 Outlook 账户。
- [x] 设置中解释且固定启用草稿保存、重新校验、人工批准、重复保护与审计规则。
- [x] 普通 Excel 仍保留全部行，并向用户展示具体拦截原因。
- [x] Excel 选择后显示 Sheet/字段行确认弹窗，并提供字段和前 5 条记录预览。
- [x] 自动推荐可被用户覆盖，打包版仍会使用同一选择重新读取文件。
- [x] 完成开发态、打包态、签名目录、Core 回归和视觉对比验收。
- [x] 1366 × 768 下完成主界面、弹层、确认框和设置页紧凑布局验收。
- [x] 分级校验、警告记录手动选择、硬拦截禁选与创建前警告汇总验收。
- [x] 内置校验结果固定渲染为“可创建 / 警告 / 已拦截”三档语义标签。
- [x] 表头拖拽调整列宽及双击恢复默认宽度。
- [x] 筛选弹层点击页面外部自动关闭，按钮再次点击也可收起。
- [x] 主界面、表格、邮件预览、导入和设置页字体及控件密度统一。
- [x] 设置弹窗打开/关闭时同步压暗/恢复 Electron 原生标题栏覆盖层。

final result: passed
