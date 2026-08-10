# 公司 Outlook 邮件交付兼容性测试

这个测试包比较三种不依赖 AI 的邮件交付方式：

1. `.eml` 邮件文件；
2. 经典 Outlook 本地自动化；
3. Microsoft Graph 创建邮箱草稿。

所有测试只使用一封虚构测试邮件，并且以你自己的公司邮箱作为收件人。脚本没有自动发送功能。

## 安全边界

- 不要填入候选人的真实邮箱或个人资料。
- 不要在测试邮件中加入公司敏感内容。
- 不要点击测试邮件的“发送”。
- Outlook 本地脚本只调用 `Save()` 和可选的 `Display()`，不调用 `Send()`。
- Graph 测试只使用 `POST /me/messages` 创建草稿，不使用 `/send` 或 `sendMail`。
- `config.json` 和生成结果已被本目录的 `.gitignore` 排除。

## 0. 准备

在公司电脑上记录：

- Windows 版本；
- Outlook 的完整版本：`文件 → Office 帐户 → 关于 Outlook`；
- 邮箱帐户类型：`文件 → 帐户设置 → 帐户设置 → 类型`；
- 是否可以访问 Outlook 网页版；
- 是否允许运行 PowerShell 脚本。

复制配置文件：

```powershell
Copy-Item .\config.example.json .\config.json
notepad .\config.json
```

把 `test_recipient` 改成你自己的公司邮箱。不要使用候选人邮箱。

如果公司禁止直接运行 `.ps1`，不要修改安全策略；记录“PowerShell 被公司策略阻止”，交给 IT 或后续改成签名程序测试。

### 旧版 PowerShell 路径兼容

当前脚本不会在参数默认值中使用 `$PSScriptRoot`，以兼容截图中该变量在参数求值阶段为空的旧环境。
如果仍遇到配置路径错误，可以显式传入绝对路径：

```powershell
powershell.exe -NoProfile -File .\01_generate_eml.ps1 -ConfigPath "$PWD\config.json"
```

## 1. 测试 `.eml`

运行：

```powershell
powershell.exe -NoProfile -File .\01_generate_eml.ps1
```

随后双击 `generated` 目录中生成的 `.eml`，检查：

- Outlook 是否打开文件；
- 是否是可编辑的撰写窗口，而不是只读查看窗口；
- To、Subject、中文、英文、换行、粗体和链接是否正常；
- 关闭时选择保存，是否进入草稿箱；
- Outlook 是否出现安全警告。

只有“可以直接编辑，并能保存到草稿箱”才记为通过。

## 2. 测试 Outlook 本地自动化

运行：

```powershell
powershell.exe -NoProfile -File .\02_create_outlook_draft.ps1
```

脚本显示测试邮箱后，必须手动输入：

```text
CREATE DRAFT
```

脚本只创建一封草稿，不会发送。检查：

- 是否成功打开 Outlook；
- 是否在正确的公司邮箱草稿箱创建邮件；
- 是否可以编辑；
- 中文、HTML 格式和链接是否正常；
- 重启 Outlook 后草稿是否仍然存在；
- 是否出现程序访问 Outlook 的安全提示。

## 3. 测试 Microsoft Graph

先生成请求正文：

```powershell
powershell.exe -NoProfile -File .\03_prepare_graph_request.ps1
```

然后：

1. 打开 <https://developer.microsoft.com/graph/graph-explorer>；
2. 使用自己的公司邮箱登录；
3. 选择 `POST`；
4. 输入地址 `https://graph.microsoft.com/v1.0/me/messages`；
5. 粘贴 `graph_request.ready.json` 的全部内容；
6. 只申请创建草稿所需的 `Mail.ReadWrite` 权限；
7. 执行请求。

成功时通常返回 `201 Created`。然后检查旧版 Outlook 的草稿箱是否出现该邮件。

不要把地址改成 `/send`，也不要使用 `sendMail`。

常见结果：

- `201`：Graph 创建草稿成功；
- `401`：公司账户登录或身份验证失败；
- `403`：公司策略禁止授权，或需要管理员批准；
- 无法登录 Graph Explorer：记录为公司策略/网络阻止；
- Graph 成功但 Outlook 看不到：检查同步、缓存模式和草稿所在邮箱。

## 4. 选择路线

| 结果 | 推荐路线 |
|---|---|
| Graph 成功 | Graph 草稿导入器 |
| Graph 失败，本地 Outlook 自动化成功 | Outlook 本地草稿导入器 |
| 前两者失败，`.eml` 可编辑且可保存 | `.eml` 交付包 |
| `.eml` 只能只读打开 | 不使用 `.eml` 作为正式方案 |
| 三者都失败 | 需要 IT 配合或签名程序测试 |

完成后填写 `测试结果记录表.md`。测试邮件可以从草稿箱手动删除。
