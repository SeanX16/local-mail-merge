# Local Mail Merge 当前视觉验收

## 2026-08-14 导入与安全规则页 Nova 组件验收

### Comparison target

- Source visual truth：`C:/Users/Sean/AppData/Local/Temp/codex-clipboard-0697ec89-7e95-425d-9ae6-9f402d5f7d68.png`，3183 × 1800 px。该图是 Nova + Inter 的组件语言参考，不是相同业务页面，因此只比较字体、圆角、白色表面、边界、控件密度和留白节奏，不做虚假的逐像素版式判断。
- Implementation：`docs/design/implementation/local-mail-merge-validation-rules-nova-final.png`，2634 × 1483 px；Electron 视口 1366 × 768 CSS px，设备密度约 1.93。
- Minimum viewport：`docs/design/implementation/local-mail-merge-validation-rules-nova-1000x620.png`，1929 × 1198 px；Electron 视口 1000 × 620 CSS px，设备密度约 1.93。
- State：演示数据，设置弹窗打开并选中“导入与安全”；规则处于默认分区，拦截 2 条、警告 4 条、默认放行 3 条。
- Full-view comparison：`docs/design/implementation/qa-nova-reference-left-validation-rules-right.png`。源图和实现图分别归一到 1366 × 768 后左右并排。
- Focused comparison：`docs/design/implementation/qa-nova-controls-left-rule-cards-right.png`。左侧截取 Nova 原生 Button/Badge/输入控件，右侧截取规则卡片和标签，用于检查小组件的字号、圆角、描边、图标位置和文字留白。

### Findings

- 最终没有剩余可执行的 P0、P1 或 P2 差异。
- 规则分区直接复用项目 `radix-nova` 的 `Card size="sm"`、`CardHeader`、`CardTitle` 和 `Button`，卡片保持原生 `rounded-xl`、1 px 弱边界和组件间距；没有重新手写一套卡片或标签。
- 三个分区均在 Nova 白色表面体系上使用现有语义 token：拦截为极淡红、警告为极淡橙、默认放行为极淡绿；没有为页面散落硬编码颜色。
- 分区标题下不再添加额外分隔线，`CardHeader` 与 `CardContent` 直接依靠 Nova `size="sm"` 的间距节奏衔接。
- 数量统计继续使用项目 `Badge`，其 `glass` 变体新增可复用的 `danger / warning / success` tone；颜色体现在半透明渐变、描边和内侧高光上，数字保持正常前景色。
- 页面右上角使用现有 `Button variant="outline" size="sm"` 提供“恢复默认”；它会写回默认策略，并在已有导入批次时重新校验当前数据。
- 所有规则标签保持用户从并排对照中明确选定的 `Button size="sm"`：28 px 高度、Nova 小圆角矩形、12.8 px 文字和组件默认水平留白，宽度随文字内容自适应；不使用胶囊形 Badge。
- 标签使用项目 Button 新增的 `glass` 变体：半透明纵向表面、`backdrop-blur-md`、`backdrop-saturate-150` 和内侧高光 ring；没有外投影，不形成悬浮层级。
- 固定的“邮箱无效”和可移动标签保持相同外形与文字布局；左侧同一图标位分别使用 Lucide `LockKeyhole` 与 `GripVertical`，固定项没有拖拽监听器。
- 规则解释只通过 shadcn/Radix `Tooltip` 展示；界面不再放置解释段落或额外的三点移动菜单。
- 1000 × 620 最小窗口下，两列卡片、全部 9 个标签、设置页 footer 和完成按钮均未重叠、裁切或产生不可用换行。

### Required fidelity surfaces

- Fonts and typography：继续使用 preset 的 Inter Variable；中文使用 Microsoft YaHei UI / Segoe UI 回退。分区标题使用 `CardTitle` 的 Nova 小卡片字号，标签完全使用 `Button size="sm"` 的组件字号，没有私有字号或字重覆盖。
- Spacing and layout rhythm：两列间距 12 px，三块卡片沿用 Nova `size="sm"` 的 12 px spacing；标签间距 8 px，内容区最小高度收紧到 44 px。卡片圆角与参考的白色面板一致，标签保持用户指定的 Nova 小圆角矩形。
- Colors and visual tokens：Neutral + Blue 主体系未变；拦截、警告、放行分别使用淡红、淡橙、淡绿语义表面。规则标签仍使用中性玻璃；数量 Badge 使用可复用的红／橙／绿玻璃 tone，文字不随 tone 染色。
- Image quality and asset fidelity：页面没有照片或插画；所有可见图标来自项目配置的 Lucide 图标库，没有 emoji、手绘 SVG、CSS 图形或占位资产。
- Copy and content：规则名称保持用户确认的“邮箱无效”“重复创建”“占位符残留”“邮箱重复”等文案；说明只进入 Tooltip，固定规则的 Tooltip 明确说明不能移动。
- Accessibility and states：可移动规则保留 DnD Kit 的键盘/指针属性和可见焦点；固定规则可聚焦读取 Tooltip；禁用和保存中状态继续使用原生 disabled/opacity 语义。

### Comparison history

1. 第一轮并排对照采用 Nova `Button size="sm"` 圆角矩形规则标签，同时发现卡片内容区留白偏多。
2. 第二轮曾错误地把“小规则标签”机械理解成 Badge 并改为胶囊形；用户依据局部并排图明确选择第一轮的圆角矩形，这是一次设计判断偏差，不作为最终方向。
3. 最终修复：恢复 Nova 原生 `Button variant="outline" size="sm"`，把内容区最小高度从 56 px 收紧到 44 px；重新构建并捕获 1366 × 768 与 1000 × 620 页面，未发现新的 P0、P1 或 P2 问题。
4. 用户继续要求红橙表面更淡，并澄清“质感”指液态玻璃而非阴影层次。最终进一步降低两块语义色浓度，并把标签改为无外投影的 `glass` Button 变体；重新完成两种窗口捕获与交互冒烟。
5. 本轮加入恢复默认操作，移除三块分区标题下的分隔线，为默认放行加入淡绿色，并把数量统计改成红／橙／绿三种“玻璃本体着色”而非彩色文字。

### Functional evidence

- `npm.cmd run build`：renderer/Electron TypeScript 与 Vite build 全部通过；仅保留既有的大 chunk 提示。
- `docs/design/implementation/electron-validation-rules-glass-smoke.json`：默认分区、9 个规则、三种 glass 数量 tone、无标题分隔线、锁与六点手柄、Tooltip、拖拽移动与持久化、恢复默认与持久化共 19 项通过，`consoleErrors: []`。

final result: passed

---

## 历史验收：筛选三态与设置页官方 Sidebar

## Comparison target

- 其他已验收界面的 Source visual truth：用户问题截图 `C:/Users/Sean/AppData/Local/Temp/codex-clipboard-c7319e1c-ef8e-47c9-92b1-b79bf1626c02.png` 与 `C:/Users/Sean/AppData/Local/Temp/codex-clipboard-4bdd92ca-b4a8-4ab4-b774-de63f606b98d.png`；继续沿用 shadcn/Mira 的 Neutral + Blue 设计语言。
- 设置侧栏的实现基准：用户指定的 shadcn preset `b1Ymqvgiw`。官方 CLI 生成的基准为 `base-nova`、Neutral、Blue、`menuAccent: subtle`、`menuColor: default-translucent`；不再以截图取色或项目自定义变体替代组件默认状态。
- Implementation screenshots：
  - `docs/design/implementation/local-mail-merge-selected-row-fix-908x630.png`
  - `docs/design/implementation/local-mail-merge-field-menu-compact-v2.png`
  - `docs/design/implementation/local-mail-merge-filter-menu-compact.png`
  - `docs/design/implementation/local-mail-merge-excel-dialog-real-fixed.png`
  - `docs/design/implementation/local-mail-merge-settings-sidebar-fixed-v3.png`
  - `docs/design/implementation/local-mail-merge-settings-official-sidebar.png`
  - `docs/design/implementation/local-mail-merge-status-menu-mira-v3.png`
  - `docs/design/implementation/local-mail-merge-warning-compact-footer-aligned.png`
  - `docs/design/implementation/local-mail-merge-filter-partial-polished-final2.png`
  - `docs/design/implementation/local-mail-merge-settings-gap-active-polished-v3.png`
  - `docs/design/implementation/local-mail-merge-mira-toolbar-final.png`
  - `docs/design/implementation/local-mail-merge-filter-thin-separator-final.png`
  - `docs/design/implementation/local-mail-merge-settings-plain-selection-final.png`
  - `docs/design/implementation/local-mail-merge-settings-shadcn-default-size-final.png`
- Combined comparison inputs：
  - `docs/design/implementation/qa-excel-source-left-fixed-right.png`
  - `docs/design/implementation/qa-settings-source-left-fixed-right.png`
  - `docs/design/implementation/qa-settings-sidebar-source-left-fixed-right.png`
  - `docs/design/implementation/qa-filter-source-left-fixed-right.png`
  - `docs/design/implementation/qa-settings-gap-active-source-left-fixed-right.png`
  - `docs/design/implementation/qa-filter-line-before-left-after-right.png`
  - `docs/design/implementation/qa-settings-selection-before-left-after-right.png`
  - `docs/design/implementation/qa-toolbar-before-left-after-right.png`
  - `docs/design/implementation/qa-settings-size-before-left-shadcn-default-right.png`
- Viewport：主验收 1366 × 768 CSS px；另在应用允许的最小窗口 1000 × 620 CSS px 复核，截图参数请求 908 × 630 时由 Electron `minWidth: 1000` 自动约束到 1000 × 630。
- Pixel density：当前 Windows 设备约为 1.93 device scale；1366 × 768 CSS 捕获为 2634 × 1483 px。组合图把源和实现分别等比归一到 1366 × 768 画布后并排，避免只比较原始像素密度。
- State：737 条、26 个源字段的真实 Excel 导入；默认邮件签名设置；虚拟表格第二行激活；字段和列筛选菜单展开。

## Findings

- 没有剩余可执行的 P0、P1 或 P2 问题。
- 列筛选的“全选当前字段”现在是独立固定控制区，与值列表之间复用和邮件签名下拉菜单相同的 shadcn `Separator` 1 px 弱边界；复选框和文本起点与下方值行对齐。
- 当值列表只选中一部分时，全选复选框使用蓝底横杠的 `indeterminate` 状态；全选、部分选、全不选三态会随下方值实时联动。
- 设置弹窗移除了 Dialog 默认 Grid 的 16 px 行间隙，header、Sidebar 内容和 footer 现在首尾连续，不再出现截图标出的两条白色空带。
- 设置侧栏当前项使用普通淡蓝底选中态，不再带左侧 primary 蓝指示条，也没有粉色细边、白色卡片或浮起阴影。
- 主搜索框压缩为 28 px Mira 密度，圆角、图标和 11.5 px 字号与同栏“全部状态”“字段”控件统一。
- 设置侧栏菜单不再使用项目自定义状态 CSS；直接使用 shadcn `SidebarMenuButton size="lg"` 的 48 px 行高、14 px 字号、16 px 图标和 8 px 内边距，以及组件自带的 Hover/Active 规则。
- 设置导航已从手工仿 Sidebar 的垂直 Tabs 替换为 shadcn 官方 `SidebarProvider / Sidebar / SidebarContent / SidebarGroup / SidebarMenu / SidebarMenuButton / SidebarInset` 组合；激活、悬停和内容面板都由 Sidebar 语义承载。
- 补回 preset 默认的 `shadcn/tailwind.css`，让 `data-active={false}` 按官方语义排除未选中项；恢复官方 Sidebar 源码输出，并把 `--sidebar-accent` 恢复为 preset 的 `oklch(0.97 0 0)`。没有新增私有 Sidebar 变体或覆盖选择器。
- 状态筛选由 Select 替换为当前 Mira preset 的半透明 `DropdownMenuRadioGroup`，188 px 宽、7 个 27 px 选项行，当前状态使用右侧蓝色勾选。
- footer 的选择人数和 Outlook 提示统一为 22 px 行盒并按中心线对齐，数值仍保留更强的视觉权重。
- 邮件预览警告框标题为 12 px、说明为 11.5 px，均不大于 13 px 邮件正文；内边距和图标同步缩小，避免警告卡片压过正文层级。
- 虚拟表格激活态现在由整行统一承载，背景和左侧蓝色指示贯穿全部可见列，不再只出现在复选框列。
- 第一列头部和行内复选框都以单元格中心对齐；可选未选、蓝色选中、灰色禁用三态清晰，沿用 Radix/shadcn Checkbox，不再是黑色勾号。
- 表头与虚拟行共享同一组 CSS 列宽变量和明确的总表宽；在总列宽小于视口时仍保持每个表头与正文单元格的 left/width 一致。拖动过程保留实时反馈，松手后提交表格状态。
- 字段管理和列筛选菜单采用紧凑标题、28 px 搜索框、26 px 选项行与固定底部操作区；长列表在内容区滚动，菜单本身不裁切底部按钮。字段菜单 258 px、筛选菜单 232 px，接近 Mira 的信息密度。
- Excel 导入预览不再把 26 列硬压入弹窗。数据列维持 144 px 可读宽度、首列 52 px，表头吸顶，横向滚动查看其余字段；真实 737 条文件的前五行、字段数、预计导入数与操作区均完整显示。
- 设置页侧栏使用 196 px 明确分类导航，当前项只使用淡蓝底，其他项有统一图标、行高和悬停状态。
- [P3] Excel 预览的横向滚动条在当前 Windows 高 DPI 环境下仍使用系统滚动条外观。这不会影响可用性，并能清楚表达“还有更多字段”；如后续追求更弱的视觉存在感，可单独统一应用内滚动条 token。

## Required fidelity surfaces

- Fonts and typography：保持 preset 的 Inter Variable；中文使用 Microsoft YaHei UI / Segoe UI 回退。表格与菜单正文 11.5–12.5 px、弹窗标题 16 px，真实长字段通过省略号而不是逐字压缩。
- Spacing and layout rhythm：32 px 表格行、34 px 表头、26 px 菜单项、32 px 导入选择框；弹窗、侧栏和底部操作区在 1000 × 620 最小窗口无重叠或裁切。
- Colors and visual tokens：继续使用 Neutral/Blue 主题变量；选中为 primary 蓝、禁用为 muted、警告/拦截保持语义色，没有新增散落的硬编码品牌色。
- Image quality and asset fidelity：界面无照片或插图；可见图标来自 Lucide，功能控件来自 shadcn/Radix，没有 emoji、手绘 SVG、CSS 图形或占位资产。
- Copy and content：保留“设置 Excel 导入”“人员数据所在的 Sheet”“字段名称所在行”“预计导入 737 条记录”等现有产品文案；字段名与数据值来自真实交接包，没有使用假缩写替代实际预览。
- Accessibility and states：复选框有明确 accessible name；禁用态使用原生 `disabled`/Radix data state；列宽分隔器支持键盘左右键；菜单、Select、Dialog 保留 Radix 焦点与外部点击关闭语义。

## Focused region comparison

- 主表：在最小窗口查看第一列、激活第二行及跨列背景，确认选框中心、三态对比与整行高亮。
- 字段/筛选菜单：展开后检查标题、搜索、全部选项滚动区域、底部按钮边界；没有用全屏截图替代小组件核对。
- Excel：使用用户提供的原始截图与真实 26 字段实现截图组成单一并排输入，重点核对列可读性、横向滚动、表头/正文边界和 footer。
- 设置页：使用用户截图与修改后截图组成单一并排输入，重点核对侧栏导航层级、激活态、主内容比例和弹窗边界。

## Comparison history

1. 用户截图暴露六个 P1/P2 问题：整行高亮断裂、复选框状态弱、菜单过松且裁切、短总列宽错位、Excel 预览列被压扁、设置导航半成品。
2. 第一轮统一虚拟表格的 header/body flex 与列宽变量，修改 Radix Checkbox data-state 样式，压缩两个 Popover，并重排 Excel/设置弹窗。
3. 截图复核发现字段菜单底部隐藏字段显示不足，内容区高度从 292 px 调整为受视口约束的 338 px，固定 footer 保持可见。
4. 第二轮在真实 737 条、26 字段 Excel 上捕获，确认字段文字可读、横向滚动存在、行列对齐；设置页和激活行分别在最小窗口捕获，未发现新的 P0/P1/P2 视觉问题。

## Functional evidence

- `npm run build`：renderer/Electron TypeScript 与 Vite build 全部通过。
- `npx shadcn@latest add sidebar --dry-run --diff renderer/components/ui/sidebar.tsx`：官方 CLI 返回 `No changes`，确认本地 Sidebar 组件源码与当前 preset registry 一致。
- `docs/design/implementation/electron-sidebar-official-preset-smoke.json`：针对设置页的官方结构、Active/Inactive 区分、页面切换、标题栏压暗和关闭恢复均通过，`consoleErrors: []`；同一历史综合脚本中若干与本轮无关的旧尺寸断言仍失败，未将其伪报为整套通过。
- `docs/design/implementation/electron-sidebar-mira-footer-warning-smoke.json`：官方 Sidebar 结构、Mira Radio Menu、菜单紧凑度、footer 中心线和警告字号，以及原有核心流程共 59 项通过，`consoleErrors: []`。
- `docs/design/implementation/electron-filter-settings-polish-smoke.json`：筛选全选三态、横杠图标、主从项对齐、分隔线、设置页零 Grid gap、区域连续性和统一激活态等共 65 项全部通过，`consoleErrors: []`。
- `docs/design/implementation/electron-mira-search-line-sidebar-smoke.json`：进一步验证 1 px shadcn 分隔线、无侧边指示条的设置选中态以及 28 px Mira 主搜索框，共 66 项全部通过，`consoleErrors: []`。
- `docs/design/implementation/electron-shadcn-sidebar-default-smoke.json`：验证设置菜单恢复 shadcn 默认尺寸及既有交互，共 67 项全部通过，`consoleErrors: []`。
- `docs/design/implementation/electron-ui-fixes-import-smoke.json`：Excel 固定可读列、横向滚动、表头/正文对齐、自定义 Select、Sheet 切换与预览更新共 12 项通过，`consoleErrors: []`。
- `docs/design/implementation/electron-ui-fixes-large-batch-smoke.json`：真实 737 条、27 字段文件仅挂载 25 行；导入渲染 1284 ms、滚到底 46 ms、预览切换 40 ms、搜索 183 ms、选择 18 ms，列宽拖动实时反馈与松手提交均通过，`consoleErrors: []`。
- 本轮未修改 Worker、Excel 解析协议、校验规则、Outlook 草稿 `Save()` 或 IPC 安全边界。

final result: passed

---

# 签名下拉选择器 Design QA

## 比较基准

- source visual truth path: `C:\Users\Sean\AppData\Local\Temp\codex-clipboard-eee2c26c-15f0-464b-aa6d-c99ac10f26d6.png`
- implementation screenshot path（关闭态）: `C:\Users\Sean\AppData\Local\Temp\local-mail-merge-signature-dropdown-closed-v3.png`
- implementation screenshot path（展开态）: `C:\Users\Sean\AppData\Local\Temp\local-mail-merge-signature-dropdown-open-v2.png`
- viewport: Electron 窗口目标尺寸 1366 × 768 DIP；当前 Windows 显示缩放下原生截图均为 2634 × 1483 px
- density normalization: 源图与两张实现图的像素尺寸完全一致，按 1:1 像素比较，未缩放或重采样
- state: 设置 > 邮件签名；临时目录内共 13 个签名；分别比较下拉关闭态和展开态

源图是修改前界面，用户明确要求把会随签名数量增长的长条列表改为下拉选择器。因此，下拉控件本身属于已确认的行为差异；其余弹窗结构、排版层级、字体、色彩与下方签名详情区应延续现有界面。

## Full-view comparison evidence

- 弹窗尺寸、顶部标题、左侧设置导航、右侧分区标题和底部操作栏与源图保持一致。
- 关闭态只占一行选择器高度；签名数量从 1 增加到 13 时，预览、文件信息和测试草稿区的位置不再随条目数量下移。
- 展开态菜单覆盖下方内容而不触发布局重排；菜单限定高度，并在内部滚动。
- 预览区域限定为 116px 的 shadcn `ScrollArea`，长签名在预览内部滚动，不继续挤压下方信息。

## Focused region comparison evidence

未额外制作裁切图。三张 2634 × 1483 px 原图在同一比较输入中打开，中央签名设置区域占据画面主要面积，签名名称、文件名、Badge、预览正文和测试草稿提示均可清晰辨认，继续裁切不会增加判断信息。

## Required fidelity surfaces

- Fonts and typography: 沿用项目既有 Noto Sans SC / PingFang 字体栈、标题层级、控件字号与行高；长名称和文件名使用单行省略。
- Spacing and layout rhythm: 选择器、辅助操作、预览、信息条和测试按钮保持稳定垂直节奏；13 个签名不会改变详情区位置。
- Colors and visual tokens: 复用现有 shadcn `Select`、`Badge`、`Button`、`Field` 和 `ScrollArea` 的主题 token，没有新增独立配色体系。
- Image quality and asset fidelity: 本页面没有位图素材；图标继续使用项目既有 Lucide 图标，未引入手绘 SVG、占位图或近似资产。
- Copy and content: 保留“当前签名”“打开签名目录”“删除当前签名”“创建无收件人测试草稿”等功能文案；内置与导入来源继续通过 Badge 区分。

## Findings

- 没有残留 P0、P1 或 P2 问题。
- [P3] 弹窗首次打开时，键盘焦点轮廓会显示在左侧第一个可聚焦设置项上。这是 Radix Dialog 的可访问性自动聚焦状态，不影响鼠标使用或签名选择，保留为可接受差异。

## Comparison history

### Iteration 1（blocked）

- evidence: `C:\Users\Sean\AppData\Local\Temp\local-mail-merge-signature-dropdown-closed.png`、`C:\Users\Sean\AppData\Local\Temp\local-mail-merge-signature-dropdown-open.png`
- [P2] 固定预览区高度为 150px，导致下方测试草稿动作在目标视口内不够稳定。
- [P2] 展开菜单中 Badge 未稳定靠右，名称、文件名和来源信息的列对齐不一致。
- fixes: 预览 `ScrollArea` 高度调整为 116px；让 shadcn SelectItem 的 ItemText 容器占满剩余宽度，以固定三列布局。

### Iteration 2（passed）

- evidence: `C:\Users\Sean\AppData\Local\Temp\local-mail-merge-signature-dropdown-closed-v3.png`、`C:\Users\Sean\AppData\Local\Temp\local-mail-merge-signature-dropdown-open-v2.png`
- post-fix result: 下方预览、信息和测试草稿区在 1366 × 768 目标窗口中可见；菜单中的名称、文件名和 Badge 对齐；展开菜单不改变详情区纵向位置。

## Primary interactions and runtime checks

- 打开“设置 > 邮件签名”。
- 在 13 个签名的临时目录中展开下拉菜单。
- 验证菜单内部滚动且不推动下方详情。
- 验证签名实际 HTML 预览、安全状态、文件信息和测试草稿动作均存在。
- 验证演示模式不会写入 Outlook。
- renderer console errors: 0
- automated stress smoke: passed（16/16 checks）

## Implementation checklist

- [x] 使用项目已有 shadcn Select 替代纵向签名条目列表
- [x] 使用 shadcn ScrollArea 固定签名预览高度
- [x] 保留当前签名的来源 Badge 与文件名
- [x] 保留打开目录、删除当前签名与测试草稿动作
- [x] 验证大量签名时菜单内部滚动且详情区不重排
- [x] 通过 TypeScript、生产构建、Core 测试和 Electron 压力冒烟测试

final result: passed
