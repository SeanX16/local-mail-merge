# AI 数据准备与交接规范

这份文档是给负责整理 Local Mail Merge 输入数据的 AI 或自动化工具看的。目标不是“尽量凑出一个表”，而是交付一套
能被人审核、能被应用稳定导入、不会把不确定信息伪装成事实的数据。

## 1. 先记住这些边界

1. AI 只负责在外部环境整理公开且有来源的信息、起草邮件内容和生成交接文件。
2. AI 不连接公司 Outlook，不持有公司邮箱凭据，也不创建或发送真实邮件。
3. 不得根据姓名、照片或模糊线索推断国籍、族裔、语言能力等敏感属性。
4. 找不到可靠依据时写 `Unknown` 或留空，不得编造。
5. `recipient_email` 不能使用 `Unknown` 作为可创建草稿的地址。没有可靠邮箱的记录应留给人工复核，不进入最终
   待创建数据。
6. 交付前必须由人检查收件人、主题、正文、来源和批准状态。
7. 不把真实邮箱、真实邮件正文、简历、访问令牌、运行日志或其他个人数据提交到代码仓库。

## 2. 推荐的交接目录

建议每个批次单独放在一个清楚命名的目录中：

    LocalMailMerge_<batch_id>/
    ├─ Outreach_Review.xlsx
    ├─ outreach_package.json
    ├─ README.txt
    └─ signature/                    # 只有需要同时交付签名时才添加
       ├─ company_signature.html
       └─ company_signature_files/
          └─ logo.png

- `Outreach_Review.xlsx` 供人审核、筛选和修改。
- `outreach_package.json` 是推荐给应用导入的稳定版本。
- `README.txt` 简要写明批次、记录数、来源范围、已知问题和负责人。
- 签名是单独导入的文件，不属于 JSON 的一部分。
- 应用不会直接导入整个目录或 ZIP。用户需要分别选择数据文件和签名文件。

如果只交付一种数据文件，优先交付结构清楚的 Excel；如果同时交付 Excel 和 JSON，两者的人员、邮箱、主题和正文必须
一致。

## 3. 批次和人员编号

### 3.1 batch_id

`batch_id` 用于区分不同批次，也参与重复草稿判断。建议使用稳定、可读、只含英文字母、数字、连字符或下划线的名称：

    siggraph_2026_graphics_outreach_001

不要使用随机字符串，也不要把日期、会议和岗位都省略成无法理解的简称。

- JSON 从根节点的 `batch_id` 读取批次编号。
- Excel 和 CSV 使用文件名（不含扩展名）作为批次编号。
- 不要通过改 Excel 文件名来绕过去重；真正的新批次才应该使用新的文件名或 `batch_id`。

### 3.2 person_id

每条记录应有一个稳定且在当前批次内唯一的 `person_id`。建议从已确认的数据源编号生成，例如：

    siggraph2026_alex_example

不要直接使用邮箱作为人员编号。缺少 `person_id` 时应用会按行生成 `row_2`、`row_3` 等临时编号，但排序或插入
新行后这些编号会变化，不适合作为正式交付。

## 4. Excel 格式

### 4.1 工作表结构

- 推荐把主工作表命名为 `Outreach` 或 `Talent List`。
- 一行只放一个收件人和一封邮件。
- 第一行直接放字段名。应用会在前 20 行中推荐最可能的表头，但正式文件不要在表头前加入封面、标题或说明段落。
- 不使用合并单元格、多层表头、隐藏字段名或重复字段名。
- 不在数据区域中插入小计、说明行或空白分组行。
- 单元格尽量保存为普通值，不依赖公式、宏、外部工作簿链接或条件格式表达业务含义。
- 邮箱、人员编号、年份和 URL 建议按文本保存，避免 Excel 自动改写。
- 可以有额外字段；应用会保留这些列，用于表格筛选和邮件预览。

### 4.2 正式可用的推荐字段

| 字段 | 是否建议必填 | 内容 |
|---|---:|---|
| `person_id` | 是 | 当前批次内稳定且唯一的人员编号 |
| `recipient_name` | 是 | 邮件中希望显示的姓名 |
| `recipient_email` | 是 | 有效邮箱；不能是 `Unknown` |
| `subject` | 是 | 已完成个性化且不含占位符的主题 |
| `body_text` | 二选一 | 纯文本正文 |
| `body_html` | 二选一 | HTML 正文；有值时优先于 `body_text` |
| `target_role` | 建议 | 对应岗位 |
| `organization` | 建议 | 当前机构或学校 |
| `country` | 可选 | 有可靠来源时填写国家或地区 |
| `personalization_facts` | 建议 | 支撑个性化内容的事实和来源 |
| `review_status` | 建议 | `Approved` 或 `Needs Review` |
| `content_hash` | 可选 | 审核后内容指纹；不会算时宁可留空 |

应用导入层面的硬性最低要求只有可识别的收件邮箱，但空主题和空正文默认会被拦截，因此不能把“可以导入”理解为“可以
直接创建草稿”。

### 4.3 推荐使用的字段名和可识别别名

生成新文件时应使用第一列中的标准字段名。下列别名是为了兼容已有文件：

| 标准字段名 | 可识别别名 |
|---|---|
| `person_id` | `personid`、`人员id`、`候选人id` |
| `recipient_name` | `name`、`full_name`、`fullname`、`姓名`、`候选人姓名` |
| `recipient_email` | `email`、`邮箱`、`邮件地址` |
| `subject` | `邮件主题`、`主题` |
| `body_text` | `body`、`邮件正文`、`正文` |
| `body_html` | `htmlbody`、`邮件正文html`、`正文html` |
| `target_role` | `targetrole`、`job_category`、`original_job_title`、`目标岗位`、`岗位` |
| `review_status` | `reviewstatus`、`审核状态`、`审核` |
| `personalization_facts` | `personalizationfacts`、`个性化事实` |
| `content_hash` | `contenthash`、`内容哈希` |
| `organization` | `organisation`、`company`、`school`、`university`、`机构`、`单位` |
| `primary_source_url` | `source_url`、`来源url` |

字段匹配不区分大小写，也会忽略空格、下划线和连字符。即便如此，新交付文件仍应坚持使用标准字段名，减少误判。

### 4.4 personalization_facts 在 Excel 里的写法

该单元格必须是一个完整的 JSON 数组文本，不是用分号拼接的普通句子。例如：

    [{"text":"Presented a rendering paper at SIGGRAPH 2026","source_url":"https://example.test/paper"}]

多个事实：

    [{"text":"Published paper A","source_url":"https://example.test/a"},{"text":"Maintains project B","source_url":"https://example.test/b"}]

每个事实包含：

- `text`：可以被来源直接支撑的简短事实；
- `source_url`：能定位到该事实的公开页面。

JSON 格式写错时应用会把这一格当作没有个性化事实。不要在这里放没有来源的评价，例如“非常优秀”“一定会中文”或“很适合
该岗位”。

### 4.5 正文规则

- `body_text` 适合普通邮件。段落之间用一个空行分隔，应用会转换为 Outlook 可用的 HTML。
- `body_html` 适合确实需要链接、加粗或简单排版的邮件。只放正文，不要把公司签名重复写进去。
- 如果两列都有内容，应用使用 `body_html`。
- 使用简单、完整、可被 Outlook 理解的 HTML，优先使用 `p`、`br`、`strong`、`em`、`a` 和表格布局。
- 不放脚本、表单、追踪像素、外部字体、远程 CSS 或依赖浏览器运行的内容。
- 不保留 `{FirstName}`、`{{name}}`、`[Company]` 等未替换占位符。
- 正文和签名由应用在本地组合，不要在每一行重复嵌入 Logo 图片。

### 4.6 review_status 和 do_not_contact

正式批准的记录统一写 `Approved`。尚未批准的记录写 `Needs Review`，并在交付说明里统计数量。

`do_not_contact` 可以作为普通字段显示，但当前应用不会把它当成不可关闭的安全拦截。AI 不得依赖这一列阻止创建草稿。
明确不应联系的人应从最终待创建数据中移除，或放在单独的审核文件中，不要与 Approved 记录混在一起。

## 5. CSV 格式

CSV 使用与 Excel 相同的字段名和一行一人的结构，并遵守：

- UTF-8 编码；
- 第一行是字段名；
- 包含逗号、双引号或换行的单元格必须按标准 CSV 规则加双引号；
- `personalization_facts` 仍然是 JSON 数组文本；
- 不输出 Excel 公式、注释或样式，因为 CSV 无法保留这些内容。

复杂正文或需要人审核时优先使用 Excel 或 JSON，避免多行 CSV 在其他软件中被误改。

## 6. JSON 格式

推荐使用标准 `outreach-package/v1` 包装结构：

    {
      "schema_version": "outreach-package/v1",
      "batch_id": "siggraph_2026_graphics_outreach_001",
      "created_at": "2026-08-26T12:00:00+08:00",
      "messages": [
        {
          "person_id": "siggraph2026_alex_example",
          "recipient_name": "Alex Example",
          "recipient_email": "alex@example.test",
          "subject": "Research opportunity related to your graphics work",
          "body_text": "Dear Alex,\n\nYour published SIGGRAPH work is relevant to our current research.\n\nWould you be open to a short conversation?",
          "target_role": "Graphics & Spatial Research Engineer",
          "organization": "Example University",
          "personalization_facts": [
            {
              "text": "Published a SIGGRAPH 2026 paper on rendering",
              "source_url": "https://example.test/paper"
            }
          ],
          "review_status": "Approved"
        }
      ]
    }

要求：

- 根节点使用对象，记录放在 `messages` 数组中。
- `schema_version` 固定为 `outreach-package/v1`。
- `batch_id` 在同一次交付中保持稳定。
- `created_at` 使用带时区的 ISO 8601 时间。
- `personalization_facts` 在 JSON 中直接使用对象数组，不要再把整个数组转成带转义符的字符串。
- 可以添加 `country`、`conference`、`paper_title`、`LinkedIn`、`graduation_year` 等字段，应用会保留。
- 不要把 `content_hash` 写成字面量 `sha256:...`。不能准确计算时请省略该字段。

应用也能读取 JSON 数组或对象中的第一个记录数组，但正式交接必须使用上面的标准包装，避免批次信息丢失。

## 7. content_hash 的准确算法

`content_hash` 是可选字段，用来发现人工审核后收件邮箱、主题或正文是否被改动。它不是导入所必需的，错误的哈希比
不提供更容易制造噪音。

准确算法如下：

1. 邮箱去掉首尾空白并转为小写。
2. 主题把 CRLF 和 CR 换行统一为 LF，再去掉首尾空白。
3. 正文优先选择非空的 `body_html`，否则选择 `body_text`；同样统一换行并去掉首尾空白。
4. 用一个 LF 连接“邮箱、主题、正文”三段。
5. 对 UTF-8 字节计算 SHA-256。
6. 输出小写十六进制，并加前缀 `sha256:`。

伪代码：

    canonical = lower(trim(recipient_email))
                + "\n" + normalize(subject)
                + "\n" + normalize(body_html if not blank else body_text)
    content_hash = "sha256:" + lowercase_hex(sha256(utf8(canonical)))

签名不参与内容哈希。任何正文、主题或邮箱的改动都必须重新计算；否则请删除旧哈希。

## 8. 签名文件格式

应用支持 `.html`、`.htm` 和 `.oft`，但三种文件的准备方式不同。

### 8.1 HTML 签名

推荐目录：

    signature/
    ├─ company_signature.html
    └─ company_signature_files/
       ├─ logo.png
       └─ icon-linkedin.png

HTML 使用相对路径引用图片：

    <img src="./company_signature_files/logo.png" width="180" alt="Company">

导入时应用会读取 HTML 同一目录及其子目录中的本地图片，把它们转成内嵌 data URI，再把自包含副本保存到应用目录。
原始 HTML 和图片不会被修改。

限制：

- 原始签名文件最大 20 MB；
- 单张图片最大 10 MB；
- 图片只支持 PNG、JPEG、GIF 和 WebP；
- 图片打包后的完整 HTML 最大 20 MB；
- 图片必须位于 HTML 所在目录或其子目录中；
- 缺失图片、空图片、目录外路径或不支持的格式会阻止导入；
- 单独 HTML 中的 `cid:` 图片无法找到附件内容，会阻止导入；
- 远程 HTTP/HTTPS 图片只会给出警告，应用预览不会加载，收件人的客户端也可能拦截；正式签名应避免使用；
- 不要用 CSS `background-image` 承载重要 Logo，应用不会替你打包这类资源；
- 文件使用 UTF-8，并尽量使用行内样式和表格布局，以提高 Outlook 兼容性。

HTML 不得包含：

- `script`、`iframe`、`frame`、`object`、`embed`；
- `form`、`input`、`button`、`textarea`、`select`；
- `meta`、`base`、外部 `link` 样式表；
- `onclick`、`onload` 等事件属性；
- `javascript:`、`vbscript:`、`data:text/html` 地址；
- CSS `expression()`、`behavior:`、`-moz-binding` 或脚本型 `url()`。

签名里可以使用普通 `mailto:`、`tel:` 和 HTTPS 链接。

### 8.2 OFT 签名

`.oft` 适合从经典 Outlook 保存、并且需要保留 Content-ID 内嵌图片的签名模板。

- 文件最大 20 MB；
- 检查、预览和创建测试草稿都需要经典 Outlook；
- 内嵌图片资源会保留；
- 普通附件会阻止使用，避免把无关文件带入每封候选人邮件；
- 模板里预设的收件人、抄送、密送和主题会提示警告；正式草稿仍会用交接包中的内容覆盖；
- 不要把候选人正文预先写进 OFT，它只应保存通用签名内容。

### 8.3 签名交付前检查

1. 在一台装有经典 Outlook 的电脑上导入签名。
2. 查看应用报告的内嵌资源和普通附件数量。
3. 确认没有阻止使用的安全问题。
4. 在设置页创建无收件人的测试草稿。
5. 到 Outlook 检查 Logo、字体、链接、间距和移动端可读性。
6. 确认测试草稿没有收件人和普通附件，然后删除，不要发送。

签名在应用中重命名只改变显示名称，不会更改原始文件名或签名内容。

## 9. AI 交付前必须自检

交付前逐项确认：

- [ ] 每行对应一个人和一封邮件；
- [ ] `person_id` 非空、稳定且批次内唯一；
- [ ] `recipient_email` 格式有效且不是 `Unknown`；
- [ ] 主题和正文都已填写；
- [ ] 没有未替换占位符；
- [ ] 正文没有重复附加签名；
- [ ] 个性化陈述都能在 `personalization_facts` 中找到直接来源；
- [ ] 没有根据姓名或外表推断敏感属性；
- [ ] `Approved` 只用于已完成人工审核的记录；
- [ ] 明确不应联系的人不在最终待创建数据中；
- [ ] Excel 与 JSON 的记录数、人员编号、邮箱、主题和正文一致；
- [ ] `content_hash` 要么准确计算，要么省略；
- [ ] HTML 签名的所有本地图片都随文件交付；
- [ ] 文件中没有真实凭据、访问令牌、宏或外部工作簿依赖；
- [ ] 使用虚构数据完成过一次导入检查。

## 10. AI 的最终交付说明

AI 在交付文件时，应同时给出一段简短说明，格式如下：

    批次：siggraph_2026_graphics_outreach_001
    主数据：Outreach_Review.xlsx、outreach_package.json
    总记录：20
    Approved：16
    Needs Review：4
    缺少可靠邮箱：2（未放入最终待创建数据）
    个性化事实无来源：0
    未计算 content_hash：是/否
    签名：company_signature.html，内含 2 张本地图片
    已知问题：……

不要只回复“已完成”。人需要从这段说明中马上知道哪些文件可以导入、哪些记录仍需复核，以及是否存在不能安全使用的
内容。
