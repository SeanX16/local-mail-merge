using System.IO.Compression;
using System.Text;
using LocalMailMerge.App;
using LocalMailMerge.Core;

var tests = new (string Name, Func<Task> Run)[]
{
    ("JSON 交接包保留任意字段", TestJsonImportAsync),
    ("校验门禁区分可创建和拦截记录", TestValidationAsync),
    ("内容变化规则可以调整处理等级", TestHashMismatchAsync),
    ("历史成功记录触发重复保护", TestAuditDeduplicationAsync),
    ("纯文本正文转换为 Outlook 兼容段落", TestPlainTextBodyFormattingAsync),
    ("CSV 导入保留动态字段", TestCsvImportAsync),
    ("XLSX 自动选择人员明细工作表", TestXlsxImportAsync),
    ("XLSX 可手动指定非标准邮箱字段", TestXlsxManualEmailMappingAsync),
    ("安全 HTML 签名可用并按正文在前组合", TestSafeSignatureHtmlAsync),
    ("危险 HTML 签名被拦截", TestUnsafeSignatureHtmlAsync),
    ("不可靠图片来源产生签名警告", TestSignatureImageWarningsAsync),
    ("HTML 内嵌图片计入资源数量", TestEmbeddedSignatureImageAsync),
    ("Outlook 无返回值方法不会被误判为失败", TestOutlookVoidInvocationAsync)
};

var passed = 0;
foreach (var test in tests)
{
    try
    {
        await test.Run();
        Console.WriteLine($"PASS  {test.Name}");
        passed++;
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine($"FAIL  {test.Name}\n      {exception.Message}");
    }
}

Console.WriteLine($"\n{passed}/{tests.Length} tests passed.");
return passed == tests.Length ? 0 : 1;

static async Task TestJsonImportAsync()
{
    var importer = new PackageImporter();
    var sample = Path.Combine(AppContext.BaseDirectory, "samples", "outreach_package.sample.json");
    var batch = await importer.ImportAsync(sample);
    Equal(12, batch.Messages.Count, "message count");
    True(batch.Fields.Any(field => field.Key.Equals("organization", StringComparison.OrdinalIgnoreCase)), "organization field missing");
    True(batch.Fields.Any(field => field.Key.Equals("paper_title", StringComparison.OrdinalIgnoreCase)), "paper_title field missing");
    Equal("Example University", batch.Messages[0].Fields["organization"], "arbitrary field value");
}

static async Task TestValidationAsync()
{
    var importer = new PackageImporter();
    var sample = Path.Combine(AppContext.BaseDirectory, "samples", "outreach_package.sample.json");
    var batch = await importer.ImportAsync(sample);
    new ValidationService().Validate(batch, new HashSet<string>());
    Equal(10, batch.Messages.Count(message => message.Validation.State == ValidationState.Eligible), "eligible count");
    Equal(1, batch.Messages.Count(message => message.Validation.State == ValidationState.NeedsReview), "warning count");
    Equal(1, batch.Messages.Count(message => message.Validation.State == ValidationState.Blocked), "blocked count");
    True(batch.Messages.All(message => message.DeclaredContentHash.Equals(message.ComputedContentHash, StringComparison.OrdinalIgnoreCase)), "sample hash mismatch");
    var placeholder = batch.Messages.Single(message => message.PersonId == "demo_laura_garcia");
    Equal(ValidationState.NeedsReview, placeholder.Validation.State, "placeholder warning state");
    True(placeholder.Validation.CanCreate, "placeholder warning should allow draft creation");
    True(placeholder.Validation.Issues.Any(issue => issue.Code == "unresolved_placeholder" && issue.Severity == ValidationIssueSeverity.Warning), "placeholder warning missing");
    var doNotContact = batch.Messages.Single(message => message.PersonId == "demo_jessica_taylor");
    Equal(ValidationState.Eligible, doNotContact.Validation.State, "do_not_contact is no longer a rule");
    True(doNotContact.Validation.Issues.All(issue => issue.Code != "do_not_contact"), "removed do_not_contact rule remains");
}

static async Task TestHashMismatchAsync()
{
    var source = Path.Combine(AppContext.BaseDirectory, "samples", "outreach_package.sample.json");
    var path = Path.Combine(AppContext.BaseDirectory, "hash-mismatch.json");
    var json = await File.ReadAllTextAsync(source, Encoding.UTF8);
    await File.WriteAllTextAsync(path, json.Replace(
        "Research opportunity related to your rendering work",
        "Changed subject after approval",
        StringComparison.Ordinal), Encoding.UTF8);
    var batch = await new PackageImporter().ImportAsync(path);
    var changed = batch.Messages.Single(message => message.PersonId == "demo_james_anderson");
    new ValidationService().Validate(batch, new HashSet<string>());
    Equal(ValidationState.Eligible, changed.Validation.State, "hash mismatch default pass state");
    var blockingPolicy = new ValidationPolicy(new Dictionary<string, ValidationRuleLevel>
    {
        ["content_hash_mismatch"] = ValidationRuleLevel.Blocking
    });
    new ValidationService().Validate(batch, new HashSet<string>(), blockingPolicy);
    Equal(ValidationState.Blocked, changed.Validation.State, "hash mismatch state");
    True(!changed.Validation.CanCreate, "hash mismatch should block draft creation");
    True(changed.Validation.Issues.Any(issue => issue.Code == "content_hash_mismatch" && issue.Severity == ValidationIssueSeverity.Blocking), "hash mismatch blocker missing");
    File.Delete(path);
}

static async Task TestAuditDeduplicationAsync()
{
    var testDirectory = Path.Combine(AppContext.BaseDirectory, "audit-test");
    if (Directory.Exists(testDirectory)) Directory.Delete(testDirectory, recursive: true);
    var store = new AuditStore(testDirectory);
    var importer = new PackageImporter();
    var sample = Path.Combine(AppContext.BaseDirectory, "samples", "outreach_package.sample.json");
    var batch = await importer.ImportAsync(sample);
    var message = batch.Messages[0];
    message.ComputedContentHash = ContentHasher.Compute(message);
    await store.AppendAsync(new AuditEntry(batch.BatchId, message.PersonId, message.ComputedContentHash, "demo-entry-id", DateTimeOffset.Now, "Success", string.Empty, string.Empty));
    new ValidationService().Validate(batch, store.LoadSuccessfulKeys());
    Equal(ValidationState.Duplicate, message.Validation.State, "duplicate state");
    var passPolicy = new ValidationPolicy(new Dictionary<string, ValidationRuleLevel>
    {
        ["already_created"] = ValidationRuleLevel.Pass
    });
    new ValidationService().Validate(batch, store.LoadSuccessfulKeys(), passPolicy);
    Equal(ValidationState.Eligible, message.Validation.State, "duplicate pass state");
    Directory.Delete(testDirectory, recursive: true);
}

static Task TestPlainTextBodyFormattingAsync()
{
    var plainText = CreateMessage(
        "Dear James,\r\n\r\nFirst <line> & details.\nContinued line.\r\n\r\nWould you be open to a conversation?");
    var html = plainText.EffectiveBodyHtml;
    Equal(3, html.Split("<p style=", StringSplitOptions.None).Length - 1, "paragraph count");
    True(html.Contains("Dear James,</p>", StringComparison.Ordinal), "greeting paragraph missing");
    True(html.Contains("First &lt;line&gt; &amp; details.<br>Continued line.", StringComparison.Ordinal), "encoding or explicit line break missing");
    True(html.Contains("Would you be open to a conversation?</p>", StringComparison.Ordinal), "closing paragraph missing");
    True(!html.Contains("white-space:pre-wrap", StringComparison.OrdinalIgnoreCase), "Outlook-incompatible white-space CSS remains");

    var suppliedHtml = CreateMessage("ignored", "<p>Existing HTML</p>");
    Equal("<p>Existing HTML</p>", suppliedHtml.EffectiveBodyHtml, "supplied HTML should remain unchanged");
    return Task.CompletedTask;
}

static async Task TestCsvImportAsync()
{
    var path = Path.Combine(AppContext.BaseDirectory, "dynamic-fields.csv");
    await File.WriteAllTextAsync(path, "person_id,recipient_name,邮箱状态,员工邮箱,custom_score\nexample_1,Example Person,已验证,example.person@example.test,92\n", Encoding.UTF8);
    var batch = await new PackageImporter().ImportAsync(path);
    Equal(1, batch.Messages.Count, "CSV message count");
    Equal("example.person@example.test", batch.Messages[0].RecipientEmail, "CSV keyword-detected email");
    Equal("员工邮箱", batch.SourceEmailColumnName, "CSV inferred email column");
    Equal("92", batch.Messages[0].Fields["custom_score"], "CSV custom field");
    File.Delete(path);
}

static async Task TestXlsxImportAsync()
{
    var path = Path.Combine(AppContext.BaseDirectory, "dynamic-fields.xlsx");
    CreateMinimalXlsx(path, "学生邮箱");
    var importer = new PackageImporter();
    var inspection = await importer.InspectXlsxAsync(path);
    Equal("Talent List", inspection.RecommendedWorksheetName, "recommended worksheet");
    Equal(2, inspection.Sheets.Count, "worksheet count");
    Equal(3, inspection.Sheets.Single(sheet => sheet.Name == "Talent List").SuggestedHeaderRowNumber, "suggested header row");
    var batch = await importer.ImportAsync(path, new XlsxImportOptions("Talent List", 3));
    Equal(1, batch.Messages.Count, "XLSX message count");
    Equal("Example Person", batch.Messages[0].RecipientName, "XLSX name");
    Equal("example.person@example.test", batch.Messages[0].RecipientEmail, "XLSX email");
    Equal("学生邮箱", batch.SourceEmailColumnName, "XLSX inferred email column");
    Equal("Postdoc", batch.Messages[0].TargetRole, "XLSX role alias");
    Equal("Graphics", batch.Messages[0].Fields["custom_track"], "XLSX dynamic field");
    new ValidationService().Validate(batch, new HashSet<string>());
    Equal(ValidationState.Blocked, batch.Messages[0].Validation.State, "generic XLSX validation state");
    True(!batch.Messages[0].Validation.CanCreate, "generic XLSX missing content should block draft creation");
    True(batch.Messages[0].Validation.Issues.Any(issue => issue.Code == "missing_subject" && issue.Severity == ValidationIssueSeverity.Blocking), "generic XLSX missing-subject blocker");
    True(batch.Messages[0].Validation.Issues.Any(issue => issue.Code == "missing_body" && issue.Severity == ValidationIssueSeverity.Blocking), "generic XLSX missing-body blocker");
    True(batch.Messages[0].Validation.Issues.All(issue => issue.Code is not "review_not_approved" and not "missing_content_hash" and not "missing_personalization_source"), "default-pass rules should not warn");
    File.Delete(path);
}

static async Task TestXlsxManualEmailMappingAsync()
{
    var path = Path.Combine(AppContext.BaseDirectory, "manual-email-field.xlsx");
    CreateMinimalXlsx(path, "Primary Contact");
    var batch = await new PackageImporter().ImportAsync(path, new XlsxImportOptions("Talent List", 3, "Primary Contact"));
    Equal("example.person@example.test", batch.Messages[0].RecipientEmail, "manually mapped XLSX email");
    Equal("Primary Contact", batch.SourceEmailColumnName, "persisted XLSX email column mapping");
    File.Delete(path);
}

static Task TestSafeSignatureHtmlAsync()
{
    const string signature = "<html><body><p>Best regards,</p><p><strong>Example Team</strong></p></body></html>";
    var inspection = SignatureTemplateInspector.FromHtml("html", signature, previewComplete: true);
    True(inspection.CanUse, "safe signature should be usable");
    Equal(0, inspection.Issues.Count, "safe signature issues");
    True(inspection.PreviewComplete, "safe HTML preview should be complete");

    var combined = SignatureTemplateInspector.CombineHtml("<p>Hello Example Person</p>", signature);
    var messageIndex = combined.IndexOf("Hello Example Person", StringComparison.Ordinal);
    var signatureIndex = combined.IndexOf("Best regards", StringComparison.Ordinal);
    True(messageIndex >= 0 && signatureIndex > messageIndex, "message should appear before signature");
    return Task.CompletedTask;
}

static Task TestUnsafeSignatureHtmlAsync()
{
    const string signature = "<div onclick=\"alert(1)\"><script>alert(1)</script><a href=\"java&#x73;cript:alert(1)\">Unsafe</a></div>";
    var inspection = SignatureTemplateInspector.FromHtml("html", signature, previewComplete: true);
    True(!inspection.CanUse, "unsafe signature should be blocked");
    True(inspection.Issues.Any(issue => issue.Code == "unsafe_element" && issue.Severity == "blocking"), "script blocker missing");
    True(inspection.Issues.Any(issue => issue.Code == "unsafe_event_handler" && issue.Severity == "blocking"), "event blocker missing");
    True(inspection.Issues.Any(issue => issue.Code == "unsafe_uri" && issue.Severity == "blocking"), "unsafe URI blocker missing");
    return Task.CompletedTask;
}

static Task TestSignatureImageWarningsAsync()
{
    const string signature = "<div><img src=\"https://example.test/logo.png\"><img src=\"images/local-logo.png\"></div>";
    var inspection = SignatureTemplateInspector.FromHtml("html", signature, previewComplete: true);
    True(inspection.CanUse, "image reliability warnings should not block the signature");
    True(inspection.Issues.Any(issue => issue.Code == "remote_image" && issue.Severity == "warning"), "remote-image warning missing");
    True(inspection.Issues.Any(issue => issue.Code == "unresolved_image" && issue.Severity == "warning"), "relative-image warning missing");
    return Task.CompletedTask;
}

static Task TestEmbeddedSignatureImageAsync()
{
    const string signature = "<div><img src=\"data:image/png;base64,iVBORw0KGgo=\" alt=\"Example logo\"></div>";
    var inspection = SignatureTemplateInspector.FromHtml("html", signature, previewComplete: true);
    Equal(1, inspection.InlineAttachments.Count, "embedded HTML image count");
    True(!inspection.Issues.Any(issue => issue.Code == "unresolved_image"), "embedded HTML image should be resolved");
    return Task.CompletedTask;
}

static void CreateMinimalXlsx(string path, string emailHeader = "Email")
{
    if (File.Exists(path)) File.Delete(path);
    using var archive = ZipFile.Open(path, ZipArchiveMode.Create);
    WriteEntry(archive, "[Content_Types].xml", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
          <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        </Types>
        """);
    WriteEntry(archive, "xl/workbook.xml", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets>
            <sheet name="Summary" sheetId="1" r:id="rId1"/>
            <sheet name="Talent List" sheetId="2" r:id="rId2"/>
          </sheets>
        </workbook>
        """);
    WriteEntry(archive, "xl/_rels/workbook.xml.rels", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
        </Relationships>
        """);
    WriteEntry(archive, "xl/worksheets/sheet1.xml", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Research Talent Summary</t></is></c></row>
          <row r="3"><c r="A3" t="inlineStr"><is><t>Metric</t></is></c><c r="B3" t="inlineStr"><is><t>Value</t></is></c></row>
          <row r="4"><c r="A4" t="inlineStr"><is><t>Total records</t></is></c><c r="B4"><v>1</v></c></row>
        </sheetData></worksheet>
        """);
    var talentSheet = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>University Research Talent</t></is></c></row>
          <row r="3"><c r="A3" t="inlineStr"><is><t>Person ID</t></is></c><c r="B3" t="inlineStr"><is><t>Full Name</t></is></c><c r="C3" t="inlineStr"><is><t>Email</t></is></c><c r="D3" t="inlineStr"><is><t>Organization</t></is></c><c r="E3" t="inlineStr"><is><t>Job Category</t></is></c><c r="F3" t="inlineStr"><is><t>Primary Source URL</t></is></c><c r="G3" t="inlineStr"><is><t>custom_track</t></is></c></row>
          <row r="4"><c r="A4" t="inlineStr"><is><t>person_1</t></is></c><c r="B4" t="inlineStr"><is><t>Example Person</t></is></c><c r="C4" t="inlineStr"><is><t>example.person@example.test</t></is></c><c r="D4" t="inlineStr"><is><t>Example University</t></is></c><c r="E4" t="inlineStr"><is><t>Postdoc</t></is></c><c r="F4" t="inlineStr"><is><t>https://example.test/person</t></is></c><c r="G4" t="inlineStr"><is><t>Graphics</t></is></c></row>
        </sheetData></worksheet>
        """.Replace("<t>Email</t>", $"<t>{emailHeader}</t>", StringComparison.Ordinal);
    WriteEntry(archive, "xl/worksheets/sheet2.xml", talentSheet);
}

static void WriteEntry(ZipArchive archive, string name, string content)
{
    var entry = archive.CreateEntry(name);
    using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
    writer.Write(content);
}

static OutreachMessage CreateMessage(string bodyText, string bodyHtml = "") => new()
{
    BatchId = "format_test",
    PersonId = "example_person",
    RecipientName = "Example Person",
    RecipientEmail = "example.person@example.test",
    Subject = "Example subject",
    BodyHtml = bodyHtml,
    BodyText = bodyText,
    TargetRole = "Example role",
    ReviewStatus = "Approved",
    DoNotContact = false,
    DeclaredContentHash = string.Empty,
    PersonalizationFacts = [],
    Fields = new Dictionary<string, string>()
};

static Task TestOutlookVoidInvocationAsync()
{
    var mail = new FakeOutlookMail();
    OutlookLateBinding.InvokeVoid(mail, "Save");
    True(mail.Saved, "void Save method was not invoked");
    return Task.CompletedTask;
}

static void True(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static void Equal<T>(T expected, T actual, string label)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new InvalidOperationException($"{label}: expected {expected}, actual {actual}");
    }
}

sealed class FakeOutlookMail
{
    public bool Saved { get; private set; }

    public void Save() => Saved = true;
}
